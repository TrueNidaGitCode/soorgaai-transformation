/**
 * A watcher asks the same question every day, so it must get the same answer
 * when the data has not changed.
 *
 * ── The defect this exists for ─────────────────────────────────────────────
 *
 * Every run re-asked the model how to answer the watcher's question. The
 * model is not deterministic — and the provider chain fails over between
 * three of them — so two runs of one watcher could read different datasets,
 * or filter on a different column, and produce different rows.
 *
 * The findings then moved on their own. A customer opened the board and was
 * told something had resolved itself while nothing in their business had
 * changed, and something new needed them when nothing had happened. That is
 * the worst thing this product can say, because the entire promise is that a
 * change in the findings means a change in the business.
 *
 * So the plan is made once and pinned to the watcher. It is re-validated
 * against today's datasets on every run rather than trusted, and a plan that
 * no longer fits sends the watcher back to the model to plan again.
 */
import fs from 'fs';
import { describe, it, expect } from 'vitest';
import { sanitisePlan } from '../eame-template/services/answerService.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const SVC = read('../eame-template/services/agentService.js');
const ANS = read('../eame-template/services/answerService.js');
const SRV = read('../eame-template/server.js');

describe('a watcher reuses the plan it was given', () => {
  it('hands its stored plan to the pipeline instead of planning again', () => {
    expect(SVC).toContain("const result = await ask({ question: agent.question, usePlan: agent.plan || null });");
    // And the scheduler carries it through, which is the half that is easy to
    // leave out: the pipeline would accept a plan nobody ever passes.
    expect(SRV).toContain("startAgentScheduler(({ question, usePlan }) => answer({ question, kind: 'own', usePlan }));");
    expect(ANS).toContain('usePlan = null');
  });

  it('remembers a plan only once it has produced steps', () => {
    /*
     * A plan that read no datasets is not one to repeat every morning for
     * ever — it is the run that should be tried again.
     */
    expect(SVC).toContain('if (!agent.plan && result?.planned?.steps?.length) {');
    expect(SVC).toContain("await agentsCollection().updateOne({ _id }, { $set: { plan: result.planned } })");
  });

  it('re-validates a stored plan against today’s datasets, never trusts it', () => {
    /*
     * The pinned plan is data written months ago. A column renamed since then
     * would otherwise be executed as if it still existed.
     */
    expect(ANS).toContain('const pinned = usePlan ? sanitisePlan(usePlan, cat) : null;');
    expect(ANS).toContain('const planned = pinned && pinned.steps.length');
  });

  it('plans afresh when the stored plan no longer fits', () => {
    // Not a refusal, and not a wedge: the watcher repairs itself next run.
    const m = ANS.match(/const planned = pinned && pinned\.steps\.length[\s\S]{0,160}/);
    expect(m, 'the fallback moved').toBeTruthy();
    expect(m[0]).toContain('await plan(');
  });

  it('forgets the plan when a stopped watcher is started again', () => {
    /*
     * A watcher that failed three times usually failed because its pinned
     * plan stopped fitting. "Start it again" must mean try afresh, not run
     * the same broken thing three more times and stop again.
     */
    expect(SVC).toContain("const $unset = enabled ? { plan: '' } : undefined;");
    expect(SVC).toContain('$unset ? { $set, $unset } : { $set }');
  });
});

describe('the validator a stored plan is held to', () => {
  const cat = [
    { name: 'Appointments', columns: ['client_id', 'status', 'when'], rows: 20 },
    { name: 'Packages', columns: ['client_id', 'package_status'], rows: 19 },
  ];

  it('keeps a plan whose datasets and columns are still there', () => {
    const p = sanitisePlan({ steps: [{ op: 'select', dataset: 'Appointments', where: [{ column: 'status', is: 'No-Show' }] }] }, cat);
    expect(p.steps.length).toBe(1);
    expect(p.steps[0].dataset).toBe('Appointments');
  });

  it('drops a step naming a dataset that is gone', () => {
    // Which is what sends the watcher back to the model, rather than reading
    // a dataset that no longer exists and reporting nothing.
    const p = sanitisePlan({ steps: [{ op: 'select', dataset: 'Session Logs', where: [] }] }, cat);
    expect(p.steps.length).toBe(0);
  });

  it('survives a plan that is not a plan at all', () => {
    // A stored document can be anything after a bad write; none of these may
    // throw on a watcher's morning run.
    for (const junk of [null, undefined, {}, { steps: null }, { steps: 'nope' }, 'string', 42]) {
      expect(() => sanitisePlan(junk, cat)).not.toThrow();
      expect(sanitisePlan(junk, cat).steps).toEqual([]);
    }
  });
});

describe('what a person asks is still planned fresh', () => {
  it('pins nothing for a question typed in the chat', () => {
    /*
     * The asymmetry is the point. A person's question has never been asked
     * before, so there is nothing to reuse; a watcher's has been asked every
     * morning for months. Only the caller that repeats itself passes a plan.
     */
    const chat = read('../eame-template/controllers/chatController.js');
    expect(chat).not.toContain('usePlan');
  });
});
