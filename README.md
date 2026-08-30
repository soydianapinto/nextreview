# Next Review

Next Review is a Manifest V3 Chrome extension for sharing a pull request review queue with a team. It uses React, TypeScript, Vite, and Supabase.

## Features

- Enqueue a pull request or merge request URL.
- Add an optional human-readable title or context for each PR.
- Show the PR id and current status (`OPEN` or `MERGED`).
- Hide PRs that the current user has marked as reviewed.
- Delete PRs from the queue.
- Receive queue changes through Supabase Realtime without manually refreshing.
- Update enqueue and delete actions optimistically in the popup. Failed deletes are restored automatically.

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

The development page is useful for UI work, but opening review links in new tabs requires the loaded browser extension.

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

- `src/App.tsx`: popup UI, queue rendering, optimistic enqueue/delete behavior, and realtime queue updates.
- `services/db.ts`: Supabase reads, writes, row mapping, and Realtime subscriptions.
- `utils/storage.ts`: Chrome storage wrapper for user preferences.
- `types/`: shared TypeScript models.
- `public/manifest.json`: Manifest V3 extension configuration.
- `SUPABASE_SETUP.md`: database schema, environment variables, and Realtime setup.
