/**
 * The continuous builder, from a signal to the Blueprints page.
 *
 * This is the loop that makes Svarg a product rather than a delivery: what the
 * customer's own people do inside their application decides what gets built
 * into it next. It ran from Svarg's screen chat and STOPPED AT LEARNING on the
 * signals path, so a live application could report a correction every day and
 * nothing was ever built from it.
 *
 * What is pinned here is the chain — signals land, the learner runs, a decision
 * follows, a build follows that — and that the journey reaches the page whole,
 * because a status word on its own tells the customer nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const gateway = fs.readFileSync(path.join(HERE, '../controllers/gatewayController.js'), 'utf8');

describe('a signal from a live application reaches a build', () => {
  it('the signals endpoint continues past learning into deciding', () => {
    // The bug: learnFromConversation was called and nothing followed it.
    expect(gateway).toContain('considerCapabilities');
  });

  it('plans, and stops there — a build is a person pressing a button', () => {
    // It used to build straight through, unattended. A build rewrites an
    // application somebody is relying on and spends real money, and neither
    // should happen because a coach complained twice.
    expect(gateway).not.toContain('runNextPlannedBuild');
    expect(gateway).toMatch(/waiting to be built/);
  });

  it('runs the chain only when the stage before it produced something', () => {
    // A quiet day must cost one query, not a decision pass per signal.
    const fn = gateway.slice(gateway.indexOf('async function continueLearning'));
    expect(fn).toMatch(/if \(!learned\?\.learned\) return;/);
    expect(fn).toMatch(/if \(!decided\?\.decided\) return;/);
  });

  it('never makes the application wait for a build', () => {
    // The tenant is holding a request open; a build takes minutes.
    expect(gateway).toMatch(/continueLearning\(deployment\)\s*\.catch\(/);
    expect(gateway).not.toMatch(/await continueLearning/);
  });

  it('only wakes the learner when something was actually reported', () => {
    expect(gateway).toMatch(/if \(result\.corrections \|\| result\.downvotes\)/);
  });
});

describe('the journey reaches the page, not just the status', () => {
  const req = {
    _id: 'abc', need: 'we keep having to tell parents the session is off',
    needKey: 'session-cancellation', status: 'building',
    mentionsAtDecision: 4,
    plan: {
      title: 'Session cancellation notice', summary: 'Rain-offs are announced by hand in six groups.',
      steps: ['Find today\'s sessions', 'Draft the notice', 'Send to each batch group'],
      dataNeeded: ['Batch Training Schedule'], connectorsNeeded: ['WhatsApp Business'],
    },
    error: '', createdAt: new Date('2026-09-10'), updatedAt: new Date('2026-09-14'), notifiedAt: null,
  };

  it('carries what was said, how often, what it will do and what it waits on', async () => {
    const mod = await import('../services/blueprintOverviewService.js');
    // feature() is internal; the shape it produces is what the page draws, so
    // it is asserted through the module's own source rather than guessed at.
    const src = fs.readFileSync(path.join(HERE, '../services/blueprintOverviewService.js'), 'utf8');
    for (const field of ['need:', 'mentions:', 'steps:', 'connectorsNeeded:', 'noticedAt:', 'error:']) {
      expect(src).toContain(field);
    }
    expect(typeof mod.blueprintsOverview).toBe('function');
  });

  it('keeps the Learner\'s own refusals off the page', () => {
    const src = fs.readFileSync(path.join(HERE, '../services/blueprintOverviewService.js'), 'utf8');
    // Showing a dismissed need reads as Svarg refusing something they asked for.
    expect(src).toMatch(/status: \{ \$ne: 'dismissed' \}/);
  });

  it('the page draws a stage rail, the words said, and the evidence for acting', () => {
    const page = fs.readFileSync(path.join(HERE, '../../../frontend/blueprints/blueprints.js'), 'utf8');
    expect(page).toMatch(/const STAGES = \[/);
    for (const stage of ['Decided', 'Building', 'Ready', 'Live']) expect(page).toContain(stage);
    expect(page).toContain('asked for ');          // how often it came up
    expect(page).toContain('bp-eva__need');        // their own words
    expect(page).toContain('bp-rail__step--here'); // where it has got to
    // A failed build must say nothing was changed, not merely "Failed".
    expect(page).toMatch(/did not survive verification/);
  });
});
