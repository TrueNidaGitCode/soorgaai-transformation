# Sign-in in the application

Decision, 13 September 2026: **the people who use a delivered application
sign in with Google or with a code sent to their email, and Svarg brokers
both without ever becoming the application's identity provider.** Svarg does
the exchange with Google and the sending of codes, because those are the two
things a freshly built application at an unregistered address cannot do for
itself; the application keeps its own users and mints its own sessions, and
Svarg keeps nothing about the person.

This document is for whoever evaluates the design, tests it, changes it, or
has to work out why a sign-in failed. It follows
[connectors-in-the-application.md](connectors-in-the-application.md), whose
principle -- Svarg sees the shape, the application holds the data -- is the
one this extends to identity.

---

## The problem

Every delivered application runs at an address of its own
(`app-production-94d4.up.railway.app`, or the customer's own domain when
they self-host). Two facts about identity follow from that:

1. **Google only answers a callback registered in advance.** An OAuth client
   has a fixed list of redirect URIs, one per site, no wildcards. Registering
   every future application by hand is not a product; giving each customer
   their own Google Cloud project is a week of their time before they can
   log in.
2. **A generated application has no mail transport.** Railway blocks
   outbound SMTP; sending mail means an HTTP mail provider with a verified
   sender, which Svarg has (Brevo) and no fresh application does.

Before this change the door minted an *open session* (`POST /api/session`
with `APP_PUBLIC_ACCESS=true`): anyone with the address was in, and the
application had no idea who was talking to it. That was fine to click a
demo link and wrong for a product a coach uses in front of parents.

## Options considered

| Option | Why not |
|---|---|
| **Per-application Google client**, registered by the customer | Manual Google Cloud work per customer; the wrong first hour with the product. Still possible later for a customer who insists on their own client id. |
| **Svarg as the identity provider** (application users are Svarg users, Svarg issues their sessions) | Puts a record of every person who uses every customer's application on Svarg's platform -- exactly the kind of people-record connectors-in-the-application.md says never comes to Svarg. Also couples the application's uptime to Svarg's on every request. |
| **Each application sends its own mail** | Needs a mail provider and a verified sender per application; Svarg would be minting Brevo credentials for tenants, which is a support burden and a secret to leak. |
| **Svarg as a broker** -- Google and mail through Svarg, identity and sessions in the application | Chosen. Zero per-application setup, no person-records on Svarg, and the application answers its own requests without calling Svarg. |

## The design

### Trust between Svarg and one application

Each hosted deployment gets a **tenant auth secret**, derived rather than
stored:

```
SVARG_AUTH_SECRET = HMAC-SHA256(JWT_SECRET_of_Svarg, "svarg-tenant-auth:" + deploymentId)
```

Svarg writes it into the tenant's environment once (at Go Live, or by the
live-update sweep for applications that were live before this existed) and
recomputes it whenever it has to sign for or authenticate that application.
There is no second credential in Svarg's database and nothing new to leak
from it; rotating Svarg's `JWT_SECRET` rotates every tenant's secret, and
the next sweep writes the new value out.

The secret is used in both directions:

- **Svarg → application**: Svarg signs an *assertion* with it (see below).
- **Application → Svarg**: the application's server presents it as a bearer
  token when asking Svarg to send or check a code. Compared in constant
  time (`isTenantCall`).

Alongside it the tenant environment carries `SVARG_AUTH_URL`, the Svarg
sign-in address with the tenant id:
`https://<svarg>/api/auth/oauth/google?tenant=<deploymentId>`.

### The assertion

The one thing that crosses from Svarg to the application, on either path:

```
JWT, HS256 with SVARG_AUTH_SECRET
  iss: "svarg"
  aud: <deploymentId>          -- good for this application only
  exp: 5 minutes
  sub, email, name, picture     -- what Google said (sub/name/picture empty on the code path)
  provider: "google" | "email"
```

The application checks issuer, audience and signature (`sessionFromAssertion`
in `eame-template/controllers/authController.js`). An assertion minted for
another application, or older than five minutes, is refused at the door.

