# Next Review: a shared pull request queue that lives in the browser

**Suggested tags:** Developer Tools, Chrome Extensions, Real-Time, Amazon DynamoDB, AWS AppSync  
**Suggested excerpt:** Slack threads bury reviews. Next Review is a Manifest V3 Chrome extension that gives a team one shared pull request queue, role-based actions, and native desktop reminders.  
**Repo:** [https://github.com/soydianapinto/nextreview](https://github.com/soydianapinto/nextreview)  
**Images to upload:** `public/icon-128.png`, `public/Quick View of The Extension.png`, `public/Notification View on MacOS.png`

---

# Next Review: a shared pull request queue that lives in the browser

Pull request reviews die in chat.

Someone pastes a GitHub or GitLab link into Slack. A teammate says “I’ll look after lunch.” Lunch becomes tomorrow. The author pings again. The reviewer already reviewed something else. Nobody has a single place that answers the only question that matters: **what is waiting on me, and what is waiting on them?**

I built **Next Review** to fix that. It is a Manifest V3 Chrome extension that gives a small team one shared review queue. Authors enqueue a PR. Reviewers open it, mark it done, and step away. When the author applies feedback, they ping the queue. Reviewers get a real desktop notification, not another message lost in a channel.

The source is public: [https://github.com/soydianapinto/nextreview](https://github.com/soydianapinto/nextreview).

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

## What Next Review is

Next Review is a Chrome popup plus a background service worker.

From the popup you can:

- Paste a pull request or merge request URL, add an optional title, and enqueue it.
- Set a username that is stored in that browser.
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

The status is derived from two tables, not from a single enum that everyone overwrites:

- `prs` holds the card itself: URL, title, author, team, timestamps.
- `interactions` holds per-person review state: who marked a PR as reviewed, and when.

That split is what makes “Done Review hides it for me, but the author still sees REVIEWED” possible. It is also what makes Notify work. Notify does not spam a channel. It resets reviewer interactions back to pending, stamps `last_pinged_at`, and lets every browser decide whether to toast.

## Architecture in one picture

```
Chrome popup (React)
    |  enqueue, review, notify, delete, settings
    v
Chrome storage          Postgres (prs + interactions)
    |                   + realtime channel
    |                         ^
    v                         |
Service worker  --------------+
    chrome.alarms
    chrome.notifications
```

Three pieces do the real work.

**The popup** is optimistic. Enqueue and delete update the local list immediately. If a delete fails, the card is restored.

**The service worker** stays alive with a one-minute keepalive alarm, subscribes to queue changes, and owns two kinds of desktop toasts:

- Recurring reminders: “Time to check the queue!” when other people’s `OPEN` or `NEEDS REVIEW` cards are waiting.
- Pings: a reviewer is told a PR is ready for another look.

**The database** is the source of truth. Every loaded extension on the same project shares one team. Queue changes land through a realtime subscription, so nobody has to refresh the popup.

Reminders skip when Do Not Disturb is on. They also skip if the only waiting PRs are yours. Your own cards should not nag you to review yourself.

![Native macOS notification from the Next Review service worker](../public/Notification%20View%20on%20MacOS.png)

## Why a service worker instead of a webpage

A popup is a terrible place to put reminders. It only exists while it is open.

Manifest V3 background service workers can go idle. That is the right default for a Chrome extension, and it is also why Next Review uses `chrome.alarms` instead of `setInterval`. Alarms wake the worker. The worker then:

1. Reads username, team, reminder interval, and Do Not Disturb from Chrome storage.
2. Loads the current team queue.
3. Counts pending reviews **from other people**.
4. Creates a `chrome.notifications` toast if that count is greater than zero.

Pings use the same notification API, but they are event-driven. When an author clicks Notify, the worker sees the updated `last_pinged_at` and decides locally whether this browser should toast. The clicker is suppressed. The author is suppressed. Do Not Disturb is honored per machine, not per team.

That last detail matters. A reviewer on a focus block can silence their own browser without silencing everyone else.

## How this maps to AWS

The first version uses a hosted Postgres database with a realtime channel so a small team can try the extension quickly. The **shape** of the system is what I would keep on AWS. The services would change.

Here is the mapping I would use for a production AWS build.

| Job in Next Review | Current choice | AWS equivalent |
| --- | --- | --- |
| Shared queue of PRs | `prs` table | Amazon DynamoDB table, partition key `teamId`, sort key `prId` |
| Per-person review state | `interactions` table | DynamoDB item `teamId` / `prId#userId`, or a nearby item collection |
| Live updates in the popup | Realtime subscription | AWS AppSync GraphQL subscriptions, or API Gateway WebSockets |
| Author ping (“look again”) | Update `last_pinged_at` + reset interactions | AppSync mutation that writes DynamoDB, then a subscription fan-out |
| Recurring “check the queue” reminder | `chrome.alarms` in the browser | Keep this on the client. EventBridge Scheduler is the wrong place for a per-browser preference. |
| Desktop toast | `chrome.notifications` | Still the Chrome API. Optional Amazon SNS only if you later add email or mobile push. |
| Username and DND | `chrome.storage.local` | Stay local for a single machine. Amazon Cognito if you want the same identity on every device. |
| Auth and row access | Open policies for local testing | Amazon Cognito user pool + fine-grained DynamoDB or AppSync authorization |

The design rule I would not break: **the browser owns reminders, the backend owns truth.**

Reminders are a local preference. Five minutes on my laptop should not create a server-side schedule for the whole team. AppSync (or WebSockets) should tell every client that the queue changed. Each client should decide whether that change is worth a toast.

A tight AWS sketch:

1. Cognito authenticates the developer.
2. The popup calls AppSync to enqueue, mark reviewed, ping, or delete.
3. AppSync resolvers write DynamoDB.
4. Other browsers on the same `teamId` receive the subscription payload.
5. The service worker still uses `chrome.alarms` and `chrome.notifications`.

That is the same product. It is just a different managed backend.

If you already run the team on AWS and want to avoid a second data store, this is also a natural Amplify Gen 2 app: Data (AppSync + DynamoDB) for the queue, Auth (Cognito) for usernames that survive a laptop swap, and the Chrome extension as the only UI.

## Try it

You need Node.js, a Chromium browser, and a backend project with the `prs` and `interactions` tables.

```bash
git clone https://github.com/soydianapinto/nextreview.git
cd nextreview
npm install
cp .env.example .env.local
```

Add your project URL and anon key to `.env.local`, run the SQL in `SUPABASE_SETUP.md`, and enable replication on both tables.

```bash
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `dist/` folder.
5. Pin Next Review in the toolbar.

Give two browsers two different usernames. Enqueue from one. Review from the other. Click Done Review, then Notify, and watch the card come back as `NEEDS REVIEW`.

Grant notification permission if macOS or Chrome swallows the toasts. Do Not Disturb in the extension is separate from Do Not Disturb in the operating system.

## What I would build next

The current build assumes one team per backend project. Team ID is not a setting yet. That is fine for a squad that already shares a database. It is not fine for a company with more than one group on the same store.

The next honest upgrades are:

- Real team IDs, so two groups can share one backend without seeing each other’s cards.
- Restrictive authorization. The sample policies are for local testing only.
- A Cognito (or similar) identity, so a username is a person, not a string typed into one browser.
- The AWS data plane above, if the team already lives in an AWS account.

Until then, Next Review does one job: keep the next review in front of the people who still owe one.

If you try it, enqueue a real PR, not a sample URL. The product only clicks when two people use two usernames and the card has to travel from `OPEN` to `REVIEWED` to `NEEDS REVIEW` and back.
