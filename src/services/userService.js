import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';

const PUBLIC_PROFILE_FIELDS = new Set([
    'displayName',
    'email',
    'photoURL',
    'lastLogin',
    'fcmTokens'
]);

/**
 * Save or update user profile in Firestore with a strict public allowlist.
 */
export const saveUserProfile = async (uid, data) => {
    try {
        const userRef = doc(db, 'users', uid);
        const payload = Object.fromEntries(
            Object.entries(data || {}).filter(
                ([key, value]) => PUBLIC_PROFILE_FIELDS.has(key) && value !== undefined
            )
        );

        if (Object.keys(payload).length === 0) return;
        await setDoc(userRef, payload, { merge: true });
    } catch (error) {
        console.error('Error saving user profile:', error);
        throw error;
    }
};

/**
 * Get user profile from Firestore.
 */
export const getUserProfile = async (uid) => {
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        return snap.exists() ? { uid, ...snap.data() } : null;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
};

/**
 * Get all bookings for a user, ordered by creation date (newest first).
 */
export const getUserBookings = async (uid) => {
    try {
        const bookingsRef = collection(db, 'users', uid, 'bookings');
        const q = query(bookingsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((bookingDoc) => ({ id: bookingDoc.id, ...bookingDoc.data() }));
    } catch (error) {
        console.error('Error fetching user bookings:', error);
        return [];
    }
};
