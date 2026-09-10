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

/** Two minutes, matched to the server's cap so the refusal happens here first. */
const MAX_MS = 120000;

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
