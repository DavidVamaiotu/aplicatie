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
            launchShowDuration: 2000,
            launchAutoHide: false,
            backgroundColor: "#f8f9fa",
            showSpinner: false,
            androidScaleType: "CENTER_CROP",
            splashFullScreen: true,
            splashImmersive: true
        }
    }
};

export default config;
