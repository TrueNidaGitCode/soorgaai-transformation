/**
 * Clinicea, read the way its API answers.
 *
 * The request shapes come from Clinicea's Swagger reference and from a public
 * integration that runs against the live API. These fake the HTTP layer with
 * those shapes. They prove the connector reads them correctly; only the first
 * real account can prove Clinicea answers that way -- Vesoma's, once they buy
 * the API add-on.
 *
 * The last block is the one that matters for Vesoma: it binds the real
 * watchers to the real shapes and runs the plan on rows, so "treated but left
 * marked No Show" and "package used past what was bought" are shown, not
 * described.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import * as C from '../eame-template/services/connectors/clinicea.js';
import { catalogueFor, matchDataset, entryFor } from '../eame-template/services/agentCatalogue.js';
import { matchesAll } from '../eame-template/services/reasoning.js';

vi.mock('axios', () => ({ default: { request: vi.fn() } }));

const CREDS = { apiKey: 'key-123', username: 'frontdesk', password: 'pw' };
const refusal = (status) => Object.assign(new Error(String(status)), { response: { status } });

beforeEach(() => {
  axios.request.mockReset();
  C.forgetSessions();
});

/** Route a faked request by path. */
function serve(routes) {
  axios.request.mockImplementation(async (req) => {
    const path = new URL(req.url).pathname;
    for (const [p, fn] of routes) if (path === p) return fn(req);
    throw refusal(404);
  });
}
const LOGIN = '/api/v2/login/getTokenByStaffUsernamePwd';
const APPTS = '/api/v2/appointments/getChanges';

describe('the session', () => {
  it('logs in with the key, username and password, and carries the token as api_key', async () => {
    serve([[LOGIN, () => ({ status: 200, data: 'tok-1' })], [APPTS, () => ({ status: 200, data: [] })]]);
    await C.pull({ ...CREDS, object: 'Appointments' });
    const login = axios.request.mock.calls[0][0];
    expect(login.params).toEqual({ apiKey: 'key-123', loginUserName: 'frontdesk', pwd: 'pw' });
    expect(axios.request.mock.calls[1][0].params.api_key).toBe('tok-1');
  });

  it('shares one login between calls, because a new login can invalidate the last', async () => {
    serve([[LOGIN, () => ({ status: 200, data: { Token: 'tok-1' } })], [APPTS, () => ({ status: 200, data: [] })]]);
    await Promise.all([C.pull({ ...CREDS, object: 'Appointments' }), C.pull({ ...CREDS, object: 'Appointments' })]);
    expect(axios.request.mock.calls.filter(([r]) => r.url.endsWith(LOGIN))).toHaveLength(1);
  });

  it('logs in again once when the token has expired', async () => {
    let logins = 0;
    let first = true;
    serve([
      [LOGIN, () => ({ status: 200, data: `tok-${++logins}` })],
      [APPTS, (req) => { if (first) { first = false; throw refusal(401); } return { status: 200, data: [] }; }],
    ]);
    await C.pull({ ...CREDS, object: 'Appointments' });
    expect(logins).toBe(2);
    expect(axios.request.mock.calls.at(-1)[0].params.api_key).toBe('tok-2');
  });

  it('says the login is wrong in words, and asks for all three first', async () => {
    serve([[LOGIN, () => { throw refusal(401); }]]);
    await expect(C.test(CREDS)).rejects.toThrow(/refused the API key, username or password/);
    await expect(C.test({ apiKey: 'k' })).rejects.toThrow(/staff username and the staff password/);
  });
});

