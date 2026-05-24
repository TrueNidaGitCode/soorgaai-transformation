/**
 * SoorgaAI - AI Maturity Assessment Question Bank
 * 7 Domains × 5 Questions = 35 Questions Total
 * Each question scored 1–5 (1 = Not at all, 5 = Fully)
 */

export const MATURITY_STAGES = [
  {
    stage: 'AI Scramble',
    minScore: 0,
    maxScore: 20,
    description:
      'Your organization is in the early stages of AI awareness. AI efforts are ad hoc, uncoordinated, and lack strategic direction. The journey begins here.',
    color: '#E74C3C',
  },
  {
    stage: 'AI Pivot',
    minScore: 21,
    maxScore: 40,
    description:
      'Your organization is beginning to recognize the value of AI and making initial investments. Pilots exist but are siloed, and a cohesive strategy is emerging.',
    color: '#E67E22',
  },
  {
    stage: 'AI Alignment',
    minScore: 41,
    maxScore: 60,
    description:
      'AI initiatives are becoming aligned with business strategy. Cross-functional collaboration is growing, and repeatable processes are taking shape.',
    color: '#F1C40F',
  },
  {
    stage: 'AI Transform',
    minScore: 61,
    maxScore: 80,
    description:
      'AI is embedded into core business processes. The organization is scaling AI systematically with strong governance and measurable business impact.',
    color: '#2ECC71',
  },
  {
    stage: 'AI-Fueled Enterprise',
    minScore: 81,
    maxScore: 100,
    description:
      'AI is a core competitive differentiator. The organization continuously innovates, operates with AI-first thinking, and sets industry benchmarks.',
    color: '#3498DB',
  },
];

export const SCALE_OPTIONS = [
  { value: 1, label: 'Not at all' },
  { value: 2, label: 'Minimally' },
  { value: 3, label: 'Partially' },
  { value: 4, label: 'Mostly' },
  { value: 5, label: 'Fully' },
];

