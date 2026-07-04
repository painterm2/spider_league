# 🕷️ Spider League

Submit a photo of a spider. The AI judge identifies it, gives it a fight-night
nickname, scores it on **Beauty** and **Power** (0–100), and writes a scouting
report. Sign it to your team, climb the leaderboard, and download a share card
for the group chat.

## Quick start

```bash
npm install
cp .env.example .env       # add your Anthropic API key
npm start                  # http://localhost:3000
```

Get an API key at https://platform.claude.com. Without a key the site runs in
**demo mode** — the whole flow works, but verdicts are canned and clearly
labeled, so you can try it before wiring up the key.

## How it works

- **Judging** — hit "Add to Your Team" and upload a photo. It goes to Claude
  (vision + structured JSON output), which returns two voices: the **chief
  arachnologist** (species ID, confidence, 0–100 Beauty/Power scores with
  morphological justifications, a formal specimen evaluation, a fun fact, and
  a real danger rating) and the **hype correspondent** (a ring nickname and a
  headline quote from a man who is far too emotionally invested in this
  spider). Non-spiders (harvestmen, ticks, raisins) are identified and
  rejected with style.
- **Teams** — after the verdict you sign the spider to a team. Teams are
  created on first use; the Teams tab shows every club's full roster.
- **Leaderboard** — teams ranked by combined Beauty + Power across their
  roster, plus "Most Beautiful" and "Most Powerful" individual titles.
- **Share card** — a 1080×1350 PNG scouting report rendered in the browser.
  Download it, or use the native share button on mobile to drop it straight
  into the group chat.
- **Live reaction** — drop a photo of someone looking horrified at
  `public/img/scared.jpg` and it appears (on the verdict screen and the share
  card) whenever a spider rates Power ≥ 80 or carries medically significant
  venom.
- **Merch** — set `PRINTFUL_API_KEY` to a Printful private token and the
  Merch tab lists your synced store products with prices. Without it, a
  coming-soon rack is shown.

## Storage

Everything lives in `./data/` as plain files — `league.json` for teams and
spiders, `uploads/` for photos. Back it up by copying the folder. Set
`SPIDER_DATA_DIR` to move it.

## API

| Route | What it does |
|---|---|
| `POST /api/analyze` | `{image: <dataURL>, submitter}` → verdict + a save token |
| `POST /api/spiders` | `{token, teamName}` → signs the judged spider to a team |
| `GET /api/league` | Standings, rosters, and all spiders |
| `GET /api/config` | Demo-mode flag + existing team names |
| `GET /api/merch` | Printful store products (cached 5 min), or `configured: false` |

## Deploying for your friends

### Vercel (recommended — the repo is already set up for it)

The Express app runs as a Vercel serverless function (`api/index.js` +
`vercel.json`), and spiders/photos are stored in **Vercel Blob** instead of
the local disk. Three steps in the Vercel dashboard:

1. **Import the repo** (if you haven't already) and make sure the production
   branch is the one with this code.
2. **Storage → Create → Blob**, and connect the store to this project. This
   injects `BLOB_READ_WRITE_TOKEN` automatically. Without it the site loads
   but shows a banner and refuses to save spiders.
3. **Settings → Environment Variables →** add `ANTHROPIC_API_KEY` (and
   optionally `PRINTFUL_API_KEY`), then **redeploy**.

Judging calls can take ~20–30 seconds; `vercel.json` sets the function
timeout to 60s, which is the Hobby-plan maximum.

### Any Node host with a disk

Railway, Render, Fly.io, or a Raspberry Pi also work: `npm start` runs a
plain Express server and everything lives in `./data/` as files. Set
`ANTHROPIC_API_KEY`, expose the port, and make sure `./data` survives
restarts.

There are no accounts — anyone with the link can submit, which for a group
chat is the point.
