# Marina Park Booking App

Marina Park is a mobile-first booking application for the Marina Park property in Vama Veche, Romania. The repository contains a React + Vite frontend, Firebase-backed booking and discount logic, a Capacitor Android wrapper, and WordPress bridge scripts used to create and synchronize bookings with Booking Calendar.

## Stack

- React 19 + Vite frontend in `src/`
- Firebase Auth, Firestore, Functions, App Check, and push notifications
- Firebase Cloud Functions in `functions/` for booking validation, holds, discount evaluation, reconciliation, and scheduled cleanup
- WordPress PHP bridge scripts in `scripts/` for Booking Calendar integration
- Capacitor Android shell in `android/`

## Core Behavior

- Guests and signed-in users can browse rooms and camping inventory, select dates, and submit bookings.
- Room bookings are created through the callable function `createBookingAndReserve`.
- The backend validates payloads, enforces App Check, optionally checks guest reCAPTCHA, creates temporary holds, and forwards the booking to the custom WordPress endpoint.
- Successful bookings are mirrored into Firestore orders, user booking history, and room-unit availability data.
- Discount campaigns are evaluated server-side and can trigger push notifications and reminder jobs.

## Repository Layout

```text
.
|-- src/                     React app, pages, components, services, data
|-- functions/               Firebase Cloud Functions (TypeScript)
|-- scripts/                 Admin and WordPress integration scripts
|-- android/                 Capacitor Android project
|-- public/                  Static public assets
|-- assets/                  Additional repository assets
|-- firestore.rules          Firestore security rules
|-- firestore.indexes.json   Firestore composite indexes
|-- firebase.json            Firebase project configuration
|-- capacitor.config.ts      Capacitor config, including production server URL
`-- progress.md              Required work log for task continuity
```

## Prerequisites

- Node.js compatible with the root app dependencies
- npm
- Firebase project access for Firestore, Functions, and Auth
- Google reCAPTCHA v3 site key for guest booking flows
- Firebase App Check reCAPTCHA v3 site key
- WordPress Booking Calendar endpoint and shared secret for production booking creation

The Functions workspace currently targets Node.js 22 via `functions/package.json`.

## Environment

Create a local `.env` file based on `.env.example`:

```env
VITE_BOOKING_RECAPTCHA_SITE_KEY=your_google_recaptcha_v3_site_key
VITE_FIREBASE_APPCHECK_SITE_KEY=your_firebase_app_check_recaptcha_v3_site_key
VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=
```

Additional Firebase config is loaded from the frontend source, Android `google-services.json`, and your Firebase project settings.

## Local Development

Install dependencies for the web app:

```bash
npm install
```

Install dependencies for Cloud Functions:

```bash
cd functions
npm install
```

Run the frontend:

```bash
npm run dev
```

Build the frontend:

```bash
npm run build
```

Lint the frontend:

```bash
npm run lint
```

Build the Functions package:

```bash
cd functions
npm run build
```

Run the Functions emulator:

```bash
cd functions
npm run serve
```

## Deployment Notes

- `firebase.json` deploys Firestore rules and the `functions/` codebase.
- `capacitor.config.ts` points the Android app at `https://marinapark.vercel.app/`, so the Android shell depends on the deployed web app being available.
- Root scripts `deploy` and `ship` currently run a frontend build, `npx cap sync`, then create and push a Git commit. Review those scripts before using them in automation or CI.

## Important Collections

- `rooms`
- `rooms/{roomId}/units`
- `users`
- `users/{uid}/bookings`
- `users_private`
- `orders`
- `campaigns`
- `discount_usages`
- `booking_rate_limits`
- `booking_holds`

## Known Maintenance Notes

- `src/App.css` appears to be leftover starter CSS; the active styling system is mostly in `src/index.css`.
- Some files show mojibake in shell output, suggesting an encoding issue worth checking if Romanian text renders incorrectly in the UI.
- Some helper/admin scripts are stale relative to the current Firestore security rules.
- `progress.md` and the repository root `AGENTS.md` are part of the required workflow for future work in this repository.
