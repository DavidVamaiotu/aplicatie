import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Internal state ─────────────────────────────────────────────────────────
let currentToken = null;
let initialized = false;

/**
 * Initialize push notifications for the given user.
 * Requests permission, registers with FCM, stores the token in Firestore.
 * Only runs on native platforms (Android/iOS). No-op on web.
 */
export async function initPushNotifications(userId) {
    if (!Capacitor.isNativePlatform()) {
        console.log('[Push] Skipping — not a native platform');
        return;
    }

    if (initialized) {
        console.log('[Push] Already initialized');
        return;
    }

    try {
        // 1. Check / request permission
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('[Push] Permission not granted');
            return;
        }

        // 2. Register event listeners BEFORE calling register()
        PushNotifications.addListener('registration', async (token) => {
            console.log('[Push] FCM Token:', token.value);
            currentToken = token.value;

            // Store token in Firestore
            if (userId) {
                try {
                    const userRef = doc(db, 'users', userId);
                    await updateDoc(userRef, {
                        fcmTokens: arrayUnion(token.value)
                    });
                    console.log('[Push] Token stored in Firestore');
                } catch (err) {
                    console.error('[Push] Failed to store token:', err);
                }
            }
        });

        PushNotifications.addListener('registrationError', (error) => {
            console.error('[Push] Registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[Push] Notification received in foreground:', notification);
            // Foreground notifications are handled by the OS with presentationOptions
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('[Push] Notification tapped:', action);
            // You can add navigation logic here based on action.notification.data
        });

        // 3. Register with FCM
        await PushNotifications.register();
        initialized = true;
        console.log('[Push] Registration initiated');

    } catch (err) {
        console.error('[Push] Init failed:', err);
    }
}

/**
 * Remove the current device's FCM token from Firestore.
 * Call this on logout so the user stops receiving notifications.
 */
export async function removePushToken(userId) {
    if (!Capacitor.isNativePlatform() || !currentToken || !userId) {
        return;
    }

    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            fcmTokens: arrayRemove(currentToken)
        });
        console.log('[Push] Token removed from Firestore');
    } catch (err) {
        console.error('[Push] Failed to remove token:', err);
    }

    // Reset state so re-login will re-register
    currentToken = null;
    initialized = false;

    // Remove all listeners
    await PushNotifications.removeAllListeners();
}
