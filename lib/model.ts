// Launch Radar's third model: one sealed snapshot of the protocol universe in, one ranked
// board out — the peer-anchor pricing of the second build, presented the way the first
// build presented it: the board first, every price's basis stated as plain counts and
// named peers, and nothing on the page that the page cannot stand behind.
//
// The board ranks protocols that record no token yet by what a launch would be worth if the
// protocol's record stayed exactly as the snapshot has it. The worth is anchored to the
// snapshot's own market. Every protocol that already trades gives one observation of what the
// market pays for a dollar of TVL in its category — its market cap over its TVL — winsorised
// into a stated band so one wild observation cannot bend a category. A pre-token protocol is
// priced at the shrunk median of its category's observations, then adjusted for the two things
// the snapshot says about it: its seven-day TVL change (gains credited gently, declines
// punished harder, because a week of inflow is cheap to fake and a week of outflow is not),
// and how long it has already run with no token, on a saturating curve.
//
//   multiple(category) = clamp( (n x median(peers) + 4 x global median) / (n + 4), 0.04, 2.5 )
//   growthMult         = 1 + min(change_7d, 50) x 0.007     when change_7d >= 0
//                      = 1 + max(change_7d, -50) x 0.010    when change_7d < 0 (null = 1)
//   maturityMult       = 0.80 + 0.40 x (1 - e^(-age_days / 900))
//   implied_value_usd  = max(1, round(tvl_usd x multiple x growthMult x maturityMult))
//
// What the third build changes is presentation, not arithmetic — the second build's prices
// stand. Its letter grades are gone: a grade stamped on a price told the reader to doubt
// the board's own top rows, when the honest facts are stronger than any letter — how many
// trading peers price the category, who the largest of them are, and how far their ratios
// spread. Those facts are printed, per category in the model panel and per row in its
// detail view, and the shrinkage above is what a thin category actually gets: a price
// resting on one peer is pulled four-fifths of the way to the global median before it is
// printed. The unknown-age fallback is still not a constant: it is the median tokenless
// age of the snapshot's own pre-token protocols whose start date is known, computed from
// the file at run time. Every row still carries the cost of its own farm plan — capital
// plus estimated gas over the hold — printed as a plain price tag, never divided into the
// model's claim. No protocol name is ever special-cased: one function prices every row,
// and the page recomputes each row from the same figures, so board and code cannot drift.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so a reader can re-run the arithmetic. */
export interface ModelConstants {
  shrink_peers: number;
  multiple_floor: number;
  multiple_cap: number;
  ratio_floor: number;
  ratio_cap: number;
  growth_gain_per_pct: number;
  growth_gain_cap_pct: number;
  growth_loss_per_pct: number;
  growth_loss_floor_pct: number;
  maturity_base: number;
  maturity_range: number;
  maturity_tau_days: number;
}

export const MODEL: ModelConstants = {
  shrink_peers: 4,
  multiple_floor: 0.04,
  multiple_cap: 2.5,
  ratio_floor: 0.02,
  ratio_cap: 5,
  growth_gain_per_pct: 0.007,
  growth_gain_cap_pct: 50,
  growth_loss_per_pct: 0.01,
  growth_loss_floor_pct: -50,
  maturity_base: 0.8,
  maturity_range: 0.4,
  maturity_tau_days: 900,
};

/** The model's version label, named in the dashboard and the board. */
export const MODEL_VERSION = 'peer-anchor-3';

/** The board's size cap: every rankable pre-token protocol, strongest first, up to this many. */
export const BOARD_MAX = 400;

/** How many live-token protocols the dashboard's Already-trading view sets aside, by cap. */
export const LIVE_ROWS = 40;

