# PolyBot — Autonomous Polymarket Trading Bot

Scans active Polymarket markets on a schedule, scores them for two kinds of
edge, and trades them — in a simulated "paper" portfolio by default, with an
opt-in path to real trading once you trust its track record. Built with
Next.js 16, Turso (libSQL), and Drizzle ORM; deployed on Vercel; scheduled by
GitHub Actions.

## Read this first: what this bot actually is

- **It is not a guaranteed money-maker.** No bot can promise "as few losses
  as possible, as much profit as possible" on prediction markets — anyone
  claiming otherwise is selling something. This bot plays two honest edges:
  1. **Arbitrage** — when a market's Yes price + No price adds up to less
    than $1, buying both sides locks in the difference as profit at
    resolution. This is genuinely low-risk when it happens, but it's rare
    and usually small.
  2. **Momentum** — a heuristic that leans into markets moving in one
    direction with enough liquidity to trade safely. This is speculative.
    It has no claim to a true-probability oracle.
- **It starts in paper mode.** All trades are simulated against real market
  prices with a virtual bankroll. Nothing real is at risk until you flip the
  switch in Settings — which only works once you've added live-trading
  credentials (see below).
- **It has a memory.** Every closed paper trade feeds a simple performance
  tracker (win rate + average return per strategy) that scales future
  position sizes up or down accordingly — see `src/lib/strategy/learning.ts`.
- **Live trading always needs a server-held private key.** There is no
  "Sign in with Polymarket" — Polymarket has no OAuth login for third-party
  apps. Wallets connect via MetaMask/WalletConnect/email-magic-link, and none
  of those let a background cron job sign trades while you're away from your
  browser. So background trading (paper or live) runs off a private key you
  set as a Vercel secret, never typed into the dashboard.

## Architecture

- **Next.js 16 app** (App Router) — dashboard UI + API routes, deployed on Vercel.
- **Turso (libSQL)** via Drizzle ORM — stores markets, price snapshots, scored
  opportunities, positions, trades, equity curve, and cycle logs.
- **`/api/cron/cycle`** — the trading loop. One call = one full cycle: scan
  markets, mark-to-market and exit existing positions, score new
  opportunities, size and open new trades within risk limits, log everything.
- **GitHub Actions** (`.github/workflows/cron.yml`) — calls that endpoint
  every 10 minutes. (Vercel's free Cron tier only fires once a day, too slow
  for this.)
- **`proxy.ts`** — password-gates the dashboard (Next.js 16 renamed
  `middleware` to `proxy`).

## One-time setup

### 1. Create the Turso database

```bash
turso db create polybot
turso db show polybot --url          # -> TURSO_DATABASE_URL
turso db tokens create polybot        # -> TURSO_AUTH_TOKEN
```

### 2. Generate secrets

```bash
openssl rand -hex 32   # -> SESSION_SECRET
openssl rand -hex 32   # -> CRON_SECRET
```

Pick your own `DASHBOARD_PASSWORD`.

### 3. Set Vercel environment variables

In the Vercel project → Settings → Environment Variables, add:

| Variable | Required | Notes |
|---|---|---|
| `TURSO_DATABASE_URL` | yes | from step 1 |
| `TURSO_AUTH_TOKEN` | yes | from step 1 |
| `DASHBOARD_PASSWORD` | yes | your dashboard login |
| `SESSION_SECRET` | yes | from step 2 |
| `CRON_SECRET` | yes | from step 2, also goes in GitHub secrets |
| `POLYMARKET_PRIVATE_KEY` | only for live trading | Polygon wallet private key |
| `POLYMARKET_FUNDER_ADDRESS` | only for live trading | your Polymarket profile/deposit address |
| `POLYMARKET_SIGNATURE_TYPE` | only for live trading | `1` for email/Magic login wallets, `0` for a browser wallet |

### 4. Apply the database schema

Run the **"Apply database migrations"** GitHub Action once (Actions tab →
select it → Run workflow). It needs `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN` as **repository secrets** (Settings → Secrets and
variables → Actions) — same values as in Vercel.

Alternatively, run it locally:

```bash
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:migrate
```

### 5. Wire up the schedule

Add two more repository secrets for GitHub Actions:

- `BOT_URL` — your deployed Vercel URL, e.g. `https://polybot-yourname.vercel.app`
- `CRON_SECRET` — same value as the Vercel env var

The `cron.yml` workflow then hits `/api/cron/cycle` every 10 minutes. You can
also trigger it manually from the Actions tab, or click **"Run scan now"** on
the dashboard's Overview page.

### 6. Deploy and connect autodeploy

Import this GitHub repo into Vercel (New Project → import
`markusmuellner13-gif/pmb`, branch `claude/polymarket-trading-bot-0t5od6` or
your default branch). Once imported, every push to the production branch
redeploys automatically — that's Vercel's standard Git integration, nothing
extra to configure.

## Using the dashboard

Sign in with `DASHBOARD_PASSWORD`. From there:

- **Overview** — equity curve, P&L, win rate, kill switch, manual scan trigger,
  a live feed of what the bot is watching and why.
- **Opportunities** — every market recently scored, its edge, and whether the
  bot acted on it.
- **Positions** — currently open paper/live positions.
- **Trades** — full closed-trade history with realized P&L.
- **Settings** — risk limits (max position size, daily loss limit, take
  profit/stop loss, liquidity/spread filters), trading mode, and your public
  wallet address (display only).

## Going live

1. Let it run in paper mode long enough to trust the win rate and P&L in the
   dashboard.
2. Add `POLYMARKET_PRIVATE_KEY` and `POLYMARKET_FUNDER_ADDRESS` as Vercel env
   vars (redeploy after adding them).
3. In Settings, switch trading mode to "Live trading" — this is blocked until
   the env vars above are present.
4. Start with a low `maxPositionUsd` and `maxDailyLossUsd`. The kill switch
   auto-engages if the daily loss limit is breached; you can also pause
   manually any time from Overview.

Known limitation: the bot does not currently place a live *sell* order to
exit a position early (take-profit/stop-loss/approaching-resolution) — it
updates its own ledger but leaves the on-chain position open. Manage early
exits on live positions manually until this is built out further. Resolved
markets settle correctly either way since Polymarket pays out the winning
side automatically on-chain.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in at least TURSO_DATABASE_URL/TOKEN, SESSION_SECRET, DASHBOARD_PASSWORD, CRON_SECRET
npm run db:migrate
npm run dev
```
