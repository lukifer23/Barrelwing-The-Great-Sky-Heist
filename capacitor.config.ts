import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.barrelwing.skyheist',
  appName: 'Barrelwing',
  webDir: 'dist',
  backgroundColor: '#070a14',
  android: { backgroundColor: '#070a14', allowMixedContent: false },
};
export default config;
