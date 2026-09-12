# Self-learning capability

Svarg watches what a customer says, works out what their business needs, and
extends their application without being asked to. The customer never requests
software; they talk, and the application grows.

This document is for whoever tests it, changes it, or has to work out why it
did something.

---

## The chain

Everything hangs off one place: the end of a screen-chat reply, in
`controllers/screenChatController.js`. Nothing is awaited — the customer's
reply has already been sent — and every stage swallows its own failures.

```
customer sends a message
        │
        ▼
  reply generated and returned          ← the customer is now done waiting
        │
        ▼
  recordExchange          conversationMemoryService     both turns, one write
        │
        ▼
  learnFromConversation   customerUnderstandingService  needs ≥4 new turns
        │
        ▼
  considerCapabilities    capabilityDecisionService     4 guards, then plan
        │
        ▼
  runNextPlannedBuild     capabilityBuildService        claim, rebuild, verify
        │
        ▼
  announcePending         notificationService           tell the customer
```

Each stage only runs if the one before it did something: no new turns means no
learning pass, nothing learned means no decision, nothing decided means no
build. A quiet conversation costs nothing beyond the reply itself.

Once the application is live, the conversation that matters happens inside it
and stays there. What reaches the Learner from a live application is a fixed
list of signals -- counts by capability, votes, corrections the owner chose to
write, imports -- received at `POST /api/gateway/v1/signals` and read as a
"THE LIVE APPLICATION" block by `learnFromConversation`. Corrections and
down-votes count toward the threshold; usage counts alone never buy a model
call. See docs/connectors-in-the-application.md, Phase C.

---

## What each piece stores

| Collection | One per | Holds |
|---|---|---|
| `Conversation` | user × thread | Every turn. Screen chat is namespaced `screen:<blueprintId>:<screen>` |
| `CustomerUnderstanding` | user | Business summary, recurring tasks, preferences, needs, watermarks |
| `CapabilityRequest` | requirement × application | The decision, the plan, the build state |
| `Notification` | announcement | What the customer is told |

`CustomerUnderstanding` and `CapabilityRequest` are separate on purpose.
Observations are cheap, revisable and frequently wrong. A decision spends money
and changes a running application. Held together, a re-extraction could quietly
alter something already being built.

---

## The worked example

The brief's violin teacher, end to end.

**1. She says it.** *"I want to send today's class timing and subject to all my
students through WhatsApp."*

Recorded as a turn. Once four turns have accumulated, the Learner reads them.

**2. It becomes a need.** Extraction returns
`needs: ["send class timings and subject to students on WhatsApp"]`, merged
into her understanding with `mentions: 1`, `status: 'noticed'`.

If she says it again next week it becomes `mentions: 2` **with the original
first-seen date intact**. How long she has wanted something is the signal — a
restatement filed as a new need would lose it.

**3. It is decided on.** Four guards run, then Cob plans it: a title, a summary,
steps, and `connectorsNeeded: ["WhatsApp Business"]`. A `CapabilityRequest` is
written with `status: 'planned'`.

**4. It is built.** The request is claimed, the application is regenerated with
the new capability **and every capability it already had**, and verified.
`status: 'ready'`.

**5. She is told.**

> **WhatsApp class messages is ready**
> Send class timings to students on WhatsApp. Connect WhatsApp Business, then
> publish it to start using it.

---

## The guards

Building is unattended, so a wrong decision spends money and changes an
application somebody is relying on with nobody watching. Five things stop that.

**One decision per requirement.** `(userId, blueprintId, needKey)` is unique.
A customer who mentions WhatsApp in four messages gets one build. This is a
database constraint rather than a check, because the failure mode — building
the right thing four times — is exactly what a forgotten check produces.

**One build at a time.** The decision pass refuses to plan while a build is in
flight, and the build claims its request with a conditional update. Two
generations rewriting one authored tree is a corrupted application, not two
features.

**A monthly budget.** `MONTHLY_BUILD_BUDGET = 3` per application, counted from
decisions taken rather than builds that succeeded — a failed run still cost its
generation. If the detector turns out too eager, the damage is capped at a
number somebody chose.

**A planner that may refuse.** *"I wish students were more punctual"* is a real
frustration and not a capability. `actionable: false` is recorded as
`dismissed`, so the same need is not re-planned on every message. Anything
unreadable is also a refusal — "I could not read the plan" must never become
"build the empty plan".

**Nothing is ever lost.** Extraction merges; it never replaces. A model
returning a thin answer cannot erase a month of learning.

### Acting on a single mention

`MIN_MENTIONS = 1`, deliberately. The brief's teacher says once that she wants
to message students and gets it; waiting for a second mention would make the
product feel deaf. The protection against a passing remark is the planner's
veto and the budget, not a wait.

---

## The failure this is mostly written to prevent

Eame generates the application **whole**. The generator rewrites the authored
tree from one brief every time — there is no patching — and before this work
`buildSpec` described exactly one use case.

So a rebuild whose brief mentions only the newest requirement produces an
application that does only the newest thing. **Nothing errors.** The build
passes verification, the deploy succeeds, and the teacher opens an application
that sends WhatsApp messages and has forgotten every student she ever entered.

Under unattended building, she finds out before we do.

`capabilitiesToCarry` is the answer: every capability ever added travels with
every build, and the brief says plainly that all of them must still work and
none may be dropped to make room. It is pure, and tested harder than anything
else here, because it is the only thing standing between a customer and the
silent deletion of features they use.

