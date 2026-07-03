/**
 * SoorgaAI — Workspace Domain Definitions
 *
 * Single source of truth for:
 *   - All 6 workspace domains (IDs, titles, enabled flag)
 *   - AI Strategy focus areas (titles + default descriptions)
 *   - Suggested prompts per enabled domain
 */

export const DOMAINS = [
  {
    domainId:    'ai-strategy',
    title:       'AI Strategy',
    description: 'Define your AI vision, align investments, and build an execution roadmap.',
    enabled:     true,
    icon:        '🎯',

    focusAreas: [
      {
        id:             'vision-alignment',
        title:          'AI Vision & Business Alignment',
        defaultDescription:
          'Your AI vision has not yet been mapped to business outcomes. We will help you define clear strategic objectives, quantifiable goals, and a board-level narrative for AI transformation.',
      },
      {
        id:             'investment-prioritization',
        title:          'AI Investment & Prioritization',
        defaultDescription:
          'AI investment decisions are currently reactive or siloed. We will help you build a framework for evaluating, ranking, and funding AI initiatives based on strategic value and feasibility.',
      },
      {
        id:             'roadmap-execution',
        title:          'AI Roadmap & Execution',
        defaultDescription:
          'There is no structured timeline connecting your AI ambition to executable milestones. We will co-create a phased roadmap from quick wins to enterprise-scale AI capability.',
      },
      {
        id:             'culture-change',
        title:          'AI Culture & Change Management',
        defaultDescription:
          'Organizational readiness and cultural alignment for AI have not been systematically addressed. We will identify adoption barriers, leadership alignment needs, and change enablers.',
      },
      {
        id:             'metrics-value',
        title:          'AI Metrics & Value Tracking',
        defaultDescription:
          'AI impact is not yet measured consistently. We will define a value framework with leading and lagging indicators to track ROI, adoption, and business outcomes from AI investments.',
      },
    ],

    suggestedPrompts: [
      'What should our AI strategy focus on first given our current situation?',
      'How do we align AI investments with our business priorities?',
      'Help me build a realistic 12-month AI transformation roadmap.',
      'What cultural and organizational changes do we need to scale AI?',
    ],
  },

  {
    domainId:    'ai-use-cases',
    title:       'AI Use Cases',
    description: 'Identify, prioritize, and govern AI use cases across the enterprise.',
    enabled:     true,
    icon:        '💡',
    focusAreas:  [],
    suggestedPrompts: [],
  },

  {
    domainId:    'skills-workforce',
    title:       'Skills & Workforce',
    description: 'Upskill your teams and build the AI capabilities needed to deliver.',
    enabled:     true,
    icon:        '🧠',
    focusAreas:  [],
    suggestedPrompts: [],
  },

  {
    domainId:    'data-readiness',
    title:       'Data Readiness',
    description: 'Assess and strengthen your data foundation for AI.',
    enabled:     true,
    icon:        '📊',
    focusAreas:  [],
    suggestedPrompts: [],
  },

  {
    domainId:    'technology-infrastructure',
    title:       'Technology Infrastructure',
    description: 'Build the platforms and tooling required to deploy AI at scale.',
    enabled:     true,
    icon:        '⚙️',
    focusAreas:  [],
    suggestedPrompts: [],
  },

  {
    domainId:    'governance-security',
    title:       'Governance & Security',
    description: 'Establish responsible AI policies, ethics, and risk controls.',
    enabled:     true,
    icon:        '🔒',
    focusAreas:  [],
    suggestedPrompts: [],
  },
];

/** Lookup a domain by ID. Returns undefined if not found. */
export function getDomain(domainId) {
  return DOMAINS.find(d => d.domainId === domainId);
}

/** Return the focus area IDs for a given domain. */
export function getFocusAreaIds(domainId) {
  const domain = getDomain(domainId);
  return domain ? domain.focusAreas.map(fa => fa.id) : [];
}

export default DOMAINS;
