/**
 * Svarg — which use case a blueprint actually settled on
 *
 * `recommendedUseCase` is not a field on TransformationBlueprint. Code that
 * read it got `undefined` and quietly fell back to `businessObjective` — the
 * sentence the customer typed at the very start, before Cob had analysed
 * anything. Arth has been deriving its benchmark and confidence band from that
 * fallback rather than from the use case anyone approved.
 *
 * The approved use case lives four levels down the domains tree, and the
 * frontend has always known where: `findAiUseCasesPrioritizationSection` in
 * blueprintGenerate.js. This is that lookup, server-side, so the pipeline stops
 * disagreeing with the screen about what is being built.
 *
 * Two fields, deliberately kept apart:
 *
 *   name           the initiative — "Predictive Analytics for Student Churn"
 *   justification  the full sentence Cob wrote, which EMBEDS the name as a
 *                  leading substring and explains why it goes first
 *
 * The short name is what to build for. The justification is context, and
 * matching on it is how the winner is identified in the first place.
 */

/** The section holding the prioritisation, under whichever of its two titles. */
export function findPrioritizationSection(bp) {
  const domain = (bp?.domains || []).find(d => d.domainId === 'ai-use-cases');
  // An incomplete domain has half-written sections. Reading one would produce a
  // use case that changes under you as generation finishes.
  if (!domain || domain.status !== 'completed') return null;

  for (const cap of domain.capabilities || []) {
    for (const section of cap.sections || []) {
      if (section.title === 'AI Implementation Prioritization'
       || section.title === 'AI Use Case Prioritization') return section;
    }
  }
  return null;
}

/**
 * @returns {{name: string, justification: string, alternatives: string[], source: string}}
 *   `source` is 'approved-use-case' | 'business-objective' | 'none'. Callers
 *   that infer from the text should say which they got: deriving a benchmark
 *   from an unanalysed objective is a weaker claim than deriving it from an
 *   approved initiative, and the difference should not be invisible.
 */
export function resolveUseCase(bp) {
  const objective = String(bp?.businessObjective || '').trim();
  const section = findPrioritizationSection(bp);
  const brief = section?.brief || {};
  const justification = String(brief.recommendedStartingPoint || '').trim();

  const initiatives = (brief.priorityQuadrants || [])
    .flatMap(q => q.initiatives || [])
    .filter(Boolean);

  // The winner is the initiative whose name appears inside the justification —
  // the same substring match the screen uses to split winner from alternatives.
  // Longest first, so "Semantic Matching for Defects" is not beaten by a
  // shorter initiative that happens to be a prefix of it.
  const name = initiatives
    .slice()
    .sort((a, b) => b.length - a.length)
    .find(n => justification.includes(n)) || '';

  if (name || justification) {
    return {
      name: name || justification,
      justification,
      alternatives: initiatives.filter(n => n !== name),
      source: 'approved-use-case',
    };
  }

  // Nothing approved yet. The objective is what there is, and saying so lets a
  // caller weaken its claim rather than presenting a guess as a decision.
  if (objective) {
    return { name: objective, justification: '', alternatives: [], source: 'business-objective' };
  }
  return { name: '', justification: '', alternatives: [], source: 'none' };
}

/** The text to match against when classifying — name and justification
 *  together, since either may carry the signal. */
export function useCaseText(bp) {
  const u = resolveUseCase(bp);
  return [u.name, u.justification].filter(Boolean).join(' ');
}
