import 'dotenv/config';
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const db = mongoose.connection;
const id = process.argv[2];
const docs = await db.collection('linkedprojectdocuments')
  .find({ blueprintId: new mongoose.Types.ObjectId(id) })
  .project({ datasetName: 1, sourceType: 1, rowCount: 1, updatedAt: 1 }).toArray();
console.log(`${docs.length} linked document(s) for ${id}`);
for (const d of docs) console.log(`  ${String(d.sourceType).padEnd(10)} ${d.datasetName}  rows=${d.rowCount ?? '?'}`);

const bp = await db.collection('transformationblueprints').findOne({ _id: new mongoose.Types.ObjectId(id) });
const dom = (bp.domains || []).find(d => d.domainId === 'data-readiness');
for (const cap of dom?.capabilities || []) {
  for (const s of cap.sections || []) {
    if (Array.isArray(s.brief?.datasets)) {
      console.log(`\ndatasets named by "${s.title}":`);
      for (const d of s.brief.datasets) console.log(`  ${d.name}  — ${String(d.purpose || '').slice(0, 70)}`);
    }
  }
}
await mongoose.disconnect();
