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
    icon:        `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#5CC5A7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,

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
    icon:        `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
    focusAreas:  [],
    suggestedPrompts: [],
  },

  {
    domainId:    'skills-workforce',
    title:       'Skills & Workforce',
    description: 'Upskill your teams and build the AI capabilities needed to deliver.',
    enabled:     true,
    icon:        `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    focusAreas:  [],
    suggestedPrompts: [],
  },

  {
    domainId:    'data-readiness',
    title:       'Data Readiness',
    description: 'Assess and strengthen your data foundation for AI.',
    enabled:     true,
    icon:        `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
    focusAreas:  [],
    suggestedPrompts: [],
  },

  {
    domainId:    'technology-infrastructure',
    title:       'Technology Infrastructure',
    description: 'Build the platforms and tooling required to deploy AI at scale.',
    enabled:     true,
    icon:        `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M9 2v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/></svg>`,
    focusAreas:  [],
    suggestedPrompts: [],
  },

  {
    domainId:    'governance-security',
    title:       'Governance & Security',
    description: 'Establish responsible AI policies, ethics, and risk controls.',
    enabled:     true,
    icon:        `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
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
