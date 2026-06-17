import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'xyz.uccomms.uncx',
  appName: 'UC.Comms',
  webDir: '../web/dist',
  android: {
    allowMixedContent: false,
    captureInput: true
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
