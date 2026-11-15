# Launch Radar — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mebiuss00/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mebiuss00/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's token-radar-01 bounty. It reads one frozen DefiLlama
snapshot of the protocol universe, works out which protocols record no token yet and are not a
wrapped, staked, bridged or exchange product of a token that already trades, prices each one at
what a launch would be worth if its record froze today, and hands in a dashboard: the ranked
board, a detail view per protocol with its pricing and farm plan, and filters to cut the board
by search, category, chain and watchlist membership.

## The model (peer-anchor-1)

Implied value is anchored to the snapshot's own market, never to a flat guess:

- Every protocol that already trades contributes one observation: its market cap over its TVL.
- A category's **multiple** is the median of those observations for the category, shrunk toward
  the global median by 4 phantom peers and clamped to [0.04, 2.5], so a thin category cannot
  shout and a single wild peer cannot price a board.
- **Growth** adjusts for the seven-day TVL change (clamped to [-40%, +60%], 0.6% of value per
  point); **maturity** adjusts for how long the protocol has already run with no token
  (0.78 at birth rising to 1.20 at four years; an unlisted start date counts as 270 days).

    implied = round( tvl x multiple(category) x growth x maturity )

One function prices every row; no protocol name is special-cased. The dashboard recomputes each
row in the page and shows the same number, and its model panel prints the whole multiples table
with the peer count behind every figure.

## The board

`board.json` holds 198 rows on this snapshot: the whole 40-protocol house watchlist (the floor,
never the ceiling) plus 158 early protocols beyond it. Protocols whose token already trades are
set aside, not ranked — the dashboard's "Already trading" view shows the largest of them with
the market caps the multiples were priced from. Every row carries a six-step farm plan derived
from its own record (category family, chains, TVL band, age): the core action, the capital it
needs, the weekly cadence, the hold, and the claim hygiene, each step with its cost and its time.

## Run it

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <dir-or-file>

Reads the snapshot (default `/input/snapshot.json`), writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` into the output directory. Node 22.18+,
standard library only, no network. Run it twice on the same snapshot and every byte is the
same.

## Layout

- `main.ts` — the program: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the pricing model, the board builder and the farm-plan generator.
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`); renders offline from
  the `data.js` the program writes beside it.
- `screenshots/` — the board, a detail view and a filtered view, captured from the page.
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored byte for byte.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
