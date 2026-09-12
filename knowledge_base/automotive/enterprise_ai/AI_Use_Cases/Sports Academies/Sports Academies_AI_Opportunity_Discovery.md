# Sports Academies AI Opportunity Discovery

**Layer:** Sports Academies
**Extends:** Core/AI_Opportunity_Discovery.md
**Version:** 1.1

---

# Purpose

This layer enriches the Core AI Opportunity Discovery capability with knowledge
of sports academies: cricket, football, tennis, swimming, badminton and similar
coaching businesses that train players — mostly children and teenagers — in
batches, on booked facilities, under a roster of coaches.

The discovery methodology, consultant reasoning process, and output structure
are inherited from the Core Asset. This layer supplies the domain context: how
an academy actually runs day to day, where its knowledge actually lives, where
the hours go, and which of those places AI can genuinely relieve.

---

## AI Opportunity Discovery

A sports academy is a recurring community — students, parents, coaches, a
small admin team — coordinated every day around sessions, batches, payments,
attendance, matches, venues and messages. The product is a coach standing in
front of a batch at a booked time on a booked ground; the business is
everything that has to happen for that to occur reliably and get paid for.

The academy is not a software company and usually has no single system. Its
operation is spread across an enrolment form, a spreadsheet, WhatsApp groups,
a payment app and the memory of its staff. That fragmentation is the defining
fact of the industry, and it decides what AI can and cannot do here.

### The reference shape: a cricket academy

Roughly 30 employees — most of them coaches — and 400 to 500 enrolled
children and young players. Read the operation end to end, because the
opportunities sit in the joins between its parts:

- **Enrolment.** A parent fills in an enrolment form. Staff copy that
  information by hand into an Excel spreadsheet, which becomes the working
  record of the student. The form and the spreadsheet can disagree from the
  first week.
- **Batches.** Each student is placed in a batch by age, skill, schedule,
  location or coach. Every batch has its own coach and its own WhatsApp group,
  and parents are added to the group at enrolment. The group is the academy's
  main channel to families: classes, schedule changes, attendance, matches.
- **Payments.** Parents pay by card or GPay, on monthly or yearly
  subscriptions. The payment system knows what was paid; the spreadsheet knows
  who is enrolled; nobody has one list of who is active, on which plan, and
  due when.
- **Attendance.** The day before a session, staff post an attendance request
  in the batch group. Parents reply, or do not. Staff read the thread, work
  out who is coming, and chase the ones who have not answered. The replies
  never become a structured record; expected attendance lives in the thread
  and in the reader's head.
- **Matches.** About two a month. The coach posts the match — date, venue,
  details — and interested, available players say so. The coach then picks
  the side, and it is not first-come-first-served: the academy's unwritten
  rule is fair opportunity. Who played last time, who was picked but could
  not come, who has not had a game in months all count. The coach decides from
  memory, old threads, the spreadsheet and conversations. None of that
  reasoning is written down anywhere.
- **Venues, kit, tournaments, coach pay** each run the same way: a message, a
  sheet, a person who knows.

### Explicit information and implicit knowledge

The academy's data is of two kinds, and an opportunity has to be honest about
which it needs.

**Explicit** — recorded somewhere, however untidily: student names, parent
contacts, batch assignments, coaches, subscription type and status, payments,
attendance replies, match dates and venues, who played.

**Implicit** — known but not written: how batches are formed and moved, how a
coach runs a batch, how an attendance thread is read ("no reply" is not
"absent"), how the academy talks to families, how a match side is chosen and
what fair means here, which exceptions are normal, which decisions a person
must make. The spreadsheet does not say why a student should play on Sunday;
the thread does not say how to turn replies into a plan; the payment app does
not say what the academy does with a family whose plan lapses next week.

The real operating model is the combination — people, systems, messages,
history, habits and judgment. An AI that stores the explicit half and ignores
the implicit half has learned the academy's filing, not its business.

### What the academy needs from AI, in order

The opportunities follow a progression, and the order is the point:

1. **Understand the business** — that a student belongs to a batch with a
   coach and a parent group, has a subscription, is asked about attendance
   the day before, and plays matches under a fairness rule; and that the
   pieces come from different places.
2. **Answer questions about it** — "who is expected tomorrow", "who has not
   replied", "who played in the last three matches", "whose plan ends this
   month" — from the fragments, joined, with the unknowns kept unknown.
3. **Recommend** — a suggested side for Sunday's match that respects
   availability, recent participation and fair opportunity, with the coach
   making the final call.
4. **Prepare** — the attendance summary, the follow-up list, the batch
   message, the renewal list, ready for a person to approve.
5. **Act** — where permission and safeguards exist, send the reminder, post
   the summary, update the record.

Understanding before answering, answering before recommending, recommending
before preparing, preparing before acting. An opportunity pitched at step 5
for an academy still at step 1 will not be adopted.

### Academy shapes

**Owner-run academies** (one to eight coaches): the founder coaches, sells,
schedules and collects. Value is the founder's evenings.

**Multi-coach academies** (twenty to sixty coaches, a small admin team, several
hundred players): the four admins are the switchboard and the ceiling on
growth. Value is admin capacity, retention, and the decisions coaches
currently make from memory.

**Franchise and multi-city academies**: consistency across centres and
reporting upward are workloads in themselves.

---

# Typical Sports Academy Business Challenges

- **No one place holds the whole picture.** Enrolment in a form, students in
  Excel, money in the payment app, everything else in WhatsApp. Any question
  that spans two of them is answered by a person reassembling it.
