# Sources in the application

Decision, 13 September 2026: **a customer connects the places their work
already lives, in the way their industry does it, and the application
carries the old way of working and the new one at the same time.** Phase 1
below is built and live; a watched Google Drive folder was deferred (folder
upload is the sync for now). The WhatsApp Business account is built in the
form that needs nothing from Svarg's side: the owner's own Meta app
(`eame-template/services/connectors/whatsapp.js`, the webhook in
`controllers/whatsappController.js`). The owner pastes the phone number id
and a permanent access token; the application shows the callback URL and
verify token to put into the Meta app; every message to the business number
arrives at the webhook, signed with the app secret when given, is kept once
in `svarg_whatsapp_inbox`, and is landed on the dataset the connection
feeds -- read as attendance replies or as messages. What the Cloud API
cannot do stays true: it does not read groups; the export remains the way
to read those. Svarg brokering Meta's Embedded Signup (no Meta app per
customer) remains the later step.

**The Data page, 13 September 2026 (after the customer's first look).**
One card per source and nothing else: for the academy, *Documents* and
*WhatsApp Business*, side by side in the design of the front door -- a lit
icon tile, what the source is, a "You can upload / You can get" list, one
button. Everything a source does happens inside its card: pressing Connect
documents opens the folder chooser in the card, the read shows a progress
bar file by file, the matching table (sheet → dataset, columns matched, key
found) is confirmed there, the landing shows its progress, and afterwards
the card carries the status -- *4 sheets read · just now*, then each sheet,
the dataset it went to, and what moved (+17, 3 changed, 3 gone from the
sheet and kept). WhatsApp Business likewise: the Meta setup lines and the
form in the card, then *Connected · last message 3 min ago* with the sync
controls. The dataset table, the imports log, "What Svarg is told" and the
rest of the page below the cards are gone; what each dataset holds is on
the tabs to the left. A form's responses sheet is one more document, so the
overlay's `form` entry was folded into the folder card (and dropped from
the Sports Academies block), and the industry block is now the whole list:
a dataset whose typicalSource says "script repository" no longer puts a
GitHub card in front of a cricket academy (`sourcesForBlueprint`).

**What Phase 1 delivered, in one paragraph.** The industry overlay carries
a `json sources` block (Sports Academies: folder, WhatsApp), read by
Cob into the dataset guidance and by Eame into `data/sources.json`; Eame
ships only the connector modules those sources call for
(`services/sourceCatalogService.js`, `buildRuntime({ connectors })`), and the
runtime discovers what it was given. The Data page opens on source cards, a
whole folder is read in the browser and matched sheet by sheet to datasets
by column fit, and re-uploading is a sync. Every landing follows one rule
(`connectorService.landRows`): a dataset has a key (declared in the index
or guessed -- an identifier, else date + person for events, else the
person), a row with a known key is an update wherever it came from, a row a
complete source no longer carries is kept and marked, and one key means one
row across sources, with provenance in `svarg_provenance`. The chat writes:
a message that starts like a record is read by the model into one row,
shown on a card, and landed as `_source=chat` on a press -- by the owner
session or a signed-in owner/admin, which is where the owner key and
sign-in meet (unlocking the Data page while signed in makes that account
the owner). The section below on the folder's Phase 2 (a watched Drive) and
on WhatsApp Business describes what is still to come; the block in the
overlay is JSON rather than the YAML sketched below, so both readers parse
it without guessing.

Follows [connectors-in-the-application.md](connectors-in-the-application.md)
(where the data lives: in the application, never on Svarg) and
[sign-in-in-the-application.md](sign-in-in-the-application.md).

---

## What is wrong today

The Data page is organised **by dataset**: five rows, each with "Import a
file" and connector chips. That is the engineer's view -- the shape the
application was built from. A cricket academy does not have five datasets;
it has **a folder of Excel sheets** and **WhatsApp groups**. Asking the
owner to work out which of their files is "Attendance Log" and import it
against that row, five times, is asking them to do the data team's job.

Two more things the dataset view cannot express:

- **Their data is random.** The folder holds the enrolment sheet, three
  years of fee sheets, a coach roster, a tournament list and a PDF of the
  ground rules. Some map onto the datasets the application was built for,
  some map onto nothing, some are two datasets in one sheet.
- **Both ways of working, at once.** The academy will keep adding a new
  student to the Excel sheet for months after the application exists -- and
  on a good day the coach will say it to the chat instead. The application
  must pick the change up from the sheet *and* accept it from the chat, and
  the record must end up the same.

## The principle

- **Sources first, datasets second.** The page opens on *where your data
  lives* -- the two or three sources this industry uses, named by the
  knowledge base, each with a status. The dataset table sits underneath as
  the record of what arrived, not as the way in.