/** One trading protocol a category's multiple was priced from, named for the detail view. */
export interface PeerExample {
  name: string;
  slug: string;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

/** One category's pricing: the multiple used, and the peer support it stands on. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  peers: number;
  peer_median: number | null;
  dispersion: number | null;
  top_peers: PeerExample[];
}

/** What one row's farm plan costs, computed by the same generator that writes its steps. */
export interface PlanCost {
  capital_usd: number;
  gas_usd: number;
  total_usd: number;
  hold_days: number;
  minutes_per_week: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  why: string;
  model: {
    multiple: number;
    peers: number;
    peer_median: number | null;
    dispersion: number | null;
    growth_multiplier: number;
    maturity_multiplier: number;
  };
  plan_cost: PlanCost;
  farm_steps: string[];
}

/** The dashboard's view of one board row: the row, whole, farm plan included. */
export type RadarRow = BoardRow;

/** A live-token protocol: it already trades, so its value is a fact, not a model. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** A pre-token protocol the board sets aside, with the reason it is not a launch candidate. */
export interface AsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants & { global_multiple: number; unknown_age_days: number };
  multiples: CategoryMultiple[];
  counts: {
    protocols: number;
    pre_token: number;
    live: number;
    aside: number;
    watchlist: number;
    board: number;
    early: number;
  };
  rows: RadarRow[];
  live: LiveRow[];
  aside: AsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const bySlugAsc = (a: SnapshotProtocol, b: SnapshotProtocol): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** A whole day count from listed_at to as_of, clamped at zero; null when the date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-quantile of a non-empty list, by linear interpolation between closest ranks. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((x, y) => x - y);
  if (sorted.length === 1) return sorted[0]!;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** Whether a protocol records no token at all: no market cap, no Gecko id, no symbol. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a later pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * Categories that are products of a token that already trades, not launches of their own: a bridge
 * entry is the locker of another chain's asset (WBTC is Bitcoin, USDT0 is Tether), a liquid staking
 * or restaking entry is a claim on a staking asset that trades, and a CEX entry is an exchange's own
 * shelf. These are the house watchlist's own exclusions, restated from the record's fields.
 */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A name carrying a whole word wrapped, staked or staking is a product of the asset it wraps. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name that begins with an exchange's name is that exchange's product, not a launch candidate. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Why the board sets a pre-token protocol aside, in one sentence a reader can check. */
export function asideReason(p: SnapshotProtocol): string | null {
  const category = p.category ?? '';
  if (category === 'Bridge' || category === 'Canonical Bridge') {
    return 'a bridge: it moves another chain\'s asset, and that asset already trades — the bridge itself is not a launch';
  }
  if (category === 'Liquid Staking' || category === 'Liquid Restaking' || category === 'Restaked BTC') {
    return 'a staking product: its receipt is a claim on a staking asset that already trades, not a token still to come';
  }
  if (category === 'CEX') return 'an exchange\'s own shelf: a product of the exchange, not a protocol waiting on a launch';
  if (PRODUCT_WORD.test(p.name)) return 'its name marks it as a wrapped or staked product of a token that already trades';
  if (EXCHANGE_PREFIX.test(p.name)) return 'it carries an exchange\'s name: that exchange\'s product, not an independent launch';
  if (VERSIONED.test(p.name)) return 'a later version of another protocol\'s pool: the launch, if any, belongs to the protocol, not the version';
  return null;
}

/**
 * Whether the board may rank a protocol: it records no token, and it is not a wrapped, staked,
 * bridged or exchange product of a token that already trades, and not a versioned pool of one.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && asideReason(p) === null;
}

// ---------------------------------------------------------------- the pricing

const clampMultiple = (n: number, model: ModelConstants): number =>
  Math.min(model.multiple_cap, Math.max(model.multiple_floor, n));

/** Winsorise one peer ratio into the stated band: the band is printed in the dashboard. */
const winsor = (ratio: number, model: ModelConstants): number =>
  Math.min(model.ratio_cap, Math.max(model.ratio_floor, ratio));

/** The pricing context one snapshot produces: the multiples table and the derived age fallback. */
export interface Pricing {
  asOf: string;
  global: number;
  table: Map<string, CategoryMultiple>;
  unknownAgeDays: number;
}

/**
 * The pricing table, derived only from the snapshot's token-bearing protocols. Peer ratios
 * are winsorised before any statistic touches them; a category's multiple is its peer median
 * shrunk toward the global median by phantom peers, so a thin category cannot shout — a
 * category priced from a single peer keeps only a fifth of that peer's voice. The unknown-age
 * fallback is the median known tokenless age across the snapshot's pre-token protocols — the
 * file's own answer to "how old is a protocol whose start date is missing". Each category
 * also keeps its peer count, the dispersion of its peer ratios (interquartile range over
 * median, quoted only when four or more peers make it meaningful) and its largest peers by
 * market cap, so the page can print the support behind every multiple instead of grading it.
 */
export function buildPricing(snapshot: Snapshot, model: ModelConstants = MODEL): Pricing {
  const ratiosByCategory = new Map<string, number[]>();
  const peersByCategory = new Map<string, PeerExample[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const raw = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const ratio = winsor(raw, model);
    all.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
    const peers = peersByCategory.get(key);
    const example: PeerExample = { name: p.name, slug: p.slug, mcap_usd: p.mcap_usd, tvl_usd: p.tvl_usd, ratio: round4(ratio) };
    if (peers === undefined) peersByCategory.set(key, [example]);
    else peers.push(example);
  }
  const global = all.length > 0 ? median(all) : 0.15;
  const table = new Map<string, CategoryMultiple>();
  const categories = new Set<string>();
  for (const p of snapshot.protocols) categories.add(p.category ?? 'Uncategorised');
  for (const category of categories) {
    const ratios = ratiosByCategory.get(category) ?? [];
    const topPeers = (peersByCategory.get(category) ?? [])
      .sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1))
      .slice(0, 4);
    if (ratios.length === 0) {
      table.set(category, { category, multiple: round4(clampMultiple(global, model)), peers: 0, peer_median: null, dispersion: null, top_peers: [] });
      continue;
    }
    const peerMedian = median(ratios);
    const dispersion = ratios.length >= 4 && peerMedian > 0
      ? round4((quantile(ratios, 0.75) - quantile(ratios, 0.25)) / peerMedian)
      : null;
    const shrunk = (ratios.length * peerMedian + model.shrink_peers * global) / (ratios.length + model.shrink_peers);
    table.set(category, {
      category,
      multiple: round4(clampMultiple(shrunk, model)),
      peers: ratios.length,
      peer_median: round4(peerMedian),
      dispersion,
      top_peers: topPeers,
    });
  }
  const knownAges: number[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    const age = ageDays(snapshot.as_of, p.listed_at);
    if (age !== null) knownAges.push(age);
  }
  const unknownAgeDays = knownAges.length > 0 ? Math.round(median(knownAges)) : 270;
  return { asOf: snapshot.as_of, global: round4(global), table, unknownAgeDays };
}

