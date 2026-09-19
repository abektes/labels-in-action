import {
  SERVICE_UUID,
  WRITE_CHAR_UUID,
  NOTIFY_CHAR_UUID,
  CHUNK_SIZE,
  CHUNK_DELAY_MS,
  CMD,
} from "./constants";
import { Capacitor } from "@capacitor/core";
import { TypedEventEmitter } from "./emitter";
import { Utils } from "./utils";
import { FicheroPrintTask } from "./print_task";
import type {
  ConnectionInfo,
  HeartbeatData,
  PrinterInfo,
  PrinterModelMeta,
  PrintProgressEvent,
  FirmwareProgressEvent,
  RfidInfo,
  Packet,
  LabelType,
  PrintTaskName,
} from "./types";

interface ClientEventMap {
  connect: { info: ConnectionInfo };
  disconnect: void;
  printerinfofetched: { info: PrinterInfo };
  heartbeat: { data: HeartbeatData };
  heartbeatfailed: { failedAttempts: number };
  printprogress: PrintProgressEvent;
  firmwareprogress: FirmwareProgressEvent;
  packetsent: { packet: Packet };
  packetreceived: { packet: Packet };
}

function makePacket(data: readonly number[] | number[] | Uint8Array): Packet {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const cmd = bytes.length >= 2 ? (bytes[0] << 8) | bytes[1] : bytes[0] ?? 0;
  return {
    command: cmd,
    toBytes: () => bytes,
  };
}


function mapBleConnectError(err: unknown): Error {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err ?? "unknown");

  // Capgo / Web Bluetooth: user cancelled Chrome chooser (desktop) or equivalent
  if (name === "NotFoundError" || /not found|no device|no devices/i.test(message)) {
    return new Error(
      "No Fichero printer found. Power the printer on, keep it nearby, turn phone Bluetooth on, and enable Location (needed for BLE scan on many Androids). Names must start with FICHERO or D11s_."
    );
  }
  if (name === "SecurityError" || /permission|denied|not allowed/i.test(message)) {
    return new Error(
      "Bluetooth permission denied. Allow Nearby devices (and Location if asked), then try Connect again."
    );
  }
  if (name === "NetworkError" || /bluetooth.*off|adapter|unavailable/i.test(message)) {
    return new Error(
      "Bluetooth is off or unavailable. Turn Bluetooth on and try again."
    );
  }
  if (/no device selected|user cancelled|canceled|cancelled/i.test(message)) {
    return new Error("No device selected");
  }
  return err instanceof Error ? err : new Error(message || "Bluetooth connect failed");
}

export class FicheroClient extends TypedEventEmitter<ClientEventMap> {
  private device: BluetoothDevice | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyBuf: number[] = [];
  private notifyResolve: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private heartbeatFailCount = 0;
  private packetIntervalMs = 20;
  private info: PrinterInfo = {};
  // Largest payload a single writeValueWithoutResponse may carry.
  // Desktop Chrome negotiates a large MTU itself, so CHUNK_SIZE is safe there.
  private maxWriteLen = CHUNK_SIZE;

  readonly abstraction = {
    newPrintTask: (
      _name: PrintTaskName,
      opts: {
        totalPages: number;
        density: number;
        speed: number;
        labelType: LabelType;
        statusPollIntervalMs: number;
        statusTimeoutMs: number;
      },
    ) => {
      return new FicheroPrintTask(
        opts,
        (data, wait, timeout) => this.sendCommand(data, wait, timeout),
        (data) => this.sendChunked(data),
        (e) => this.emit("printprogress", e),
      );
    },

    printEnd: async () => {
      // No-op for D11s - stop is handled per-copy in print task
    },

    printerReset: async () => {
      await this.sendCommand(CMD.factoryReset, true);
    },

    rfidInfo: async (): Promise<RfidInfo> => {
      return {};
    },

    rfidInfo2: async (): Promise<RfidInfo> => {
      return {};
    },

    setSoundEnabled: async (_type: number, _enabled: boolean) => {
      // Not supported on D11s
    },

    firmwareUpgrade: async (_data: Uint8Array, _version: string) => {
      throw new Error("Firmware upgrade not implemented");
    },
  };