- **The industry knows its sources.** A sports academy uses a folder of
  spreadsheets and WhatsApp; a software team uses Jira and Confluence. That
  is knowledge, and it belongs in the industry overlay, read by Cob when it
  writes the blueprint and by the application when it draws the Data page.
- **A source is watched, not imported.** Connecting a folder means the
  application keeps reading it: a row added to the enrolment sheet on
  Tuesday is in the application on Tuesday. A one-time upload is the
  fallback for a customer who cannot connect, not the model.
- **The chat can write.** Adding a student, marking a fee paid, moving a
  batch -- said in the chat, confirmed on a card, landed as a row with
  `_source=chat`, exactly as if it had come from the sheet. The old way and
  the new way meet in the same table.
- **Nothing changes about where the data lives.** Everything below runs in
  the application, against its own database, with credentials sealed there.
  Svarg brokers the OAuth handshakes it must (as it does for sign-in) and
  holds no token afterwards.

## What changes, where

### 1. The industry knowledge base names the sources

Each industry overlay's *Critical Data Identification* document gains a
machine-readable **Sources** block (the sports one already says it in
prose):

```yaml
sources:
  - kind: folder          # spreadsheets and documents in a shared folder
    label: Your folder of spreadsheets
    providers: [google-drive, onedrive, upload]
    holds: [enrolment, attendance, fees, coaches, schedule]
    note: Most academies run on one Excel sheet per concern, kept in Drive or on one laptop.
  - kind: whatsapp
    label: WhatsApp
    providers: [business-account, export]
    holds: [attendance, communication, leads]
    note: Attendance is asked and answered in per-batch groups. Groups cannot be read by the Business API; a business number changes how the academy messages parents.
```

(A form's responses sheet is a document: it goes in the folder, not on a
card of its own.)

Cob's *DATA SOURCE GUIDANCE* reads this block so `typicalSource` on each
dataset names one of these kinds; the blueprint carries a `sources` list;
Eame writes it into the application (`data/sources.json`, beside the
dataset index). The Data page draws from it. An industry with no block
falls back to what the blueprint's `typicalSource` strings say, as today.

### 2. The Data page: one card per source

