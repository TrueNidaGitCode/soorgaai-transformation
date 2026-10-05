/**
 * Clinicea, by the clinic's own API key and a staff login.
 *
 * ── Why this connector exists ─────────────────────────────────────────────
 *
 * Clinicea is the clinic management system a practice like Vesoma runs on:
 * the appointment diary, the patient file, the packages sold and the bills.
 * The problem Vesoma described first -- a patient treated but left marked No
 * Show, about twenty bookings a month -- is a disagreement inside one
 * Clinicea appointment: its status says No Show while its arrival time, its
 * completed service or its bill says the patient came. Their second, a
 * package used past what was bought, is two numbers on one package row.
 * Until now both could only be pieced together across a CRM, a phone and
 * WhatsApp; here they are read where they are recorded.
 *
 * Five parts can be read, each into its own dataset:
 *
 *   Appointments   every booking, its status, and the signs of a visit
 *   Patients       who the clients are, their visits and balances
 *   Packages       sessions bought against sessions used, and expiry
 *   Bills          what was billed, paid and still due
 *
 * ── The credential ────────────────────────────────────────────────────────
 *
 * An API key, which a clinic gets by buying Clinicea's API add-on through its
 * account manager (it is in no standard plan), and a staff username and
 * password. Clinicea logs in with all three and returns a session token that
 * every later call carries as the \`api_key\` query parameter. Held encrypted
 * in this application's database and nowhere else.
 *
 * ── Where the request shapes come from ────────────────────────────────────
 *
 * Clinicea's published Swagger reference (api.clinicea.com/swagger) for the
 * parts and fields, and a public integration that runs against the live API
 * for what the reference does not say: the v2 login and appointment calls,
 * the token travelling as \`api_key\`, a new login invalidating the last one,
 * the date format, and 204 for an empty page. It had not been run against a
 * Clinicea account of our own when it was written.
 */
import axios from 'axios';
import { sampleClinic } from '../cliniceaSample.js';

export const kind = 'clinicea';
export const label = 'Clinicea';
export const help = 'Appointments, patients, packages and bills from Clinicea. Needs Clinicea’s API add-on: ask your '
  + 'Clinicea account manager for an API key, and use a staff login that can see every appointment.';

export const BASE = 'https://api.clinicea.com';
export const OBJECTS = ['Appointments', 'Patients', 'Packages', 'Bills'];

export const fields = [
  { name: 'apiKey', label: 'API key', secret: true },
  { name: 'username', label: 'Staff username' },
  { name: 'password', label: 'Staff password', secret: true },
  // Written by the connect flow, never typed -- the same as Zoho's module.
  { name: 'object', label: 'What to read', options: OBJECTS, hidden: true, required: false },
  // 'yes' for the sample clinic: invented records, no credentials, no network.
  { name: 'sample', label: 'Sample clinic', hidden: true, required: false },
];

/** Is this connection the sample clinic rather than a real Clinicea account? */
export const isSample = (config) => String(config?.sample || '') === 'yes';

/** The sample's datasets say so in their names, so nobody mistakes them for a real clinic's. */
export const SAMPLE_SUFFIX = '(Clinicea sample)';

/*
 * The four shared columns lead every dataset, so a custom column whose name
 * contains one of them is never filled with the wrong value -- see
 * leadsquared.js, where this was learned.
 */
export const provides = ['id', 'name', 'phone', 'email'];
const LEADING = provides;

/** How far back a sync reads. A year: a course of treatment runs for months. */
export const LOOKBACK_DAYS = 365;
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
const TIMEOUT = 30000;
/** Clinicea's session lasts about an hour; renewed a little before. */
const TOKEN_MS = 55 * 60 * 1000;

const pad = (n) => String(n).padStart(2, '0');

/**
 * "YYYY-MM-DDTHH:mm:ss" -- the only form Clinicea accepts. toISOString's
 * milliseconds and trailing Z are refused with a 400 "Get Operation Failed".
 */
