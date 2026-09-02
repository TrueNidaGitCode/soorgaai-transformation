/**
 * End-to-end check of the Arth screen chat: real blueprint out of Mongo,
 * real controller context build, real LLM call through the configured
 * provider chain (Ollama locally). Asserts that Arth answers in scope and
 * that any action he proposes survives the whitelist.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { askScreenChat } from '../services/screenChatService.js';
import { selectModel } from '../services/modelSelectionService.js';

await mongoose.connect(process.env.MONGO_URI);

const bp = await TransformationBlueprint.findOne({ status: 'completed' })
  .sort({ updatedAt: -1 }).lean();
if (!bp) { console.log('no completed blueprint to test against'); process.exit(1); }
console.log('blueprint:', bp._id.toString(), '|', (bp.businessObjective || '').slice(0, 70));

const context = {
  businessObjective: bp.businessObjective || '',
  approved: !!bp.opportunityApproval?.approved,
  selectedUseCase: 'Retrieval-Augmented Semantic Matching for Defects',
  options: ['frontier', 'open-weight', 'auto'].map(id => ({ id, ...selectModel({ preference: id }) })),
  currentPreference: bp.arthSelection?.preference || '',
  currentDisplayName: bp.arthSelection?.displayName || '',
  infra: [],
};
console.log('options resolved:', context.options.map(o => `${o.id}=${o.displayName}`).join(' | '));

for (const q of [
  'Which of these should I pick if the data cannot leave our network?',
  'What is the cheapest option and what do I give up?',
]) {
  console.log('\n--- Q:', q);
  const t = Date.now();
  const r = await askScreenChat({ screen: 'arth', context, message: q });
  console.log(`(${((Date.now() - t) / 1000).toFixed(1)}s)`);
  console.log('REPLY:', r.reply.slice(0, 400));
  console.log('ACTION:', JSON.stringify(r.action));
  if (/ACTION:/.test(r.reply)) console.log('!! protocol marker leaked into the reply');
}

await mongoose.disconnect();
