# Launch Radar — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mebiuss00/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mebiuss00/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's token-radar-01 bounty, second build. It reads one frozen
DefiLlama snapshot of the protocol universe, works out which protocols record no token yet and
are not a wrapped, staked, bridged or exchange product of a token that already trades, prices
each one at what a launch would be worth if its record froze today — with the evidence behind
every price graded and printed — and hands in a dashboard: a radar scope of the whole board, a
farm-first strip of the most valuable early rows, the ranked board with filters, a detail view
per protocol with its pricing, its trading peers and its farm plan, the already-trading
protocols set apart, every set-aside protocol listed with its reason, and the model itself.

## The model (peer-anchor-2)

Implied value is anchored to the snapshot's own market, never to a flat guess:

- Every protocol that already trades contributes one observation: its market cap over its TVL,
  **winsorised into [0.02, 5]** so one wild peer cannot bend a category.
- A category's **multiple** is the median of those observations for the category, shrunk toward
  the global median by 4 phantom peers and clamped to [0.04, 2.5].
- **Growth** is asymmetric: a rising week is credited at 0.7% of value per point (capped at
  +50), a falling week charged at 1% per point (floored at −50) — inflow is cheap to fake for
  a week, outflow is not. **Maturity** saturates: 0.80 at birth rising toward 1.20 on a
  900-day curve; a protocol whose start date is unlisted is aged at the snapshot's own median
  tokenless age (513 days on this snapshot), computed from the file, not hardcoded.
- Every price carries an **evidence grade** — A (eight or more trading peers whose ratios
  agree), B (a priced category), C (thin evidence, including every price resting on one or
  two peers) — from the peer count and the dispersion of the peer ratios.

    implied = round( tvl x multiple(category) x growth x maturity )

One function prices every row; no protocol name is special-cased. The dashboard recomputes
each row in the page and shows the same number, and its model panel prints the whole multiples
table with the peer count, dispersion and grade behind every figure.

## The board

`board.json` holds 198 rows on this snapshot: the whole 40-protocol house watchlist (the
floor, never the ceiling) plus 158 early protocols beyond it. Protocols whose token already
trades are set aside, not ranked — the dashboard's "Already trading" view shows the largest
40 with the market caps the multiples were priced from — and the 144 pre-token protocols that
are products of tokens that already trade are listed one by one in the "Set aside" view, each
with the reason it is not a launch candidate. Every row carries a seven-step farm plan derived
from its own record (category family, chains, TVL band, age) and the plan's own price tag —
capital, estimated gas, total, hold days — computed by the same generator that writes the
steps, so the two can never disagree.

## Run it

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <dir-or-file>

Reads the snapshot (default `/input/snapshot.json`), writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` into the output directory. Node 22.18+,
standard library only, no network. Run it twice on the same snapshot and every byte is the
same.

## Layout

- `main.ts` — the program: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the pricing model, the evidence grades, the board builder and the
  farm-plan generator.
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`); renders offline from
  the `data.js` the program writes beside it.
- `screenshots/` — the board, a detail view, a filtered view and the model view, captured
  from the page.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored byte for byte.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
