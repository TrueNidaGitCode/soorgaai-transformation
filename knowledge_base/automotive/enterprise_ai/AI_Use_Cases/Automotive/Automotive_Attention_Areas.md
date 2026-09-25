# Automotive Attention Areas

**Layer:** Automotive
**Extends:** Core/Attention_Areas.md
**Version:** 1.0

---

# Purpose

The categories a delivered application groups its findings under, for this
industry, in the order they should appear on the first screen somebody sees.

An engineering or product organisation is measured on whether the work lands on time, whether it is right, what it cost, whether the people are there to do it, and whether the customer is still waiting on something nobody has closed.

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
| Schedule | What is slipping | no-progress, blocked-work, unassigned-work, promise-overdue, deadline-approaching, late-delivery, unconfirmed-order |
| Quality | What came back wrong | repeat-complaint, missing-detail, duplicate, no-show |
| Cost | What is being spent and not recovered | absent-but-attended, unusual-expense, overdue-invoice, never-invoiced, part-payment, price-change, renewal-due |
| People | Who is missing, and who has not been set up | timesheet-chaser, leave-clash, new-joiner, unstaffed-session, stopped-coming, missing-attendance |
| Customer | What a customer is still waiting for | unanswered-enquiry, gone-quiet |
| Risk | What is out of date or unattended | expiring-soon, missing-document, nothing-new, stale-source, empty-slot, over-capacity |