```
┌ Connect your data sources ──────────────────────────────────────────────┐
│  Connections │ ┌ 📄 Documents        ● Connected ┐ ┌ 💬 WhatsApp Business ○ ┐ │
│  Students 17 │ │ 4 SHEETS READ · JUST NOW        │ │ YOU CAN GET             │ │
│  Batches  16 │ │ ✓ 3 datasets updated just now   │ │ ✓ Incoming messages     │ │
│  Roll calls  │ │   Students.xlsx → Students  +17 │ │ ✓ Attendance replies    │ │
│              │ │   Fees.xlsx → Fees  +12, 3 chg  │ │ ✓ Contact names         │ │
│              │ │ [ Upload the folder again → ]   │ │ [ Connect WhatsApp → ]  │ │
│              │ │   Add one file                  │ │   Import an exported chat│ │
│              │ └─────────────────────────────────┘ └─────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

- The **cards** come from `data/sources.json`, in the industry's order;
  `form` and `file` fold into Documents. Each has one button, and its
  whole flow -- chooser, progress, matching, landing, status -- runs inside
  the card (`frontend/data.js`: `openFlow`, `progress`, `describe`).
- What each dataset holds is on the **tabs to the left**, drawn by the
  shell from `GET /api/data/areas`; the page carries no table of its own.
- A live source the industry names (Jira, Confluence) gets a card in the
  same design; nothing is offered that the industry did not name.

### 3. The folder source

**Phase 1 -- upload a folder.** The browser can hand over a whole folder
(`<input webkitdirectory>`); every spreadsheet in it is read on the page
(the XLSX reader is already loaded) and **matched to datasets by header
similarity** with the existing `guessMapping`. The owner sees one screen:
*Students.xlsx → Enrolment (12 of 12 columns), Fees 2026.xlsx → Fees (9 of
11), Ground rules.pdf → not used*, confirms or corrects, and everything
lands in one go. Uploading the same folder again is a **sync**: rows are
matched by the dataset's key column (declared in the index; the seed
already knows it), new rows added, changed rows updated, missing rows kept
and marked. A `_file` and `_row` on every landed row say where it came
from. Nothing external is needed for this phase.

**Phase 2 -- a connected folder.** Google Drive first (the academy runs on
GPay, Gmail and Sheets), OneDrive second. The handshake is **brokered by
Svarg** exactly like sign-in: the application sends the owner to Svarg's
Google consent with `drive.readonly` and its tenant id, Svarg returns the
refresh token in a sealed assertion, the application stores it encrypted
with `CONNECTOR_ENCRYPTION_KEY` and Svarg forgets it. The connector then
runs on the existing scheduler (`connectorService.startScheduler`): list
the folder, compare `modifiedTime` against the last read, download what
changed, land it through the same matching and sync as Phase 1. **This is
what makes "they added a student to the sheet" reach the application
without anyone doing anything.** Google Sheets are exported as XLSX by the
same call, so a folder of Sheets works the same as a folder of Excel.

What it needs from outside: Google's verification of Svarg's OAuth client
for the `drive.readonly` scope (a *sensitive* scope: a review with a
privacy policy and a demo video, typically one to two weeks; until it is
granted the consent screen shows an "unverified app" warning and is
limited to 100 users).

### 4. WhatsApp

Two very different things, and the knowledge base must say which is which:

**The export** (built): a chat export from a group, parsed on the page into
attendance rows. The old way, and it stays: it is the only way to read a
*group*.

**A WhatsApp Business account** (proposed): the academy gets a business
number; the application receives every message to it through a **webhook**
(`POST /api/whatsapp/webhook`, verified with Meta's token) and can send
templates through the Cloud API (the daily "is Arjun coming today?" and the
fee reminder). Replies land as rows in real time -- no export. The
handshake (Meta *Embedded Signup*) is brokered by Svarg as a Tech Provider;
the WABA id, phone number id and access token are stored sealed in the
application.

The constraint to be honest about: **the Business API does not read
groups.** Attendance asked in the per-batch group stays in the group. A
business number means the academy asks parents *individually* (a template
to each guardian) and replies come back individually -- which is better
data (one reply per child, timestamped, no ambiguity about who "yes" was
for) and a change in how the coach works. The knowledge base should say so
in as many words, and the demo should show both.

What it needs from outside: a Meta developer app for Svarg, business
verification, and *Advanced Access* to `whatsapp_business_messaging` (Meta
app review). Per customer: a Meta Business account and a phone number not
already on personal WhatsApp.

### 5. The chat writes

Runtime, not generated code, so it is the same in every application:

- A **record intent** step in front of the generated answer path: when the
  message reads as adding or changing a record ("add Priya Nair to U14
  Tuesday batch, mother's number 98…"), the model is asked -- with the
  dataset index as the schema -- for `{dataset, action: add|update, row}`
  and nothing else.
- The chat shows a **confirmation card** with the row as it would land and
  what it would change; *Add* lands it through `landRows` with
  `_source=chat`, `_by=<signed-in user>`; nothing is written without the
  card. The same row later arriving from the sheet is matched by key and
  updated, not duplicated.
- **Who may write**: the owner, and later the admins the owner names (this
  is where sign-in and the owner key finally meet: an *owner account*, and
  an admin list).
- Every write is in the imports log like any other landing, and is a
  `correction`-class signal to Svarg (a count, never the row).

### 6. Both ways at once -- the reconciliation rule

One rule, applied to every landing whatever the source:

> A dataset has a **key** (declared in `data/index.json`; the seed already
> uses one). A landed row with a key that exists is an **update** to that
> row; without one it is an **add**; a row in the application whose key
> the source no longer has is **kept and marked** `_missingSince`, never
> deleted by a sync. The last writer wins per field, and `_source`,
> `_file`, `_by` and `_at` say who that was.

That is what lets the sheet and the chat disagree without either losing:
the coach adds a student in the chat on Monday, the admin adds the same
student to the sheet on Wednesday, the sync sees the key and updates the
one row.

## Phases and what each needs

| Phase | What | Needs from outside | Rough size |
|---|---|---|---|
| **1** | Sources block in the sports overlay; blueprint carries `sources`; Data page reorganised (source cards, dataset table with status, imports log); **folder upload** with matching and re-upload sync; the reconciliation rule with a declared key per dataset; chat writes with the confirmation card (owner only) | nothing | the largest phase, all in Svarg's own hands |
| **2** | **Google Drive** connected folder, watched by the scheduler; OneDrive after | Google OAuth verification for `drive.readonly` | connector + brokered consent, small once Phase 1's matching exists |
| **3** | **WhatsApp Business** webhook and templates, brokered Embedded Signup | Meta developer app, business verification, app review; a business number per customer | connector + webhook route + template sending; the KB and demo updated to show both ways |

Phase 1 is the one that changes what the customer sees and needs nothing
signed off outside. Phases 2 and 3 each start with a form on someone
else's website; the applications for both can be filed now and the code
built while they are pending.

## Open questions for the evaluation

- **Documents that are not spreadsheets** (the ground-rules PDF, the fee
  policy): not used in Phase 1. Later, the chat could read them as
  knowledge the way Svarg's own KB is read -- a different feature.
- **Sheets with two datasets in one tab**, and one dataset across many
  files (a fee sheet per year): the matcher handles the second (many files
  → one dataset, each file its own `_file`); the first needs a split rule
  the owner draws, and is left out of Phase 1.
- **Children's data**: the overlay already says "copy the minimum". A
  connected folder copies what is in it; the matching screen is where
  columns get left out, and the page should make that easy rather than
  possible.
