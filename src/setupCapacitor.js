import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';

const setupCapacitor = async () => {
    if (Capacitor.getPlatform() === 'android') {
        try {
            await StatusBar.setStyle({ style: Style.Dark });
            await StatusBar.setOverlaysWebView({ overlay: true });

            // Force navigation bar to be transparent. 
            // Icon color is now handled by styles.xml (windowLightNavigationBar=true)
            await NavigationBar.setTransparency({ isTransparent: true });
        } catch (e) {
            console.error("Error setting up Capacitor plugins", e);
        }
    }
};

export default setupCapacitor;
