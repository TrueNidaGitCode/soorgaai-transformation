/**
 * Svarg — reading sections off a blueprint
 *
 * Pure lookups shared by every screen. They live here, and not in
 * blueprintGenerate.js where they started, because of what importing them
 * from there did:
 *
 * blueprintGenerate.js is loaded by domain.html as a <script> with a ?v=
 * cache-buster, and was ALSO imported by the four screen modules as
 * './blueprintGenerate.js' -- a different URL. The browser keys modules by
 * URL, so it evaluated the orchestrator twice: two instances, two
 * DOMContentLoaded listeners, two init() runs, and every request on the
 * workspace made twice on every visit. Each stage was asked to load twice,
 * ten milliseconds apart.
 *
 * The screens only ever wanted this function. Now they get it from a module
 * nothing else loads, and the orchestrator is evaluated once.
 *
 * Imported without a ?v= on purpose: the four importers use the identical
 * specifier so there is exactly one instance, and this file is small, pure
 * and expected to change rarely.
 */

/**
 * The prioritization section of the AI Use Cases domain, or null until that
 * domain has finished. Two section titles are accepted because the generator
 * has used both.
 */
export function findAiUseCasesPrioritizationSection(bp) {
  const domain = (bp?.domains || []).find(d => d.domainId === 'ai-use-cases');
  if (!domain || domain.status !== 'completed') return null;
  for (const cap of (domain.capabilities || [])) {
    for (const section of (cap.sections || [])) {
      if (section.title === 'AI Implementation Prioritization' || section.title === 'AI Use Case Prioritization') {
        return section;
      }
    }
  }
  return null;
}
