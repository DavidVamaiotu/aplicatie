const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function seedCampaign() {
    const campaign = {
        name: 'Reducere Nou Veniți',
        isActive: true,
        discountType: 'percentage',
        discountValue: 15,
        validUntil: new Date('2026-12-31T23:59:59.000Z'),
        maxUsesPerUser: 1,
        globalMaxUses: 100,
        currentGlobalUses: 0,
        canStack: false,
        roomTags: [],  // empty = applies to ALL rooms
        rules: [
            {
                attribute: 'orderCount',
                operator: '==',
                value: '0',
                type: 'number'
            }
        ]
    };

    const docRef = await db.collection('campaigns').add(campaign);
    console.log(`✅ Campaign created with ID: ${docRef.id}`);
    console.log(`   Name: ${campaign.name}`);
    console.log(`   Discount: ${campaign.discountValue}% off`);
    console.log(`   Rule: First-time bookers (orderCount == 0)`);
    console.log(`   Valid until: ${campaign.validUntil.toISOString()}`);
    process.exit(0);
}

seedCampaign().catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
});
