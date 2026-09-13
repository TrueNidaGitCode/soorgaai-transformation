// Usage, from backend/trunida-backend: npm i --no-save xlsx && node scripts/app-checks/make_academy_xlsx.cjs
//
// A cricket academy's folder as its admin would actually keep it: the
// roster, this month's batch schedule, the roll calls, a fee sheet, the
// coaches, and a notes file that is not a spreadsheet. Values are a real
// academy's kind of values and nothing like the simulated rows the
// application was built with (different id scheme, names, batches, dates).
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '../../../../scripts/.screens/Six Cricket Academy - Sept 2026');
fs.mkdirSync(OUT, { recursive: true });

let seed = 20260913;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pad = (n, w = 3) => String(n).padStart(w, '0');

const FIRST = ['Aditya', 'Rohan', 'Ishaan', 'Kabir', 'Vihaan', 'Arjun', 'Reyansh', 'Dhruv', 'Pranav', 'Nikhil', 'Siddharth', 'Karthik', 'Harshith', 'Yuvraj', 'Tejas', 'Manav', 'Ritvik', 'Sanjay', 'Abhinav', 'Advait', 'Diya', 'Ananya', 'Meera', 'Sanjana', 'Aishwarya', 'Kavya', 'Nithya', 'Riya', 'Shreya', 'Tanvi'];
const LAST = ['Iyer', 'Krishnan', 'Subramanian', 'Reddy', 'Menon', 'Nair', 'Pillai', 'Raghavan', 'Venkatesh', 'Srinivasan', 'Chandran', 'Balaji', 'Murali', 'Shetty', 'Hegde', 'Kulkarni', 'Deshpande', 'Rao', 'Naidu', 'Gowda'];
const GUARDIAN_FIRST = ['Suresh', 'Ramesh', 'Prakash', 'Mahesh', 'Ganesh', 'Rajesh', 'Lakshmi', 'Kavitha', 'Sudha', 'Revathi', 'Saravanan', 'Murugan', 'Anitha', 'Deepa', 'Vijay'];

// The batches, as the academy runs them: age group x slot, at Anna Nagar and Velachery grounds.
const BATCHES = [
  { id: 'AN-U12-EVE', label: 'U-12 Evening (Anna Nagar)', age: 'U-12', schedule: 'Mon-Wed-Fri 16:30-18:00', coach: 'Coach Senthil Kumar', coachId: 'CH-07', ground: 'Anna Nagar Net 1', cap: 16 },
  { id: 'AN-U14-MOR', label: 'U-14 Morning (Anna Nagar)', age: 'U-14', schedule: 'Tue-Thu-Sat 06:00-07:45', coach: 'Coach Balaji R', coachId: 'CH-02', ground: 'Anna Nagar Net 2', cap: 18 },
  { id: 'AN-U16-MOR', label: 'U-16 Morning (Anna Nagar)', age: 'U-16', schedule: 'Mon-Wed-Fri 06:00-08:00', coach: 'Coach Balaji R', coachId: 'CH-02', ground: 'Anna Nagar Main Pitch', cap: 18 },
  { id: 'VL-U12-EVE', label: 'U-12 Evening (Velachery)', age: 'U-12', schedule: 'Tue-Thu 17:00-18:30', coach: 'Coach Priyanka S', coachId: 'CH-11', ground: 'Velachery Indoor Net', cap: 14 },
  { id: 'VL-U14-EVE', label: 'U-14 Evening (Velachery)', age: 'U-14', schedule: 'Mon-Wed-Fri 17:00-18:45', coach: 'Coach Dinesh M', coachId: 'CH-04', ground: 'Velachery Net A', cap: 18 },
  { id: 'VL-U19-WKD', label: 'U-19 Weekend (Velachery)', age: 'U-19', schedule: 'Sat-Sun 07:00-10:00', coach: 'Coach Arun Prasad', coachId: 'CH-01', ground: 'Velachery Turf', cap: 22 },
  { id: 'AN-ADL-WKD', label: 'Adults Weekend (Anna Nagar)', age: 'Adults', schedule: 'Sat-Sun 06:30-08:30', coach: 'Coach Senthil Kumar', coachId: 'CH-07', ground: 'Anna Nagar Net 3', cap: 12 },
];
const PLANS = [['Monthly', 4000], ['Quarterly', 11000], ['Annual', 40000]];

