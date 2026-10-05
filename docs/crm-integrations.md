# CRM and project tracker integrations

How each CRM and project tracker connects to a delivered application, written
the same way for each so they can be compared line by line. When one is added
or a step changes, this document changes in the same commit.

Last updated: 5 October 2026 (Jira added as the project tracker; Clinicea as the clinic system).

## At a glance

|                         | Zoho CRM                                   | LeadSquared                                        | Clinicea |
|-------------------------|--------------------------------------------|----------------------------------------------------|---|
| Where in the app        | Data → CRM card → Connect → Zoho CRM       | Data → CRM card → Connect → LeadSquared            | Data → CRM card → Connect → Clinicea |
| What the owner provides | Approval on Zoho's screen (one-click), or a Self Client's credentials | Access Key and Secret Key                | API key (Clinicea's paid API add-on) and a staff username and password |
| Region                  | Chosen (data centre); Zoho corrects it     | Found automatically by trying each region          | One host, `api.clinicea.com` |
| What is read            | Every module holding a record (up to 15)   | Leads, Activities, and every opportunity type holding a record (up to 12 types) | Appointments, Patients, Packages and Bills, whichever hold records |
| One dataset per         | Module, e.g. `Contacts (Zoho CRM)`         | Part, e.g. `Activities (LeadSquared)`              | Part, e.g. `Appointments (Clinicea)` |
| Read again              | Hourly, and when the Data page is opened   | Hourly, and when the Data page is opened           | Hourly, and when the Data page is opened |
| Reconnecting            | Replaces the connection, keeps the rows    | Replaces the connection, keeps the rows            | Replaces the connection, keeps the rows |
| Where the credential is | Encrypted in the application's own database | Encrypted in the application's own database       | Encrypted in the application's own database |
| Proven on a real account | Yes                                       | **No**: built from the published API, not yet run against a live account | **No**: built from the reference and a public live integration, not yet run on an account of ours |

## Main and Tenant: where each piece lives

Every CRM follows the rule in `connectors-in-the-application.md`: **Svarg
(Main) sees the shape; the delivered application (Tenant) holds the data and
the credentials.** The two CRMs differ only where their own APIs force it.

| Piece | Lives in | Zoho CRM | LeadSquared | Clinicea |
|---|---|---|---|---|
| Deciding the CRM card belongs on the Data page | Main: `sourceCatalogService.js` | A dataset's source naming Zoho or "CRM" | A source naming LeadSquared or "CRM", which gives the same card | A source naming Clinicea, or clinic or practice management |
| Shipping the connector to the application | Main: `eameSpec.js` + `eameProjectBuilder.js` (`ALWAYS_SHIPPED`) | `zohocrm.js`, `zohoConnectController.js` | `leadsquared.js`, `leadsquaredConnectController.js` | `clinicea.js`, `cliniceaConnectController.js` |
| Naming it to buyers | Main: `pitchDeckService.js`, admin Sales page | "Zoho CRM" | "LeadSquared" | "Clinicea" |
| The consent screen | Main brokers it: `zohoOAuth*`, `gatewayZohoController.js`, because Zoho requires an app registered by Svarg | Yes, one-click | **None**: LeadSquared's API takes keys, so there is nothing to broker | **None**: an API key and a staff login, so there is nothing to broker |
| Typing or approving the credential | Tenant: the CRM card on the Data page | Approval at Zoho, or own Self Client | Access Key and Secret Key | API key, staff username and password |
| Holding the credential | Tenant database, encrypted | Refresh token (Svarg hands it over once, then keeps none) | The two keys | The key and the login; the session token is kept in memory only |
| Finding what holds records, connecting each | Tenant: `/api/connectors/<crm>/scan`, `/connect` | Modules | Leads, Activities, opportunity types | Appointments, Patients, Packages, Bills |
| The records | Tenant database only | Never reach Svarg | Never reach Svarg | Never reach Svarg |
| Reading again | Tenant: hourly, and on opening the Data page | Same | Same | Same |

So Main takes part in the connection only where a CRM's consent screen
requires a registered app. A CRM that takes keys, like LeadSquared, connects
entirely inside the tenant, and Svarg never sees the keys or the records.

## The steps every CRM takes

Every CRM behind the CRM card connects in the same five steps. A new CRM
follows this order rather than inventing its own.

1. **Choose the CRM.** The CRM card asks "Which CRM do you use?" when the
   application can connect more than one.
2. **Give the credential once.** Approval on the CRM's own screen where it
   offers one; otherwise keys pasted into the card.
3. **The application finds what holds records.** One short request lists every
   part of the CRM with at least one record. Nobody is asked which module or
   which type: that is a question the software can answer, and the owner often
   cannot.
4. **Each part is connected, and counted as it lands.** One request per part:
   its own dataset from the CRM's own fields, its connection, its first read.
   One part failing does not stop the others; the receipt lists it as "Not
   read".
5. **The receipt.** "Connected", each part with its dataset, records and
   columns. Then the watchers that fit those datasets are offered on the
   Watchers page.

## Zoho CRM

### Before you start

- A Zoho CRM account with permission to read its modules.
- For the one-click path: nothing else. It is offered when Svarg's own Zoho
  connection is configured on the server.
- For the own-credentials path: a Self Client from the Zoho API console
  (api-console.zoho.com), granted `ZohoCRM.modules.READ`, with its generated
  code exchanged for a refresh token.

### Steps in the application

1. Data → CRM card → **Connect** → **Zoho CRM**.
2. Pick the data centre (the end of the address you sign in at: zoho.com,
   zoho.in, zoho.eu) and press **Connect Zoho CRM**.
3. Approve on Zoho's screen. The browser comes back to the Data page.
4. The card shows "Reading your CRM" and counts modules as they connect.
5. The receipt lists each module, its dataset, records and columns.

Own credentials instead: press **Use my own Zoho credentials**, then enter the
data centre, Client ID, client secret, refresh token and the module's API name.
This path connects one module per connection.

### What it reads

Each module's own fields become the dataset's columns; Zoho's record id is the
key. Up to 15 modules at once, in batches of five so the first contact with an
account is not rate-limited.

### What can go wrong

| What the owner sees | What it means |
|---|---|
| "invalid client" | Usually the wrong data centre, not a wrong secret |
| "Every module in this Zoho account is empty" | Nothing to read yet; add a record and connect again |
| "Zoho approved, but the connection did not finish" | The consent worked; press **Try reading the CRM again** |

### Where it lives

`eame-template/services/connectors/zohocrm.js`,
`eame-template/controllers/zohoConnectController.js`
(`/api/connectors/zoho/scan` and `/zoho/connect`),
`eame-template/services/svargZohoService.js` (one-click consent).

## LeadSquared

### Before you start

- A LeadSquared user whose keys can see the records: an admin's keys see
  every record.
- In LeadSquared: **My Profile → Settings → API and Webhooks**. Copy the
  **Access Key** and **Secret Key**.

### Steps in the application

1. Data → CRM card → **Connect** → **LeadSquared**.
2. Paste the access key and the secret key, and press **Read my LeadSquared**.
3. The card counts parts as they connect: Leads, Activities, then each
   opportunity type that holds records.
4. The receipt lists each part, its dataset, records and columns.

LeadSquared has no approval screen for its API, so the keys are step 2 where
Zoho has its consent. Everything after the keys matches Zoho's steps.

### What it reads

| Part | Dataset | What is in it |
|---|---|---|
| Leads | `Leads (LeadSquared)` | Each lead's name, phone, email, stage, owner, source, and up to 60 of the account's own fields |
| Activities | `Activities (LeadSquared)` | Every call, email and visit: the person it was with, the activity, `activity_date`, and a note where one was written |
| Opportunities | `<Type> opportunities (LeadSquared)`, one per type | Status, the person, and the type's own fields under their display names |

The window is the last year. Activities and opportunities carry only a lead
id from LeadSquared, so each sync also looks up the leads, in bulk, to name
the person behind each row. Without that step, a watcher could see that
somebody went quiet but could not say who.

**The watchers this was built for.**

- **Opportunity Gone Quiet** reads an opportunity dataset against
  `Activities (LeadSquared)`. It reports anyone whose opportunity is open
  (status none of won, lost or closed) and who has had no activity in the last
  21 days. This is The Wellness Co.'s problem as they described it. It binds
  only to a dataset whose name says opportunities, deals or pipeline, which is
  why the connector names each type "<Type> opportunities". Renaming that
  dataset would switch the watcher off.
- **Gone Quiet** and **Stopped Coming** ("no activity in the last 14 days")
  read `Activities (LeadSquared)` alone, so they do not know whether the
  opportunity is still open.
- **Asked About Upgrading** reads calls from a connected phone system, not
  LeadSquared: calls whose transcript was tagged as an upgrade request in the
  last 14 days.

The date column must stay named `activity_date`: it was first named `at`,
which the watchers do not recognise as a date, so none was offered and every
test still passed. Tests now bind the real watcher catalogue to the real
shapes (`__tests__/nextWatchers.test.js`, `__tests__/leadsquaredConnector.test.js`).

### What can go wrong

| What the owner sees | What it means |
|---|---|
| "LeadSquared refused those keys in every region" | The keys are wrong, or the user they belong to is inactive. Copy them again |
| "…no leads, activities or opportunities from the last year" | Nothing recent to read |
| "Not read: Opportunities" on the receipt | That part refused, often because opportunities are switched off; the rest connected |
| "LeadSquared is rate limiting this application" | It catches up on the next hourly read |

### Not yet proven

Every request is LeadSquared's documented one (apidocs.leadsquared.com):
`LeadsMetaData.Get`, `Leads.RecentlyModified`, `Leads/Retrieve/ByIds`,
`ProspectActivity.svc/RetrieveRecentlyModified`, `GetOpportunityTypes`,
`GetOpportunityTypeMetadata`, `Retrieve/BySearchParameter`. The tests feed it
those documented response shapes. The first real account, The Wellness Co.'s,
is what proves it. Until then, say "it connects", not "it has been proven to".

### Where it lives

`eame-template/services/connectors/leadsquared.js`,
`eame-template/controllers/leadsquaredConnectController.js`
(`/api/connectors/leadsquared/scan` and `/leadsquared/connect`).

## Clinicea (clinic management)

### Before you start

- The clinic must have Clinicea's **API add-on**. It is in no standard plan;
  the clinic buys it through its Clinicea account manager, who issues the API
  key.
- A **staff login** (username and password) whose role can see every
  appointment, patient, package and bill. Clinicea logs in with the key and
  this login and returns a session token for about an hour.

### Steps in the application

1. Data → **CRM** card → **Connect** → **Clinicea** (the card asks "Which
   system holds your customers and appointments?").
2. Enter the API key, the staff username and the staff password, and press
   **Read my Clinicea**.
3. The card counts parts as they connect: Appointments, Patients, Packages and
   Bills, whichever hold records from the last year.
4. The receipt lists each part, its dataset, records and columns.

Clinicea has no consent screen, so the key and login are step 2 where Zoho has
its consent. Everything after them matches Zoho's steps.

### What it reads

| Part | Dataset | What is in it |
|---|---|---|
| Appointments | `Appointments (Clinicea)` | Patient, `appointment_date`, `status` and the previous status, `check_in_time` (the first real arrival, waiting or engaged time), whether the service was completed and billed, the balance, service, practitioner, cancellation reason |
| Patients | `Patients (Clinicea)` | Name, mobile, email, file number, `last_visit_date`, next appointment, visits, billed and paid totals |
| Packages | `Packages (Clinicea)` | Patient, package, sold and expiry dates, `sessions_bought` and `sessions_used`, total, open or closed |
| Bills | `Bills (Clinicea)` | Patient, invoice, date, total, paid and due amounts |

**The watchers this was built for.** Vesoma described two problems, and both
are now readable where they are recorded:

- **Marked Absent, But Attended**, on Appointments: a booking whose status says
  No Show and which has a `check_in_time`. That is a treated patient left
  marked absent, about twenty a month at Vesoma. "Attended" is read from the
  check-in and never from the booking date, which every no-show has.
- **Package Over-used**, on Packages: `sessions_used` above
  `sessions_bought`, which is treatment given away past what was sold.

No Show, Gone Quiet, Stopped Coming (from `last_visit_date`) and Renewal Due
(package expiry) bind too. Three column names were chosen so the watchers read
them correctly: `check_in_time` (a date the watchers rank as a check-in),
`bill_balance` (money, never a deadline), and `first_seen` (history, so
Stopped Coming measures from the last visit). `__tests__/cliniceaConnector.test.js`
binds the real catalogue to these shapes and runs the plan on rows.

### Try it first: the sample clinic

Clinicea's API is a paid add-on, so the Clinicea form offers **Try it with a
sample clinic** before anybody buys it. It connects with no credentials and
reads `eame-template/services/cliniceaSample.js`: six months of an invented
physiotherapy practice, written as raw Clinicea records so it goes through the
real connector, datasets and watchers. Planted in it, at the rates clinics
described: 18 treated patients left marked No Show, 6 packages used past what
was sold, 9 regulars who stopped coming with a package open, packages expiring
with sessions left, and 6 real no-shows that must **not** be reported as
treated. `__tests__/cliniceaSample.test.js` runs the watchers on it and checks
those exact counts.

Every sample dataset is named `<Part> (Clinicea sample)`, and the connection
reads "Clinicea sample clinic". The moment a real Clinicea account connects,
every sample dataset is removed with its rows and connections
(`forgetSampleClinic`), so invented patients never sit beside real ones. Its
watchers move to the real records on the next check.

### Findings within minutes, for every connector

Watchers that become possible when a source connects used to start only when
the application restarted. Now every connect path (Zoho, LeadSquared, Jira,
Clinicea and the generic form) calls `requestLookNow`: the application's own
auto-start runs, then the scheduler checks at once. The receipt says so.

### What can go wrong

| What the owner sees | What it means |
|---|---|
| "Clinicea refused the API key, username or password." | One of the three is wrong, or the staff account is disabled |
| "This Clinicea login cannot read that…" | The clinic has no API add-on, or the staff role cannot see that part |
| "Not read: Bills" on the receipt | That part refused for this role; the rest connected |
| "Clinicea is rate limiting this application." | It catches up on the next hourly read |

### Not yet proven

The parts and fields come from Clinicea's Swagger reference
(`api.clinicea.com/swagger`). What the reference does not say comes from a
public integration that runs against the live API: the v2 login
(`getTokenByStaffUsernamePwd`) and appointment changes call, the token sent as
`api_key`, a new login invalidating the last (so one login is shared), the
`YYYY-MM-DDTHH:mm:ss` date (milliseconds are refused), pages of 100, and 204
for an empty page. The first real proof is Vesoma's account, once the add-on is
bought.

### Where it lives

`eame-template/services/connectors/clinicea.js` (ships to every application),
`eame-template/controllers/cliniceaConnectController.js`
(`/api/connectors/clinicea/scan` and `/clinicea/connect`).

On Main: `sourceCatalogService.js` (the CRM card for a blueprint naming
Clinicea or clinic management), `pitchDeckService.js` (its name), the admin
Sales page's connector sentence. There is no consent screen, so nothing is
brokered.

## Jira (project tracker)

### Before you start

- A Jira Cloud site, and an account that can browse the projects to be read.
- An API token: **id.atlassian.com → Security → API tokens → Create**. Copy
  it with the Atlassian email it belongs to.
- Jira ships only to an application whose industry keeps its work in a
  tracker. The blueprint's sources must say "Jira", "Atlassian", "project
  tracker" or "issue tracker" (`sourceCatalogService.js`). Where it ships, it
  is the first card on the Data page.

### Steps in the application

1. Data → **Project tracker** card → **Connect**.
2. Enter the site (`https://your-team.atlassian.net`), the Atlassian email and
   the API token, and press **Read my Jira**.
3. The card counts projects as they connect: every project the account can see
   that holds an issue, up to 15.
4. The receipt lists each project, its dataset, records and columns.

Jira's API takes a token, not a consent screen, so the token is step 2 where
Zoho has its consent. Everything after it matches Zoho's steps.

### What it reads

One dataset per project, `<Project> issues (Jira)`, keyed by the issue key:

| Column | From Jira |
|---|---|
| `key`, `summary`, `type`, `status`, `priority`, `assignee`, `labels` | The issue |
| `created`, `updated`, `resolved`, `due_date` | Its dates |
| `original_estimate_hours`, `time_spent_hours`, `remaining_hours` | Time tracking, converted from seconds |
| `sprint`, `release`, `epic`, `components` | The current sprint, fix versions, parent, components |
| `story_points`, `flagged` | Custom fields, found by name on each site |
| `reporter`, `description`, `url` | Kept, marked internal so no watcher is about them |

**The watchers it is for.** On a Jira project: **Blocked Work**, **Unassigned
Work**, **No Progress**, **Deadline Approaching**, **Promise Overdue** and
**Over Estimate** (time spent above the original estimate). **Behind Plan**
and **Milestone At Risk** need a planned-progress column, which Jira does not
have. They bind to a plan exported from MS Project or Excel and uploaded
through Documents. `__tests__/jiraForEngineering.test.js` binds the real
catalogue to the real Jira shape.

### What can go wrong

| What the owner sees | What it means |
|---|---|
| "The site address should start with https://" | The site was pasted without its scheme |
| "Jira refused the email and token." | The token is wrong, or belongs to a different email |
| "This account can see no Jira project with an issue in it yet." | The account has no browse permission, or the projects are empty |
| "Not read: <Project>" on the receipt | That project refused; the rest connected |
| `flagged` and `sprint` always blank | The site has no field by those names; the rest still reads |

### Where it lives

`eame-template/services/connectors/jira.js` (ships only where asked for),
`eame-template/controllers/jiraConnectController.js` (`/api/connectors/jira/scan`
and `/jira/connect`; ships to every application and loads the connector on
demand, so an application without Jira answers 404 rather than failing to boot).

On Main: `sourceCatalogService.js` decides whether the Jira card and module
ship. There is no consent screen, so nothing is brokered.

## Adding the next CRM

The same steps, in the same places:

1. **Connector** in `eame-template/services/connectors/<name>.js`: `kind`,
   `label`, `help`, `fields` (anything the flow writes is `hidden`),
   `provides` (only `id, name, phone, email`, leading every dataset),
   `describeShape`, `test`, `pull`, and **`listPopulated`**: what holds
   records, one record per probe, skipping a part that refuses.
2. **Connect controller** with **scan** and **connect-one**, the way
   `leadsquaredConnectController.js` does it: define the dataset from the shape, replace
   the old connection for that dataset, create it hourly, read it once.
   Mount both in `routes/connectorsRoutes.js`.
3. **Ship it**: the connector and the controller in both `FIXED_PATHS`
   (`services/eameSpec.js`) and the SOURCE map
   (`services/eameProjectBuilder.js`), and the connector in `ALWAYS_SHIPPED`.
   A file missing from either list ships to nobody.
4. **The CRM card**: add it to `CRMS` in `eame-template/frontend/data.js`, an
   `open<Name>` form, and a `read<Name>` loop ending in `connected(...)`.
5. **Tests**: the documented response shapes, `listPopulated`, the controller,
   and the watcher catalogue bound to the real shape, so a date column the
   watchers cannot see fails a test.
6. **Main knows its name**: the CRM's name in the CRM pattern in
   `sourceCatalogService.js` (so a blueprint naming it gets the card), and a
   display name in `pitchDeckService.js` (a test fails on a bare file name).
   If its API needs a consent screen with an app registered by Svarg, the
   broker belongs on Main, the way Zoho's does; if it takes keys, Main does
   nothing more.
7. **Say it**: a section in this document with the same headings, and the CRM
   named in the connector sentence on the admin Sales page (pinned by
   `frontend/__tests__/salesIcp.test.js`).
