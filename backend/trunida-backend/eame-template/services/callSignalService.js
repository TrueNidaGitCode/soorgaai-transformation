/**
 * What a conversation was about, as something code can filter on.
 *
 * ── The step this is ───────────────────────────────────────────────────────
 *
 *   the recording        audio
 *   the transcript       text          <- transcribeService
 *   the signals          columns       <- here
 *   the finding          a row a human acts on   <- the watchers, in code
 *
 * A transcript is not readable by a watcher. "Rahul asked about upgrading his
 * package and the receptionist said she would check and get back to him" is
 * four hundred characters of prose, and every operator in the answer pipeline
 * compares a column to a value. So this turns the prose into a handful of
 * columns with a closed vocabulary, and everything downstream goes back to
 * being arithmetic over rows.
 *
 * ── The rule that makes a model safe here ──────────────────────────────────
 *
 * Every signal must carry the WORDS IT CAME FROM, and code checks those words
 * are really in the transcript. A quote that is not there means the signal is
 * discarded — not flagged, not softened, discarded.
 *
 * That is not belt-and-braces. "A promise was made" is the most consequential
 * thing this product can assert about a member of staff: it is the difference
 * between Promise Overdue appearing on somebody's morning list and not. A
 * model that invents one is accusing an employee of forgetting something they
 * never said, and no amount of prompt wording prevents that. Checking the
 * quote does, because an invented promise has no quote that survives.
 *
 * It is the same discipline the answer pipeline holds numbers to: the writer
 * may only use figures code computed, and anything else is rejected rather
 * than trusted.
 *
 * ── Why the vocabulary is closed ───────────────────────────────────────────
 *
 * `intent` could be free text and would be useless. A watcher asks
 * ["intent", "is", "upgrade"], and a column holding "asking about upgrading
 * his package" matches nothing. Eight values, fixed here, and anything the
 * model returns that is not one of them becomes `other`.
 */

/** What a customer rang about. Fixed, because a watcher filters on it. */
export const INTENTS = [
  'cancel',        // they cannot come
  'reschedule',    // they want a different time
  'upgrade',       // they want more than they have bought
  'price',         // what does it cost
  'complaint',     // something went wrong
  'booking',       // they want an appointment
  'information',   // a question about hours, address, treatment
  'other',
];

/** Columns a call carries once it has been read. */
export const SIGNAL_FIELDS = ['intent', 'request', 'promise', 'promise_quote', 'signals_checked'];

const RULES = [
  'You read a transcript of a telephone call between a customer and a business, and return',
  'what it was about. You never decide whether anything is a problem.',
  '',
  'Return ONLY JSON:',
  '{"intent":"one of the words below",',
  ' "request":"what the customer asked for, in under 12 words, or \\"\\"",',
  ' "request_quote":"the customer\'s own words you took that from, copied EXACTLY, or \\"\\"",',
  ' "promise":"yes or no — did someone FROM THE BUSINESS commit to doing something",',
  ' "promise_quote":"the staff words you took that from, copied EXACTLY, or \\"\\""}',
  '',
  `INTENT is exactly one of: ${INTENTS.join(', ')}.`,
  'Pick the reason they RANG, not everything discussed. If none fits, "other".',
  '',
  'QUOTES',
  '- Copy them character for character from the transcript. Do not tidy, translate,',
  '  shorten or correct them. A quote that is not in the transcript is thrown away and',
  '  the signal with it.',
  '- A quote is one sentence or less.',
  '',
  'PROMISE means the BUSINESS said it would do something afterwards: call back, check,',
  'confirm, send, arrange. A customer saying they will call back is NOT a promise. A',
  'pleasantry ("thank you for calling") is not a promise. If nobody committed to anything,',
  'answer no and leave the quote empty.',
].join('\n');

/**
 * The JSON object out of whatever the model actually said.
 *
 * ── Why this is not a trim ────────────────────────────────────────────────
 *
 * It used to strip a code fence off each end and parse the rest, which works
 * exactly as long as the model returns the object and nothing else. Measured
 * on a real call: it did not. The first reading came back marked unreadable —
 * the model answered, and the answer was not parseable — and a prompt saying
 * "Return ONLY JSON" had already been through one round of fixing.
 *
 * A model that is complying in substance and not in form writes "Here is what
 * I found:" above the object, or a sentence below it, or fences it, or all
 * three. None of that is a failure worth throwing an entire call away for.
 *
 * So the first balanced object in the text is taken, wherever it starts.
 * Braces inside strings are not counted — a promise quote containing a brace
 * would otherwise end the object early and turn a good answer into a bad one.
 *
 * This loosens how the answer is FOUND and nothing about how it is TRUSTED.
 * Every quote is still checked against the transcript afterwards, which is
 * the guard that matters: it is the difference between reporting a promise
 * and inventing one.
 */
export function jsonIn(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return '';
}

/**
 * Loose enough to survive a transcript, strict enough to catch an invention.
 *
 * Case, punctuation and whitespace are normalised away because a model will
 * reliably reproduce the words and unreliably reproduce a comma. What it
 * cannot do is produce a sentence nobody said.
 */
