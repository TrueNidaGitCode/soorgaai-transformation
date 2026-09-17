/** Is the provider answering, and if not, what does it say? One tiny call. */
import 'dotenv/config';
const key = process.env.GOOGLE_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the word ok.' }] }],
      generationConfig: { maxOutputTokens: 5 } }) });
const body = await res.text();
console.log(`model  ${model}`);
console.log(`HTTP   ${res.status}`);
console.log(body.slice(0, 600));
