/**
 * Svarg — Model Catalog Entry
 *
 * The evidence Arth recommends from.
 *
 * What it replaces: a source file that graded models as 'best' or 'good' and
 * 'high' or 'low' cost. Adjectives asserted in code, with no benchmark behind
 * them and no way to answer "which model gives acceptable quality at the
 * lowest price" — the question a startup actually has to answer.
 *
 * ── Why this is in the database ────────────────────────────────────────────
 *
 * Benchmarks are republished constantly and models appear weekly. A catalog
 * that needs a deploy to record a new score is a catalog that is quietly wrong
 * most of the time, and wrong here means recommending yesterday's model at
 * today's price.
 *
 * ── Provenance is not decoration ───────────────────────────────────────────
 *
 * Every score carries where it came from and when. A recommendation that
 * cannot name the benchmark release behind it is the same
 * assertion-without-evidence this exists to remove, only with more decimal
 * places. Scores also go stale silently, and `updatedAt` is the only thing
 * that makes that visible.
 *
 * Plain String and Number throughout — no enum whose default is not a member.
 */

import mongoose from 'mongoose';

/**
 * The named indices. Each is a separate published measurement, and which one
 * matters depends entirely on what is being built: a coding agent and a
 * document generator are not served by the same "best" model.
 *
 * 0–100, higher is better — including hallucinationResistance, which is
 * deliberately phrased as resistance so that every field points the same way.
 * A score of 0 is indistinguishable from "not measured", so absent scores stay
 * null and the recommender excludes rather than assuming.
 */
const scoreField = { type: Number, default: null, min: 0, max: 100 };

const modelCatalogEntrySchema = new mongoose.Schema({
  modelId:     { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true },
  vendor:      { type: String, default: '' },

  // 'frontier' | 'open-weight'. Both are recommendable; the difference is
  // where the data goes, which is a constraint rather than a quality.
  type: { type: String, default: 'frontier' },

  // Who serves this model — Bedrock, Together, Groq, Fireworks and the rest.
  // A customer standardised on one provider cannot use a model nobody they buy
  // from hosts, however well it scores.
  providers: { type: [String], default: [] },

  // Set only where llmService has this provider wired, so a recommendation can
  // be told apart from something Svarg can run today.
  providerId: { type: String, default: '' },

  // The exact string the provider API expects — claude-opus-5, gpt-5.6-sol.
  // Distinct from modelId, which is Svarg's own key, and from displayName,
  // which is what the published comparison called it. A row with a provider
  // but no apiModel cannot be called: the gateway would have somewhere to
  // send the request and nothing to ask for.
  apiModel: { type: String, default: '' },

  // ── Economics ──────────────────────────────────────────────────────────
  // USD per million tokens. The two are kept apart rather than blended,
  // because output-heavy and input-heavy workloads price very differently.
  priceIn:  { type: Number, default: null },
  priceOut: { type: Number, default: null },
  medianTokensPerSecond: { type: Number, default: null },

  // USD to run the whole Intelligence Index once — Artificial Analysis
  // publishes this, and it is the single most comparable cost figure there is:
  // one number over one identical workload, rather than two token prices whose
  // real cost depends on a mix nobody has measured yet.
  //
  // Preferred over the token prices when present. It is what a
  // cost-per-task comparison is actually made of.
  //
  // Kept as the figure to use when a category has none of its own.
  indexCost: { type: Number, default: null },

  // Cost per task PER CATEGORY, keyed the same way as `scores`.
  //
  // The same model costs different amounts on different benchmarks, because a
  // benchmark is a workload: Claude Opus 5 (max) runs Strategy & Ops for $3.01
  // and Engineering for $2.25. One number per model cannot hold both, and the
  // second table entered would have silently overwritten the first.
  //
  // Cost and score are therefore a pair. A score without the cost measured
  // alongside it cannot answer "acceptable quality at the lowest price", which
  // is the only question this catalog exists to answer.
  indexCosts: { type: Map, of: Number, default: () => new Map() },

  // ── Shape ──────────────────────────────────────────────────────────────
  // paramsB is what the compute requirement is DERIVED from — see
  // modelAdvisorService.computeProfile — rather than a VRAM figure quoted from
  // memory. activeParamsB differs only for mixture-of-experts models, where
  // throughput tracks the active parameters but memory holds all of them.
  paramsB:       { type: Number, default: null },
  activeParamsB: { type: Number, default: null },
  contextTokens: { type: Number, default: null },

  // ── Capabilities ───────────────────────────────────────────────────────
  // Hard requirements. These filter; they never trade off against a score.
  reasoning:  { type: Boolean, default: false },
  imageInput: { type: Boolean, default: false },
  audioInput: { type: Boolean, default: false },
  videoInput: { type: Boolean, default: false },

  // ── Scores ─────────────────────────────────────────────────────────────
  scores: {
    strategyOps:             scoreField,   // Strategy & Operations
    engineering:             scoreField,   // Engineering
    intelligence:            scoreField,   // AA Intelligence Index
    agentic:                 scoreField,   // AA Agentic Index
    coding:                  scoreField,   // Terminal-Bench
    math:                    scoreField,   // AA Math Index
    instructionFollowing:    scoreField,   // IFBench
    longContext:             scoreField,   // AA-LCR
    documentCreation:        scoreField,   // GDPval-AA
    knowledge:               scoreField,   // AA-Omniscience
    hallucinationResistance: scoreField,   // AA-Omniscience
  },

  // ── Provenance ─────────────────────────────────────────────────────────
  source:        { type: String, default: 'Artificial Analysis' },
  sourceVersion: { type: String, default: '' },   // which release these came from
  updatedBy:     { type: String, default: '' },

  // Kept out of recommendations without being deleted — a model that is
  // retired should stop being recommended, but the blueprints that already
  // chose it must still be able to name it.
  active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('ModelCatalogEntry', modelCatalogEntrySchema);
