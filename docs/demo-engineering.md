# Project Orion: the engineering reverse demo

For whoever runs the first call with an engineering company. It shows the
problem on records a delivery head recognises, using the real product, and
says plainly what is not built yet.

## Before the call

1. You need an application built from an **Engineering & Project Operations**
   blueprint. Its Data page then shows **Project tracker** (Jira) first and
   **Documents** for the plan folder. Any blueprint whose objective is about
   projects slipping, milestones and delivery dates resolves to this industry.
2. Generate the files, with dates counted from today:

   ```
   cd backend/trunida-backend
   node scripts/make_orion_demo.mjs orion-demo
   ```

   This writes three sheets: `Orion project plan.csv`, `Orion validation
   log.csv` and `Orion timesheet.csv`.
3. On the application's Data page, **Documents → Connect documents**, and
   upload the `orion-demo` folder. Match each sheet to the dataset it fits.
4. On **Watchers**, check that Milestone At Risk, Behind Plan, Over Estimate,
   Blocked Work and Unassigned Work are running. They start themselves once the
   plan has rows.

## What it shows

| On the board | Watcher | From |
|---|---|---|
| Firmware integration: 71% done against 86% planned, due in ten days | Milestone At Risk | the plan |
| Firmware integration: 164 hours against an estimate of 120 | Over Estimate | the plan |
| HIL bench bring-up: blocked, 25 points behind plan | Blocked Work, Behind Plan | the plan |
| Customer FAT readiness: nobody assigned | Unassigned Work | the plan |
| Two high-severity validation items open against firmware | asked on the Ask page | the validation log |

`backend/trunida-backend/__tests__/orionDemo.test.js` runs the real watchers on
these exact files, so the table above is what the product produces, not what
it is hoped to.

## What to say, and what not to

- **Orion is invented.** Say so at the start. It is a picture of the problem,
  not a customer.
- **Open on their slip, not on Orion.** Ask "when a project starts slipping,
  how early do you know?" first, and show Orion only after they describe one of
  their own.
- **Not built, so ask it as a question:**
  - "The customer milestone was never moved while the work slipped." Nothing
    keeps the history of a date yet.
  - "Project Orion is at risk", as one finding joining the others. Findings are
    reported one by one, not joined by project yet.
- **Their own Jira** brings due dates, estimates, time spent, sprints and
  releases. Planned progress is in their plan, not in Jira, so Behind Plan and
  Milestone At Risk need the plan uploaded as well.
