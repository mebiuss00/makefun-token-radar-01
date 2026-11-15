[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mebiuss00/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mebiuss00/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Launch Radar — pre-token protocols, priced and ranked

Launch Radar reads one sealed snapshot of the protocol universe and ranks the protocols that
record no token yet by what a launch would be worth if each protocol's record stayed exactly
as the snapshot has it. Every price is anchored to the snapshot's own market: the protocols
that already trade state, category by category, what the market pays for a dollar of TVL.

The board is the product. The ranked table is the first thing on the page, under a lede that
states the coverage plainly: how many protocols the snapshot holds, how many record no token,
that every watchlist protocol is on the board, and how many more were set aside as products
of tokens that already trade — each of those named, with its reason, on its own tab.

## The model — peer-anchor-3

```
multiple(category) = clamp( (n × median(peers) + 4 × global median) / (n + 4), ×0.04, ×2.50 )
growth             = 1 + min(change_7d, +50) × 0.007    when the week rose
                   = 1 + max(change_7d, −50) × 0.010    when the week fell
maturity           = 0.80 + 0.40 × (1 − e^(−age_days / 900))
implied value      = TVL × multiple × growth × maturity
```

- **The multiple.** A category's peers are its trading protocols; each gives one observation
  of cap over TVL, winsorised into [×0.02, ×5.00] so one wild print cannot bend a category.
  The multiple is the peer median shrunk toward the global median by four phantom peers: a
  category priced from a single peer keeps one-fifth of that peer's voice, and a category
  with no trading peer is priced at the global median itself.
- **Peer support, printed not graded.** Every price states how many trading peers stand
  behind its category, who the largest of them are and how far their ratios spread — in the
  model panel's table, in each row's why-line and in its detail view. Thin support is handled
  by the shrinkage itself rather than by a warning label: the fewer the peers, the more of
  the price is the market-wide median.
- **Growth, asymmetric.** A rising week is credited gently (+0.7% per point, capped at +50
  points); a falling week is charged harder (−1.0% per point, floored at −50). A week of
  inflow is cheap to fake; a week of outflow is not, so the model trusts declines more.
- **Maturity, saturating.** Surviving tokenless compounds, then flattens: ×1.05 at 900 days,
  ×1.18 at four years. A protocol whose start date the snapshot does not give is aged at the
  median tokenless age of the snapshot's own pre-token protocols — computed from the file,
  never a constant typed into the code.
- **Separation.** Protocols that already trade are facts, not candidates: they sit on their
  own tab at their real caps and never enter the ranking. Bridges, staking receipts, exchange
  shelves and versioned pools are set aside with reasons, never ranked as launches.

Every row also carries a seven-step farm plan written for its own record — its chain, its
family's core action, its capital sized from its TVL — and the plan's full price: capital
plus estimated gas over the hold, computed by the same generator that writes the steps and
printed as a plain price tag on the board and in the detail view.

## The dashboard

A static page, no build step and no network: `data.js` carries the whole dataset, written by
the same run that wrote `board.json`. Four tabs — the ranked board; the already-trading
protocols at their real caps; the set-aside products with their reasons; and the model, with
its formula, its constants and the multiples table. The board filters by text, category,
chain, size band and momentum, shows the watchlist alone, and sorts by value, TVL, growth,
age, multiple, peer count or plan cost. Every row opens to a detail view: the why-line, the
arithmetic recomputed in the page from the row's own figures (it agrees with the board, or
the page would show it), the trading peers it was priced from, and the farm plan with its
cost broken out.

Three screenshots ship with the entry: the board itself, one protocol's detail view, and a
filtered view of the board — the three things a reader needs to judge the radar.

## Running it

Node 22, standard library only:

```
node main.ts --input <snapshot.json>     # or mount the sealed input at /input
```

The run writes `board.json`, `data.js`, the dashboard and screenshots, and `dossier.json`
into the output directory (`/output`, or `MAKEFUN_OUTPUT_DIR` outside the grader's
container). It is deterministic: same snapshot in, same bytes out, on any machine.

## Layout

- `main.ts` — the run: snapshot in, board and dossier out.
- `lib/model.ts` — the pricing model, the farm-plan generator and the board builder.
- `dashboard/` — the static page (HTML, CSS, JS) the dossier shows.
- `screenshots/` — the board, a detail view, a filtered view.
- `vendor/makefun-board.ts` — the vendored make.fun dossier library, byte-identical to the kit's.

---
<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
