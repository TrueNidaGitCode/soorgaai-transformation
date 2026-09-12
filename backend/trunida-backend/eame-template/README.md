# __APP_NAME__

An AI application built by Svarg for one use case: yours. It is a real,
standalone, deployable project -- a Node server, a MongoDB database, and a
chat interface -- that you own outright. Svarg built it; it runs on its
own.

## How it is put together

```
server.js                  boots the process, mounts every routes/ file, seeds on first start
routes/  controllers/      the application itself, written for this use case
services/  models/         (see the file headers -- each says what it does)
scripts/seed*.js           loads the data the application was built on
data/                      the datasets: sample rows to start, yours once imported
frontend/                  the chat interface and the Data page
services/llmService.js     talks to the model, through Svarg's gateway or your own keys
```

Two kinds of file live here. The **application** -- routes, controllers,
services, models, the seed script and `frontend/app.js` -- was written for
your use case. The **runtime** -- `server.js`, the sign-in middleware, the
model client, the Data page and the connectors -- is the same in every
application Svarg builds, and is tested as one piece.

## Running it

```bash
npm install
cp .env.example .env    # fill in MONGO_URI, JWT_SECRET, and how the model is reached
npm start
```

Open the address the server prints. The page opens on a front door with a
Log in button, then a welcome, then the chat. Signing in mints a browser
session from `POST /api/session`, which is on when `APP_PUBLIC_ACCESS=true`
(hosted deployments set it). With it off, put your own sign-in in front and
set `token` in local storage -- `npm run mint-token` prints one -- and the
door will let you through.

On first start the seed script loads the sample data in `data/`, so the
application answers straight away. It says on screen that the answers come
from sample data until yours is in.

## Your data

Your records never go to Svarg. The application was built from the *shape*
of its data -- column names and a few invented rows -- and the rows
themselves come in here, inside the application, into the database that is
yours.

Open the **Data** page from the chat header. It is unlocked with the owner
key (`APP_OWNER_KEY`; on Svarg it was shown once on the go-live screen).
For each dataset the application was built on, you can:

- **Import a file** -- CSV or Excel, read in your browser, matched onto the
  dataset's columns, sent to this server and nowhere else.
- **Import a WhatsApp chat export** -- every message, or just the yes / no
  replies as attendance, per person, per day.
- **Connect a source** -- Jira, Confluence or GitHub, with an API token you
  create. The token is kept encrypted in this application's own database
  (`CONNECTOR_ENCRYPTION_KEY`), and the rows are pulled on demand or every
  hour or day, from this process. Removing a source forgets the token and
  leaves the rows.

Every row carries a `_source` column saying where it came from (`sample`,
`own`, `whatsapp`, `jira`, `confluence`, `github`), every import is logged,
and the public chat session cannot reach any of it.

## The model

`services/llmService.js` fails over through `PROVIDER_CHAIN`. On Svarg the
chain is `selfhosted` pointed at Svarg's gateway, which meters usage and
never stores a prompt. Running it yourself, set your own `GOOGLE_API_KEY`,
`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, or point `SELFHOSTED_BASE_URL` at
an Ollama-compatible endpoint. See `.env.example`.

## Deploy

Any Node host. On Railway: deploy from this repository, start command
`npm start`, and set the variables from `.env.example`. The database is any
MongoDB Atlas cluster; the free tier is enough to start.

## What is deliberately not included

No user accounts, no admin UI, no multi-tenant model. This is one
capability, built to be read, run and extended. The sign-in is a shared JWT
secret (`middleware/authMiddleware.js`); put real accounts in front before
more than one team uses it.
