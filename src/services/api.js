import { httpsCallable } from 'firebase/functions';
import { getToken } from 'firebase/app-check';
import { appCheck, auth, functions } from '../firebase';

function mapBookingError(error) {
    const code = String(error?.code || '');
    const rawMessage = String(error?.message || '');
    const message = rawMessage.toLowerCase();

    if (message.includes('invalid site key') || message.includes('invalid domain for site key')) {
        return 'Cheia reCAPTCHA este invalidă. Verifică setările de captcha și domeniul aplicației.';
    }

    if (code === 'functions/unauthenticated' || message.includes('unauthenticated')) {
        return 'Sesiunea este invalidă sau verificarea de securitate a eșuat. Reconectează-te și încearcă din nou.';
    }

    if (code === 'functions/failed-precondition') {
        if (message.includes('app check')) {
            return 'App Check nu este configurat corect pentru această aplicație.';
        }
        return rawMessage || 'Cererea nu poate fi procesată în acest moment.';
    }

    if (code === 'functions/invalid-argument') {
        if (message.includes('captcha')) {
            return 'Verificarea captcha a eșuat. Reîncearcă.';
        }
        return rawMessage || 'Datele rezervării sunt invalide.';
    }

    return rawMessage || 'Failed to create booking';
}

/**
 * Creates and reserves a booking via Cloud Functions.
 * Booking provider and Firestore writes are handled server-side.
 * @param {Object} bookingData - The booking data.
 * @param {Array} bookingData.dates - Array of date strings.
 * @param {'room'|'camping'} bookingData.bookingType - Booking type.
 * @param {number} bookingData.roomId - Firestore room document id.
 * @param {number} bookingData.resource_id - WordPress resource id.
 * @returns {Promise<Object>} The API response.
 */
export const createBooking = async (bookingData) => {
    try {
        if (auth.currentUser) {
            await auth.currentUser.getIdToken();
        }
        if (appCheck) {
            const appCheckResult = await getToken(appCheck, false);
            if (!appCheckResult?.token) {
                throw new Error('App Check token missing');
            }
        }
        const fn = httpsCallable(functions, 'createBookingAndReserve');
        const result = await fn(bookingData);
        return result.data;
    } catch (error) {
        console.error('API Error:', error);
        throw new Error(mapBookingError(error));
    }
};
