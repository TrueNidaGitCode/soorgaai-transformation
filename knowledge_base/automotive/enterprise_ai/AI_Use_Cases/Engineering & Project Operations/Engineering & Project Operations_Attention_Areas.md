# Engineering & Project Operations Attention Areas

**Layer:** Engineering & Project Operations
**Extends:** Core/Attention_Areas.md
**Version:** 1.0

---

# Purpose

The categories a delivered application groups its findings under, for this
industry, in the order they should appear on the first screen somebody sees.

A project-based engineering organisation — product and embedded engineering,
industrial and plant engineering, engineering-led manufacturing — is measured
on whether a committed delivery lands on time, whether it is right, what it
cost against what was estimated, whether the people are there to do it, and
whether a customer is waiting on something nobody has closed. Schedule comes
first because a delivery date is the promise the whole business is judged on,
and it is the one most often discovered to be missed after the fact.

---

## Why this is a table and not prose

Everything else in this knowledge base is written to be read by a model. This
is read by code.

The categories decide how a screen is laid out — which chips appear, in what
order, and which finding lands under which one. That is navigation, not an
answer, and it has to be the same every morning for the same business. A model
asked to infer categories from a paragraph would produce a defensible list each
time and a slightly different one for the next company, which is how two
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
| Schedule | Which deliveries are slipping | milestone-at-risk, behind-plan, blocked-work, no-progress, unassigned-work, deadline-approaching, promise-overdue, late-delivery, unconfirmed-order |
| Quality | What came back wrong or is out of date | repeat-complaint, missing-detail, duplicate, nothing-new, stale-source |
| Cost | Where effort and money run over the estimate | over-estimate, unusual-expense, overdue-invoice, never-invoiced, part-payment, price-change, renewal-due, absent-but-attended, cancelled-not-updated |
| People | Who is missing, overloaded or not set up | timesheet-chaser, leave-clash, new-joiner, unstaffed-session, over-capacity, stopped-coming, missing-attendance |
| Customer | What a customer is still waiting for | unanswered-enquiry, contact-no-record, promise-not-kept, gone-quiet, opportunity-gone-quiet, asked-to-upgrade, no-show-then-contact, no-show |
| Risk | What would fail a review or an audit | expiring-soon, missing-document, empty-slot |
