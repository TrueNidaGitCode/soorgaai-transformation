/**
 * The provider layer — keys, failover, the gateway.
 *
 * ── This copy is not the one that ships ───────────────────────────────────
 *
 * In a delivered application, services/llmCore.js IS Svarg's own provider
 * module, copied in whole by the builder (eameProjectBuilder's SOURCE map
 * points llmCore at services/llmService.js in this repository). A tenant has
 * no Svarg repository above it, so nothing there imports across a boundary.
 *
 * This file exists so the template can be run and tested where it lives:
 * llmService.js above it imports './llmCore.js', and without something here
 * every test that touches the answer pipeline fails on a module that is only
 * ever created at build time. It re-exports the same module the builder would
 * have copied, so behaviour is identical either way.
 *
 * The test 'gives the application the wrapper, not Svarg's own provider
 * module, as llmService' in __tests__/assistantConduct.test.js is what stops
 * this stand-in from ever being the thing that ships.
 */
export * from '../../services/llmService.js';
