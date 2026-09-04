# Education Technology AI Use Case Classification

**Layer:** Education Technology
**Extends:** Core/AI_Use_Case_Classification.md
**Version:** 1.0

---

# Purpose

This layer supplies education technology context for classifying AI use cases:
which categories recur in this industry, and what distinguishes a use case that
will be adopted from one that will be admired and ignored.

Classification method and output structure are inherited from the Core Asset.

---

## AI Use Case Classification

Education use cases sort usefully along one axis this industry cares about more
than most: **whether the AI acts, or drafts for a human to act.** Anything
touching a student's record, a family's money, or a judgment about a child's
progress belongs in the drafting category regardless of model confidence.

### Category 1 — Administrative Automation

Removing repetitive work from people whose value lies elsewhere. Attendance
capture, invoice generation, reconciliation, form filling, record migration.

Characteristics: high frequency, low individual value, enormous aggregate value.
Well-defined inputs and outputs. Low regulatory exposure. Fastest to adopt,
because success is immediately felt by the person doing the task.

### Category 2 — Communication Assistance

Drafting messages to students, parents and staff from underlying operational
records: reminders, progress updates, fee follow-ups, announcements.

Characteristics: high volume, relationship-sensitive, quality judged socially
rather than statistically. Always human-approved. Value comes from removing an
unpleasant task, not from writing better prose than the human would.

### Category 3 — Pattern Detection over Operational Data

Attrition risk, attendance anomalies, payment-behaviour trends, enrolment
forecasting.

Characteristics: uses data already captured for other purposes, so no new
collection burden. Predictions are advisory. Value depends entirely on whether
someone acts on the flag, which makes workflow placement more important than
model accuracy.

### Category 4 — Knowledge and Content Support

Lesson material generation, practice exercises, curriculum mapping, summarising
instructor notes into progress records.

Characteristics: closest to the teaching craft, therefore the most sensitive to
instructor trust. Adoption depends on whether teachers feel assisted or
second-guessed. Highest variance in outcome of the four.

### Category 5 — Enquiry and Self-Service

Answering prospective and current student questions about schedules, fees,
policies and availability.

Characteristics: bounded, factual, answerable from existing records. Clear
value where enquiry volume is high and response speed affects enrolment. Risk
is confidently wrong answers about money or availability.

---

# Classification Signals for Education Technology

Use these to place a candidate use case:

- **Who bears the consequence of an error?** If it is a student or a family,
  the use case is assistive, not autonomous, whatever its accuracy.
- **Does the data already exist?** Education institutions will not start
  recording something new to enable AI. Use cases requiring new capture are
  systematically over-ranked and under-adopted.
- **Is the task disliked?** Adoption in this industry tracks unpleasantness
  relieved more closely than time saved. Fee chasing is the clearest example.
- **Does it survive the term cycle?** A use case that matters only during
  admissions is a seasonal feature, not a platform capability.
- **Can it be used from a phone, mid-class, without training?** If not, it will
  not be used by the people who most need it.

---

# Anti-Patterns in This Industry

- **Automated decisions about student progression or capability.** Regulatory
  exposure, parental trust and genuine pedagogical disagreement make this a poor
  first use case regardless of technical feasibility.
- **Fully automated communication to families.** The message that goes out
  wrong is the one about a child, and the cost is the relationship.
- **Analytics dashboards as the primary deliverable.** Owner-operators do not
  visit dashboards. Insight has to arrive inside a workflow they already touch.
- **Use cases requiring clean historical data.** Records in this industry are
  fragmented and inconsistent by default; assume messy input.

---

# Leadership Question

For each candidate use case: if the model is wrong, who finds out, how quickly,
and what does it cost them — and is that answer acceptable to a parent?
