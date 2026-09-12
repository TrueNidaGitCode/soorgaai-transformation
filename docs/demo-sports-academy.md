# Demo script — a cricket academy

For pitching Svarg to a cricket academy with 30+ coaches and a four-person
admin and operations team. The knowledge base has a **Sports Academies**
overlay (AI Use Cases and Data Readiness), so a clearly academy-shaped
objective grounds on it rather than on core content alone.

The run is hands-off after the objective, with one decision on Arth.

---

## 1. The objective (type this on the home page)

> We run a cricket academy with about 30 coaches and 400 to 500 students in
> batches by age and level, with four admins managing all operations. We have
> no single system: new students come in through an enrolment form that staff
> copy into an Excel sheet, parents pay by card or GPay on monthly or yearly
> subscriptions, and each batch has its own WhatsApp group where we post the
> next day's attendance request and parents reply, or don't. We also play
> about two matches a month, and the coach picks the side by hand trying to
> give everyone a fair chance, going by memory of who played last time. The
> admins spend their day reading attendance threads, chasing the parents who
> haven't replied, working out who is active and whose subscription is due,
> and answering parents. We want to know who is expected at practice
> tomorrow, who hasn't answered, who is drifting away before the family stops
> paying, and to give the coach a fair suggested side for the next match —
> without replacing Excel or WhatsApp.

Why this wording: it names the people, the four systems (form, Excel, payment
app, WhatsApp), the daily attendance request and what silence means, the
match-selection rule, and the questions the academy actually asks. It ends
with "without replacing Excel or WhatsApp", which is the positioning. That is
what Cob needs to produce opportunities in the academy's words rather than in
AI words.

## 2. What to expect at each stage

**Cob** — reads the objective, picks an engagement type (automating the
academy's own work), and recommends one opportunity in plain words, with the
technique underneath. Expect something like:

> **Know who is expected at tomorrow's practice, and who hasn't said**
> Built as: Attendance-reply extraction and roster reconciliation over WhatsApp
> *Start with this: the replies are already in the batch groups every day, so
> nothing has to be collected first.*

with the others listed the same way (a player drifting away, a fair suggested
side for the match, whose subscription is due, drafted batch messages). The
recommendation is approved on arrival and it moves to Aria.

Talking point: "Nobody at the academy needs to know what any of this is
called. They read what it does."

**Aria** — chooses the model and prepares the environment, then moves on.
Nothing to do. Talking point: "This is the part every other vendor makes you
hire someone for."

**Arth** — the one decision. Open **Sample data** and, in the context box,
paste:

> A cricket academy in one city: about 450 enrolled players aged 8 to 19 in
> under-11, under-13, under-15, under-17 and senior batches, each batch with
> one coach and one WhatsApp group; 30 coaches, mostly part-time, paid per
> session; 5 grounds and 3 indoor net centres; sessions on weekday evenings
> and all day at weekends. Each batch gets an attendance request the day
> before and parents reply yes, no, or not at all — about a fifth never
> reply. Monthly and yearly subscriptions paid by card or GPay; some lapse
> quietly. Two matches a month; for each, who put their name forward, who was
> selected, who was selected but unavailable, and who played. A summer camp
> in April–May; attendance dips in exam months and during the monsoon.

Press **Generate**. It fills each dataset with rows that fit that description
and moves to Eame.

Talking point: "With a real customer this is where we connect their app,
their spreadsheets, their accounts. For today it is invented data that looks
like theirs."

**Eame** — builds the application, verifies it runs, repairs it if it does
not, and moves to Yusu. Two to four minutes. Talking point: keep the screen up
while it builds; the gates going green is the demonstration.

**Yusu** — pushes, runs the governance, ethics and security checks, and goes
live. It shows the application's address.

## 3. The live application

Open the address. It opens on the front door — the application's name and
what it does — with **Log in**, then the welcome, then the chat.

Questions that land, in this order:

1. *Who is expected at tomorrow's under-13 practice?* — coming, not coming,
   and, separately, the families who have not replied.
2. *Which parents in that batch haven't answered yet?* — the follow-up list.
3. *Which players are drifting away this month?* — with the reason for each
   (stopped replying, missed sessions, a late renewal).
4. *Suggest a side for Sunday's under-15 match* — a suggested eleven with a
   reason per player (available, hasn't played since March, was picked last
   time but couldn't come), and the coach decides.
5. *Whose subscription is due in the next two weeks?*

Each answer shows the records it came from. Talking points: "It is answering
from the academy's own data — the sheet, the payment app, the threads — and
it shows its working." And on the match side: "It suggests; the coach picks.
That is the rule, and it stays the rule."

## 4. What to say if something stops

- A stage that stops shows why and stays there. Read it out; it is written
  for the customer, not for us.
- If Yusu says the delivery credentials are missing, the application was
  built and can be downloaded; going live is a configuration on our side.
- If Cob's opportunity wording is technical, that is a prompt to tighten, and
  it is worth noting which words came through.

## 5. Before the meeting

- Use a fresh objective (the one above, or a variant); never reopen an old
  blueprint for the pitch — old ones are shown as they were.
- Log in first. Guests cannot approve, prepare or go live.
- Hard-refresh once (Ctrl+Shift+R) on the home page.
- Run it once the day before. The build takes minutes and the address should
  already be live when the customer sees it; the run in the meeting is the
  second one.
