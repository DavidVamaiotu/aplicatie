# Current Task
- Replace the default Vite `README.md` with repository-specific documentation for the Marina Park booking app.

# Recent Changes
- README.md: replaced the default Vite template text with Marina Park-specific documentation covering architecture, runtime behavior, environment variables, local commands, deployment notes, and Firestore collections.
- progress.md: refreshed the active task and recorded the README rewrite immediately after the documentation change.

# Validation
- `Get-Content README.md`: confirmed the repository still had the default Vite template before rewriting it.
- `Get-Content skills/progress-md-memory/SKILL.md`: verified the required `progress.md` update workflow before editing files.
- `Get-Content skills/wpbooking-vite-react/SKILL.md`: checked the repo-local integration guidance before documenting the app stack.
- `Get-Content package.json`, `.env.example`, `functions/package.json`, `firebase.json`, `capacitor.config.ts`, `src/services/api.js`: verified scripts, env keys, deployment target, and callable booking flow details used in the new README.
- `Get-Content README.md` after editing: sanity-checked the final README content and structure.
- `if (Test-Path .git) { git status --short } else { Write-Output 'NO_GIT_REPO_DETECTED' }`: shell still reports no Git repository metadata available from this workspace context.

# Next Steps
- None for this README task.
- Keep this file in sync whenever routes, scripts, Android packaging, Firebase collections, WordPress integration, or repository instructions change.

# App Overview

Marina Park is a mobile-first booking application for the Marina Park property in Vama Veche, Romania. It lets guests browse accommodation inventory, browse camping inventory, select travel dates, reserve a specific room unit or a camping option, sign in or create an account, view their booking history, and receive discount-related push notifications. The repository contains:

- A React 19 + Vite frontend in `src/`.
- Firebase web integration for Auth, Firestore, Functions, App Check, and push notification token storage.
- Firebase Cloud Functions that validate bookings, apply rate limits, create temporary booking holds, call the external WordPress Booking Calendar provider, mirror booking data into Firestore, evaluate discounts, and send notifications.
- A Capacitor Android wrapper under `android/` so the app can run as a native Android shell.
- WordPress PHP bridge scripts in `scripts/` that connect Booking Calendar to Firestore and expose an HMAC-protected booking creation endpoint.

The app is no longer a starter template even though a few starter files are still present. The live product behavior is centered on Marina Park booking flows, discount campaigns, user account management, and WordPress/Firebase synchronization.

# What The App Does

- Shows room categories and camping options from Firestore, with static fallback data baked into the client.
- Lets a user pick a room type, then choose a specific unit from that category before booking.
- Renders a booking calendar that distinguishes booking start dates, end dates, middle dates, and chained same-day turnover cases.
- Lets guests book without an account, but requires invisible reCAPTCHA for guest checkout.
- Lets signed-in users use email/password auth or native Google sign-in through the Capacitor Firebase Authentication plugin.
- Saves public user profile data in `users/{uid}` and canonical booking records in `orders/{bookingId}`.
- Maintains a user-facing mirror of bookings in `users/{uid}/bookings/{bookingId}` for the account page.
- Tracks private profile stats in `users_private/{uid}` for discount eligibility logic such as order count and account age.
- Evaluates discount campaigns server-side and shows eligible campaigns in the UI.
- Sends push notifications to registered mobile devices when new campaigns appear and through scheduled reminder jobs.
- Uses booking holds and rate-limiting documents to reduce double-booking and spam booking attempts.
- Falls back to `pending_local_sync` when the booking provider succeeds but Firestore finalization fails, then retries reconciliation with scheduled jobs.

# Main Runtime Architecture

## Frontend

- `src/main.jsx` bootstraps the React app and runs `setupCapacitor()` before render.
- `src/App.jsx` owns the router, lazy page loading, auth/theme providers, status bar setup, Android back button behavior, and push notification initialization.
- Pages under `src/pages/` implement browsing, account management, login/register, booking, and success confirmation flows.
- Shared UI components under `src/components/` implement the sticky layout, bottom nav, booking calendar, room cards, skeletons, and reveal animations.
- `src/index.css` is the real visual system for the app. It contains the custom utility classes, page layouts, room card styles, account page styles, booking form styles, calendar styling, success states, and dark mode overrides.

## Firebase

