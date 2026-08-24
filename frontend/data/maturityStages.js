/**
 * Svarg — Maturity Stages Data
 * Single source of truth for the 5 AI maturity stages on the frontend.
 *
 * MUST stay in sync with:
 *   backend/trunida-backend/knowledge-base/maturity-stages.json
 */

export const MATURITY_STAGES = [
  {
    id:          1,
    name:        'AI Scramble',
    descriptor:  'Ad hoc, no strategy',
    color:       '#E74C3C',
    tagline:     'Ad hoc. Uncoordinated. Reactive.',
    minScore:    0,
    maxScore:    20,
  },
  {
    id:          2,
    name:        'AI Pivot',
    descriptor:  'Early pilots, siloed',
    color:       '#E67E22',
    tagline:     'Awareness is rising. First pilots underway.',
    minScore:    21,
    maxScore:    40,
  },
  {
    id:          3,
    name:        'AI Alignment',
    descriptor:  'Strategy forming, cross-functional',
    color:       '#F1C40F',
    tagline:     'Strategy is forming. Teams are collaborating.',
    minScore:    41,
    maxScore:    60,
  },
  {
    id:          4,
    name:        'AI Transform',
    descriptor:  'AI embedded in core processes',
    color:       '#2ECC71',
    tagline:     'AI is embedded. Scaling systematically.',
    minScore:    61,
    maxScore:    80,
  },
  {
    id:          5,
    name:        'AI-Fueled Enterprise',
    descriptor:  'AI as competitive differentiator',
    color:       '#3498DB',
    tagline:     'AI is the competitive core. Industry leading.',
    minScore:    81,
    maxScore:    100,
  },
];