### Path 1 -- Google

```
Browser                      Application server              Svarg                          Google
  |  Continue with Google        |                              |                              |
  |  (or a @gmail address)       |                              |                              |
  |----------------------------->| GET /api/auth/google?hint=   |                              |
  |                              |  302 → SVARG_AUTH_URL        |                              |
  |                              |   &return_to=<own origin>    |                              |
  |                              |   &login_hint=<address>      |                              |
  |------------------------------------------------------------>| checks tenant exists and     |
  |                              |                              | return_to == recorded URL    |
  |                              |                              | state = JWT{nonce,tenant,    |
  |                              |                              |             returnTo}        |
  |                              |                              |  302 → accounts.google.com   |
  |------------------------------------------------------------------------------------------->|
  |                              |                              |  ...consent...               |
  |<-------------------------------------------------------------------------------------------|
  |  302 → Svarg's ONE registered callback ?code&state          |                              |
  |------------------------------------------------------------>| verifies state, exchanges    |
  |                              |                              | code, reads profile          |
  |                              |                              | NO Svarg user is created     |
  |                              |                              | assertion = sign(profile)    |
  |                              |                              |  302 → <returnTo>/api/auth/  |
  |                              |                              |        callback?assertion=   |
  |<------------------------------------------------------------|                              |
  |----------------------------->| verifies assertion           |                              |
  |                              | upserts svarg_users{email}   |                              |
  |                              | mints its own 30-day JWT     |                              |
  |                              |  302 → /#token=<jwt>         |                              |
  |<-----------------------------|                              |                              |
  |  shell stores the token,     |                              |                              |
  |  clears the fragment, opens  |                              |                              |
  |  the welcome                 |                              |                              |
```

Points to note when evaluating:

- Svarg's `initiateGoogle` and `googleCallback` are the same handlers Svarg's
  own door uses. The tenant case is a branch inside them, keyed on the
  signed OAuth `state`, which carries `{tenant, returnTo}` in addition to
  the CSRF nonce. Because the state is signed with Svarg's `JWT_SECRET`,
  neither the tenant nor the return address can be swapped on the way
  through Google.
- **`return_to` is checked before Google is involved**, against the address
  Svarg recorded for the deployment (`HostedDeployment.railway.url`), by
  origin. A link that names any other origin is refused with a message, not
  redirected. This is what stops Svarg's sign-in being used to land a Google
  profile somewhere of the attacker's choosing (`returnOrigin`).
- The session token goes back in the **URL fragment**, not the query, so it
  never appears in access logs; the shell reads it and rewrites the address
  immediately.
- An error on the way (cancelled consent, unknown tenant, Google not
  configured) is sent to the *application's* callback as `?error=`, which the
  door shows in the sign-in panel. It is never sent to Svarg's own
  `oauth-callback.html`.

### Path 2 -- a code by email

For any address that is not a Google one (and for anyone who prefers it):

```
Browser                      Application server              Svarg
  |  address, Continue           |                              |
  |----------------------------->| POST /api/auth/otp/request   |
  |                              |----------------------------->| POST /api/auth/oauth/tenant/otp/request
  |                              |  Authorization: Bearer       |   { tenant, email }
  |                              |    SVARG_AUTH_SECRET         | isTenantCall? → 401 if not
  |                              |                              | EmailOtp upsert, key "<tenantId>:<email>"
  |                              |                              | sendOtpEmail(email, code, { brand: appName })
  |                              |<-----------------------------| { ok, delivery }
  |<-----------------------------|                              |
  |  code, Log in                |                              |
  |----------------------------->| POST /api/auth/otp/verify    |
  |                              |----------------------------->| .../tenant/otp/verify { tenant, email, code }
  |                              |                              | hash compare, attempts, expiry, delete on success
  |                              |<-----------------------------| { assertion }   (provider: "email")
  |                              | sessionFromAssertion → same  |
  |                              | path as Google               |
  |<-----------------------------| { token }                    |
  |  shell stores it, welcome    |                              |
```