- `src/firebase.js` initializes the Firebase client SDK, Firestore, Auth, callable Functions, and App Check.
- Firestore is used for inventory (`rooms` and `rooms/{roomId}/units`), user profiles, user booking mirrors, canonical orders, discount campaigns, rate-limiting documents, and temporary booking holds.
- Auth supports both classic email/password and Google sign-in.
- App Check is expected in production and is enforced by the main booking callable.

## Booking Provider Bridge

- The actual booking provider appears to remain WordPress Booking Calendar.
- The frontend never talks directly to WordPress. It calls the Firebase callable `createBookingAndReserve`.
- The Cloud Function validates the payload, enforces App Check, optionally validates guest captcha, applies rate limiting, creates a temporary booking hold, and then sends an HMAC-signed request to the custom WordPress REST endpoint.
- If WordPress confirms the booking, the function writes Firestore order state and user mirror state. If local Firestore finalization fails after the provider accepts the booking, the function writes a `pending_local_sync` order so scheduled reconciliation can finish it later.

## Android Wrapper

- Capacitor packages the web app into an Android app.
- `capacitor.config.ts` points the Android app at `https://marinapark.vercel.app/`, so the native shell is configured to load the deployed site rather than relying only on bundled assets.
- Android resources include launcher icons, splash screens, manifest/theme config, Firebase Android services config, and the generated Capacitor plugin wiring.

# Important Backend Behavior

## Booking flow

1. The client gathers room/camping details, dates, guests, and personal information.
2. Guests obtain an invisible reCAPTCHA token from `src/services/captchaService.js`.
3. The client calls `createBookingAndReserve` through `src/services/api.js`.
4. `functions/src/index.ts` validates the booking, enforces App Check, validates captcha for guests, and applies rate limits keyed by user or hashed guest fingerprint.
5. For room bookings, the function creates a temporary hold in `booking_holds` and also stores the active hold inside the unit document.
6. The function calls the custom WordPress REST endpoint with HMAC headers when configured.
7. On success, it writes or updates the canonical Firestore order, adds the booking to the unit's `bookings` array, mirrors the booking into the user's booking subcollection, updates the private profile metrics, and removes the temporary hold.
8. If finalization fails after the provider accepted the booking, the function writes a `pending_local_sync` order and scheduled reconciliation jobs attempt to repair local state.

## Discount flow

- Campaigns live in `campaigns`.
- `evaluateUserDiscounts` returns only active, unexpired, eligible campaigns for the current user.
- Eligibility is based on rules evaluated against `users_private/{uid}` data such as order count, account age, booleans, strings, and date math.
- `applyDiscount` enforces per-user limits, global limits, room targeting, user eligibility, and confirmed/synced order state before recording a redemption in `discount_usages`.
- `toggleCampaignStatus` is an admin-only callable for turning campaigns on or off.
- `onNewCampaign` and `sendDiscountReminders` handle discount notifications.

## Scheduled maintenance

- `cleanupExpiredBookingHolds`: expires old holds and releases them from room units.
- `reconcilePendingExternalBookings`: retries `pending_local_sync` orders.
- `cleanupStaleBookingRateLimits`: deletes expired rate-limit documents.
- `cleanupTerminalBookingHolds`: removes old terminal hold records.
- `sendDiscountReminders`: sends periodic reminders for still-eligible discounts.

# Firestore Collections And Their Purpose

- `rooms`: inventory documents for both room categories and camping offers.
- `rooms/{roomId}/units`: individual bookable room units, each with `bookings` and temporary `holds`.
- `users`: public profile data plus registered push tokens.
- `users/{uid}/bookings`: user-facing booking mirror used by the account page.
- `users_private`: private eligibility and lifetime metrics such as order count and account age.
- `orders`: canonical booking records created by Cloud Functions.
- `campaigns`: discount campaign definitions.
- `discount_usages`: redemption ledger for discounts.
- `booking_rate_limits`: anti-abuse counters for booking attempts.
- `booking_holds`: temporary reservation locks and failure/expiry status.

# Notable Observations And Maintenance Notes

- `README.md` is still the default Vite template and does not describe Marina Park.
- `src/App.css` looks like leftover starter CSS and the current app styling lives almost entirely in `src/index.css`.
- Several JSX and JS files display mojibake instead of proper Romanian diacritics in this shell output, which suggests an encoding mismatch worth fixing if the UI also renders incorrectly.
- `src/seed.js`, `src/ensure_bookings_field.js`, and `scripts/test_rules.js` are inconsistent with the current Firestore security rules because client-side writes to protected inventory paths are no longer allowed.
- `capacitor.config.ts` uses a remote server URL, so Android behavior depends on the deployed Vercel site being available.
- This folder is not currently visible to the shell as a Git repository, so Git-based validation is unavailable here.

