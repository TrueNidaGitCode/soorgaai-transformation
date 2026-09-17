import 'dotenv/config';
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const { default: TransformationBlueprint } = await import('../models/TransformationBlueprint.js');
const { projectFor, manifestHash } = await import('../controllers/deliveryController.js');
const bp = await TransformationBlueprint.findById(process.argv[2]).lean();
const { files, source } = await projectFor(bp);
const hash = manifestHash(files);
console.log(`source ${source}   ${files.length} files`);
console.log(`hash   ${hash.slice(0, 12)}   last pushed ${String(bp.eameDelivery?.manifestHash || '').slice(0, 12) || '(none)'}`);
console.log(`differs from what is deployed: ${hash !== bp.eameDelivery?.manifestHash}`);
console.log('\ndata files in the manifest:');
for (const f of files.filter(f => f.path.startsWith('data/'))) {
  console.log(`  ${String(f.content.length).padStart(7)}  ${f.path}`);
}
await mongoose.disconnect();
