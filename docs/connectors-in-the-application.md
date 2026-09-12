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

Three phases. A changes the security answer; B and C make it whole. Each
phase lists what it delivers, where it lives, and what has to be true before
it is called done.

### Phase A -- the foundation (delivered 13 September 2026)

The whole customer path with no connector at all: simulate at Arth, go live,
import your own file into the application you own. After this phase, no
customer record can reach Svarg's platform by any path the product offers.

**Delivered**

| Piece | Where | What it does |
|---|---|---|
| Owner key | `controllers/deploymentController.js` (attach), `models/HostedDeployment.js`, `services/deployTargetService.js` | A `sok_` key is minted when the application is attached, only its SHA-256 hash is kept (`ownerKeyHash`), the plain key is returned once with the gateway token and injected into the tenant as `APP_OWNER_KEY`. |
| Owner session | `eame-template/controllers/dataController.js`, `eame-template/routes/dataRoutes.js` | The application exchanges the key (constant-time compare against the hash) for a JWT with role `owner`. `requireOwner` refuses every other session, including the public chat session. If no key is configured the endpoint says so (503) rather than failing open. |
| Data page | `eame-template/frontend/data.js`, `index.html` (`#ch-data`), `app.css` (`.dt-*`) | Reached from the header link or `#data`. A gate asks for the key; the room lists every dataset from `data/datasets.json` with its columns and whether it holds sample rows or the owner's own. |
| File import | `dataController.importDataset`, `data.js` | CSV parsed in the browser, Excel via SheetJS; columns matched to the dataset's columns by name (`guessMapping`), owner confirms; rows are written to `data/own/<slug>.csv` with `_source=own`, the seed for that one dataset is called, and the import is logged in `svarg_imports` (dataset, rows, when, by whom). Cap 50,000 rows per import; body limit 25 MB. |
| Dataset index | `services/deliveredSampleData.js` | `data/datasets.json` shipped with every application: name, slug, file, sample row count, columns. This is what the Data page and the importer key on. |
| Seed contract | `services/eameCodeGenerator.js` (brief), `services/generatedProjectVerifier.js` (completeness gate) | Every generated seed script must be `seed({ datasetName, filePath })`, re-runnable, and must never overwrite `_source=own` rows with sample rows. A project whose seed cannot be called per dataset fails the build before it is delivered. |
| Fixed runtime | `services/eameSpec.js` FIXED_PATHS, `services/eameProjectBuilder.js` | `controllers/dataController.js`, `routes/dataRoutes.js`, `frontend/data.js` are copied from the template, never generated -- tested once, the same in every application. |
| Arth | `frontend/domain/ariaScreen.js`, `domain.html` (`#aria-choice`) | Two cards: **Simulate your data** (recommended) and **Use my own data**. The second records `dataIntent: 'own'` (`PATCH /transformation-blueprint/:id/data-intent`) and then runs the same simulation, so the build has the shape it needs. One line on the card: their data never comes to Svarg. The upload card and the Confluence/Jira data connectors are gone from the data path. |
| Yusu | `frontend/domain/yusuScreen.js`, `domain.html` (`#yusu-owner`) | At go-live: the owner key shown once with Copy, a note that it will not be shown again, and **Connect your data** linking straight to the application's `#data` page. |
| Tests | `__tests__/ownerData.test.js`; `scripts/check_screens.mjs` (`aria`, `yusu`, autopilot) | Key reaches the tenant env; wrong key refused; public session refused; seed without the contract fails completeness; Arth and Yusu screens render and the autopilot hop still works. |

**Acceptance**

- A fresh run from objective to go-live never asks for, accepts, or stores a
  customer file on Svarg's platform.
- The owner key appears exactly once, on Yusu, and the hash is the only thing
  kept in `HostedDeployment`.
- In the delivered application, the Data page without an owner session is
  refused; with it, importing a CSV replaces the sample rows for that
  dataset, the "sample data" notice disappears, and `svarg_imports` has one
  row.
- A generated project whose seed ignores `datasetName` / `filePath` does not
  pass the build.
- Backend suite green (540 at delivery); every screen check green in normal,
  latency, autopilot and fixture-state modes.

**Known gaps, carried into B**