# File Inventory

## Repository Root

- `.env.example`: template for required booking reCAPTCHA and Firebase App Check environment variables.
- `.env.production`: production environment values for booking reCAPTCHA and Firebase App Check site keys.
- `.gitignore`: root ignore rules for logs, service-account files, build output, editor files, and OS metadata.
- `capacitor.config.ts`: Capacitor app configuration including app id, app name, remote server URL, splash behavior, Google auth provider setup, and push presentation options.
- `eslint.config.js`: flat ESLint configuration for browser JS/JSX files with React Hooks and React Refresh support.
- `firebase-debug.log`: Firebase CLI debug log from a previous local command or deployment attempt.
- `firebase.json`: Firebase project configuration that points Firestore rules/indexes and Cloud Functions source/build steps.
- `firestore.indexes.json`: composite indexes and field index overrides required by Firestore queries used by campaigns and orders.
- `firestore.rules`: Firestore security rules that expose public inventory reads, protect canonical server-owned collections, and allow users to read/update only approved fields in their own profile.
- `index.html`: Vite HTML entrypoint with a custom initial splash screen, viewport fit settings, and a temporary loading indicator before React mounts.
- `package-lock.json`: npm lockfile for the root web application and its exact dependency tree.
- `package.json`: root package manifest for the React/Vite/Capacitor app, including build, lint, preview, deploy, and ship scripts.
- `README.md`: default Vite React README; currently stale relative to the actual Marina Park application.
- `vercel.json`: Vercel routing and cache header configuration, including SPA rewrite to `index.html`.
- `vite.config.js`: minimal Vite configuration enabling the React plugin.

## Shared Static Assets Outside `src/`

- `assets/logo.png`: standalone Marina Park logo asset stored outside the React source tree.

## Public Assets

- `public/marina-park-logo.jpg`: public Marina Park logo image available by direct URL.
- `public/marina-park-logo-transparent.png`: transparent Marina Park logo image for public/static use.
- `public/vite.svg`: default Vite icon still referenced by `index.html` as the favicon.

## Frontend Source: Top-Level Files

- `src/App.css`: leftover starter stylesheet from the original Vite template; not the main styling system for the current app.
- `src/App.jsx`: top-level app component that wires routing, providers, Android back-button behavior, push initialization, and status bar setup.
- `src/ensure_bookings_field.js`: client-side maintenance script that attempts to add missing `bookings` and `unavailableDates` arrays to room units in Firestore.
- `src/firebase.js`: Firebase client initialization for Firestore, Auth, callable Functions, App Check, and offline persistence.
- `src/index.css`: the primary visual system and CSS framework for the app, including room cards, forms, account UI, calendar styling, success screens, and dark mode.
- `src/main.jsx`: React entrypoint that imports global styles, runs Capacitor setup, and mounts the app.
- `src/seed.js`: client-side Firestore seeding helper that writes room and camping documents from the fallback data arrays.
- `src/setupCapacitor.js`: Android-specific Capacitor UI setup for status bar and navigation bar colors.

## Frontend Source: Bundled Assets

- `src/assets/logo.jpg`: bundled logo image available to React imports.
- `src/assets/logo.png`: bundled Marina Park logo used by the header layout.
- `src/assets/react.svg`: leftover starter React logo asset from the original Vite template.

## Frontend Source: Components

- `src/components/BookingCalendar.jsx`: custom `react-day-picker` wrapper that models booking start/end/middle dates, chained bookings, disabled ranges, and room turnover rules.
- `src/components/Button.jsx`: generic button component with primary, secondary, and outline variants.
- `src/components/Layout.jsx`: shared app shell with the sticky top header, logo, account avatar link, routed page outlet, and bottom navbar suppression on booking pages.
- `src/components/Navbar.jsx`: bottom navigation for the rooms and camping sections.
- `src/components/RoomCard.jsx`: interactive inventory card that shows image, price, facilities summary, and optional discount badge, then navigates to booking.
- `src/components/RoomCardSkeleton.jsx`: loading placeholder card shown while room or camping inventory is being fetched.
- `src/components/ScrollReveal.jsx`: intersection-observer-driven reveal wrapper that adds light transform/opacity animation to cards as they enter the viewport.
- `src/components/SuccessModal.jsx`: modal-based success state component with checkmark animation; currently an alternative to the dedicated success page route.

