
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dongnefriend.app',
  appName: '동네친구',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    url: process.env.VITE_API_BASE_URL || 'http://localhost:5173',
    cleartext: process.env.NODE_ENV !== 'production',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    buildOptions: {
      keystorePath: process.env.KEYSTORE_PATH,
      keystorePassword: process.env.KEYSTORE_PASSWORD,
      keystoreAlias: process.env.KEYSTORE_ALIAS,
      keystoreAliasPassword: process.env.KEYSTORE_ALIAS_PASSWORD,
      releaseType: 'AAB',
    },
  },
};

export default config;
