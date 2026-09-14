/**
 * Who SCA-26-001 actually is.
 *
 * Six Cricket's roll call keys every line by a student id, because that is how
 * the academy's own system writes it. Nothing looked the id up, so the answer
 * came back:
 *
 *   "SCA-26-001, SCA-26-008, SCA-26-057 and 17 others are absent"
 *
 * which is not an answer, it is a lookup task handed back to the coach. The
 * roster maps the id to Tejas Hegde and nothing read that map.
 *
 * It only became visible once answers started naming people instead of
 * counting them — "23 distinct trainees were absent" was hiding it.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const ROLL_CALL = {
  name: 'Daily Session Roll Call Logs',
  columns: ['rollcall_id', 'session_date', 'student_id', 'attendance_status'],
  rows: [
    { cells: ['RC-1', '2026-09-07', 'SCA-26-001', 'absent'], source: 'own' },
    { cells: ['RC-2', '2026-09-07', 'SCA-26-008', 'absent'], source: 'own' },
    { cells: ['RC-3', '2026-09-07', 'SCA-26-057', 'present'], source: 'own' },
  ],
};

/** The roster carries the coach and the guardian beside the student. */
const ROSTER = {
  name: 'Master Student Roster',
  columns: ['student_id', 'student_first_name', 'student_last_name', 'batch_id',
            'guardian_name', 'primary_coach_name', 'guardian_phone'],
  rows: [
    { cells: ['SCA-26-001', 'Tejas', 'Hegde', 'U-14', 'Vijay Hegde', 'Coach Balaji R', '+91 9646830952'], source: 'own' },
    { cells: ['SCA-26-008', 'Karthik', 'Venkatesh', 'U-14', 'Suresh V', 'Coach Balaji R', '+91 9646830953'], source: 'own' },
    { cells: ['SCA-26-057', 'Nithya', 'Murali', 'U-16', 'Murali K', 'Coach Priyanka S', '+91 9646830954'], source: 'own' },
  ],
};

let datasets = [ROLL_CALL, ROSTER];

vi.mock('../eame-template/services/connectorService.js', () => ({
  dataVersion: () => 1,
  bumpDataVersion: () => {},
  readIndex: () => datasets.map(d => ({ name: d.name, columns: d.columns, file: 'x.csv' })),
  datasetKey: () => 'student_id',
  findDataset: (n) => {
    const d = datasets.find(x => x.name === n);
    return d ? { name: d.name, columns: d.columns, file: 'x.csv' } : null;
  },
  readAllRows: async (d) => {
    const found = datasets.find(x => x.name === (d.name || d));
    return { columns: found.columns, rows: found.rows, sample: false };
  },
}));

const plan = vi.fn();
vi.mock('../eame-template/services/llmService.js', () => ({
  generate: async () => ({ text: 'Some answer.' }),
  generateRaw: async (...a) => plan(...a),
}));

beforeEach(() => {
  vi.resetModules();
  datasets = [ROLL_CALL, ROSTER];
  plan.mockResolvedValue({
    text: JSON.stringify({
      reading: 'who was absent',
      intent: 'lookup',
      steps: [{
        id: 'a', op: 'select', dataset: 'Daily Session Roll Call Logs',
        label: 'Absent', category: 'absent', entity: 'student_id',
        where: [['attendance_status', 'is', 'absent']],
      }],
    }),
  });
});

const names = (out) => out.groups[0].items.map(i => i.name);

describe('an identifier is resolved to the person it names', () => {
  it('answers with Tejas Hegde, not SCA-26-001', async () => {
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({ question: 'Who is absent?' });
    expect(names(out)).toEqual(['Tejas Hegde', 'Karthik Venkatesh']);
  });

  it('keeps the identifier, because the record is still filed under it', async () => {
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({ question: 'Who is absent?' });
    expect(out.groups[0].items.map(i => i.id)).toEqual(['SCA-26-001', 'SCA-26-008']);
  });

  it('does not attach the coach standing next to them in the same row', async () => {
    // "Tejas Hegde Coach Balaji R" is two people presented as one, which is
    // worse than the identifier because it reads as though it were true.
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({ question: 'Who is absent?' });
    for (const n of names(out)) {
      expect(n).not.toMatch(/coach/i);
      expect(n).not.toMatch(/Vijay|Suresh|Murali K/);
    }
  });

  it('counts are unchanged, because resolution is presentational only', async () => {
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({ question: 'Who is absent?' });
    // Two absences, two people — the same numbers the identifiers gave.
    expect(out.groups[0].records).toBe(2);
    expect(out.groups[0].entities).toBe(2);
  });

  it('leaves real names alone', async () => {
    datasets = [{
      name: 'Daily Session Roll Call Logs',
      columns: ['rollcall_id', 'session_date', 'student_id', 'attendance_status'],
      rows: [
        { cells: ['RC-1', '2026-09-07', 'Arjun Bose', 'absent'], source: 'own' },
        { cells: ['RC-2', '2026-09-07', 'Rohan Sharma', 'absent'], source: 'own' },
      ],
    }];
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({ question: 'Who is absent?' });
    expect(names(out)).toEqual(['Arjun Bose', 'Rohan Sharma']);
  });

  it('shows the identifier when nothing maps it, rather than nothing', async () => {
    datasets = [ROLL_CALL];                   // no roster to look anything up in
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({ question: 'Who is absent?' });
    expect(names(out)).toEqual(['SCA-26-001', 'SCA-26-008']);
  });

  it('does not mistake a roster with no name columns for a lookup', async () => {
    datasets = [ROLL_CALL, {
      name: 'Fees',
      columns: ['student_id', 'amount_due', 'status'],
      rows: [{ cells: ['SCA-26-001', '2000', 'overdue'], source: 'own' }],
    }];
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({ question: 'Who is absent?' });
    expect(names(out)).toEqual(['SCA-26-001', 'SCA-26-008']);
  });
});
