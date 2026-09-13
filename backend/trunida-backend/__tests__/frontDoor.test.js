/**
 * The application's front door: the customer's words and world, never
 * Svarg's; every token filled; the preview JSON safe inside a script tag.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/llmService.js', () => ({ generate: vi.fn() }));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: { updateOne: vi.fn().mockResolvedValue({}) } }));

const { generate } = await import('../services/llmService.js');
const { normaliseDoor, fallbackDoor, frontDoorCopy, ensureFrontDoor } = await import('../services/frontDoorService.js');
const { buildRuntime } = await import('../services/eameProjectBuilder.js');

const bp = () => ({ _id: 'x', appName: 'Six Cricket Academy', industry: 'Sports', businessObjective: 'We run a cricket academy', domains: [
  { domainId: 'data-readiness', capabilities: [{ sections: [{ title: 'Critical Data Identification', brief: { datasets: [
    { name: 'Student roster' }, { name: 'Session attendance' }, { name: 'Fee invoices' }, { name: 'Coach messages' } ] } }] }] },
] });

describe('normaliseDoor', () => {
  it('keeps only the shape the page draws, and falls back field by field', () => {
    const fb = fallbackDoor(bp());
    const d = normaliseDoor({
      eyebrow: 'Train • Improve • Achieve', headline: 'Your Cricket Journey,', accent: 'Simplified.',
      sub: 'Manage students, sessions, attendance, communication and invoices — all in one place.',
      photoQuery: 'cricket batsman sunset', accentColor: 'not-a-colour', role: 'Coach',
      nav: ['Students', 'Sessions', 'Attendance', 'Messages', 'Invoices'],
      stats: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }, { label: 'C', value: '3' }],
      list: { title: 'Upcoming', rows: [{ time: '06:00', title: 'Nets' }, { title: 'Fitness' }, { title: 'Match' }] },
    }, fb);
    expect(d.eyebrow).toEqual(['Train', 'Improve', 'Achieve']);
    expect(d.nav).toEqual(['Home', 'Students', 'Sessions', 'Attendance', 'Messages', 'Invoices']);
    expect(d.accentColor).toBe(fb.accentColor);
    expect(d.stats).toEqual(fb.stats);          // three tiles is not four
    expect(d.list.rows.length).toBe(3);
  });

  it('falls back to the datasets when the model says nothing', () => {
    const fb = fallbackDoor(bp());
    expect(fb.nav).toEqual(['Home', 'Student roster', 'Session attendance', 'Fee invoices', 'Coach messages']);
    expect(fb.stats.length).toBe(4);
  });
});

describe('ensureFrontDoor and the tokens', () => {
  it('writes the door once and turns it into filled, safe tokens', async () => {
    generate.mockResolvedValueOnce({ text: JSON.stringify({
      eyebrow: ['Train', 'Improve', 'Achieve'], headline: 'Your Cricket Journey,', accent: 'Simplified.',
      sub: 'Manage students & sessions.', photoQuery: 'cricket batsman', accentColor: '#F2C94C', role: 'Coach',
      nav: ['Home', 'Students', 'Sessions', 'Attendance', '</script><b>x</b>'],
      stats: [{ label: 'Sessions', value: '6', note: 'today' }, { label: 'Students', value: '48', note: '' }, { label: 'Attendance', value: '92%', note: '' }, { label: 'Invoices', value: '5', note: '' }],
      list: { title: 'Upcoming', rows: [{ time: '06:00', title: 'Nets' }, { time: '08:00', title: 'Bowling' }, { time: '16:00', title: 'Fitness' }] },
    }) });
    const b = bp();
    const door = await ensureFrontDoor(b);
    expect(door.headline).toBe('Your Cricket Journey,');
    expect(b.frontDoor).toBe(door);
    expect(await ensureFrontDoor(b)).toBe(door);   // once
    expect(generate).toHaveBeenCalledTimes(1);

    const copy = frontDoorCopy(b);
    expect(copy.__APP_EYEBROW__).toBe('Train • Improve • Achieve');
    expect(copy.__APP_INITIAL__).toBe('S');
    expect(copy.__APP_HERO_IMAGE__).toBe('none');

    const html = buildRuntime({ appName: b.appName, copy }).find(f => f.path === 'frontend/index.html').content;
    expect(html).not.toMatch(/__APP_[A-Z_]+__(?!\s*tokens)/);
    expect(html).toContain('Your Cricket Journey,');
    // The preview JSON survives the script tag: no "<" reaches it.
    const json = html.match(/id="ld-preview-data">([\s\S]*?)<\/script>/)[1];
    expect(json).not.toContain('<');
    expect(JSON.parse(json).nav).toContain('\u003c/script>\u003cb>x\u003c/b>');
  });
});
