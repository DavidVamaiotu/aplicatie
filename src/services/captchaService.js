const RECAPTCHA_SCRIPT_ID = 'google-recaptcha-v3';
const RECAPTCHA_SCRIPT_BASE = 'https://www.google.com/recaptcha/api.js?render=';
const BOOKING_RECAPTCHA_SITE_KEY = import.meta.env.VITE_BOOKING_RECAPTCHA_SITE_KEY;

let loadPromise = null;

function loadRecaptchaScript() {
    if (!BOOKING_RECAPTCHA_SITE_KEY || typeof window === 'undefined') {
        return Promise.resolve();
    }

    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
        if (window.grecaptcha?.execute) {
            resolve();
            return;
        }

        const existing = document.getElementById(RECAPTCHA_SCRIPT_ID);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA script')));
            return;
        }

        const script = document.createElement('script');
        script.id = RECAPTCHA_SCRIPT_ID;
        script.src = `${RECAPTCHA_SCRIPT_BASE}${encodeURIComponent(BOOKING_RECAPTCHA_SITE_KEY)}`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load reCAPTCHA script'));
        document.head.appendChild(script);
    });

    return loadPromise;
}

export async function getBookingCaptchaToken(action = 'create_booking') {
    if (!BOOKING_RECAPTCHA_SITE_KEY) {
        return '';
    }

    await loadRecaptchaScript();
    if (!window.grecaptcha?.ready || !window.grecaptcha?.execute) {
        throw new Error('reCAPTCHA is not available');
    }

    await new Promise((resolve) => window.grecaptcha.ready(resolve));
    return window.grecaptcha.execute(BOOKING_RECAPTCHA_SITE_KEY, { action });
}
