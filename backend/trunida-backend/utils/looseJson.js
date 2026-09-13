/**
 * Svarg — parsing the JSON a model meant to write
 *
 * A model asked for a JSON object mostly returns one, and sometimes returns
 * one wrapped in prose, one with a trailing comma, or one cut off by the
 * output budget mid-string. Each of those took a whole capability down with
 * "Expected ',' or ']' after array element" -- the Governance & Ethics
 * section of a blueprint was missing, and a screen two stages later failed
 * a check because of it.
 *
 * parseLooseJson tries, in order: the text as is; the first {...} in it;
 * trailing commas removed; and, for a cut-off document, the text trimmed
 * back to the last complete string or closed bracket and every open array
 * and object closed. A document salvaged that way is missing whatever came
 * after the cut, so a caller that can retry should still retry; this is
 * what makes a near-miss usable rather than a total loss.
 */

/** Walk the text tracking strings and brackets; report where the last complete value ended. */
function scan(s) {
  const open = [];
  let inString = false, escaped = false, lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') { inString = false; lastSafe = i; }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') open.push(ch);
    else if (ch === '}' || ch === ']') { open.pop(); lastSafe = i; }
  }
  return { open, lastSafe };
}

/** Trim a cut-off document back to its last complete value and close what is open. */
export function closeTruncated(text) {
  const s = String(text || '');
  const { lastSafe } = scan(s);
  if (lastSafe < 0) return s;
  let head = s.slice(0, lastSafe + 1);
  // The last complete string may be a key whose value never arrived. Inside
  // an object, a string not preceded by a colon is a key: it goes, with the
  // comma before it. Inside an array it is a value and stays.
  const tail = head.match(/(,?)\s*"(?:[^"\\]|\\.)*"\s*$/);
  if (tail) {
    const before = head.slice(0, tail.index).replace(/\s+$/, '');
    const container = scan(before).open.slice(-1)[0];
    if (container === '{' && !/:$/.test(before)) head = before;
  }
  // A key with a colon and no value ("name": ) and a trailing comma go.
  head = head.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, '').replace(/,\s*$/, '');
  const { open } = scan(head);
  while (open.length) head += open.pop() === '{' ? '}' : ']';
  return head;
}

function stripTrailingCommas(text) {
  return String(text).replace(/,(\s*[}\]])/g, '$1');
}

/**
 * @returns {{ value: any, repaired: boolean }}  Throws when nothing can be made of it.
 */
export function parseLooseJson(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('No JSON object in the response');
  const whole = raw.match(/\{[\s\S]*\}/);
  const body = raw.slice(start);
  const attempts = [
    [raw, false],
    ...(whole ? [[whole[0], false]] : []),
    [stripTrailingCommas(whole ? whole[0] : body), true],
    [stripTrailingCommas(closeTruncated(body)), true],
  ];
  let lastErr = null;
  for (const [candidate, repaired] of attempts) {
    try { return { value: JSON.parse(candidate), repaired }; }
    catch (err) { lastErr = err; }
  }
  throw lastErr;
}
