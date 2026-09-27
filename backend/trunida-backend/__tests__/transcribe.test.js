/**
 * Turning a recorded call into text.
 *
 * ── Why this is worth guarding carefully ───────────────────────────────────
 *
 * Two clinics described a problem whose evidence is a phone call, and every
 * watcher in the catalogue reads rows. This is the step that makes a
 * conversation readable at all.
 *
 * It is also the first thing on the gateway where a customer can run up a
 * bill without asking a lot of questions. Audio is about 32 input tokens a
 * second: a three-minute call is ~5,800 tokens before a word comes back, and
 * a day of forty calls is a quarter of a million. The last time a class of
 * token went uncounted — thinking tokens, billed as output and invisible for
 * months — the ledger, the cap and every estimate were wrong together.
 *
 * So what is tested here is mostly refusals and arithmetic, not transcription:
 * the size ceiling, the type check, the empty answer, and that the usage
 * reported is the provider's own count rather than anything guessed from
 * duration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

const generateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() { return { generateContent }; }
  },
}));

const { transcribe, MAX_AUDIO_BYTES, AUDIO_TYPES } =
  await import('../services/transcribeService.js');

/** What the SDK hands back, shaped like the real thing. */
const reply = (text, usage = {}) => ({
  response: {
    text: () => text,
    usageMetadata: { promptTokenCount: 5800, candidatesTokenCount: 420, ...usage },
    candidates: [{ finishReason: 'STOP' }],
  },
});

const audio = (bytes = 2048) => Buffer.alloc(bytes, 7);

beforeEach(() => {
  generateContent.mockReset();
  process.env.GOOGLE_API_KEY = 'test-key';
});
afterEach(() => { delete process.env.GOOGLE_API_KEY; });

describe('the application is given the address, and can reach it', () => {
  /*
   * The gap this closes, found by checking a live application rather than by
   * reading the code: the env var was added to .env.example — which is
   * documentation — and not to what actually configures a tenant. A delivered
   * application would have shipped the phone connector, recorded who rang and
   * when, and quietly never read a single recording, with nothing on any
   * screen explaining why.
   */
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('is handed the transcription address by the deployment, not hard-coded', () => {
    expect(read('../services/deployTargetService.js'))
      .toContain('SVARG_TRANSCRIBE_URL: `${gatewayBaseUrl}/v1/audio/transcriptions`');
    expect(read('../eame-template/services/transcribeService.js'))
      .toContain('process.env.SVARG_TRANSCRIBE_URL');
  });

  it('points at a route the gateway actually mounts', () => {
    // The two halves of one address, which drifted apart once already on a
    // different route and produced a 404 that read as a broken connector.
    expect(read('../routes/gatewayRoutes.js'))
      .toContain("router.post('/audio/transcriptions'");
  });

  it('says so plainly when it was never given one', () => {
    // Rather than throwing, or worse, returning an empty transcript that
    // reads as a call in which nothing was said.
    expect(read('../eame-template/services/transcribeService.js'))
      .toContain('This application was not set up to read recordings.');
  });
});

