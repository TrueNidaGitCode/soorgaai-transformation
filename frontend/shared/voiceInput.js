/**
 * Svarg — say it instead of typing it
 *
 * Attaches a microphone to a textarea. Press it, speak, press it again; what
 * you said appears in the box, and you can edit it before sending.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The first thing Svarg asks anybody to do is describe their business problem
 * in writing, into an empty box. That is the slowest and most intimidating step
 * in the product, and people stall on it. Spoken, the same description takes
 * fifteen seconds and usually comes out better, because it is how they would
 * explain it to a colleague rather than how they think a form wants it written.
 *
 * ── Nothing is offered that cannot work ─────────────────────────────────────
 *
 * The button is only added when the server says transcription is configured AND
 * the browser can actually record. A microphone that fails on the first press
 * is worse than no microphone: it is the first thing a stranger touches, and it
 * teaches them the product is broken.
 *
 * ── Nothing is kept ─────────────────────────────────────────────────────────
 *
 * The recording lives in memory for one request. It is not stored here, and the
 * server does not store it either — the transcript comes back into the box as
 * if it had been typed.
 */

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';

/**
 * Five minutes. It was two, and a spoken objective with pauses in it reached
 * that: the recording stopped by itself, mid-sentence, and the transcript
 * ended on "handled through Excel or" with nothing on screen to say why.
 * Five minutes is more than any objective needs and well under the server's
 * size cap; and when the cap does stop a recording, it now says so.
 */
const MAX_MS = 5 * 60 * 1000;

/**
 * What counts as having heard someone.
 *
 * A chat model asked to transcribe silence will sometimes transcribe a
 * sentence nobody said -- a few seconds of nothing came back as "Mr. Speaker".
 * The server cannot tell silence from speech without decoding the audio, but
 * the browser is listening to the live signal anyway to draw the level bars,
 * so it can. A frame counts as speech when its peak clears SPEECH_LEVEL (about
 * -22 dBFS: a voice at arm's length, well above room noise and mic hiss), and
 * a recording is sent only if at least SPEECH_FRAMES such frames were seen --
 * roughly a quarter of a second of voice, so a single click or cough does not
 * qualify and a single word does.
 */
const SPEECH_LEVEL = 0.08;
const SPEECH_FRAMES = 15;

/** Formats in preference order — Opus is small, and Safari only does mp4. */
function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const t of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return '';
}

function canRecord() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

async function serverReady() {
  try {
    const r = await fetch(`${API_BASE()}/guest/voice-status`);
    if (!r.ok) return false;
    const { available } = await r.json();
    return !!available;
  } catch { return false; }
}

const MIC_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>'
  + '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>';

const STOP_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">'
  + '<rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

/**
 * @param {object} opts
 * @param {HTMLTextAreaElement} opts.field     the box to fill
 * @param {HTMLElement} opts.mountInto         where the button goes
 * @param {(msg: string) => void} [opts.onError]  how this page shows a problem
 * @param {() => void} [opts.onText]           called after the box is filled
 */