/** The growth factor: gains credited at the gain rate, declines charged at the loss rate. */
export function growthFactor(change7d: number | null, model: ModelConstants = MODEL): number {
  if (change7d === null) return 1;
  if (change7d >= 0) return 1 + Math.min(change7d, model.growth_gain_cap_pct) * model.growth_gain_per_pct;
  return 1 + Math.max(change7d, model.growth_loss_floor_pct) * model.growth_loss_per_pct;
}

/** The maturity factor: a saturating curve over tokenless days, from base toward base + range. */
export function maturityFactor(ageDaysCount: number, model: ModelConstants = MODEL): number {
  return model.maturity_base + model.maturity_range * (1 - Math.exp(-Math.max(0, ageDaysCount) / model.maturity_tau_days));
}

/** The three factors, the peer support and the implied value one protocol gets under `pricing`. */
export function impliedValue(
  p: SnapshotProtocol,
  pricing: Pricing,
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  peers: number;
  peerMedian: number | null;
  dispersion: number | null;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const entry = pricing.table.get(p.category ?? 'Uncategorised')!;
  const age = ageDays(pricing.asOf, p.listed_at);
  const growthMult = growthFactor(p.change_7d, model);
  const maturityMult = maturityFactor(age ?? pricing.unknownAgeDays, model);
  const implied = Math.max(1, Math.round(p.tvl_usd * entry.multiple * growthMult * maturityMult));
  return {
    implied,
    multiple: entry.multiple,
    peers: entry.peers,
    peerMedian: entry.peer_median,
    dispersion: entry.dispersion,
    growthMult,
    maturityMult,
    age,
  };
}

