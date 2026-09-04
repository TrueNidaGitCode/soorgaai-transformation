/**
 * Cob was attaching "Approve this use case" to every reply, including plain
 * answers to questions. An action on every message reads as a button that has
 * stopped meaning anything.
 *
 * Questions must get NO action. Decisions must still get one — a chat that
 * never offers the action is as broken as one that always does.
 *
 *   node scripts/test_chat_actions.mjs
 */
import 'dotenv/config';
import { askScreenChat } from '../services/screenChatService.js';

const CONTEXT = {
  objective: 'We build academy management software for classical music, dance and art schools.',
  recommended: 'Attendance and fee administration assistant',
  others: ['Student attrition early warning', 'Automated parent communication'],
  approved: false,
};

const NO_ACTION = [
  'What does this use case actually involve?',
  'Why did you recommend this one over the others?',
  'How long would this take to implement?',
  'What data would we need for it?',
  'Tell me more about the attrition option.',
];

const EXPECT_ACTION = [
  "Let's go with the recommended one.",
  'I want to approve this use case and move on.',
  'That sounds right — how do I proceed?',
];

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

console.log('1. questions get NO action');
for (const message of NO_ACTION) {
  const r = await askScreenChat({ screen: 'cob', context: CONTEXT, message });
  check(JSON.stringify(message.slice(0, 46)), !r.action, r.action ? `offered "${r.action.label}"` : '');
}

console.log('\n2. decisions still get one');
for (const message of EXPECT_ACTION) {
  const r = await askScreenChat({ screen: 'cob', context: CONTEXT, message });
  check(JSON.stringify(message.slice(0, 46)), !!r.action, r.action ? r.action.label : 'offered nothing');
}

console.log('\n3. an already-approved blueprint never offers it');
{
  const r = await askScreenChat({
    screen: 'cob', context: { ...CONTEXT, approved: true },
    message: "Let's go with the recommended one.",
  });
  check('suppressed when already approved', !r.action, r.action ? `offered "${r.action.label}"` : '');
}

console.log(pass ? '\nPASS' : '\nFAILED');
process.exit(pass ? 0 : 1);