describe('the dates and the pages', () => {
  it('sends the date without milliseconds or Z, which Clinicea refuses', () => {
    expect(C.stamp(new Date('2026-10-05T09:07:03.861Z'))).toBe('2026-10-05T09:07:03');
  });

  it('reads 100 at a time until a short page, and treats 204 as empty', async () => {
    const page = (n) => Array.from({ length: n }, (_, i) => ({ AppointmentID: `a${i}`, AppointmentWithName: 'x' }));
    let calls = 0;
    serve([[LOGIN, () => ({ status: 200, data: 't' })], [APPTS, (req) => {
      calls += 1;
      expect(req.params).toMatchObject({ pageNo: calls, pageSize: 100 });
      return calls === 1 ? { status: 200, data: page(100) } : calls === 2 ? { status: 200, data: page(40) } : { status: 204, data: '' };
    }]]);
    expect(await C.pull({ ...CREDS, object: 'Appointments' })).toHaveLength(140);
    expect(calls).toBe(2);
  });

  it('reads an unset .NET date as no date, not as the year 1', () => {
    expect(C.dateOf('0001-01-01T00:00:00')).toBe('');
    expect(C.dateOf('2026-09-12T10:30:00')).toBe('2026-09-12T10:30:00');
  });
});

describe('an appointment, and the signs that the patient came', () => {
  const treated = {
    AppointmentID: 'A-77', AppointmentWithName: 'Rahul Sharma', AppointmentWithPhone: '+91 98450 11111',
    StartDateTime: '2026-09-12T10:00:00', AppointmentStatus: 'No Show', PrevAppointmentStatus: 'Booked',
    ArrivalDate: '0001-01-01T00:00:00', WaitingStartTime: '2026-09-12T09:55:00', EngagedStartTime: '2026-09-12T10:02:00',
    IsServiceCompleted: true, IsBilled: true, BillDueAmount: 1000, ServiceName: 'Physiotherapy', DoctorName: 'Dr. Iyer',
    PatientID: 'P-9',
  };

  it('takes the first real presence time as the check-in, skipping the unset arrival', () => {
    expect(C.appointmentRow(treated)).toMatchObject({
      id: 'A-77', name: 'Rahul Sharma', status: 'No Show', appointment_date: '2026-09-12T10:00:00',
      check_in_time: '2026-09-12T09:55:00', service_completed: 'yes', billed: 'yes', bill_balance: '1000',
      practitioner: 'Dr. Iyer', patient_id: 'P-9',
    });
  });

  it('leaves the check-in blank for a real no-show', () => {
    expect(C.appointmentRow({ AppointmentID: 'A-1', AppointmentStatus: 'No Show' }).check_in_time).toBe('');
  });
});

describe('what Vesoma described, found by the real watchers', () => {
  const ds = (object) => { const s = C.describeShape({ object }); return { name: s.name, columns: s.columns, internal: s.internal, own: 1 }; };
  const ALL = ['Appointments', 'Patients', 'Packages', 'Bills'].map(ds);

  it('offers Marked Absent But Attended, No Show, Gone Quiet, Stopped Coming and Package Over-used', () => {
    const ready = catalogueFor(ALL).filter((r) => r.ready).map((r) => r.id);
    for (const id of ['absent-but-attended', 'no-show', 'gone-quiet', 'stopped-coming', 'package-overused', 'renewal-due']) {
      expect(ready, id).toContain(id);
    }
  });

  it('reads "attended" from the check-in, never from the booking date', () => {
    const using = matchDataset(entryFor('absent-but-attended'), ds('Appointments')).using;
    expect(using).toEqual({ slot: 'appointment_date', status: 'status', when: 'check_in_time' });
  });

  it('measures Stopped Coming from the last visit, not the first', () => {
    expect(matchDataset(entryFor('stopped-coming'), ds('Patients')).using.when).toBe('last_visit_date');
  });

  it('never reads a bill balance as a deadline', () => {
    const appts = ds('Appointments');
    for (const id of ['deadline-approaching', 'promise-overdue']) {
      const m = matchDataset(entryFor(id), appts);
      if (m) expect(Object.values(m.using)).not.toContain('bill_balance');
    }
  });

  it('runs the plan on rows: the treated patient is found, the real no-show is not', () => {
    const cols = ds('Appointments').columns;
    const rows = [
      C.appointmentRow({ AppointmentID: 'A-77', AppointmentWithName: 'Rahul Sharma', StartDateTime: '2026-09-12T10:00:00', AppointmentStatus: 'No Show', WaitingStartTime: '2026-09-12T09:55:00' }),
      C.appointmentRow({ AppointmentID: 'A-78', AppointmentWithName: 'Meera Iyer', StartDateTime: '2026-09-12T11:00:00', AppointmentStatus: 'No Show' }),
      C.appointmentRow({ AppointmentID: 'A-79', AppointmentWithName: 'Arjun Rao', StartDateTime: '2026-09-12T12:00:00', AppointmentStatus: 'Completed', ArrivalDate: '2026-09-12T11:58:00' }),
    ].map((r) => cols.map((c) => r[c]));
    const found = rows.filter((r) => matchesAll(r, cols, [['status', 'matches', 'no show|absent'], ['check_in_time', 'not empty', '']]));
    expect(found.map((r) => r[cols.indexOf('name')])).toEqual(['Rahul Sharma']);
  });

  it('runs the plan on packages: used past what was bought', () => {
    const cols = ds('Packages').columns;
    const rows = [
      C.packageRow({ RowGUID: 'k1', PatientName: 'Kiran Shah', PackageName: 'Gym 12', PackageServiceTotalCount: 12, PackageServiceCompletedCount: 15 }),
      C.packageRow({ RowGUID: 'k2', PatientName: 'Divya Nair', PackageName: 'Physio 10', PackageServiceTotalCount: 10, PackageServiceCompletedCount: 6 }),
    ].map((r) => cols.map((c) => r[c]));
    const m = matchDataset(entryFor('package-overused'), ds('Packages')).using;
    const found = rows.filter((r) => matchesAll(r, cols, [[m.used, 'above column', m.entitled]]));
    expect(found.map((r) => r[cols.indexOf('name')])).toEqual(['Kiran Shah']);
  });
});

