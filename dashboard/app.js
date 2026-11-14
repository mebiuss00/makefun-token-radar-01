// Launch Radar's page. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, the filters, a detail drawer per protocol and the model panel. Every number
// on the page comes out of data.js; the detail drawer recomputes the row's implied value from
// the snapshot figures and says so, so what the reader sees is the model's own arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre', sort: 'implied', dir: -1, selected: null };

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

  // The model, restated in the page: implied = TVL x category multiple x growth x maturity.
  // The multiple comes from the row (priced off its category's trading peers), the two factors
  // from the snapshot figures and the constants data.js carries.
  function impliedOf(row) {
    var m = DATA.model;
    var growthPct = Math.min(m.growth_cap_pct, Math.max(m.growth_floor_pct, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + growthPct * m.growth_per_pct;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturityMult = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.model.multiple * growthMult * maturityMult));
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
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watch) params.set('watch', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
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
      el('div', null,
        el('h1', null, c.board + ' protocols that record ', el('span', { class: 'hl', text: 'no token yet' }), ', priced and ranked'),
        el('p', { text: 'Each implied value is what a launch would be worth if the protocol\'s record froze today: its TVL priced at the multiple the market already pays its category\'s trading protocols, adjusted for seven-day growth and for how long it has run tokenless. Every row carries the farm plan for getting there early. A model, not a promise — and never a forecast of whether a token comes.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Protocols scanned' }), el('b', { text: String(c.protocols) })),
        el('div', { class: 'fact' }, el('span', { text: 'Record no token' }), el('b', { text: String(c.pre_token) })),
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', null, String(c.watchlist), el('span', { class: 'of', text: ' / ' + c.watchlist }))),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows beyond the watchlist' }), el('b', { text: String(c.early) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watch ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Already trading', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub-label', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre' ? visibleRows().length + ' of ' + DATA.rows.length + ' rows' : DATA.live.length + ' trading protocols' })
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

  function boardTable() {
    var list = sortedRows(visibleRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'Nothing on the radar matches' }),
        el('p', { text: 'Clear the search or widen the filters and the board comes back.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; writeHash(); render();
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
          el('caption', { text: 'Pre-token protocols ranked by implied value. The amber badge is the house watchlist (TVL at or above the floor, no token on record, no parent product). Select any row for its pricing and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('mult', 'Multiple'),
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
          el('caption', { text: 'Set aside, not ranked: these protocols already trade, so their market cap is a fact. Their caps over TVL are the evidence the board\'s multiples are priced from.' }),
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

  function modelPanel() {
    var m = DATA.model;
    var tbody = el('tbody');
    DATA.multiples.forEach(function (row) {
      tbody.appendChild(el('tr', null,
        el('td', { text: row.category }),
        el('td', { class: 'num', text: String(row.peers) }),
        el('td', { class: 'num', text: row.peer_median === null ? 'no peers' : fmtMult(row.peer_median) }),
        el('td', { class: 'num', text: fmtMult(row.multiple) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the pricing works' }),
      el('p', { class: 'sub', text: 'One function prices every row, from the snapshot\'s own figures only. A category\'s multiple is the median market-cap-to-TVL of its protocols that already trade, shrunk toward the global median (' + fmtMult(m.global_multiple) + ') by ' + m.shrink_peers + ' phantom peers so a thin category cannot shout, and clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']. Growth and maturity then adjust for momentum and for time already served with no token. No name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula', text: 'implied = round( tvl x multiple(category) x (1 + clamp(change_7d, ' + m.growth_floor_pct + ', ' + m.growth_cap_pct + ') x ' + m.growth_per_pct + ') x (' + m.maturity_floor + ' + ' + m.maturity_range + ' x min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ') )' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Trading peers' }),
            el('th', { scope: 'col', text: 'Peer median cap/TVL' }),
            el('th', { scope: 'col', text: 'Multiple used' })
          )),
          tbody
        )
      ),
      el('p', { class: 'sub', text: 'An unreported seven-day change counts as 0 and an unlisted start date counts as ' + m.unknown_age_days + ' days. The watchlist is a floor, never a ceiling: the board also ranks pre-token protocols beyond it, because finding them early is the radar\'s whole job. Of the ' + DATA.counts.pre_token + ' protocols that record no token, ' + DATA.counts.products + ' are set aside before ranking: bridges, staking wrappers and exchange shelves are products of a token that already trades, not launches of their own.' })
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
      ? 'This page recomputes the row from the snapshot figures and lands on the same number board.json carries.'
      : 'This page recomputes the row as ' + fmtUsd(recomputed) + ', which differs from the board — the data would be stale.';
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
      el('h3', { text: 'The pricing, step by step' }),
      el('div', { class: 'equation' },
        statCell('TVL (snapshot)', fmtUsd(row.tvl_usd)),
        statCell('Category multiple', fmtMult(row.model.multiple)),
        statCell('Priced from peers', String(row.model.peers)),
        statCell('7d growth factor', 'x' + row.model.growth_multiplier.toFixed(3) + ' (' + fmtPct(row.change_7d) + ')'),
        statCell('Maturity factor', 'x' + row.model.maturity_multiplier.toFixed(3) + ' (' + fmtAge(row.age_days) + ' tokenless)'),
        statCell('Implied value', fmtUsd(row.implied_value_usd), 'total')
      ),
      el('p', { class: 'note', text: check + ' The multiple is the shrunk median cap-to-TVL of the ' + row.model.peers + ' trading protocols in its category — the market\'s own price for a TVL dollar there, not a guess at this protocol.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), tail ? el('span', { class: 'cost', text: tail }) : null);
      }))
    ));
    dialog.appendChild(el('div', { class: 'detail-foot', text: 'Implied value is this entry\'s model claim about a launch that may never come; it is not a price, a forecast or advice. DefiLlama\'s record is not proof: the protocol records no token, which is all anyone can say from the snapshot.' }));
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
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre' ? boardTable() : liveTable());
    if (state.tab === 'pre') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'colophon', text: 'Built from one frozen DefiLlama snapshot dated ' + DATA.as_of + ': ' + DATA.counts.protocols + ' protocols, of which ' + DATA.counts.live + ' already trade and are set aside. The board is regenerated from the snapshot by the entry\'s program; run it again on the same snapshot and every byte is the same.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
