import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nl.abektes.fichero',
  appName: 'Labels in Action',
  webDir: 'dist',
  server: {
    // Local assets only — no remote URL. BLE needs the native bridge.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    BluetoothLowEnergy: {
      // Capgo plugin; permissions also declared in AndroidManifest.
    },
  },
};

export default config;
