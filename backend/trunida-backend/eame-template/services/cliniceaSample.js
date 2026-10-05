/**
 * A sample clinic, in Clinicea's own shapes.
 *
 * ── Why ──────────────────────────────────────────────────────────────────
 *
 * A clinic owner should see what this finds before buying Clinicea's API
 * add-on, not after. So the Clinicea card offers "try it with a sample clinic",
 * and this is that clinic: six months of a physiotherapy and sports-medicine
 * practice, written as the raw records Clinicea's API returns -- the same
 * field names, the same unset-date convention, and NoShow written as one word
 * the way Clinicea's own settings spell it -- so they go through the real
 * connector, the real datasets and the real watchers. Nothing downstream knows
 * it is a sample except the dataset names, which say so.
 *
 * ── What is planted ──────────────────────────────────────────────────────
 *
 * The problems clinics have described, at the rates one described them:
 *
 *   treated, left marked No Show     18 in the last six weeks (Vesoma: ~20 a month)
 *   packages used past what was sold  6
 *   regulars who stopped coming       9, each with a package still open
 *   packages expiring with sessions   6 in the next fortnight
 *   real no-shows                     6, which must NOT be reported as treated
 *
 * Seeded, and every date counted from today, so the sample shows the same
 * problems whichever day it is opened. Every person in it is invented.
 */

/** A small seeded generator, so the sample is the same every time. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aarav', 'Diya', 'Rohan', 'Ishita', 'Kabir', 'Meera', 'Arjun', 'Ananya', 'Vikram', 'Priya',
  'Siddharth', 'Kavya', 'Rahul', 'Nisha', 'Aditya', 'Sneha', 'Karthik', 'Pooja', 'Varun', 'Riya',
  'Nikhil', 'Divya', 'Manish', 'Shreya', 'Harsh', 'Tanvi', 'Gaurav', 'Neha', 'Akash', 'Lakshmi'];
const LAST = ['Iyer', 'Menon', 'Rao', 'Nair', 'Sharma', 'Reddy', 'Kulkarni', 'Pillai', 'Shetty', 'Gupta',
  'Krishnan', 'Bhat', 'Joshi', 'Desai', 'Hegde', 'Patil', 'Varma', 'Kapoor', 'Das', 'Mehta'];
const PRACTITIONERS = ['Dr. Ananya Rao', 'Dr. Vivek Menon', 'Dr. Sana Qureshi', 'Coach Rohit Das', 'Dr. Leela Pillai'];
const SERVICES = ['Physiotherapy session', 'Sports massage', 'Strength & conditioning', 'Post-surgery rehab', 'Nutrition consult'];
const PACKAGES = [['Physio 10 sessions', 10, 12000], ['Rehab 12 sessions', 12, 15600], ['Gym 24 sessions', 24, 9600], ['Recovery 6 sessions', 6, 7200]];

const pad = (n) => String(n).padStart(2, '0');
const at = (base, days, hour, minute = 0) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, hour, minute);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};
const UNSET = '0001-01-01T00:00:00';

/**
 * The whole clinic, as raw Clinicea records.
 * @returns {{ Appointments: object[], Patients: object[], Packages: object[], Bills: object[] }}
 */