describe('what it refuses, before spending anything', () => {
  it('refuses a recording past the ceiling, and says how big it was', async () => {
    /*
     * An hour of audio is ~115,000 input tokens. Accepting it silently
     * produces a bill nobody predicted, and truncating it produces half a
     * transcript that does not say it is half — which is worse, because
     * something downstream will treat it as the whole call.
     */
    const big = Buffer.alloc(MAX_AUDIO_BYTES + 1, 1);
    await expect(transcribe({ audio: big, mimeType: 'audio/mpeg' }))
      .rejects.toThrow(/limit is/i);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('refuses something that is not audio', async () => {
    await expect(transcribe({ audio: audio(), mimeType: 'application/pdf' }))
      .rejects.toThrow(/not an audio type/i);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('refuses an empty body rather than calling with nothing', async () => {
    await expect(transcribe({ audio: Buffer.alloc(0), mimeType: 'audio/mpeg' }))
      .rejects.toThrow(/No audio/i);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('marks its refusals as the caller’s fault, so the gateway answers 400', async () => {
    // A 502 here would tell a connector to retry a recording that will be
    // refused identically every time.
    await expect(transcribe({ audio: audio(), mimeType: 'text/plain' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts what a phone system actually produces', async () => {
    for (const t of ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a']) {
      expect(AUDIO_TYPES, t).toContain(t);
    }
  });

  it('reads a content type that carries parameters', async () => {
    // "audio/ogg; codecs=opus" is what a WhatsApp voice note arrives as.
    generateContent.mockResolvedValue(reply('Caller: hello'));
    await expect(transcribe({ audio: audio(), mimeType: 'audio/ogg; codecs=opus' }))
      .resolves.toMatchObject({ text: 'Caller: hello' });
  });
});

describe('what it reports', () => {
  it('returns the provider’s own token counts, not an estimate from duration', async () => {
    /*
     * The whole reason this is asserted: a count derived from seconds of
     * audio would be a plausible number that drifts from the bill. The cap
     * and the ledger both read this.
     */
    generateContent.mockResolvedValue(reply('Caller: I wanted to upgrade my package.',
      { promptTokenCount: 5811, candidatesTokenCount: 137 }));
    const out = await transcribe({ audio: audio(), mimeType: 'audio/mpeg' });
    expect(out.inputTokens).toBe(5811);
    expect(out.outputTokens).toBe(137);
  });

  it('says a silent call was silent, rather than returning an empty transcript', async () => {
    /*
     * Silence, hold music and a wrong number all produce nothing, and all
     * three are legitimate. What must not happen is '' travelling onward as
     * though the call had been read and found to contain no signals — that
     * becomes a finding about the business rather than a fact about audio.
     */
    generateContent.mockResolvedValue(reply('   \n  '));
    const out = await transcribe({ audio: audio(), mimeType: 'audio/mpeg' });
    expect(out.text).toBe('');
    expect(out.empty).toBe(true);
  });

  it('marks a real transcript as not empty', async () => {
    generateContent.mockResolvedValue(reply('Staff: I will check and get back to you.'));
    const out = await transcribe({ audio: audio(), mimeType: 'audio/mpeg' });
    expect(out.empty).toBe(false);
  });

  it('turns a blocked response into an error rather than a blank transcript', async () => {
    generateContent.mockResolvedValue({
      response: {
        text: () => { throw new Error('blocked'); },
        usageMetadata: {},
        candidates: [{ finishReason: 'SAFETY' }],
      },
    });
    await expect(transcribe({ audio: audio(), mimeType: 'audio/mpeg' }))
      .rejects.toThrow(/could not be transcribed/i);
  });
});

describe('how it asks', () => {
  it('sends the audio inline, with the instruction first', async () => {
    generateContent.mockResolvedValue(reply('x'));
    await transcribe({ audio: audio(), mimeType: 'audio/wav' });
    const parts = generateContent.mock.calls[0][0].contents[0].parts;
    expect(typeof parts[0].text).toBe('string');
    expect(parts[1].inlineData.mimeType).toBe('audio/wav');
  });

  it('turns thinking off, because transcription is not reasoning', async () => {
    /*
     * Thinking is billed as output at the output rate. On a long call it can
     * cost more than the transcript it precedes, and the answer is in the
     * audio either way.
     */
    generateContent.mockResolvedValue(reply('x'));
    await transcribe({ audio: audio(), mimeType: 'audio/mpeg' });
    const cfg = generateContent.mock.calls[0][0].generationConfig;
    expect(cfg.thinkingConfig.thinkingBudget).toBe(0);
    expect(cfg.temperature).toBe(0);
  });

  it('asks for a transcript and nothing else', async () => {
    /*
     * The instruction must not ask the model to summarise or to say what the
     * customer wanted. Interpretation happens later, over text, where it can
     * be checked against a transcript a person can read; a model asked to do
     * both in one pass produces an interpretation with nothing to check it.
     */
    generateContent.mockResolvedValue(reply('x'));
    await transcribe({ audio: audio(), mimeType: 'audio/mpeg' });
    const instruction = generateContent.mock.calls[0][0].contents[0].parts[0].text;
    expect(instruction).toMatch(/summarise nothing/i);
    expect(instruction).toMatch(/Add nothing/i);
    // Who said it is the whole value of a call: "I'll get back to you" is a
    // commitment from staff and nothing at all from the customer.
    expect(instruction).toMatch(/Caller:/);
    expect(instruction).toMatch(/Staff:/);
    // Indian callers switch language mid-sentence; translating loses the words
    // the extraction step is looking for.
    expect(instruction).toMatch(/Do not translate/i);
    expect(instruction).toMatch(/\[inaudible\]/);
  });
});