For an application that has never been extended, `addedCapabilities` is empty
and the brief is byte-identical to what it was.

---

## Knobs

| Constant | Where | Default | What it changes |
|---|---|---|---|
| `LEARN_THRESHOLD` | `customerUnderstandingService` | 4 | New turns before a learning pass is worth its cost |
| `MAX_TURNS_PER_PASS` | `customerUnderstandingService` | 40 | Turns in one extraction; a backlog is caught up over several passes |
| `MIN_MENTIONS` | `capabilityDecisionService` | 1 | Mentions before a need may be acted on |
| `MONTHLY_BUILD_BUDGET` | `capabilityDecisionService` | 3 | Automatic builds per application per month |
| `MAX_OBSERVATIONS` / `MAX_NEEDS` | `customerUnderstandingService` | 60 / 40 | List ceilings; weakest signal drops first |
| `OVERLAP_THRESHOLD` | `customerUnderstandingService` | 0.8 | How alike two phrasings must be to count as one need |

### Cost

Two model calls per cycle, both labelled so they show up separately in usage
accounting rather than hiding inside chat:

- `learn:understanding` — one per learning pass, ~700 output tokens
- `learn:plan-capability` — one per decision, ~800 output tokens

Plus a full application generation per build, which is by far the expensive
part and is what the budget exists to bound.

---

## Testing it

```bash
cd backend/trunida-backend
npx vitest run __tests__/conversationMemoryService.test.js
npx vitest run __tests__/customerUnderstandingService.test.js
npx vitest run __tests__/capabilityDecisionService.test.js
npx vitest run __tests__/capabilityBuildService.test.js
```

99 tests across the four. No test here makes a real model call.

> The suite has **13 pre-existing failures in 5 unrelated files**
> (`advisorController`, `llmService`, `blueprintSuggestService`,
> `profileController`, `strategyCanvasController`). They predate this work —
> verified by running the suite at the commit before it. Do not read them as
> breakage from this feature.

### Watching it by hand

Nothing is exposed in the UI yet, so the way to watch a cycle is the database
and the logs.

```js
db.conversations.find({ domainId: /^screen:/ }).sort({ lastActivityAt: -1 })
db.customerunderstandings.findOne({ userId: ObjectId('...') })
db.capabilityrequests.find({ blueprintId: '...' }).sort({ createdAt: -1 })
db.notifications.find({ userId: ObjectId('...') }).sort({ createdAt: -1 })
```

Log lines to grep: `[learner]`, `[capability]`, `[capability-build]`,
`[notify]`, `[conversationMemory]`.

To force a pass without waiting for four turns, call
`learnFromConversation({ userId, blueprintId, force: true })`.

### Resetting between runs

A need already decided is never re-decided, which is correct and makes
re-testing the same phrase confusing. Clear the decision as well as the need:

```js
db.capabilityrequests.deleteMany({ blueprintId: '...' })
db.customerunderstandings.updateOne({ userId: ObjectId('...') }, { $set: { needs: [] } })
```

To replay a conversation from the start, also clear the watermarks —
otherwise the Learner correctly considers those turns already read:

```js
db.customerunderstandings.updateOne({ userId: ObjectId('...') }, { $set: { watermarks: [] } })
```

---

## What is not built yet

Stated plainly, because several of these matter for what testing will show.

**Publishing is not automatic.** `ready` means built and verified — *not
running*. Making it live needs the code pushed (which is what supplies the
commit a redeploy rebuilds) and then a redeploy, and the delivery step needs
`SVARG_GITHUB_TOKEN` / `SVARG_GITHUB_OWNER` and the Railway app on the org,
which are not provisioned. The notification says "publish it to start using it"
rather than claiming the capability is live, because a customer told a feature
is live who then cannot find it concludes the product is broken.

**There is no UI.** `/api/notifications` works and is scoped to the caller, but
nothing displays it — no bell, no list, no badge. During testing the
notification is visible only in the database or by calling the endpoint.

**There are no connectors.** The plan can say `connectorsNeeded:
["WhatsApp Business"]` and the generated code is told to read credentials from
environment variables and report not-connected rather than crash. Actually
connecting WhatsApp, or a payment provider for the invoicing example, is
separate work per integration.

**The only trigger is a chat message.** Nothing runs on a schedule, so a
customer who stops talking stops being learned from. There is no job runner in
the codebase; background work is fire-and-forget in-process and does not
survive a restart.

**A failed build stays failed.** It is not retried automatically, because
retrying would spend the month's budget on one requirement that does not work.
Clearing it is a manual act today.

---

## Where to look

| File | What it owns |
|---|---|
| `services/conversationMemoryService.js` | Recording turns |
| `services/customerUnderstandingService.js` | The Learner: extraction, merge, watermarks |
| `services/capabilityDecisionService.js` | The guards, and planning one capability |
| `services/capabilityBuildService.js` | Claiming, carrying capabilities, building |
| `services/notificationService.js` | Announcing, and sweeping missed announcements |
| `services/eameSpec.js` | `addedCapabilities` on the build spec |
| `services/eameCodeGenerator.js` | The brief section that says nothing may be dropped |
| `models/` | `CustomerUnderstanding`, `CapabilityRequest`, `Notification` |
