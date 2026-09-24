# Artificial Intelligence Attention Areas

**Layer:** Artificial Intelligence
**Extends:** Core/Attention_Areas.md
**Version:** 1.0

---

# Purpose

The categories a delivered application groups its findings under, for this
industry, in the order they should appear on the first screen somebody sees.

A business adopting AI is judged on whether the work ships, whether its answers can be trusted, what it costs to run, whether anyone uses it, and whether it would survive a review. These are deliberately generic: this layer is chosen when no more specific industry fits.

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
| Delivery | What is late or unfinished | promise-overdue, deadline-approaching, unconfirmed-order, late-delivery |
| Quality | What is wrong or contradictory | repeat-complaint, missing-detail, duplicate, nothing-new, stale-source |
| Cost | What is being spent | absent-but-attended, unusual-expense, overdue-invoice, never-invoiced, part-payment, renewal-due, price-change |
| Adoption | Who has stopped using it | stopped-coming, gone-quiet, missing-attendance, no-show, unanswered-enquiry, new-joiner |
| Risk | What would fail a review | expiring-soon, missing-document, empty-slot, over-capacity, unstaffed-session, leave-clash, timesheet-chaser |