export function sampleClinic(now = new Date()) {
  const r = rng(20261005);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ── Patients, each with a role in the story ───────────────────────────
  const patients = [];
  const used = new Set();
  for (let i = 0; i < 72; i += 1) {
    let name;
    do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (used.has(name));
    used.add(name);
    patients.push({
      id: `SP-${1001 + i}`, name, mobile: `+91 98${String(40000000 + Math.floor(r() * 9999999)).slice(0, 8)}`,
      email: `${name.toLowerCase().replace(/ /g, '.')}@example.com`,
      practitioner: pick(PRACTITIONERS), service: pick(SERVICES),
      // 0-8 stopped coming; 9-62 regular; 63-71 new this month
      role: i < 9 ? 'stopped' : i < 63 ? 'regular' : 'new',
    });
  }

  const appts = [];
  const bills = [];
  let apptNo = 5000;
  let billNo = 9000;
  const book = (p, day, { status, checkIn = false, completed = false, billed = false, reason = '' }) => {
    const hour = 8 + Math.floor(r() * 10);
    const id = `SA-${apptNo += 1}`;
    appts.push({
      AppointmentID: id, PatientID: p.id, AppointmentWithName: p.name, AppointmentWithPhone: p.mobile,
      AppointmentWithEmail: p.email, StartDateTime: at(today, day, hour), AppointmentStatus: status,
      PrevAppointmentStatus: status === 'NoShow' ? 'Booked' : '',
      ArrivalDate: checkIn ? at(today, day, hour - 1, 50) : UNSET,
      WaitingStartTime: checkIn ? at(today, day, hour - 1, 52) : UNSET,
      EngagedStartTime: checkIn ? at(today, day, hour, 2) : UNSET,
      IsServiceCompleted: completed, IsBilled: billed, BillDueAmount: billed && r() < 0.15 ? 1200 : 0,
      ServiceName: p.service, DoctorName: p.practitioner, CancellationReason: reason,
      ModifiedDatetime: at(today, Math.min(day, 0), 20),
    });
    if (billed) {
      const due = r() < 0.12 ? 1200 : 0;
      bills.push({
        BillID: `SB-${billNo += 1}`, PatientID: p.id, PatientName: p.name, PatientMobile: p.mobile,
        BillInvoiceNo: `INV-${billNo}`, BillDate: at(today, day, hour + 1), PatientTotalAmount: 1200,
        PatientPaidAmount: 1200 - due, PatientDueAmt: due, AppointmentID: id,
      });
    }
    return id;
  };

  // ── Visits: weekly for regulars, stopping three to eight weeks ago ────
  for (const p of patients) {
    const every = 3 + Math.floor(r() * 5);
    const start = p.role === 'new' ? -20 : -150 + Math.floor(r() * 30);
    const lastDay = p.role === 'stopped' ? -(21 + Math.floor(r() * 35)) : 14;
    for (let d = start; d <= lastDay; d += every) {
      if (d > 0) { book(p, d, { status: 'Booked' }); continue; }
      const roll = r();
      if (roll < 0.06) book(p, d, { status: 'Cancelled', reason: pick(['Travelling', 'Unwell', 'Work clash', 'Rescheduled by phone']) });
      else if (roll < 0.075 && d > -60) book(p, d, { status: 'NoShow' });            // a real no-show
      else book(p, d, { status: 'Completed', checkIn: true, completed: true, billed: true });
    }
    p.last = lastDay;
  }

  // ── The planted problem: treated, and left marked No Show ─────────────
  const regulars = patients.filter((p) => p.role === 'regular');
  for (let i = 0; i < 18; i += 1) {
    const p = regulars[(i * 7) % regulars.length];
    book(p, -(2 + i * 2), { status: 'NoShow', checkIn: true, completed: true, billed: true });
  }

  // ── Packages: sold, used, some past what was bought ───────────────────
  const packages = [];
  patients.forEach((p, i) => {
    if (i % 6 === 5) return;                                    // some pay per session
    const [pkgName, bought, total] = PACKAGES[i % PACKAGES.length];
    let usedCount = Math.min(bought, Math.floor(r() * bought));
    let expiresIn = 30 + Math.floor(r() * 90);
    if (i >= 12 && i < 19) usedCount = bought + 1 + Math.floor(r() * 4);  // over-used: 6 (17 pays per session)
    if (i >= 22 && i < 28) { expiresIn = 3 + (i - 22) * 2; usedCount = Math.floor(bought / 2); } // expiring with sessions left: 6
    if (p.role === 'stopped') usedCount = Math.floor(bought / 3);            // open, abandoned
    packages.push({
      RowGUID: `SK-${2000 + i}`, PackageID: `PK-${300 + (i % 4)}`, PatientID: p.id, PatientName: p.name,
      PatientMobileNo: p.mobile, PatientEmail: p.email, PackageName: pkgName,
      PackageSoldOnDate: at(today, -90 - Math.floor(r() * 60), 11), PackageExpiryDate: at(today, expiresIn, 23, 59),
      PackageServiceTotalCount: bought, PackageServiceCompletedCount: usedCount, PackageTotal: total,
      PackageIsClosed: false,
    });
  });

  // ── Patients as Clinicea lists them ───────────────────────────────────
  const visits = (id) => appts.filter((a) => a.PatientID === id && a.AppointmentStatus === 'Completed');
  const Patients = patients.map((p) => {
    const v = visits(p.id).map((a) => a.StartDateTime).sort();
    const next = appts.filter((a) => a.PatientID === p.id && a.AppointmentStatus === 'Booked').map((a) => a.StartDateTime).sort()[0];
    return {
      PatientID: p.id, Name: p.name, Mobile: p.mobile, Email: p.email, FileNo: p.id.replace('SP-', 'F'),
      FirstAppointmentDate: v[0] || UNSET, LastAppointmentDate: v[v.length - 1] || UNSET,
      NextAppointmentDatetime: next || UNSET, NoOfTotalVisit: v.length,
      BilledTotal: v.length * 1200, PaidTotal: v.length * 1200, PreferredPractitionerName: p.practitioner,
      ModifiedDatetime: at(today, 0, 9),
    };
  });

  return { Appointments: appts, Patients, Packages: packages, Bills: bills };
}
