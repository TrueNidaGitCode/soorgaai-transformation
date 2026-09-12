# Connectors in the application

Decision, 13 September 2026: **Svarg never holds a customer's operational
records.** The data connects inside the application the customer owns, into
the database that is theirs, and Svarg's platform sees the shape of the data
and never the rows. Chosen over the lighter option (a browser-side sketch at
Arth) because security is the first question every customer asks, small or
large, and the right answer is structural, not a redaction pass.

## The principle

- **Svarg sees the shape.** Column names, types, a few invented example rows,
  join keys, vocabulary. That is what Cob, Arth and Eame need to design and
  build, and simulated data gives it in full. Nothing of the customer's is
  needed to build the application.
- **The application holds the data.** The delivered application runs in the
  customer's own tenant database with its own connection string. That is
  where their records live, where they connect their sources, and where the
  self-learning loop reads from. Credentials for those sources are stored
  there, encrypted, not on Svarg's platform.
- **Knowledge is not records.** A company's website pages or Confluence
  documentation, shared to ground the blueprint, are knowledge the customer
  chose to give and are redacted and kept only as long as the blueprint
  needs them. People-records -- players, parents, payments, tickets -- are
  never that, and never come to Svarg.

## What changes, where

### 1. The delivered application: a Data page

Behind the front door, for the owner only: a **Data** page listing every
dataset the application was built on, each with what it holds now (sample
rows or their own), and the ways to replace the sample with their own:

- **Import a file** -- CSV, or an Excel sheet. Columns are matched to the
  dataset's columns automatically (the sample data defines the shape), the
  owner confirms or adjusts the mapping, and the rows replace the sample.
  Every imported row carries `_source=own`; the application's "this is
  sample data" notice disappears on its own, because it already keys on
  `_source`.
- **Connectors** -- Jira first, since the template already has one; then the
  ones the reference business needs: a WhatsApp chat export (attendance
  replies), Confluence, GitHub. Each keeps its credentials in the tenant and
  writes to the tenant.
- **An import log** -- what was imported, when, by whom, how many rows.

The owner is whoever holds the **owner key**, issued once at go-live and
shown on Yusu. The public session that opens the chat cannot reach the Data
page. (A proper owner login is a later step; the key is enough to be safe and
simple now.)

This is fixed runtime in the template, not generated code -- the same for
every application -- which is what lets it be tested once and trusted.

### 2. The generator contract

Eame's brief gains three rules: the seed script must seed one dataset at a
time from a named file (`seed({ datasetName, filePath })`), must be
re-runnable, and must never overwrite rows marked `_source=own` with sample
rows. The Data page's importer calls that seed for the dataset it just
received. The verifier checks the contract like any other.

### 3. Arth

The pre-run choice becomes what it should have been:

- **Simulate your data** (recommended) -- as now.
- **Use my own data** -- no upload. It proceeds on the simulated shape and
  records the intent, so Eame builds the Data page front and centre and Yusu
  opens on "Connect your data" at go-live. The screen says, in one line, that
  their data never comes to Svarg.

The upload, Confluence and Jira connectors at Arth are removed from the data
path. Knowledge sources (Confluence, the website) stay as knowledge
grounding, labelled as such, with what is stored and for how long stated on
the screen. Reading a GitHub repository stays for product-AI engagements,
since the shape of their code is the thing being built into.

### 4. Yusu

At go-live: the owner key, shown once with a copy button, and **Connect your
data** as the first thing under the application's address.

### 5. Self-learning

Reads from the tenant only. Svarg's platform receives usage and feedback --
which questions were asked, what was corrected -- never rows.

## Security properties this gives

- Records at rest only in the tenant database; nothing in Svarg's platform
  database.
- Connector credentials encrypted in the tenant; Svarg holds none.
- The chat's public session cannot import, export or connect.
- Every import logged.
- A customer who self-hosts gets all of this on their own infrastructure
  with no change.

## Phases

**A. The foundation** -- the Data page and file import in the template, the
owner key at prepare and on Yusu, the generator contract and verifier rule,
the Arth choice and Yusu copy. Simulate-then-import is the whole customer
path. About a week.

**B. Connectors in the application** -- WhatsApp export parsing for the
reference business, Confluence, GitHub, with Jira brought up to the same
Data page. About a week.

**C. Learning from the tenant** -- the self-learning loop points at the
tenant database and the platform stops receiving anything but usage and
feedback. A few days.

Phase A is the one that changes the security answer. B and C make it whole.
