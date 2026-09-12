/**
 * What is refused before any provider is asked: nothing, next to nothing,
 * and too much. The middle one exists because a chat model asked to
 * transcribe silence will sometimes invent a sentence.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('dotenv', () => ({ default: { config: () => {} } }));
process.env.GOOGLE_API_KEY = 'test-key';

const { transcribe, MIN_AUDIO_BYTES, MAX_AUDIO_BYTES } = await import('../services/transcriptionService.js');

describe('transcribe() refuses before calling a provider', () => {
  it('a press-and-release clip is "nothing was heard", not a transcript', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(transcribe(Buffer.alloc(MIN_AUDIO_BYTES - 1), 'audio/webm'))
      .rejects.toThrow(/nothing was heard/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('an empty body is refused', async () => {
    await expect(transcribe(Buffer.alloc(0), 'audio/webm')).rejects.toThrow(/no audio/i);
  });

  it('a recording over the cap is refused as too long, with a 413', async () => {
    const err = await transcribe(Buffer.alloc(MAX_AUDIO_BYTES + 1), 'audio/webm').catch(e => e);
    expect(err.message).toMatch(/too long/i);
    expect(err.status).toBe(413);
  });
});
