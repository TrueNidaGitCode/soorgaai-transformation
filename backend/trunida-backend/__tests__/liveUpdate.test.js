/**
 * Live applications pick up runtime changes by themselves: a composed
 * project that matches the last push is left alone; one that differs is
 * pushed to the same repository and Railway is asked to build that commit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({
  findById: vi.fn(), bpUpdate: vi.fn().mockResolvedValue({}), depUpdate: vi.fn().mockResolvedValue({}),
  projectFor: vi.fn(), ensureRepo: vi.fn(), publish: vi.fn(), redeploy: vi.fn(), configured: vi.fn(() => true),
}));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: { findById: (id) => ({ lean: () => M.findById(id) }), updateOne: M.bpUpdate } }));
vi.mock('../models/HostedDeployment.js', () => ({ default: { updateOne: M.depUpdate, find: vi.fn().mockResolvedValue([]) } }));
vi.mock('../controllers/deliveryController.js', async () => {
  const real = await vi.importActual('../controllers/deliveryController.js');
  return { manifestHash: real.manifestHash, projectFor: M.projectFor };
});
vi.mock('../services/svargGithubService.js', () => ({
  isSvargGithubConfigured: () => true, ensureSvargRepo: M.ensureRepo, publishToSvarg: M.publish,
  repoDescription: (t) => String(t).replace(/\s+/g, ' ').trim(),
}));
vi.mock('../services/appNameService.js', () => ({ ensureAppName: vi.fn().mockResolvedValue('Six Cricket') }));
vi.mock('../services/deployTargetService.js', () => ({
  getDeployTarget: () => ({ configured: M.configured, redeploy: M.redeploy }),
  // The real one, near enough: what matters to this test is that the sweep
  // asks for the addresses and passes on whatever comes back.
  gatewayAddressEnv: (base) => (base ? { SVARG_ZOHO_URL: `${base}/v1/oauth/zoho`, SELFHOSTED_BASE_URL: `${base}/v1` } : {}),
}));

const { updateOne } = await import('../services/liveUpdateService.js');
const { manifestHash } = await import('../controllers/deliveryController.js');

const FILES = [{ path: 'server.js', content: 'old' }, { path: 'frontend/index.html', content: '<p>old door</p>' }];
const dep = { _id: 'd1', blueprintId: 'bp1', railway: { serviceId: 's1', projectId: 'p1', environmentId: 'e1' } };

beforeEach(() => {
  vi.clearAllMocks();
  // The sweep only sends addresses when it knows where Svarg is. Without
  // this it correctly sends none, and the assertions below would be
  // measuring a missing variable rather than the behaviour.
  process.env.GATEWAY_BASE_URL = 'https://svarg.test/api/gateway';
  M.findById.mockResolvedValue({ _id: 'bp1', appName: 'Six Cricket', businessObjective: 'run an academy',
    eameDelivery: { repoName: 'svarg-six-cricket-bp1', repoOwner: 'svarg', manifestHash: manifestHash(FILES), commitSha: 'aaa' } });
  M.ensureRepo.mockResolvedValue({ owner: 'svarg', name: 'svarg-six-cricket-bp1', htmlUrl: 'https://github.com/svarg/x', created: false });
  M.publish.mockResolvedValue({ commitSha: 'bbb1234' });
  M.redeploy.mockResolvedValue({});
});

describe('updateOne', () => {
  it('leaves a current application alone', async () => {
    M.projectFor.mockResolvedValue({ files: FILES, source: 'generated' });
    expect(await updateOne(dep)).toEqual({ skipped: 'current' });
    expect(M.publish).not.toHaveBeenCalled();
    expect(M.redeploy).not.toHaveBeenCalled();
  });

  it('pushes a changed runtime to the same repository and rebuilds that commit', async () => {
    const changed = [FILES[0], { path: 'frontend/index.html', content: '<p>new welcome</p>' }];
    M.projectFor.mockResolvedValue({ files: changed, source: 'generated' });
    const r = await updateOne(dep, { reason: 'boot' });
    expect(r.updated).toBe(true);
    expect(M.ensureRepo.mock.calls[0][0].name).toBe('svarg-six-cricket-bp1');
    expect(M.publish.mock.calls[0][0].files).toBe(changed);
    expect(M.bpUpdate.mock.calls[0][1].$set.eameDelivery.manifestHash).toBe(manifestHash(changed));
    expect(M.redeploy.mock.calls[0][0].commitSha).toBe('bbb1234');
    expect(M.depUpdate.mock.calls[0][1].$set.status).toBe('attaching');

    /*
     * ── The configuration goes with the code ─────────────────────────────
     *
     * This sweep rewrote a running application's code and left its
     * environment as it was at Go Live. So the Zoho broker shipped, every
     * application received the code for it, and not one of them had
     * SVARG_ZOHO_URL — every Data page decided the feature was unavailable
     * and drew the manual form: correct, and useless.
     *
     * The addresses now go every time, so an endpoint added tomorrow
     * reaches applications delivered yesterday.
     */
    const env = M.redeploy.mock.calls[0][0].env;
    expect(env.SVARG_ZOHO_URL).toBeTruthy();
    expect(env.SELFHOSTED_BASE_URL).toBeTruthy();
    // And no credential rides along with them: this runs unattended against
    // every live application, which is the one path a key could spread on
    // without anybody deploying anything.
    expect(env.SELFHOSTED_API_KEY).toBeUndefined();
  });

  it('never publishes an application that was never published', async () => {
    M.findById.mockResolvedValue({ _id: 'bp1', eameDelivery: null });
    expect(await updateOne(dep)).toEqual({ skipped: 'never published' });
    expect(M.projectFor).not.toHaveBeenCalled();
  });
});
