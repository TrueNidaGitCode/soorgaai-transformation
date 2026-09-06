/**
 * Svarg — the plan limit, over HTTP
 *
 * test_entitlements.mjs proves the rules. This proves they are in the request
 * path: a correct checkEntitlement() that nothing calls refuses nobody, and no
 * unit test can see that.
 *
 * A blueprint is seeded directly so the account is already at its Hobby limit,
 * then one POST must come back 402 naming Pro. It has to be refused BEFORE the
 * objective guard runs — which is both the point (hitting a limit should not
 * cost money) and the reason this is free to run.
 *
 *   node server.js                          # in another terminal
 *   node scripts/test_limit_endpoint.mjs    # PROBE_PORT=… if not on 3000
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import TransformationBlueprint from '../models/TransformationBlueprint.js';

const PORT = process.env.PROBE_PORT || 3199;
await mongoose.connect(process.env.MONGO_URI);
const userId = new mongoose.Types.ObjectId();

try {
  await TransformationBlueprint.create({
    userId, businessObjective: 'Seeded so the account is already at its limit.',
    industry: 'General', companyName: 'Probe Co',
  });

  const token = jwt.sign({ userId: String(userId), role: 'user' }, process.env.JWT_SECRET || 'your_secret_key');

  const resp = await fetch(`http://localhost:${PORT}/api/strategy-canvas/generate-transformation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ businessObjective: 'Reduce warranty claim triage effort across the service network.' }),
  });
  const body = await resp.json().catch(() => ({}));

  const ok = resp.status === 402 && body.code === 'limit_reached' && body.upgradeTo === 'pro';
  console.log(`${ok ? 'PASS' : 'FAIL'} — HTTP ${resp.status}`);
  console.log(`        ${body.error || JSON.stringify(body)}`);
  console.log(`        upgradeTo=${body.upgradeTo} upgradeLabel=${body.upgradeLabel} used=${body.used}/${body.limit}`);

  const after = await TransformationBlueprint.countDocuments({ userId });
  console.log(`        blueprints for this account: ${after} (must be 1 — nothing was generated)`);
  process.exitCode = (ok && after === 1) ? 0 : 1;
} finally {
  await TransformationBlueprint.deleteMany({ userId });
  await mongoose.disconnect();
}
