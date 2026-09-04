# Education Technology AI Opportunity Discovery

**Layer:** Education Technology
**Extends:** Core/AI_Opportunity_Discovery.md
**Version:** 1.0

---

# Purpose

This layer enriches the Core AI Opportunity Discovery capability with education
technology knowledge, covering two distinct company types: EdTech product
companies that build and sell software to institutions, and education providers
that deliver teaching directly.

The discovery methodology, consultant reasoning process, and output structure
are inherited from the Core Asset. This layer supplies the domain context: where
effort actually accumulates in education operations, and which of those places
AI can genuinely relieve.

---

## AI Opportunity Discovery

Education technology divides into two business models with different economics
and different AI opportunities. Determine which applies from the company's own
products and customers, not from the label "EdTech" — many companies are both,
selling a platform while also running academies on it.

### A. EdTech Product Companies

Companies building software sold to schools, academies, tutoring centres or
training providers. Characterised by:

- Small operations teams supporting many institutions
- Customers with low technical sophistication and little appetite for setup
- Seasonal demand tied to enrolment and term cycles
- Revenue concentrated in recurring subscriptions, so retention dominates growth
- Support load driven by a long tail of small, repetitive administrative questions
- Data that is operationally rich but institution-specific and rarely standardised

Their opportunities cluster around reducing the manual effort their customers
face, because that effort is what drives churn, and around reducing their own
cost to serve.

### B. Education Providers and Academies

Schools, coaching centres, music and dance academies, and training institutes
delivering teaching directly. Characterised by:

- Administration handled by teachers and owners rather than dedicated staff
- Records fragmented across notebooks, spreadsheets and messaging apps
- Attendance, fees and scheduling consuming disproportionate time
- Parent and student communication happening ad hoc, largely by message
- Progress assessment that is expert but informal, held in an instructor's head
- Strong seasonality around admissions, examinations and performances

Their opportunities cluster around removing administrative burden from people
whose value lies in teaching.

---

# Typical Education Technology Business Challenges

- **Administrative load falls on teaching staff.** The person marking attendance
  is usually the person teaching. Time spent on records is taken directly from
  instruction, and it is the most common reason small institutions abandon a
  system after adopting it.
- **Fee collection is manual and socially awkward.** Chasing payment from
  families is uncomfortable, easily deferred, and a significant driver of cash
  flow problems in owner-operated institutions.
- **Communication is unstructured and unlogged.** Parent updates happen across
  personal messaging, leaving no record, no consistency, and no way to see which
  families have not been reached.
- **Student progress is tacit.** Instructors know how each student is doing but
  rarely record it in any form that survives a change of teacher or supports a
  conversation with a parent.
- **Scheduling is combinatorially awkward.** Rooms, instructors, levels and
  student availability interact, and rescheduling one class cascades.
- **Enrolment is seasonal and hard to forecast.** Capacity and staffing
  decisions are made on intuition, and errors are expensive in both directions.
- **Attrition is noticed late.** A student who has quietly stopped attending is
  usually identified after they have already decided to leave.

---

# Typical Education Technology Workflows

- Enrolment and onboarding of new students, including trial classes
- Attendance capture, often mid-class and on a phone
- Fee invoicing, collection, reconciliation and follow-up
- Timetabling across instructors, rooms and levels
- Progress recording, assessment and grading
- Parent and student communication, reminders and announcements
- Examination, recital or performance preparation and logistics
- Instructor scheduling, substitution and payroll
- Reporting to owners, boards or accreditation bodies

---

# Common High-Effort Activities

These are where staff time actually goes, and therefore where AI has to earn
its place:

- Re-entering the same student information across systems and forms
- Reconciling payments against invoices, especially partial and late payments
- Composing individual messages to parents that differ only in details
- Reconstructing a student's history from scattered records before a review
- Manually resolving timetable clashes after any change
- Summarising a term's activity into a report for an owner or a parent
- Answering the same admissions and scheduling questions repeatedly

---

# Typical AI Opportunities

Ordered roughly by the ratio of value to implementation difficulty in this
industry, which is not the same ordering as in enterprise settings — small
institutions cannot absorb long deployments.

1. **Attrition and disengagement early warning.** Attendance and payment
   patterns are strong, already-captured signals. Flagging a student drifting
   away weeks earlier is directly measurable in retained revenue, and needs no
   new data collection.
2. **Drafted parent and student communication.** Generating the individual
   message from the underlying record — attendance, progress, fees due —
   removes a genuinely disliked task while keeping a human approving it.
3. **Progress summarisation from instructor notes.** Turning informal notes
   into a structured record makes tacit expertise durable and reviewable, and
   supports parent conversations that currently rely on memory.
4. **Fee follow-up sequencing.** Deciding who to remind, when, and in what tone,
   based on payment history — automating the part people avoid rather than the
   part they are good at.
5. **Natural-language reporting over operations.** Letting an owner ask a
   question about attendance, revenue or enrolment rather than assembling a
   report, which is often the only way such reports get produced at all.
6. **Scheduling assistance.** Proposing timetable resolutions that respect
   instructor, room and level constraints, with a human making the final call.
7. **Admissions and enquiry handling.** Answering repetitive prospective-student
   questions, where the cost of a slow response is a lost enrolment.

---

# Education Technology Principles

- **Administrative relief beats analytical sophistication.** An institution
  running on notebooks does not need prediction; it needs the daily work to take
  less time. Opportunities that reduce manual effort will be adopted;
  opportunities that produce insight without reducing effort usually will not.
- **A human stays between the model and the family.** Communication about a
  child's progress or a family's unpaid fees carries relationship risk that no
  accuracy figure offsets. Draft, do not send.
- **Student data is unusually sensitive.** Records frequently concern minors,
  attract specific regulation, and belong to families who did not choose the
  vendor. Treat data residency and retention as design constraints, not
  compliance paperwork.
- **Seasonality shapes value.** An opportunity that helps only during admissions
  delivers value a few weeks a year. Weight recurring workflows accordingly.
- **Adoption is the binding constraint.** Users are teachers and owners, not
  analysts, working between classes. Anything requiring training, configuration
  or a desk will not be used.

---

# Leadership Question

Which recurring administrative task consumes the most staff time that could
otherwise be spent teaching — and is that task already captured as data today,
or would AI first require someone to start recording it?
