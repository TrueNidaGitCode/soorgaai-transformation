# Sports Academies Critical Data Identification

**Layer:** Sports Academies
**Extends:** Core/Critical_Data_Identification.md
**Version:** 1.1

---

# Purpose

This layer supplies sports academy context for identifying the minimum data an
AI initiative needs: what an academy actually records, which system each
piece lives in, how reliable it is, and which datasets are worth asking for
first.

Identification method and output structure are inherited from the Core Asset.

---

## Critical Data Identification

An academy's data is operationally rich and badly split. Almost everything an
early initiative needs is already captured — because the business cannot run
without it — but there is no single system. The reference academy runs on
four: an **enrolment form** (where a student's record begins), an **Excel
spreadsheet** (where staff copy it and where the working student list lives),
a **payment system** (card and GPay; monthly and yearly subscriptions) and
**WhatsApp groups**, one per batch, where attendance is asked, matches are
announced and families are talked to. The staff's memory is the fifth system,
and it holds the rules.

The task is rarely to collect new data. It is to name the datasets that matter,
say which system each lives in today, be honest about which are clean and which
exist only as messages — and to separate what is recorded from what is merely
known.

Name datasets in the academy's words — batches, sessions, subscriptions,
matches — not in software words. The person reading this runs the front desk.

---

# The Datasets an Academy Has

Listed by how reliably they exist and how much most early initiatives depend
on them.

1. **Student roster and enrolment.** Every enrolled student: name, age, batch,
   level, start date, guardian contacts, status. Origin: the enrolment form.
   Working copy: the spreadsheet, keyed in by hand. The spine every other
   dataset joins to. The two disagree where a copy went wrong, and the
   "left" status is the field most often missing, because a quiet departure
   is never typed in.

2. **Batches and coaches.** Which batch each student is in, by age, skill,
   schedule, venue or coach; which coach runs it; which WhatsApp group
   belongs to it. Lives in the spreadsheet and in the group names. Small,
   stable, and the key to everything else.

3. **Subscriptions and payments.** Plan type (monthly, yearly), status
   (active, due, lapsed), payments received by card or GPay, renewal dates.
   Lives in the payment system, with the plan type sometimes only in the
   spreadsheet. Reliable for amounts and dates paid; unreliable for who is
   "active", because that is a judgment joined across two systems.

4. **Attendance requests and replies.** The day-before request in each batch
   group and each family's reply: coming, not coming, or nothing. Lives only
   in WhatsApp. The most valuable and the least structured dataset the
   academy has: it is expected attendance, it is the disengagement signal,
   and it has never been a table. Three values, not two — "no reply" must
   survive the export.

5. **Sessions and the weekly roster.** Which coach takes which batch at which
   venue and time; substitutions and cancellations. A spreadsheet or a
   calendar; the history of changes is usually lost. Weather cancellations
   exist only as a message.

6. **Match records.** Each match — date, venue, opponent, details — who
   expressed willingness, who was selected, who was selected but unavailable,
   who played. Roughly two matches a month. Lives in the coach's messages and
   memory; sometimes a sheet. This is the dataset the fairness rule needs and
   the one that least exists. Reconstruct it from the threads once, then keep
   it.

7. **Coach notes and assessments.** Skill grades, net observations, camp
   reports, occasionally video. Free text, paper, voice notes. Sparse for most
   players, rich for the ones being pushed toward selection.

8. **Enquiries and trials.** Prospective families: source, age, trial date,
   outcome. WhatsApp and a lead sheet, if anywhere. Seasonal, incomplete, and
   where enrolment conversion is won.

9. **Parent communication.** Messages sent and received per batch and per
   family. The WhatsApp history. Assumed to exist, rarely usable as data —
   but it is where the academy's implicit rules can be read from.

---

# What Early Initiatives Typically Need

- **A joined view that answers questions:** roster and enrolment, batches
  and coaches, subscriptions and payments, attendance replies, match records.
  The join key — one identifier per student across the form, the sheet, the
  payment app and the group — is the first thing to make.
- **Expected-attendance summary:** attendance replies, roster, batches. The
  export has to keep "no reply" distinct from "not coming".
- **Disengagement early warning:** attendance replies over time, sessions,
  subscriptions and payments, roster with the "left" status filled in for
  past students.
- **Match selection recommendation:** match records (willingness, selected,
  unavailable, played), attendance replies for the match date, roster and
  batches. The history is the point; two months of it is enough to start.
- **Subscription and renewal follow-up:** subscriptions and payments, roster.
- **Drafted batch communication:** roster, batches, sessions, match records,
  subscriptions.
- **Enquiry handling:** batches and their schedule, the price list, current
  places per batch — small, and usually held only in an admin's head.

---

# Data Realities in This Industry

- **Identity is the first problem.** The same student is "Arjun S." on the
  form, "Arjun Sharma" in the sheet, a parent's phone number in the payment
  app and "Arjun U-13 Tue/Thu" in the group. A join key has to be made before
  anything else.
- **Recorded is not the same as known.** The spreadsheet knows who is
  enrolled; it does not know why a student should play on Sunday. The thread
  knows who replied; it does not know that silence means "chase". The payment
  app knows a plan was paid; it does not know what the academy does when one
  lapses. Those rules are data too, and they have to be captured from the
  people who apply them.
- **Attendance replies are honest; silence is ambiguous.** Keep three states.
  A model that reads no reply as absent will cry wolf and lose the coaches.
- **Dates are the missing field.** When the reminder was sent, when the
  roster changed, when the parent was told, when the student was picked and
  could not come — the events happened; the timestamps did not.
- **Children's data.** Names, ages, guardian contacts, photographs and
  performance records of minors. Copy the minimum, keep it in one place,
  decide retention before the first export.
- **Seasonal gaps are real, not errors.** Exam fortnights and the monsoon
  empty the attendance data. A model must know the calendar.
- **WhatsApp is not a source system, but it is a source.** Treat anything
  that lives only in a thread as unavailable until it has been exported once
  and shown to be usable — and then treat the export as the most important
  dataset the academy has.

---

# Leadership Question

Of the datasets this initiative needs, which two already share a student
identifier — and which one exists today only as a WhatsApp thread that
someone would have to export before the end of the month?
