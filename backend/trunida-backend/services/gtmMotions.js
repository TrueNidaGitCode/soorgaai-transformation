/**
 * Svarg — how a first conversation actually starts
 *
 * Outreach used to mean one thing: a cold email. That was never the plan, it
 * was just the only motion with machinery behind it, and a screen that can only
 * record one route quietly becomes a strategy that only runs one route.
 *
 * For a new category, the first enterprise sale turns on trust, a compelling
 * use case, and someone willing to sponsor the experiment — none of which cold
 * volume produces. So cold email is one motion here, not the default one.
 *
 * ── Three lanes, not ten tabs ──────────────────────────────────────────────
 *
 * The ten motions collapse into three by how the conversation starts, and that
 * is the distinction that changes what you actually do:
 *
 *   introduced — someone vouches for you. The work is the ask, not the pitch.
 *   shown      — they watch it work on their own problem. The work is the session.
 *   broadcast  — you reach out cold. The work is being specific enough to answer.
 *
 * Lanes group; motions are what you file a lead under. Both live here so the
 * screen and the validator can never disagree about which motions exist.
 *
 * ── Why every motion is tracked the same way ───────────────────────────────
 *
 * A motion you cannot count is a motion you cannot tell is working. Every one
 * of these ends in the same place — a named person at an organisation you are
 * trying to have a first real conversation with — so they share one row shape.
 * What differs is the route in (`via`) and what has to happen next.
 */

/**
 * @typedef Motion
 * @property {string} key       stored on the lead; never change one in place
 * @property {string} lane      which lane it renders under
 * @property {string} label     tab-strip and dropdown text
 * @property {string} summary   one line: what this motion is
 * @property {string} ask       the sentence to actually say. The hardest part of
 *                              most of these is the wording of the ask, and a
 *                              playbook that omits it is decoration.
 * @property {string} viaLabel  what the `via` field means here, as a placeholder
 * @property {boolean} emails   whether the send/sequence machinery applies
 */

export const LANES = [
  {
    key: 'introduced',
    label: 'Introduced',
    blurb: 'Someone vouches for you. Highest-probability route to a first enterprise '
      + 'customer, because trust arrives before the pitch does — the work is the wording '
      + 'of the ask, not the strength of the pitch.',
  },
  {
    key: 'shown',
    label: 'Shown',
    blurb: 'They watch Svarg work on a problem that is theirs. Stronger than any deck: '
      + 'the transformation happens in front of them, and the close is simply asking '
      + 'whether to take it into a real pilot.',
  },
  {
    key: 'broadcast',
    label: 'Broadcast',
    blurb: 'You reach out to people who have never heard of you. Lowest conversion per '
      + 'contact and the only lane that scales without your calendar — worth running, '
      + 'not worth leading with.',
  },
];