describe('finding what the clinic\'s Clinicea holds', () => {
  it('offers only the parts holding records, and skips one this login may not read', async () => {
    serve([
      [LOGIN, () => ({ status: 200, data: 't' })],
      [APPTS, () => ({ status: 200, data: [{ AppointmentID: 'a1' }] })],
      ['/api/v1/patients', () => ({ status: 200, data: [{ PatientID: 'p1' }] })],
      ['/api/v1/patient_packages', () => ({ status: 204, data: '' })],
      ['/api/v1/bills', () => { throw refusal(403); }],
    ]);
    expect(await C.listPopulated(CREDS)).toEqual([
      { object: 'Appointments', label: 'Appointments' },
      { object: 'Patients', label: 'Patients' },
    ]);
  });

  it('asks the owner for the key and the login, and nothing else', () => {
    expect(C.fields.filter((f) => !f.hidden).map((f) => f.name)).toEqual(['apiKey', 'username', 'password']);
  });
});

describe('both of Clinicea\'s spellings', () => {
  it('reads a no-show however Clinicea writes it, because the watchers look for "no show"', () => {
    for (const s of ['NoShow', 'No-Show', 'No Show']) {
      expect(C.appointmentRow({ AppointmentID: 'a', AppointmentStatus: s }).status, s).toBe('No Show');
    }
    expect(C.statusWords('CheckedOut')).toBe('Checked Out');
    expect(C.statusWords('Cancelled')).toBe('Cancelled');
  });

  it('maps the reference\'s v1 field names and the live v2 names to the same row', () => {
    const v2 = { AppointmentID: 'A-1', PatientID: 'P-1', AppointmentWithName: 'Rahul Sharma', StartDateTime: '2026-09-12T10:00:00',
      AppointmentStatus: 'NoShow', DoctorName: 'Dr. Iyer', WaitingStartTime: '2026-09-12T09:55:00' };
    const v1 = { ID: 'A-1', AppointmentWithID: 'P-1', AppointmentWithFullName: 'Rahul Sharma', StartDate: '2026-09-12T10:00:00',
      AppointmentStatus: 'NoShow', StaffName: 'Dr. Iyer', WaitingStartTime: '2026-09-12T09:55:00' };
    expect(C.appointmentRow(v1)).toEqual(C.appointmentRow(v2));
  });
});
