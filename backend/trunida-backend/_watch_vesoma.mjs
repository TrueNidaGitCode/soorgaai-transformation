/**
 * Follow one blueprint from generation, through Aria's data step, into the
 * delivered application and its first watcher run. Reports only on change.
 * Read-only throughout.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import TransformationBlueprint from './models/TransformationBlueprint.js';
import HostedDeployment from './models/HostedDeployment.js';
import LinkedProjectDocument from './models/LinkedProjectDocument.js';

const ID = '6ab218774a766c6406c0ef32';
const DB = 'tenant_' + ID.slice(-16);
await mongoose.connect(process.env.MONGO_URI);

let last = '';
const say = (s) => { if (s !== last) { console.log(s); last = s; } };

for (let i = 0; i < 400; i++) {
  let line;
  try {
    const bp = await TransformationBlueprint.findById(ID).lean();

    // Aria's output: the datasets that will ship with the application.
    const docs = await LinkedProjectDocument.find({ blueprintId: ID })
      .select('datasetName sourceType rawText synthetic').lean();
    const synth = docs.filter(d => d.sourceType === 'synthetic');
    const rows = synth.reduce((n, d) => n + (d.synthetic?.rowCount || 0), 0);
    const empty = synth.filter(d => !String(d.rawText || '').trim()).length;

    const dep = await HostedDeployment.findOne({ blueprintId: ID }).lean();

    let tenant = '';
    if (dep) {
      try {
        const conn = mongoose.connection.useDb(DB, { useCache: true });
        const agents = await conn.db.collection('svarg_agents').find({}).toArray();
        const open = await conn.db.collection('svarg_findings').countDocuments({ state: 'open' });
        const withEv = await conn.db.collection('svarg_findings').countDocuments({ evidence: { $exists: true } });
        const tenantRows = await conn.db.collection('svarg_rows').countDocuments().catch(() => 0);
        const ran = agents.filter(a => a.lastRunAt).length;
        tenant = ` | tenant rows ${tenantRows} | watchers ${agents.length} (${ran} run, tz ${agents[0]?.tz || '-'})`
          + ` | findings ${open} open / ${withEv} with evidence`;
        if (agents.length) {
          tenant += '\n    ' + agents.map(a =>
            `${a.name} [${a.watcherId || '?'}·${a.severity || '?'}] ${a.status}`
            + (a.lastRunAt ? ` ran ${new Date(a.lastRunAt).toISOString().slice(11, 16)}` : ' never run')
          ).join('\n    ');
        }
      } catch (e) { tenant = ' | tenant unreadable: ' + e.message; }
    }

    line = `bp ${ID.slice(-8)} | ${bp.status} | datasets ${synth.length}`
      + (synth.length ? ` (${rows} rows${empty ? `, ${empty} EMPTY` : ''})` : '')
      + (dep ? ` | deploy ${dep.status}` : ' | not deployed') + tenant;
  } catch (err) {
    line = `WATCH ERROR: ${err.message}`;
  }
  say(line);
  await new Promise(r => setTimeout(r, 15000));
}
console.log('watch finished');
process.exit(0);
