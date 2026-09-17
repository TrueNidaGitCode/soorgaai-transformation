/**
 * Svarg — does the application we delivered meet the standard?
 *
 * Governance & Ethics used to be a domain that wrote advice: five sections on
 * policy and risk, generated for every blueprint and, for an owner-operator
 * with four staff, skimmed once. The advice was not wrong. It was just not the
 * question anybody was actually asking, which is whether the thing Svarg built
 * behaves the way an AI application is expected to.
 *
 * So it is a check now, not a chapter. The suite lives inside the delivered
 * application (eame-template/services/conformance.js) and runs real questions
 * through the real pipeline against the customer's own data. This file is the
 * half that asks for it, records the answer, and makes it a thing Svarg can
 * show a buyer.
 *
 * ── It reports, it does not block ───────────────────────────────────────────
 *
 * A finding never stops a go-live. The customer gets their application and the
 * finding is visible beside it, because the alternative — a check that is
 * wrong once and holds up a delivery — costs more trust than it protects, and
 * because nobody yet knows what these checks fail on in the wild. Blocking is
 * a decision to take when there is a month of reports to take it from.
 *
 * ── Authenticating without becoming a user ──────────────────────────────────
 *
 * The obvious way to run these would be to sign in and use the chat. That
 * creates an account in the customer's application and spends one of their
 * seats: a compliance check that quietly adds a user is its own finding. So
 * Svarg signs a short-lived token with the same secret the application already
 * verifies sign-ins with — derived from the deployment id, stored by neither
 * side — carrying a purpose of its own so a sign-in cannot be replayed into a
 * paid run of the suite.
 */

import jwt from 'jsonwebtoken';
import HostedDeployment, { isRunning } from '../models/HostedDeployment.js';
import { tenantAuthSecret } from './tenantAuthService.js';

/** Long enough to reach the application, short enough not to be worth keeping. */
const TOKEN_TTL = '2m';

/**
 * The suite runs three questions against the tenant's own model. That is
 * slower than a page load and much faster than a person, so the wait is
 * generous — a timeout here records "could not run", which is worse than
 * waiting.
 */
const RUN_TIMEOUT_MS = 90_000;

/** The token that lets Svarg, and only Svarg, ask for a report. */
export function conformanceToken(deployment) {
  const id = deployment?._id ? String(deployment._id) : '';
  const secret = tenantAuthSecret(id);
  if (!secret) return '';
  return jwt.sign({ purpose: 'conformance' }, secret, {
    issuer: 'svarg',
    audience: id,
    expiresIn: TOKEN_TTL,
  });
}

/** What the caller gets when the report could not be produced at all. */
function couldNotRun(reason) {
  return { ok: false, ran: false, reason, at: new Date().toISOString(), checks: [] };
}

/**
 * Ask one delivered application to check itself, and record what it said.
 *
 * Never throws. This runs from a sweep and from a button, and neither wants a
 * stack trace: a report that could not be produced is a recordable outcome,
 * and saying so is the whole point of the exercise.
 *
 * @param {string} deploymentId
 * @returns {Promise<object>} the report, stored on the deployment
 */
export async function runConformanceFor(deploymentId) {
  const dep = await HostedDeployment.findById(deploymentId);
  if (!dep) return couldNotRun('There is no such deployment.');

  // Nothing to examine until something is serving. Degraded counts — an
  // application that is up and unwell is exactly the one worth checking.
  if (!isRunning(dep.status)) {
    return couldNotRun(`This application is not running (${dep.status}).`);
  }
  const url = String(dep.railway?.url || '').replace(/\/+$/, '');
  if (!url) return couldNotRun('This deployment has no address.');

  const token = conformanceToken(dep);
  if (!token) {
    // Svarg's own JWT_SECRET is what the tenant secret is derived from.
    return couldNotRun('Svarg has no signing key, so it cannot prove to the application who is asking.');
  }

  let report;
  try {
    const res = await fetch(`${url}/api/conformance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });
    if (res.status === 404) {
      // Every application delivered before this existed. Not a finding about
      // the application — a fact about when it was built.
      return couldNotRun('This application was delivered before conformance checks existed. Update it to run them.');
    }
    if (res.status === 403) return couldNotRun('The application did not accept Svarg\'s token.');
    report = await res.json();
  } catch (err) {
    return couldNotRun(`The application could not be reached: ${err.name === 'TimeoutError' ? 'it did not answer in time' : err.message}`);
  }

  if (!report || !Array.isArray(report.checks)) {
    return couldNotRun('The application answered with something that is not a report.');
  }

  const stored = {
    ok: !!report.ok,
    ran: true,
    at: report.at || new Date().toISOString(),
    passed: report.passed || 0,
    failed: report.failed || 0,
    skipped: report.skipped || 0,
    dataset: report.dataset || null,
    checks: report.checks.slice(0, 40).map(c => ({
      id: String(c.id || '').slice(0, 60),
      standard: String(c.standard || '').slice(0, 60),
      name: String(c.name || '').slice(0, 200),
      // Three outcomes, not two. Skipped is not passed: an application with no
      // data cannot demonstrate its counts are right, and recording that as a
      // pass is the failure the suite exists to prevent, one level up.
      outcome: c.skipped ? 'skipped' : (c.passed ? 'passed' : 'failed'),
      detail: String(c.detail || '').slice(0, 500),
    })),
  };

  dep.conformance = stored;
  await dep.save();
  return stored;
}

/**
 * The one line a screen leads with.
 *
 * Deliberately says when it has never been run, rather than reading as a pass.
 */
export function conformanceSummary(report) {
  if (!report || !report.ran) return report?.reason || 'These checks have not been run yet.';
  if (report.ok && !report.skipped) return `All ${report.passed} checks passed.`;
  if (report.ok) return `${report.passed} passed, ${report.skipped} could not be checked.`;
  return `${report.failed} of ${report.passed + report.failed} checks failed.`;
}
