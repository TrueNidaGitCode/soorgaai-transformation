# Read this before qa-report.md

The run of 2026-09-14 asked all 88 questions but only **51 were answered**.
Sections 8 to 16 failed with HTTP 500 — not in the application, at the model:
Gemini's daily quota ran out at question 52, and the two fallbacks are also
unavailable (Anthropic: credit balance too low; OpenAI: no credits remaining).

Sections 1 to 7 in the report are real answers and worth reading.
Sections 8 to 16 are empty and prove nothing either way.

To finish the run once there is model capacity:

    node scripts/app-checks/qa_suite.mjs --only=8,9,10,11,12,13A,13B,13C,14,15,16
    node scripts/app-checks/qa_suite.mjs --provider=openai      # or claude, gemini

What the 51 answers showed, and what was changed because of them:

- Cross-data reasoning works. "Which students have both poor attendance and
  overdue fees?" correlated two datasets and reported 9 records across 7
  distinct people.
- Categories stay apart. "Who missed practice this week?" gave 2 confirmed
  absences and 3 unexcused no-shows as separate groups, not one count of 5.
- Records and people are told apart: "10 attendance discrepancy records across
  8 trainees".
- EVERY question carrying a time word was refused — "I cannot tell that from
  the connected data. No date provided". The planner was never told what day
  it is. Fixed: the plan now carries today's date, the start of this week, last
  week and this month, and is told to write the range in the same shape as the
  date column's own values.
- EVERY follow-up that narrowed a set was refused — "what about their fees?",
  "Only U16". There was no way to express "these people" as a filter. Fixed:
  an "is any of" operator taking a list, with the planner told to use it for
  "them", "those" and named subsets rather than starting again.

Neither fix could be re-tested here, because the providers are out of credit.