Points to note:

- **The browser never talks to Svarg** on this path. Svarg's CORS policy
  would refuse it anyway; more importantly the tenant id and secret stay on
  the application's server.
- Codes reuse Svarg's own `EmailOtp` collection and rules (10-minute
  expiry, 60-second resend gap, 5 wrong attempts, SHA-256 hash of the code
  only, TTL index), but are **keyed to the tenant**: `"<deploymentId>:<email>"`.
  The same person signing in to Svarg and to a customer's application holds
  two codes, not one overwriting the other.
- The mail is sent from Svarg's verified Brevo sender, **under the
  application's name**: subject "*123456 is your Six Cricket sign-in code*",
  the application's name as the heading. The name comes from the blueprint's
  `appName`, so it is the organisation's name (see appNameService). There is
  no per-customer sender domain; that would be a Brevo verified-sender step
  per customer and is not built.
- Unconfigured mail is refused, not faked (`503`, "continue with Google"),
  the same rule Svarg's own door follows, unless `ALLOW_CONSOLE_OTP=1`.

### The door

`eame-template/frontend/index.html` (fixed runtime, same in every application):

- **Log in** (top right) opens the sign-in panel. **Continue** (hero) opens
  the welcome when someone is signed in and the same panel when nobody is.
- The panel asks for an **email address first**, the way Svarg's own door
  does. `@gmail.com` / `@googlemail.com` → Google with `login_hint`; anything
  else → the code step (with "Use a different address" and "Send the code
  again"). **Continue with Google** sits below an "or" for anyone who prefers
  it. What is offered comes from `GET /api/auth/providers`
  (`{google, email, public}`), so an install with no Svarg behind it shows
  neither and falls back to the open session.
- On load, a stored token is checked with `GET /api/auth/me`. A token nobody
  answers for -- expired, or an open session from before sign-in existed --
  is dropped so the door says Log in rather than opening onto a chat that
  answers every message with 401. When the server cannot be reached the
  remembered name is kept rather than logging the person out.
- Signed in, the top right shows picture-or-initial, first name and **Log
  out**; the chat header shows the first name. Log out forgets the token and
  returns to the door.
- `config.js`'s fetch wrapper attaches the stored token to every same-origin
  `/api/` call and no longer mints an open session over a stored token; the
  providers and OTP endpoints are excluded from session minting because
  they are called before anyone is signed in.

### What each side stores

| | Svarg platform | The application (tenant database) |
|---|---|---|
| Who the users are | **Nothing.** No `User` is created for a tenant's person; the Google profile exists for the length of one redirect. | `svarg_users`: `{ email, name, picture, provider, providerId, role: 'user', firstSeenAt, lastSeenAt }` |
| Sessions | none | its own JWT (`userId`, `role`, `email`, `name`), 30 days, signed with the tenant's own `JWT_SECRET` |
| Codes in flight | `EmailOtp` row keyed `<tenantId>:<email>`, hash only, TTL-deleted, deleted on use | none |
| Secrets | recomputes the tenant secret from `JWT_SECRET`; stores nothing extra | `SVARG_AUTH_SECRET`, `SVARG_AUTH_URL` in the environment |
| Google credentials | Svarg's one OAuth client | none |

The **owner key** (`APP_OWNER_KEY`, `POST /api/data/owner-session`) is
unchanged and separate: it opens the Data page whoever is signed in. It is
"are you the owner", not "who are you", and a later step could tie the two
(an owner *account* rather than an owner *key*).

### Where the runtime is, and what is fixed

Both files are on Eame's fixed-path list (`services/eameSpec.js`
`FIXED_PATHS`) and composed from the template by `eameProjectBuilder`, so
the model that writes an application cannot replace them and every build
ships the same door:

