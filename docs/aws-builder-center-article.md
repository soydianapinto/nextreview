# Next Review: a shared pull request queue that lives in the browser

**Suggested tags:** Developer Tools, Chrome Extensions, Real-Time, Amazon DynamoDB, AWS AppSync  
**Suggested excerpt:** Slack threads bury reviews. Next Review is a Manifest V3 Chrome extension that gives a team one shared pull request queue, a vendor-agnostic data layer, and native desktop reminders.  
**Repo:** [https://github.com/soydianapinto/nextreview](https://github.com/soydianapinto/nextreview)  
**Images to upload:** `public/icon-128.png`, `public/Quick View of The Extension.png`, `public/Notification View on MacOS.png`

---

# Next Review: a shared pull request queue that lives in the browser

Pull request reviews die in chat.

Someone pastes a GitHub or GitLab link into Slack. A teammate says “I’ll look after lunch.” Lunch becomes tomorrow. The author pings again. The reviewer already reviewed something else. Nobody has a single place that answers the only question that matters: **what is waiting on me, and what is waiting on them?**

I built **Next Review** to fix that. It is a Manifest V3 Chrome extension that gives a small team one shared review queue. Authors enqueue a PR. Reviewers open it, mark it done, and step away. When the author applies feedback, they ping the queue. Reviewers get a real desktop notification, not another message lost in a channel.

The popup never talks to a vendor SDK. It talks to a database contract. Supabase is the default adapter so a squad can try it this afternoon. The same contract is how you would plug in AppSync and DynamoDB later, without rewriting the UI.

The source is public: [https://github.com/soydianapinto/nextreview](https://github.com/soydianapinto/nextreview).

Instagram account for the tool: [https://github.com/soydianapinto/nextreview](https://www.instagram.com/nextreviewfordevs/)

## The problem I wanted to solve

Code review tools are excellent at showing a single pull request. They are weaker at showing a **team’s work in flight**.

A typical day on a small team looks like this:

- Three PRs are waiting, but they live in three different Slack threads.
- The author cannot tell who already looked.
- The reviewer cannot tell which PRs still need a first pass versus which ones need a second look after comments.
- Reminders are either never or constantly, because they live in someone’s head.

I wanted a queue that is:

- **Shared.** Everyone on the team sees the same cards.
- **Role-aware.** Authors and reviewers get different buttons.
- **Quiet by default, loud when it matters.** Recurring reminders for waiting work, plus a one-shot ping when an author is ready for another look.
- **In the browser.** No extra dashboard to remember to open.
- **Backend-agnostic.** The product is the queue. The store is a plug.

## What Next Review is

Next Review is a Chrome popup plus a background service worker.

From the popup you can:

- Paste a pull request or merge request URL (http or https only), add an optional title, and enqueue it.
- Set a username that is stored in that browser. Leave it blank and you get a name like `Developer 1`. Usernames have a length cap after trim, so a pasted paragraph does not become your identity.
- Turn on Do Not Disturb.
- Choose a reminder interval: 5, 10, 15, 30, or 60 minutes.

Each card shows:

- Title
- Author (`by {username}`)
- Created time
- Reviewers (`reviewed by {username}`)
- Status: `OPEN`, `REVIEWED`, `NEEDS REVIEW`, or `MERGED`

The popup is React and TypeScript. Vite builds it. Chrome loads the production bundle from `dist/` as an unpacked extension.

![Next Review popup with enqueue form, settings, and a queue card](../public/Quick%20View%20of%20The%20Extension.png)

## How the workflow actually feels

The happy path is six steps. That is the whole product.

1. **Enqueue.** Dev A sets a username, pastes a PR URL, and clicks Enqueue. The card appears for the whole team as `OPEN`, with `by {username}` and the created time.

2. **Review.** Dev B clicks Review. Chrome opens the PR in a new tab.

3. **Done Review.** Dev B clicks Done Review. The card disappears from Dev B’s queue. Dev A still sees it, now as `REVIEWED` with `reviewed by {Dev B}`.

4. **Notify.** Dev A applies the requested changes and clicks Notify. Only the author sees that button.

5. **The ping.** The card comes back in reviewers’ queues as `NEEDS REVIEW`. Reviewers who do not have Do Not Disturb on get a native desktop notification. The person who clicked Notify does not get that toast.

6. **Delete.** After the PR is approved and merged, Dev A clicks Delete. Only the author can remove the card for everyone.

That last point is intentional. A reviewer can hide a card from their own queue. They cannot erase it for the team.

## Role-based actions are the product

Most queue UIs show the same buttons to everyone. That creates two failure modes: authors “review” their own PR, and reviewers accidentally delete someone else’s card.

Next Review splits the actions:

- **Author:** Notify and Delete. You cannot Review or Done Review your own PR.
- **Reviewer:** Review and Done Review. You cannot Notify or Delete someone else’s PR.

The status is derived from two collections, not from a single enum that everyone overwrites:

- **PRs** hold the card itself: URL, title, author, team, timestamps.
- **Interactions** hold per-person review state: who marked a PR as reviewed, and when.

That split is what makes “Done Review hides it for me, but the author still sees REVIEWED” possible. It is also what makes Notify work. Notify does not spam a channel. It resets reviewer interactions back to pending, stamps `last_pinged_at`, and lets every browser decide whether to toast.

The UI does not know whether those collections live in Postgres, DynamoDB, or a `Map` in the current JavaScript process. It only knows the contract.

## Architecture in one picture

```
Chrome popup (React)                    Service worker
  enqueue, review, notify, delete         chrome.alarms
  username, DND, reminder interval        chrome.notifications
                 \                       /
                  v                     v
              createDatabaseService()
                          |
                          v
                DatabaseServiceContract
                 enqueue, ping, review,
                 delete, load, subscribe
                    /              \
                   v                v
         supabase (default)     memory (tests)
         Postgres + realtime    in-process maps
```

Four pieces do the real work.

**The popup** is optimistic. Enqueue and delete update the local list immediately. If a delete fails, the card is restored. It never imports a vendor client.

**The service worker** stays alive with a one-minute keepalive alarm, subscribes to queue changes, and owns two kinds of desktop toasts:

- Recurring reminders: “Time to check the queue!” when other people’s `OPEN` or `NEEDS REVIEW` cards are waiting.
- Pings: a reviewer is told a PR is ready for another look.

**The contract** is `DatabaseServiceContract` in `services/db.ts`. `createDatabaseService()` reads `VITE_DATABASE_PROVIDER` and returns an adapter. Today that is `supabase` or `memory`. Tomorrow it can be AppSync.

**The adapter** is the only place a vendor SDK is allowed. The shipped Supabase adapter owns reads, writes, row mapping, and Realtime. The memory adapter owns two maps and in-process listeners. Same methods. Same queue shape.

Reminders skip when Do Not Disturb is on. They also skip if the only waiting PRs are yours. Your own cards should not nag you to review yourself.

![Native macOS notification from the Next Review service worker](../public/Notification%20View%20on%20MacOS.png)

## Why a service worker instead of a webpage

A popup is a terrible place to put reminders. It only exists while it is open.

Manifest V3 background service workers can go idle. That is the right default for a Chrome extension, and it is also why Next Review uses `chrome.alarms` instead of `setInterval`. Alarms wake the worker. The worker then:

1. Reads username, team, reminder interval, and Do Not Disturb from Chrome storage.
2. Loads the current team queue through the same factory the popup uses.
3. Counts pending reviews **from other people**.
4. Creates a `chrome.notifications` toast if that count is greater than zero.

Pings use the same notification API, but they are event-driven. When an author clicks Notify, the worker sees the updated `last_pinged_at` and decides locally whether this browser should toast. The clicker is suppressed. The author is suppressed. Do Not Disturb is honored per machine, not per team.

That last detail matters. A reviewer on a focus block can silence their own browser without silencing everyone else.

## The database is a plug, not the product

The extension runs in the browser. It cannot open a raw Postgres, MySQL, or DynamoDB connection. The store has to be reachable over HTTPS, with CORS, and ideally with a push channel so Notify does not depend on someone refreshing the popup.

What the backend has to provide is small:

- Two collections: PRs and interactions, with the fields above.
- The six operations on the contract: enqueue, ping, mark reviewed, delete, load the team queue, subscribe to live updates.

Shipped adapters:

| Provider | `VITE_DATABASE_PROVIDER` | Use it for |
| --- | --- | --- |
| **Supabase** (default) | `supabase` | A real shared team queue. SQL, Row-Level Security, and Realtime match this product. |
| **Memory** | `memory` | Unit tests and local UI without credentials. Data lives in the current JS process and dies on reload. It does not share a queue across teammates. |

The memory adapter is how the test suite stays honest. Tests live under `tests/`, mirroring the source folders. Database tests construct a `MemoryDatabaseService` and exercise the contract. They do not call a live backend, so CI does not need a project URL or an anon key.

To add another backend, implement `DatabaseServiceContract` the same way `services/supabaseDatabase.ts` wraps Supabase, register it in `createDatabaseService()`, and point `VITE_DATABASE_PROVIDER` at that name. Every teammate needs the same backend URL and credentials, or they are not on the same team.

Skip persistent browser-only stores as a team backend. localStorage and IndexedDB do not share a queue. The memory adapter is the exception: tests and throwaway local runs, not production.

## How this maps to AWS

The first version ships a hosted Postgres adapter so a small team can try the extension quickly. The **shape** of the system is what I would keep on AWS. Because the UI already sits behind a contract, the AWS build is a new adapter, not a rewrite of the popup or the service worker.

Here is the mapping I would use for a production AWS build.

| Job in Next Review | Current choice | AWS equivalent |
| --- | --- | --- |
| Shared queue of PRs | `prs` collection (Supabase table today) | Amazon DynamoDB table, partition key `teamId`, sort key `prId` |
| Per-person review state | `interactions` collection | DynamoDB item `teamId` / `prId#userId`, or a nearby item collection |
| Live updates in the popup | Adapter `subscribeToTeamQueue` | AWS AppSync GraphQL subscriptions, or API Gateway WebSockets |
| Author ping (“look again”) | `triggerPing` on the contract | AppSync mutation that writes DynamoDB, then a subscription fan-out |
| Recurring “check the queue” reminder | `chrome.alarms` in the browser | Keep this on the client. EventBridge Scheduler is the wrong place for a per-browser preference. |
| Desktop toast | `chrome.notifications` | Still the Chrome API. Optional Amazon SNS only if you later add email or mobile push. |
| Username and DND | `chrome.storage.local` | Stay local for a single machine. Amazon Cognito if you want the same identity on every device. |
| Auth and row access | Open policies for local testing | Amazon Cognito user pool + fine-grained DynamoDB or AppSync authorization |
| Tests without a cloud account | `MemoryDatabaseService` | Keep memory. The AWS adapter gets its own contract tests against a sandbox later. |

The design rule I would not break: **the browser owns reminders, the backend owns truth.**

Reminders are a local preference. Five minutes on my laptop should not create a server-side schedule for the whole team. AppSync (or WebSockets) should tell every client that the queue changed. Each client should decide whether that change is worth a toast.

A tight AWS sketch:

1. Cognito authenticates the developer.
2. The popup still calls `createDatabaseService()`. The factory returns an AppSync adapter instead of the Supabase one.
3. That adapter’s mutations write DynamoDB.
4. Other browsers on the same `teamId` receive the subscription payload through `subscribeToTeamQueue`.
5. The service worker still uses `chrome.alarms` and `chrome.notifications`.

That is the same product. It is a different class in `services/`, plus an env var.

If you already run the team on AWS and want to avoid a second data store, this is also a natural Amplify Gen 2 app: Data (AppSync + DynamoDB) for the queue, Auth (Cognito) for usernames that survive a laptop swap, and the Chrome extension as the only UI.

## Try it

You need Node.js and a Chromium browser. For a shared team queue you also need a backend with the `prs` and `interactions` collections. For the UI alone, the memory adapter is enough.

```bash
git clone https://github.com/soydianapinto/nextreview.git
cd nextreview
npm install
cp .env.example .env.local
```

For the default Supabase adapter, add your project URL and anon key to `.env.local`, run the SQL in `SUPABASE_SETUP.md`, and enable replication on both tables. Leave `VITE_DATABASE_PROVIDER=supabase`.

To try the popup without a backend, set `VITE_DATABASE_PROVIDER=memory`. The queue lives in that page’s JavaScript process. It will not show up on a teammate’s machine.

```bash
npm test -- --run
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist/` folder.
5. Pin Next Review in the toolbar.

Give two browsers two different usernames. Enqueue from one. Review from the other. Click Done Review, then Notify, and watch the card come back as `NEEDS REVIEW`. That path only works on a shared adapter. Memory is one process.

Grant notification permission if macOS or Chrome swallows the toasts. Do Not Disturb in the extension is separate from Do Not Disturb in the operating system.

## What I would build next

The current build assumes one team per backend project. Team ID is not a setting yet. That is fine for a squad that already shares a database. It is not fine for a company with more than one group on the same store.

The next honest upgrades are:

- Real team IDs, so two groups can share one backend without seeing each other’s cards.
- Restrictive authorization. The sample policies are for local testing only.
- A Cognito (or similar) identity, so a username is a person, not a string typed into one browser.
- An AppSync + DynamoDB adapter registered next to `supabase` and `memory`, if the team already lives in an AWS account.

Until then, Next Review does one job: keep the next review in front of the people who still owe one.

If you try it, enqueue a real PR, not a sample URL. The product only clicks when two people use two usernames and the card has to travel from `OPEN` to `REVIEWED` to `NEEDS REVIEW` and back.
