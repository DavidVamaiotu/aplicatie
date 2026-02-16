const RECAPTCHA_SCRIPT_ID = 'google-recaptcha-v3-explicit';
const RECAPTCHA_SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit';
const RECAPTCHA_CONTAINER_ID = 'booking-recaptcha-widget';
const BOOKING_RECAPTCHA_SITE_KEY = import.meta.env.VITE_BOOKING_RECAPTCHA_SITE_KEY;

let scriptPromise = null;
let widgetPromise = null;

function mapRecaptchaError(error, fallbackMessage) {
    const message = String(error?.message || error || '').toLowerCase();

    if (message.includes('invalid site key') || message.includes('invalid key type')) {
        return new Error('Invalid reCAPTCHA site key. Verify VITE_BOOKING_RECAPTCHA_SITE_KEY and allowed domains.');
    }
    if (message.includes('invalid domain for site key')) {
        return new Error('This domain is not allowed for the configured reCAPTCHA key.');
    }
    if (message.includes('network')) {
        return new Error('Network error while loading reCAPTCHA. Check your connection.');
    }
    return new Error(fallbackMessage);
}

function waitForGrecaptcha(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (window.grecaptcha?.ready && window.grecaptcha?.render && window.grecaptcha?.execute) {
                clearInterval(timer);
                resolve();
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                clearInterval(timer);
                reject(new Error('Timed out while waiting for reCAPTCHA runtime.'));
            }
        }, 50);
    });
}

function loadRecaptchaScript() {
    if (!BOOKING_RECAPTCHA_SITE_KEY || typeof window === 'undefined') {
        return Promise.resolve();
    }

    if (window.grecaptcha?.ready && window.grecaptcha?.render && window.grecaptcha?.execute) {
        return Promise.resolve();
    }

    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
        if (window.grecaptcha?.render && window.grecaptcha?.execute) {
            resolve();
            return;
        }

        const onReady = () => {
            waitForGrecaptcha()
                .then(resolve)
                .catch(() => reject(new Error('Failed to initialize reCAPTCHA runtime.')));
        };

        const existingById = document.getElementById(RECAPTCHA_SCRIPT_ID);
        const existingAny = existingById || document.querySelector('script[src^="https://www.google.com/recaptcha/api.js"]');
        if (existingAny) {
            if (window.grecaptcha?.render) {
                resolve();
                return;
            }
            existingAny.addEventListener('load', onReady, { once: true });
            existingAny.addEventListener('error', () => reject(new Error('Failed to load reCAPTCHA script.')), { once: true });
            onReady();
            return;
        }

        const script = document.createElement('script');
        script.id = RECAPTCHA_SCRIPT_ID;
        script.src = RECAPTCHA_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = onReady;
        script.onerror = () => reject(new Error('Failed to load reCAPTCHA script.'));
        document.head.appendChild(script);
    }).catch((error) => {
        scriptPromise = null;
        throw mapRecaptchaError(error, 'Failed to load reCAPTCHA script.');
    });

    return scriptPromise;
}

async function ensureWidgetId() {
    if (widgetPromise) return widgetPromise;

    widgetPromise = (async () => {
        await loadRecaptchaScript();

        await new Promise((resolve) => window.grecaptcha.ready(resolve));

        let container = document.getElementById(RECAPTCHA_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = RECAPTCHA_CONTAINER_ID;
            container.style.position = 'fixed';
            container.style.left = '-9999px';
            container.style.top = '-9999px';
            container.style.width = '1px';
            container.style.height = '1px';
            container.style.opacity = '0';
            document.body.appendChild(container);
        }

        try {
            return window.grecaptcha.render(container, {
                sitekey: BOOKING_RECAPTCHA_SITE_KEY,
                size: 'invisible',
            });
        } catch (error) {
            throw mapRecaptchaError(error, 'Failed to initialize booking captcha widget.');
        }
    })().catch((error) => {
        widgetPromise = null;
        throw error;
    });

    return widgetPromise;
}

export async function getBookingCaptchaToken(action = 'create_booking') {
    if (!BOOKING_RECAPTCHA_SITE_KEY) {
        throw new Error('Captcha is not configured: VITE_BOOKING_RECAPTCHA_SITE_KEY is missing.');
    }

    const widgetId = await ensureWidgetId();
    if (!window.grecaptcha?.ready || !window.grecaptcha?.execute) {
        throw new Error('reCAPTCHA is not available on this page.');
    }

    await new Promise((resolve) => window.grecaptcha.ready(resolve));
    try {
        const token = await window.grecaptcha.execute(widgetId, { action });
        if (!token) {
            throw new Error('Empty captcha token.');
        }
        return token;
    } catch (error) {
        throw mapRecaptchaError(error, 'Failed to generate captcha token.');
    }
}
