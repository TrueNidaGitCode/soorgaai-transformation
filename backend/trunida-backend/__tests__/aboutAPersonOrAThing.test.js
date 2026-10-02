/**
 * A meeting is not a patient, and a watcher switched off is switched off.
 *
 * ── What a clinic owner saw ────────────────────────────────────────────────
 *
 * The people picker on the board offered two names: "Rahul Sharma", and
 * "Physiotherapy Consultation - Rahul". The second is the name of an
 * appointment. And two watchers had just started reporting Rahul as well:
 * Leave Clash, which looks for staff away on the same day, and Over
 * Capacity, which looks for more bookings than places — on a list of one-to-one
 * patient consultations with no leave and no capacity in it anywhere.
 *
 * Three defects, each its own describe block:
 *
 *   The picker took any title that was not a phone number as a person, so a
 *   watcher whose subject is a session put the session's name in the list.
 *
 *   The catalogue let a question name a fact — "away", "places" — that no
 *   bound column carried, so those watchers bound to anything with the right
 *   shape and the answer step invented the missing fact.
 *
 *   Switching a watcher off stopped it running and left what it had found on
 *   the board, where nothing could ever resolve it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  subjectIsPerson, personInEvidence, personForFinding, peopleIn, buildPhoneBook,
} from '../eame-template/services/peopleService.js';
import { catalogueFor, entryFor } from '../eame-template/services/agentCatalogue.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/* The meeting row exactly as Zoho delivered it, with the fields that matter. */
const MEETING_COLS = ['id', 'Event_Title', 'Start_DateTime', 'Owner', 'Who_Id', 'What_Id'];
const MEETING = ['1425808000000475524', 'Physiotherapy Consultation - Rahul', '2026-09-27T16:00:00+05:30',
  'Pranesh Babykannan', 'Rahul Sharma', 'Clinic and Wellness'];

const meetingFinding = (watcherId, title, row = MEETING) => ({
  watcherId, title, evidence: { columns: MEETING_COLS, lines: [row] },
});

describe('is a finding about a person, or about a thing?', () => {
  it('reads it from the catalogue question’s subject', () => {
    expect(subjectIsPerson('no-show')).toBe(true);           // "{who} in …"
    expect(subjectIsPerson('over-capacity')).toBe(false);    // "{slot} in …"
    expect(subjectIsPerson('leave-clash')).toBe(false);      // "days in …"
  });

  it('treats a pair watcher led by a person as about a person', () => {
    expect(subjectIsPerson('promise-not-kept')).toBe(true);  // "{left.who} in …"
  });

  it('leaves a question somebody typed as it always was', () => {
    // No catalogue entry, so the subject is unknown; hiding it from the
    // picker would be a regression for every hand-written watcher.
    expect(subjectIsPerson('')).toBe(true);
    expect(subjectIsPerson('invented-by-hand')).toBe(true);
  });
});

describe('the person a session is about', () => {
  const book = new Map();

  it('is read from the session’s own row', () => {
    expect(personInEvidence({ columns: MEETING_COLS, lines: [MEETING] }, book)).toBe('Rahul Sharma');
  });

  it('is never the member of staff whose diary it is', () => {
    /*
     * Owner ranks just below Who_Id for `who`. A session with no patient linked
     * must resolve to nobody, not fall through to the physiotherapist and file
     * their own diary under their name.
     */
    const noPatient = [...MEETING];
    noPatient[MEETING_COLS.indexOf('Who_Id')] = '';
    expect(personInEvidence({ columns: MEETING_COLS, lines: [noPatient] }, book)).toBe('');
  });

  it('is nobody when the evidence names several people', () => {
    const second = [...MEETING];
    second[MEETING_COLS.indexOf('Who_Id')] = 'Priya Nair';
    expect(personInEvidence({ columns: MEETING_COLS, lines: [MEETING, second] }, book)).toBe('');
  });

  it('goes through the phone book when the column holds a number', () => {
    const phoneBook = buildPhoneBook([{ columns: ['Full_Name', 'Phone'], rows: [['Rahul Sharma', '07349250500']] }]);
    const byNumber = [...MEETING];
    byNumber[MEETING_COLS.indexOf('Who_Id')] = '+91 73492 50500';
    expect(personInEvidence({ columns: MEETING_COLS, lines: [byNumber] }, phoneBook)).toBe('Rahul Sharma');
  });
});

