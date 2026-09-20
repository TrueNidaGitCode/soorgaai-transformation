# Clinics & Wellness Critical Data Identification

**Layer:** Clinics & Wellness
**Extends:** Core/Critical_Data_Identification.md
**Version:** 1.0

---

# Purpose

This layer supplies clinic and wellness context for identifying the minimum
data an AI initiative needs: what an appointment-led practice actually records,
which system each piece lives in, how reliable it is, and which datasets are
worth asking for first.

Identification method and output structure are inherited from the Core Asset.

---

## Critical Data Identification

A clinic records more than it can read. Everything an early initiative needs
already exists somewhere — the business cannot book a room or take a payment
without it — but no two pieces live together. The reference practice runs on
four systems and one memory: a **booking system or diary** (appointments,
cabins, practitioners), a **spreadsheet** (session packages, balances,
expiries — almost always a spreadsheet, whatever else they have), a **payments
app or accounting package**, an **EMR, template document or paper file** for
clinical notes, and **WhatsApp on the front desk phone**, which is where
cancellations, reminders and most of the actual relationship live.

The task is rarely to collect new data. It is to name the datasets that matter,
say which system each lives in today, and be honest about which are clean,
which are stale, and which exist only as messages nobody can search.

Name datasets in the practice's words — appointments, packages, treatment
plans, enquiries — not in software words. The person reading this runs the
front desk.

---

## The datasets that matter, in the order worth asking for them

**Appointments.** The spine of everything. One row per booked slot: who, with
whom, in which room, when, and whether it happened. Usually the cleanest data
in the building, because the business cannot function without it. The field
that is usually missing is the last one — whether it happened. Many practices
record only that a booking existed, which makes attendance invisible.

**Clients.** Name, contact, when they first came, and what brought them. Nearly
always present and nearly always duplicated: the same person booked by phone in
March and by the web form in August is two records. Ask early whether there is
an identifier, because a practice that has one is a different proposition from
one that does not.

**Treatment plans or courses.** How many sessions were prescribed, over what
period, and how many have been used. This is the dataset that decides whether
the highest-value opportunity in this industry can be built at all. It is also
the one most likely to live only in a spreadsheet or a clinician's notes. If it
does not exist in a readable form, say so plainly and early — it changes what
can be promised.

**Packages and payments.** What was bought, what it cost, what is still owed,
what expires when. Usually split between a payments app that knows the money
and a spreadsheet that knows the balance, with neither knowing both.

**Enquiries.** Who asked, when, through which channel, and what happened next.
Typically the worst dataset in the practice and the most revealing. Phone
enquiries often do not exist at all; web-form enquiries sit in a shared inbox.
Expect the answer "we don't really track that", and treat it as a finding
rather than a blocker — it is frequently the strongest early opportunity
precisely because nothing is watching it.

**Practitioner roster.** Who works when, and what each is qualified to do. The
qualification matters: in this industry cover is not interchangeable, and a
roster without specialism is a roster that cannot answer the useful question.

**Clinical notes.** Deliberately last, and usually best left alone. Almost
every administrative opportunity in this industry can be built from the
existence and timing of appointments rather than from their content. Pulling
notes into scope adds regulatory weight, slows the engagement, and buys very
little. Ask what is in them; do not ask for them.

---

## What to expect when you ask

- **The booking system is real and the rest is a spreadsheet.** This is the
  common case. Plan for it rather than treating it as a problem.
- **Attendance is not recorded, only booking.** Ask specifically. "Do you mark
  whether they turned up?" separates two very different practices.
- **The package balance is manual.** Somebody counts it when asked. This means
  it is accurate at the moment of asking and unknowable at any other time.
- **WhatsApp holds the cancellations.** A practice that cancels by WhatsApp has
  a record of every cancellation and no way to count them. An export is worth
  asking for; a live connection to a personal number is usually not available.
- **Nothing records why somebody stopped.** There is no "discharged" versus
  "disappeared" field anywhere. That distinction has to be inferred from the
  gap between the plan and the appointments, which is exactly why the two
  datasets are worth insisting on together.

---

## The minimum to start

Two datasets are enough to build something that matters on day one:

1. **Appointments**, with a date and an identifiable client.
2. **Treatment plans or packages**, with how many sessions were intended.

With only those, a practice can be told every morning which clients are partway
through a course and have not been seen in a fortnight — which is the single
thing this industry cannot currently see and cares most about. Everything else
is worth having and nothing else is worth waiting for.
