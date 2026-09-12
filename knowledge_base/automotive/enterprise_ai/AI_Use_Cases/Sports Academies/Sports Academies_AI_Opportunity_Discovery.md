# Sports Academies AI Opportunity Discovery

**Layer:** Sports Academies
**Extends:** Core/AI_Opportunity_Discovery.md
**Version:** 1.0

---

# Purpose

This layer enriches the Core AI Opportunity Discovery capability with knowledge
of sports academies: cricket, football, tennis, swimming, badminton and similar
coaching businesses that train players — mostly children and teenagers — in
batches, on booked facilities, under a roster of coaches.

The discovery methodology, consultant reasoning process, and output structure
are inherited from the Core Asset. This layer supplies the domain context: how
an academy actually runs day to day, where the hours go, and which of those
places AI can genuinely relieve.

---

## AI Opportunity Discovery

A sports academy is a scheduling business wrapped around a coaching craft. The
product is a coach standing in front of a batch of players at a booked time on
a booked facility, and everything else exists to make that happen reliably and
get paid for it. Determine the academy's shape from its own numbers, not from
the sport:

### A. Owner-Run Academies (one to eight coaches)

- The founder coaches, sells, schedules and collects fees
- Records live in a phone: WhatsApp groups, a notes app, a spreadsheet at best
- One or two grounds or net lanes, often rented by the hour
- Enrolment and cash flow move with the school calendar and the weather

Their opportunities are almost entirely about giving the founder their evenings
back.

### B. Multi-Coach Academies (twenty to sixty coaches, a small admin team)

- A handful of administrators run operations for a large coaching staff
- Several venues, many batches by age group and level, sessions morning and
  evening, weekends busiest
- Coaches are part-time or paid per session, so the roster changes weekly
- Admins are the switchboard: every parent, coach and venue query lands on them
- Records are split between an academy-management app, spreadsheets, the
  accounts package and thousands of WhatsApp messages
- Growth is limited by admin capacity, not by demand for coaching

Their opportunities cluster around the administrators: a team of four
supporting thirty coaches and several hundred players is where the hours go,
and it is the team whose day AI can change most.

### C. Franchise and Multi-City Academies

- Central operations, local centre managers, brand standards
- Assessment and progression frameworks that must be consistent across centres
- Reporting upward is a real workload in itself

---

# Typical Sports Academy Business Challenges

- **Four people are the operating system.** Rosters, substitutions, venue
  bookings, fee reminders, enquiries, parent questions, coach payroll and
  tournament logistics all pass through the same small admin team, by message,
  by phone, in the evening and at weekends. Everything waits on them.
- **The roster never survives the week.** A coach falls ill, a ground is
  waterlogged, a school announces an exam: every change cascades through
  batches, venues and parents, and is resolved by hand.
- **Attendance is captured but not read.** Coaches mark who turned up; nobody
  has time to notice that a player has missed four of the last six sessions
  until the parent stops paying.
- **Fee collection is monthly, manual and awkward.** Reminders go out late,
  partial payments are reconciled by hand, and chasing a family about money is
  the job everyone defers.
- **Parents ask the same question in different words.** "How is my son doing?"
  arrives forty times a week; the honest answer sits in a coach's head.
- **Player progress is a coach's memory.** Skill grades, net observations and
  match performances are rarely written down in a form that survives a change
  of coach or a move between batches.
- **Enquiries arrive faster than they are answered.** Trials, summer camps and
  the start of the school year bring a surge; a slow reply is a lost enrolment
  to the academy down the road.
- **Coach pay is worked out from the roster after the fact.** Sessions taught,
  substitutions and cancellations are reconstructed at month end.
- **Seasonality is brutal.** Monsoon, exams and holidays empty the nets;
  summer camps overfill them. Staffing and cash are planned on instinct.

---

# Typical Sports Academy Workflows