// ── Students ───────────────────────────────────────────────────────────────
const students = [];
for (let i = 1; i <= 64; i++) {
  const b = BATCHES[i % BATCHES.length];
  const first = pick(FIRST), last = pick(LAST);
  const gfirst = pick(GUARDIAN_FIRST);
  const [plan, fee] = pick(PLANS);
  const enrolled = new Date(2025, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27));
  const validUntil = new Date(2026, 8 + (plan === 'Monthly' ? 0 : plan === 'Quarterly' ? 2 : 11), plan === 'Monthly' ? 30 : 31);
  const status = rnd() < 0.86 ? 'Active' : (rnd() < 0.5 ? 'Paused' : 'Lapsed');
  const feeStatus = status !== 'Active' ? 'Overdue' : (rnd() < 0.78 ? 'Paid' : 'Due');
  const lastAtt = status === 'Active' ? new Date(2026, 8, 1 + Math.floor(rnd() * 12)) : new Date(2026, 6, 1 + Math.floor(rnd() * 20));
  students.push({
    'Trainee ID': `SCA-26-${pad(i)}`,
    'First Name': first, 'Last Name': last,
    'Age Group': b.age,
    'Primary Guardian': `${gfirst} ${last}`,
    'Guardian Phone': `+91 ${pick(['98', '99', '97', '96', '94', '90'])}${pad(Math.floor(rnd() * 1e8), 8)}`,
    'Enrollment Date': enrolled.toISOString().slice(0, 10),
    'Plan Type': plan,
    'Subscription Status': status,
    'Subscription Valid Until': validUntil.toISOString().slice(0, 10),
    'Batch ID': b.id,
    'Batch Schedule': b.schedule,
    'Assigned Coach Name': b.coach,
    'WhatsApp Group Status': rnd() < 0.9 ? 'Joined' : 'Pending',
    'Monthly Fee INR': plan === 'Monthly' ? fee : Math.round(fee / (plan === 'Quarterly' ? 3 : 12)),
    'Fee Status': feeStatus,
    'Last Attendance Date': lastAtt.toISOString().slice(0, 10),
  });
}

// ── Batch schedule: two weeks of sessions, from 8 Sept 2026 ────────────────
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FOCUS = ['Front-foot drives & footwork', 'Short-ball pull and hook', 'Bowling run-up and follow-through', 'Yorker and slower-ball practice', 'Fielding: slip cordon and close catching', 'Running between wickets', 'Match simulation: 10-over game', 'Spin bowling: grip and flight', 'Wicketkeeping drills', 'Fitness: agility ladder and sprints', 'Power hitting in the nets', 'Death-over bowling plans'];
const schedule = [];
let sid = 1;
const dayMatches = (sched, dayName) => {
  const short = dayName.slice(0, 3);
  return sched.split(' ')[0].split('-').includes(short);
};
for (let d = 0; d < 14; d++) {
  const date = new Date(2026, 8, 8 + d);
  const dayName = DAYS[date.getDay()];
  for (const b of BATCHES) {
    if (!dayMatches(b.schedule, dayName)) continue;
    const [start, end] = b.schedule.split(' ')[1].split('-');
    const past = date < new Date(2026, 8, 13);
    const confirmed = Math.max(4, Math.round(b.cap * (0.6 + rnd() * 0.35)));
    schedule.push({
      'Schedule ID': `SES-2609${pad(sid++)}`,
      'Batch ID': b.id,
      'Session Date': date.toISOString().slice(0, 10),
      'Day of Week': dayName,
      'Start Time': start, 'End Time': end,
      'Facility Pitch Assigned': b.ground,
      'Primary Coach ID': b.coachId,
      'Primary Coach Name': b.coach,
      'Assistant Coach ID': pick(['CH-14', 'CH-15', 'CH-16', 'CH-17', '']),
      'Session Focus': pick(FOCUS),
      'Max Capacity': b.cap,
      'Confirmed Attendance': past ? confirmed : '',
      'Session Status': past ? (rnd() < 0.92 ? 'Completed' : 'Cancelled - rain') : 'Scheduled',
      'WhatsApp Notification Status': past ? 'Sent' : (d < 7 ? 'Sent' : 'Not yet'),
      'Remarks': past ? pick(['', '', 'Two late arrivals', 'Ground wet, drills indoors', 'Extended by 15 min', 'Guest coach observed']) : '',
    });
  }
}