export async function attachVoiceInput({ field, mountInto, onError = null, onText = null }) {
  if (!field || !mountInto) return null;
  if (!canRecord()) return null;
  if (!(await serverReady())) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'voice-btn';
  btn.innerHTML = MIC_SVG;
  btn.title = 'Describe it out loud';
  btn.setAttribute('aria-label', 'Describe it out loud');
  mountInto.appendChild(btn);

  let recorder = null;
  let chunks = [];
  let stream = null;
  let stopTimer = null;

  const say = (msg) => { if (onError) onError(msg); };

  function reset(label = 'Describe it out loud') {
    btn.innerHTML = MIC_SVG;
    btn.classList.remove('voice-btn--on', 'voice-btn--busy');
    btn.disabled = false;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Denied, dismissed, or no device. All three mean the same to the person
      // pressing the button, and none of them is a bug worth a console trace.
      say(err?.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in your browser to describe this out loud.'
        : 'No microphone was available.');
      reset();
      return;
    }

    const mimeType = pickMimeType();
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      say('This browser could not start a recording.');
      reset();
      return;
    }

    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = () => { send(new Blob(chunks, { type: mimeType || 'audio/webm' })); };
    recorder.start();

    btn.innerHTML = STOP_SVG;
    btn.classList.add('voice-btn--on');
    btn.title = 'Stop and transcribe';
    btn.setAttribute('aria-label', 'Stop and transcribe');

    // A recording nobody stopped would otherwise run until the tab closes, and
    // the server refuses anything over two minutes anyway.
    stopTimer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, MAX_MS);
  }

  async function send(blob) {
    reset('Transcribing…');
    btn.classList.add('voice-btn--busy');
    btn.disabled = true;

    try {
      const buf = await blob.arrayBuffer();
      // Chunked rather than spread: String.fromCharCode(...bytes) blows the
      // call stack on anything longer than a few seconds of audio.
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }

      const resp = await fetch(`${API_BASE()}/guest/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: btoa(binary), mimeType: blob.type || 'audio/webm' }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Could not transcribe that.');

      // Appended, not replaced. Somebody who typed half a sentence and then
      // spoke the rest meant to add to it, and silently discarding what they
      // had written would be the last time they pressed this button.
      const existing = field.value.trim();
      field.value = existing ? `${existing} ${data.text}` : data.text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
      if (onText) onText();
    } catch (err) {
      say(err.message || 'Could not transcribe that.');
    } finally {
      reset();
    }
  }

  btn.addEventListener('click', () => {
    if (recorder?.state === 'recording') recorder.stop();
    else start();
  });

  return btn;
}

/* ══════════════════════════════════════════════════════════════════════════
   The recorder, without a button attached to it

   attachVoiceInput above owns a small microphone that lives beside a field.
   The Speak panel on the first screen is a different shape entirely — a large
   mic, a live waveform, and a state line — so it needs the recording and the
   transcribing without any of the chrome.

   This is that half. It exposes start/stop and reports level, so whatever is
   drawing can decide how to draw it.
   ══════════════════════════════════════════════════════════════════════════ */

/** Whether voice can work at all, asked once so nothing is offered that fails. */
export async function voiceAvailable() {
  return canRecord() && await serverReady();
}

/**
 * @param {object} handlers
 * @param {(level:number)=>void} [handlers.onLevel]  0..1, roughly 20x a second
 * @param {(text:string)=>void}  [handlers.onText]   the transcript
 * @param {(msg:string)=>void}   [handlers.onError]
 * @param {(state:'idle'|'recording'|'working')=>void} [handlers.onState]
 */
export function createVoiceRecorder({ onLevel, onText, onError, onState } = {}) {
  let recorder = null;
  let stream = null;
  let audioCtx = null;
  let raf = 0;
  let chunks = [];
  let stopTimer = null;
  // Frames with a voice in them, this recording. null while no analyser ran,
  // which is the one case a recording is sent unjudged.
  let speechFrames = null;

  const say = (m) => { if (onError) onError(m); };
  const state = (s) => { if (onState) onState(s); };

  function teardown() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  /**
   * Read the live microphone level so the bars mean something.
   *
   * A waveform that animates on a timer looks identical whether or not anyone
   * is being heard, which makes it decoration. This is the actual signal, so a
   * flat line is real information: check your microphone.
   */
  function watchLevel(src) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const node = audioCtx.createMediaStreamSource(src);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      node.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      speechFrames = 0;

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        if (peak >= SPEECH_LEVEL) speechFrames += 1;
        if (onLevel) onLevel(Math.min(1, peak * 1.7));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // No analyser is survivable — the recording still works, the bars just
      // sit still. Not worth failing the whole interaction over.
    }
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      say(err?.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in your browser to describe this out loud.'
        : 'No microphone was available.');
      teardown();
      state('idle');
      return false;
    }

    const mimeType = pickMimeType();
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      say('This browser could not start a recording.');
      teardown();
      state('idle');
      return false;
    }

    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = () => { send(new Blob(chunks, { type: mimeType || 'audio/webm' })); };
    recorder.start();
    watchLevel(stream);
    state('recording');

    // The server has a size cap, so stopping here first turns a refusal into
    // a transcript -- and says that it did, because a recording that stops on
    // its own looks like a fault.
    stopTimer = setTimeout(() => {
      if (recorder?.state !== 'recording') return;
      say('Stopped at five minutes and writing down what was heard. Say the rest in a second recording.');
      recorder.stop();
    }, MAX_MS);
    return true;
  }

  function stop() {
    if (recorder?.state === 'recording') recorder.stop();
  }

  async function send(blob) {
    teardown();
    if (onLevel) onLevel(0);

    // Judged here, not on the server: the server never hears the signal, and
    // sending silence to the model is how "Mr. Speaker" got into the box.
    if (speechFrames !== null && speechFrames < SPEECH_FRAMES) {
      say('Nothing was heard. Press the microphone, speak, then press it again.');
      state('idle');
      return;
    }
    state('working');

    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      // Chunked: String.fromCharCode(...bytes) overflows the call stack on
      // anything longer than a few seconds of audio.
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }

      const resp = await fetch(`${API_BASE()}/guest/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: btoa(binary), mimeType: blob.type || 'audio/webm' }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Could not transcribe that.');
      if (onText) onText(data.text);
    } catch (err) {
      say(err.message || 'Could not transcribe that.');
    } finally {
      state('idle');
    }
  }

  return {
    start,
    stop,
    toggle: () => (recorder?.state === 'recording' ? (stop(), false) : start()),
    isRecording: () => recorder?.state === 'recording',
  };
}