export const DOMAINS = [
  // ─────────────────────────────────────────────────────────
  // DOMAIN 1: AI STRATEGY
  // ─────────────────────────────────────────────────────────
  {
    id: 'ai_strategy',
    name: 'AI Strategy',
    description:
      'Evaluates whether your organization has a clear, documented AI strategy aligned with business goals.',
    icon: '🎯',
    weight: 1 / 7,
    questions: [
      {
        id: 'ai_strategy_1',
        text: 'Does your organization have a documented AI strategy aligned with overall business objectives?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'ai_strategy_2',
        text: 'How clearly defined are your organization\'s AI investment priorities and budget allocation?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'ai_strategy_3',
        text: 'Does your organization have a structured roadmap for AI adoption over the next 12–24 months?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'ai_strategy_4',
        text: 'How well does your AI strategy differentiate your organization from competitors?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'ai_strategy_5',
        text: 'Are there clear, measurable KPIs defined to track the success of your AI strategy?',
        options: SCALE_OPTIONS,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // DOMAIN 2: LEADERSHIP
  // ─────────────────────────────────────────────────────────
  {
    id: 'leadership',
    name: 'Leadership',
    description:
      'Measures the degree to which senior leadership actively champions and enables AI transformation.',
    icon: '👥',
    weight: 1 / 7,
    questions: [
      {
        id: 'leadership_1',
        text: 'How actively does your C-suite champion AI initiatives and model AI-first thinking?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'leadership_2',
        text: 'Does your organization have a dedicated executive role (e.g. CDO, CAIO) accountable for AI transformation?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'leadership_3',
        text: 'How well does leadership communicate a clear AI vision and inspire organizational confidence?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'leadership_4',
        text: 'Does leadership allocate sufficient budget and headcount to support meaningful AI initiatives?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'leadership_5',
        text: 'How effectively does leadership remove organizational barriers that slow AI adoption?',
        options: SCALE_OPTIONS,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // DOMAIN 3: AI USE CASES
  // ─────────────────────────────────────────────────────────
  {
    id: 'ai_use_cases',
    name: 'AI Use Cases',
    description:
      'Assesses the breadth, depth, and business impact of AI use cases your organization has identified and deployed.',
    icon: '💡',
    weight: 1 / 7,
    questions: [
      {
        id: 'ai_use_cases_1',
        text: 'How many AI use cases does your organization have deployed in production today?',
        options: [
          { value: 1, label: 'None' },
          { value: 2, label: '1–2 pilots' },
          { value: 3, label: '3–5 in production' },
          { value: 4, label: '6–10 in production' },
          { value: 5, label: '10+ in production and scaling' },
        ],
      },
      {
        id: 'ai_use_cases_2',
        text: 'How clearly do your AI use cases connect to measurable business value (revenue, cost, efficiency)?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'ai_use_cases_3',
        text: 'Does your organization have a structured process to identify, prioritize, and fund new AI use cases?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'ai_use_cases_4',
        text: 'How consistently do your AI projects move from pilot to full-scale production?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'ai_use_cases_5',
        text: 'Are your AI use cases connected to a broader enterprise transformation roadmap?',
        options: SCALE_OPTIONS,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // DOMAIN 4: DATA READINESS
  // ─────────────────────────────────────────────────────────
  {
    id: 'data_readiness',
    name: 'Data Readiness',
    description:
      'Evaluates the quality, accessibility, and governance of your organization\'s data to power AI initiatives.',
    icon: '🗄️',
    weight: 1 / 7,
    questions: [
      {
        id: 'data_readiness_1',
        text: 'How would you rate the overall quality, accuracy, and completeness of your organization\'s data?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'data_readiness_2',
        text: 'Does your organization have centralized data infrastructure (e.g. data warehouse, data lake, lakehouse)?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'data_readiness_3',
        text: 'How mature are your data governance practices (ownership, stewardship, cataloguing)?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'data_readiness_4',
        text: 'How easily and securely can AI and analytics teams access the data they need?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'data_readiness_5',
        text: 'Does your organization actively manage data pipelines and maintain data freshness for AI workloads?',
        options: SCALE_OPTIONS,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // DOMAIN 5: TECHNOLOGY INFRASTRUCTURE
  // ─────────────────────────────────────────────────────────
  {
    id: 'technology_infrastructure',
    name: 'Technology Infrastructure',
    description:
      'Measures the maturity of your technology stack, cloud readiness, and MLOps capabilities.',
    icon: '⚙️',
    weight: 1 / 7,
    questions: [
      {
        id: 'technology_infrastructure_1',
        text: 'How modern and cloud-ready is your organization\'s technology stack for AI/ML workloads?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'technology_infrastructure_2',
        text: 'Does your organization use MLOps practices (CI/CD for models, monitoring, retraining pipelines)?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'technology_infrastructure_3',
        text: 'How well are your AI tools and platforms integrated with existing business systems?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'technology_infrastructure_4',
        text: 'How scalable is your current infrastructure to support AI initiatives at enterprise scale?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'technology_infrastructure_5',
        text: 'Does your organization have platforms to experiment with and evaluate new AI models (e.g. LLMs, foundational models)?',
        options: SCALE_OPTIONS,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // DOMAIN 6: SKILLS & WORKFORCE
  // ─────────────────────────────────────────────────────────
  {
    id: 'skills_workforce',
    name: 'Skills & Workforce',
    description:
      'Assesses your organization\'s AI talent, upskilling programs, and cultural readiness for AI adoption.',
    icon: '🧠',
    weight: 1 / 7,
    questions: [
      {
        id: 'skills_workforce_1',
        text: 'Does your organization have sufficient dedicated AI/ML talent (data scientists, ML engineers, AI product managers)?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'skills_workforce_2',
        text: 'How well-equipped are your business and functional teams to work with AI-powered tools and insights?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'skills_workforce_3',
        text: 'Does your organization have structured AI literacy and upskilling programs for employees at all levels?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'skills_workforce_4',
        text: 'How strong is your organization\'s culture of experimentation, learning, and tolerance for failure in AI projects?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'skills_workforce_5',
        text: 'How effectively does your organization attract, retain, and develop top AI talent?',
        options: SCALE_OPTIONS,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────
  // DOMAIN 7: GOVERNANCE & SECURITY
  // ─────────────────────────────────────────────────────────
  {
    id: 'governance_security',
    name: 'Governance & Security',
    description:
      'Evaluates your organization\'s AI ethics policies, risk management, regulatory compliance, and model accountability.',
    icon: '🛡️',
    weight: 1 / 7,
    questions: [
      {
        id: 'governance_security_1',
        text: 'Does your organization have documented AI ethics principles or responsible AI policies?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'governance_security_2',
        text: 'How well does your organization identify, assess, and mitigate risks associated with AI systems?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'governance_security_3',
        text: 'Are there clear processes for monitoring AI model performance, drift, and accountability post-deployment?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'governance_security_4',
        text: 'How well does your organization comply with relevant AI and data privacy regulations (e.g. GDPR, AI Act)?',
        options: SCALE_OPTIONS,
      },
      {
        id: 'governance_security_5',
        text: 'How transparent are your AI systems to internal stakeholders, customers, and regulators?',
        options: SCALE_OPTIONS,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────
// Helper: Flatten all questions into a single map for quick lookup
// ─────────────────────────────────────────────────────────
export const QUESTION_MAP = DOMAINS.reduce((map, domain) => {
  domain.questions.forEach((q) => {
    map[q.id] = { ...q, domainId: domain.id, domainName: domain.name };
  });
  return map;
}, {});

export const TOTAL_QUESTIONS = DOMAINS.reduce((sum, d) => sum + d.questions.length, 0);
