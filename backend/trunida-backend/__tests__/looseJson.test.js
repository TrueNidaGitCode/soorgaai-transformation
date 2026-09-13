/**
 * A section the model wrote is parsed even when its JSON is a little wrong:
 * prose around it, a trailing comma, or an answer cut off by the budget. The
 * Governance & Ethics capability went missing on exactly that, and Yusu
 * failed a check two stages later for a document that had not parsed.
 */
import { describe, it, expect } from 'vitest';
import { parseLooseJson, closeTruncated } from '../utils/looseJson.js';

describe('parseLooseJson', () => {
  it('reads clean JSON as is and says it was not repaired', () => {
    expect(parseLooseJson('{"ok":true}')).toEqual({ value: { ok: true }, repaired: false });
    expect(parseLooseJson('Sure: {"ok":true} — done')).toEqual({ value: { ok: true }, repaired: false });
  });

  it('forgives trailing commas', () => {
    expect(parseLooseJson('{"a":1,"b":[1,2,],}').value).toEqual({ a: 1, b: [1, 2] });
  });

  it('salvages an answer cut off mid-string, keeping every complete section', () => {
    const cut = '{"sections":[{"title":"Ethical AI Guidelines","brief":{"strategicPosition":"We commit","items":["a","b"]}},{"title":"Privacy","brief":{"strategicPosition":"Cut off he';
    const r = parseLooseJson(cut);
    expect(r.repaired).toBe(true);
    expect(r.value.sections[0]).toEqual({ title: 'Ethical AI Guidelines', brief: { strategicPosition: 'We commit', items: ['a', 'b'] } });
    expect(r.value.sections[1]).toEqual({ title: 'Privacy', brief: {} });
  });

  it('salvages an answer cut off at a key, in an array, and after a comma', () => {
    expect(parseLooseJson('{"s":[{"t":"A","brief":{"x":[{"k":"v"},{"k":').value).toEqual({ s: [{ t: 'A', brief: { x: [{ k: 'v' }, {}] } }] });
    expect(parseLooseJson('{"s":[{"t":"A","tags":["x","y"').value).toEqual({ s: [{ t: 'A', tags: ['x', 'y'] }] });
    expect(parseLooseJson('{"s":[{"t":"A"},').value).toEqual({ s: [{ t: 'A' }] });
    expect(closeTruncated('{"a":"b"')).toBe('{"a":"b"}');
  });

  it('throws when there is no object at all', () => {
    expect(() => parseLooseJson('no json here')).toThrow(/No JSON/);
  });
});
