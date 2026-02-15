import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.myapp.android',
    appName: 'Marina Park',
    webDir: 'dist',
    backgroundColor: '#f8f9fa',
    server: {
        url: 'https://marinapark.vercel.app/',
        cleartext: true
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 0,
            launchAutoHide: true,
            backgroundColor: "#f8f9fa"
        },
        FirebaseAuthentication: {
            skipNativeAuth: true,
            providers: ["google.com"]
        },
        PushNotifications: {
            presentationOptions: ["badge", "sound", "alert"]
        }
    }
};

export default config;