export const MOTIONS = [
  // ── Introduced ────────────────────────────────────────────────────────────
  {
    key: 'warm-intro',
    lane: 'introduced',
    label: 'Warm introduction',
    emails: false,
    viaLabel: 'Who is introducing you',
    summary: 'The single highest-probability route to a first customer. Former colleagues, '
      + 'CTOs you know, consultants, investors, founders, system integrators, industry '
      + 'associations, friends inside large enterprises.',
    ask: 'I am looking for 2–3 engineering leaders who are actively exploring AI. I would '
      + 'love an introduction — not to sell them, but to show them what we have built.',
    note: 'Do not ask "do you know anyone who might buy Svarg?". Ask "who is responsible for '
      + 'AI adoption / engineering transformation / digital initiatives at [company]?" — a '
      + 'question about a role gets an answer; a question about a purchase gets a shrug.',
  },
  {
    key: 'referral',
    lane: 'introduced',
    label: 'Referral from a pilot',
    emails: false,
    viaLabel: 'Which customer is referring',
    summary: 'Once somebody has had value from Svarg, the people they know have the same '
      + 'problem. Available only after a pilot has actually landed.',
    ask: 'Do you know another engineering leader who is trying to find practical AI use '
      + 'cases but struggling to move beyond PoCs?',
    note: 'Make the referral problem-oriented, never company-oriented. "Can you refer us?" '
      + 'asks them to vouch for a vendor; naming the problem asks them to think of a person, '
      + 'which is a question people can actually answer.',
  },
  {
    key: 'partner',
    lane: 'introduced',
    label: 'Consultant / SI partner',
    emails: false,
    viaLabel: 'Which firm',
    summary: 'Firms already advising enterprises on digital transformation, engineering '
      + 'transformation, AI strategy, ASPICE, product development or manufacturing. They '
      + 'bring the enterprise relationship; Svarg becomes their execution layer.',
    ask: 'You identify the opportunity. Svarg turns it into a working AI solution.',
    note: 'Their problem is that they can name a transformation opportunity but '
      + 'implementation takes months. That gap is the whole pitch. This can shorten the '
      + 'enterprise acquisition cycle more than anything else in this list.',
  },
  {
    key: 'expansion',
    lane: 'introduced',
    label: 'Expansion inside a customer',
    emails: false,
    viaLabel: 'Which account and department',
    summary: 'One department in, then the next. Engineering → Quality → Program Management '
      + '→ Leadership. A first customer can be five to ten use cases.',
    ask: 'Your team is using this for programme risk. Who else is dealing with the same '
      + 'kind of problem — quality, delivery, planning?',
    note: 'When you get one department inside a company, do not immediately go looking for '
      + 'another company. Expanding inside an organisation that already trusts you is far '
      + 'easier than acquiring five new enterprises.',
  },

  // ── Shown ─────────────────────────────────────────────────────────────────
  {
    key: 'design-partner',
    lane: 'shown',
    label: 'Design partner',
    emails: false,
    viaLabel: 'The one real problem from their team',
    summary: 'Three companies, not thirty. They help shape Svarg; you take one real business '
      + 'problem from their team and turn it into a working AI application.',
    ask: 'We are looking for 3 engineering organisations to help us shape Svarg. We will take '
      + 'one real business problem from your team and turn it into a working AI application. '
      + 'In return, we want your feedback. You do not need to buy anything for the initial '
      + 'exploration.',
    note: 'You are not selling software. You are inviting them to become a design partner. '
      + 'Company → Objective → AI Opportunity → Working Application → Pilot. Once they see '
      + 'value, "let us deploy this properly for your team" is the first enterprise sale.',
  },
  {
    key: 'workshop',
    lane: 'shown',
    label: 'AI Opportunity Workshop',
    emails: false,
    viaLabel: 'Attendee and date',
    summary: 'A founder-led 90-minute session, not a sales meeting. Bring one problem; watch '
      + 'objective → data → AI opportunity → solution → working application happen live.',
    ask: 'Give us one business or engineering problem you are struggling with, and we will '
      + 'spend 90 minutes turning it into a working application in front of you.',
    note: 'Sell the workshop, not the product. The conversion point is the last question of '
      + 'the session: "would you like us to take this into a real pilot using your data?"',
  },
  {
    key: 'build-for-them',
    lane: 'shown',
    label: 'Build for them first',
    emails: false,
    viaLabel: 'What you built, and from what public information',
    summary: 'Reverse demoing. Research a target, find one obvious problem, build a small '
      + 'version from public information, then show up with it already working.',
    ask: 'We spent some time looking at [problem] and built a working version using publicly '
      + 'available information. We would like you to try it.',
    note: 'You are not asking "do you have a problem?" — you are saying "we found one, here '
      + 'is what we built". The Flux Auto experiment is already this motion; it is worth '
      + 'running more of them.',
  },
  {
    key: 'paid-poc',
    lane: 'shown',
    label: 'Paid proof-of-concept',
    emails: false,
    viaLabel: 'The problem being piloted',
    summary: 'The commercial wedge. Not an enterprise licence — one business problem, one '
      + 'working AI application, four weeks: discovery, company knowledge, data integration, '
      + 'solution, application, deployment, measurement, pilot report.',
    ask: 'Rather than a licence, buy a pilot: one business problem to one working AI '
      + 'application in four weeks, with a report at the end.',
    note: 'This turns a vague platform decision into a clear, small, bounded buying decision. '
      + 'It is where the other motions in this lane are meant to land.',
  },

  // ── Broadcast ─────────────────────────────────────────────────────────────
  {
    key: 'cold-email',
    lane: 'broadcast',
    label: 'Cold email',
    emails: true,
    viaLabel: '',
    summary: 'The only motion with sending machinery: a written email, a tracked link, and '
      + 'at most six sends a week apart. Worth running in the background — not worth making '
      + 'the primary route to a first enterprise customer.',
    ask: '',
    note: 'Generate reads their website and writes for the function you entered. Leads leave '
      + 'this stage on signup, reply or unsubscribe.',
  },
  {
    key: 'linkedin',
    lane: 'broadcast',
    label: 'LinkedIn',
    emails: false,
    viaLabel: 'Which post or thread',
    summary: 'A conversation channel, not an announcement channel. Post the experiments — '
      + 'what Svarg found when pointed at a real company, and what got built — and let the '
      + 'curiosity come to you.',
    ask: 'Want to try it with one of your problems?',
    note: 'Never post "we are excited to announce". Post the experiment: we gave Svarg public '
      + 'information about an automotive engineering company and asked where AI could create '
      + 'measurable value; it found five; we built one; here is what happened. When a leader '
      + 'comments "interesting", do not pitch — offer to run it on their problem.',
  },
  {
    key: 'event',
    lane: 'broadcast',
    label: 'Industry event',
    emails: false,
    viaLabel: 'Which event',
    summary: 'Attend, do not exhibit. Automotive, manufacturing, engineering, AI, digital '
      + 'transformation. Identify ten relevant people, have conversations, show Svarg.',
    ask: 'What is the problem your team keeps failing to get to? Give me ten minutes and I '
      + 'will show you what we would do with it.',
    note: 'The objective is not 500 leads, it is finding 3 people with an expensive problem. '
      + 'One good conversation is worth more than 500 scanned badges — do not buy a booth for '
      + 'the first customer.',
  },
];

