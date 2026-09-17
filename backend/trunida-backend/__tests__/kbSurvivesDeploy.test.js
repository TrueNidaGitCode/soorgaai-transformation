/**
 * Curated knowledge survives a deploy.
 *
 * approveCapability writes an approved capability to a real .md file under
 * KB_ENTERPRISE_ROOT, because that is the only place the generator reads from.
 * On Railway that path is inside the container, so every deploy threw the file
 * away. The content survived in Mongo and nothing ever put it back.
 *
 * So an admin curating industry knowledge was doing work with a silent expiry
 * date, and every blueprint generated after a deploy was less grounded than
 * the ones before it — with nothing anywhere saying so. That is the failure
 * mode this whole layer is supposed to be the cure for.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

const { state } = vi.hoisted(() => ({ state: { docs: [], files: new Set(), written: [], failOn: '' } }));

vi.mock('fs', async (orig) => {
  const real = await orig();
  return {
    ...real,
    default: {
      ...real.default,
      existsSync: (p) => state.files.has(String(p)),
      mkdirSync: () => {},
      writeFileSync: (p, c) => {
        if (state.failOn && String(p).includes(state.failOn)) throw new Error('read-only file system');
        state.written.push({ path: String(p), content: c });
        state.files.add(String(p));
      },
      readFileSync: real.default.readFileSync,
    },
  };
});

vi.mock('../models/IndustryCapabilityKnowledge.js', () => ({
  default: {
    find: () => ({ select: () => ({ lean: async () => state.docs }) }),
  },
}));

const cap = (over = {}) => ({
  capabilityId: 'ai-opportunity-discovery',
  capabilityName: 'AI Opportunity Discovery',
  domainKbPath: 'AI_Use_Cases',
  status: 'published',
  content: '# Curated content',
  ...over,
});

let restore;
beforeEach(async () => {
  vi.resetModules();
  state.docs = [{ industry: 'Sports Academies', capabilities: [cap()] }];
  state.files = new Set();
  state.written = [];
  state.failOn = '';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ restorePublishedKnowledge: restore } = await import('../services/industryCapabilityKnowledgeService.js'));
});

describe('after a deploy has emptied the filesystem', () => {
  it('writes published knowledge back where the generator reads it', async () => {
    const r = await restore();
    expect(r.restored).toBe(1);
    expect(state.written[0].content).toBe('# Curated content');
    expect(state.written[0].path).toContain('Sports Academies');
    expect(state.written[0].path).toContain('AI_Use_Cases');
  });

  it('restores every published capability across every industry', async () => {
    state.docs = [
      { industry: 'Sports Academies', capabilities: [cap(), cap({ capabilityName: 'Business Value Definition' })] },
      { industry: 'Education Technology', capabilities: [cap()] },
    ];
    expect((await restore()).restored).toBe(3);
  });
});

describe('what it must not touch', () => {
  it('leaves a file that is already on disk exactly as it is', async () => {
    /*
     * The hand-written overlays ship in the repository and a deploy is how
     * they are updated. Overwriting one from a database copy would undo an
     * intentional edit with nothing to say it had happened.
     */
    const r0 = await restore();
    state.written = [];
    const r = await restore();
    expect(r.present).toBe(1);
    expect(r.restored).toBe(0);
    expect(state.written).toHaveLength(0);
    expect(r0.restored).toBe(1);
  });

  it('ignores a capability that was never published', async () => {
    state.docs = [{ industry: 'X', capabilities: [cap({ status: 'draft' }), cap({ status: 'pending' })] }];
    expect((await restore()).restored).toBe(0);
  });

  it('ignores a published capability with nothing stored', async () => {
    // Nothing to restore is not the same as a file to truncate.
    state.docs = [{ industry: 'X', capabilities: [cap({ content: '' })] }];
    const r = await restore();
    expect(r.restored).toBe(0);
    expect(state.written).toHaveLength(0);
  });
});

describe('it never stops the server', () => {
  it('keeps going when one file cannot be written', async () => {
    // A marker that cannot appear in the rest of the path — "A" also matches
    // AI_Use_Cases, which made this fail both writes and look like a bug.
    state.docs = [{ industry: 'Zulu', capabilities: [cap()] }, { industry: 'Yankee', capabilities: [cap()] }];
    state.failOn = 'Zulu';
    const r = await restore();
    expect(r.failed).toBe(1);
    expect(r.restored).toBe(1);
  });

  it('returns a report rather than throwing when the database is unreachable', async () => {
    state.docs = null;
    await expect(restore()).resolves.toBeTruthy();
  });
});

describe('it runs before anything reads the knowledge base', () => {
  const boot = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  it('is awaited at boot', () => {
    expect(boot).toContain('await restorePublishedKnowledge();');
  });

  it('runs after the database connects, since it reads from it', () => {
    expect(boot.indexOf('connectDB()')).toBeLessThan(boot.indexOf('await restorePublishedKnowledge();'));
  });

  it('runs before the server accepts requests', () => {
    expect(boot.indexOf('await restorePublishedKnowledge();')).toBeLessThan(boot.indexOf('app.listen(PORT'));
  });
});
