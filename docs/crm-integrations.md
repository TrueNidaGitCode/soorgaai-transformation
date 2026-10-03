# CRM integrations

How each CRM connects to a delivered application, written the same way for
every CRM so they can be compared line by line. When a CRM is added or a step
changes, this document changes in the same commit.

Last updated: 3 October 2026.

## At a glance

|                         | Zoho CRM                                   | LeadSquared                                        |
|-------------------------|--------------------------------------------|----------------------------------------------------|
| Where in the app        | Data → CRM card → Connect → Zoho CRM       | Data → CRM card → Connect → LeadSquared            |
| What the owner provides | Approval on Zoho's screen (one-click), or a Self Client's credentials | Access Key and Secret Key                |
| Region                  | Chosen (data centre); Zoho corrects it     | Found automatically by trying each region          |
| What is read            | Every module holding a record (up to 15)   | Leads, Activities, and every opportunity type holding a record (up to 12 types) |
| One dataset per         | Module, e.g. `Contacts (Zoho CRM)`         | Part, e.g. `Activities (LeadSquared)`              |
| Read again              | Hourly, and when the Data page is opened   | Hourly, and when the Data page is opened           |
| Reconnecting            | Replaces the connection, keeps the rows    | Replaces the connection, keeps the rows            |
| Where the credential is | Encrypted in the application's own database | Encrypted in the application's own database       |
| Proven on a real account | Yes                                       | **No**: built from the published API, not yet run against a live account |

## Main and Tenant: where each piece lives

Every CRM follows the rule in `connectors-in-the-application.md`: **Svarg
(Main) sees the shape; the delivered application (Tenant) holds the data and
the credentials.** The two CRMs differ only where their own APIs force it.

| Piece | Lives in | Zoho CRM | LeadSquared |
|---|---|---|---|
| Deciding the CRM card belongs on the Data page | Main: `sourceCatalogService.js` | A dataset's source naming Zoho or "CRM" | A source naming LeadSquared or "CRM", which gives the same card |
| Shipping the connector to the application | Main: `eameSpec.js` + `eameProjectBuilder.js` (`ALWAYS_SHIPPED`) | `zohocrm.js`, `zohoConnectController.js` | `leadsquared.js`, `leadsquaredConnectController.js` |
| Naming it to buyers | Main: `pitchDeckService.js`, admin Sales page | "Zoho CRM" | "LeadSquared" |
| The consent screen | Main brokers it: `zohoOAuth*`, `gatewayZohoController.js`, because Zoho requires an app registered by Svarg | Yes, one-click | **None**: LeadSquared's API takes keys, so there is nothing to broker |
| Typing or approving the credential | Tenant: the CRM card on the Data page | Approval at Zoho, or own Self Client | Access Key and Secret Key |
| Holding the credential | Tenant database, encrypted | Refresh token (Svarg hands it over once, then keeps none) | The two keys |
| Finding what holds records, connecting each | Tenant: `/api/connectors/<crm>/scan`, `/connect` | Modules | Leads, Activities, opportunity types |
| The records | Tenant database only | Never reach Svarg | Never reach Svarg |
| Reading again | Tenant: hourly, and on opening the Data page | Same | Same |

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
| Opportunities | `<Type> (LeadSquared)`, one per type | Status, the person, and the type's own fields under their display names |

The window is the last year. Activities and opportunities carry only a lead
id from LeadSquared, so each sync also looks up the leads, in bulk, to name
the person behind each row. Without that step, a watcher could see that
somebody went quiet but could not say who.

**The watcher this was built for.** On `Activities (LeadSquared)`,
**Gone Quiet** and **Stopped Coming** ("no activity in the last 14 days") are
offered. The date column must stay named `activity_date`: it was first named
`at`, which the watchers do not recognise as a date, so neither was offered
and every test still passed. A test now binds the real watcher catalogue to
the real shape.

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
