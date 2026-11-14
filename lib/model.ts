// Launch Radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks protocols that record no token yet by what a launch would be worth if the
// protocol's record stayed exactly as the snapshot has it. The worth is not a flat multiple of TVL:
// it is anchored to the snapshot's own market. Every protocol that already trades gives one
// observation of what the market pays for a dollar of TVL in its category — its market cap over its
// TVL. A pre-token protocol is priced at the (shrunk) median of those observations for its own
// category, then adjusted for the two things the snapshot says about its momentum and its staying
// power: its seven-day TVL change, and how long it has already run with no token.
//
//   multiple(category) = clamp( (n x median(peers) + 4 x global median) / (n + 4), 0.04, 2.5 )
//   growthMult         = 1 + clamp(change_7d, -40, 60) x 0.006      (null change counts as 0)
//   maturityMult       = 0.78 + 0.42 x min(age_days, 1460) / 1460   (unknown age counts as 270)
//   implied_value_usd  = max(1, round(tvl_usd x multiple x growthMult x maturityMult))
//
// The shrinkage (4 phantom peers at the global median) keeps a category with two wild observations
// from pricing a protocol at twenty times its TVL, and the clamp keeps any single category sane.
// No protocol name is ever special-cased: one function prices every row, and the page recomputes
// each row from the same figures, so the board and the code cannot drift apart.

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
  growth_per_pct: number;
  growth_floor_pct: number;
  growth_cap_pct: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  shrink_peers: 4,
  multiple_floor: 0.04,
  multiple_cap: 2.5,
  growth_per_pct: 0.006,
  growth_floor_pct: -40,
  growth_cap_pct: 60,
  maturity_floor: 0.78,
  maturity_range: 0.42,
  maturity_days: 1460,
  unknown_age_days: 270,
};

/** The model's version label, named in the dashboard and the board. */
export const MODEL_VERSION = 'peer-anchor-1';

/** The board's size cap: every rankable pre-token protocol, strongest first, up to this many rows. */
export const BOARD_MAX = 300;

/** How many live-token protocols the dashboard's Live view sets aside, by market cap. */
export const LIVE_ROWS = 24;

