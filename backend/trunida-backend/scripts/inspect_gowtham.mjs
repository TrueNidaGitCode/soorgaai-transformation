import 'dotenv/config';
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const db = mongoose.connection;

const BP = '6aaa266daa76a95e8ae09a04';
const bp = await db.collection('transformationblueprints').findOne({ _id: new mongoose.Types.ObjectId(BP) });
if (!bp) { console.log('no blueprint'); process.exit(1); }

console.log('appName          ', bp.appName);
console.log('objective        ', String(bp.businessObjective || '').slice(0, 120));
console.log('status           ', bp.status);
console.log('company          ', bp.companyName);
console.log('created          ', bp.createdAt?.toISOString?.().slice(0, 16));
console.log('domains          ', (bp.domains || []).map(d => `${d.domainId}:${d.status}`).join('  '));
console.log('eameDelivery     ', JSON.stringify(bp.eameDelivery || null)?.slice(0, 200));
console.log('opportunityApprov', JSON.stringify(bp.opportunityApproval || null)?.slice(0, 160));

// Where Aria's dataset list lives on a blueprint.
for (const k of Object.keys(bp)) {
  if (/dataset|aria|connector|spec/i.test(k)) {
    const v = bp[k];
    console.log(`\n== ${k} ==`);
    console.log(JSON.stringify(v, null, 1).slice(0, 1800));
  }
}
await mongoose.disconnect();