  async connect(opts?: { deviceId?: string }): Promise<void> {
    let device: BluetoothDevice;

    if (
      typeof navigator === "undefined" ||
      !navigator.bluetooth ||
      typeof navigator.bluetooth.requestDevice !== "function"
    ) {
      throw new Error(
        "Bluetooth is not available. On Android, the BLE bridge must install before Connect. Reopen the app after granting Nearby devices permission."
      );
    }

    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "FICHERO" }, { namePrefix: "D11s_" }],
        optionalServices: [SERVICE_UUID],
      });
    } catch (err) {
      throw mapBleConnectError(err);
    }

    device.addEventListener("gattserverdisconnected", () => this.onDisconnected());

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    this.writeChar = await service.getCharacteristic(WRITE_CHAR_UUID);
    this.notifyChar = await service.getCharacteristic(NOTIFY_CHAR_UUID);
    await this.notifyChar.startNotifications();
    this.notifyChar.addEventListener("characteristicvaluechanged", (e: Event) => this.onNotify(e));

    await this.negotiateMtu(device.id);

    this.device = device;

    this.emit("connect", { info: { deviceName: device.name } });

    await this.fetchPrinterInfo();
    this.startHeartbeat();
  }

  /**
   * Android keeps the ATT MTU at 23 (20-byte payload) until someone asks for more,
   * and the Capgo shim never asks — Web Bluetooth has no MTU concept. A
   * writeWithoutResponse larger than MTU-3 has no long-write fallback, so the
   * Android stack silently truncates it. That is invisible for the 4–12 byte
   * control commands but destroys the raster image, leaving the printer waiting
   * for data it never receives.
   */
  private async negotiateMtu(deviceId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.maxWriteLen = CHUNK_SIZE;
      return;
    }

    // Assume the worst until the negotiation actually succeeds.
    this.maxWriteLen = 20;

    try {
      const { BluetoothLowEnergy } = await import("@capgo/capacitor-bluetooth-low-energy");
      const { mtu } = await BluetoothLowEnergy.requestMtu({ deviceId, mtu: 512 });

      if (typeof mtu === "number" && mtu > 23) {
        this.maxWriteLen = Math.min(CHUNK_SIZE, mtu - 3);
      }

      console.info(`[fichero] MTU negotiated: ${mtu} -> write chunk ${this.maxWriteLen}B`);
    } catch (e) {
      console.warn("[fichero] MTU negotiation failed; falling back to 20-byte writes", e);
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.onDisconnected();
  }

  private onDisconnected(): void {
    this.stopHeartbeat();
    this.device = null;
    this.writeChar = null;
    this.notifyChar = null;
    this.info = {};
    this.emit("disconnect", undefined as unknown as void);
  }

  private onNotify(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const val = new Uint8Array(target.value!.buffer);
    this.notifyBuf.push(...val);
    if (this.notifyResolve) {
      this.notifyResolve();
      this.notifyResolve = null;
    }
  }

  private waitForNotify(timeout = 2000): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.notifyResolve = null;
        resolve();
      }, timeout);
      this.notifyResolve = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  async sendCommand(
    data: readonly number[] | number[] | Uint8Array,
    wait = false,
    timeout = 2000,
  ): Promise<Uint8Array> {
    if (!this.writeChar) throw new Error("Not connected");

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    this.emit("packetsent", { packet: makePacket(bytes) });

    if (wait) {
      this.notifyBuf = [];
    }

    await this.writeChar.writeValueWithoutResponse(bytes);

    if (wait) {
      await this.waitForNotify(timeout);
      await Utils.sleep(50);
    }

    const response = new Uint8Array(this.notifyBuf);

    if (wait && response.length > 0) {
      this.emit("packetreceived", { packet: makePacket(response) });
    }

    return response;
  }

  async sendChunked(data: Uint8Array): Promise<void> {
    if (!this.writeChar) throw new Error("Not connected");

    const chunkSize = Math.max(1, Math.min(CHUNK_SIZE, this.maxWriteLen));

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await this.writeChar.writeValueWithoutResponse(chunk);
      await Utils.sleep(CHUNK_DELAY_MS);
    }
  }

  private decodeResponse(buf: number[] | Uint8Array): string {
    return new TextDecoder().decode(new Uint8Array(buf)).trim();
  }

  async fetchPrinterInfo(): Promise<void> {
    const info: PrinterInfo = {};

    let r = await this.sendCommand(CMD.getModel, true);
    info.modelId = this.decodeResponse(r);

    r = await this.sendCommand(CMD.getFirmware, true);
    info.firmware = this.decodeResponse(r);

    r = await this.sendCommand(CMD.getSerial, true);
    info.serial = this.decodeResponse(r);

    r = await this.sendCommand(CMD.getBattery, true);
    if (r.length >= 2) {
      info.battery = r[r.length - 1];
      info.charging = r[r.length - 2] !== 0;
    }

    r = await this.sendCommand(CMD.getStatus, true);
    if (r.length > 0) {
      const sb = r[r.length - 1];
      info.status = this.parseStatusByte(sb);
    }

    this.info = info;
    this.emit("printerinfofetched", { info });
  }

  private parseStatusByte(byte: number): string {
    const flags: string[] = [];
    if (byte & 0x01) flags.push("printing");
    if (byte & 0x02) flags.push("cover open");
    if (byte & 0x04) flags.push("no paper");
    if (byte & 0x08) flags.push("low battery");
    if (byte & 0x10 || byte & 0x40) flags.push("overheated");
    if (byte & 0x20) flags.push("charging");
    return flags.length ? flags.join(", ") : "ready";
  }

  getModelMetadata(): PrinterModelMeta {
    return {
      model: this.info.modelId ?? "D11s",
      printheadPixels: 96,
      printDirection: "left" as const,
      densityMin: 0,
      densityMax: 2,
      densityDefault: 2,
      paperTypes: [1, 2, 3], // LabelType values
    };
  }

  getPrintTaskType(): PrintTaskName {
    return "B1";
  }

  setPacketInterval(ms: number): void {
    this.packetIntervalMs = ms;
  }

  startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatFailCount = 0;

    this.heartbeatTimer = setInterval(async () => {
      try {
        const r = await this.sendCommand(CMD.getBattery, true);
        if (r.length >= 2) {
          const data: HeartbeatData = {
            chargeLevel: r[r.length - 1],
            charging: r[r.length - 2] !== 0,
          };
          this.heartbeatFailCount = 0;
          this.emit("heartbeat", { data });
        }
      } catch {
        this.heartbeatFailCount++;
        this.emit("heartbeatfailed", { failedAttempts: this.heartbeatFailCount });
      }
    }, 5000);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}

export class FicheroBluetoothClient extends FicheroClient {}

export function instantiateClient(_type?: string): FicheroClient {
  return new FicheroBluetoothClient();
}
