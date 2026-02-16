#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║           Marina Park — Campaign Creator CLI              ║
 * ║   Interactive tool for creating discount campaigns        ║
 * ╚═══════════════════════════════════════════════════════════╝
 *
 * Usage:  node scripts/create-campaign.cjs
 *
 * Uses the firebase-tools login credentials (from `firebase login`)
 * so no separate service account permissions are needed.
 */

const admin = require('firebase-admin');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

// ── Firebase Init ──────────────────────────────────────────────────────────
// Read the refresh token from firebase-tools config to get a valid credential
const FIREBASE_CONFIG_PATH = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.config', 'configstore', 'firebase-tools.json'
);

function initFirebase() {
    // Strategy 1: Use GOOGLE_APPLICATION_CREDENTIALS env var
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({ projectId: 'marina-park-booking-app' });
        return admin.firestore();
    }

    // Strategy 2: Use firebase-tools refresh token
    let refreshToken = null;
    try {
        const config = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf8'));
        refreshToken = config.tokens?.refresh_token;
    } catch { }

    if (refreshToken) {
        const credential = admin.credential.refreshToken({
            type: 'authorized_user',
            client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
            client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
            refresh_token: refreshToken,
        });
        admin.initializeApp({ credential, projectId: 'marina-park-booking-app' });
        return admin.firestore();
    }

    // Strategy 3: Try service account
    try {
        const serviceAccount = require('../service-account.json');
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        return admin.firestore();
    } catch { }

    // Strategy 4: Application default credentials
    admin.initializeApp({ projectId: 'marina-park-booking-app' });
    return admin.firestore();
}

const db = initFirebase();

// ── Room catalog (keep in sync with src/data/rooms.js) ─────────────────────
const ROOMS = [
    { id: 1, name: 'Camera Dubla' },
    { id: 2, name: 'Camera Cvadrupla' },
    { id: 3, name: 'Camera dubla in Bungalow' },
    { id: 4, name: 'Camera dubla in Bungalow Superior' },
    { id: 101, name: 'Loc de campare' },
];

// ── Readline helpers ───────────────────────────────────────────────────────
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question, defaultVal) {
    const suffix = defaultVal !== undefined ? ` [${defaultVal}]` : '';
    return new Promise((resolve) => {
        rl.question(`  ${question}${suffix}: `, (answer) => {
            resolve(answer.trim() || (defaultVal !== undefined ? String(defaultVal) : ''));
        });
    });
}

function confirm(question) {
    return new Promise((resolve) => {
        rl.question(`  ${question} (y/n) [y]: `, (answer) => {
            resolve(!answer.trim() || answer.trim().toLowerCase() === 'y');
        });
    });
}

// ── Pretty print ───────────────────────────────────────────────────────────
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function header(text) {
    console.log();
    console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${BOLD}${GREEN}  ${text}${RESET}`);
    console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log();
}

function section(text) {
    console.log(`\n${CYAN}▸ ${text}${RESET}`);
}

// ── Date helpers ───────────────────────────────────────────────────────────
function parseDate(str) {
    // Accept DD.MM.YYYY or DD/MM/YYYY or YYYY-MM-DD
    let match = str.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (match) {
        const [, d, m, y] = match;
        return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T23:59:59.000Z`);
    }
    match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
        return new Date(`${str}T23:59:59.000Z`);
    }
    return null;
}

