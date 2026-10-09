// Usage, from backend/trunida-backend:
//   node scripts/app-checks/send_sample_app_events.mjs <application url> <key> [--dry]
//
// Sample EdTech activity for a demo of the "Your app" card: forty teachers in
// six schools using a classroom app over the last ninety days, in Segment's
// shape. Ten of them follow the pattern a retention application should see:
// they open the app less, stop creating lessons, and then cancel. Every name
// and school is invented; nothing here is any customer's data.
//
// The key is the one the Data page shows on the Your app card. --dry prints
// the first few messages and sends nothing.
const [url, key] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry');
if (!dry && (!url || !key)) {
  console.error('Give the application address and the key from its Data page (or --dry).');
  process.exit(1);
}

const DAY = 86400000;
const NOW = Date.now();
const SCHOOLS = ['Hillview School', 'Riverside Academy', 'Lotus Public School', 'Greenfield High', 'Sunrise Learning Centre', 'Maple Grove School'];
const FIRST = ['Asha', 'Ravi', 'Meera', 'Arjun', 'Divya', 'Karthik', 'Nisha', 'Vikram', 'Priya', 'Sanjay'];
const LAST = ['Rao', 'Iyer', 'Menon', 'Shah', 'Nair', 'Gupta', 'Das', 'Pillai'];

let seed = 11;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (list) => list[Math.floor(rand() * list.length)];

const messages = [];
for (let i = 0; i < 40; i++) {
  const userId = `teacher-${String(i + 1).padStart(3, '0')}`;
  const leaves = i < 10;
  const school = SCHOOLS[i % SCHOOLS.length];
  const plan = rand() < 0.4 ? 'pro' : 'free';
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  messages.push({ type: 'identify', userId, traits: { name, email: `${userId}@example.edu`, school, plan } });
  const quitAt = leaves ? NOW - (5 + Math.floor(rand() * 25)) * DAY : NOW;
  for (let t = NOW - 90 * DAY; t < quitAt; t += DAY) {
    // The ones who leave fade over their last three weeks before they go.
    const fading = leaves && quitAt - t < 21 * DAY;
    if (rand() < (fading ? 0.15 : 0.7)) {
      messages.push({ type: 'track', userId, event: 'App Opened', timestamp: new Date(t + 8 * 3600000).toISOString(), messageId: `${userId}-open-${t}`, properties: { school } });
    }
    if (!fading && rand() < 0.3) {
      messages.push({ type: 'track', userId, event: 'Lesson Created', timestamp: new Date(t + 9 * 3600000).toISOString(), messageId: `${userId}-lesson-${t}`, properties: { school } });
    }
  }
  if (leaves) {
    messages.push({ type: 'track', userId, event: 'Subscription Cancelled', timestamp: new Date(quitAt).toISOString(), messageId: `${userId}-cancel`, properties: { school, plan, status: 'cancelled' } });
  }
}

if (dry) {
  console.log(JSON.stringify(messages.slice(0, 4), null, 2));
  console.log(`${messages.length} messages in all.`);
  process.exit(0);
}

const endpoint = url.replace(/\/+$/, '') + '/api/app-events/batch';
let accepted = 0;
let rejected = 0;
for (let i = 0; i < messages.length; i += 500) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: messages.slice(i, i + 500) }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`Refused (${r.status}):`, body.error || body); process.exit(1); }
  accepted += body.accepted || 0;
  rejected += body.rejected || 0;
}
console.log(`Sent ${messages.length}: ${accepted} accepted, ${rejected} refused. They land on App Activity within seconds.`);
