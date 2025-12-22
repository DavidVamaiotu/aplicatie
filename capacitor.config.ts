import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.myapp.android',
    appName: 'Marina Park',
    webDir: 'dist',
    server: {
        url: 'https://marinapark.vercel.app/',
        cleartext: true
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 0,
            launchAutoHide: true,
            backgroundColor: "#f8f9fa"
        }
    }
};

export default config;