/** One category's pricing: the multiple a pre-token protocol in it is priced at, and its evidence. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  peers: number;
  peer_median: number | null;
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
  model: {
    multiple: number;
    peers: number;
    growth_multiplier: number;
    maturity_multiplier: number;
  };
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

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: ModelConstants & { global_multiple: number };
  multiples: CategoryMultiple[];
  counts: {
    protocols: number;
    pre_token: number;
    live: number;
    products: number;
    watchlist: number;
    board: number;
    early: number;
  };
  rows: RadarRow[];
  live: LiveRow[];
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

/**
 * Whether the board may rank a protocol: it records no token, and it is not a wrapped, staked,
 * bridged or exchange product of a token that already trades, and not a versioned pool of one.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !PRODUCT_CATEGORIES.has(p.category ?? '') &&
    !PRODUCT_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !VERSIONED.test(p.name)
  );
}

/**
 * The pricing table: one multiple per category, derived only from the snapshot's token-bearing
 * protocols. Categories with no trading peer fall back to the global median outright.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; table: Map<string, CategoryMultiple> } {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  const global = all.length > 0 ? median(all) : 0.15;
  const table = new Map<string, CategoryMultiple>();
  const categories = new Set<string>();
  for (const p of snapshot.protocols) categories.add(p.category ?? 'Uncategorised');
  for (const category of categories) {
    const peers = ratiosByCategory.get(category) ?? [];
    if (peers.length === 0) {
      table.set(category, { category, multiple: round4(clamp(global, model)), peers: 0, peer_median: null });
      continue;
    }
    const peerMedian = median(peers);
    const shrunk = (peers.length * peerMedian + model.shrink_peers * global) / (peers.length + model.shrink_peers);
    table.set(category, { category, multiple: round4(clamp(shrunk, model)), peers: peers.length, peer_median: round4(peerMedian) });
  }
  return { global: round4(global), table };
}

const clamp = (n: number, model: ModelConstants): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, n));

/** The three factors and the implied value one protocol gets under `model` and `pricing`. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  pricing: { table: Map<string, CategoryMultiple> },
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; peers: number; growthMult: number; maturityMult: number; age: number | null } {
  const entry = pricing.table.get(p.category ?? 'Uncategorised')!;
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(model.growth_cap_pct, Math.max(model.growth_floor_pct, p.change_7d ?? 0));
  const growthMult = 1 + growthPct * model.growth_per_pct;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(p.tvl_usd * entry.multiple * growthMult * maturityMult));
  return { implied, multiple: entry.multiple, peers: entry.peers, growthMult, maturityMult, age };
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

/** A plain-language gas estimate for one on-chain action on `chain`. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return '$4-$12 of Ethereum gas';
  if (CHEAP_CHAINS.has(chain)) return 'under $1 of gas';
  return '$1-$3 of gas';
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

/** The core action of a farm plan, worded for the protocol's family and filled with its own record. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const name = p.name;
  const half = Math.max(10, Math.round(capital / 2));
  switch (familyOf(p.category)) {
    case 'dex':
      return `Swap about $${capital} of volume through ${name} on ${chain}: six swaps of roughly $${Math.max(5, Math.round(capital / 6))} each across three weeks, on pairs with deep liquidity so slippage stays under 0.3%.`;
    case 'lending':
      return `Supply $${capital} of USDC to ${name} on ${chain} as collateral, borrow $${half} against it for two weeks, then repay in full and leave the supply open.`;
    case 'bridge':
      return `Bridge $${capital} of USDC to ${chain} through ${name}, then make two swaps and one deposit in apps on the far side, so the trip reads as use and not a naked bridge hop.`;
    case 'staking':
      return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and hold the receipt token in the same wallet for the whole window.`;
    case 'derivatives':
      return `Post $${capital} of USDC margin on ${name} and trade two or three small sessions a week, hedging each position spot-side and keeping a stop on every order.`;
    case 'curator':
      return `Deposit $${capital} into the largest vault ${name} curates on ${chain} and keep the shares untouched; flagship vaults are what activity snapshots weight most.`;
    case 'rwa':
      return `Mint $${capital} of ${name}'s tokenised real-world asset on ${chain} and hold it through one full yield cycle before redeeming anything.`;
    case 'launchpad':
      return `Create an account on ${name}, finish any identity check it asks for, and take part in one public sale round with $${capital} committed.`;
    case 'prediction':
      return `Fund $${capital} on ${name} and place three or four positions on its most liquid markets, holding each one to resolution.`;
    case 'insurance':
      return `Underwrite $${capital} in ${name}'s capital pool on ${chain} for one full cover period, or buy cover on a position you already hold.`;
    case 'chain':
      return `Bridge $${capital} to ${chain} and use two native apps every week (one swap, one deposit), so the wallet touches several contracts, not one.`;
    case 'yield':
      return `Deposit $${capital} into ${name}'s flagship vault on ${chain} and leave the shares untouched; do not chase the highest-APY side vault.`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open and untouched for the whole window.`;
  }
}

/** Trim or pad one step into the gate's 20..600 character window. */
function stepFit(s: string): string {
  if (s.length > 600) return `${s.slice(0, 596)}...`;
  if (s.length < 20) return `${s} Keep the position open and log it.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each concrete, each carrying its cost and its time. Every word
 * of it is derived from the protocol's own record (family, chains, TVL, age) by the functions above;
 * no plan is written by hand for a name.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const second = secondChainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const steps = [
    `Set up a fresh wallet for ${p.name} alone and keep its seed phrase offline on paper. Fund it with $${capital + 25}: $${capital} to farm and a $${25} buffer for gas. Cost: ${gas} for the funding move. Time: 10 minutes.`,
    `${coreAction(p, capital, chain)} Cost: $${capital} of capital plus ${gas} a transaction. Time: 20 minutes to set up.`,
    `Repeat one small qualifying action every week — a swap, deposit, borrow or vote of $10-$25 — for the next ${Math.round(hold / 7)} weeks, on the same weekday so the streak is unbroken. Cost: ${gas} a week. Time: 10 minutes a week.`,
    `Hold the core position untouched for at least ${hold} days. Points and airdrop snapshots read balances and durations, and churning in and out resets most streak counters. Cost: the $${capital} stays locked in the position. Time: ${hold} days.`,
    second !== null
      ? `Repeat the core action once on ${second} with $${Math.max(25, Math.round(capital / 2))}: multi-chain activity is the cheapest signal that a wallet is a user and not a bot. Cost: ${gasFor(second)} plus the second position. Time: 15 minutes.`
      : `Check ${p.name}'s official points or rewards page once a week and complete any zero-cost task it lists; never connect the farm wallet to a page you reached from a direct message. Cost: nothing. Time: 5 minutes a week.`,
    `When ${p.name} announces anything, claim only from the link on its official page: never pay a claim fee and never sign a token approval you did not start. Log the wallet, the dates and every transaction hash after each step. Cost: nothing. Time: 5 minutes a step.`,
  ];
  return steps.map(stepFit);
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n and every watchlist slug aboard. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const pricing = categoryMultiples(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter((p) => watch.has(p.slug) || isRankable(p))
    .map((p) => {
      const v = impliedValue(p, snapshot.as_of, pricing, model);
      return { p, ...v };
    });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || bySlugAsc(a.p, b.p));
  const chosen = scored.slice(0, BOARD_MAX);
  const chosenSlugs = new Set(chosen.map((s) => s.p.slug));
  for (const s of scored) {
    if (watch.has(s.p.slug) && !chosenSlugs.has(s.p.slug)) chosen.push(s);
  }
  chosen.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || bySlugAsc(a.p, b.p));
  return chosen.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.implied,
    model: {
      multiple: s.multiple,
      peers: s.peers,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
    },
    farm_steps: farmSteps(s.p, s.age),
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

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const { global, table } = categoryMultiples(snapshot, model);
  const multiples = [...table.values()]
    .filter((m) => board.some((r) => (r.category ?? 'Uncategorised') === m.category))
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: { ...model, global_multiple: global },
    multiples,
    counts: {
      protocols: snapshot.protocols.length,
      pre_token: preToken,
      live: snapshot.protocols.length - preToken,
      products: preToken - snapshot.protocols.filter((p) => snapshot.watchlist.includes(p.slug) || isRankable(p)).length,
      watchlist: snapshot.watchlist.length,
      board: board.length,
      early: board.filter((r) => !r.watchlist).length,
    },
    rows: board,
    live: liveRows(snapshot),
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
