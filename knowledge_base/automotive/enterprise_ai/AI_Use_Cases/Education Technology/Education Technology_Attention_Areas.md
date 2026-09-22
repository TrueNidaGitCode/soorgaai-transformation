# Education Technology Attention Areas

**Layer:** Education Technology
**Extends:** Core/Attention_Areas.md
**Version:** 1.0

---

# Purpose

The categories a delivered application groups its findings under, for this
industry, in the order they should appear on the first screen somebody sees.

A learning business is judged on whether learners finish, whether the timetable is honoured, and whether subscriptions renew. The people paying and the people learning are often not the same, which is why Growth and Retention are kept apart.

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
| Retention | Learners disengaging | stopped-coming, missing-attendance, gone-quiet, no-show, repeat-complaint |
| Delivery | Sessions and staffing that did not happen | empty-slot, over-capacity, unstaffed-session, leave-clash, timesheet-chaser |
| Growth | Enquiries and trials not converted | unanswered-enquiry, promise-overdue, new-joiner |
| Revenue | Subscriptions and invoices at risk | renewal-due, overdue-invoice, never-invoiced, part-payment, unusual-expense, price-change, unconfirmed-order, late-delivery |
| Compliance | Records and documents that would not stand up | expiring-soon, deadline-approaching, missing-document, missing-detail, duplicate, nothing-new, stale-source |
