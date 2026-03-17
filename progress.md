# Current Task
- Hybrid pricing system implemented and verified

# Recent Changes
- `src/services/pricingService.js` (NEW): Core pricing utility with `resolvePrice()`, `fetchMonthlyOverrides()`, `calculateRangeTotal()`, `resolveTodayPrice()`, `ensureOverridesForMonths()`, `buildDayPricesMap()`. Session-caches monthly override docs.
- `src/components/BookingCalendar.jsx`: Added `dayPrices` Map prop, `onMonthChange` callback, and custom `PricedDayContent` component showing price below each day number. Override days get amber dot indicator. Day cells grow taller when pricing is active.
- `src/components/RoomCard.jsx`: Now accepts `todayPrice` prop. Displays numeric resolved price instead of flat string. Shows optional seasonal label badge.
- `src/pages/BookingPage.jsx`: Integrated pricing service. Fetches monthly overrides on mount and month change. Builds `dayPrices` map for calendar. Calculates `rangeBreakdown` for itemized price breakdown card. Bottom bar shows dynamic total with discount support.
- `src/pages/CampingBookingPage.jsx`: Same pricing integration as BookingPage but with per-person multiplier (total = sum(nightly prices) × totalGuests).
- `src/pages/Home.jsx`: Resolves today's price for each room via `resolveTodayPrice()` and passes to `RoomCard`.
- `src/pages/Camping.jsx`: Same today-price resolution as Home.
- `src/pages/AdminPricing.jsx` (NEW): Admin panel at `/admin/pricing` behind `admin` custom claim. Two sections: seasonal pricing rules editor and per-day override manager.
- `src/App.jsx`: Added lazy-loaded `AdminPricing` route.
- `src/data/rooms.js`: Added `basePrice` (numeric) and `pricingRules: []` to all static fallback objects.
- `firestore.rules`: Added `rooms/{roomId}/pricing/{monthDoc}` subcollection — public read, admin-only write. Added admin update rule on room documents.
- `src/index.css`: Added CSS for pricing day tiles, override indicator, season badge, itemized breakdown card, admin panel components (light + dark mode).

# Validation
- `npm run build`: ✓ 2714 modules, built in 5.57s, no errors
- Firestore rules validation: ✓ No errors detected

# Next Steps
- Deploy to staging and test with real Firestore data (room docs with `basePrice`, `pricingRules`, monthly override docs)
- Set `admin` custom claim on admin user accounts to enable admin pricing panel
- Add `basePrice` and `pricingRules` fields to existing Firestore room documents