- The Data page's import is file-only; nothing pulls from a live system yet.
- Owner access is a key, not a login. Losing the key means re-attaching the
  application to mint a new one (the hash is replaced, the old key dies).
- The mapping is by column name; a file whose columns are named differently
  needs the owner to adjust each one by hand.

### Phase B -- connectors in the application (about a week)

Live sources, connected from the Data page, with credentials held only in the
tenant. Nothing in this phase touches Svarg's platform beyond a usage count.

**Deliverables**

| Piece | What it does |
|---|---|
| Connector frame | One shape for every connector in the template: `connect` (store credentials encrypted in the tenant, key from the tenant env), `test`, `sync` (pull, map onto a dataset, write `_source=<connector>`, call the seed), `disconnect`. A `svarg_connectors` collection per tenant: source, dataset, last sync, row count, status. |
| Jira | The template already has `jiraController.js`; it moves under the connector frame and becomes the first entry on the Data page instead of a page of its own. `JIRA_INTEGRATION.md` is folded into the Data page's help. |
| WhatsApp chat export | For the reference business (the cricket academy): a `.txt` export is parsed into messages (timestamp, sender, text), attendance replies matched to session dates and player names against the players dataset, and written as attendance rows. This is a file connector, not a live one -- WhatsApp has no API for a group's history -- and the Data page says so. |
| Confluence | A space or page tree pulled into a knowledge dataset (title, URL, body, last edited) for the application's own retrieval. Distinct from the platform's Confluence *knowledge source*, which grounds the blueprint and is labelled as knowledge grounding. |
| GitHub | Repository metadata, issues and pull requests into datasets, for product-AI engagements. Read-only token, tenant-held. |
| Scheduling | Each connector can sync on a schedule (hourly / daily) from the tenant's own process; nothing calls back into Svarg. |
| Yusu copy | **Connect your data** names the connectors the blueprint's datasets map to (`typicalSource` on each dataset), so the owner lands on the right one. |

**Acceptance**

- Every connector's credentials are in the tenant database, encrypted, and
  absent from the platform database, the platform logs and the platform env.
- Disconnecting a source removes its credentials and leaves the rows it
  imported, marked by `_source`.
- A sync is idempotent: running it twice does not duplicate rows.
- The public chat session cannot reach any connector endpoint.
- The WhatsApp parser is tested against a real export from the academy with
  names replaced; attendance rows match what the coach counted by hand.
- Screen checks and the backend suite stay green; a template-level test per
  connector covers connect / test / sync / disconnect.

### Phase C -- learning from the tenant (a few days)

The self-learning chain (`docs/self-learning.md`) today reads the screen-chat
conversation, which lives on Svarg's platform and is about the blueprint,
never about records. Once the application is live, the conversations that
matter happen inside the application, in the tenant. This phase points the
loop there and draws the line on what comes back.

**Deliverables**

| Piece | What it does |
|---|---|
| Tenant-side conversation store | The delivered application keeps its own chat turns in the tenant, never forwarded to the platform. |
| Usage and feedback only | What the platform receives from a live application: counts of questions asked, which capability answered, thumbs up/down, and a corrected answer when the owner gives one. No message bodies, no rows. Declared in one place (`services/tenantSignals.js`) so the list is auditable. |
| Understanding from signals | `customerUnderstandingService` learns from those signals plus the platform's own conversation, and `capabilityDecisionService` runs unchanged on the result. |
| Rebuild against the tenant | When a capability is built, the rebuilt application is deployed into the same tenant with the same owner key and connectors; imported rows and connector credentials survive the redeploy. |
| Privacy page | `privacy.html` states the split: platform holds knowledge and usage; tenant holds records, credentials and conversations. |

**Acceptance**

- A live application's message bodies never appear in a platform collection
  (`Conversation` on the platform holds only `screen:*` threads).
- The list of signals sent to the platform is a single exported constant and
  matches what the privacy page says.
- A capability rebuild does not lose imported rows, connector credentials or
  the owner key.
- A self-hosted customer can set the signal endpoint to nothing and the
  application still runs in full.

## Order and dependencies

A had to come first: it is the piece that makes the security answer true, and
B and C both build on the owner session, the dataset index and the seed
contract it introduced. B and C are independent of each other; B is the one
the reference customer will notice, so it goes next.
