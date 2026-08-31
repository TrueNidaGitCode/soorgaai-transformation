/**
 * Asserts the safety barrier between model output and a real side effect:
 * splitAction (does the ACTION marker leak into user-visible text?) and
 * validateAction (can an off-whitelist or stale action survive?).
 *
 * Run: node scripts/test_screen_chat_actions.mjs   (from backend/trunida-backend)
 */
import { splitAction, validateAction } from '../services/screenChatService.js';

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// ── splitAction ─────────────────────────────────────────────────────────────
check('trailing ACTION is extracted',
  splitAction('Here is my advice.\nACTION: approve_opportunity').action, 'approve_opportunity');

check('...and stripped from the reply',
  splitAction('Here is my advice.\nACTION: approve_opportunity').reply, 'Here is my advice.');

check('no ACTION line -> null',
  splitAction('Just a normal reply.').action, null);

check('ACTION mid-text is NOT treated as a marker',
  splitAction('I could ACTION: something here\nbut this is the real last line.').action, null);

check('mid-text mention leaves reply intact',
  splitAction('I could ACTION: something here\nbut this is the real last line.').reply,
  'I could ACTION: something here\nbut this is the real last line.');

check('trailing whitespace tolerated',
  splitAction('Advice.\nACTION: connect_jira   \n\n').action, 'connect_jira');

// ── validateAction: whitelist ───────────────────────────────────────────────
const fresh = { approved: false, confluenceConnected: false, jiraConnected: false };

check('cob allows approve_opportunity',
  validateAction('approve_opportunity', 'cob', fresh),
  { type: 'approve_opportunity', label: 'Approve this use case' });

check('cob REJECTS an aria action',
  validateAction('connect_jira', 'cob', fresh), null);

check('aria REJECTS a cob action',
  validateAction('approve_opportunity', 'aria', fresh), null);

check('invented action is rejected',
  validateAction('delete_everything', 'aria', fresh), null);

check('null action stays null',
  validateAction(null, 'cob', fresh), null);

// ── validateAction: state ───────────────────────────────────────────────────
check('approve dropped once already approved',
  validateAction('approve_opportunity', 'cob', { ...fresh, approved: true }), null);

check('connect_confluence dropped once connected',
  validateAction('connect_confluence', 'aria', { ...fresh, confluenceConnected: true }), null);

check('connect_jira dropped once connected',
  validateAction('connect_jira', 'aria', { ...fresh, jiraConnected: true }), null);

check('connect_jira still offered when only confluence is connected',
  validateAction('connect_jira', 'aria', { ...fresh, confluenceConnected: true }),
  { type: 'connect_jira', label: 'Connect Jira' });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
