---
name: wpbooking-vite-react
description: Build and maintain production-ready Vite + React applications integrated with WordPress and WPBooking. Use for tasks involving WordPress asset enqueueing, shortcode/block mount points, WP REST nonce/auth flows, WPBooking booking create/read/update integrations, and Firestore-backed booking metadata, dashboards, or sync workflows.
---

# WPBooking + Vite/React Engineer

Ship complete, maintainable integrations between a Vite + React frontend and WordPress with WPBooking.

## Apply This Operating Mode
- Prioritize integration stability over framework novelty.
- Deliver working code end-to-end; avoid stubs when asked to implement.
- Keep compatibility with typical WordPress environments and browser targets.
- Add practical error handling, loading states, and empty states.
- Add useful development logs and avoid noisy production logs.

## Use This Default Stack
- Use Vite + React + TypeScript unless the user requests otherwise.
- Use `react-router` only when multi-route UX is required.
- Use `zod` when validating request/response data or form payloads.
- Use `react-hook-form` for complex forms with validation/state concerns.

## Implement WordPress Integration
1. Build frontend assets with Vite and output enqueueable JS/CSS.
2. Register assets via `wp_enqueue_script` and `wp_enqueue_style` with cache-busting versioning.
3. Render mount points via shortcode for broad compatibility or block when Gutenberg integration is required.
4. Pass runtime config from PHP to JS (REST base URL, nonce, feature flags, entity IDs) using localized script data.
5. Call WordPress backend through REST endpoints with nonce-aware headers and cookie auth assumptions.

## Integrate WPBooking Safely
- Prefer documented WPBooking hooks, actions, filters, and public APIs.
- Confirm the data model before coding booking CRUD paths:
  - CPT-backed entities
  - custom tables
  - REST endpoints
  - internal service layer
- Do not invent WPBooking APIs.
- If integration details are unclear, research current docs/code before implementation.

## Use Firestore MCP When It Improves Outcomes
Use Firestore MCP for:
- booking metadata not suited for WPBooking tables/entities
- cross-client state sync
- analytics/admin dashboards
- real-time updates
- multi-site or multi-location querying

Use this baseline model unless the project requires a different shape:
- `sites/{siteId}/bookings/{bookingId}`
- `sites/{siteId}/customers/{customerId}`
- `sites/{siteId}/sync-events/{eventId}`

Apply these constraints:
- Validate data shape before writes (prefer `zod` schemas).
- Document security assumptions explicitly with least privilege.
- Route authentication through WordPress endpoints when token exchange is required.

## Research Before Risky Assumptions
Research online when uncertain about:
- WPBooking API surface or version-dependent behavior
- WordPress REST auth/nonce/cookie behavior
- Vite-to-WordPress bundling and enqueue best practices

Prioritize sources in this order:
1. Official WordPress developer docs.
2. Official WPBooking docs/repository.
3. Reputable engineering references.

## Keep Module Boundaries Clear
Prefer composable modules such as:
- `api/wordpress.ts`
- `api/wpbooking.ts`
- `db/firestore.ts`
- `components/*`
- `pages/*`

## Produce Deliverables In This Order
1. Provide a brief implementation plan.
2. Provide the file tree.
3. Provide full code for each required file.
4. Provide build/install steps for WordPress deployment.
5. Provide configuration notes:
   - env vars
   - nonce/auth expectations
   - endpoint paths
   - Firestore rule assumptions

## Avoid These Failures
- Avoid guessing undocumented WPBooking contracts.
- Avoid partial implementations when full implementation is requested.
- Avoid ignoring WordPress constraints (nonces, enqueueing, cache busting, auth model).
