# Fichero D11s (AiYin) - Protocol Reference

Reverse-engineered from decompiled Fichero APK (com.lj.fichero v1.1.5)
and verified against hardware (D11s, firmware 2.4.6).

Device class hierarchy: D11s -> AiYinNormalDevice -> BaseNormalDevice -> BaseDevice
SDK: LuckPrinter SDK (com.luckprinter.sdk_new)
Manufacturer: Xiamen Print Future Technology Co., Ltd

## Hardware

- Printhead: 96 pixels wide (12 bytes/row)
- DPI: 203 (8 dots/mm)
- Battery: 18500 Li-Ion, 1200mAh
- Charging: USB-C, 5V 1A
- Connection: Classic Bluetooth SPP + BLE (4 UART services)
- SPP UUID: 00001101-0000-1000-8000-00805F9B34FB
- BT names: "FICHERO_XXXX", "D11s_"


## BLE Services (all do the same thing)

| Service UUID | Write Char | Notify Char |
|---|---|---|
| 000018f0-0000-1000-8000-00805f9b34fb | 2af1 | 2af0 |
| 0000ff00-0000-1000-8000-00805f9b34fb | ff02 | ff01 (+ ff03 notify) |
| e7810a71-73ae-499d-8c15-faa9aef0c3f2 | bef8d6c9... | bef8d6c9... (same, write+notify) |
| 49535343-fe7d-4ae5-8fa9-9fafd205e455 | 4953...9bb3 | 4953...9616 (+ aca3 write+notify) |


## Info Commands (verified on hardware)

| Bytes | Command | Response | Example |
|---|---|---|---|
| 10 FF 20 F0 | Get model | ASCII string | "D11s" |
| 10 FF 20 F1 | Get firmware version | ASCII string | "2.4.6" |
| 10 FF 20 F2 | Get serial number | ASCII string | |
| 10 FF 20 EF | Get boot version | ASCII string | "V1.00" |
| 10 FF 50 F1 | Get battery | 2 bytes: [status, percent] | 00 56 = 86% |
| 10 FF 40 | Get status | 1 byte bitmask (see below) | 00 = ready |
| 10 FF 11 | Get density | 3 bytes | 01 14 01 |
| 10 FF 13 | Get shutdown time | 2 bytes big-endian (minutes) | 00 14 = 20 min |
| 10 FF 70 | Get all info | Pipe-delimited ASCII | see below |


## Status Byte Bitmask (10 FF 40 response)

| Bit | Mask | Meaning |
|-----|------|---------|
| 0 | 0x01 | Currently printing |
| 1 | 0x02 | Cover open |
| 2 | 0x04 | Out of paper |
| 3 | 0x08 | Low battery |
| 4 | 0x10 | Overheated (alt) |
| 5 | 0x20 | Charging |
| 6 | 0x40 | Overheated |

0x00 = all clear, ready to print.


## All-Info Response (10 FF 70)

Pipe-delimited: BT_NAME|MAC_CLASSIC|MAC_BLE|FIRMWARE|SERIAL|BATTERY

Example:
FICHERO_XXXX|XX:XX:XX:XX:XX:XX|XX:XX:XX:XX:XX:XX|2.4.6|SERIAL|86


## Config Commands (verified on hardware)

| Bytes | Command | Parameters | Response |
|---|---|---|---|
| 10 FF 10 00 nn | Set density | 0=light, 1=medium, 2=thick | "OK" |
| 10 FF 84 nn | Set paper type | 0=gap/label, 1=black mark, 2=continuous | "OK" |
| 10 FF 12 HH LL | Set shutdown time | big-endian minutes | "OK" |
| 10 FF 04 | Factory reset | none | "OK" |
| 10 FF C0 nn | Set speed | speed value | 4 bytes (unclear) |


## Commands That Do NOT Work on D11s

| Bytes | Command | Notes |
|---|---|---|
| 10 FF 20 A0 | Get speed | No response |
| 10 FF B0 | Get time format | No response |
| 10 FF 15 LL HH | Set width | No response (fixed at 96) |
| 1F 70 01 nn | Set heating | No response |
| 1F 11 11 nn | Reverse feed | No response |


