# Sports Academies AI Use Case Classification

**Layer:** Sports Academies
**Extends:** Core/AI_Use_Case_Classification.md
**Version:** 1.0

---

# Purpose

This layer supplies sports academy context for classifying AI use cases: which
categories recur in coaching businesses, and what separates a use case the
admin team will lean on from one that will be admired at the demo and never
opened again.

Classification method and output structure are inherited from the Core Asset.

---

## AI Use Case Classification

Academy use cases sort along one axis this industry cares about more than most:
**whether the AI acts, or drafts for a person to act.** Anything touching a
player's record, a family's money, a coach's roster or a judgment about a
child's ability belongs in the drafting category, whatever the model's
confidence.

### Category 1 — Operations Automation

Removing repetitive work from the admin team: roster building and repair,
venue re-booking, attendance chasing, fee reconciliation, coach payroll from
sessions delivered.

Characteristics: high frequency, low individual value, enormous aggregate
value. Inputs and outputs are well defined and already in the academy's
systems. Fastest to adopt, because the person doing the task feels the
difference the same week.

### Category 2 — Communication Assistance

Drafting messages to parents, players and coaches from the underlying record:
schedule changes, fee reminders, progress updates, selection news, camp
announcements.

Characteristics: very high volume, relationship-sensitive, judged socially.
Always human-approved. Value comes from removing an unpleasant, repetitive
task, not from writing better than the admin would.

### Category 3 — Pattern Detection over Operational Data

Disengagement and drop-out risk, attendance anomalies, payment-behaviour
trends, batch under-filling, coach overload, enrolment forecasting by season.

Characteristics: uses data captured for other purposes, so no new burden on
coaches. Outputs are advisory flags. Value depends entirely on someone acting
on the flag inside a workflow they already run, which makes placement matter
more than accuracy.

### Category 4 — Player Development Support

Summarising coach notes into progress records, mapping observations to a
skills framework, preparing a parent-ready progress summary, video-assisted
technique analysis.

Characteristics: closest to the coaching craft, and therefore the most
sensitive to coach trust. Adoption depends on whether coaches feel assisted or
second-guessed. Highest variance in outcome of the five, and the category
parents ask about most.

### Category 5 — Enquiry and Self-Service

Answering prospective and current families' questions about batches, timings,
fees, trials, camps and availability, from the academy's own schedule and
price list.

Characteristics: bounded, factual, answerable from existing records. Clear
value where enquiry volume spikes with the season and a slow reply is a lost
enrolment. The risk is a confidently wrong answer about money or a place in a
batch.

---

# Classification Signals for Sports Academies

Use these to place a candidate use case:

- **Who bears the consequence of an error?** If it is a child or a family, the
  use case is assistive, not autonomous, whatever its accuracy.
- **Does the data already exist?** Academies will not start recording
  something new to enable AI. Use cases needing new capture — video, wearables,
  detailed skill scoring — are systematically over-ranked and under-adopted.
- **Does it take work off the admin team?** In a multi-coach academy the
  admins are the constraint. A use case that helps coaches but adds a step
  for admins will not survive.
- **Is the task disliked?** Adoption tracks unpleasantness relieved more
  reliably than time saved. Fee chasing and roster repair are the clearest
  examples.
- **Does it recur weekly?** A use case that matters only at camp enrolment is
  a seasonal feature, not the first thing to build.
- **Can it be used from a phone, at the ground, between sessions?** If not,
  the people who most need it will not use it.

---

# Anti-Patterns in This Industry

- **Automated judgments about a player's ability or selection.** The coach's
  word is the product and the parents' trust rests on it. A machine grading a
  child is the fastest way to lose both coaches and families.
- **Fully automated messages to families.** The message that goes out wrong
  is the one about a child, and the cost is the relationship.
- **Dashboards as the deliverable.** Owners and admins do not visit
  dashboards between sessions. Insight has to arrive as a message, a flag in
  the roster, or an answer to a question.
- **Use cases that need clean history.** Records in this industry are spread
  across an app, spreadsheets and WhatsApp by default. Assume messy input and
  design for it.
- **Video analysis first.** The most exciting demo and the least likely first
  success: new equipment, new capture, and it walks straight into the coach's
  craft.

---

# Leadership Question

For each candidate use case: if the model is wrong, who finds out, how quickly,
and what does it cost them — and is that answer acceptable to a parent standing
at the boundary rope?
