# Clinics & Wellness Attention Areas

**Layer:** Clinics & Wellness
**Extends:** Core/Attention_Areas.md
**Version:** 1.0

---

# Purpose

The categories a delivered application groups its findings under, for this
industry, in the order they should appear on the first screen somebody sees.

An appointment led practice is judged on whether a course of treatment is finished, whether the cabins were used, and whether the people who asked about you ever heard back. These are the five things a practice manager is actually accountable for.

---

## Why this is a table and not prose

Everything else in this knowledge base is written to be read by a model. This
is read by code.

The categories decide how a screen is laid out — which chips appear, in what
order, and which finding lands under which one. That is navigation, not an
answer, and it has to be the same every morning for the same business. A model
asked to infer categories from a paragraph would produce a defensible list each
time and a slightly different one for the next clinic, which is how two
customers in the same trade end up with screens that cannot be discussed
together.

So the mapping is explicit. Publishing a new industry still defines its own
categories here, with no code change — the parser reads this table and nothing
else.

## The rules the parser applies

- A watcher named in more than one category belongs to the first one listed.
- A watcher named nowhere falls into the last category.
- A category with nothing found in it is not shown, rather than shown empty.

---

## Attention Areas

| Category | What it answers | Watchers |
| --- | --- | --- |
| Retention | Who is drifting out of treatment | stopped-coming, gone-quiet, missing-attendance, no-show, repeat-complaint |
| Utilisation | What capacity is going to waste | empty-slot, over-capacity, unstaffed-session, leave-clash, timesheet-chaser |
| Growth | Which new business is going cold | unanswered-enquiry, promise-overdue, new-joiner |
| Cash | What money is at risk | absent-but-attended, overdue-invoice, never-invoiced, part-payment, renewal-due, unusual-expense, price-change, unconfirmed-order, late-delivery |
| Compliance | What would fail an inspection | expiring-soon, deadline-approaching, missing-document, missing-detail, duplicate, nothing-new, stale-source |
