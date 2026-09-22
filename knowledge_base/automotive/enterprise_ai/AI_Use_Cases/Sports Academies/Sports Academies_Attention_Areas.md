# Sports Academies Attention Areas

**Layer:** Sports Academies
**Extends:** Core/Attention_Areas.md
**Version:** 1.0

---

# Purpose

The categories a delivered application groups its findings under, for this
industry, in the order they should appear on the first screen somebody sees.

An academy lives on whether trainees keep turning up, whether the ground and the coaches are used, and whether fees arrive without being chased. Safeguarding paperwork is not optional when the members are children.

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
| Retention | Who has stopped turning up | stopped-coming, missing-attendance, no-show, gone-quiet, repeat-complaint |
| Utilisation | Sessions, grounds and coaches going unused | empty-slot, over-capacity, unstaffed-session, leave-clash, timesheet-chaser |
| Growth | Enquiries and trials not converted | unanswered-enquiry, promise-overdue, new-joiner |
| Fees | What has not been collected | overdue-invoice, never-invoiced, part-payment, renewal-due, unusual-expense, price-change, unconfirmed-order, late-delivery |
| Compliance | Safeguarding, consent and certification | expiring-soon, deadline-approaching, missing-document, missing-detail, duplicate, nothing-new, stale-source |
