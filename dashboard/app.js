// Launch Radar's page, second build. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the scope, the farm-first strip, the ranked board, the already-trading
// and set-aside views, the model panel and a detail drawer per protocol. Every number on the
// page comes out of data.js; the detail drawer recomputes the row's implied value from the
// snapshot figures and says so, so what the reader sees is the model's own arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', band: 'all', growth: 'all', ev: 'all',
    watch: false, tab: 'board', sort: 'implied', dir: -1, selected: null
  };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(2); }
  function fmtC(n) { return String(Math.round(n * 1000) / 1000); }
  function fmtInt(n) { return Number(n).toLocaleString('en-US'); }

  // The model, restated in the page from the constants data.js carries:
  // implied = TVL x category multiple x growth x maturity, the multiple priced by main.ts
  // from the category's trading peers, growth asymmetric, maturity saturating.
  function growthFactor(change) {
    var m = DATA.model;
    if (change === null || change === undefined) return 1;
    if (change >= 0) return 1 + Math.min(change, m.growth_gain_cap_pct) * m.growth_gain_per_pct;
    return 1 + Math.max(change, m.growth_loss_floor_pct) * m.growth_loss_per_pct;
  }
  function maturityFactor(ageDays) {
    var m = DATA.model;
    return m.maturity_base + m.maturity_range * (1 - Math.exp(-Math.max(0, ageDays) / m.maturity_tau_days));
  }
  function impliedOf(row) {
    var age = row.age_days === null || row.age_days === undefined ? DATA.model.unknown_age_days : row.age_days;
    return Math.max(1, Math.round(row.tvl_usd * row.model.multiple * growthFactor(row.change_7d) * maturityFactor(age)));
  }
  function efficiencyOf(row) {
    return row.implied_value_usd / Math.max(1, row.plan_cost.total_usd);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('band')) state.band = params.get('band');
    if (params.get('growth')) state.growth = params.get('growth');
    if (params.get('ev')) state.ev = params.get('ev');
    if (params.get('watch') === '1') state.watch = true;
    if (['board', 'live', 'aside', 'model'].indexOf(params.get('tab')) >= 0) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.band !== 'all') params.set('band', state.band);
    if (state.growth !== 'all') params.set('growth', state.growth);
    if (state.ev !== 'all') params.set('ev', state.ev);
    if (state.watch) params.set('watch', '1');
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function bandOf(tvl) {
    if (tvl >= 1e9) return 'mega';
    if (tvl >= 2.5e8) return 'large';
    if (tvl >= 5e7) return 'floor';
    return 'early';
  }
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.band !== 'all' && bandOf(r.tvl_usd) !== state.band) return false;
      if (state.ev !== 'all' && r.evidence !== state.ev) return false;
      if (state.growth === 'up' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.growth === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (state.growth === 'flat' && r.change_7d !== null) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -Infinity : a.age_days; bv = b.age_days === null ? -Infinity : b.age_days; }
      else if (key === 'mult') { av = a.model.multiple; bv = b.model.multiple; }
      else if (key === 'plan') { av = a.plan_cost.total_usd; bv = b.plan_cost.total_usd; }
      else if (key === 'eff') { av = efficiencyOf(a); bv = efficiencyOf(b); }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name' }, 'LAUNCH ', el('em', { text: 'RADAR' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'model ', el('b', { text: DATA.model_version })),
        el('span', null, 'source ', el('b', { text: 'DefiLlama index (frozen)' }))
      )
    );
  }

  function lede() {
    var c = DATA.counts;
    return el('section', { class: 'lede' },
      el('h1', null, c.board + ' protocols that record ', el('span', { class: 'hl', text: 'no token yet' }), ', priced, graded and ranked'),
      el('p', { text: 'Each implied value is what a launch would be worth if the protocol\'s record froze today: its TVL priced at the multiple the market already pays its category\'s trading protocols, adjusted for seven-day growth and for how long it has run tokenless. Every price carries an evidence grade — how many trading peers it rests on, and how much they agree — and every row carries the farm plan for getting there early, with the plan\'s own price tag. A model, not a promise, and never a forecast of whether a token comes.' })
    );
  }

  var scopePoints = [];
  function scopePanel() {
    var canvas = el('canvas', { class: 'scope', id: 'scope', 'aria-label': 'Radar scope: every board row plotted by tokenless age and implied value' });
    canvas.addEventListener('click', function (e) {
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      var best = null, bestD = 15;
      scopePoints.forEach(function (pt) {
        var d = Math.hypot(pt.x - x, pt.y - y);
        if (d < bestD) { bestD = d; best = pt; }
      });
      if (best) openDetail(best.slug);
    });
    return el('section', { class: 'panel' },
      el('h2', { text: 'The scope' }),
      el('p', { class: 'sub', text: 'Every board row: tokenless age across, implied value up, the dot sized by TVL. Green is a rising week, red a falling one; an amber ring is the house watchlist. Select a dot for its protocol.' }),
      el('div', { class: 'scope-wrap' }, canvas),
      el('div', { class: 'scope-axis' }, el('span', { text: 'newly tracked' }), el('span', { text: 'tokenless age' }), el('span', { text: 'years without a token' })),
      el('div', { class: 'legend' },
        el('span', null, el('i', { style: 'background:#46e39a' }), 'TVL rising on the week'),
        el('span', null, el('i', { style: 'background:#ff7a6b' }), 'TVL falling'),
        el('span', null, el('i', { class: 'ring' }), 'on the house watchlist')
      )
    );
  }

  function drawScope() {
    var canvas = document.getElementById('scope');
    if (!canvas || !canvas.getContext) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    var rows = DATA.rows;
    var maxAge = 1, maxLog = 0, minLog = Infinity;
    rows.forEach(function (r) {
      var age = r.age_days === null ? DATA.model.unknown_age_days : r.age_days;
      if (age > maxAge) maxAge = age;
      var lg = Math.log10(Math.max(10, r.implied_value_usd));
      if (lg > maxLog) maxLog = lg;
      if (lg < minLog) minLog = lg;
    });
    var padL = 8, padR = 8, padT = 10, padB = 8;
    function px(age) { return padL + (Math.log1p(age) / Math.log1p(maxAge)) * (w - padL - padR); }
    function py(lg) { return padT + (1 - (lg - minLog) / Math.max(1, maxLog - minLog)) * (h - padT - padB); }
    ctx.strokeStyle = 'rgba(70,227,154,0.10)';
    ctx.lineWidth = 1;
    for (var i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(padL, padT + (h - padT - padB) * i / 4); ctx.lineTo(w - padR, padT + (h - padT - padB) * i / 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padL + (w - padL - padR) * i / 4, padT); ctx.lineTo(padL + (w - padL - padR) * i / 4, h - padB); ctx.stroke();
    }
    if (ctx.createConicGradient) {
      var sweep = ctx.createConicGradient(-0.5, w * 0.72, h * 0.34);
      sweep.addColorStop(0, 'rgba(70,227,154,0.13)');
      sweep.addColorStop(0.12, 'rgba(70,227,154,0)');
      sweep.addColorStop(1, 'rgba(70,227,154,0)');
      ctx.fillStyle = sweep;
      ctx.fillRect(0, 0, w, h);
    }
    scopePoints = [];
    rows.slice().sort(function (a, b) { return (a.watchlist ? 1 : 0) - (b.watchlist ? 1 : 0); }).forEach(function (r) {
      var age = r.age_days === null ? DATA.model.unknown_age_days : r.age_days;
      var x = px(age), y = py(Math.log10(Math.max(10, r.implied_value_usd)));
      var rad = 2.2 + Math.max(0, Math.log10(Math.max(1, r.tvl_usd)) - 6) * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = r.change_7d === null ? '#5a6b5c' : r.change_7d >= 0 ? 'rgba(70,227,154,0.85)' : 'rgba(255,122,107,0.85)';
      ctx.fill();
      if (r.watchlist) {
        ctx.beginPath(); ctx.arc(x, y, rad + 2.4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffb454'; ctx.lineWidth = 1.4; ctx.stroke();
      }
      scopePoints.push({ x: x, y: y, slug: r.slug });
    });
  }

  function farmFirst() {
    var top = DATA.rows.filter(function (r) { return r.tvl_usd < DATA.floor_usd; })
      .sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; }).slice(0, 5);
    return el('section', { class: 'panel' },
      el('h2', { text: 'Farm first — the early end' }),
      el('p', { class: 'sub', text: 'The most valuable rows still below the ' + fmtUsd(DATA.floor_usd) + ' watchlist floor: the launches a radar exists to catch before they are obvious. Each card prices the row\'s own plan and the model\'s claim per plan dollar.' }),
      el('div', { class: 'farm-first' }, top.map(function (r, i) {
        return el('button', { class: 'ff-card', type: 'button', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'ff-rank', text: 'F' + (i + 1) }),
          el('span', null,
            el('span', { class: 'ff-name' }, r.name, r.watchlist ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null),
            el('span', { class: 'ff-sub', text: (r.category || 'Uncategorised') + ' \u00B7 rank ' + r.rank + ' by value \u00B7 evidence ' + r.evidence })
          ),
          el('span', { class: 'ff-num' },
            el('b', { text: fmtUsd(r.implied_value_usd) }),
            el('span', { text: 'plan ' + fmtUsd(r.plan_cost.total_usd) + ' \u00B7 x' + fmtInt(Math.round(efficiencyOf(r))) + ' per $1' })
          )
        );
      }))
    );
  }

  function facts() {
    var c = DATA.counts;
    return el('section', { class: 'facts' },
      el('div', { class: 'fact' }, el('span', { text: 'Protocols scanned' }), el('b', { text: String(c.protocols) })),
      el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', null, String(c.watchlist), el('span', { class: 'of', text: ' / ' + c.watchlist }))),
      el('div', { class: 'fact' }, el('span', { text: 'Early rows beyond the watchlist' }), el('b', { text: String(c.early) })),
      el('div', { class: 'fact' }, el('span', { text: 'Set aside as products, with reasons' }), el('b', { text: String(c.aside) }))
    );
  }

  function selectField(id, label, options, value, onChange) {
    var sel = el('select', { id: id, 'aria-label': label },
      options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === value ? 'selected' : null }); })
    );
    sel.addEventListener('change', function () { onChange(sel.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watch ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    function tabButton(key, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === key ? 'true' : 'false', text: label, onclick: function () { state.tab = key; writeHash(); render(); } });
    }
    var countText = state.tab === 'board' ? visibleRows().length + ' of ' + DATA.rows.length + ' rows'
      : state.tab === 'live' ? DATA.live.length + ' of ' + DATA.counts.live + ' trading protocols'
      : state.tab === 'aside' ? DATA.aside.length + ' set aside, each with its reason'
      : DATA.multiples.length + ' categories priced';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      selectField('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      selectField('band', 'Size', [['all', 'All sizes'], ['mega', '$1B+ TVL'], ['large', '$250M-$1B'], ['floor', '$50M-$250M'], ['early', 'Under $50M — early']], state.band, function (v) { state.band = v; }),
      selectField('growth', 'Momentum', [['all', 'All momentum'], ['up', 'Rising on the week'], ['down', 'Falling on the week'], ['flat', 'No change on record']], state.growth, function (v) { state.growth = v; }),
      selectField('ev', 'Evidence', [['all', 'All evidence'], ['A', 'A — many agreeing peers'], ['B', 'B — a priced category'], ['C', 'C — thin evidence']], state.ev, function (v) { state.ev = v; }),
      el('label', { class: 'check' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub-label', text: 'View' }),
        el('div', { class: 'tabs' },
          tabButton('board', 'Pre-token board'),
          tabButton('live', 'Already trading'),
          tabButton('aside', 'Set aside'),
          tabButton('model', 'The model')
        )),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    var mark = state.sort === key ? (state.dir < 0 ? ' \u25BC' : ' \u25B2') : '';
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      } }, label + mark)
    );
  }

  function evChip(grade) {
    return el('span', { class: 'ev ev-' + grade.toLowerCase(), text: grade, title: 'Evidence ' + grade });
  }

  function boardTable() {
    var list = sortedRows(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'Nothing on the radar matches' }),
        el('p', { text: 'Clear the search or widen the filters and the board comes back.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.band = 'all'; state.growth = 'all'; state.ev = 'all'; state.watch = false; writeHash(); render();
        } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          r.watchlist ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null,
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' \u00B7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain unlisted') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.model.multiple) }),
        el('td', null, evChip(r.evidence)),
        el('td', { class: 'num', text: fmtUsd(r.plan_cost.total_usd) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / (max || 1)) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token on record' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied value. The amber badge is the house watchlist (TVL at or above the floor, no token on record, no parent product). The letter is the price\'s evidence grade; Plan is what the row\'s own farm plan costs, all-in. Select any row for its pricing, its peers and its plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('mult', 'Multiple'),
            el('th', { scope: 'col', text: 'Ev.' }),
            sortHeader('plan', 'Plan'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num rank', text: 'live' }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' \u00B7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'chain unlisted') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : fmtMult(r.ratio) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Set apart, not ranked: the largest of the ' + DATA.counts.live + ' protocols that already trade. Their market cap is a fact, and their caps over TVL — winsorised into the band the model panel states — are the evidence the board\'s multiples are priced from.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }),
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }),
            el('th', { scope: 'col', text: 'Market cap' }),
            el('th', { scope: 'col', text: 'Cap / TVL' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function asideTable() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.aside.filter(function (r) {
      if (!q) return true;
      return (r.name + ' ' + (r.category || '') + ' ' + r.reason).toLowerCase().indexOf(q) >= 0;
    });
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: r.category || 'Uncategorised' })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'reason', text: r.reason }),
        el('td', null, el('span', { class: 'status', text: 'set aside' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Every protocol that records no token and is still not ranked: ' + DATA.aside.length + ' of them. Each is a product of a token that already trades — a bridge\'s locked asset, a staking receipt, an exchange\'s shelf, a later version of another protocol\'s pool — so its launch is not still to come. The reason is printed per protocol, not asserted in bulk.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }),
            el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: 'Why it is not a launch candidate' }),
            el('th', { scope: 'col', text: 'Status' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var tbody = el('tbody');
    DATA.multiples.forEach(function (row) {
      tbody.appendChild(el('tr', null,
        el('td', { text: row.category }),
        el('td', { class: 'num', text: String(row.peers) }),
        el('td', { class: 'num', text: row.peer_median === null ? 'no peers' : fmtMult(row.peer_median) }),
        el('td', { class: 'num', text: row.dispersion === null ? 'n/a' : 'x' + row.dispersion.toFixed(2) }),
        el('td', null, evChip(row.grade)),
        el('td', { class: 'num', text: fmtMult(row.multiple) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the pricing works' }),
      el('p', { text: 'One function prices every row, from the snapshot\'s own figures only — its TVL, its seven-day change, its tokenless age, and the market caps of the protocols that already trade. No name is special-cased and no row is hand-picked; the detail view of any row recomputes its price in this page and lands on the board\'s number.' }),
      el('div', { class: 'formula', text: 'implied = round( tvl x multiple(category) x growth x maturity )' }),
      el('ul', null,
        el('li', null, el('b', { text: 'The multiple. ' }), 'A category\'s multiple is the median market-cap-to-TVL of its trading protocols, shrunk toward the global median (' + fmtMult(m.global_multiple) + ') by ' + m.shrink_peers + ' phantom peers and clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. Peer ratios are winsorised into [' + m.ratio_floor + ', ' + m.ratio_cap + '] first, so one wild peer — a huge cap on a sliver of TVL — cannot bend a category.'),
        el('li', null, el('b', { text: 'Growth, asymmetric. ' }), 'A rising week is credited at ' + fmtC(m.growth_gain_per_pct * 100) + '% of value per point, capped at +' + m.growth_gain_cap_pct + ' points; a falling week is charged at ' + fmtC(m.growth_loss_per_pct * 100) + '% per point down to ' + m.growth_loss_floor_pct + '. Inflow is cheap to fake for a week; outflow is not. An unreported change counts as neutral.'),
        el('li', null, el('b', { text: 'Maturity, saturating. ' }), fmtC(m.maturity_base) + ' at birth rising toward ' + fmtC(m.maturity_base + m.maturity_range) + ' on a curve with a ' + m.maturity_tau_days + '-day constant: the second tokenless year says more than the fourth. A protocol whose start date is unlisted is aged at ' + fmtInt(m.unknown_age_days) + ' days — the median tokenless age of this snapshot\'s own pre-token protocols, not a guess typed into the code.'),
        el('li', null, el('b', { text: 'Evidence grades. ' }), 'A: eight or more trading peers whose ratios agree (dispersion — the interquartile range over the median — at most 1.25). B: at least three peers and no wild scatter. C: everything thinner, including every price resting on one or two peers. A C price may still be right; the grade says how much company it has.'),
        el('li', null, el('b', { text: 'The separation. ' }), 'Of the ' + DATA.counts.pre_token + ' protocols that record no token, ' + DATA.counts.aside + ' are set aside before ranking — bridges, staking receipts, exchange shelves and versioned pools are products of tokens that already trade, listed one by one in the Set aside view — and the ' + DATA.counts.live + ' protocols that already trade are never ranked at all. The watchlist is a floor, never a ceiling: ' + DATA.counts.early + ' of the board\'s ' + DATA.counts.board + ' rows sit beyond it, because finding them early is the radar\'s whole job.')
      ),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Trading peers' }),
            el('th', { scope: 'col', text: 'Peer median cap/TVL' }),
            el('th', { scope: 'col', text: 'Dispersion' }),
            el('th', { scope: 'col', text: 'Evidence' }),
            el('th', { scope: 'col', text: 'Multiple used' })
          )),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function statCell(label, value, cls) {
    return el('div', cls ? { class: cls } : null, el('span', { text: label }), el('b', { text: value }));
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    var recomputed = impliedOf(row);
    var check = recomputed === row.implied_value_usd
      ? 'This page recomputes the row from the snapshot figures, in the open, and lands on the same number board.json carries.'
      : 'This page recomputes the row as ' + fmtUsd(recomputed) + ', which differs from the board — the data would be stale.';
    var catEntry = null;
    DATA.multiples.forEach(function (mm) { if (mm.category === (row.category || 'Uncategorised')) catEntry = mm; });
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'kicker', text: 'RANK ' + row.rank + ' OF ' + DATA.counts.board + (row.watchlist ? ' \u00B7 ON THE HOUSE WATCHLIST' : row.tvl_usd >= DATA.floor_usd ? ' \u00B7 ABOVE THE FLOOR, OFF THE WATCHLIST' : ' \u00B7 EARLY, BELOW THE FLOOR') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' \u00B7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'chain unlisted') + ' \u00B7 records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why it ranks here' }),
      el('p', { class: 'why', text: row.why })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The pricing, step by step' }),
      el('div', { class: 'equation' },
        statCell('TVL (snapshot)', fmtUsd(row.tvl_usd)),
        statCell('Category multiple', fmtMult(row.model.multiple)),
        statCell('Priced from peers', String(row.model.peers)),
        statCell('7d growth factor', 'x' + row.model.growth_multiplier.toFixed(3) + ' (' + fmtPct(row.change_7d) + ')'),
        statCell('Maturity factor', 'x' + row.model.maturity_multiplier.toFixed(3) + ' (' + fmtAge(row.age_days) + ' tokenless)'),
        statCell('Implied value', fmtUsd(row.implied_value_usd), 'total')
      ),
      el('p', { class: 'note', text: check })
    ));
    var evSection = el('section', { class: 'detail-section' },
      el('h3', { text: 'The evidence — who already trades in ' + (row.category || 'Uncategorised') }),
      el('p', { class: 'note', text: row.model.peers === 0
        ? 'No protocol in this category trades yet, so the row is priced at the global median multiple (' + fmtMult(DATA.model.global_multiple) + ') and graded C: a placeholder price, honestly labelled.'
        : 'Evidence ' + row.evidence + ': ' + row.model.peers + ' trading peer' + (row.model.peers === 1 ? '' : 's') + ', median cap/TVL ' + fmtMult(row.model.peer_median) + (row.model.dispersion === null ? ', too few to measure their agreement' : ', dispersion x' + row.model.dispersion.toFixed(2)) + '. The largest of them:' })
    );
    if (catEntry && catEntry.top_peers && catEntry.top_peers.length) {
      var ptbody = el('tbody');
      catEntry.top_peers.forEach(function (peer) {
        ptbody.appendChild(el('tr', null,
          el('td', { text: peer.name }),
          el('td', { class: 'num', text: fmtUsd(peer.tvl_usd) }),
          el('td', { class: 'num', text: fmtUsd(peer.mcap_usd) }),
          el('td', { class: 'num', text: fmtMult(peer.ratio) })
        ));
      });
      evSection.appendChild(el('table', { class: 'peers' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Trading peer' }),
          el('th', { scope: 'col', text: 'TVL' }),
          el('th', { scope: 'col', text: 'Market cap' }),
          el('th', { scope: 'col', text: 'Cap / TVL' })
        )),
        ptbody
      ));
    }
    dialog.appendChild(evSection);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — what it costs, all-in' }),
      el('div', { class: 'totals' },
        el('span', { class: 'chip' }, 'capital ', el('b', { text: fmtUsd(row.plan_cost.capital_usd) })),
        el('span', { class: 'chip' }, 'gas, estimated ', el('b', { text: fmtUsd(row.plan_cost.gas_usd) })),
        el('span', { class: 'chip' }, 'total ', el('b', { text: fmtUsd(row.plan_cost.total_usd) })),
        el('span', { class: 'chip' }, 'hold ', el('b', { text: row.plan_cost.hold_days + ' days' })),
        el('span', { class: 'chip' }, 'time ', el('b', { text: '~' + row.plan_cost.minutes_per_week + ' min/week' })),
        el('span', { class: 'chip' }, 'implied per plan $ ', el('b', { text: 'x' + fmtInt(Math.round(efficiencyOf(row))) }))
      ),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), tail ? el('span', { class: 'cost', text: tail }) : null);
      }))
    ));
    dialog.appendChild(el('div', { class: 'detail-foot', text: 'Implied value is this entry\'s model claim about a launch that may never come; it is not a price, a forecast or advice. DefiLlama\'s record is not proof: the protocol records no token, which is all anyone can say from the snapshot. The plan\'s gas is an estimate from the plan\'s own action count at the chain\'s going rate, not a quote.' }));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(el('div', { class: 'hero' }, scopePanel(), farmFirst()));
    shell.appendChild(facts());
    shell.appendChild(controls());
    if (state.tab === 'board') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'aside') shell.appendChild(asideTable());
    else shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'colophon', text: 'Built from one frozen DefiLlama snapshot dated ' + DATA.as_of + ': ' + DATA.counts.protocols + ' protocols, of which ' + DATA.counts.live + ' already trade and are set apart, ' + DATA.counts.aside + ' record no token but are products of ones that do, and ' + DATA.counts.board + ' are ranked. The board is regenerated from the snapshot by the entry\'s program; run it again on the same snapshot and every byte is the same.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    drawScope();
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
  window.addEventListener('resize', function () { drawScope(); });
})();
