/**
 * SoorgaAI — Domain Registry
 *
 * Single source of truth for all transformation domains.
 * Set enabled: false to hide a domain from generation and the workspace.
 * kbPath must match the folder name under knowledge_base/automotive/enterprise_ai/
 */

export const DOMAINS = [
  {
    id:      'ai-use-cases',
    name:    'AI Use Cases',
    enabled: true,
    kbPath:  'AI_Use_Cases',
  },
  {
    id:      'ai-strategy',
    name:    'AI Strategy',
    enabled: true,
    kbPath:  'AI_Strategy',
  },
  {
    id:      'data-readiness',
    name:    'Data Readiness',
    enabled: true,
    kbPath:  'Data_Readiness',
  },
  {
    id:      'technology-infrastructure',
    name:    'Technology Infrastructure',
    enabled: true,
    kbPath:  'Technology_Infrastructure',
  },
  /*
   * Off for now. Enterprise-shaped domains, sold to owner-operators.
   *
   * A coaching centre with four staff has no workforce strategy and no
   * governance function, and both domains generate polite, general content
   * that gets skimmed once. Measured across 36 blueprints, Skills & Workforce
   * produced the least of anything — 1.9 sections per blueprint from two
   * capabilities, against 10.6 for AI Strategy.
   *
   * Both sit LAST in the chain, so nothing downstream loses their insights:
   * each capability is grounded on the ones before it, and there is nothing
   * after these two. Existing blueprints keep everything they already have —
   * enabledDomains() governs new generation and what the workspace lists.
   *
   * Turn them back on for enterprise, where a CIO does have both functions and
   * a board asking about the second. That wants the list to become per-plan or
   * per-industry rather than global, which is the work this defers.
   */
  {
    id:      'skills-workforce',
    name:    'Skills & Workforce',
    enabled: false,
    kbPath:  'Skills_Workforce',
  },
  {
    id:      'governance-security',
    name:    'Governance & Ethics',
    enabled: false,
    kbPath:  'Governance_Security',
  },
];

export const enabledDomains = () => DOMAINS.filter(d => d.enabled);
export const getDomain      = (id) => DOMAINS.find(d => d.id === id) || null;
