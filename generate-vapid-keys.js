// Generate VAPID keys for Web Push
// Run this file once: node generate-vapid-keys.js

const webpush = require('web-push');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Generated VAPID Keys:');
console.log('=====================\n');
console.log('Public Key (share with client):');
console.log(vapidKeys.publicKey);
console.log('\nPrivate Key (KEEP SECRET - add to .env.local):');
console.log(vapidKeys.privateKey);
console.log('\n=====================');
console.log('Add these to your .env.local file:');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_EMAIL=mailto:your-email@example.com`);