- **A small admin team is the operating system.** Rosters, attendance
  threads, fee status, enquiries, parent questions, match logistics all pass
  through the same few people, in the evening and at weekends. Everything
  waits on them.
- **Attendance is asked, not recorded.** The day-before request works, but the
  answer lives in a thread, silence is ambiguous, and chasing non-responders
  is a daily manual job.
- **Match selection runs on memory.** Fairness is a real principle with no
  record behind it; a coach who leaves takes the history with them, and a
  parent who asks why their child was not picked gets an answer from memory.
- **Subscriptions lapse quietly.** Active or not, monthly or yearly, due when
  — three systems, no join. Renewals are noticed when a payment fails to
  arrive.
- **Parents ask the same question in different words.** "Is there practice
  tomorrow", "how is my son doing", "when is the next match" — answered by
  hand, forty times a week.
- **The roster never survives the week.** A coach, a ground or the weather
  drops out and the rearrangement cascades through batches and groups.
- **Drop-outs are noticed late.** A player who has stopped replying to the
  attendance request is identified after the family has decided.
- **Seasonality is brutal.** Exams and the monsoon empty the nets; summer
  camps overfill them. Staffing and cash are planned on instinct.

---

# Typical Sports Academy Workflows

- Enquiry, trial and enrolment: form → spreadsheet → batch → WhatsApp group
- Batch organisation by age, level, schedule, venue and coach
- Day-before attendance request in the batch group, replies, follow-up
- Session delivery and coach substitution; venue and net booking
- Subscription management: plan, status, renewal, payment by card or GPay
- Match announcement, willingness, fair-opportunity selection, logistics
- Parent communication per batch: classes, changes, matches, fees
- Coach pay from sessions delivered
- Reporting to the owner: enrolments, revenue, attendance, drop-outs

---

# Common High-Effort Activities

- Reading an attendance thread into a list of who is coming, and chasing
  the silent ones
- Working out a fair match side from memory and old messages
- Reconciling who is enrolled, who has paid, and who is on which plan across
  the form, the sheet and the payment app
- Copying enrolment forms into the spreadsheet, and correcting the copies
- Composing batch messages that differ only in the detail
- Answering "how is my child doing" without a record to answer from
- Rebuilding the roster after every cancellation
- Assembling the monthly picture from spreadsheets and threads

---

# Typical AI Opportunities

Ordered by the ratio of value to difficulty in this industry, which follows
the progression above: the academy has to be understood before anything can
be answered, and answered before anything can be recommended.

1. **A joined view of the academy that answers questions.** Students, batches,
   coaches, parents, subscriptions, attendance replies and match history
   brought together from the form, the sheet, the payment app and the
   threads — so "who is expected tomorrow", "who has not replied", "whose
   plan ends this month" and "who played last match" have answers. This is
   the foundation; every later opportunity stands on it.
2. **Expected-attendance summary from the day-before thread.** Read the
   replies into a list: coming, not coming, and — separately — not yet
   answered. Never fold silence into absence. Prepare the follow-up list for
   staff to send.
3. **Disengagement early warning.** A player who has stopped replying, stopped
   coming, or started paying late is drifting. Flag it weeks before the
   family stops paying; the response is a coach's call.
4. **Match selection recommendation.** From availability, recent
   participation, selected-but-unavailable history and the fairness rule,
   suggest a side and say why each player is in or out. The coach decides.
   This is the academy's most valuable implicit knowledge made explicit, and
   it must stay a recommendation.
5. **Subscription and renewal follow-up.** Who is active, on which plan, due
   when, lapsing quietly — and a prepared reminder for each, for a person to
   send.
6. **Drafted batch and parent communication.** The schedule change, the match
   announcement, the fee reminder, the progress note — generated from the
   record for approval.
7. **Roster and substitution assistance.** The week's coach-to-batch-to-venue
   plan and the repair when something drops out.
8. **Enquiry handling.** Batch, timing, fee and trial questions answered from
   the academy's own schedule and price list.

Video-based technique analysis is the opportunity most often raised and the
one to raise last: new capture, new equipment, the coach's craft. It belongs
after the operation understands itself.

---

# Sports Academy Principles

- **Learn the business; do not replace the tools.** The academy will not
  abandon Excel, WhatsApp, the form or the payment app on day one, and should
  not be asked to. The opportunity is an intelligent layer that learns how
  each tool participates and joins them — not another student-management
  app that becomes one more place to type.
- **Understand before you answer, answer before you recommend.** An
  opportunity's value depends on where the academy is on the progression.
  Meaning first, storage second.
- **Unknown is not absent.** A parent who has not replied is a follow-up,
  not a no-show. An AI that cannot say "I do not know yet" will be wrong in
  the way that costs trust.
- **The coach decides.** Selection, progression and anything read as a
  judgment about a child stay recommendations with reasons. The coach's word
  is the product and the parents' trust rests on it.
- **A human stays between the academy and the family.** Draft, do not send,
  until permission and safeguards say otherwise.
- **Relieve the admin team first.** In a multi-coach academy the admins are
  the bottleneck on growth. Hours taken off them per week is the measure.
- **It has to work from a phone at the ground.**
- **Players are minors.** Names, ages, guardian contacts, photographs and
  performance records of children are design constraints from day one.
- **Seasonality is the calendar.** Weight opportunities by how many weeks a
  year they matter.

---

# Leadership Question

Which question does the admin team answer by hand every day from two or more
systems — and which of the academy's unwritten rules would AI have to learn
before it could answer the same question?