/** One sentence that says why a row sits where it sits, with the three drivers quantified. */
export function whyLine(
  p: SnapshotProtocol,
  v: { multiple: number; peers: number; growthMult: number; maturityMult: number; age: number | null },
): string {
  const category = p.category ?? 'Uncategorised';
  const peerPart = v.peers === 0
    ? `priced at x${v.multiple.toFixed(2)}, the global median multiple, because no ${category} protocol trades yet`
    : `priced at x${v.multiple.toFixed(2)}, the shrunk median of ${v.peers} trading ${category} peer${v.peers === 1 ? '' : 's'}`;
  const growthPart = p.change_7d === null
    ? 'no seven-day change on record, so momentum is neutral'
    : `a ${p.change_7d >= 0 ? '+' : ''}${round2(p.change_7d)}% week in TVL moves the price ${v.growthMult >= 1 ? '+' : ''}${Math.round((v.growthMult - 1) * 100)}%`;
  const agePart = v.age === null
    ? 'its start date is unlisted, so it is aged at the snapshot\'s median tokenless age'
    : `${v.age.toLocaleString('en-US')} days with no token set the maturity factor at x${v.maturityMult.toFixed(2)}`;
  return `${peerPart}; ${growthPart}; ${agePart}.`;
}

// ---------------------------------------------------------------- farm plans

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain a protocol names, when it has one. */
function secondChainOf(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** Chains where an action costs cents, not dollars: the L2s and the cheap L1s of the snapshot. */
const CHEAP_CHAINS = new Set(['Solana', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'BSC', 'Binance', 'Avalanche', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Sonic', 'Berachain', 'Sui', 'Aptos', 'Near', 'Tron', 'Sei', 'Ink', 'Unichain', 'Monad', 'Hyperliquid']);

/** The EVM chains of the snapshot, for the wallet wording of a plan's first step. */
const EVM_CHAINS = new Set(['Ethereum', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'BSC', 'Binance', 'Avalanche', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Ink', 'Unichain', 'Berachain', 'Monad', 'Hyperliquid']);

/** A plain-language gas estimate for one on-chain action on `chain`. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return '$4-$12 of Ethereum gas';
  if (CHEAP_CHAINS.has(chain)) return 'under $1 of gas';
  return '$1-$3 of gas';
}

/** One action's gas in dollars, for the plan's cost ledger: the midpoint of gasFor's range. */
function gasDollars(chain: string): number {
  if (chain === 'Ethereum') return 8;
  if (CHEAP_CHAINS.has(chain)) return 0.5;
  return 2;
}

/** The wallet a plan's first step opens, worded for the protocol's own first chain. */
function walletFor(chain: string): string {
  if (chain === 'Solana') return 'a Solana wallet you control (Phantom or Solflare)';
  if (chain === 'Sui') return 'a Sui wallet you control';
  if (chain === 'Aptos') return 'an Aptos wallet you control';
  if (EVM_CHAINS.has(chain)) return 'a fresh EVM wallet';
  return `a wallet that supports ${chain}`;
}

/** How much capital one serious farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 2_000_000_000) return 250;
  if (p.tvl_usd >= 500_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 120;
  if (p.tvl_usd >= 25_000_000) return 80;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols need the longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 42;
  if (age < 180) return 56;
  if (age < 365) return 42;
  if (age < 730) return 35;
  return 28;
}

/** Which family a category belongs to, for the core farm action. */
function familyOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('swap')) return 'dex';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized')) return 'lending';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('staking') || c.includes('restak') || c.includes('anchor btc') || c.includes('decentralized btc')) return 'staking';
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return 'derivatives';
  if (c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager') || c.includes('collateral management')) return 'curator';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('launchpad')) return 'launchpad';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('chain')) return 'chain';
  if (c.includes('yield') || c.includes('farm') || c.includes('index') || c.includes('basis') || c.includes('synthetic') || c.includes('stable') || c.includes('algo')) return 'yield';
  return 'generic';
}

/** How many transactions a family's core action takes, for the plan's gas ledger. */
function coreTransactions(family: string): number {
  if (family === 'dex' || family === 'derivatives') return 6;
  if (family === 'lending' || family === 'prediction') return 4;
  return 3;
}

/** The core action of a farm plan, worded for the protocol's family and filled with its own record. */
function coreAction(p: SnapshotProtocol, family: string, capital: number, chain: string): string {
  const name = p.name;
  const gas = gasFor(chain);
  const half = Math.max(10, Math.round(capital / 2));
  switch (family) {
    case 'dex': {
      const volume = capital * 6;
      const fee = Math.max(1, Math.round(volume * 0.003));
      return `Trade $${volume.toLocaleString('en-US')} of volume through ${name} on ${chain}: six swaps of about $${capital} each across the first three weeks, on its deepest pair so slippage stays under 0.3%. The fees on that volume run about $${fee} — the plan's real activity cost. Cost: $${fee} of fees plus ${gas} a swap. Time: 20 minutes to set up.`;
    }
    case 'lending': {
      const borrow = Math.round(capital * 0.45);
      return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow $${borrow} (45% of the supply) against it and park the borrow in the same wallet, unspent. Keep the health factor above 1.6 and re-check it after any 10% market move. Cost: ${gas} a transaction, four transactions in all. Time: 20 minutes.`;
    }
    case 'bridge':
      return `Bridge $10 of USDC to ${chain} through ${name} first and confirm it lands; then bridge the remaining $${capital - 10} and put it to work on the far side — one swap and one deposit — so the trip reads as use, not a naked hop. Cost: ${gas} a leg plus the bridge's own fee. Time: 25 minutes.`;
    case 'staking':
      return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and hold the receipt token in the same wallet. Before staking, read the unbonding period and write the exit date in the log: the plan's hold is built around it. Cost: ${gas} to stake. Time: 15 minutes.`;
    case 'derivatives': {
      const fee = Math.max(2, Math.round(capital * 0.02));
      return `Post $${capital} of USDC margin on ${name} and run two or three small sessions a week: notional at 2x the margin or under, a stop on every order, and nothing left open and unhedged overnight. Cost: about $${fee} of trading fees across the plan plus ${gas} a session. Time: 30 minutes a week.`;
    }
    case 'curator':
      return `Deposit $${capital} into the largest vault ${name} curates on ${chain} — largest by assets, not by headline APY — and read its last reallocation before confirming. Keep the shares untouched for the whole hold. Cost: ${gas} to deposit. Time: 20 minutes, most of it reading.`;
    case 'rwa':
      return `Mint $${capital} of ${name}'s tokenised asset on ${chain} and hold it through one full yield cycle. Check the redemption window and the minimum hold first: they set the exit date, not you. Cost: ${gas} to mint, plus any stated issuance fee. Time: 20 minutes.`;
    case 'launchpad':
      return `Create the account on ${name}, finish any identity check it asks for, and commit $${capital} to one public sale round. Treat the commitment as locked until the round settles or refunds — never commit capital you need inside that window. Cost: the $${capital} commitment plus ${gas}. Time: 30 minutes.`;
    case 'prediction': {
      const per = Math.max(10, Math.round(capital / 4));
      return `Fund $${capital} on ${name} and place three or four positions on its most liquid markets, each about $${per} so a total loss is a shrug, and hold every one to resolution. Cost: the $${capital} at risk plus ${gas} a position. Time: 20 minutes.`;
    }
    case 'insurance':
      return `Underwrite $${capital} in ${name}'s capital pool on ${chain} for one full cover period — or, if you already hold a position it covers, buy cover on that instead. Either way the capital is committed to the period's end. Cost: the $${capital} committed. Time: 15 minutes.`;
    case 'chain':
      return `Bridge $${capital} to ${chain} and use two of its native apps every week — one swap, one deposit — so the wallet touches several contracts with real balances, not one faucet-grade app. Cost: ${gas} an action. Time: 20 minutes a week.`;
    case 'yield':
      return `Deposit $${capital} into ${name}'s flagship vault on ${chain} and leave the shares untouched. First check what the headline APY is paid in: count only the cash part as earnings and treat emissions as a bonus, never the reason. Cost: ${gas} to deposit. Time: 15 minutes.`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} in two tranches a week apart ($${half} each) and keep the position open for the whole window. Two dated deposits read as a user; one reads as a snapshot sniper. Cost: ${gas} a deposit. Time: 20 minutes.`;
  }
}

/** A plan's second surface: a second chain when the protocol has one, else a second product. */
function secondSurface(p: SnapshotProtocol, family: string, capital: number, chain: string): string {
  const name = p.name;
  const second = secondChainOf(p);
  const small = Math.max(25, Math.round(capital / 2));
  if (second !== null) {
    return `Repeat the core action once on ${second} with $${small}: multi-chain activity is the cheapest signal that a wallet is a user and not a bot, and ${name} counts both chains. Cost: ${gasFor(second)} plus the second position. Time: 15 minutes.`;
  }
  switch (family) {
    case 'dex':
      return `Also provide $${small} of liquidity to ${name}'s deepest stable pair on ${chain} for the middle two weeks, then withdraw it: liquidity provision is a second, different signal from swapping, and its fee record stays in the same wallet. Cost: ${gasFor(chain)} twice, in and out. Time: 15 minutes.`;
    case 'lending':
      return `Open a second market on ${name} as well: supply $${small} of the chain's native asset beside the USDC, so the wallet reads as a user of two markets, not one. Cost: ${gasFor(chain)} a transaction. Time: 10 minutes.`;
    case 'curator':
      return `Split the position: put $${small} into ${name}'s second-largest vault on ${chain} a week after the first deposit, so the wallet holds shares of two vaults the curator runs. Cost: ${gasFor(chain)} to deposit. Time: 10 minutes.`;
    case 'staking':
      return `Add a second tranche of $${small} two weeks in rather than staking everything on day one: two dated actions read as a user building a position, one reads as a snapshot sniper. Cost: ${gasFor(chain)} to stake. Time: 10 minutes.`;
    default:
      return `Use a second surface of ${name} once — its other product, market or vault — with $${small}: two different kinds of action on one protocol outweigh ten of the same kind. Cost: ${gasFor(chain)} plus the $${small} position. Time: 15 minutes.`;
  }
}

/** The surface a plan watches weekly, by family. */
function watchSurface(family: string): string {
  switch (family) {
    case 'dex': return 'its volume and pair-depth page';
    case 'lending': return 'its market utilisation and your own health factor';
    case 'derivatives': return 'its open-interest page and funding rates';
    case 'staking': return 'its operator set and the unbonding queue';
    case 'curator': return 'its vault reallocation log';
    case 'rwa': return 'its redemption calendar';
    case 'launchpad': return 'its sale schedule and refund notices';
    case 'prediction': return 'its market list and resolution feed';
    case 'insurance': return 'its cover book and any claim events';
    case 'bridge': return 'its status page and bridge volumes';
    case 'chain': return 'its status page and bridge volumes';
    case 'yield': return 'its vault list, and what the headline APY is paid in';
    default: return 'its official announcements and its points or rewards page';
  }
}

/** The risk line a plan holds, by family: the failure that ends this kind of farm. */
function riskNote(family: string): string {
  switch (family) {
    case 'dex': return 'On a thin pair the fees and slippage eat the whole edge, so keep every swap under 0.3% of the pair\'s visible depth and never borrow size to farm.';
    case 'lending': return 'A liquidation ends the farm and the streak together: if the health factor slides under 1.6, top up the supply the same day, before anything else.';
    case 'derivatives': return 'Liquidation is the whole risk: one margin call wipes the season\'s record, so the 2x cap and the stops are the plan, not a detail of it.';
    case 'staking': return 'If unstaking takes weeks, the exit starts that many weeks before any deadline — count backwards from the unbonding period, not forwards from today.';
    case 'curator': return 'A vault is only as good as its curator: if a reallocation moves the vault into an asset you cannot explain, withdraw at the next window.';
    case 'rwa': return 'Redemption windows rule the exit: never let the position sit locked past the date you need the capital back.';
    case 'launchpad': return 'An oversubscribed round can sit on your commitment for weeks before refunding; the stop rule is the calendar, not the price.';
    case 'prediction': return 'A prediction position is binary and its rules are the product: never add to a market whose resolution source you have not read.';
    case 'insurance': return 'Underwriting is short volatility: one hack pays out of the pool you are in, so only underwrite periods you can leave untouched to expiry.';
    case 'bridge': return 'Bridge contracts are the most-attacked code in the snapshot: use the protocol\'s own canonical route and never leave funds parked on one.';
    case 'chain': return 'A young chain\'s risk is its bridge and its sequencer: keep the position small until the chain has run a full quarter you can check in its status history.';
    case 'yield': return 'Yield that leads its category is usually emissions in disguise: if the cash part of the APY halves, the reason to hold is gone.';
    default: return 'The standing risk is the contract itself: verify its address from the protocol\'s official page every time, and start with a $10 test before the full amount.';
  }
}

/** Trim or pad one step into the gate's 20..600 character window. */
function stepFit(s: string): string {
  if (s.length > 600) return `${s.slice(0, 596)}...`;
  if (s.length < 20) return `${s} Keep the position open and log it.`;
  return s;
}

/**
 * A protocol's farm plan and its price, from one generator so the two can never disagree:
 * seven steps — wallet, core action, second surface, weekly cadence, the hold, monitoring
 * with the family's risk line and a stop rule, and claim-and-exit hygiene — each with its
 * cost and its time, and a PlanCost that adds the same figures up: the capital the steps
 * commit, the gas they burn (actions counted, priced at the chain's rate) and the hold.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: string[]; cost: PlanCost } {
  const chain = chainOf(p);
  const family = familyOf(p.category);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.round(hold / 7));
  const gas = gasFor(chain);
  const buffer = chain === 'Ethereum' ? 40 : 15;
  const actions = 1 + coreTransactions(family) + weeks + 2 + 1;
  const gasUsd = Math.max(1, Math.round(actions * gasDollars(chain)));
  const cost: PlanCost = {
    capital_usd: capital,
    gas_usd: gasUsd,
    total_usd: capital + gasUsd,
    hold_days: hold,
    minutes_per_week: family === 'derivatives' ? 30 : 10,
  };
  const steps = [
    `Open ${walletFor(chain)} for ${p.name} alone and write its seed phrase on paper, offline. Fund it with $${capital + buffer}: $${capital} to farm and $${buffer} spare for gas and one test transaction. Cost: ${gas} for the funding move. Time: 10 minutes.`,
    coreAction(p, family, capital, chain),
    secondSurface(p, family, capital, chain),
    `Repeat one small qualifying action every week for ${weeks} weeks — a swap, deposit, borrow or vote of $10-$25 — always from the same wallet and on roughly the same weekday, so the streak is unbroken. Cost: ${gas} a week, about $${Math.max(1, Math.round(weeks * gasDollars(chain)))} of gas across the plan. Time: 10 minutes a week.`,
    `Hold the core position untouched for at least ${hold} days. Points and airdrop snapshots read balances and durations, and churning in and out resets most streak counters; the weekly action above is the only movement. Cost: the $${capital} stays in the position. Time: ${hold} days.`,
    `Watch ${watchSurface(family)} once a week, and hold the family's line: ${riskNote(family)} Stop rule: exit if ${p.name}'s TVL falls 30% from your entry week, or a token is announced with a snapshot date already past. Cost: nothing. Time: 5 minutes a week.`,
    `If ${p.name} issues a token, claim only from the link on its official page or docs — never a link that arrived in a message — and never pay a claim fee or sign an approval you did not start. Afterwards revoke the farm wallet's approvals and move anything claimed to cold storage. Cost: ${gas} to claim. Time: 15 minutes.`,
  ];
  return { steps: steps.map(stepFit), cost };
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n and every watchlist slug aboard. */
export function buildBoard(snapshot: Snapshot, pricing: Pricing, model: ModelConstants = MODEL): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => watch.has(p.slug) || isRankable(p))
    .map((p) => {
      const v = impliedValue(p, pricing, model);
      const plan = farmPlan(p, v.age);
      return { p, v, plan };
    });
  scored.sort((a, b) => b.v.implied - a.v.implied || b.p.tvl_usd - a.p.tvl_usd || bySlugAsc(a.p, b.p));
  const chosen = scored.slice(0, BOARD_MAX);
  const chosenSlugs = new Set(chosen.map((s) => s.p.slug));
  for (const s of scored) {
    if (watch.has(s.p.slug) && !chosenSlugs.has(s.p.slug)) chosen.push(s);
  }
  chosen.sort((a, b) => b.v.implied - a.v.implied || b.p.tvl_usd - a.p.tvl_usd || bySlugAsc(a.p, b.p));
  return chosen.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.v.age,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.v.implied,
    why: whyLine(s.p, s.v),
    model: {
      multiple: s.v.multiple,
      peers: s.v.peers,
      peer_median: s.v.peerMedian,
      dispersion: s.v.dispersion,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
    },
    plan_cost: s.plan.cost,
    farm_steps: s.plan.steps,
  }));
}