describe('the people picker', () => {
  const book = new Map();

  it('names the patient for a session finding, not the session', () => {
    const v = meetingFinding('over-capacity', 'Physiotherapy Consultation - Rahul');
    expect(personForFinding(v, book)).toBe('Rahul Sharma');
  });

  it('offers one person where it used to offer a person and a meeting', () => {
    /*
     * The clinic's board, as it was: three findings titled Rahul Sharma and
     * one titled with the appointment. The list read "Rahul Sharma",
     * "Physiotherapy Consultation - Rahul".
     */
    const board = [
      meetingFinding('no-show', 'Rahul Sharma'),
      meetingFinding('timesheet-chaser', 'Rahul Sharma'),
      meetingFinding('over-capacity', 'Physiotherapy Consultation - Rahul'),
    ].map((v) => ({ ...v, person: personForFinding(v, book) }));
    expect(peopleIn(board)).toEqual([{ person: 'Rahul Sharma', findings: 3 }]);
  });

  it('keeps a finding about nobody off the list instead of using its title', () => {
    const noPatient = [...MEETING];
    noPatient[MEETING_COLS.indexOf('Who_Id')] = '';
    const v = meetingFinding('over-capacity', 'Physiotherapy Consultation - Rahul', noPatient);
    const person = personForFinding(v, book);
    expect(person).toBe('');
    expect(peopleIn([{ ...v, person }])).toEqual([]);
  });
});

describe('a question may not name a fact no column carries', () => {
  const d = (name, columns) => ({ name, columns, own: 5 });
  const bound = (id, datasets) => catalogueFor(datasets, {}).find((c) => c.id === id);

  /* Zoho's Meetings: a person, a date, a status and a session — no leave, no capacity. */
  const meetings = d('Meetings (Zoho CRM)', ['Event_Title', 'Start_DateTime', 'Owner', 'Who_Id',
    'Participants', 'Appointment_Status']);

  it('no longer offers Leave Clash on a list of appointments', () => {
    expect(bound('leave-clash', [meetings]).ready).toBe(false);
  });

  it('no longer offers Over Capacity on a list of appointments', () => {
    expect(bound('over-capacity', [meetings]).ready).toBe(false);
  });

  it('still offers Leave Clash on a real leave register', () => {
    const c = bound('leave-clash', [d('Staff Leave', ['employee_name', 'leave_date', 'leave_type', 'status'])]);
    expect(c.ready).toBe(true);
    expect(c.question).toContain('leave_type');
  });

  it('still offers Over Capacity where a room size exists', () => {
    expect(bound('over-capacity', [d('Batches', ['batch_name', 'student_name', 'max_students'])]).ready).toBe(true);
    // Indian class registers say class_strength.
    expect(bound('over-capacity', [d('Classes', ['class_session', 'student', 'class_strength'])]).ready).toBe(true);
  });

  it('does not mistake an attendance mark for leave', () => {
    /*
     * A student marked absent missed a class; that is not a staff member on
     * leave. Matching it would fire Leave Clash every day two students stayed
     * home.
     */
    expect(bound('leave-clash', [d('Attendance', ['student_name', 'session_date', 'status', 'absent'])]).ready).toBe(false);
  });

  it('does not mistake a credit limit for a room size', () => {
    expect(bound('over-capacity', [d('Accounts', ['customer_name', 'booking', 'credit_limit'])]).ready).toBe(false);
  });

  it('does not hear "strengthen" as class strength', () => {
    expect(bound('over-capacity', [d('Plans', ['session', 'member', 'strengthen_core'])]).ready).toBe(false);
  });

  it('names the fact in the question it asks', () => {
    // The word that carried the question now has a column behind it.
    expect(entryFor('leave-clash').needs).toContain('leave');
    expect(entryFor('over-capacity').needs).toContain('capacity');
  });
});

describe('switching a watcher off', () => {
  const ctl = read('../eame-template/controllers/agentsController.js');
  const reports = read('../eame-template/services/reportService.js');

  it('takes its findings off the board', () => {
    expect(ctl).toContain('const notOff = { agentId: { $nin: await switchedOffIds() } };');
    expect(ctl).toContain("find({ state: 'open', ...onlyKind, ...notOff })");
  });

  it('and out of the resolved list, which is on the same screen', () => {
    expect(ctl).toContain("find({ state: 'resolved', ...onlyKind, ...notOff })");
  });

  it('and out of the reports', () => {
    // A history that kept counting them would report as problems the things
    // the owner had just said were not.
    expect(reports).toContain('agentId: { $nin: await switchedOffIds() }');
  });

  it('hides them rather than resolving or deleting them', () => {
    /*
     * Resolving would claim the problem was fixed and count it as caught and
     * dealt with; deleting would make switching it back on lose its history.
     * The pause path must do neither.
     */
    const svc = read('../eame-template/services/agentService.js');
    const pause = svc.slice(svc.indexOf('export async function setAgentEnabled'), svc.indexOf('export async function deleteAgent'));
    expect(pause).not.toContain('deleteMany');
    expect(pause).not.toContain("state: 'resolved'");
  });
});
