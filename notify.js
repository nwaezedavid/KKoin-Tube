import { Telegraf } from 'telegraf';
import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- 1. INITIALIZE SERVICES ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL; // Get app URL for the button
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

if (!BOT_TOKEN || !serviceAccountBase64 || !MINI_APP_URL) {
  console.error('Missing one or more required environment variables (BOT_TOKEN, FIREBASE_SERVICE_ACCOUNT_BASE64, MINI_APP_URL).');
  process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('ascii'));

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();
const bot = new Telegraf(BOT_TOKEN);

// --- 2. DEFINE THE NOTIFICATION MESSAGE ---
const message = "👋 Good morning! ☀️\n\nDon't forget to watch your ads and earn Kkoin today. Your next reward is waiting!";

// The button to send with the message
const keyboard = {
  inline_keyboard: [
    [
      { text: '🚀 Open App & Earn', web_app: { url: MINI_APP_URL } }
    ]
  ]
};

// --- 3. ASYNC SENDER FUNCTION ---
async function sendNotifications() {
  console.log('Starting daily notification broadcast...');
  const subscribersRef = db.collection('daily_subscribers');
  const snapshot = await subscribersRef.get();

  if (snapshot.empty) {
    console.log('No subscribers found. Exiting.');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  // Create a list of promises to send all messages
  const sendPromises = snapshot.docs.map(doc => {
    const chat_id = doc.data().chatId;
    if (!chat_id) return Promise.resolve(); // Skip if no chat_id

    return bot.telegram.sendMessage(chat_id, message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown' // Note: This is Markdown, but the message has no special chars
    })
    .then(() => {
      successCount++;
      console.log(`Message sent to ${chat_id}`);
    })
    .catch(error => {
      // This happens if the user blocked the bot
      errorCount++;
      console.warn(`Failed to send to ${chat_id}: ${error.description}`);
      if (error.code === 403) {
        // Optional: User blocked the bot, remove them from the list
        // doc.ref.delete();
      }
    });
  });

  // Wait for all messages to be sent
  await Promise.all(sendPromises);

  console.log('--- Broadcast Complete ---');
  console.log(`Successful messages: ${successCount}`);
  console.log(`Failed messages (user blocked): ${errorCount}`);
}

// --- 4. RUN THE FUNCTION ---
sendNotifications().then(() => {
  console.log('Script finished.');
  process.exit(0); // Exit successfully
}).catch(error => {
  console.error('A critical error occurred:', error);
  process.exit(1); // Exit with failure
});