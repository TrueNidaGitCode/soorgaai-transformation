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
