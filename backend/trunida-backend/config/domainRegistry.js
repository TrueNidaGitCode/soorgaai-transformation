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
  {
    id:      'skills-workforce',
    name:    'Skills & Workforce',
    enabled: true,
    kbPath:  'Skills_Workforce',
  },
  {
    id:      'governance-security',
    name:    'Governance & Security',
    enabled: false,
    kbPath:  'Governance_Security',
  },
];

export const enabledDomains = () => DOMAINS.filter(d => d.enabled);
export const getDomain      = (id) => DOMAINS.find(d => d.id === id) || null;
