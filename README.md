# Next Review

Next Review is a Manifest V3 Chrome extension for sharing a pull request review queue with a team. It uses React, TypeScript, Vite, and Supabase.

<p align="center">
  <img src="public/icon-128.png" alt="Next Review icon" width="128" height="128" />
</p>

## Screenshots

Popup: enqueue a PR, set a username and reminder interval, then review teammates’ cards.

<img src="public/Quick%20View%20of%20The%20Extension.png" alt="Quick view of the Next Review popup" width="150" />

Native macOS notification when reviews are waiting. The service worker sends these through `chrome.notifications`.

<img src="public/Notification%20View%20on%20MacOS.png" alt="Next Review desktop notification on macOS" width="160" />

## Features

- Enqueue a pull request or merge request URL with an optional title.
- Share one team queue (everyone on the same Supabase project uses the same team).
- Persist a username in the current browser. Leave it blank to get a name like `Developer 1`.
- Show author (`by {username}`), created time, reviewers (`reviewed by {username}`), and status on every card.
- Statuses: `OPEN`, `REVIEWED`, `NEEDS REVIEW`, and `MERGED`.
- Role-based actions:
  - **Author:** Notify and Delete. You cannot Review or Done Review your own PR.
  - **Reviewer:** Review and Done Review. You cannot Notify or Delete someone else’s PR.
- Hide a card for a reviewer after they click Done Review. The author still sees it as `REVIEWED`.
- Notify after you apply review feedback. The card comes back for reviewers as `NEEDS REVIEW`, and they get a desktop notification. Your own screen does not toast for a ping you just sent.
- Recurring desktop reminders (5, 10, 15, 30, or 60 minutes) for other people’s `OPEN` or `NEEDS REVIEW` cards. Your own PRs do not trigger a reminder.
- Do Not Disturb pauses reminders and ping toasts for that browser.
- Receive queue changes through Supabase Realtime without refreshing.
- Optimistic enqueue and delete in the popup. Failed deletes are restored automatically.

## Happy Path

How it works (the workflow):

1. **Enqueue (Dev A):** Set a username, paste a PR URL, and click Enqueue. The card appears for the whole team with `by {username}` and the created time.

2. **Review & Done Review (Dev B):** Click Review to open the PR. When finished, click Done Review. The card disappears from Dev B’s queue and shows `REVIEWED` plus `reviewed by {Dev B}` for the author.

3. **Notify (Dev A):** After applying the requested changes, click Notify on your own PR. Only the author sees this button.

4. **The ping (Dev B):** The card reappears in reviewers’ queues as `NEEDS REVIEW`. Reviewers who do not have Do Not Disturb on get a native desktop notification. The person who clicked Notify does not get that toast.

5. **Reminders:** If other people’s PRs are still waiting, Chrome reminds you on the interval you chose (5 minutes and up). Reminders skip when Do Not Disturb is on, and they skip if the only waiting PRs are yours.

6. **Clean up (Dev A):** After the PR is approved and merged, click Delete. Only the author can remove the card for everyone.

## Settings

| Setting | Behavior |
| --- | --- |
| Username | Saved in this browser. Used as the author on cards you enqueue and as the reviewer name on Done Review. |
| Do Not Disturb | Pauses reminder and ping notifications on this machine. |
| Remind me every X mins | 5, 10, 15, 30, or 60. Fires only when teammates have `OPEN` or `NEEDS REVIEW` PRs you have not marked reviewed. |

Team ID is not shown yet. This extension is not for more than one team, it assumes that all devs uses the same DB for the team.

## Notifications

Desktop toasts are real OS notifications from the extension service worker (`chrome.notifications`), not in-popup alerts.

- **Reminders:** “Time to check the queue!” when other people’s PRs are waiting.
- **Notify / ping:** Reviewers are told a PR is ready for another look. The clicker and the PR author are not toasted for that ping. Do Not Disturb skips both kinds of toast.

Grant Chrome notification permission for the extension if macOS or Chrome does not show them.

## Setup

### Prerequisites

- Node.js and npm
- Chrome or another Chromium-based browser
- A Supabase project

1. Install dependencies:

	```bash
	npm install
	```

2. Create `.env.local` from `.env.example` and add your Supabase project URL and anon key:

	```bash
	cp .env.example .env.local
	```

3. Run the SQL schema and policies from [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Enable Realtime replication for the `prs` and `interactions` tables.

The sample policies in that guide are suitable for local testing only. Configure restrictive Row-Level Security policies before production use.

## Development

Run the Vite development server:

```bash
npm run dev
```

The development page is useful for UI work, but opening review links in new tabs, desktop notifications, and reminder alarms require the loaded browser extension.

## Build and load the extension

Create the production bundle:

```bash
npm run build
```

The extension is generated in `dist/`. To load it in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's `dist/` directory.
5. Open the Next Review popup from the browser toolbar.

After changing source files, run `npm run build` and use **Reload** on the extension card.

If Chrome reports that it could not load `icon-128.png`, the file in `public/` is not a real PNG. Replace it with a 128×128 PNG and rebuild.

## Tests

Run the test suite with:

```bash
npm test -- --run
```

Run the production typecheck and build with:

```bash
npm run build
```

## Project structure

- `src/App.tsx`: popup UI, username and reminder settings, role-based actions, optimistic enqueue/delete, and realtime queue updates.
- `src/background.ts`: service worker for reminder alarms, ping subscriptions, and desktop notifications.
- `services/db.ts`: Supabase reads, writes, ping (reset reviewers to needs-review), row mapping, and Realtime subscriptions.
- `utils/reminders.ts`: alarm scheduling and “pending reviews from others” counting.
- `utils/ping.ts`: local ping suppression and reviewer toast helpers.
- `utils/storage.ts`: Chrome storage wrapper for user preferences, with localStorage fallback.
- `types/`: shared TypeScript models.
- `public/manifest.json`: Manifest V3 configuration (storage, notifications, alarms, icons).
- `public/icon-128.png`: toolbar and notification icon (must be a real 128×128 PNG).
- `public/Quick View of The Extension.png` and `public/Notification View on MacOS.png`: README screenshots.
- `SUPABASE_SETUP.md`: database schema, environment variables, and Realtime setup.
