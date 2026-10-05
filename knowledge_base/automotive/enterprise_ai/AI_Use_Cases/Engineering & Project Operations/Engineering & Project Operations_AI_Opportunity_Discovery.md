# Engineering & Project Operations AI Opportunity Discovery

**Layer:** Engineering & Project Operations
**Extends:** Core/AI_Opportunity_Discovery.md
**Version:** 1.0

---

# Purpose

This layer enriches the Core AI Opportunity Discovery capability with knowledge
of project-based engineering organisations: product and embedded engineering
services, industrial automation and plant engineering, engineering consulting
and testing, and manufacturers whose orders run as engineering projects.
Businesses of roughly fifty to five hundred people that run several customer
projects at once, each with a plan, a team and a delivery date somebody has
promised a customer.

The discovery methodology, consultant reasoning process and output structure
are inherited from the Core Asset. This layer supplies the domain context: how
such an organisation actually runs its projects, where its records live, how a
slip is found, and which of those places AI can genuinely help.

This layer is written before any interview in the industry. It describes how
these businesses are commonly run, not what any one of them has said. Where a
blueprint's own evidence disagrees with it, the evidence wins.

---

## AI Opportunity Discovery

An engineering services business sells delivered work against a date. The
product is a milestone met — a design released, a build validated, a plant
section commissioned — and the engineering hours it took. Everything else, the
plan, the tracker, the timesheet, the test log, the status meeting, exists so
that the date holds and the hours stay near the estimate.

Two facts decide what AI can do here, and both are true of almost every such
organisation regardless of discipline.

**Every system says the project is fine on its own.** The plan shows tasks with
dates. The tracker shows issues moving. The timesheets show people booked. The
test log shows items open. Each is reasonable read alone, and the slip only
exists in the combination: progress behind the plan while the committed date is
unchanged, hours past the estimate on the critical task, validation items still
open a week before the milestone.

**The plan and the work are recorded in different places by different
people.** The schedule lives in MS Project or an Excel plan kept by the project
manager. The work lives in Jira, Azure DevOps or a similar tracker, updated by
engineers. Effort lives in a timesheet system. Test and validation status lives
in a test management tool or a spreadsheet. Customer commitments live in email,
Teams and the minutes of a weekly call. Nobody joins them routinely, so a
project's real state is assembled by hand for the status meeting — weekly at
best.

### The reference shape: a 200-person product engineering company

Eight to fifteen customer projects running at once, each with a delivery head
or programme manager and a team of five to thirty engineers across disciplines
— hardware, firmware, software, testing. Read the operation end to end, because
the opportunities sit in the joins between its parts:

- **Commitment.** A statement of work fixes milestones and an effort estimate.
  The customer milestone date is the promise; the estimate is the margin.
- **Plan.** The programme manager breaks the work into a schedule with planned
  start, finish and percent complete. It is updated when somebody remembers,
  usually before a review.
- **Execution.** Engineers work issues in the tracker. Status moves, comments
  accumulate, items get flagged as blocked — on a test bench, a dependency, a
  customer input.
- **Effort.** Hours are booked against tasks weekly. The comparison with the
  estimate happens at month end, if at all.
- **Validation.** Test cases and defects accumulate toward the milestone. The
  number still open is known only when somebody counts.
- **Dependencies.** In plant and industrial engineering, disciplines hand work
  to one another — layout to piping, piping to structural, structural to
  electrical and instrumentation. A slip in one shows up later in the next.
- **Review.** A weekly status meeting, where the project is reported green
  until the week it is red.

### The defining failure: found out too late

Almost every opportunity in this industry is a variation of one event. A
project drifts behind its plan, the signals were in the records weeks earlier,
and the organisation finds out when the delivery date is already affected.

It is worth being precise about why this matters here:

- **Commercially**, a missed milestone delays an invoice, may carry a penalty,
  and turns a fixed-price project into a loss as hours run past the estimate.
- **For the customer relationship**, the customer hears about the slip late,
  from the supplier, after the date has moved. That is what loses the next
  statement of work.
- **Operationally**, recovery late in a project costs more than recovery early:
  people are pulled from other projects, which then slip in turn.

And nothing in a normal organisation detects it early, because detection
requires comparing records that sit in different systems and are owned by
different people.

### Where the management hours actually go

Delivery heads and PMO teams of an organisation this size spend their week on
the same handful of things:

1. Assembling project status from the tracker, the plan and the timesheets for
   the weekly review, by hand.
2. Chasing engineers for timesheet entries and status updates.
3. Finding out which work is blocked, and on what.
4. Re-planning when a milestone is at risk, usually after it is visible to the
   customer.
5. Reconciling effort booked against the estimate at month end.
6. Answering the customer's "where are we?" from records that disagree.

None of this is engineering. All of it is coordination across records that
already exist, which is the shape AI can take on.

### What is genuinely constrained

Discovery here must respect three limits, or it produces opportunities that
cannot be built:

- **It must not read as watching individuals.** Project managers and engineers
  will reject a tool that looks like surveillance of their work. The
  opportunity is organisational visibility — a project going off track, work
  nobody owns, a milestone at risk — reported to the delivery head, COO or PMO,
  not a scorecard of a person.
- **Engineering judgement is not on the table.** Nothing may decide a design,
  a test outcome, or whether a defect is acceptable. The opportunity is
  noticing, comparing, chasing and reporting.
- **Customer data is confidential.** Specifications and designs stay where they
  are. The project facts — a due date, a percent complete, hours booked, a
  status, a count of open items — are enough for almost every opportunity worth
  building, and carry far less risk.

### Where to look first

In order of how reliably these appear, and how quickly they can be shown to
matter:

1. **Milestone at risk.** Work behind its planned progress with the due date
   under two weeks away. The single most valuable signal in the industry, and
   usually invisible until the review.
2. **Blocked work.** Items flagged blocked or on hold, and how long they have
   been blocked. Usually the first list that surprises a delivery head.
3. **Effort over estimate.** Hours booked past the estimate, task by task,
   weekly rather than at month end.
4. **Work that stopped moving.** Open items with no update in a fortnight.
5. **Unowned work.** Open items with nobody assigned, especially near a
   milestone.
6. **Open validation near a milestone.** Test and defect items still open as
   the date approaches.
7. **Customer commitments overdue.** Actions promised to the customer past
   their date.

### What good looks like in the output

An opportunity in this industry is specific about the *records it compares* and
the *person it tells*. "Improve project visibility" is not an opportunity here;
"every weekday, list tasks more than ten points behind their planned progress
with the due date under two weeks away, and tell the delivery head" is. The
second can be built and argued about with real project names; the first cannot
be built at all.

The typical sources to name: a project tracker such as Jira, a project plan
exported from MS Project or Excel, timesheets, and a test or defect log.
