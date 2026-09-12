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
- **Connectors** -- Jira, Confluence and GitHub by API token, each keeping
  its credentials sealed in the tenant and writing to the tenant; and a
  WhatsApp chat export (every message, or attendance replies) parsed in the
  browser like a spreadsheet.
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

Three phases, all delivered. A changes the security answer; B and C make it
whole. Each phase lists what it delivers, where it lives, and what had to be
true before it was called done.

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

**Known gaps at the time (the first is closed by B)**

- The Data page's import was file-only; nothing pulled from a live system.
- Owner access is a key, not a login. Losing the key means re-attaching the
  application to mint a new one (the hash is replaced, the old key dies).
- The mapping is by column name; a file whose columns are named differently
  needs the owner to adjust each one by hand.

### Phase B -- connectors in the application (delivered 13 September 2026)

Live sources, connected from the Data page, with credentials held only in the
tenant. Nothing in this phase touches Svarg's platform.

**Delivered**

| Piece | Where | What it does |
|---|---|---|
| Connector frame | `eame-template/services/connectorService.js` | One shape for every connector: `test`, `pull`, and the frame's own connect / sync / disconnect around them. Credentials are AES-256-GCM sealed in `svarg_connectors` with `CONNECTOR_ENCRYPTION_KEY` from the tenant's environment (Svarg mints one per application at go-live and keeps no copy; a self-hosted install sets its own; without either the key is derived from `JWT_SECRET`). A sync pulls, maps the source's fields onto the dataset's columns, and lands rows through the same path a file import uses -- `data/own/<slug>.<kind>.csv`, `_source=<kind>`, the dataset's seed called -- so every row says where it came from. |
| Jira | `services/connectors/jira.js` | Site + Atlassian email + API token + project key or JQL. Pages through `/rest/api/3/search/jql`, falling back to the older offset search. ADF descriptions become text. **Not OAuth**: the earlier OAuth module needed Svarg's own Atlassian app, which put a credential on the platform; it is removed from the template along with `JIRA_INTEGRATION.md`. |
| Confluence | `services/connectors/confluence.js` | The pages of one space (v2 API, cursor-paged), storage HTML to text. This is the application's own knowledge, in its own database -- distinct from the platform's Confluence knowledge source, which grounds the blueprint. |
| GitHub | `services/connectors/github.js` | Issues and pull requests of one repository, read-only fine-grained token. |
| WhatsApp export | `frontend/data.js` (`parseWhatsApp`, `classifyReply`) | A chat export (`.txt`, Android or iPhone shape) is parsed **in the browser** -- not a server connector, since WhatsApp has no API for a group's history. Two modes: every message, or attendance replies (short yes / no answers per person per day; announcements, questions and "yes/no" prompts are skipped). The rows go through the usual column mapping and land with `_source=whatsapp`. |
| Scheduling | `connectorService.startScheduler`, started from `server.js` | On demand, hourly or daily, from the application's own process; nothing calls back into Svarg. |
| Data page | `frontend/data.js`, `index.html`, `app.css` (`.dt-src*`, `.dt-conn*`, `.dt-form*`) | Under each dataset: its sources (kind, last sync, rows, schedule, Sync now, Remove) and chips to add one; a form per kind that tests before it keeps; the import log names the source of every landing. |
| Routes | `controllers/connectorController.js`, `routes/connectorsRoutes.js` (`/api/connectors`) | All owner-only. Secrets never appear in a response (`publicView`). |
| Seed contract | `services/eameCodeGenerator.js` | Tightened: called with a file, the seed deletes sample rows **and** rows carrying that file's `_source`, then inserts -- so a repeated sync or re-import replaces its own rows and never duplicates them, and never touches another source's. |
| Yusu | `frontend/domain/yusuScreen.js` (`renderConnectPlan`) | Under the owner key: each dataset with its way in (WhatsApp export / Jira / Confluence / GitHub / Excel or CSV / a file export), from the blueprint's `typicalSource`. |
| Shipping | `eameSpec.js` FIXED_PATHS, `eameProjectBuilder.js`, `deployTargetService.js` | Connector runtime is fixed template code in every application; the legacy manifest no longer carries the OAuth Jira module. |
| Tests | `__tests__/connectors.test.js`; `scratchpad/shot_data_b.mjs`; a full boot of the runtime against the scratch database | Sealing round-trips and refuses under another key; mapping; what is due; each connector's parsing; the catalog carries no secret; the runtime mounts `/api/connectors`, refuses the public session, lands a WhatsApp import with its `_source`. |

**Acceptance -- met**

- Credentials live only in the tenant database, sealed, and never in a
  response, a platform collection, a platform log or the platform env.
- Removing a source forgets its credentials and leaves its rows.
- A sync is idempotent by the seed contract (rows with the same `_source`
  are replaced).
- The public chat session cannot reach any connector endpoint (403 before
  the handler).
