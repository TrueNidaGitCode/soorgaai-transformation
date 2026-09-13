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
vi.mock('../models/HostedDeployment.js', () => ({ default: { updateOne: M.depUpdate, find: vi.fn() } }));
vi.mock('../controllers/deliveryController.js', async () => {
  const real = await vi.importActual('../controllers/deliveryController.js');
  return { manifestHash: real.manifestHash, projectFor: M.projectFor };
});
vi.mock('../services/svargGithubService.js', () => ({
  isSvargGithubConfigured: () => true, ensureSvargRepo: M.ensureRepo, publishToSvarg: M.publish,
  repoDescription: (t) => String(t).replace(/\s+/g, ' ').trim(),
}));
vi.mock('../services/deployTargetService.js', () => ({ getDeployTarget: () => ({ configured: M.configured, redeploy: M.redeploy }) }));

const { updateOne } = await import('../services/liveUpdateService.js');
const { manifestHash } = await import('../controllers/deliveryController.js');

const FILES = [{ path: 'server.js', content: 'old' }, { path: 'frontend/index.html', content: '<p>old door</p>' }];
const dep = { _id: 'd1', blueprintId: 'bp1', railway: { serviceId: 's1', projectId: 'p1', environmentId: 'e1' } };

beforeEach(() => {
  vi.clearAllMocks();
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
  });

  it('never publishes an application that was never published', async () => {
    M.findById.mockResolvedValue({ _id: 'bp1', eameDelivery: null });
    expect(await updateOne(dep)).toEqual({ skipped: 'never published' });
    expect(M.projectFor).not.toHaveBeenCalled();
  });
});
