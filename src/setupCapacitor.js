import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { NavigationBar } from '@capgo/capacitor-navigation-bar';

const setupCapacitor = async () => {
    if (Capacitor.getPlatform() === 'android') {
        try {
            await StatusBar.setStyle({ style: Style.Dark });
            await StatusBar.setOverlaysWebView({ overlay: true });

            // Set navigation bar to green with white icons
            await NavigationBar.setColor({
                color: '#14532d',
                darkButtons: false  // false = white icons
            });
        } catch (e) {
            console.error("Error setting up Capacitor plugins", e);
        }
    }
};

export default setupCapacitor;
