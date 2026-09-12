# Business Operating Knowledge

What Svarg is for, stated through the reference business it was stated for: a
cricket academy. Written down in September 2026 from how the academies we are
talking to actually run. The industry detail lives in the knowledge base
(`knowledge_base/.../Sports Academies/`); this page is the idea the detail
serves.

## The kind of business

A small organisation with a large recurring community. Around 30 employees,
most of them coaches; 400–500 children and young players; their parents. Not
a business that conducts cricket classes, but one that coordinates students,
parents, coaches, schedules, payments, attendance, batches, matches, venues
and communication, every day.

It has no system. It has several: an enrolment form where a student's record
begins; an Excel spreadsheet where staff copy it and where the working list
lives; a payment app (card, GPay; monthly and yearly subscriptions); and a
WhatsApp group per batch, where families are told about classes, asked about
tomorrow's attendance, and told about matches. And it has its staff, who hold
the rules.

## Explicit and implicit

The academy's knowledge is of two kinds.

**Explicit** — recorded somewhere: names, parents, batches, coaches,
subscription type and status, payments, attendance replies, match dates and
venues, who played.

**Implicit** — known, not written: how batches are formed; how a coach runs
one; that a day-before attendance request goes out and how the replies are
read; that "no reply" is not "absent"; how a match side is picked — roughly
two matches a month, willing players put their names forward, and the coach
chooses under an unwritten rule of fair opportunity, weighing who played last
time, who was picked but could not come, who has waited longest; which
exceptions are normal; which decisions a person must make.

The spreadsheet does not say why a student should play on Sunday. The thread
does not say how to turn replies into a plan. The payment app does not say
what the academy does with a family whose plan lapses next week. The real
operating model is the combination of people, systems, messages, history,
habits and judgment — and it is not written down anywhere.

## What Svarg does with it

Not build another student-management application. Not replace the
spreadsheet. The academy keeps Excel, WhatsApp, the form and the payment app;
Svarg learns how each of them participates in the business and builds an
intelligent layer across them. Understanding the meaning, not storing the
information.

So Svarg should know that a student belongs to a batch, that the batch has a
coach and a parent group, that the student has a subscription, that
attendance is asked the day before, that the student plays matches under the
selection principle — and that each of those facts comes from a different
place.

## The progression

1. **Understand** the business.
2. **Answer** questions about it. *Who is expected at tomorrow's practice?*
   — from the replies, with the silent families listed as unknown, not
   absent. *Who played in the last three matches?* — from the history.
3. **Recommend.** *Suggest a side for Sunday* — from availability, recent
   participation and fair opportunity, with reasons, and with the coach
   making the final call.
4. **Prepare.** The attendance summary, the follow-up list, the batch
   message, the renewal list — ready for a person to approve.
5. **Act.** Where permissions and safeguards exist, send it, post it, update
   it.

Understanding before answering; answering before recommending; recommending
before preparing; preparing before acting. This order is the product. A
pitch, a build or a screen that skips a step is wrong even when it works.

## Why it generalises

A music school, a dance academy, a coaching centre, a fitness studio, a
recruitment firm, a consultancy: different processes, same shape. People,
systems, procedures, rules, decisions, exceptions, institutional knowledge in
heads. Svarg's role is to learn that particular operating context, not to
assume every business should run one predefined workflow.

The value is not the automation of individual tasks. It is a persistent,
current understanding of how the business works — its operational
intelligence — that survives a coach leaving, answers in seconds what used to
take three windows, and can be reasoned over to power the work.

## How this reaches the product

- **Cob** should read an objective from such a business and find the
  opportunities on the progression — the joined view that answers, the
  attendance summary, the disengagement flag, the match-side recommendation,
  the renewal list, the drafted message — in the customer's words, with the
  step each one needs made clear. The Sports Academies overlay carries this.
- **Arth** should name the academy's datasets by the system each lives in
  and keep three attendance states, not two.
- **Eame** should build the application at the step the opportunity is at:
  an answerer answers, a recommender recommends and shows its reasons and
  leaves the decision to the coach.
- **Yusu** and the self-learning pipeline are how the understanding stays
  current after go-live.