- Enquiry, trial session and enrolment into a batch by age and level
- Weekly roster: coaches to batches to venues to time slots, with substitutions
- Venue and net-lane booking, and re-booking when weather intervenes
- Attendance capture per session, usually on a phone at the ground
- Fee invoicing, reminders, collection and reconciliation, monthly or termly
- Player assessment: skill grading, net observations, match statistics, video
- Parent communication: progress, schedule changes, fees, tournament selection
- Tournament and match-day logistics: selection, travel, kit, scoring
- Coach payroll from sessions delivered
- Equipment and kit inventory
- Reporting to the owner: enrolments, revenue, utilisation, drop-outs

---

# Common High-Effort Activities

These are where the admin team's hours actually go, and therefore where AI has
to earn its place:

- Rebuilding the roster after every cancellation and substitution
- Composing individual WhatsApp messages to parents that differ only in the
  player's name and the detail
- Reconciling fee payments against batches, with partial and late payers
- Answering "how is my child doing" without a record to answer from
- Chasing coaches for attendance and session confirmation at month end
- Replying to enquiries about batches, timings, fees and trials, repeatedly
- Assembling the monthly picture — enrolments, revenue, drop-outs — from
  spreadsheets and messages

---

# Typical AI Opportunities

Ordered roughly by the ratio of value to implementation difficulty in this
industry, which is not the enterprise ordering: an academy cannot absorb a long
deployment, and the admin team is the constraint on everything.

1. **Disengagement early warning.** Attendance, late payments and dropped
   sessions are already captured and are strong signals. Flagging a player who
   is drifting away three weeks before the family stops paying is directly
   measurable in retained fees, and needs no new data collection.
2. **Roster and substitution assistance.** Proposing the week's coach-to-batch
   -to-venue plan, and the fix when a coach or ground drops out, within the
   constraints admins already apply by hand. The admin makes the final call;
   the hour of rearranging disappears.
3. **Drafted parent communication.** Generating the individual message from
   the record — attendance, fees due, schedule change, selection — for an admin
   or coach to approve and send. Removes the most repetitive job in the
   building while keeping a human between the academy and the family.
4. **Progress answers from coach notes and attendance.** Turning what coaches
   already record into a per-player summary a parent question can be answered
   from, so "how is my daughter doing" has an answer that is not a guess.
5. **Fee follow-up sequencing.** Deciding who to remind, when and in what tone
   from payment history — automating the part people avoid.
6. **Enquiry handling.** Answering batch, timing, fee and trial questions from
   the academy's own schedule and price list, fast, with a human taking over
   the moment it turns into a conversation.
7. **Natural-language reporting over operations.** Letting the owner ask
   "which batches are under-filled" or "which coaches are over their hours"
   instead of building the spreadsheet.
8. **Coach payroll from the roster.** Reconciling sessions delivered,
   substitutions and cancellations into the month's pay without the month-end
   reconstruction.

Video-based technique analysis is the opportunity most often raised and the one
to raise last: it needs new capture, new equipment, coach buy-in, and it is
the coach's craft. It belongs after the operation runs itself.

---

# Sports Academy Principles

- **Relieve the admin team first.** In a thirty-coach academy the four admins
  are the bottleneck on growth, retention and everyone's patience. An
  opportunity that takes an hour a day off them will be adopted; one that adds
  insight without removing work will not.
- **A human stays between the academy and the family.** Messages about a
  child's attendance, progress, selection or fees carry relationship risk that
  no accuracy figure offsets. Draft, do not send.
- **It has to work from a phone at the ground.** Coaches and admins are on
  their feet, outdoors, between sessions. Anything that needs a desk, a login
  ritual or training will not be used.
- **Players are minors.** Names, ages, attendance, photographs and performance
  records of children attract specific obligations. Data residency, access and
  retention are design constraints from the first day, not a later compliance
  pass.
- **Seasonality is the calendar.** Weight opportunities by how many weeks a
  year they matter. Rosters and fees recur every week; camp enrolment is a
  month.
- **The coach's judgment is the product.** Anything that reads as a machine
  grading a player against a coach's word will be resisted by the coaches, and
  the coaches are who the parents trust.

---

# Leadership Question

Which recurring task keeps the admin team on their phones at nine in the
evening — and is that task already captured as data today, or would AI first
require someone to start recording it?
