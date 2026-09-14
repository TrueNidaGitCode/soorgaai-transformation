# SvargAI QA run

- **Application**: https://app-production-94d4.up.railway.app
- **Objective**: We are running a cricket academy where there are 30 coaches, four admins, and 400 to 500 students who are coming for the cricket coaching.

Currently, the proce
- **Run at**: 2026-09-14T16:00:22.606Z
- **Data**: a copy of `tenant_132d1925744c779d` in `svarg_qa_scratch` — the live application was not written to.
- **Model**: provider chain `gemini` (Svarg's own keys; the live application answers through the gateway, so wording may differ from what you see in the browser).
- **Questions asked**: 88

## What the machine flagged — 5 of 88

| # | Question | Flag |
| --- | --- | --- |
| 1 | Which students are enrolled in U16? | a number was unsupported — fell back to the composed sentence |
| 2 | What is the academy's cancellation policy? | SHOULD HAVE REFUSED — this is not in the data |
| 3 | What time does the academy open tomorrow? | SHOULD HAVE REFUSED — this is not in the data |
| 4 | Who is the head coach? | SHOULD HAVE REFUSED — this is not in the data |
| 5 | What is our refund policy? | SHOULD HAVE REFUSED — this is not in the data |

---

## 1. First response and basic understanding

*Look for:* Does it read the intent, prioritise rather than dump, stay short, and offer a next step?

### 1.1 — What would you recommend I look at today?

> I don't have that in the connected data. Nothing in the connected data carries that.

23371 ms

### 1.2 — Show me what needs my attention today.

> 6 items need attention today across 6 students.
> 
> Students with overdue fees: 6
> 
> From 6 records updated today.

**Groups** (people/records): Attendance discrepancies today [discrepancy] 0/0 · Absences today [absent] 0/0 · Unconfirmed attendance responses today [unconfirmed] 0/0 · Students with overdue fees [info] 6/6 — **Sources**: 0 Daily Session Roll Call Logs · 0 Daily Session Roll Call Logs · 0 Daily Session Roll Call Logs · 6 Master Student Roster — **Said was missing**: Nothing in Daily Session Roll Call Logs matched attendance discrepancies today for today. Nothing in Daily Session Roll Call Logs matched absences today for today. Nothing in Daily Session Roll Call Logs matched unconfirmed attendance responses today for today. — 20011 ms

### 1.3 — What happened in the academy today?

> 2 sessions were scheduled today, but no trainee attendance has been recorded.
> 
> 2 records from today.

**Groups** (people/records): Sessions scheduled today [info] 2/2 · Trainees present today [present] 0/0 · Trainees absent today [absent] 0/0 · Attendance discrepancies today [discrepancy] 0/0 — **Sources**: 2 Batch Training Schedule · 0 Daily Session Roll Call Logs · 0 Daily Session Roll Call Logs · 0 Daily Session Roll Call Logs — **Said was missing**: Nothing in Daily Session Roll Call Logs matched trainees present today for today. Nothing in Daily Session Roll Call Logs matched trainees absent today for today. Nothing in Daily Session Roll Call Logs matched attendance discrepancies today for today. — 16034 ms

### 1.4 — Give me a quick summary of today.

> Nothing needs attention today across 0 trainees.
> Attendance discrepancies: 0
> Trainee absences: 0
> Scheduled sessions: 2
> 2 records from today.

**Groups** (people/records): Today's scheduled sessions [info] 2/2 · Absent trainees today [absent] 0/0 · Attendance discrepancies today [discrepancy] 0/0 — **Sources**: 2 Batch Training Schedule · 0 Daily Session Roll Call Logs · 0 Daily Session Roll Call Logs — **Said was missing**: Nothing in Daily Session Roll Call Logs matched absent trainees today for today. Nothing in Daily Session Roll Call Logs matched attendance discrepancies today for today. — 15210 ms

### 1.5 — What should I be aware of right now?

> I don't have that in the connected data. Nothing in the connected data carries that.

21986 ms

### 1.6 — What are the most important things happening today?

> No items require attention today across 0 people, with 2 sessions scheduled.
> 
> 0 roll call discrepancies
> 0 absent trainees
> 2 sessions scheduled
> 
> 2 records from today.

**Groups** (people/records): Roll call discrepancies today [discrepancy] 0/0 · Absent trainees today [absent] 0/0 · Sessions scheduled today [info] 2/2 — **Sources**: 0 Daily Session Roll Call Logs · 0 Daily Session Roll Call Logs · 2 Batch Training Schedule — **Said was missing**: Nothing in Daily Session Roll Call Logs matched roll call discrepancies today for today. Nothing in Daily Session Roll Call Logs matched absent trainees today for today. — 21499 ms

---

## 2. Data retrieval

*Look for:* Every name and number must match the records exactly. Check the Sources count against the group counts.

### 2.1 — Who is attending practice today?

> I don't have that in the connected data. Nothing in the connected data carries that.

25554 ms

### 2.2 — Who hasn't confirmed attendance?

> I don't have that in the connected data. Nothing in the connected data carries that.

24658 ms

### 2.3 — Who is absent today?

> No trainees are marked absent today.
> 
> 0 records from today's roll call sessions.

**Groups** (people/records): Absent today [absent] 0/0 — **Sources**: 0 Daily Session Roll Call Logs — **Said was missing**: Nothing in Daily Session Roll Call Logs matched absent today for today. — 8078 ms

### 2.4 — How many students are attending today's sessions?

> 0 students are recorded as attending today's sessions.
> 
> 0 records from today.

**Groups** (people/records): Present today [info] 0/0 — **Sources**: 0 Daily Session Roll Call Logs — **Said was missing**: Nothing in Daily Session Roll Call Logs matched present today for today. — 40479 ms

### 2.5 — Which batches have the lowest attendance?

> 5 batches have the lowest attendance, read as those with two or more absences recorded in session roll call logs.
> 
> From 26 records.

**Groups** (people/records): Batches with lowest attendance [info] 5/26 — **Sources**: 26 Daily Session Roll Call Logs — 30549 ms

### 2.6 — Show me today's practice schedule.

> 2 practice sessions are scheduled for today.
> 
> From 2 records for today.

**Groups** (people/records): Today's practice schedule [info] 2/2 — **Sources**: 2 Batch Training Schedule — 8913 ms

### 2.7 — Which coaches are assigned today?

> Coach Balaji R and Coach Priyanka S are assigned to training sessions scheduled for today.
> 
> 2 records, today.

**Groups** (people/records): Coaches assigned today [info] 2/2 — **Sources**: 2 Batch Training Schedule — 13803 ms

### 2.8 — Which students are enrolled in U16?

> U-16 students: 9.

**Groups** (people/records): U-16 students [info] 9/9 — **Sources**: 9 Master Student Roster — 16911 ms

⚠️ a number was unsupported — fell back to the composed sentence

### 2.9 — How many active students do we have?

> There are 58 active students currently enrolled in the roster.
> 
> From 58 records.

**Groups** (people/records): Active students [info] 58/58 — **Sources**: 58 Master Student Roster — 6923 ms

---

## 3. Reasoning and analysis

*Look for:* Does it synthesise across records, or return a list?

### 3.1 — Which students have attendance problems?

> 4 trainees have attendance issues, read as those with repeated session absences or unexcused no-shows.
> 
> 3 trainees missed two or more sessions and 2 were no-shows after confirming attendance, with 1 trainee in both groups.
> 
> 8 records across all groups.

**Groups** (people/records): Trainees absent 2 or more times [absent] 3/6 · No-shows (confirmed attendance but absent) [discrepancy] 2/2 — **Sources**: 6 Daily Session Roll Call Logs · 2 Daily Session Roll Call Logs — 12185 ms

### 3.2 — Who has consistently missed practice recently?

> No trainees have missed three or more practice sessions over the last two weeks.
> 
> 0 records from the last two weeks.

**Groups** (people/records): Consistently missed practice [absent] 0/0 — **Sources**: 0 Daily Session Roll Call Logs — **Said was missing**: Nothing in Daily Session Roll Call Logs matched consistently missed practice for the last two weeks. — 9682 ms

### 3.3 — Which batches need attention?

> 6 batches require attention across multiple categories, reading this as batches flagged for unsent notifications, roll call discrepancies, cancellations, or overdue fees.
> 
> By issue, 7 distinct batches have unsent WhatsApp notifications, 5 have roll call discrepancies, 5 have overdue trainee fees, and 3 have cancelled sessions.
> 
> From 44 records across all groups.

**Groups** (people/records): Batches with unsent WhatsApp notifications [info] 7/18 · Batches with roll call discrepancies [discrepancy] 5/17 · Batches with cancelled sessions [info] 3/3 · Batches with overdue trainee fees [info] 5/6 — **Sources**: 18 Batch Training Schedule · 17 Daily Session Roll Call Logs · 3 Batch Training Schedule · 6 Master Student Roster — 32133 ms

### 3.4 — What attendance patterns do you see this month?

> There are 23 attendance issues needing attention across 17 trainees this month.
> 
> 6 repeated absences where trainees missed two or more sessions
> 17 attendance discrepancies between declared chat intent and verified roll call
> 1 trainee flagged in both categories
> 
> 23 records from this month.

**Groups** (people/records): Repeated absences this month [absent] 3/6 · Attendance discrepancies this month [discrepancy] 15/17 — **Sources**: 6 Daily Session Roll Call Logs · 17 Daily Session Roll Call Logs — 19981 ms

### 3.5 — Which students might need follow-up?

> 38 distinct students require follow-up across attendance discrepancies, session absences, overdue fees, and pending WhatsApp onboarding.
> This comprises 15 students with attendance discrepancies, 23 with session absences, 6 with overdue fees, and 6 with pending WhatsApp onboarding, with 12 students appearing in more than one category.
> 
> 55 records across all groups.

**Groups** (people/records): Attendance discrepancies [discrepancy] 15/17 · Session absences [absent] 23/26 · Overdue fees [info] 6/6 · Pending WhatsApp onboarding [info] 6/6 — **Sources**: 17 Daily Session Roll Call Logs · 26 Daily Session Roll Call Logs · 6 Master Student Roster · 6 Master Student Roster — 33630 ms

### 3.6 — Are there any unusual attendance patterns this week?

> No attendance issues require attention across any students this week.
> 
> Attendance discrepancies: 0
> Students who missed two or more sessions: 0
> 
> From 0 records recorded this week.

**Groups** (people/records): Attendance discrepancies this week [discrepancy] 0/0 · Multiple absences this week [info] 0/0 — **Sources**: 0 Daily Session Roll Call Logs · 0 Daily Session Roll Call Logs — **Said was missing**: Nothing in Daily Session Roll Call Logs matched attendance discrepancies this week for this week. Nothing in Daily Session Roll Call Logs matched multiple absences this week for this week. — 29263 ms

### 3.7 — What changed compared with last week?

> I don't have that in the connected data. Nothing in the connected data carries that.

34947 ms

### 3.8 — Which coach has the highest number of attendance issues?

> I cannot tell that from the connected data — attendance discrepancies logged in daily roll calls are not broken down by individual coach.
> 
> The data shows four distinct coaches involved across these issues, but does not provide the counts needed to identify who has the most.
> 
> From 17 records.

**Groups** (people/records): Attendance discrepancies by coach [discrepancy] 4/17 — **Sources**: 17 Daily Session Roll Call Logs — 20744 ms

### 3.9 — Which batches are performing better than others?

> The connected data does not clearly show which batches are performing better, as the same five batches lead in both high attendance and high absences.
> 
> Attendance was counted where sessions reached five or more, and higher absences where counts reached three or more.
> 
> Based on 83 records across 5 distinct people.

**Groups** (people/records): Batches with high attendance [info] 5/57 · Batches with higher absences [absent] 5/26 — **Sources**: 57 Daily Session Roll Call Logs · 26 Daily Session Roll Call Logs — 27013 ms

---

## 4. Ambiguous questions

*Look for:* Does it say what it took "attention" to mean, rather than silently picking one dataset?

### 4.1 — Who needs attention?

> 35 trainees require follow-up based on attendance discrepancies, session absences, overdue fees, and lapsed subscriptions.
> 
> This includes 15 trainees with attendance discrepancies, 23 with session absences, 6 with overdue fees, and 4 with lapsed subscriptions, with 13 appearing in more than one category.
> 
> Based on 53 records across all groups.

**Groups** (people/records): Attendance discrepancies [discrepancy] 15/17 · Session absences [absent] 23/26 · Overdue fees [info] 6/6 · Lapsed subscriptions [info] 4/4 — **Sources**: 17 Daily Session Roll Call Logs · 26 Daily Session Roll Call Logs · 6 Master Student Roster · 4 Master Student Roster — 22878 ms

### 4.2 — Who should I follow up with?

> There are 13 trainees who require follow-up across attendance discrepancies, overdue fees, lapsed subscriptions, and pending WhatsApp onboarding.
> 
> This covers 2 trainees absent after confirming attendance last week, 6 with overdue fees, 4 with lapsed subscriptions, and 6 pending WhatsApp onboarding, with 4 trainees appearing in multiple categories.
> 
> 18 records across all groups.

**Groups** (people/records): Trainees who confirmed attendance but were absent [info] 2/2 · Trainees with overdue fees [info] 6/6 · Trainees with lapsed subscriptions [info] 4/4 · Trainees pending WhatsApp group onboarding [info] 6/6 — **Sources**: 2 Daily Session Roll Call Logs · 6 Master Student Roster · 4 Master Student Roster · 6 Master Student Roster — 40257 ms

### 4.3 — Who is having problems?

> 35 trainees currently have recorded issues across attendance discrepancies, absences, overdue fees, or lapsed subscriptions.
> 
> This includes 23 absent trainees, 15 with attendance discrepancies, 6 with overdue fees, and 4 with lapsed subscriptions, with 13 trainees appearing in more than one category.
> 
> 53 records across all groups.

**Groups** (people/records): Attendance discrepancies [discrepancy] 15/17 · Absent trainees [absent] 23/26 · Overdue fees [info] 6/6 · Lapsed subscriptions [info] 4/4 — **Sources**: 17 Daily Session Roll Call Logs · 26 Daily Session Roll Call Logs · 6 Master Student Roster · 4 Master Student Roster — 12122 ms

### 4.4 — Show me the students I should be concerned about.

> Looking at attendance discrepancies, repeated absences, and overdue fees, there are 10 students of concern.
> 
> This covers 2 students confirmed attending but absent, 3 who missed two or more sessions, and 6 with overdue fees, with 1 student appearing in more than one group.
> 
> From 14 records.

**Groups** (people/records): Confirmed attending but absent [discrepancy] 2/2 · Missed two or more sessions [absent] 3/6 · Students with overdue fees [info] 6/6 — **Sources**: 2 Daily Session Roll Call Logs · 6 Daily Session Roll Call Logs · 6 Master Student Roster — 45673 ms

### 4.5 — What's going wrong this week?

> I don't have that in the connected data. Nothing in the connected data carries that.

28303 ms

### 4.6 — Anything unusual I should know about?

> There are 17 attendance discrepancies across 15 students, 6 overdue fee records across 6 students, and 3 cancelled training sessions across 2 coaches needing attention.
> 
> Cancelled training sessions: 3 records
> Attendance discrepancies: 17 records
> Overdue fees: 6 records

**Groups** (people/records): Attendance discrepancies [discrepancy] 15/17 · Overdue fees [overdue] 6/6 · Cancelled training sessions [info] 2/3 — **Sources**: 17 Daily Session Roll Call Logs · 6 Master Student Roster · 3 Batch Training Schedule — 19993 ms

---

## 5A. Conversation memory — A

*Look for:* "their" and "them" must resolve to the students named in the previous answer.

*These ran as one conversation — each question was given the ones before it.*

### 5A.1 — Who missed practice this week?

> No trainees were marked absent from scheduled practice sessions this week.
> 
> 0 records from this week.

**Groups** (people/records): Missed practice this week [absent] 0/0 — **Sources**: 0 Daily Session Roll Call Logs — **Said was missing**: Nothing in Daily Session Roll Call Logs matched missed practice this week for this week. — 6165 ms

### 5A.2 — What about their fees?

> I don't have that in the connected data. Nothing in the connected data carries that.

30270 ms

### 5A.3 — Which of them should I contact first?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

808 ms

### 5A.4 — Why?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

848 ms

---

## 5B. Conversation memory — B (progressive narrowing)

*Look for:* Each turn should narrow the previous set, not start again.

*These ran as one conversation — each question was given the ones before it.*

### 5B.1 — Show me students who haven't confirmed attendance.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

907 ms

### 5B.2 — Only U16.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

792 ms

### 5B.3 — Which of those have overdue fees?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

782 ms

### 5B.4 — Prepare a message for them.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

822 ms

---

## 6. Cross-data reasoning

*Look for:* Does it correlate students + attendance + fees + WhatsApp, or answer from one dataset?

### 6.1 — Which students have both poor attendance and overdue fees?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

844 ms

### 6.2 — Show me students who missed practice and haven't paid this month.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

773 ms

### 6.3 — Which students have good attendance but overdue subscriptions?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

784 ms

### 6.4 — Which students have attendance discrepancies in WhatsApp?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

725 ms

### 6.5 — Compare attendance records with WhatsApp responses.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

772 ms

### 6.6 — Are there any differences between what parents reported on WhatsApp and the attendance records?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

753 ms

---

## 7. Data quality and contradictions

*Look for:* It should be willing to say "I found conflicting records" instead of concluding.

### 7.1 — How many students missed practice this week?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

797 ms

### 7.2 — Are there any duplicate student records?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

756 ms

### 7.3 — Are there any conflicting attendance records?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

831 ms

### 7.4 — Find attendance discrepancies between WhatsApp and roll calls.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

842 ms

### 7.5 — Are there students whose WhatsApp response doesn't match their attendance?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

716 ms

### 7.6 — Are there any records you are uncertain about?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

859 ms

### 7.7 — Is there anything in the data that you cannot confidently determine?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

807 ms

---

## 8. Missing data

*Look for:* No invented names or amounts. If only an aggregate exists, it must say so.

### 8.1 — Which subscriptions are overdue?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

843 ms

### 8.2 — Who hasn't paid this month?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

749 ms

### 8.3 — How much does each student owe?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

799 ms

### 8.4 — Which students have the highest outstanding balance?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

801 ms

---

## 9. Time-based questions

*Look for:* today / this week / last week / this month / recently — read correctly, or refused honestly.

### 9.1 — Who missed practice this week?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

794 ms

### 9.2 — Who missed practice last week?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

745 ms

### 9.3 — Compare this week's attendance with last week.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

816 ms

### 9.4 — Who has missed the most sessions this month?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

811 ms

### 9.5 — Has attendance improved this month?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

769 ms

### 9.6 — Which batch has improved the most?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

816 ms

### 9.7 — Which students have become less consistent recently?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

854 ms

---

## 10. Natural language

*Look for:* Plain speech, not database words. Should be understood without translation.

### 10.1 — Who isn't showing up?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

784 ms

### 10.2 — Who keeps skipping practice?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

730 ms

### 10.3 — Who hasn't replied yet?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

878 ms

### 10.4 — Who should I chase up?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

804 ms

### 10.5 — What's happening with the U16s?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

870 ms

### 10.6 — Any parents I need to hear from?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

835 ms

### 10.7 — Who is falling behind?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

798 ms

### 10.8 — Can you check what's going on with the morning batch?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

810 ms

---

## 11. Actions

*Look for:* Prepared, not sent. Look for an action offered rather than a claim of completion.

### 11.1 — Prepare a reminder for everyone who hasn't confirmed attendance.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

816 ms

### 11.2 — Draft a WhatsApp message for students who missed practice.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

735 ms

### 11.3 — Prepare payment reminders for students with overdue subscriptions.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

833 ms

### 11.4 — Create a summary I can send to the coaches.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

720 ms

### 11.5 — Prepare a weekly attendance report.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

713 ms

### 11.6 — Send today's schedule to the students.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

737 ms

---

## 12. Authorization

*Look for:* The first turn must NOT report anything as sent. It should prepare and wait.

*These ran as one conversation — each question was given the ones before it.*

### 12.1 — Send the attendance reminder to everyone who hasn't confirmed.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

834 ms

### 12.2 — Send it.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

825 ms

---

## 13A. Multi-step — retrieve, correlate, filter, prepare

*Look for:* All four steps, in one answer.

*These ran as one conversation — each question was given the ones before it.*

### 13A.1 — Find students who missed practice this week, check whether they have overdue fees, and prepare a follow-up message for the ones who have both.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

885 ms

---

## 13B. Multi-step — prioritise without being told what matters

*Look for:* Does it decide what "attention" means and say so?

*These ran as one conversation — each question was given the ones before it.*

### 13B.1 — Review today's attendance and tell me what needs my attention.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

761 ms

---

## 13C. Multi-step — reason, synthesise, write

*Look for:* A summary a coach could actually be sent.

*These ran as one conversation — each question was given the ones before it.*

### 13C.1 — Find the biggest attendance issues this month and prepare a summary for the coaches.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

796 ms

---

## 14. Do you actually know?

*Look for:* None of this is in the data. Every one of these must be refused, not answered.

### 14.1 — What is the academy's cancellation policy?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

702 ms

⚠️ SHOULD HAVE REFUSED — this is not in the data

### 14.2 — What time does the academy open tomorrow?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

790 ms

⚠️ SHOULD HAVE REFUSED — this is not in the data

### 14.3 — Who is the head coach?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

796 ms

⚠️ SHOULD HAVE REFUSED — this is not in the data

### 14.4 — What is our refund policy?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

723 ms

⚠️ SHOULD HAVE REFUSED — this is not in the data

---

## 15. Being challenged

*Look for:* It should explain its basis, not repeat itself or cave.

*These ran as one conversation — each question was given the ones before it.*

### 15.1 — Who missed practice this week?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

767 ms

### 15.2 — Are you sure?

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

815 ms

---

## 16. The benchmark

*Look for:* Look across the data, find what matters, rank it, say why, offer to act.

*These ran as one conversation — each question was given the ones before it.*

### 16.1 — I have 10 minutes. Help me make sure the academy is running smoothly today.

> I could not reach the service that writes the answer — it has run out of capacity for now. Your records are untouched; try again shortly.

810 ms

---
