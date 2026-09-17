/**
 * A need arriving in conversation goes back through Think before Execute.
 *
 * The Learner noticed what a customer kept asking for and planned a capability
 * from it — using the business description, the original objective, their
 * recurring tasks and their preferences. Not the ranked roadmap Cob had
 * already written for that same business, which sat unread in the blueprint.
 *
 * So a coaching centre asking for fee reminders six weeks after go-live got a
 * capability planned from nothing, when fee reminders were the second item on
 * their own roadmap — technique chosen, value case made, data identified.
 * Planning it afresh threw all of that away and produced a smaller, vaguer
 * version of something already thought through.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

// Hoisted: a vi.mock factory is lifted above every const in the file, so a
// plain one would not exist yet when the factory runs.
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../services/llmService.js', () => ({ generate }));
vi.mock('../models/CapabilityRequest.js', () => ({ default: {} }));
vi.mock('../models/CustomerUnderstanding.js', () => ({ default: {} }));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: {} }));
vi.mock('../models/HostedDeployment.js', () => ({ default: {} }));

import { parsePlan, planCapability } from '../services/capabilityDecisionService.js';

const OPPS = [
  { name: 'Predictive Analytics for Student Churn', plain: 'Spot students dropping out', why: '' },
  { name: 'Classification and Automated Fee Reminders', plain: 'Chase unpaid fees', why: '' },
];

const blueprint = {
  businessObjective: 'Coaches spend hours chasing fees and only notice a student left weeks later.',
  domains: [{
    domainId: 'ai-use-cases',
    status: 'completed',
    capabilities: [{
      sections: [
        { title: 'AI Opportunity Discovery', brief: { aiOpportunities: OPPS } },
        { title: 'AI Implementation Prioritization', brief: {
          recommendedInitiativeName: 'Predictive Analytics for Student Churn',
          priorityQuadrants: [{ id: 'quick-wins', label: 'Quick Wins', initiatives: OPPS.map(o => o.name) }],
        } },
      ],
    }],
  }],
};

const planned = (over = {}) => JSON.stringify({
  actionable: true,
  title: 'Fee reminders',
  summary: 'Chase unpaid fees automatically.',
  steps: ['Find unpaid fees', 'Message the parent'],
  dataNeeded: [], connectorsNeeded: [],
  ...over,
});

beforeEach(() => { generate.mockReset(); vi.clearAllMocks(); });

// ── The roadmap reaches the planner ──────────────────────────────────────────

describe('what the planner is given', () => {
  it('is shown every opportunity Cob identified, not just the objective', async () => {
    generate.mockResolvedValue({ text: planned() });
    await planCapability({ need: 'Can it chase unpaid fees?', understanding: {}, blueprint });

    const sent = generate.mock.calls[0][0].userMessage;
    expect(sent).toContain('THEIR ROADMAP');
    for (const o of OPPS) expect(sent).toContain(o.name);
  });

  it('is told which one was already built', async () => {
    // Otherwise it can plan again the thing the application already does.
    generate.mockResolvedValue({ text: planned() });
    await planCapability({ need: 'x', understanding: {}, blueprint });
    expect(generate.mock.calls[0][0].userMessage).toContain('the one already built');
  });

  it('is told to check the roadmap before planning anything', async () => {
    generate.mockResolvedValue({ text: planned() });
    await planCapability({ need: 'x', understanding: {}, blueprint });
    const rules = generate.mock.calls[0][0].systemPrompt;
    expect(rules).toContain('THEIR ROADMAP IS THE FIRST THING TO CHECK');
    expect(rules).toMatch(/Planning it afresh throws all of that away/);
  });

  it('still plans for a blueprint that has no roadmap yet', async () => {
    // Every application delivered before discovery produced a full list, and
    // a blueprint still generating. Neither may lose the Learner.
    generate.mockResolvedValue({ text: planned() });
    const plan = await planCapability({ need: 'x', understanding: {}, blueprint: null });
    expect(plan.actionable).toBe(true);
    expect(generate.mock.calls[0][0].userMessage).not.toContain('THEIR ROADMAP');
  });
});

// ── The answer is a join key, so it is checked ───────────────────────────────

describe('which opportunity it turned out to be', () => {
  it('records the match when the planner recognises one', () => {
    const plan = parsePlan(planned({ opportunity: 'Classification and Automated Fee Reminders' }), OPPS);
    expect(plan.opportunityName).toBe('Classification and Automated Fee Reminders');
  });

  it('accepts a paraphrase but stores the canonical name', () => {
    /*
     * The name is a join key — the ranking, the value section and the delivery
     * phases are all keyed on that exact string. Storing what the model typed
     * would match nothing later, which reads as the link not working rather
     * than as the model being loose.
     */
    const plan = parsePlan(planned({ opportunity: 'classification and automated fee-reminders' }), OPPS);
    expect(plan.opportunityName).toBe('Classification and Automated Fee Reminders');
  });

  it('stores nothing when the planner names something that is not on the list', () => {
    const plan = parsePlan(planned({ opportunity: 'Quantum Fee Telepathy' }), OPPS);
    expect(plan.opportunityName).toBe('');
    // And the plan is still a plan: an unrecognised name is not a refusal.
    expect(plan.actionable).toBe(true);
  });

  it('treats "none of them" as a real answer', () => {
    // A business changes, and a need nobody foresaw is worth building too.
    expect(parsePlan(planned({ opportunity: '' }), OPPS).opportunityName).toBe('');
    expect(parsePlan(planned(), OPPS).opportunityName).toBe('');
  });

  it('carries the field on a refusal too, so the shape never varies', () => {
    const plan = parsePlan(JSON.stringify({ actionable: false, reason: 'a wish, not a capability' }), OPPS);
    expect(plan.actionable).toBe(false);
    expect(plan.opportunityName).toBe('');
  });

  it('is empty when there was no roadmap to match against', () => {
    expect(parsePlan(planned({ opportunity: 'Anything' })).opportunityName).toBe('');
  });
});

// ── The edge is written down ────────────────────────────────────────────────

describe('the record that closes the loop', () => {
  const src = readFileSync(new URL('../services/capabilityDecisionService.js', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../models/CapabilityRequest.js', import.meta.url), 'utf8');

  it('stores which opportunity the decision was for', () => {
    expect(src).toContain("opportunityName: plan.opportunityName || '',");
  });

  it('declares the field on the request, and on the plan inside it', () => {
    /*
     * Both, deliberately. A subdocument is strict: a field the plan carries
     * and the schema does not is dropped on write with nothing said, and the
     * copy stored beside it would then disagree with it.
     */
    expect(model.match(/opportunityName: \{ type: String/g)).toHaveLength(2);
  });

  it('indexes it, because the whole point is reading back by opportunity', () => {
    expect(model).toContain("opportunityName: { type: String, default: '', index: true },");
  });
});
