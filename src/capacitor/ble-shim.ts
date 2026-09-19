/**
 * Android System WebView does NOT implement navigator.bluetooth (Web Bluetooth).
 * Capgo provides a JS shim that installs navigator.bluetooth on top of native BLE.
 *
 * IMPORTANT: Do NOT call BluetoothLowEnergy.shimWebBluetooth().
 * Capacitor registerPlugin() returns a Proxy whose get trap always wraps native
 * methods. Capgo assigns shimWebBluetooth onto that Proxy, but the assignment is
 * invisible on get — the call becomes an async Unimplemented native call and the
 * real installer never runs. Import installBluetoothLowEnergyShim and call it
 * directly instead.
 *
 * Capgo limitation: requestDevice() returns the first matching scan result
 * (no Chrome-style chooser UI). Scan needs BLE on; on many phones Location must
 * also be enabled for discovery.
 */
import { Capacitor } from '@capacitor/core';

function showBleToast(message: string): void {
  try {
    void import('$/utils/toasts').then(({ Toasts }) => {
      Toasts.message(message);
    });
  } catch {
    // ignore — console already has the detail
  }
}

export async function initNativeBleShim(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const { BluetoothLowEnergy } = await import(
      '@capgo/capacitor-bluetooth-low-energy'
    );
    // Direct import — bypasses the broken Proxy method assignment
    const { installBluetoothLowEnergyShim } = await import(
      '@capgo/capacitor-bluetooth-low-energy/dist/esm/shim.js'
    );

    await BluetoothLowEnergy.initialize({ mode: 'central' });
    const perms = await BluetoothLowEnergy.requestPermissions();
    console.info('[fichero] BLE permissions', perms);

    installBluetoothLowEnergyShim(BluetoothLowEnergy);

    const shimOk =
      typeof navigator !== 'undefined' &&
      typeof navigator.bluetooth !== 'undefined' &&
      typeof navigator.bluetooth.requestDevice === 'function';

    if (shimOk) {
      console.info(
        '[fichero] Web Bluetooth shim installed (navigator.bluetooth.requestDevice ready)'
      );
    } else {
      const available = Capacitor.isPluginAvailable('BluetoothLowEnergy');
      console.error(
        '[fichero] BLE shim install failed',
        { pluginAvailable: available, hasNavigator: typeof navigator !== 'undefined' }
      );
      showBleToast(
        'Bluetooth bridge failed to install. Reinstall the app or check BLE permissions.'
      );
    }
  } catch (err) {
    console.error('[fichero] Failed to install BLE shim', err);
    showBleToast(
      'Bluetooth setup failed. Grant Nearby devices / Location, turn Bluetooth on, then reopen the app.'
    );
    // Do not rethrow — app must still start without crashing
  }
}