| File | Role |
|---|---|
| `eame-template/controllers/authController.js` | `providers`, `google`, `callback`, `otpRequest`, `otpVerify`, `me`; `sessionFromAssertion` |
| `eame-template/routes/authRoutes.js` | mounted at `/api/auth` by route discovery |
| `eame-template/server.js` | `trust proxy` (so the return address is https behind Railway); `/api/session` refuses with 403 when `SVARG_AUTH_URL`+`SVARG_AUTH_SECRET` are set, so the open session is no longer a way around the door |
| `eame-template/frontend/index.html`, `app.css`, `config.js` | the door, the panel, the token handling |
| `services/tenantAuthService.js` (Svarg) | `tenantAuthSecret`, `tenantAuthEnv`, `returnOrigin`, `signAssertion`, `isTenantCall`, `requestTenantOtp`, `verifyTenantOtp` |
| `controllers/oauthController.js` (Svarg) | tenant branch of Google initiate/callback; `tenantOtpRequest`, `tenantOtpVerify` |
| `routes/oauthRoutes.js` (Svarg) | `POST /api/auth/oauth/tenant/otp/{request,verify}` |
| `services/deployTargetService.js` `buildTenantEnv` | writes `SVARG_AUTH_URL` / `SVARG_AUTH_SECRET` at Go Live |
| `services/liveUpdateService.js` | writes them on the sweep, for applications live before this existed |
| `services/mailService.js` | `sendOtpEmail(to, code, { brand })` |

Tests: `__tests__/tenantAuth.test.js` -- secret derivation, environment,
return-address check, assertion audience, providers, Google hint, the
callback turning an assertion into a session (and refusing another
tenant's), the code path end to end with a mocked mail transport, and the
application's verify proxy carrying the tenant bearer.

## Security properties this gives

- Google is trusted through **one** registered client and callback, Svarg's,
  for every application; no customer touches a Google console.
- **No person-record on Svarg.** Svarg cannot list who uses a customer's
  application; the application can.
- A **compromised application** holds only its own tenant secret. With it an
  attacker can forge sign-ins *into that application* and ask Svarg to email
  codes *for that tenant* (rate-limited per address) -- nothing about
  another tenant, nothing about Svarg's users, no LLM spend (that is the
  separate gateway token).
- **Svarg cannot be used as an open redirector**: the return address is
  checked against the deployment's recorded URL before Google is involved,
  and the checked value travels inside the signed state.
- **Replay** of an assertion is bounded by its five-minute life and its
  audience; a captured one is worthless for any other application.
- The **open session is closed** the moment sign-in is configured, so a
  direct `POST /api/session` no longer yields a usable token on a hosted
  application.
- A self-hosting customer can leave `SVARG_AUTH_*` out and put their own
  sign-in in front, exactly as before; or keep them and use Svarg's
  brokering from their own domain, provided Svarg records that domain as
  the deployment's URL (`APP_PUBLIC_URL` on the application side tells it
  which address to send back to).

## Known limits and what would come next

- **Mail comes from Svarg's sender.** The subject and heading carry the
  application's name; the From address is Svarg's. A customer wanting mail
  from their own domain needs a verified sender per customer -- not built.
- **Everyone who can sign in is a `user`.** There is no invitation list, no
  domain restriction ("only @sixcricket.in"), no roles beyond the owner key.
  The natural next step is an allow-list the owner manages on the Data page,
  with an "anyone with the link" default for the demo period.
- **The owner key and the signed-in person are not linked.** An owner account
  (first signed-in user becomes owner, or the key is redeemed once against an
  account) would let the Data page and, later, an admin area key off the
  session instead of a pasted key.
- **Rotating Svarg's `JWT_SECRET`** invalidates every tenant secret until the
  next sweep rewrites the environments (45 s after Svarg boots, then every
  6 h). Sign-in on a live application would fail in that window. Acceptable
  for now; a two-key rollover would remove it.
- **`return_to` must match `HostedDeployment.railway.url`.** A customer
  fronting their application with a custom domain needs that URL updated on
  the deployment record, or sign-in is refused as "not at the address Svarg
  has for it". There is no screen for that yet.
- **Microsoft sign-in** exists on Svarg's own door in code only and is not
  configured in production; it is not brokered for tenants.
