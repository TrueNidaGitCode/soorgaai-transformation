# Learning the patterns that precede churn — plan

Status: **built** (2026-10-08) — tested end to end on a composed application; not yet run on a real customer's history.

## Why

The competitive edge we now claim is: *"Svarg learns the behavioural patterns that
precede customer churn across your existing systems, continuously detects those
patterns in your customer base, explains the underlying risk, and helps your team
act before revenue is lost."*

Today the delivered app does everything in that sentence **except the first
clause**. Its patterns are fixed rules from the agent catalogue (Gone Quiet, No
Show, Renewal Due…). Its Learn step learns *which follow-up works*, not *which
signals come before a customer leaves*. This plan closes that gap.

## Decisions already made

| Question | Decision |
|---|---|
| What counts as churned | **Per business, proposed by Cob**, confirmed or changed by the owner on the Data page |
| Does a learned pattern alert on its own | **No — the owner approves it first**, one click per pattern |
| How it learns | **Explainable statistics in code**, per business. No trained ML model, and customer names never go into an AI prompt (see what-leaves-the-application.md) |

## How it works, in five steps

**1. Know who left.** Cob already reads the business description. It will also
propose the churn definition, written into the app at delivery (`data/agents.json`,
next to the business categories):

| Business type | Example definition |
|---|---|
| Recurring Services | No visit for 60 days, or the package was not renewed |
| Education & Memberships | Did not re-enrol for the next term |
| Subscription & Repeat Purchase | Subscription cancelled, or no order for 3× the usual gap |
| High-Value Repeat Services | The due visit was not booked within 30 days of the due date |
| Hospitality & Leisure | Membership not renewed, or no stay in 18 months |

The owner sees it on the Data page in one sentence ("A customer counts as lost
when…") and can change the number of days or the field it reads.

**2. Build each customer's timeline.** From the datasets the app already holds
(bookings, calls, messages, payments, tickets), the app joins records to one
person using the matching it already does today. For every customer it records
simple, explainable signals per week: visits and the gap between them, missed or
cancelled appointments, unanswered messages, failed or late payments, complaints,
and which existing agents flagged them.

**3. Compare those who left with those who stayed.** For each customer who
churned, look at the 30 days before they left; for customers who stayed, look at
comparable 30-day windows. A signal, or a pair of signals, that appears far more
often before leaving becomes a *candidate pattern*, with its numbers attached:

> **Missed 2 appointments + no reply to follow-up** — seen before 23 of the 31
> customers who left; customers showing it left 4.1× as often as those who didn't.

Thresholds (to be tuned on real data): at least 20 churned customers in the
history, a pattern seen before at least 8 of them, and at least 2× the usual
rate of leaving. Below that, the app says plainly that it is still learning.

**4. Owner approves; it starts watching.** Candidate patterns appear on the
agents board as suggestions — *"Seen before 23 of 31 customers who left. Watch
for it?"* One click turns a pattern into a live agent. From then on it runs on the
same schedule as every other agent, in code, and each alert shows **the pattern,
how strong it is, and the records behind it** — so Explain, Recommend, Act,
Measure and Learn work on it exactly as they do on the fixed rules.

**5. Keep learning.** Patterns are re-learned weekly as history grows. A pattern
whose strength falls below the threshold is flagged as fading rather than
deleted silently, and the existing Learn step keeps tracking which follow-up
works for each pattern.

## What changes where

| Area | Change |
|---|---|
| Svarg backend (Cob) | Propose a churn definition per blueprint; write it into the app at delivery |
| App template — new `services/churnPatterns.js` | Timeline builder, churn labelling, pattern scoring, candidate list |
| App template — agents | A new agent kind whose condition is a learned pattern; runs in code like the rest |
| App screens | Data page: the churn definition sentence (editable). Agents board: "Learned patterns" with approve / dismiss |
| Live apps | Picked up by the existing live-update sweep; no customer action needed |
| Investor deck | Status of Learn moves to "learns churn patterns" only once this is live on a real customer |

## What it will and will not claim

- **Will:** "learns which signals came before customers left *in your business*,
  and watches for them" — with numbers on every pattern.
- **Will not:** predict an individual customer's probability of leaving, or claim
  accuracy we have not measured. A pattern is a correlation in this business's
  own history, and the screen says so.

## Honest limits

- **Needs history.** Roughly 20+ churned customers and a few months of records.
  A new or small business will see "still learning" for a while, and the fixed
  rules keep it covered meanwhile.
- **Only as good as the joins.** Signals in different systems are joined by name
  and phone, as today. Where a person cannot be matched, their signals cannot be
  combined.
- **Correlation, not cause.** A pattern says "this came before leaving here", not
  "this made them leave".

## Testing

- Unit tests for churn labelling per definition type, timeline building, and pattern
  scoring on synthetic histories with a planted pattern (it must be found) and pure
  noise (nothing must be proposed).
- The clinic sample data (`cliniceaSample.js`) extended with a planted churn pattern,
  so the end-to-end check (`scripts/app-checks/e2e_app.mjs`) proves a pattern is
  learned, approved and alerting.
- Then on the cricket app, and on a real customer's history before the deck claims it.

## Rough size

About a week of focused work: Cob definition + delivery (1 day), timeline and
scoring (2 days), agent kind + screens (2 days), tests and sample data (1–2 days).
