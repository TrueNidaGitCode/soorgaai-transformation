/** Push the current manifest to one delivered application, now rather than at the next sweep. */
import 'dotenv/config';
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
const { default: HostedDeployment } = await import('../models/HostedDeployment.js');
const { updateOne } = await import('../services/liveUpdateService.js');

const dep = await HostedDeployment.findOne({ blueprintId: process.argv[2] });
if (!dep) { console.log('No deployment for that blueprint.'); process.exit(1); }
console.log(`${dep.railway?.url}  status=${dep.status}`);
const r = await updateOne(dep, { reason: 'datasets generated after delivery' });
console.log(JSON.stringify(r, null, 1));
await mongoose.disconnect();
