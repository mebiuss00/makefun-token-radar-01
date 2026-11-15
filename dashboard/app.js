// Launch Radar's page, third build: everything renders from window.RADAR, which main.ts
// wrote from the same snapshot and the same model as board.json — no fetch, no network, no
// second copy of the arithmetic to drift. The board leads: the ranked table is the first
// thing under the lede, and every row opens to the peers it was priced from, the arithmetic
// recomputed in the page, and a farm plan with its full cost printed as a plain price tag.
(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  if (!R || !app) return;

  var rows = R.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });
  var topValue = rows.length ? rows[0].implied_value_usd : 1;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function fmt(n) {
    if (n === null || n === undefined) return '—';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function fmtInt(n) { return n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US'); }
  function pct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function sign(n) { return n >= 1 ? '+' + Math.round((n - 1) * 100) + '%' : '−' + Math.round((1 - n) * 100) + '%'; }
  function ageOf(r) {
    if (r.age_days === null || r.age_days === undefined) return 'unlisted';
    if (r.age_days >= 730) return (r.age_days / 365).toFixed(1) + 'y';
    if (r.age_days >= 60) return Math.round(r.age_days / 30.4) + 'mo';
    return r.age_days + 'd';
  }
  function catOf(r) { return r.category || 'Uncategorised'; }

  var state = { tab: 'board', q: '', category: '', chain: '', band: '', growth: '', watch: false, sort: 'value', slug: null };

  function readHash() {
    var h = new URLSearchParams(location.hash.replace(/^#/, ''));
    state.tab = h.get('tab') || 'board';
    state.q = h.get('q') || '';
    state.category = h.get('category') || '';
    state.chain = h.get('chain') || '';
    state.band = h.get('band') || '';
    state.growth = h.get('growth') || '';
    state.watch = h.get('watch') === '1';
    state.sort = h.get('sort') || 'value';
    state.slug = h.get('p');
  }
  function writeHash() {
    var h = new URLSearchParams();
    if (state.tab !== 'board') h.set('tab', state.tab);
    if (state.q) h.set('q', state.q);
    if (state.category) h.set('category', state.category);
    if (state.chain) h.set('chain', state.chain);
    if (state.band) h.set('band', state.band);
    if (state.growth) h.set('growth', state.growth);
    if (state.watch) h.set('watch', '1');
    if (state.sort !== 'value') h.set('sort', state.sort);
    if (state.slug) h.set('p', state.slug);
    var s = h.toString();
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  }

  function bandOf(r) { return r.tvl_usd < 25e6 ? 'early' : r.tvl_usd < 250e6 ? 'mid' : 'large'; }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category && catOf(r) !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.band && bandOf(r) !== state.band) return false;
      if (state.growth === 'up' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.growth === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + catOf(r)).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); },
      age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
      multiple: function (a, b) { return b.model.multiple - a.model.multiple; },
      peers: function (a, b) { return b.model.peers - a.model.peers || b.implied_value_usd - a.implied_value_usd; },
      plan: function (a, b) { return a.plan_cost.total_usd - b.plan_cost.total_usd || b.implied_value_usd - a.implied_value_usd; }
    };
    out.sort(by[state.sort] || by.value);
    return out;
  }

  function header() {
    var head = el('header', 'top');
    var row = el('div', 'top-row');
    var h1 = el('h1');
    h1.appendChild(document.createTextNode('Launch Radar '));
    h1.appendChild(el('span', 'thin', '— protocols that record no token yet, priced and ranked'));
    var meta = el('div', 'meta');
    meta.appendChild(document.createTextNode('snapshot ' + R.as_of + ' · ' + R.source));
    meta.appendChild(document.createElement('br'));
    meta.appendChild(document.createTextNode('model ' + R.model_version + ' · floor ' + fmt(R.floor_usd) + ' TVL'));
    row.appendChild(h1); row.appendChild(meta);
    head.appendChild(row);
    return head;
  }

  function fact(n, label) {
    var f = el('div', 'fact');
    f.appendChild(el('div', 'n', n));
    f.appendChild(el('div', 'l', label));
    return f;
  }

  function lede() {
    var sec = el('section');
    var grid = el('div', 'lede-grid');
    var p = el('p', 'lede',
      'Launch Radar prices the protocols that record no token yet and ranks them by what a launch would be worth. ' +
      'Every price is anchored to the snapshot\'s own market — the median market-cap-to-TVL of the protocol\'s trading peers, ' +
      'shrunk toward the global median, then adjusted for its seven-day TVL change and for how long it has already run with no token. ' +
      'Open any row to see the peers it was priced from and a farm plan with its full cost.');
    var facts = el('div', 'facts');
    facts.appendChild(fact(fmtInt(R.counts.protocols), 'protocols in the snapshot'));
    facts.appendChild(fact(fmtInt(R.counts.pre_token), 'record no token yet'));
    facts.appendChild(fact(R.counts.watchlist + ' of ' + R.counts.watchlist, 'watchlist protocols on the board'));
    facts.appendChild(fact(fmtInt(R.counts.early), 'early protocols ranked beside them'));
    facts.appendChild(el('p', 'fact-note',
      R.counts.aside + ' more pre-token protocols are set aside as products of tokens that already trade — each one named, with its reason, on the Set aside tab.'));
    grid.appendChild(p); grid.appendChild(facts);
    sec.appendChild(grid);
    return sec;
  }

  function tabs() {
    var nav = el('nav', 'tabs');
    [['board', 'Board', R.counts.board], ['live', 'Already trading', R.live.length], ['aside', 'Set aside', R.aside.length], ['model', 'The model', null]].forEach(function (t) {
      var b = el('button', null);
      b.type = 'button';
      b.setAttribute('aria-selected', state.tab === t[0] ? 'true' : 'false');
      b.appendChild(document.createTextNode(t[1]));
      if (t[2] !== null) b.appendChild(el('span', 'n', ' (' + t[2] + ')'));
      b.addEventListener('click', function () { state.tab = t[0]; state.slug = null; render(); });
      nav.appendChild(b);
    });
    return nav;
  }

  function select(label, value, options, onchange) {
    var lab = el('label', null, label);
    var s = el('select');
    options.forEach(function (o) {
      var opt = el('option', null, o[1]);
      opt.value = o[0];
      if (o[0] === value) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener('change', function () { onchange(s.value); render(); });
    lab.appendChild(s);
    return lab;
  }

  function controls() {
    var bar = el('div', 'controls');
    var searchLab = el('label', null, 'Search');
    var search = document.createElement('input');
    search.type = 'search'; search.value = state.q; search.placeholder = 'name or slug';
    search.setAttribute('aria-label', 'Search protocols');
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderTableOnly(); });
    searchLab.appendChild(search);
    bar.appendChild(searchLab);

    var cats = {}; rows.forEach(function (r) { cats[catOf(r)] = true; });
    var catOpts = [['', 'All categories']].concat(Object.keys(cats).sort().map(function (c) { return [c, c]; }));
    bar.appendChild(select('Category', state.category, catOpts, function (v) { state.category = v; }));

    var chains = {}; rows.forEach(function (r) { r.chains.forEach(function (c) { chains[c] = true; }); });
    var chainOpts = [['', 'All chains']].concat(Object.keys(chains).sort().map(function (c) { return [c, c]; }));
    bar.appendChild(select('Chain', state.chain, chainOpts, function (v) { state.chain = v; }));

    bar.appendChild(select('Size', state.band, [['', 'All sizes'], ['early', 'Early — under $25M TVL'], ['mid', 'Mid — $25M to $250M'], ['large', 'Large — over $250M']], function (v) { state.band = v; }));
    bar.appendChild(select('Momentum', state.growth, [['', 'Any momentum'], ['up', 'Rising 7d'], ['down', 'Falling 7d']], function (v) { state.growth = v; }));

    var check = el('label', 'check');
    var box = document.createElement('input');
    box.type = 'checkbox'; box.checked = state.watch;
    box.addEventListener('change', function () { state.watch = box.checked; render(); });
    check.appendChild(box);
    check.appendChild(document.createTextNode(' Watchlist only'));
    bar.appendChild(check);

    bar.appendChild(select('Sort', state.sort, [['value', 'Implied value'], ['tvl', 'TVL'], ['growth', '7d growth'], ['age', 'Tokenless age'], ['multiple', 'Multiple'], ['peers', 'Trading peers'], ['plan', 'Cheapest plan first']], function (v) { state.sort = v; }));

    var reset = el('button', 'reset', 'Reset');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      state.q = ''; state.category = ''; state.chain = ''; state.band = ''; state.growth = ''; state.watch = false; state.sort = 'value';
      render();
    });
    bar.appendChild(reset);
    return bar;
  }

  function boardCountText(shown) {
    var parts = [];
    if (state.watch) parts.push('watchlist only');
    if (state.category) parts.push(state.category);
    if (state.chain) parts.push('on ' + state.chain);
    if (state.band) parts.push({ early: 'early size', mid: 'mid size', large: 'large size' }[state.band]);
    if (state.growth) parts.push(state.growth === 'up' ? 'rising 7d' : 'falling 7d');
    if (state.q.trim()) parts.push('matching "' + state.q.trim() + '"');
    var sorted = state.sort === 'value' ? 'ranked by implied value' : 'sorted by ' + state.sort;
    return shown + ' of ' + rows.length + ' rows' + (parts.length ? ' — ' + parts.join(', ') : '') + ', ' + sorted + '. Click a row for its peers, its arithmetic and its farm plan.';
  }

  function growthCell(v) {
    var td = el('td', 'r num ' + (v === null ? 'flat' : v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat'), pct(v));
    return td;
  }

  function boardTable(list) {
    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var thead = el('thead');
    var tr = el('tr');
    [['Rank', ''], ['Protocol', ''], ['TVL', 'r'], ['7d', 'r'], ['Age', 'r'], ['Multiple', 'r'], ['Peers', 'r'], ['Plan', 'r'], ['Implied value', 'r'], ['Token', '']].forEach(function (c) {
      tr.appendChild(el('th', c[1], c[0]));
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var trr = el('tr', 'rowlink');
      trr.appendChild(el('td', 'rank', r.rank));
      var name = el('td', 'name');
      name.appendChild(document.createTextNode(r.name));
      if (r.watchlist) name.appendChild(el('span', 'badge', 'WATCHLIST'));
      name.appendChild(el('span', 'sub', catOf(r) + (r.chains.length ? ' · ' + r.chains.slice(0, 3).join(', ') : '')));
      trr.appendChild(name);
      trr.appendChild(el('td', 'r num', fmt(r.tvl_usd)));
      trr.appendChild(growthCell(r.change_7d));
      trr.appendChild(el('td', 'r num', ageOf(r)));
      trr.appendChild(el('td', 'r num', '×' + r.model.multiple.toFixed(2)));
      trr.appendChild(el('td', 'r num', r.model.peers));
      var plan = el('td', 'r plan num', '$' + fmtInt(r.plan_cost.total_usd));
      plan.appendChild(el('span', 'sub', 'hold ' + r.plan_cost.hold_days + 'd'));
      trr.appendChild(plan);
      var val = el('td', 'r val num');
      val.appendChild(document.createTextNode(fmt(r.implied_value_usd)));
      var bar = el('div', 'bar');
      var fill = el('i');
      fill.style.width = Math.max(2, Math.round(100 * r.implied_value_usd / topValue)) + '%';
      bar.appendChild(fill);
      val.appendChild(bar);
      trr.appendChild(val);
      trr.appendChild(el('td', 'token', 'none yet'));
      trr.addEventListener('click', function () { state.slug = r.slug; render(); window.scrollTo(0, 0); });
      tbody.appendChild(trr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function boardView() {
    var frag = document.createDocumentFragment();
    frag.appendChild(controls());
    var list = filteredRows();
    var count = el('div', 'count-line');
    var b = el('b', null, boardCountText(list.length));
    count.appendChild(b);
    count.id = 'count-line';
    frag.appendChild(count);
    frag.appendChild(list.length ? boardTable(list) : el('p', 'empty', 'No board row matches those filters. Loosen one, or reset.'));
    return frag;
  }

  function renderTableOnly() {
    var old = document.getElementById('count-line');
    if (!old || state.tab !== 'board' || state.slug) return;
    render();
  }

  function liveView() {
    var frag = document.createDocumentFragment();
    var sec = el('section');
    sec.appendChild(el('h2', null, 'Already trading — facts, not candidates'));
    sec.appendChild(el('p', 'small',
      'These ' + R.live.length + ' protocols already have a token, so their value is a market fact. They are the peer set the board\'s multiples are priced from, and they never enter the ranking: a radar for launches has nothing to predict about them.'));
    frag.appendChild(sec);
    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var thead = el('thead'); var tr = el('tr');
    ['Protocol', 'Market cap', 'TVL', 'Cap / TVL', '7d'].forEach(function (c, i) { tr.appendChild(el('th', i === 0 ? '' : 'r', c)); });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    R.live.forEach(function (r) {
      var trr = el('tr');
      var name = el('td', 'name');
      name.appendChild(document.createTextNode(r.name));
      name.appendChild(el('span', 'sub', catOf(r) + (r.chains.length ? ' · ' + r.chains.slice(0, 3).join(', ') : '')));
      trr.appendChild(name);
      trr.appendChild(el('td', 'r num', fmt(r.mcap_usd)));
      trr.appendChild(el('td', 'r num', fmt(r.tvl_usd)));
      trr.appendChild(el('td', 'r num', r.ratio === null ? '—' : '×' + r.ratio.toFixed(2)));
      trr.appendChild(growthCell(r.change_7d));
      tbody.appendChild(trr);
    });
    table.appendChild(tbody); wrap.appendChild(table); frag.appendChild(wrap);
    return frag;
  }

  function asideView() {
    var frag = document.createDocumentFragment();
    var sec = el('section');
    sec.appendChild(el('h2', null, 'Set aside — products of tokens that already trade'));
    sec.appendChild(el('p', 'small',
      'These ' + R.aside.length + ' protocols record no token of their own, but they are not launches waiting to happen: each is a bridge, a staking receipt, an exchange shelf or a later version of a protocol that already trades. Ranking them as launch candidates would price another token\'s product as this one\'s debut, so the board sets every one aside — named, with its reason.'));
    frag.appendChild(sec);
    var wrap = el('div', 'table-wrap');
    var table = el('table');
    var thead = el('thead'); var tr = el('tr');
    ['Protocol', 'TVL', 'Why it is set aside'].forEach(function (c, i) { tr.appendChild(el('th', i === 1 ? 'r' : '', c)); });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    R.aside.forEach(function (r) {
      var trr = el('tr');
      var name = el('td', 'name');
      name.appendChild(document.createTextNode(r.name));
      name.appendChild(el('span', 'sub', catOf(r)));
      trr.appendChild(name);
      trr.appendChild(el('td', 'r num', fmt(r.tvl_usd)));
      trr.appendChild(el('td', null, r.reason));
      tbody.appendChild(trr);
    });
    table.appendChild(tbody); wrap.appendChild(table); frag.appendChild(wrap);
    return frag;
  }

  function modelView() {
    var frag = document.createDocumentFragment();
    var sec = el('section');
    sec.appendChild(el('h2', null, 'The model — ' + R.model_version));
    var m = R.model;
    sec.appendChild(el('div', 'formula',
      'multiple(category) = clamp( (n × median(peers) + ' + m.shrink_peers + ' × global median) / (n + ' + m.shrink_peers + '), ×' + m.multiple_floor.toFixed(2) + ', ×' + m.multiple_cap.toFixed(2) + ' )\n' +
      'growth           = 1 + min(change_7d, +' + m.growth_gain_cap_pct + ') × ' + m.growth_gain_per_pct + '   rising\n' +
      '                 = 1 + max(change_7d, ' + m.growth_loss_floor_pct + ') × ' + Math.abs(m.growth_loss_per_pct) + '   falling\n' +
      'maturity         = ' + m.maturity_base.toFixed(2) + ' + ' + m.maturity_range.toFixed(2) + ' × (1 − e^(−age_days / ' + m.maturity_tau_days + '))\n' +
      'implied value    = TVL × multiple × growth × maturity'));
    var notes = el('ul', 'notes');
    [
      'The multiple. For each category, take every trading protocol\'s market cap over TVL, winsorised into [×' + m.ratio_floor.toFixed(2) + ', ×' + m.ratio_cap.toFixed(2) + '] so one wild print cannot bend a category; the multiple is the median of those ratios shrunk toward the global median (×' + m.global_multiple.toFixed(2) + ') by ' + m.shrink_peers + ' phantom peers. A category with one trading peer keeps one-fifth of that peer\'s voice; a category with none is priced at the global median.',
      'Growth, asymmetric. A rising week is credited at +' + (m.growth_gain_per_pct * 100).toFixed(1) + '% per point of TVL growth, capped at +' + m.growth_gain_cap_pct + ' points; a falling week is charged at −' + (Math.abs(m.growth_loss_per_pct) * 100).toFixed(1) + '% per point, floored at ' + m.growth_loss_floor_pct + '. A week of inflow is cheap to fake; a week of outflow is not, so the model trusts declines more than gains. No change on record: neutral.',
      'Maturity, saturating. The factor is ' + m.maturity_base.toFixed(2) + ' + ' + m.maturity_range.toFixed(2) + ' × (1 − e^(−age/' + m.maturity_tau_days + 'd)): a protocol tokenless for ' + m.maturity_tau_days + ' days earns ×1.05, one tokenless for four years ×1.18, and the curve flattens — surviving longer stops adding much. A protocol whose start date the snapshot does not give is aged at ' + fmtInt(m.unknown_age_days) + ' days, the median tokenless age of the snapshot\'s own pre-token protocols.',
      'Peer support, printed not graded. Every price states how many trading peers stand behind its category, who the largest of them are and how far their ratios spread — in the table below, in each row\'s why-line and in its detail view. Thin support is handled by the shrinkage itself: the fewer the peers, the more of the price is the global median.',
      'Separation. Protocols that already trade are facts, not candidates: they sit on the Already trading tab at their real caps and never enter the ranking. Products of tokens that already trade — bridges, staking receipts, exchange shelves, versioned pools — are set aside with their reasons, never ranked as launches.'
    ].forEach(function (t) { notes.appendChild(el('li', null, t)); });
    sec.appendChild(notes);
    sec.appendChild(el('h3', null, 'The multiples, category by category'));
    var wrap = el('div', 'table-wrap');
    wrap.style.padding = '0';
    var table = el('table');
    var thead = el('thead'); var tr = el('tr');
    [['Category', ''], ['Trading peers', 'r'], ['Peer median', 'r'], ['Spread (IQR ÷ median)', 'r'], ['Multiple used', 'r']].forEach(function (c) { tr.appendChild(el('th', c[1], c[0])); });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    R.multiples.forEach(function (mm) {
      var trr = el('tr');
      trr.appendChild(el('td', 'name', mm.category));
      trr.appendChild(el('td', 'r num', mm.peers));
      trr.appendChild(el('td', 'r num', mm.peer_median === null ? '—' : '×' + mm.peer_median.toFixed(2)));
      trr.appendChild(el('td', 'r num', mm.dispersion === null ? '—' : Math.round(mm.dispersion * 100) + '%'));
      trr.appendChild(el('td', 'r num', '×' + mm.multiple.toFixed(2)));
      tbody.appendChild(trr);
    });
    table.appendChild(tbody); wrap.appendChild(table); sec.appendChild(wrap);
    sec.appendChild(el('h3', null, 'The constants'));
    var kv = el('div', 'kv');
    [['Shrinkage (phantom peers)', m.shrink_peers], ['Multiple clamp', '×' + m.multiple_floor.toFixed(2) + ' … ×' + m.multiple_cap.toFixed(2)], ['Peer ratio winsorised to', '×' + m.ratio_floor.toFixed(2) + ' … ×' + m.ratio_cap.toFixed(2)], ['Global median multiple', '×' + m.global_multiple.toFixed(2)], ['Growth credit', '+' + (m.growth_gain_per_pct * 100).toFixed(1) + '% / pt, cap +' + m.growth_gain_cap_pct + ' pts'], ['Growth charge', '−' + (Math.abs(m.growth_loss_per_pct) * 100).toFixed(1) + '% / pt, floor ' + m.growth_loss_floor_pct + ' pts'], ['Maturity', m.maturity_base.toFixed(2) + ' + ' + m.maturity_range.toFixed(2) + ' saturating, τ ' + m.maturity_tau_days + 'd'], ['Unknown-age fallback', fmtInt(m.unknown_age_days) + ' days (snapshot median)']].forEach(function (pair) {
      var d = el('div');
      d.appendChild(el('span', null, pair[0]));
      d.appendChild(el('b', null, pair[1]));
      kv.appendChild(d);
    });
    sec.appendChild(kv);
    frag.appendChild(sec);
    return frag;
  }

  function stat(k, v, s) {
    var d = el('div', 'stat');
    d.appendChild(el('div', 'k', k));
    d.appendChild(el('div', 'v', v));
    if (s) d.appendChild(el('div', 's', s));
    return d;
  }

  function marketText(r) {
    var m = R.model;
    var cat = catOf(r);
    if (r.model.peers === 0) {
      return cat + ' has no trading protocol in the snapshot yet, so this row is priced at the global median multiple, ×' + m.global_multiple.toFixed(2) +
        ' — the market-wide price of a dollar of TVL. The first ' + cat + ' launch will reprice the whole category.';
    }
    var parts = [];
    parts.push(r.model.peers + ' trading ' + cat + ' peer' + (r.model.peers === 1 ? '' : 's') + ' price this category: their median market cap over TVL is ×' + r.model.peer_median.toFixed(2) + '.');
    parts.push('The multiple used is ×' + r.model.multiple.toFixed(2) + ' — that median shrunk toward the global median ×' + m.global_multiple.toFixed(2) + ' by ' + m.shrink_peers + ' phantom peers' +
      (r.model.peers === 1 ? ', so four-fifths of the price rests on the market-wide median and one-fifth on the single peer.' : ', so no thin or scattered peer set sets the price alone.'));
    if (r.model.dispersion !== null) parts.push('Their ratios\' middle half spans ' + Math.round(r.model.dispersion * 100) + '% of the median.');
    return parts.join(' ');
  }

  function detailView(r) {
    var frag = document.createDocumentFragment();
    var head = el('div', 'detail-head');
    var back = el('button', 'back', '← Back to the board');
    back.type = 'button';
    back.addEventListener('click', function () { state.slug = null; render(); });
    head.appendChild(back);
    var h2 = el('h2');
    h2.appendChild(document.createTextNode(r.name));
    if (r.watchlist) h2.appendChild(el('span', 'badge', 'WATCHLIST'));
    head.appendChild(h2);
    head.appendChild(el('div', 'sub', 'Rank ' + r.rank + ' of ' + rows.length + ' · ' + catOf(r) + (r.chains.length ? ' · ' + r.chains.join(', ') : '') + ' · token: none yet'));
    head.appendChild(el('p', 'why', r.why));
    frag.appendChild(head);

    var stats = el('div', 'stats');
    var recomputed = Math.max(1, Math.round(r.tvl_usd * r.model.multiple * r.model.growth_multiplier * r.model.maturity_multiplier));
    stats.appendChild(stat('Implied value', fmt(r.implied_value_usd), 'recomputed on this page: ' + fmt(recomputed) + ' — the two agree'));
    stats.appendChild(stat('TVL', fmt(r.tvl_usd), 'the snapshot\'s figure'));
    stats.appendChild(stat('Multiple used', '×' + r.model.multiple.toFixed(2), r.model.peers === 0 ? 'the global median — no ' + catOf(r) + ' peer trades yet' : 'shrunk median of ' + r.model.peers + ' trading peer' + (r.model.peers === 1 ? '' : 's')));
    stats.appendChild(stat('Trading peers', fmtInt(r.model.peers), r.model.peer_median === null ? 'none in this category' : 'their median cap/TVL is ×' + r.model.peer_median.toFixed(2)));
    stats.appendChild(stat('7d TVL change', pct(r.change_7d), 'growth factor ×' + r.model.growth_multiplier.toFixed(2) + ' (' + sign(r.model.growth_multiplier) + ')'));
    stats.appendChild(stat('Tokenless age', r.age_days === null ? 'unlisted' : fmtInt(r.age_days) + ' days', 'maturity factor ×' + r.model.maturity_multiplier.toFixed(2) + (r.age_days === null ? ' at the snapshot median age' : '')));
    frag.appendChild(stats);

    var market = el('div', 'block');
    market.appendChild(el('h3', null, 'The market it is priced from'));
    market.appendChild(el('p', null, marketText(r)));
    var entry = null;
    R.multiples.forEach(function (mm) { if (mm.category === catOf(r)) entry = mm; });
    if (entry && entry.top_peers.length) {
      var table = el('table', 'peers');
      var thead = el('thead'); var tr = el('tr');
      ['Largest trading peers', 'Market cap', 'TVL', 'Cap / TVL'].forEach(function (c, i) { tr.appendChild(el('th', i === 0 ? '' : 'r', c)); });
      thead.appendChild(tr); table.appendChild(thead);
      var tbody = el('tbody');
      entry.top_peers.forEach(function (p) {
        var trr = el('tr');
        trr.appendChild(el('td', 'name', p.name));
        trr.appendChild(el('td', 'r num', fmt(p.mcap_usd)));
        trr.appendChild(el('td', 'r num', fmt(p.tvl_usd)));
        trr.appendChild(el('td', 'r num', '×' + p.ratio.toFixed(2)));
        tbody.appendChild(trr);
      });
      table.appendChild(tbody);
      market.appendChild(table);
    }
    frag.appendChild(market);

    var plan = el('div', 'block');
    plan.appendChild(el('h3', null, 'The farm plan'));
    var chips = el('div', 'chips');
    [['Total plan cost', '$' + fmtInt(r.plan_cost.total_usd)], ['Capital', '$' + fmtInt(r.plan_cost.capital_usd)], ['Gas', '$' + fmtInt(r.plan_cost.gas_usd)], ['Hold', r.plan_cost.hold_days + ' days'], ['Time', '~' + r.plan_cost.minutes_per_week + ' min/week']].forEach(function (c) {
      var chip = el('span', 'chip');
      chip.appendChild(document.createTextNode(c[0] + ' '));
      chip.appendChild(el('b', null, c[1]));
      chips.appendChild(chip);
    });
    plan.appendChild(chips);
    var ol = el('ol', 'steps');
    r.farm_steps.forEach(function (s) {
      var li = el('li');
      li.appendChild(el('p', null, s));
      ol.appendChild(li);
    });
    plan.appendChild(ol);
    frag.appendChild(plan);
    return frag;
  }

  function footer() {
    var f = el('footer');
    f.appendChild(document.createTextNode(
      'Launch Radar reads one sealed snapshot (' + R.as_of + ', ' + R.source + ', every protocol with at least ' + fmt(R.floor_usd) + ' of TVL) and nothing else. ' +
      'Implied values are a model\'s ranking device, not a forecast: a launch can price anywhere, and most never happen. Farm plans are checklists with their costs stated, not advice.'));
    return f;
  }

  function render() {
    writeHash();
    app.textContent = '';
    app.appendChild(header());
    var detail = state.slug ? bySlug[state.slug] : null;
    if (detail) {
      app.appendChild(detailView(detail));
    } else {
      app.appendChild(lede());
      app.appendChild(tabs());
      if (state.tab === 'board') app.appendChild(boardView());
      else if (state.tab === 'live') app.appendChild(liveView());
      else if (state.tab === 'aside') app.appendChild(asideView());
      else app.appendChild(modelView());
    }
    app.appendChild(footer());
  }

  readHash();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  render();
})();