## Frontend Source: Context Providers

- `src/context/AuthContext.jsx`: Firebase auth context with cached user state, email login/register, native Google sign-in, profile updates, logout, Romanian error mapping, and profile persistence to Firestore.
- `src/context/ThemeContext.jsx`: dark mode context that persists the theme in localStorage and toggles a `.dark` class on the document root.

## Frontend Source: Data Access

- `src/data/rooms.js`: room and camping fallback data plus Firestore-backed fetch helpers with simple in-memory caching.
- `src/data/units.js`: Firestore helpers for loading room units, reading unit availability, and deriving fully booked dates across all units.

## Frontend Source: Hooks

- `src/hooks/useLocalCache.js`: localStorage-backed React hook with optional TTL support.
- `src/hooks/useScrollAnimation.js`: intersection observer and parallax hooks for scroll-based animations.

## Frontend Source: Pages

- `src/pages/Account.jsx`: account page for profile display/editing, bookings list, discounts list, password reset flow, support modal, dark mode, and push notification toggle.
- `src/pages/BookingPage.jsx`: room booking page with unit selection, calendar, guest counts, guest details, discount banner, pricing breakdown, and booking submission.
- `src/pages/BookingSuccess.jsx`: animated success route that shows booking summary details and redirects home after a short delay.
- `src/pages/Camping.jsx`: camping inventory listing page using the same room-card presentation pattern as the room listing.
- `src/pages/CampingBookingPage.jsx`: camping booking page with guest counts, personal details, optional license plate, price calculation per person, and booking submission.
- `src/pages/Home.jsx`: home/rooms landing page with the hero section, room listing, discount-aware room cards, and property info banner.
- `src/pages/LoginPage.jsx`: login/register screen supporting email/password auth and native Google sign-in.

## Frontend Source: Services

- `src/services/api.js`: callable Functions client wrapper for booking creation plus user-friendly error mapping for booking failures.
- `src/services/captchaService.js`: loader and executor for invisible Google reCAPTCHA used by guest checkout.
- `src/services/discountService.js`: client helpers for fetching eligible discounts, caching them, filtering them by room, and computing the best price reduction.
- `src/services/pushNotificationService.js`: Capacitor push notification registration, token storage/removal in Firestore, and foreground/tap event listeners.
- `src/services/userService.js`: Firestore helpers for saving public user profiles, loading profiles, and reading a user's booking mirror documents.

## Cloud Functions Workspace

- `functions/.gitignore`: ignore rules for the Firebase Functions workspace.
- `functions/package-lock.json`: npm lockfile for the Cloud Functions package.
- `functions/package.json`: Cloud Functions package manifest, scripts, Node version, and Firebase admin/function dependencies.
- `functions/src/index.ts`: main backend implementation containing booking validation and holds, WordPress provider calls, reconciliation logic, discount evaluation and redemption, campaign status management, push notifications, and scheduled cleanup jobs.
- `functions/tsconfig.json`: TypeScript compiler configuration for the Functions package.

## Operational Scripts

- `scripts/create-campaign.cjs`: interactive CLI for creating Firestore discount campaign documents with rule building, validity dates, room targeting, and IAM-aware Firebase initialization.
- `scripts/migrate-booking-schema-v2.cjs`: admin migration script that normalizes `orders` and `users/{uid}/bookings` documents to the newer booking schema and stores a checkpoint in Firestore.
- `scripts/seed-campaign.cjs`: one-off admin seeding script that creates a sample "new customer" discount campaign.
- `scripts/seed-rooms.js`: admin seeding script that writes room categories, unit subcollections, and camping offers into Firestore.
- `scripts/test_rules.js`: client-SDK script intended to probe Firestore security rules for room-unit access; now partially stale relative to the current no-write rules.
- `scripts/update_facilities.js`: admin script that updates `facilities` arrays on room and camping documents.
- `scripts/wpbc-custom-create-booking.php`: WordPress plugin that exposes an HMAC-protected REST endpoint for creating bookings through WP Booking Calendar.
- `scripts/wpbc-firestore-sync-robust-delete.php`: WordPress plugin that syncs booking creation, approval status, deletion/trash behavior, user booking mirrors, and Firestore room availability with robust retry logic.