function contains(transcript, quote) {
  const flat = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const hay = flat(transcript);
  const needle = flat(quote);
  // A quote of one or two words proves nothing — "check" appears in half of
  // all transcripts — so it is not accepted as evidence of a commitment.
  if (!needle || needle.split(' ').length < 3) return false;
  return hay.includes(needle);
}

/**
 * The signals in one transcript.
 *
 * `ask` is injected rather than imported so this can be tested without a
 * model, and so the one place that spends money is visible in the signature.
 * It is called with a prompt and returns the model's text.
 *
 * Never throws. A call whose signals cannot be read is still a call that
 * happened, and the row lands with `signals_checked: 'no'` — which is a
 * different and more useful thing to know than a row that silently claims
 * there was nothing in the conversation.
 */
export async function readSignals(transcript, ask) {
  const text = String(transcript || '').trim();
  const none = {
    intent: '', request: '', promise: '', promise_quote: '', signals_checked: 'no',
  };
  if (!text) return { ...none, signals_checked: 'empty' };

  let raw;
  try {
    raw = await ask({
      systemPrompt: RULES,
      userMessage: `TRANSCRIPT\n${text}`,
      // Not reasoning work: reading a conversation for what was asked and
      // what was promised. Thinking is billed as output and buys nothing here.
      thinking: false,
    });
  } catch (err) {
    // 'no' means it could not be asked. Said out loud, because a silent
    // return here is indistinguishable from a call with nothing in it.
    console.warn('[signals] could not ask —', String(err?.message || err).slice(0, 200));
    return none;
  }

  let out;
  try {
    out = JSON.parse(jsonIn(raw));
  } catch {
    /*
     * It answered, and not in JSON. Kept apart from 'no' deliberately.
     *
     * These are different repairs and they looked identical for as long as
     * they shared a value. The first real call came back with every signal
     * empty and `signals_checked: 'no'`, which reads as "the model was
     * unreachable" — it was reachable, and answering in plain prose, because
     * the caller had framed the prompt with the application's conduct and
     * the conduct outranks the caller on how to speak. One value would have
     * sent somebody to check the gateway; this one names the prompt.
     */
    /*
     * And what it said is kept, not only logged.
     *
     * Two rounds of this failure have now been diagnosed by guessing, because
     * the only evidence was a container log nobody was watching. `said` is
     * never a column — the connector lands the five named signals and nothing
     * else — so this costs a few hundred characters in the database and turns
     * the next occurrence into a question somebody can answer by looking.
     */
    /*
     * Cut off is not the same as wrong, and they are different repairs.
     *
     * An answer that starts an object and never closes it ran out of room.
     * One that never starts an object ignored the instruction. The first
     * points at the token budget, the second at the prompt — and the first is
     * what actually happened: Gemini thought its way through a 400-token
     * budget with thinking switched off and returned twenty-five tokens of
     * perfectly good JSON with no end to it.
     */
    const cut = String(raw).includes('{') && !jsonIn(raw);
    console.warn(`[signals] ${cut ? 'answer was cut off' : 'answered, but not in JSON'}:`,
      String(raw).slice(0, 160));
    return {
      ...none,
      signals_checked: cut ? 'truncated' : 'unreadable',
      said: String(raw).slice(0, 400),
    };
  }

  const intent = INTENTS.includes(String(out?.intent || '').toLowerCase())
    ? String(out.intent).toLowerCase()
    : 'other';

  /*
   * The request survives only if its quote does.
   *
   * A summary with no words behind it is the model's opinion of the call, and
   * this column is read as fact by everything downstream.
   */
  const requestOk = contains(text, out?.request_quote);
  const request = requestOk ? String(out.request || '').slice(0, 120) : '';

  /*
   * And the promise, which is the one that matters most.
   *
   * Promise Overdue puts a member of staff on somebody's morning list for
   * forgetting something. It fires only when the words are in the transcript.
   */
  const saidYes = String(out?.promise || '').toLowerCase() === 'yes';
  const promiseOk = saidYes && contains(text, out?.promise_quote);

  return {
    intent,
    request,
    promise: promiseOk ? 'yes' : 'no',
    promise_quote: promiseOk ? String(out.promise_quote).slice(0, 300) : '',
    /*
     * Whether the reading stood up.
     *
     * 'yes'        the model answered and its quotes were in the transcript
     * 'unquoted'   it answered and claimed something it could not quote
     * 'unreadable' it answered, and not in JSON — a prompt problem
     * 'truncated'  it began an answer and ran out of room — a budget problem
     * 'no'         it could not be asked at all — a gateway or model problem
     * 'empty'      there was no transcript to read
     *
     * 'unquoted' is kept apart from 'no' deliberately: a run of it is a
     * prompt that has drifted or a model that is guessing, and it should be
     * visible rather than folded into ordinary failure.
     */
    signals_checked: (saidYes && !promiseOk) || (out?.request_quote && !requestOk)
      ? 'unquoted'
      : 'yes',
  };
}
