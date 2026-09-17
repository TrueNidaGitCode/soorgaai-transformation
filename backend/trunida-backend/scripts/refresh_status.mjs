/** Ask the deploy target where a deployment really stands, and record it. */
import 'dotenv/config';
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const { default: HostedDeployment } = await import('../models/HostedDeployment.js');
const { getDeployTarget } = await import('../services/deployTargetService.js');

const filter = process.argv[2] ? { blueprintId: process.argv[2] } : { status: { $in: ['attaching', 'live', 'degraded'] } };
for (const dep of await HostedDeployment.find(filter)) {
  const s = await getDeployTarget().status({ deployment: dep });
  const was = dep.status;
  if (s.status && s.status !== dep.status) {
    dep.status = s.status;
    if (s.status === 'live' && !dep.liveAt) dep.liveAt = new Date();
  }
  if (s.detail) dep.statusMessage = s.detail;
  await dep.save();
  console.log(`${dep.railway?.url || '(no url)'}  ${was} -> ${dep.status}  ${String(s.detail || '').slice(0, 80)}`);
}
await mongoose.disconnect();
