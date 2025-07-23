import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.d725c24b722146829ef6c81ab16d320a',
  appName: 'station-status-hub',
  webDir: 'dist',
  server: {
    url: 'https://d725c24b-7221-4682-9ef6-c81ab16d320a.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0
    }
  }
};

export default config;