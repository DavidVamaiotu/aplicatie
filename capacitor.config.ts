import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.myapp.android',
    appName: 'Marina Park',
    webDir: 'dist',
    server: {
        url: 'https://marinapark.vercel.app/',
        cleartext: true
    }
};

export default config;
