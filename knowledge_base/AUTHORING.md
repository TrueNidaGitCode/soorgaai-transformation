# Writing knowledge that Cob actually uses

For whoever is researching an industry and writing it up. The parser that reads
these files is strict in a few places and silent when it fails, so this is the
short list of things that decide whether a day's work reaches a prompt or sits
on disk doing nothing.

**Run this after every edit:**

```
cd backend/trunida-backend
node scripts/kb_doctor.mjs "Sports Academies"     # one industry
node scripts/kb_doctor.mjs                        # all of them
```

It prints, per capability, how many of your words reach the prompt and what is
wrong if anything is. `+` is fine, `!` is worth knowing, `x` means the file is
not being used as you'd expect.

---

## Where a file goes

```
knowledge_base/automotive/enterprise_ai/<Domain>/<Industry>/<Industry>_<Capability>.md
```

The `automotive/` in that path is a historical folder name that now holds every
industry. Ignore it.

- `<Domain>` — one of `AI_Use_Cases`, `AI_Strategy`, `Data_Readiness`,
  `Technology_Infrastructure`. (`Skills_Workforce` and `Governance_Security`
  exist but are switched off, so writing them changes nothing today.)
- `<Industry>` — the folder name **and** the filename prefix must match
  exactly, including spaces: `Sports Academies/Sports Academies_AI_ROI.md`.
- `<Capability>` — the capability name with underscores. The capability must be
  a row in that domain's `Core/<Domain>_Intelligence_Specification.md`
  "Knowledge Architecture" table. **A file for a capability not in that table is
  never read by anything.**

Creating a new industry is just creating the folder and putting a file in it.
No deployment, no code change.

## The one rule that fails silently

Most capabilities have a single pillar, and for those the whole document is
used whatever your headings are. **Some capabilities have several pillars**, and
for those each pillar takes the industry section whose `##` heading *contains
the pillar's name*.

If `kb_doctor` says `no section matched`, that is this. It will tell you the
exact heading to use and print the headings your file currently has.

## What actually reaches the prompt

- Up to **3000 words** per file. Past that, the rest is dropped — `kb_doctor`
  warns you. Put what matters most first.
- Prose, headings, list items and **table rows** all survive. Tables are
  flattened to `cell — cell — cell`, so they are a good way to carry a
  challenge-to-opportunity mapping compactly.
- Blockquotes (`> …`), italic-only lines, and the `**Layer:** / **Extends:** /
  **Version:**` front-matter are dropped. Do not put content in them.

## What to write

The Core file for each capability is the **method** — how to reason about it in
any industry. Do not repeat it. An industry file is the **reality**: what this
kind of business actually does, with what systems, and where the effort really
goes.

The strongest thing in the base is a sentence like this, from the sports
academies file:

> The academy is not a software company and usually has no single system. Its
> operation is spread across an enrolment form, a spreadsheet, WhatsApp groups,
> a payment app and the memory of its staff. That fragmentation is the defining
> fact of the industry, and it decides what AI can and cannot do here.

That is worth more than a page of correct generalities, because a frontier
model already knows the generalities. Write what you could only learn by asking
somebody who runs one.

Useful to capture in an interview:
- the systems they actually name, in the words they use for them
- where a decision is made from memory rather than from a record
- what a week of the work looks like, and which parts nobody wants to do
- what they have already tried and abandoned
- the numbers they quote about themselves without being asked

## Front matter

Keep the three lines every existing overlay carries. They are documentation for
the next reader, not parsed content:

```
**Layer:** Sports Academies
**Extends:** Core/AI_Opportunity_Discovery.md
**Version:** 1.2
```

## Before committing

```
node scripts/kb_doctor.mjs --strict
```

Exits non-zero if anything is broken, so it can go in a commit hook.
