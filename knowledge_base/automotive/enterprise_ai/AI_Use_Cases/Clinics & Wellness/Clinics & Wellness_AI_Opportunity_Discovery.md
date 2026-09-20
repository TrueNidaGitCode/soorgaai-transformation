# Clinics & Wellness AI Opportunity Discovery

**Layer:** Clinics & Wellness
**Extends:** Core/AI_Opportunity_Discovery.md
**Version:** 1.0

---

# Purpose

This layer enriches the Core AI Opportunity Discovery capability with knowledge
of appointment-led care businesses: physiotherapy and sports medicine centres,
dental and specialist clinics, wellness and recovery studios, diagnostic and
therapy practices. Businesses where a practitioner sees a client in a room, at
a booked time, usually as one of a course of visits rather than once.

The discovery methodology, consultant reasoning process and output structure
are inherited from the Core Asset. This layer supplies the domain context: how
such a practice actually runs day to day, where its records actually live,
where the administrative hours go, and which of those places AI can genuinely
relieve.

---

## AI Opportunity Discovery

A clinic is a capacity business wearing a care business's clothes. The product
is a qualified person, in a room, for a booked slot. Everything else — the
front desk, the phone, the reminders, the packages, the follow-up — exists so
that slot is filled by the right client, with the right notes ready, and gets
paid for.

Two facts decide what AI can do here, and both are true of almost every
practice regardless of speciality.

**The unit of value is a course, not a visit.** Clients buy a block of
sessions, or are prescribed a programme over six weeks. Revenue, clinical
outcome and reputation all depend on somebody completing the course. Nothing
in a normal practice watches whether they do.

**The record of a client is spread across four places that do not talk.** The
appointment sits in a booking system or a diary. The money sits in a
spreadsheet or an accounting package. The clinical note sits in an EMR, a
template document, or on paper. The actual conversation with the client sits in
WhatsApp, on a phone that belongs to one person. Nobody can see one client
whole without opening four things, so nobody does it routinely — only when
something has already gone wrong.

### The reference shape: a sports medicine and physiotherapy centre

Fifteen to twenty-five staff — physiotherapists, strength and conditioning
coaches, a nutritionist, two or three at the front desk. Six treatment cabins,
a gym floor, a hydrotherapy pool and a recovery area. Open seven days, early
morning to evening, because clients come before or after work and athletes come
around training. Read the operation end to end, because the opportunities sit
in the joins between its parts:

- **Enquiry.** Arrives by phone, by email, and through a form on the website —
  three channels into one front desk, none of them a queue. A phone enquiry
  exists only in whoever answered it. A form enquiry lands in an inbox that
  several people read and nobody owns. The practice does not know how many
  enquiries it received last month, let alone how many it answered.
- **Assessment and plan.** A first appointment produces a plan: so many
  sessions, so often, over so many weeks. This is the moment the business makes
  a promise it has no mechanism to keep track of.
- **Packages.** The client buys a block — ten sessions, twelve weeks of
  supervised gym, a monthly membership. The balance of that block is counted in
  a spreadsheet, or on a card, or in somebody's head. It expires on a date
  nobody is watching.
- **Scheduling.** Six cabins across seven days is roughly three hundred
  bookable slots a week. Cancellations arrive by WhatsApp, often within the
  hour. A cancelled slot is a cabin standing empty and a practitioner paid to
  stand in it; a waiting-list client who would have taken it is never told.
- **Attendance.** Nobody is marked absent in any system a manager reads. A
  client who stops coming has simply stopped appearing in the diary, which
  looks exactly like a client who finished.
- **Practitioners.** A roster across seven days, with specialisms that are not
  interchangeable — a sports physio and a geriatric physio cannot cover each
  other's list. A gap is discovered on the morning.
- **Payment.** Per session, per package, sometimes per insurance claim. The
  client who owes for three sessions is usually the client still being seen,
  because refusing treatment over money is not what this business does.
- **Follow-up.** Discharge should end with a review. In practice it ends with
  the client not booking again, and nobody distinguishes that from a client who
  got better.

### The defining failure: discharge by disappearance

Almost every opportunity in this industry is a variation of one event. Somebody
stops coming partway through a course of treatment, and the practice finds out
weeks later, or never.

It is worth being precise about why this matters more here than in other
industries:

- **Clinically**, an incomplete rehabilitation programme is worse than none.
  The client believes they are recovered, re-injures, and attributes it to the
  practice.
- **Commercially**, the unused balance of a package is revenue already banked
  and a client who will not return. Refunds and complaints follow.
- **Reputationally**, the client tells people the treatment did not work.

And nothing in a normal practice detects it, because the detection requires
noticing an *absence* — and every system in the building records what happened,
not what failed to.

### Where the administrative hours actually go

The front desk of a practice this size spends its week on the same handful of
things, in roughly this order:

1. Answering and placing enquiries across three channels, from scratch each
   time, with no record of what was promised.
2. Reminding clients of tomorrow's appointments, one message at a time.
3. Reconciling who has how many sessions left, usually at the point somebody
   asks.
4. Refilling slots after cancellations, by remembering who wanted one.
5. Chasing unpaid balances, gently, late.
6. Rebuilding the roster when a practitioner is unavailable.

None of this is clinical work. All of it is coordination across records that
already exist, which is precisely the shape AI can take on.

### What is genuinely constrained

Discovery here must respect three limits, or it produces opportunities that
cannot be built:

- **Clinical judgement is not on the table.** Nothing may suggest a diagnosis,
  a treatment, a dosage, or a discharge decision. The opportunity is always
  administrative: noticing, chasing, scheduling, reconciling, reporting. A
  proposal that reads as clinical advice will be rejected by the practice and
  should be.
- **Health data is sensitive and often regulated.** Clinical notes should stay
  where they are. The administrative facts — that an appointment existed, that
  a package has three sessions left, that somebody has not attended for
  seventeen days — are enough for almost every opportunity worth building, and
  carry far less risk than the notes themselves.
- **The practitioner's time is the constraint, not the software.** An
  opportunity that adds a step to a clinician's day will not survive contact
  with a full list, however good it is. The ones that work remove steps from
  the front desk.

### Where to look first

In order of how reliably these appear, and how quickly they can be shown to
matter:

1. **Course abandonment.** Clients partway through a prescribed programme with
   no visit in a fortnight. The single highest-value signal in the industry,
   and the practice almost certainly cannot produce the list today.
2. **Enquiry follow-through.** Enquiries received against enquiries answered
   and converted, across all three channels. Usually the first number that
   genuinely surprises an owner.
3. **Package balance and expiry.** Blocks running out, and blocks about to
   expire unused. Both are conversations worth having before the client
   notices.
4. **Slot recovery.** Cancellations against a waiting list — an empty cabin is
   a cost already incurred.
5. **No-show patterns.** Which clients, which times, which practitioners.
6. **Roster gaps.** Sessions scheduled with nobody qualified assigned.
7. **Outstanding balances**, ranked by how long and how much, not chased
   alphabetically.

### What good looks like in the output

An opportunity in this industry is specific about the *record it watches* and
the *person it tells*. "Improve patient retention" is not an opportunity here;
"every weekday, list clients with a treatment plan open and no appointment in
fourteen days, and tell the front desk" is. The second can be built by Friday
and argued about with real names; the first cannot be built at all.