const BY_KEY = new Map(MOTIONS.map(m => [m.key, m]));

/** The default for a lead added before motions existed, and for a bare form. */
export const DEFAULT_MOTION = 'cold-email';

export function isMotion(key) {
  return BY_KEY.has(key);
}

export function motionOf(key) {
  return BY_KEY.get(key) || BY_KEY.get(DEFAULT_MOTION);
}

/** Which lane a stored motion renders under. Unknown keys fall back rather than vanish. */
export function laneOf(key) {
  return (BY_KEY.get(key) || BY_KEY.get(DEFAULT_MOTION)).lane;
}

/** Does this motion use the sending machinery? Only one does, deliberately. */
export function motionEmails(key) {
  return !!(BY_KEY.get(key) || {}).emails;
}

/**
 * The whole registry, for the screen.
 *
 * Served rather than duplicated in sales.js: the plays are the reasoning behind
 * the strategy, and two copies of reasoning drift into two different strategies.
 */
export function motionRegistry() {
  return {
    lanes: LANES,
    defaultMotion: DEFAULT_MOTION,
    // Fields travel with the motion so the form is rendered from the same
    // definition the API validates against.
    motions: MOTIONS.map((m) => ({ ...m, fields: fieldsFor(m.key), sharesLink: motionSharesLink(m.key) })),
  };
}

/**
 * ── What each motion asks for ───────────────────────────────────────────────
 *
 * A cold email needs a designation and a website, because those are what the
 * writer reads. A warm introduction to someone you already know needs neither
 * — it needs a mobile number and how you know them. Asking every motion for
 * the same seven boxes is how a form becomes something people fill in with
 * whatever gets past the validation.
 *
 * Declared here rather than in sales.js so the screen renders precisely the
 * fields the server accepts. A field the form collects and the API drops is a
 * failure this codebase has already paid for once, with the organisation
 * paragraph that was typed on every lead and stored on none.
 */

/** Every field a motion may ask for. `key` is the column on ColdLead. */
export const FIELDS = {
  name:    { key: 'name',    label: 'Name',              type: 'text',  required: true },
  phone:   { key: 'phone',   label: 'Mobile number',     type: 'tel',   required: true,
             hint: 'With country code — it is what the invite gets sent over.' },
  company: { key: 'company', label: 'Company (optional)', type: 'text' },
  relationship: {
    key: 'relationship', label: 'Relationship', type: 'select', required: true,
    options: ['Friend', 'Colleague'],
  },
  location: {
    key: 'location', label: 'Location', type: 'select', required: true,
    options: ['India', 'US'],
  },
  email:      { key: 'email',      label: 'Email (optional)', type: 'email',
                hint: 'Only if you have it. The invite link works without one.' },
  emailReq:   { key: 'email',      label: 'Email address',    type: 'email', required: true },
  role:       { key: 'role',       label: 'Designation',      type: 'text',
                suggestions: ['VP Engineering', 'VP Marketing', 'VP Sales', 'Founder / CEO'] },
  linkedinUrl: { key: 'linkedinUrl', label: 'LinkedIn profile URL', type: 'url' },
  companyUrl:  { key: 'companyUrl',  label: 'Company website',      type: 'url' },
  companyOnly: { key: 'company',     label: 'Organisation',         type: 'text' },
  note:        { key: 'note',        label: 'Private note — never sent', type: 'text' },
};

/**
 * Which fields each motion collects, in the order they are shown.
 *
 * Anything not listed here falls back to the cold-email set, so a motion added
 * to the registry without a form still works rather than rendering nothing.
 */
const MOTION_FIELDS = {
  // You already know this person. The whole exchange is a WhatsApp message
  // with a link in it, so the number matters and the job title does not.
  'warm-intro': ['name', 'phone', 'company', 'relationship', 'location', 'email', 'note'],
};

const DEFAULT_FIELDS =
  ['companyOnly', 'name', 'role', 'emailReq', 'linkedinUrl', 'companyUrl', 'via', 'note'];

export function fieldsFor(motionKey) {
  const names = MOTION_FIELDS[motionKey] || DEFAULT_FIELDS;
  const m = motionOf(motionKey);
  return names.map((n) => {
    // `via` is the one field whose label is the motion's own, so it is built
    // here rather than sitting eleven times over in the catalogue.
    if (n === 'via') {
      return m.viaLabel
        ? { key: 'via', label: m.viaLabel, type: 'text', required: !m.emails }
        : null;
    }
    return FIELDS[n] || null;
  }).filter(Boolean);
}

/**
 * Does this motion hand you a link to send yourself?
 *
 * Cold email puts the tracked link in the mail it sends. Every other motion is
 * a conversation you are having in person, on a call or over WhatsApp, so the
 * link has to be something you can copy. Same ref either way — what changes is
 * who does the sending.
 */
export function motionSharesLink(key) {
  return !motionEmails(key);
}
