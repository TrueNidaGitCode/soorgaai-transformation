# What leaves the application

Every delivered application records each request it sends out, as it leaves.
The owner can read the record, export it, and check that nobody has edited
it. This is the answer to a customer asking "what of ours goes out of this
application, and to whom?", and it is evidence, not a promise.

Last updated: 10 October 2026.

## Where the owner finds it

In the application: sidebar → **Privacy** → "What leaves this application".
Only the owner sees the link. Every route behind it refuses anyone else.

| Part of the page | What it shows |
|---|---|
| Chain status | "Log intact", with the number of entries kept. If not intact, which entry broke the chain, and how |
| Three tabs | **Shared with Svarg**, **Shared with AI**, **Your own systems**, each with a count |
| Per tab | One line on what the destination is, a table per destination (what, where, requests, data sent, last), then every request, newest first |
| One request | Address, method, the file that sent it, the model that answered (for AI), the answer's status and time, headers with credentials masked, the body as sent, and its fingerprints |
| Export | CSV, one row per request, for a spreadsheet. JSON, every field including bodies, plus the chain's verdict, for an auditor |
| Period | Last 7, 30 or 90 days |

## The three destinations

| Tab | What lands there | Today that is |
|---|---|---|
| Shared with AI | A model call: through Svarg's gateway to the model provider, or straight to a provider | Answers, drafts, customer analysis (`customerAnalysis.js`), call summaries, embeddings, recordings sent for transcription |
| Shared with Svarg | Any other request to a Svarg address | Usage signals (`tenantSignals.js`), the email digest (`notifyService.js`), sign-in, the Zoho connection broker |
| Your own systems | Everything else | The customer's CRM, Meta (WhatsApp), phone provider, their database, made with their own credentials |

How a request is sorted (`classify` in `services/egressLog.js`):
- An address on a known model provider is AI.
- Any address whose host is one of the `SVARG_*` or `SELFHOSTED_*` URLs in the application's environment is Svarg, unless the path is a model endpoint (`/chat/completions`, `/embeddings`, `/audio/transcriptions`, and so on), which makes it AI.
- Everything else is the customer's own systems. Nothing is left unaccounted for.

## Why it can be trusted

**Recorded at the network, not at each call site.**
- `services/egressLog.js` is the first import in `server.js`.
- It replaces the global `fetch` (which the model SDK uses) and the `http` and `https` modules (which axios and everything else use).
- So nothing the application does reaches the network without being recorded, including code Eame generates for it later.
- A test (`__tests__/egressLog.test.js`) fails the build if the template ever opens a raw socket, starts another process or opens a WebSocket. Those are the only other ways out.

**Tamper-evident.**
- Each entry is numbered and sealed with SHA-256 over its fields. The fields include the seal of the entry before it.
- An entry edited or removed from the middle breaks the chain, and the page says which entry.
- The end-to-end check (`scripts/app-checks/e2e_app.mjs`) edits an entry directly in the database and confirms the page reports it.
- It cannot stop someone with database access deleting the newest entries. The export carries the last entry's seal, so a later copy compared with it shows any entry removed from the end.

**What it does not keep.**
- **Credentials:** authorization headers, API keys, cookies and tokens in the address are masked. The log proves a key was sent; it is not a place to steal one.
- **Recordings:** a long run of encoded binary, such as a recording, is replaced by its size. The log says a recording left without holding a second copy of it.
- **Bodies over 64 KB:** cut there, marked as such. The fingerprint is still of the whole body.

**Kept for:** bodies 30 days, entries 90 days. A body removed after 30 days keeps its fingerprint, and the chain still checks.

If recording ever fails (for example the database is unreachable), the request still goes out. The next entry records how many before it went unrecorded, and the page shows that gap.

## What changed alongside it

The **email digest now carries counts, not names**. It used to send up to six
customer names per agent through Svarg (the agent's findings, by name) so the
email could say who to call. It now says "Gone Quiet: 3 new", and Svarg's
email adds the application's address, where the names are.

## Customer names stay out of AI prompts

The first version of this log showed `customerAnalysis.js` sending the model a
customer's name with the facts of their findings: "Customer: Meera Iyer … no
visit in 14 days". The website said records never went into an AI prompt, and
the log proved otherwise. So every model call is now covered on its way out
(`services/nameGuard.js`, applied in `services/llmService.js`).

**How it works**
- Before a prompt leaves, every name, email address and phone number the application's own records hold is replaced with a stand-in, consistent within the call: "Person A", "Account A", `email-a@hidden.invalid`, `phone-A`.
- When the answer comes back, the stand-ins are replaced with the real names before anybody reads it, or before a plan the model wrote is used to filter rows.
- It's applied in `generate` and `generateRaw`, the one place every model call passes, so code generated later is covered too.
- The log records the prompt after it is covered. The **Shared with AI** tab shows "Customer: Person A".

**Where the names come from**
- The customer's name columns (the same rule `peopleService` uses).
- The other people a record names: coach, guardian, owner, assignee.
- Customer account columns (customer, account, company, school…).
- Any email address or phone number anywhere in the prompt.
- Both real and sample rows. Rebuilt when the data changes.

**Matching**
- **Full names:** matched in any case.
- **First or last name alone:** also covered. A first name two customers share gets a stand-in of its own rather than a guess.
- **One-word names and name parts:** matched as written, and skipped when they are also everyday words. So a customer called "May" is not covered, and the word "may" is never rewritten.

**What it does not cover, said plainly**
- A name that appears in no dataset, for example someone mentioned in a WhatsApp message who is not a customer.
- A call recording sent to be transcribed. It is sound, not text, and goes as it is.
- The facts themselves still go: dates, counts, statuses, the name of a batch. That is what the model needs to be useful.

**Proven by**
- `__tests__/nameGuard.test.js`.
- The end-to-end check, which reads every AI body in the log and everything that arrived at the stand-in gateway, and finds no name from the application's data.

## Where it lives

- Tenant: `services/egressLog.js` (recorder), `controllers/egressController.js` and `routes/egressRoutes.js` (`/api/egress`, owner-only), `frontend/egress.js` (the page), styles in `frontend/app.css`.
- Collection: `svarg_egress_log`, in the application's own database.
- Main: `eameProjectBuilder.js` and `eameSpec.js` ship all four to every application.
