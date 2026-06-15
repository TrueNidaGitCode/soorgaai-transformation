/**
 * SoorgaAI — Executive Memory Service (Sprint 23)
 *
 * Formats the Executive Memory context block that is prepended to every AI
 * prompt, giving the LLM persistent awareness of:
 *   - Company profile (type, customers, priorities, business model)
 *   - Accepted Company Blueprint sections (the team's agreed strategy)
 *   - Recent conversation history (context for follow-up questions)
 *
 * Reusable across all SoorgaAI domains — Business Strategy Alignment,
 * AI CoE, AI Governance, and AI Performance Management can all call
 * buildMemoryContext() with their own data.
 */

const HISTORY_LIMIT   = 16;  // max messages included (8 exchanges)
const CONTENT_TRUNCATE = 500; // chars per history message before truncation

/**
 * Build the Executive Memory prompt block.
 *
 * @param {object} opts
 * @param {object} opts.companyProfile      { type, customers, priorities[], businessModel }
 * @param {object} opts.approvedSections    { [sectionTitle]: content }
 * @param {Array}  opts.conversationHistory [{ role: 'user'|'assistant', content }]
 * @returns {string} formatted block, or '' when there is nothing to include
 */
export function buildMemoryContext({
  companyProfile = {},
  approvedSections = {},
  conversationHistory = [],
} = {}) {
  const parts = [];

  // ── Company profile ─────────────────────────────────────────────────────────
  const profileLines = [];
  if (companyProfile.type)               profileLines.push(`Company Type: ${companyProfile.type}`);
  if (companyProfile.customers)          profileLines.push(`Customers: ${companyProfile.customers}`);
  if (companyProfile.priorities?.length) profileLines.push(`Strategic Priorities: ${companyProfile.priorities.join(', ')}`);
  if (companyProfile.businessModel)      profileLines.push(`Business Model: ${companyProfile.businessModel}`);
  if (profileLines.length) {
    parts.push(`COMPANY PROFILE:\n${profileLines.map(l => `• ${l}`).join('\n')}`);
  }

  // ── Accepted / approved blueprint sections ───────────────────────────────────
  const entries = Object.entries(approvedSections).filter(([, v]) => v?.trim());
  if (entries.length) {
    const lines = entries.map(([title, content]) => `${title}:\n${content.trim()}`);
    parts.push(`COMPANY BLUEPRINT (accepted sections):\n${lines.join('\n\n')}`);
  }

  // ── Conversation history (capped, truncated per entry) ─────────────────────
  const history = conversationHistory.slice(-HISTORY_LIMIT);
  if (history.length) {
    const lines = history.map(m => {
      const label = m.role === 'user' ? 'Executive' : 'Advisor';
      const text  = m.content.length > CONTENT_TRUNCATE
        ? m.content.slice(0, CONTENT_TRUNCATE) + '…'
        : m.content;
      return `${label}: ${text}`;
    });
    parts.push(`CONVERSATION HISTORY:\n${lines.join('\n')}`);
  }

  if (!parts.length) return '';
  return `=== EXECUTIVE MEMORY ===\n${parts.join('\n\n')}\n=== END EXECUTIVE MEMORY ===`;
}