## Print Sequence (AiYin D11s)

This is the exact sequence used by the Fichero app, confirmed working:

```
1. 10 FF 10 00 nn              Set density
2. 10 FF 84 00                  Set paper type (gap/label)
3. 00 00 00 00 00 00 00 00      Wake up (12 null bytes)
   00 00 00 00
4. 10 FF FE 01                  Enable printer (AiYin-specific)
5. 1D 76 30 00 0C 00 yL yH     Raster image header (GS v 0)
   [pixel data...]              1-bit bitmap, MSB first
6. 1D 0C                        Form feed / position next label
7. 10 FF FE 45                  Stop print (AiYin-specific)
                                 -> wait for 0xAA or "OK" (60s timeout)
```

IMPORTANT: The enable/stop commands are device-class specific.
- AiYin (D11s, D12): 10 FF FE 01 / 10 FF FE 45
- Base/Lujiang (L13, etc): 10 FF F1 03 / 10 FF F1 45
Using the wrong ones = printer accepts data silently but never prints.


## Raster Image Format

Header: 1D 76 30 mm xL xH yL yH

| Byte | Meaning |
|------|---------|
| 1D 76 30 | GS v 0 (ESC/POS raster command) |
| mm | Mode: 0=normal, 1=double-width, 2=double-height, 3=both |
| xL xH | Width in bytes, little-endian. D11s: 0C 00 (12 bytes = 96 px) |
| yL yH | Height in rows, little-endian. 30mm label: F0 00 (240 rows) |

Pixel data follows immediately. Each byte encodes 8 pixels, MSB = leftmost.
1 = black (heater on), 0 = white. Total data = xL * yL bytes.


## Error Response Format

When printer returns FF nn, the second byte is a bitmask:

| Bit | Meaning |
|-----|---------|
| 0 | Overheated |
| 1 | Cover open |
| 2 | Out of paper |
| 3 | Low battery |


## Feed Commands (verified)

| Bytes | Command |
|---|---|
| 1D 0C | Form feed - advance to next label |
| 1B 4A nn | Feed forward by nn dots |
| 10 0C | Form feed (alt, returns "OK") |


## Batch Printing

For multiple copies, repeat steps 2-7 for each copy.
Lujiang devices use batch markers (not tested on D11s):
- 1B BB CC = first label in batch
- 1B BB AA = not-last label
- 1B BB BB = last label


## Firmware Update Protocol (AiYin, from APK - NOT TESTED)

1. 10 FF E0 AA AA - enter update mode
2. sleep 1000ms
3. 10 FF FF [random] - handshake
4. 1B 10 framed packets with 256-byte chunks
5. Packet format: 1B 10 [len_hi] [len_lo] 00 00 [type] [0] [0] [0] [data_len_hi] [data_len_lo] [data...] [checksum]
6. Types: 2=query, 3=prepare erase, 4=send data, 6=verify, 7=reboot


## Other Device Types in SDK

The LuckPrinter SDK supports 159+ printer models across 4 manufacturers:
- AiYin: D11s, D12, A10, A40a, Fichero6181
- Lujiang: LuckP series, DP series, L12, L13
- YinXiang: same protocol as Lujiang
- Hanyin: AL200

Fichero-branded printers:
- FICHERO_5836 -> D11s (AiYin)
- FICHERO_6181 -> Fichero6181 (AiYin A4)
- Fichero 3561 -> DP_D1 (Lujiang)
- Fichero 4575 -> DP_D1H (Lujiang)
- Fichero 4437 -> DP_L81H (Lujiang)

## How this was reverse-engineered

1. BLE enumeration with bleak to find services and characteristics
2. Pulled the Fichero APK from an Android phone via ADB
3. Decompiled with jadx, found the LuckPrinter SDK
4. Traced the device class hierarchy: D11s -> AiYinNormalDevice -> BaseNormalDevice
5. Found the AiYin-specific enable/stop commands that were different from the base class
6. Tested every discovered command against the actual hardware and documented which ones work
