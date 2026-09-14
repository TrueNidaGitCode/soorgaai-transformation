# Checks on the delivered application

Harnesses for the application Eame delivers (`eame-template/`). They run
from `backend/trunida-backend`:

- `node scripts/app-checks/e2e_app.mjs` — composes the runtime as Eame does
  for a Sports Academies blueprint, boots it against the `svarg_e2e_scratch`
  database (from `.env`), and walks every door: sign-in rules, areas and
  rows, a folder import twice (the merge rule), the chat writing a record,
  the WhatsApp webhook verifying and landing a signed message as
  attendance. Prints `N/N passed`.
- `node scripts/app-checks/shot_data_cards.mjs` — renders the Data page's
  cards in headless Chrome against a stub API (at rest, the folder flow
  open, the matching, landed, the WhatsApp Business form, connected) and
  prints a probe of each; screenshots land in `scripts/.screens/`.
- `npm i --no-save xlsx && node scripts/app-checks/make_academy_xlsx.cjs` —
  writes a realistic academy folder of Excel files (nothing like the
  simulated data) under `scripts/.screens/Six Cricket Academy - Sept 2026/`
  to upload through the Documents card.

Unit tests for the same code are in `__tests__/` (`npx vitest run`).

## The QA suite

`node scripts/app-checks/qa_suite.mjs` asks a live application's chat the whole
QA suite — around ninety questions across sixteen sections, with the
follow-up sections run as real conversations — and writes `qa-report.md` (and
`qa-report.json` for the raw envelopes) beside this file.

It composes the application exactly as the live one is composed, copies the
tenant's collections into `svarg_qa_scratch`, and points the application at
the copy: **nothing here writes to what the customer is using.** It answers
through Svarg's own provider keys rather than the tenant's gateway, so the
pipeline, prompts and data are identical and only the model may differ; the
report says which.

    --only=5A,13B   just those sections
    --app=app-xyz   another deployment (matched against its Railway URL)
    --out=path.md   somewhere else

The report flags what a machine can check: a number the pipeline did not
compute, a person counted twice, a name with no record behind it, a question
that should have been refused, Svarg's machinery named, Markdown on a page
that cannot render it, a claim that something was sent. Whether an answer is
*useful* is what the report is for you to read.

## The continuous-builder cycle

`node scripts/app-checks/cycle_check.mjs` drives the loop Svarg sells — somebody
uses their application, and the application changes because of it — one stage at
a time, printing what each one did:

1. a question asked inside the application
2. a correction reported back, the way a live application reports one
3. the Learner reads the signals and updates what it understands
4. the planner decides whether that is worth building, and plans it
5. the build runs *(only with `--build`)*
6. it appears on the Blueprints page as a journey

**It never touches a real objective.** Stages 3 to 5 write to Svarg's own
database — CustomerUnderstanding, CapabilityRequest, and a build that pushes to
GitHub and redeploys a running application — so the check invents a throwaway
blueprint and deployment, runs against those, and deletes them afterwards.
Stage 5 is opt-in for the same reason: a build spends real money and takes
minutes.

    --build            also run the build
    --keep             leave the throwaway rows behind, to inspect them
    --provider=openai  when the default chain has no capacity

A stage that cannot run says so and the ones after it report the knock-on, so a
halted cycle reads as a halted cycle rather than as an empty result.
