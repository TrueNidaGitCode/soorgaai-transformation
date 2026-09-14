# Read this before qa-report.md

## The run of 2026-09-14, after the reasoning rebuild

**75 of 88 answered. 9 flagged, none of them a wrong answer.**

Sections 1 to 10 completed. The provider's cap was reached again at question
76, so sections 11 to 16 carry the honest capacity message rather than an
answer — the four flagged as "SHOULD HAVE REFUSED" in section 14 are that
message, not a hallucination, and the checker mistook it for one.

The other five flags are the validator working: the model used a number code
could not explain, and the sentence was replaced by one built from the facts.
That is the safety net doing its job. What it printed was poor English —
"4 in u-16 trainees." — and that is now fixed.

## What changed against the run before it

| | before | after |
| --- | --- | --- |
| answered | 51 | 75 |
| sections completed | 1–7 | 1–10 |
| every question with a time word | refused | answered |
| every follow-up that narrowed a set | refused | resolved |
| HTTP 500s | 37 | 0 |

Worth reading for what the rebuild bought:

- **1.1** "16 issues need attention today across 11 people", broken down by
  category — the synthesis and the overlap, on a question that used to be
  refused outright.
- **5A.2** "What about their fees?" resolved against the students named in the
  previous answer, and said which reading it took.
- **9.x** every time-based question answered instead of "no date provided".

## What this run does NOT prove

Every windowed question came back zero, and correctly: the simulated roll
calls are all dated **2024-10-14**, two years before the run. So the window is
demonstrably APPLIED — a count of zero rather than a refusal — but not that it
SELECTS the right rows, because no row could match. That selection is proved
without a model in `__tests__/reasoning.test.js`, against fixed dates.

Re-upload the academy folder and run it again to see the windows bite on real
dates.

## To finish the run

    node scripts/app-checks/qa_suite.mjs --only=11,12,13A,13B,13C,14,15,16
