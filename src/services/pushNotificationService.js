import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';

// ─── Internal state ─────────────────────────────────────────────────────────
let currentToken = null;
let initialized = false;
let listenersBound = false;
let registerPromise = null;
let currentUserId = null;

function bindPushListeners() {
    if (listenersBound) return;

    PushNotifications.addListener('registration', async (token) => {
        console.log('[Push] FCM Token:', token.value);
        currentToken = token.value;

        if (currentUserId) {
            try {
                const userRef = doc(db, 'users', currentUserId);
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
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Push] Notification tapped:', action);
    });

    listenersBound = true;
}

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

    currentUserId = userId || null;

    if (initialized) {
        console.log('[Push] Already initialized');
        return;
    }

    if (registerPromise) {
        await registerPromise;
        return;
    }

    try {
        registerPromise = (async () => {
            let permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                console.warn('[Push] Permission not granted');
                return;
            }

            bindPushListeners();
            await PushNotifications.register();
            initialized = true;
            console.log('[Push] Registration initiated');
        })();

        await registerPromise;
    } catch (err) {
        console.error('[Push] Init failed:', err);
    } finally {
        registerPromise = null;
    }
}

/**
 * Remove the current device's FCM token from Firestore.
 * Call this on logout so the user stops receiving notifications.
 */
export async function removePushToken(userId) {
    if (!Capacitor.isNativePlatform()) {
        return;
    }

    const targetUserId = userId || currentUserId;

    if (currentToken && targetUserId) {
        try {
            const userRef = doc(db, 'users', targetUserId);
            await updateDoc(userRef, {
                fcmTokens: arrayRemove(currentToken)
            });
            console.log('[Push] Token removed from Firestore');
        } catch (err) {
            console.error('[Push] Failed to remove token:', err);
        }
    }

    currentToken = null;
    currentUserId = null;
    initialized = false;
    registerPromise = null;

    if (listenersBound) {
        await PushNotifications.removeAllListeners();
        listenersBound = false;
    }
}
