/**
 * A delivered application telling its owner something.
 *
 * An agent inside a customer's application notices that a student stopped
 * turning up, or an invoice went past forty days. It has to be able to say so
 * — and the whole reason the product is trustworthy is that the application
 * holds no credentials of its own. It has no model key; it must not have a
 * mail key either. So it asks Svarg, over the gateway, with the same
 * per-deployment token, and Svarg sends.
 *
 * ── The recipient is not a parameter ───────────────────────────────────────
 *
 * The application does not say who to write to. Svarg resolves the owner from
 * the deployment and sends only there.
 *
 * That is the whole abuse story. An application that could name a recipient is
 * an open relay authenticated by a token sitting in a container — and a
 * compromised tenant, or simply a confused agent, would be sending mail to
 * strangers over Svarg's sending domain. Losing that domain would take every
 * sign-in code with it.
 *
 * Telling the owner needs no approval, because it is not an outward message:
 * it is somebody's own application telling them what it found. Anything
 * addressed to a third party is a different feature with a different gate, and
 * it does not exist yet.
 */
import HostedDeployment from '../models/HostedDeployment.js';
import User from '../models/User.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { sendOutreachEmail } from './mailService.js';

/** A day's worth, per deployment. A loop in a tenant must not become a mailing. */
export const DAILY_CAP = 20;

const MAX_SUBJECT = 160;
const MAX_LINES = 40;
const MAX_LINE = 300;

/**
 * Who this deployment's application may write to: its owner, and nobody else.
 * Returns '' when there is no owner to find, which refuses the send.
 */
export async function ownerEmailFor(deployment) {
  if (!deployment?.userId) return '';
  const u = await User.findById(deployment.userId).select('email').lean();
  return String(u?.email || '').trim();
}

/** What the application is called, for the subject line. */
async function appNameFor(deployment) {
  const bp = await TransformationBlueprint
    .findById(deployment.blueprintId).select('appName').lean().catch(() => null);
  return String(bp?.appName || '').trim() || 'Your application';
}

/**
 * How many were sent today, counted on the deployment itself rather than in
 * memory — a restart must not reset somebody's cap.
 */
export function sentToday(deployment, now = new Date()) {
  const n = deployment.notify || {};
  const day = new Date(now).toISOString().slice(0, 10);
  return n.day === day ? (n.count || 0) : 0;
}

/**
 * Send one message from an application to its owner.
 *
 * @param {object} deployment  resolved from the gateway token
 * @param {{ subject: string, lines: string[] }} message
 */
export async function notifyOwner(deployment, { subject, lines } = {}) {
  const clean = String(subject || '').trim().slice(0, MAX_SUBJECT);
  const body = (Array.isArray(lines) ? lines : [])
    .map((l) => String(l || '').trim().slice(0, MAX_LINE))
    .filter(Boolean)
    .slice(0, MAX_LINES);

  if (!clean) return { sent: false, reason: 'No subject.' };
  if (!body.length) return { sent: false, reason: 'Nothing to say.' };

  const to = await ownerEmailFor(deployment);
  if (!to) return { sent: false, reason: 'No owner address for this deployment.' };

  const used = sentToday(deployment);
  if (used >= DAILY_CAP) return { sent: false, reason: `Daily limit of ${DAILY_CAP} reached.` };

  const appName = await appNameFor(deployment);
  const text = [`${appName} found something.`, '', ...body.map((l) => `• ${l}`), '',
    'This is your own application telling you what it noticed. Open it to see more.',
    deployment.railway?.url || ''].filter(Boolean).join('\n');

  await sendOutreachEmail({
    to,
    subject: `${appName}: ${clean}`,
    text,
    // No unsubscribe link, deliberately: this is not outreach. It is the
    // owner's own software reporting to them, and the way to stop it is to
    // switch the agent off inside the application — which is also the only
    // place that can say which agent to stop.
  });

  const day = new Date().toISOString().slice(0, 10);
  await HostedDeployment.updateOne(
    { _id: deployment._id },
    { $set: { notify: { day, count: used + 1, lastAt: new Date() } } },
  );

  return { sent: true, to, remaining: DAILY_CAP - used - 1 };
}