- Screen checks and the backend suite stay green.

**Open**

- The WhatsApp parser has been tested against a synthetic export in both
  shapes; the academy's real export (names replaced) is the next thing to
  run it on, and the reply vocabulary (`ABSENT`, `PRESENT` in `data.js`) is
  where their phrasing goes.
- The mapping a connector was saved with can be adjusted only by removing
  and re-adding the source; an edit-in-place is a small follow-up.

### Phase C -- learning from the tenant (delivered 13 September 2026)

The conversation inside a live application stays there. Svarg receives a
fixed, short list of signals and learns from those.

**Delivered**

| Piece | Where | What it does |
|---|---|---|
| The conversation, kept | `eame-template/services/turnLog.js`, registered in `server.js` | A middleware watches every `/api/` POST that carries `{ message }` (the contract every generated chat route follows), lets the handler answer, and records question + answer in the tenant's `svarg_conversations` after the reply has gone. Runtime routes (session, data, connectors, signals) are skipped. No generated code has to cooperate. |
| The list of what leaves | `eame-template/services/tenantSignals.js` (`SIGNALS`) | `question_asked` (capability, when), `feedback` (vote, capability, when), `correction` (the owner's words, when they chose to write them), `import` (dataset, source kind, count). `sendSignal` refuses any other kind. Batched (30 s / 40 entries) to `SVARG_SIGNALS_URL` with the gateway token; unset, nothing is sent and the application runs in full. |
| Feedback | `eame-template/frontend/feedback.js`, `controllers/signalController.js`, `routes/signalsRoutes.js` | Thumbs up / down under every answer, added by the fixed shell to whatever module wrote the turn; a thumbs down offers one line for what the answer should have been. Kept in the tenant (`svarg_feedback`, with the question and answer); only the vote and the correction travel. Which capability answered is read off the module's own request path. |
| Transparency | Data page "What Svarg is told" (`GET /api/signals`, owner) | The same list, with how many conversations and votes are kept locally, and whether reporting is on. |
| Intake | `controllers/gatewayController.js` `signals`, `routes/gatewayRoutes.js` (`POST /api/gateway/v1/signals`), `services/tenantSignalService.js`, `models/TenantSignal.js` | Authenticated by the deployment token, not subject to the spend cap. Anything off the list is refused row by row. A batch carrying a correction or a down-vote nudges the Learner (`force: true`). |
| The Learner | `services/customerUnderstandingService.js`, `models/CustomerUnderstanding.js` (`signalsReadAt`) | Reads what arrived since its watermark as a "THE LIVE APPLICATION" block alongside the platform conversation: counts by capability, votes, corrections verbatim, imports. Corrections and down-votes count toward the learning threshold; usage counts alone never buy a model call. |
| Tenant env | `services/deployTargetService.js` | `SVARG_SIGNALS_URL` set at go-live. |
| Privacy page | `frontend/privacy/privacy.html` (#applications) | States the split -- records, credentials and conversations in the application; the four signals, named, on the platform; the gateway meters and does not store prompts -- and a test holds the page's list, the application's list and the platform's accepted kinds together. |
| Tests | `__tests__/tenantSignals.test.js`; the runtime boot; `scratchpad/shot_feedback.mjs` | A real HTTP delivery carries the token and no message body; the middleware watches only the right requests; normalisation drops off-list kinds; the summary reads as intended; the Learner learns from a correction with no platform conversation and advances its watermark. |

**Acceptance -- met, with one note**

- A live application's message bodies never reach a platform collection:
  the application never sends them, and the intake would refuse them.
- The list of signals is one exported constant on each side, equal by test,
  and matches the privacy page.
- A self-hosted customer leaves `SVARG_SIGNALS_URL` unset and the
  application runs in full.
- *Rebuild against the tenant*: a re-delivery pushes to the same repository
  and Railway rebuilds with the environment untouched, so the owner key,
  the connector key and `SVARG_SIGNALS_URL` survive; rows, sealed
  credentials, conversations and feedback are in the tenant database, which
  a rebuild does not touch, and seed-on-boot never overwrites a collection
  that holds rows. Files under `data/own/` are a convenience and are not
  expected to survive a redeploy -- the next sync rewrites them. No new
  code was needed for this; it is documented here so it is checked, not
  assumed, when the delivery path changes.

**What the gateway sees, stated plainly**

Model calls pass through Svarg's gateway in transit. A prompt can contain
retrieved rows. The gateway records token counts and cost and stores
neither prompt nor reply; that is the boundary, and it is written on the
privacy page. A customer who wants no row in transit through Svarg points
`PROVIDER_CHAIN` at their own keys or endpoint.

## Order and dependencies

A came first: it is the piece that makes the security answer true, and B
and C both build on the owner session, the dataset index and the seed
contract it introduced. B and C were built after it, in that order, on the
same day; each phase's tests and the full screen-check matrix ran green
before it was committed.