// ── Roll calls: for the completed sessions, one row per trainee in the batch ──
const roll = [];
let rc = 1;
const REPLY = [['Coming sir', 'Attending'], ['Yes', 'Attending'], ['Present', 'Attending'], ['Will be there', 'Attending'], ['Not coming, fever', 'Not attending'], ['Leave today', 'Not attending'], ['Can\'t make it', 'Not attending'], ['', 'No reply']];
for (const s of schedule.filter(x => x['Session Status'] === 'Completed')) {
  const members = students.filter(st => st['Batch ID'] === s['Batch ID'] && st['Subscription Status'] === 'Active');
  for (const st of members) {
    const [text, intent] = pick(REPLY);
    const said = intent === 'Attending';
    const came = said ? rnd() < 0.9 : rnd() < 0.25;
    const t = new Date(s['Session Date'] + 'T00:00:00'); t.setDate(t.getDate() - 1);
    roll.push({
      'Roll Call ID': `RC-${s['Session Date'].replace(/-/g, '')}-${pad(rc++)}`,
      'Session Date': s['Session Date'],
      'Schedule ID': s['Schedule ID'],
      'Trainee ID': st['Trainee ID'],
      'Primary Coach ID': s['Primary Coach ID'],
      'Batch Name': BATCHES.find(b => b.id === s['Batch ID']).label,
      'Declared Chat Intent': intent,
      'Chat Response Timestamp': text ? `${t.toISOString().slice(0, 10)} ${pad(18 + Math.floor(rnd() * 4), 2)}:${pad(Math.floor(rnd() * 60), 2)}` : '',
      'Message ID': text ? `WA-${Math.floor(rnd() * 9e6 + 1e6)}` : '',
      'Verified Physical Status': came ? 'Present' : 'Absent',
      'Actual Check In Time': came ? `${s['Start Time'].slice(0, 2)}:${pad(Math.floor(rnd() * 20), 2)}` : '',
      'Attendance Discrepancy Flag': (said && !came) ? 'Said yes, absent' : (!said && came && intent !== 'No reply') ? 'Said no, present' : (intent === 'No reply' && came) ? 'No reply, present' : 'OK',
      'Coach Notes': came ? pick(['', '', '', 'Good session', 'Needs work on footwork', 'Bowled well']) : pick(['', 'Guardian informed', '']),
    });
  }
}

// ── Fee sheet: the accountant's, keyed by trainee id -- updates fee status on the roster ──
const fees = students.map(st => {
  const paidOn = st['Fee Status'] === 'Paid' ? `2026-09-${pad(1 + Math.floor(rnd() * 10), 2)}` : '';
  return {
    'Trainee ID': st['Trainee ID'],
    'Student': `${st['First Name']} ${st['Last Name']}`,
    'Batch ID': st['Batch ID'],
    'Plan Type': st['Plan Type'],
    'Monthly Fee INR': st['Monthly Fee INR'],
    'Invoice No': `SCA/26-27/${pad(200 + Number(st['Trainee ID'].slice(-3)))}`,
    'Due Date': '2026-09-05',
    'Paid On': paidOn,
    'Mode': paidOn ? pick(['GPay', 'GPay', 'PhonePe', 'Cash', 'Bank transfer']) : '',
    'Fee Status': st['Fee Status'],
    'Remarks': st['Fee Status'] === 'Overdue' ? 'Reminder sent 10 Sept' : '',
  };
});

// ── Coaches: no dataset for it -- the page should say "not used" ────────────
const coaches = [
  ['CH-01', 'Arun Prasad', 'Head Coach', 'Batting, match strategy', '+91 9840012345', 'Velachery', 'BCCI Level 2'],
  ['CH-02', 'Balaji R', 'Senior Coach', 'Batting technique', '+91 9884023456', 'Anna Nagar', 'BCCI Level 1'],
  ['CH-04', 'Dinesh M', 'Coach', 'Pace bowling', '+91 9790034567', 'Velachery', 'BCCI Level 1'],
  ['CH-07', 'Senthil Kumar', 'Coach', 'Fielding, fitness', '+91 9444045678', 'Anna Nagar', 'NIS Diploma'],
  ['CH-11', 'Priyanka S', 'Coach', 'Junior development', '+91 9962056789', 'Velachery', 'BCCI Level 1'],
  ['CH-14', 'Karthik V', 'Assistant Coach', 'Spin bowling', '+91 9003067890', 'Anna Nagar', ''],
  ['CH-15', 'Mohan Raj', 'Assistant Coach', 'Wicketkeeping', '+91 9176078901', 'Velachery', ''],
  ['CH-16', 'Faizal A', 'Assistant Coach', 'Fitness', '+91 8925089012', 'Anna Nagar', 'ACE CPT'],
  ['CH-17', 'Gokul N', 'Assistant Coach', 'Fielding', '+91 7358090123', 'Velachery', ''],
].map(r => ({ 'Coach ID': r[0], 'Name': r[1], 'Role': r[2], 'Specialisation': r[3], 'Phone': r[4], 'Ground': r[5], 'Certification': r[6] }));

function write(name, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName);
  XLSX.writeFile(wb, path.join(OUT, name));
  console.log(name, sheets.map(([n, r]) => `${n}: ${r.length} rows`).join(' | '));
}
write('Students 2026-27.xlsx', [['Roster', students]]);
write('Batch schedule Sept 2026.xlsx', [['Sept 8-21', schedule]]);
write('Roll calls Sept 2026.xlsx', [['Roll calls', roll]]);
write('Fee collection Sept 2026.xlsx', [['September', fees]]);
write('Coaches.xlsx', [['Coaches', coaches]]);
fs.writeFileSync(path.join(OUT, 'Ground rules.txt'), 'Six Cricket Academy - ground rules\n\n1. Whites or academy kit at every session.\n2. Helmets compulsory for batting in the nets.\n3. Guardians reply to the batch WhatsApp poll by 9 PM the night before.\n4. Fees due by the 5th of each month.\n');
console.log('folder:', OUT);
