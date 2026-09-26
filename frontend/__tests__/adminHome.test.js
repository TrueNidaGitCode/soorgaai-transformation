/**
 * The admin home: two ways in and a way out.
 *
 * ── What it replaced ───────────────────────────────────────────────────────
 *
 * Two hundred and fifty lines of markup and five hundred and sixty of script
 * for creating, listing, editing and deleting "signals" — city-level AI
 * infrastructure notes belonging to an assessment product that no longer
 * exists. Every request went to CONFIG.ADMIN.CREATE_SIGNAL, GET_ALL_SIGNALS
 * or DELETE_SIGNAL. None of those is defined in config.js, and the server
 * mounts no route for any of them: the page had been dead long enough that
 * nobody noticed it was dead.
 *
 * So the test worth having is not about what it shows. It is that the dead
 * thing does not come back, and that the two things it exists for — the links
 * and the log out — actually work.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../admin/dashboard.html');
const js = read('../admin/dashboard.js');
const css = read('../admin/dashboard.css');

describe('the two ways in', () => {
  it('links to the pages that are worked, and to nothing that no longer exists', () => {
    const hrefs = [...html.matchAll(/href="(\/admin\/[^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['/admin/sales.html', '/admin/capital.html', '/admin/model-catalog.html']);
  });

  it('links to pages that are actually there, and still have a server behind them', () => {
    /*
     * A home whose links 404 is worse than no home — and the dead screen this
     * page replaced proved that a file existing says nothing about whether it
     * works. So the admin pages that have an API are checked for the route
     * that serves them, not only for the file.
     */
    const here = dirname(fileURLToPath(import.meta.url));
    for (const page of ['sales.html', 'capital.html', 'model-catalog.html']) {
      expect(existsSync(join(here, '../admin', page)), page).toBe(true);
    }
    const server = readFileSync(join(here, '../../backend/trunida-backend/server.js'), 'utf8');
    for (const route of ['/api/admin/sales-signals', '/api/admin/capital', '/api/admin/model-catalog']) {
      expect(server, route).toContain(`app.use("${route}"`);
    }
  });
});

describe('the way out', () => {
  it('clears the whole session, not only the token', () => {
    /*
     * Leaving role and username behind on a shared machine shows the next
     * person an admin shell that then fails every request, which reads as a
     * broken product rather than a finished logout. Same four keys as the
     * sales page, deliberately.
     */
    expect(js).toMatch(/\['token', 'role', 'username', 'redirectAfterLogin'\]/);
    expect(js).toMatch(/window\.location\.href = '\/admin\/login\.html'/);
  });

  it('is guarded, and comes back after login', () => {
    expect(js).toMatch(/role !== 'admin'/);
    expect(js).toContain("localStorage.setItem('redirectAfterLogin', '/admin/dashboard.html')");
  });
});

describe('the dead screen does not come back', () => {
  it('calls none of the signal endpoints', () => {
    /*
     * Named individually rather than by a wildcard: these are the exact
     * symbols that were being called against nothing.
     */
    /*
     * The code, not the comments. Both files name these in their headers to
     * record what was removed and why, and a check that cannot tell the
     * account from the act would delete the account.
     */
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const gone of ['CREATE_SIGNAL', 'GET_ALL_SIGNALS', 'DELETE_SIGNAL', 'UPDATE_SIGNAL']) {
      expect(strip(js), gone).not.toContain(gone);
      expect(strip(html), gone).not.toContain(gone);
    }
  });

  it('carries no form at all', () => {
    for (const tag of ['<form', '<input', '<textarea', '<select']) {
      expect(html, tag).not.toContain(tag);
    }
  });

  it('is small enough to read in one go', () => {
    // 802 lines went; if this creeps back past a hundred, something has been
    // put back that belongs on its own page.
    expect(html.split('\n').length).toBeLessThan(100);
    expect(js.split('\n').length).toBeLessThan(100);
  });

  it('says Svarg, not the old company name', () => {
    expect(html).toMatch(/<title>Admin - Svarg<\/title>/);
    expect(html).not.toMatch(/SOORGA/i);
  });

  it('brings its own stylesheet rather than the panel-and-form one', () => {
    expect(html).toContain('dashboard.css');
    expect(html).not.toContain('admin.css');
    expect(css).toMatch(/^\.ad \{/m);
  });
});