## Repo-Local Codex Skills

- `skills/model-router/SKILL.md`: local Codex skill instructions for choosing the best model and reasoning effort for a task.
- `skills/model-router/agents/openai.yaml`: agent metadata/config for the `model-router` skill.
- `skills/progress-md-memory/SKILL.md`: local Codex skill instructions for keeping repository progress in `progress.md`.
- `skills/progress-md-memory/agents/openai.yaml`: agent metadata/config for the `progress-md-memory` skill.
- `skills/wpbooking-vite-react/SKILL.md`: local Codex skill instructions oriented around Vite/React plus WordPress/WP Booking integrations.
- `skills/wpbooking-vite-react/agents/openai.yaml`: agent metadata/config for the `wpbooking-vite-react` skill.

## Android Wrapper: Root Files

- `android/.gitignore`: Android workspace ignore rules.
- `android/build.gradle`: top-level Android Gradle build file with plugin classpaths and shared Java compile settings.
- `android/capacitor.settings.gradle`: generated Capacitor plugin include list for Android modules used by the app.
- `android/gradle.properties`: project-wide Gradle settings and AndroidX enablement.
- `android/gradle/wrapper/gradle-wrapper.jar`: Gradle wrapper bootstrap binary checked into the Android project.
- `android/gradle/wrapper/gradle-wrapper.properties`: Gradle wrapper download and distribution configuration.
- `android/gradlew`: Unix shell wrapper for running Gradle in the Android project.
- `android/gradlew.bat`: Windows batch wrapper for running Gradle in the Android project.
- `android/settings.gradle`: Android module settings file including the app module and Capacitor plugin modules.
- `android/variables.gradle`: shared Android SDK and dependency version variables.

## Android Wrapper: App Module

- `android/app/.gitignore`: app-module-specific ignore rules.
- `android/app/build.gradle`: Android application module configuration, dependencies, versioning, and optional Google Services plugin application.
- `android/app/capacitor.build.gradle`: generated Capacitor Android dependency wiring for Firebase auth, app, push, splash, status bar, and navigation bar plugins.
- `android/app/google-services.json`: Firebase Android app configuration required for native Firebase services such as push notifications.
- `android/app/proguard-rules.pro`: ProGuard/R8 rules placeholder for release builds.

## Android Wrapper: Tests

- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`: default generated Android instrumentation test.
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`: default generated Android local unit test.

## Android Wrapper: Main Source And Manifest

- `android/app/src/main/AndroidManifest.xml`: Android manifest declaring the Capacitor activity, FileProvider, and required permissions such as internet and notifications.
- `android/app/src/main/java/com/myapp/android/MainActivity.java`: Android entry activity extending Capacitor's `BridgeActivity`.

## Android Wrapper: Layout, XML, And Values Resources

- `android/app/src/main/res/drawable/ic_launcher_background.xml`: vector background resource used by the launcher icon setup.
- `android/app/src/main/res/drawable/splash.png`: default splash bitmap used by the Android app launch theme.
- `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`: adaptive launcher icon foreground vector for newer Android versions.
- `android/app/src/main/res/layout/activity_main.xml`: layout hosting the Capacitor `WebView`.
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`: adaptive launcher icon definition for API 26+.
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`: round adaptive launcher icon definition for API 26+.
- `android/app/src/main/res/values/ic_launcher_background.xml`: color resource backing the adaptive launcher icon background.
- `android/app/src/main/res/values/strings.xml`: Android string resources for app name, activity title, package name, and custom URL scheme.
- `android/app/src/main/res/values/styles.xml`: Android theme definitions for the main app and splash launch theme.
- `android/app/src/main/res/xml/file_paths.xml`: FileProvider path configuration for external and cache file sharing.

## Android Wrapper: Splash Screen Bitmaps

