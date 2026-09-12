# Sports Academies Critical Data Identification

**Layer:** Sports Academies
**Extends:** Core/Critical_Data_Identification.md
**Version:** 1.0

---

# Purpose

This layer supplies sports academy context for identifying the minimum data an
AI initiative needs: what an academy actually records, where it lives, how
reliable it is, and which datasets are worth asking for first.

Identification method and output structure are inherited from the Core Asset.

---

## Critical Data Identification

An academy's data is operationally rich and badly split. Almost everything an
early initiative needs is already captured — because the business cannot run
without it — but it is spread across an academy-management app (if there is
one), spreadsheets, the accounts package, and thousands of WhatsApp messages.
The task is rarely to collect new data; it is to name the six datasets that
matter, say where each one lives today, and be honest about which are clean.

Name datasets in the academy's words — batches, sessions, nets, fees, trials
— not in software words. The person reading this runs the front desk.

---

# The Datasets an Academy Has

Listed by how reliably they exist and how much most early initiatives depend
on them.

1. **Player roster and enrolment.** Every enrolled player: name, age group,
   batch, level, start date, guardian contact, status (active, paused, left).
   Lives in the management app or the master spreadsheet. The spine every
   other dataset joins to. Usually complete; the "left" status is the field
   most often missing, because nobody records a quiet departure.

2. **Session attendance.** Who attended which session, marked by the coach on
   a phone at the ground. Lives in the app or in per-batch sheets; older
   academies have it in WhatsApp group messages. The single most valuable
   signal for disengagement, and reliably captured because coaches are paid
   from it.

3. **Fee ledger.** Invoices raised per player per month or term, payments
   received, partial and late payments, discounts, refunds. Lives in the
   accounts package or a spreadsheet, occasionally in the app. Reliable for
   amounts, unreliable for dates — reminders and follow-ups are rarely logged.

4. **Weekly roster and venue schedule.** Which coach takes which batch at which
   venue and time, with substitutions and cancellations. Lives in a spreadsheet
   or a shared calendar, changes daily, and the history of changes is usually
   lost — only the current version survives. Weather cancellations are often
   recorded only as a message.

5. **Coach records.** Coaches, their qualifications, availability, batches they
   can take, sessions delivered, pay rate. Lives partly in the roster, partly
   in payroll, partly in the head admin's memory.

6. **Player assessments and coach notes.** Skill grades, net observations,
   match statistics, camp reports, sometimes video. The most valuable and the
   least structured: free text in the app, notes on paper, voice messages.
   Sparse for most players, rich for the ones being pushed toward selection.

7. **Enquiries and trials.** Prospective families: source, sport and age,
   trial date, outcome. Lives in WhatsApp and a lead sheet, if anywhere.
   Seasonal and rarely complete, but it is where enrolment conversion is won.

8. **Parent communication log.** Messages sent and received per family.
   Almost never structured — it is the WhatsApp history — and therefore the
   dataset most often assumed to exist and least often usable.

---

# What Early Initiatives Typically Need

- **Disengagement early warning:** roster and enrolment, session attendance,
  fee ledger. Three datasets, all captured, all in the app or a sheet. The
  "left" status on past players is what turns this from a rule of thumb into
  something learned from the academy's own history.
- **Roster and substitution assistance:** roster and venue schedule, coach
  records, roster and enrolment (batch sizes). The change history matters
  more than the current roster and is the thing to start keeping.
- **Drafted parent communication:** roster and enrolment, session attendance,
  fee ledger, coach notes where they exist. The message is only as good as
  the record it is drafted from.
- **Progress answers:** assessments and coach notes, attendance. Expect the
  notes to be thin; the initiative should say so rather than pad the gap.
- **Enquiry handling:** the batch schedule, the price list, current
  availability per batch. Small, and usually held only in an admin's head.

---

# Data Realities in This Industry

- **Identity is the first problem.** The same player appears as "Arjun S.",
  "Arjun Sharma" and "Arjun (U-13 Tue/Thu)" across three systems. A join key
  usually has to be made before anything else.
- **Attendance is honest; dates are not.** Coaches mark who came. When the fee
  reminder was sent, when the roster changed, when the parent was told — those
  timestamps are the ones missing.
- **Children's data.** Names, ages, guardian contacts, photographs and
  performance records of minors. Minimise what is copied, keep it in one
  place, and decide retention before the first export.
- **Seasonal gaps are real, not errors.** Exam months and the monsoon empty
  the attendance data. A model that reads a school-exam fortnight as
  disengagement will cry wolf in March.
- **WhatsApp is not a source system.** Treat anything that lives only in a
  chat thread as unavailable until it has been exported once and shown to be
  usable.

---

# Leadership Question

Of the six datasets this initiative needs, which two are already in one place
with a player identifier the others can join to — and which one would the
admin team have to start keeping properly this month?