function formatDate(date) {
    return date.toLocaleDateString('ro-RO', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

// ── Rule builder ───────────────────────────────────────────────────────────
async function buildRules() {
    const rules = [];
    section('Campaign Rules (who qualifies)');
    console.log(`${DIM}  Rules decide which users are eligible.`);
    console.log(`  All rules must pass (AND logic).`);
    console.log(`  Leave blank to skip — no rules = everyone qualifies.${RESET}\n`);

    const addRules = await confirm('Add eligibility rules?');
    if (!addRules) return rules;

    while (true) {
        console.log(`\n${DIM}  Available rule types:${RESET}`);
        console.log(`    1. ${BOLD}orderCount${RESET}  — number of past bookings ${DIM}(e.g. orderCount == 0 → first-timers)${RESET}`);
        console.log(`    2. ${BOLD}accountAge${RESET}  — days since account was created ${DIM}(uses date_math)${RESET}`);
        console.log(`    3. ${BOLD}custom${RESET}      — any user profile field`);
        console.log();

        const choice = await ask('Rule type (1/2/3 or empty to finish)');
        if (!choice) break;

        let rule;
        switch (choice) {
            case '1': {
                const op = await ask('Operator (==, !=, >, <, >=, <=)', '==');
                const val = await ask('Order count value', '0');
                rule = { attribute: 'orderCount', operator: op, value: val, type: 'number' };
                break;
            }
            case '2': {
                console.log(`${DIM}  Compare accountCreatedAt against X_days_ago${RESET}`);
                const op = await ask('Operator (< means "created before X days ago")', '<');
                const days = await ask('Days ago', '30');
                rule = { attribute: 'accountCreatedAt', operator: op, value: `${days}_days_ago`, type: 'date_math' };
                break;
            }
            case '3': {
                const attr = await ask('Field name (from user profile)');
                const type = await ask('Type (number/boolean/string/date_math)', 'string');
                const op = await ask('Operator (==, !=, >, <, >=, <=)', '==');
                const val = await ask('Target value');
                rule = { attribute: attr, operator: op, value: val, type: type };
                break;
            }
            default:
                console.log(`${YELLOW}  ⚠ Invalid choice, try again.${RESET}`);
                continue;
        }

        rules.push(rule);
        console.log(`${GREEN}  ✓ Rule added: ${rule.attribute} ${rule.operator} ${rule.value} (${rule.type})${RESET}`);

        const more = await confirm('Add another rule?');
        if (!more) break;
    }

    return rules;
}

// ── Room selector ──────────────────────────────────────────────────────────
async function selectRooms() {
    section('Room Targeting');
    console.log(`${DIM}  Choose which rooms this discount applies to.`);
    console.log(`  Leave empty for ALL rooms.${RESET}\n`);

    console.log('  Available rooms:');
    ROOMS.forEach((r) => {
        console.log(`    ${BOLD}${r.id}${RESET} — ${r.name}`);
    });
    console.log();

    const input = await ask('Room IDs (comma-separated, or empty for ALL)');
    if (!input) return [];

    const ids = input.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    const valid = ids.filter((id) => ROOMS.some((r) => r.id === id));

    if (valid.length === 0) {
        console.log(`${YELLOW}  ⚠ No valid room IDs provided. Applying to ALL rooms.${RESET}`);
        return [];
    }

    const names = valid.map((id) => ROOMS.find((r) => r.id === id).name);
    console.log(`${GREEN}  ✓ Targeting: ${names.join(', ')}${RESET}`);
    return valid;
}

// ── Main flow ──────────────────────────────────────────────────────────────
async function main() {
    header('Marina Park — Campaign Creator');

    // ─── Basic info ────────────────────────────────────────────────────
    section('Basic Information');
    const name = await ask('Campaign name', 'Reducere Sezon');

    const discountType = await ask('Discount type (percentage / fixed)', 'percentage');
    const discountValue = parseFloat(await ask(
        discountType === 'percentage' ? 'Discount percentage (e.g. 15)' : 'Discount amount in RON (e.g. 50)',
        '15'
    ));

    // ─── Validity dates ───────────────────────────────────────────────
    section('Validity Period');
    console.log(`${DIM}  Format: DD.MM.YYYY or YYYY-MM-DD${RESET}`);

    let validFrom = null;
    const validFromStr = await ask('Valid from (empty = immediately)');
    if (validFromStr) {
        validFrom = parseDate(validFromStr);
        if (!validFrom) {
            console.log(`${YELLOW}  ⚠ Could not parse date, skipping "valid from".${RESET}`);
        } else {
            // Set to start of day
            validFrom = new Date(validFrom.getTime());
            validFrom.setUTCHours(0, 0, 0, 0);
            console.log(`${GREEN}  ✓ Valid from: ${formatDate(validFrom)}${RESET}`);
        }
    }

    let validUntil = null;
    const defaultEnd = new Date();
    defaultEnd.setFullYear(defaultEnd.getFullYear() + 1);
    const validUntilStr = await ask('Valid until', `31.12.${defaultEnd.getFullYear()}`);
    validUntil = parseDate(validUntilStr);
    if (!validUntil) {
        console.log(`${YELLOW}  ⚠ Could not parse date, using 1 year from now.${RESET}`);
        validUntil = defaultEnd;
    }
    console.log(`${GREEN}  ✓ Valid until: ${formatDate(validUntil)}${RESET}`);

    // ─── Usage limits ─────────────────────────────────────────────────
    section('Usage Limits');
    const maxUsesPerUser = parseInt(await ask('Max uses per user (0 = unlimited)', '1'), 10);
    const globalMaxUses = parseInt(await ask('Global max uses (0 = unlimited)', '100'), 10);
    const canStack = await confirm('Can this discount stack with others?');

    // ─── Room targeting ───────────────────────────────────────────────
    const roomTags = await selectRooms();

    // ─── Rules ────────────────────────────────────────────────────────
    const rules = await buildRules();

    // ─── Summary ──────────────────────────────────────────────────────
    header('Campaign Preview');

    const campaign = {
        name,
        isActive: true,
        discountType,
        discountValue,
        validUntil: admin.firestore.Timestamp.fromDate(validUntil),
        ...(validFrom && { validFrom: admin.firestore.Timestamp.fromDate(validFrom) }),
        maxUsesPerUser,
        globalMaxUses,
        currentGlobalUses: 0,
        canStack,
        roomTags,
        rules,
    };

    console.log(`  ${BOLD}Name:${RESET}           ${campaign.name}`);
    console.log(`  ${BOLD}Discount:${RESET}       ${discountType === 'percentage' ? `-${discountValue}%` : `-${discountValue} RON`}`);
    if (validFrom) {
        console.log(`  ${BOLD}Valid from:${RESET}    ${formatDate(validFrom)}`);
    }
    console.log(`  ${BOLD}Valid until:${RESET}     ${formatDate(validUntil)}`);
    console.log(`  ${BOLD}Per user:${RESET}       ${maxUsesPerUser === 0 ? 'unlimited' : `${maxUsesPerUser} use(s)`}`);
    console.log(`  ${BOLD}Global limit:${RESET}   ${globalMaxUses === 0 ? 'unlimited' : `${globalMaxUses} use(s)`}`);
    console.log(`  ${BOLD}Stackable:${RESET}      ${canStack ? 'yes' : 'no'}`);
    console.log(`  ${BOLD}Rooms:${RESET}          ${roomTags.length === 0 ? 'ALL rooms' : roomTags.map((id) => ROOMS.find((r) => r.id === id)?.name || id).join(', ')}`);
    console.log(`  ${BOLD}Rules:${RESET}          ${rules.length === 0 ? 'none (everyone qualifies)' : `${rules.length} rule(s)`}`);
    rules.forEach((r, i) => {
        console.log(`${DIM}    ${i + 1}. ${r.attribute} ${r.operator} ${r.value} (${r.type})${RESET}`);
    });
    console.log();

    // ─── Confirm & create ─────────────────────────────────────────────
    const go = await confirm('Create this campaign?');
    if (!go) {
        console.log(`\n${YELLOW}  ✗ Cancelled.${RESET}\n`);
        rl.close();
        process.exit(0);
    }

    try {
        const docRef = await db.collection('campaigns').add(campaign);
        console.log(`\n${GREEN}  ✅ Campaign created!${RESET}`);
        console.log(`${DIM}  Document ID: ${docRef.id}${RESET}`);
        console.log(`${DIM}  View at: https://console.firebase.google.com/project/marina-park-booking-app/firestore/databases/-default-/data/campaigns/${docRef.id}${RESET}\n`);
    } catch (err) {
        console.error(`\n${YELLOW}  ❌ Error: ${err.message}${RESET}\n`);
    }

    rl.close();
    process.exit(0);
}

main();