/** The live-token protocols, set aside by market cap: the separation the board exists to make. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlugAsc(a, b))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Every pre-token protocol the board sets aside, largest first, each with its reason. */
export function asideRows(snapshot: Snapshot): AsideRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || bySlugAsc(a, b))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: asideReason(p) ?? 'a product of a token that already trades',
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const pricing = buildPricing(snapshot, model);
  const board = buildBoard(snapshot, pricing, model);
  const multiples = [...pricing.table.values()]
    .filter((m) => board.some((r) => (r.category ?? 'Uncategorised') === m.category))
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const aside = asideRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: { ...model, global_multiple: pricing.global, unknown_age_days: pricing.unknownAgeDays },
    multiples,
    counts: {
      protocols: snapshot.protocols.length,
      pre_token: preToken,
      live: snapshot.protocols.length - preToken,
      aside: aside.length,
      watchlist: snapshot.watchlist.length,
      board: board.length,
      early: board.filter((r) => !r.watchlist).length,
    },
    rows: board,
    live: liveRows(snapshot),
    aside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: size, coverage, ranks, order, values, steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!(r.plan_cost.total_usd > 0) || r.plan_cost.capital_usd + r.plan_cost.gas_usd !== r.plan_cost.total_usd) {
      return `${r.slug} has a plan cost that does not add up`;
    }
  }
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `rank ${i + 1} is ${byRank[i]!.rank}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${i + 1} outranks rank ${i} on implied value`;
  }
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) return 'every row shares one implied value';
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
