# Engineering & Project Operations Critical Data Identification

**Layer:** Engineering & Project Operations
**Extends:** Core/Critical_Data_Identification.md
**Version:** 1.0

---

# Purpose

This layer supplies project-based engineering context for identifying the
minimum data an AI initiative needs: what such an organisation records, which
system each piece lives in, how reliable it is, and which datasets are worth
asking for first.

Identification method and output structure are inherited from the Core Asset.
Written before any interview in the industry: it describes how these
organisations commonly run, and a blueprint's own evidence wins where it
disagrees.

---

## Critical Data Identification

An engineering organisation's project data is plentiful and split by owner.
Almost everything an early initiative needs is already captured, because
delivery cannot run without it, but there is no single place it comes
together. The reference organisation runs on four: a **project tracker** such
as Jira or Azure DevOps (issues, status, owner, due date, estimate and time
logged, updated by engineers), a **project plan** in MS Project or Excel
(tasks, planned start and finish, planned and actual percent complete, kept by
the programme manager), **timesheets** (hours booked against tasks, weekly),
and a **test and defect log** (validation items open against a milestone).
Customer commitments sit in email, Teams and meeting minutes, and are the
hardest to read.

The three datasets that matter first are the plan (planned against actual
progress, and the due date), the tracker (what is blocked, who owns it, hours
against estimate), and the test log (what is still open before the
milestone). The question for any first initiative is which of these share a
task or issue identifier, and which exists only as a spreadsheet one person
updates before the weekly review.

---

# Sources

Where an engineering organisation's project data actually lives, in the order
it should be connected. Read by Cob when it names each dataset's
`typicalSource`, and by Eame, which ships the application's Data page with
these sources first and only the connectors they call for.

```json sources
[
  {
    "kind": "jira",
    "label": "Your project tracker (Jira)",
    "providers": ["jira-cloud"],
    "holds": ["issues", "status", "owner", "due dates", "estimates", "time logged", "sprints", "releases"],
    "note": "Most product and embedded engineering teams run their work in Jira. Connected with an API token; every project holding issues becomes its own dataset, read hourly. Teams on Azure DevOps or another tracker export to a spreadsheet for now and use the folder."
  },
  {
    "kind": "folder",
    "label": "Your project plans and timesheets",
    "providers": ["upload"],
    "holds": ["plan", "planned progress", "actual progress", "milestones", "timesheets", "test log"],
    "note": "The schedule is usually an MS Project file or an Excel plan kept by the programme manager, with planned and actual percent complete. Export it to Excel, add the timesheet and the test or defect log, and upload the folder; each sheet is matched to what the application expects."
  }
]
```
