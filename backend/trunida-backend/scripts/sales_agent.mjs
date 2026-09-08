/**
 * Svarg — the sales signal agent, at the terminal
 *
 * The same board the admin screen shows, for when you are on a call and do not
 * want a browser. All the logic lives in services/salesSignalsService.js so the
 * two can never disagree — see that file for what each signal means.
 *
 *   node scripts/sales_agent.mjs                    the board
 *   node scripts/sales_agent.mjs "who do I call?"   one answer
 *   node scripts/sales_agent.mjs --chat             keep asking
 *
 * Read-only.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import readline from 'node:readline/promises';

import { collectSignals, renderBoard, askBoard } from '../services/salesSignalsService.js';

await mongoose.connect(process.env.MONGO_URI);

const args = process.argv.slice(2);
const chat = args.includes('--chat');
const question = args.filter(a => a !== '--chat').join(' ').trim();

const board = renderBoard(await collectSignals());
console.log(board);

if (question) {
  console.log(`\n${'─'.repeat(70)}\n`);
  console.log(await askBoard(board, question));
}

if (chat) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n${'─'.repeat(70)}\nAsk about the board. Blank line to exit.\n`);
  for (;;) {
    const q = (await rl.question('> ')).trim();
    if (!q) break;
    try {
      console.log(`\n${await askBoard(board, q)}\n`);
    } catch (err) {
      console.error(`  (failed: ${err.message})\n`);
    }
  }
  rl.close();
}

await mongoose.disconnect();