- `android/app/src/main/res/drawable-land-hdpi/splash.png`: landscape splash image for hdpi devices.
- `android/app/src/main/res/drawable-land-ldpi/splash.png`: landscape splash image for ldpi devices.
- `android/app/src/main/res/drawable-land-mdpi/splash.png`: landscape splash image for mdpi devices.
- `android/app/src/main/res/drawable-land-night-hdpi/splash.png`: landscape night-mode splash image for hdpi devices.
- `android/app/src/main/res/drawable-land-night-ldpi/splash.png`: landscape night-mode splash image for ldpi devices.
- `android/app/src/main/res/drawable-land-night-mdpi/splash.png`: landscape night-mode splash image for mdpi devices.
- `android/app/src/main/res/drawable-land-night-xhdpi/splash.png`: landscape night-mode splash image for xhdpi devices.
- `android/app/src/main/res/drawable-land-night-xxhdpi/splash.png`: landscape night-mode splash image for xxhdpi devices.
- `android/app/src/main/res/drawable-land-night-xxxhdpi/splash.png`: landscape night-mode splash image for xxxhdpi devices.
- `android/app/src/main/res/drawable-land-xhdpi/splash.png`: landscape splash image for xhdpi devices.
- `android/app/src/main/res/drawable-land-xxhdpi/splash.png`: landscape splash image for xxhdpi devices.
- `android/app/src/main/res/drawable-land-xxxhdpi/splash.png`: landscape splash image for xxxhdpi devices.
- `android/app/src/main/res/drawable-night/splash.png`: default night-mode splash bitmap.
- `android/app/src/main/res/drawable-port-hdpi/splash.png`: portrait splash image for hdpi devices.
- `android/app/src/main/res/drawable-port-ldpi/splash.png`: portrait splash image for ldpi devices.
- `android/app/src/main/res/drawable-port-mdpi/splash.png`: portrait splash image for mdpi devices.
- `android/app/src/main/res/drawable-port-night-hdpi/splash.png`: portrait night-mode splash image for hdpi devices.
- `android/app/src/main/res/drawable-port-night-ldpi/splash.png`: portrait night-mode splash image for ldpi devices.
- `android/app/src/main/res/drawable-port-night-mdpi/splash.png`: portrait night-mode splash image for mdpi devices.
- `android/app/src/main/res/drawable-port-night-xhdpi/splash.png`: portrait night-mode splash image for xhdpi devices.
- `android/app/src/main/res/drawable-port-night-xxhdpi/splash.png`: portrait night-mode splash image for xxhdpi devices.
- `android/app/src/main/res/drawable-port-night-xxxhdpi/splash.png`: portrait night-mode splash image for xxxhdpi devices.
- `android/app/src/main/res/drawable-port-xhdpi/splash.png`: portrait splash image for xhdpi devices.
- `android/app/src/main/res/drawable-port-xxhdpi/splash.png`: portrait splash image for xxhdpi devices.
- `android/app/src/main/res/drawable-port-xxxhdpi/splash.png`: portrait splash image for xxxhdpi devices.

## Android Wrapper: Launcher Icon Bitmaps

- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`: launcher icon bitmap for hdpi devices.
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_background.png`: adaptive launcher icon background bitmap for hdpi devices.
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png`: adaptive launcher icon foreground bitmap for hdpi devices.
- `android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png`: round launcher icon bitmap for hdpi devices.
- `android/app/src/main/res/mipmap-ldpi/ic_launcher.png`: launcher icon bitmap for ldpi devices.
- `android/app/src/main/res/mipmap-ldpi/ic_launcher_background.png`: adaptive launcher icon background bitmap for ldpi devices.
- `android/app/src/main/res/mipmap-ldpi/ic_launcher_foreground.png`: adaptive launcher icon foreground bitmap for ldpi devices.
- `android/app/src/main/res/mipmap-ldpi/ic_launcher_round.png`: round launcher icon bitmap for ldpi devices.
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`: launcher icon bitmap for mdpi devices.
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_background.png`: adaptive launcher icon background bitmap for mdpi devices.
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png`: adaptive launcher icon foreground bitmap for mdpi devices.
- `android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png`: round launcher icon bitmap for mdpi devices.
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`: launcher icon bitmap for xhdpi devices.
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_background.png`: adaptive launcher icon background bitmap for xhdpi devices.
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png`: adaptive launcher icon foreground bitmap for xhdpi devices.
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png`: round launcher icon bitmap for xhdpi devices.
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`: launcher icon bitmap for xxhdpi devices.
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png`: adaptive launcher icon background bitmap for xxhdpi devices.
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png`: adaptive launcher icon foreground bitmap for xxhdpi devices.
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png`: round launcher icon bitmap for xxhdpi devices.
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`: launcher icon bitmap for xxxhdpi devices.
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_background.png`: adaptive launcher icon background bitmap for xxxhdpi devices.
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`: adaptive launcher icon foreground bitmap for xxxhdpi devices.
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png`: round launcher icon bitmap for xxxhdpi devices.
