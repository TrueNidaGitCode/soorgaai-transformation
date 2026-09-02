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

// ── arth ────────────────────────────────────────────────────────────────────
check('arth allows choose_open_weight',
  validateAction('choose_open_weight', 'arth', fresh),
  { type: 'choose_open_weight', label: 'Select Open Weight' });

check('arth REJECTS a cob action',
  validateAction('approve_opportunity', 'arth', fresh), null);

check('cob REJECTS an arth action',
  validateAction('choose_frontier', 'cob', fresh), null);

check('choose dropped once that class is already selected',
  validateAction('choose_open_weight', 'arth', { ...fresh, currentPreference: 'open-weight' }), null);

check('a different class is still offered when one is selected',
  validateAction('choose_frontier', 'arth', { ...fresh, currentPreference: 'open-weight' }),
  { type: 'choose_frontier', label: 'Select Frontier' });

check('choose_auto dropped once auto is selected',
  validateAction('choose_auto', 'arth', { ...fresh, currentPreference: 'auto' }), null);

// ── eame ────────────────────────────────────────────────────────────────────
// Eame proposes nothing. Pushing to a repository and deploying are both
// irreversible enough to need a deliberate click, not a conversational offer.
check('eame does not inherit cob\'s action',
  validateAction('approve_opportunity', 'eame', fresh), null);
check('eame REJECTS an arth action',
  validateAction('choose_frontier', 'eame', fresh), null);
check('eame REJECTS an aria action',
  validateAction('connect_jira', 'eame', fresh), null);
check('an invented eame action is rejected',
  validateAction('deploy_application', 'eame', fresh), null);

// ── yusu ────────────────────────────────────────────────────────────────────
// Going live is the most consequential button in the product; it is never
// something a conversation offers.
check('yusu offers no action either',
  validateAction('approve_opportunity', 'yusu', fresh), null);
check('yusu REJECTS an arth action',
  validateAction('choose_frontier', 'yusu', fresh), null);
check('an invented go-live action is rejected',
  validateAction('go_live', 'yusu', fresh), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