export function stamp(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T`
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export function since(now = new Date()) {
  return stamp(new Date(now.getTime() - LOOKBACK_DAYS * 24 * 3600e3));
}

/** .NET writes an unset date as 0001-01-01; that is no date, not a very old one. */
export function dateOf(v) {
  const s = String(v ?? '').trim();
  if (!s || /^0001-01-01/.test(s)) return '';
  return s;
}

const text = (v) => (v == null ? '' : String(v).trim());
const yes = (v) => (v === true || /^(true|1|yes)$/i.test(String(v ?? '')) ? 'yes' : '');
const first = (...vals) => {
  for (const v of vals) { const t = text(v); if (t) return t; }
  return '';
};

export function reason(err) {
  const status = err?.response?.status;
  if (status === 401) return 'Clinicea refused the API key, username or password.';
  if (status === 403) return 'This Clinicea login cannot read that. Clinicea’s API is an add-on bought through the account '
    + 'manager, and the staff role must be allowed to see appointments and bills.';
  if (status === 429) return 'Clinicea is rate limiting this application. It will catch up on the next sync.';
  if (!err?.response) return `Could not reach Clinicea: ${err?.message || 'no answer'}`;
  return `Clinicea answered ${status}.`;
}

// ── The session ─────────────────────────────────────────────────────────────

/*
 * One login per credential, shared. A new Clinicea login can invalidate the
 * previous token, so two reads logging in at once would knock each other out;
 * every call for the same key waits on the same login.
 */
const sessions = new Map();

const keyOf = (config) => `${text(config.apiKey)}|${text(config.username)}`;

export function forgetSessions() { sessions.clear(); }

async function login(config) {
  if (!text(config.apiKey) || !text(config.username) || !text(config.password)) {
    throw new Error('Enter the API key, the staff username and the staff password.');
  }
  const k = keyOf(config);
  const held = sessions.get(k);
  if (held?.token && held.until > Date.now()) return held.token;
  if (held?.pending) return held.pending;

  const pending = (async () => {
    try {
      const r = await axios.request({
        method: 'get',
        url: `${BASE}/api/v2/login/getTokenByStaffUsernamePwd`,
        params: { apiKey: text(config.apiKey), loginUserName: text(config.username), pwd: String(config.password) },
        timeout: TIMEOUT,
      });
      const d = r.data;
      const token = typeof d === 'string' ? d : (d?.Token || d?.token || d?.sessionId || d?.SessionID || '');
      if (!token) throw new Error('Clinicea logged in but returned no session.');
      sessions.set(k, { token, until: Date.now() + TOKEN_MS });
      return token;
    } catch (err) {
      sessions.delete(k);
      throw new Error(err?.response ? reason(err) : err.message);
    }
  })();
  sessions.set(k, { pending });
  return pending;
}

/** One call, carrying the session; logs in again once if it has expired. */
async function call(config, path, params) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await login(config);
    try {
      const r = await axios.request({
        method: 'get', url: `${BASE}${path}`, params: { ...params, api_key: token }, timeout: TIMEOUT,
      });
      if (r.status === 204) return [];
      return Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.Data) ? r.data.Data : []);
    } catch (err) {
      if (err?.response?.status === 401 && attempt === 0) {
        if (sessions.get(keyOf(config))?.token === token) sessions.delete(keyOf(config));
        continue;
      }
      if (err?.response?.status === 404 || err?.response?.status === 204) return [];
      throw new Error(reason(err));
    }
  }
  return [];
}

/** Every page of one part, 100 at a time, until a short page. */
async function pages(config, part, { maxRows = 50000, now = new Date() } = {}) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const rows = await call(config, part.path, part.params(since(now), page));
    out.push(...rows);
    if (out.length >= maxRows || rows.length < PAGE_SIZE) break;
  }
  return out.slice(0, maxRows);
}

/*
 * Where each part is read. Appointments use the v2 changes call the live
 * integration runs; the rest are the v1 sync calls the reference documents,
 * each with its own spelling of the date and page parameters.
 */
const PARTS = {
  Appointments: { path: '/api/v2/appointments/getChanges', params: (d, p) => ({ lastSyncDTime: d, pageNo: p, pageSize: PAGE_SIZE }) },
  Patients: { path: '/api/v1/patients', params: (d, p) => ({ lastSyncDate: d, intPageNo: p }) },
  Packages: { path: '/api/v1/patient_packages', params: (d, p) => ({ lastsyncdate: d, pageno: p }) },
  Bills: { path: '/api/v1/bills', params: (d, p) => ({ lastSyncDate: d, intPageNo: p }) },
};

export const objectOf = (config) => (OBJECTS.includes(config.object) ? config.object : 'Appointments');

// ── Rows, in the dataset's own words ────────────────────────────────────────

/**
 * An appointment, and the signs that the patient came.
 *
 * check_in_time is the first of the arrival, waiting and engaged times -- each
 * a real timestamp of the patient being there. It is the column "Marked
 * Absent, But Attended" reads: a booking whose status says No Show and which
 * has a check-in time is a treated patient left marked absent. Named so the
 * watchers' date role recognises it and ranks it as a check-in; the
 * appointment's own date stays appointment_date, which is the booking.
 */
export function appointmentRow(a) {
  const name = first(a?.AppointmentWithName, a?.AppointmentWithFullName,
    [text(a?.ApptWithFName), text(a?.ApptWithLName)].filter(Boolean).join(' '));
  return {
    id: first(a?.AppointmentID, a?.ID),
    name,
    phone: first(a?.AppointmentWithPhone),
    email: first(a?.AppointmentWithEmail),
    appointment_date: dateOf(first(a?.StartDateTime, a?.StartDate)),
    status: statusWords(first(a?.AppointmentStatus)),
    previous_status: statusWords(first(a?.PrevAppointmentStatus)),
    check_in_time: dateOf(first(dateOf(a?.ArrivalDate), dateOf(a?.WaitingStartTime), dateOf(a?.EngagedStartTime))),
    service_completed: yes(a?.IsServiceCompleted),
    billed: yes(a?.IsBilled),
    // Money owed, not a date: 'bill_due' read as a due date to the watchers.
    bill_balance: first(a?.BillDueAmount),
    service: first(a?.ServiceName),
    practitioner: first(a?.DoctorName, a?.StaffName),
    cancellation_reason: first(a?.CancellationReason),
    patient_id: first(a?.PatientID, a?.AppointmentWithID),
    modified: dateOf(a?.ModifiedDatetime),
  };
}

export function patientRow(p) {
  return {
    id: first(p?.PatientID, p?.ID),
    name: first(p?.Name, [text(p?.FirstName), text(p?.LastName)].filter(Boolean).join(' ')),
    phone: first(p?.Mobile),
    email: first(p?.Email),
    file_no: first(p?.FileNo),
    // Not '..._date': the first visit is history, and as a date it outranked
    // the last visit for Stopped Coming.
    first_seen: dateOf(p?.FirstAppointmentDate),
    last_visit_date: dateOf(p?.LastAppointmentDate),
    next_appointment_date: dateOf(p?.NextAppointmentDatetime),
    total_visits: first(p?.NoOfTotalVisit),
    billed_total: first(p?.BilledTotal),
    paid_total: first(p?.PaidTotal),
    preferred_practitioner: first(p?.PreferredPractitionerName),
    modified: dateOf(p?.ModifiedDatetime),
  };
}

/**
 * A package: sessions bought against sessions used, and when it expires.
 * sessions_used above sessions_bought is a package used past its entitlement.
 */
export function packageRow(k) {
  return {
    id: first(k?.RowGUID, [text(k?.PackageID), text(k?.PatientID)].filter(Boolean).join(':')),
    name: first(k?.PatientName, [text(k?.PatientFName), text(k?.PatientLName)].filter(Boolean).join(' ')),
    phone: first(k?.PatientMobileNo),
    email: first(k?.PatientEmail),
    package: first(k?.PackageName),
    sold_on_date: dateOf(k?.PackageSoldOnDate),
    expiry_date: dateOf(k?.PackageExpiryDate),
    sessions_bought: first(k?.PackageServiceTotalCount),
    sessions_used: first(k?.PackageServiceCompletedCount),
    package_total: first(k?.PackageTotal),
    status: k?.PackageIsClosed === true || /^true$/i.test(String(k?.PackageIsClosed)) ? 'Closed' : 'Open',
    patient_id: first(k?.PatientID),
  };
}

export function billRow(b) {
  return {
    id: first(b?.BillID, b?.ID),
    name: first(b?.PatientName, b?.BillToName),
    phone: first(b?.PatientMobile, b?.PatientMobileNo),
    email: first(b?.PatientEmail),
    invoice: first(b?.BillInvoiceNo, b?.BillInvoice),
    bill_date: dateOf(first(b?.BillDate, b?.CreatedDatetime)),
    total_amount: first(b?.PatientTotalAmount),
    paid_amount: first(b?.PatientPaidAmount),
    due_amount: first(b?.PatientDueAmt),
    package: first(b?.GetPackageCustomName),
    appointment_id: first(b?.AppointmentID),
    patient_id: first(b?.PatientID),
  };
}

/**
 * A status in plain words, however Clinicea spells it.
 *
 * Clinicea's reference does not list its status values, and its settings
 * spell the one that matters most as one word (IsAutoMarkPatNoShow). The
 * watchers look for "no show": a status written NoShow or No-Show would be
 * missed on every booking, silently. So a run-together or hyphenated status
 * is spaced out -- NoShow and No-Show become No Show, CheckedOut becomes
 * Checked Out -- and one already in words is left as it is.
 */
export function statusWords(v) {
  return text(v).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/s*-s*/g, ' ').replace(/s{2,}/g, ' ');
}

const ROWS = { Appointments: appointmentRow, Patients: patientRow, Packages: packageRow, Bills: billRow };

const SHAPES = {
  Appointments: {
    columns: [...LEADING, 'appointment_date', 'status', 'previous_status', 'check_in_time', 'service_completed',
      'billed', 'bill_balance', 'service', 'practitioner', 'cancellation_reason', 'patient_id', 'modified'],
    internal: ['patient_id', 'modified'],
  },
  Patients: {
    columns: [...LEADING, 'file_no', 'last_visit_date', 'first_seen', 'next_appointment_date', 'total_visits',
      'billed_total', 'paid_total', 'preferred_practitioner', 'modified'],
    internal: ['modified'],
  },
  Packages: {
    columns: [...LEADING, 'package', 'sold_on_date', 'expiry_date', 'sessions_bought', 'sessions_used',
      'package_total', 'status', 'patient_id'],
    internal: ['patient_id'],
  },
  Bills: {
    columns: [...LEADING, 'invoice', 'bill_date', 'total_amount', 'paid_amount', 'due_amount', 'package',
      'appointment_id', 'patient_id'],
    internal: ['appointment_id', 'patient_id'],
  },
};

export function describeShape(config) {
  const object = objectOf(config);
  return { name: `${object} ${isSample(config) ? SAMPLE_SUFFIX : '(Clinicea)'}`, key: 'id', ...SHAPES[object] };
}

export function describe(config) {
  return `${isSample(config) ? 'Clinicea sample clinic' : 'Clinicea'} · ${objectOf(config)}`;
}

export async function test(config) {
  if (isSample(config)) return { ok: true, message: 'The sample clinic: invented records, for trying Svarg before connecting your own.' };
  await login(config);
  return { ok: true, message: 'Connected to Clinicea.' };
}

export async function pull(config, { maxRows = 50000, now = new Date() } = {}) {
  const object = objectOf(config);
  // The sample clinic runs through the same row mapping as a real account,
  // so what the watchers find in it is what they would find in yours.
  if (isSample(config)) return sampleClinic(now)[object].slice(0, maxRows).map(ROWS[object]).filter((r) => r.id);
  const raw = await pages(config, PARTS[object], { maxRows, now });
  return raw.map(ROWS[object]).filter((r) => r.id);
}

/**
 * Which parts of this clinic's Clinicea hold anything, the way Zoho's modules
 * are found. One page each; a part this login may not read is skipped rather
 * than fatal, as in Zoho -- a role that cannot see bills can still see the
 * diary.
 */
export async function listPopulated(config, { now = new Date() } = {}) {
  if (isSample(config)) return OBJECTS.map((object) => ({ object, label: object }));
  await login(config);
  const out = [];
  for (const object of OBJECTS) {
    const part = PARTS[object];
    try {
      const rows = await call(config, part.path, part.params(since(now), 1));
      if (rows.length) out.push({ object, label: object });
    } catch { /* skipped, as Zoho skips a locked module */ }
  }
  return out;
}
