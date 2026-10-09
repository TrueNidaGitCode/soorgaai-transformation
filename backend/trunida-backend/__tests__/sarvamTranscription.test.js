/**
 * Indian voices into the objective box: Sarvam first, Gemini behind it, and
 * a recording sent as 25-second pieces because Sarvam takes 30 seconds a
 * request. See services/transcriptionService.js and controllers/voiceController.js.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: () => {} } }));
process.env.SARVAM_API_KEY = 'sarvam-test';
process.env.GOOGLE_API_KEY = 'google-test';
delete process.env.TRANSCRIPTION_CHAIN;

const { transcribe } = await import('../services/transcriptionService.js');
const { transcribeAudio } = await import('../controllers/voiceController.js');

const audio = () => Buffer.alloc(4000, 1);
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const gemini = (text) => ok({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });

afterEach(() => vi.restoreAllMocks());

describe('Sarvam is asked first, for Indian voices', () => {
  it('sends Saaras v4 in translate mode with the language detected', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ transcript: 'We lose clients after the third visit.', language_code: 'hi-IN' }));
    const out = await transcribe(audio(), 'audio/webm');
    expect(out).toEqual({ text: 'We lose clients after the third visit.', language: 'hi-IN', provider: 'sarvam' });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://api.sarvam.ai/speech-to-text');
    expect(init.headers['api-subscription-key']).toBe('sarvam-test');
    expect(init.body.get('model')).toBe('saaras:v4');
    expect(init.body.get('mode')).toBe('translate');
    expect(init.body.get('language_code')).toBe('unknown');
  });

  it('falls back to Gemini when Sarvam declines, so the box still fills', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":"audio longer than 30 seconds"}', { status: 400 }))
      .mockResolvedValueOnce(gemini('We lose clients after the third visit.'));
    const out = await transcribe(audio(), 'audio/webm');
    expect(out.provider).toBe('gemini');
    expect(String(spy.mock.calls[1][0])).toMatch(/generativelanguage\.googleapis\.com/);
  });
});

/** A minimal Express response, enough to read back what the handler sent. */
function res() {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const piece = () => ({ audio: audio().toString('base64'), mimeType: 'audio/webm' });

describe('the voice endpoint joins the pieces', () => {
  it('transcribes each piece in order and joins the text', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ transcript: 'We run a wellness clinic.', language_code: 'ta-IN' }))
      .mockResolvedValueOnce(ok({ transcript: 'Clients stop coming after a month.', language_code: 'ta-IN' }));
    const r = res();
    await transcribeAudio({ ip: '1.1.1.1', body: { segments: [piece(), piece()] } }, r);
    expect(r.code).toBe(200);
    expect(r.body).toEqual({ text: 'We run a wellness clinic. Clients stop coming after a month.', language: 'ta-IN' });
  });

  it('treats a silent piece as a pause, not a failure', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({ transcript: 'We run a gym.', language_code: 'en-IN' }))
      .mockResolvedValueOnce(ok({ transcript: '', language_code: null }))
      .mockResolvedValueOnce(ok({ transcript: 'Members drift in winter.', language_code: 'en-IN' }));
    const r = res();
    await transcribeAudio({ ip: '1.1.1.2', body: { segments: [piece(), piece(), piece()] } }, r);
    expect(r.body.text).toBe('We run a gym. Members drift in winter.');
  });

  it('still takes one recording, as an older page sends it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ transcript: 'Hello.', language_code: 'en-IN' }));
    const r = res();
    await transcribeAudio({ ip: '1.1.1.3', body: { audio: audio().toString('base64'), mimeType: 'audio/webm' } }, r);
    expect(r.body.text).toBe('Hello.');
  });

  it('refuses more pieces than five minutes can make', async () => {
    const r = res();
    await transcribeAudio({ ip: '1.1.1.4', body: { segments: Array.from({ length: 17 }, piece) } }, r);
    expect(r.code).toBe(400);
  });
});
