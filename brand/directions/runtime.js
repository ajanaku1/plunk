(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const M = 1e6, SOLD = 500 * M;
  const fmt = (n, d = 2) => n.toLocaleString('en-US', { maximumFractionDigits: d });
  const pad = n => String(n).padStart(2, '0');
  const clock = s => `${pad(Math.floor(Math.max(s, 0) / 60))}:${pad(Math.max(s, 0) % 60)}`;
  const steps = ['Clearing bids', 'Minting coin', 'Creating pool', 'Adding liquidity'];
  const names = ['k3n.near', 'mia.near', '0xdeg.near', 'yuki.near', 'pepe-maxi.near', 'sol…7fQ', 'ribbit-fan.near', 'anon-42.near', 'gm.near', 'lfg.near'];

  // Deterministic local data (seeded so every load looks the same).
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = Math.floor(Date.now() / 1000), start = now - 48 * 60;
  const bids = []; let total = 0;
  for (let i = 0; i < 51; i++) {
    const t = start + Math.floor(((i + rnd()) / 51) * 46 * 60);
    const kind = rnd() < 0.3 ? 'sealed' : rnd() < 0.08 ? 'xchain' : 'market';
    const amt = Math.round((rnd() < 0.1 ? 40 + rnd() * 60 : 0.5 + rnd() * 14) * 10) / 10;
    total += amt; bids.push({ t, kind, who: names[i % names.length], amt, cum: total });
  }
  const box = { name: 'Frog on NEAR', ticker: 'FROG', minRaise: 50, bidders: 37, balance: 128.4, yourBids: [{ id: 0, kind: 'market', amt: 10 }] };
  const st = { name: 'bidding', left: 7 * 60, revealLeft: 60, step: 1, taxH: 3, connected: false, kind: 'market', side: 'buy', chart: 'activity', tab: 'bids' };

  const totalIn = () => bids.reduce((a, b) => a + b.amt, 0);
  const perM = () => Math.max(totalIn(), box.minRaise) / (SOLD / M);
  const yourTotal = () => box.yourBids.reduce((a, b) => a + b.amt, 0);
  const bind = (k, v) => $$(`[data-bind="${k}"]`).forEach(el => (el.textContent = v));
  const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 3200); };

  // ---- chart
  let chart, series;
  function mountChart() {
    const el = $('#chart'); el.innerHTML = '';
    if (!window.LightweightCharts) { el.innerHTML = '<div class="empty">Chart library did not load.</div>'; return; }
    const css = getComputedStyle(document.documentElement);
    chart = LightweightCharts.createChart(el, {
      layout: { background: { color: 'transparent' }, textColor: css.getPropertyValue('--muted').trim(), fontFamily: css.getPropertyValue('--mono').trim() },
      grid: { vertLines: { color: css.getPropertyValue('--line').trim() }, horzLines: { color: css.getPropertyValue('--line').trim() } },
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 }, handleScroll: false, handleScale: false, autoSize: true,
    });
    const green = css.getPropertyValue('--green').trim(), purple = css.getPropertyValue('--purple').trim(), down = css.getPropertyValue('--down').trim();
    if (st.chart === 'activity') {
      series = chart.addAreaSeries({ lineColor: green, topColor: green + '55', bottomColor: green + '05', lineWidth: 2, priceFormat: { type: 'custom', formatter: v => fmt(v, 0) + ' Ⓝ' } });
      series.setData(bids.map(b => ({ time: b.t, value: Math.round(b.cum * 10) / 10 })));
    } else {
      series = chart.addCandlestickSeries({ upColor: green, downColor: down, wireframe: false, borderVisible: false, wickUpColor: green, wickDownColor: down, priceFormat: { type: 'price', precision: 3, minMove: 0.001 } });
      let p = perM(); const data = []; let s2 = 11; const r2 = () => (s2 = (s2 * 48271) % 2147483647) / 2147483647;
      for (let i = 0; i < 90; i++) { const o = p, c = p * (1 + (r2() - 0.42) * 0.06); data.push({ time: now - (90 - i) * 60, open: o, high: Math.max(o, c) * (1 + r2() * 0.02), low: Math.min(o, c) * (1 - r2() * 0.02), close: c }); p = c; }
      series.setData(data); box.last = p;
    }
    chart.timeScale().fitContent();
  }

  // ---- render
  function render() {
    const d = { total: totalIn(), perM: perM() };
    document.documentElement.dataset.box = st.name;
    $$('[data-m]').forEach(m => (m.dataset.state = st.name));
    $$('[data-show]').forEach(el => (el.hidden = !el.dataset.show.split(',').includes(st.name)));
    $$('[data-set-state]').forEach(b => b.setAttribute('aria-pressed', b.dataset.setState === st.name));
    bind('name', box.name); bind('ticker', box.ticker); bind('initials', box.ticker.slice(0, 2));
    bind('phase', { bidding: 'Bidding', reveal: 'Reveal', opening: 'Opening', open: 'Open', failed: 'Failed' }[st.name]);
    bind('totalIn', fmt(d.total, 1)); bind('bidders', box.bidders); bind('bids', bids.length); bind('minRaise', box.minRaise);
    bind('countdown', st.name === 'bidding' ? clock(st.left) : clock(st.revealLeft));
    bind('closesAt', st.name === 'bidding' ? `in ${clock(st.left)}` : 'closed');
    bind('perM', fmt(box.last || d.perM, 3)); bind('chg', fmt(((box.last || d.perM) / d.perM - 1) * 100, 1));
    bind('poolNear', fmt(d.total * 0.99, 1)); bind('holders', box.bidders + 12);
    bind('pct', d.total >= box.minRaise ? `${fmt(d.total / box.minRaise, 1)}× minimum` : `${fmt(d.total / box.minRaise * 100, 0)}% of minimum`);
    bind('stepN', st.step); bind('stepName', steps[st.step - 1]);
    bind('balance', fmt(box.balance, 1)); bind('yourTotal', fmt(yourTotal(), 1)); bind('yourCoins', fmt(yourTotal() / d.perM, 2));
    const tax = Math.max(0, 90 * (1 - st.taxH / 24)); bind('taxRate', fmt(tax, 1)); bind('taxLeft', `${fmt(24 - st.taxH, 0)}h`);
    const revealed = Math.min(1, (60 - st.revealLeft) / 60); bind('revealed', `${Math.round(revealed * bids.filter(b => b.kind === 'sealed').length)} / ${bids.filter(b => b.kind === 'sealed').length} unlocked`);
    $$('[data-meter="raise"]').forEach(el => el.style.setProperty('--v', Math.min(1, d.total / 500)));
    $$('[data-meter="steps"]').forEach(el => el.style.setProperty('--v', st.step / 4));
    $$('[data-meter="tax"]').forEach(el => el.style.setProperty('--v', tax / 90));
    $$('[data-meter="reveal"]').forEach(el => el.style.setProperty('--v', revealed));
    $$('.stepper i').forEach(i => i.classList.toggle('done', +i.dataset.step <= st.step));
    bind('chartRight', st.chart === 'activity' ? `${bids.length} bids · ${box.bidders} bidders` : `vol 24h 1,204 Ⓝ`);
    // chart availability
    const open = st.name === 'open';
    $('#tab-price').disabled = !open; $('#holdersTab').disabled = !open;
    if (!open && st.chart === 'price') { st.chart = 'activity'; }
    $('#tab-activity').setAttribute('aria-pressed', st.chart === 'activity'); $('#tab-price').setAttribute('aria-pressed', st.chart === 'price');
    // tables
    const settled = st.name === 'open' || st.name === 'reveal' || st.name === 'opening';
    $('#bidsBody').innerHTML = [...bids].reverse().slice(0, 12).map(b => `<tr><td>${new Date(b.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td><span class="tag ${b.kind}">${{ market: 'Market', sealed: 'Sealed', xchain: 'Cross-chain' }[b.kind]}</span></td><td>${b.who}</td><td class="r">${fmt(b.amt, 1)} Ⓝ</td><td class="r" style="color:var(--muted)">${b.kind === 'sealed' ? (st.name === 'open' ? fmt(d.perM * (0.8 + (b.amt % 1)), 3) : '•••') : 'market'}</td></tr>`).join('');
    const holders = [['plunk.near (LP)', 500, 50], ['0xdeg.near', 72.7, 7.27], ['k3n.near', 30.3, 3.03], ['yuki.near', 15.1, 1.51], ['you', yourTotal() / d.perM, yourTotal() / d.perM / 10], ['mia.near', 1.2, 0.12]];
    $('#holdersBody').innerHTML = open ? holders.map(h => `<tr><td>${h[0]}</td><td class="r">${fmt(h[1], 2)}M</td><td class="r">${fmt(h[2], 2)}%<div class="hbar"><i style="--v:${h[2] / 50}"></i></div></td></tr>`).join('') : '';
    $('#holdersEmpty').hidden = open;
    $('#mineEmpty').hidden = st.connected; $('#mineEmpty').textContent = st.connected && !box.yourBids.length ? 'No bids yet.' : 'Connect a wallet to see your bids.';
    $('#mineBody').innerHTML = st.connected ? box.yourBids.map(b => `<tr><td>#${b.id}</td><td><span class="tag ${b.kind}">${b.kind === 'sealed' ? 'Sealed' : 'Market'}</span></td><td class="r">${fmt(b.amt, 1)} Ⓝ</td><td class="r">${st.name === 'open' ? fmt(b.amt / d.perM, 2) + 'M $FROG' : st.name === 'failed' ? 'refund ' + fmt(b.amt, 1) + ' Ⓝ' : settled ? 'clearing…' : 'in the box'}</td><td class="r">${st.name === 'open' || st.name === 'failed' ? '<button class="chip">Claim</button>' : ''}</td></tr>`).join('') : '';
    // forms
    $('#cta').textContent = st.connected ? `Plunk ${fmt(parseFloat($('#amount').value) || 0, 1)} NEAR` : 'Connect wallet';
    const a = parseFloat($('#amount').value) || 0;
    $('#share').textContent = a ? `≈ ${fmt(a / d.perM, 2)}M $FROG (${fmt(a / (d.total + a) * 100, 2)}%)` : '—';
    $('#kindLabel').textContent = st.kind === 'market' ? 'Market · pays the clearing price' : 'Sealed · refunded if price > your max';
    $('#maxField').hidden = st.kind !== 'sealed'; $('#sealedNote').hidden = st.kind !== 'sealed';
    $$('[data-kind]').forEach(b => b.setAttribute('aria-pressed', b.dataset.kind === st.kind));
    $$('[data-side]').forEach(b => b.setAttribute('aria-pressed', b.dataset.side === st.side));
    const ta = parseFloat($('#tradeAmt').value) || 0, px = box.last || d.perM;
    $('#tradeUnit').textContent = st.side === 'buy' ? 'NEAR' : '$FROG (M)';
    $('#tradeOut').textContent = st.side === 'buy' ? `${fmt(ta / px * 0.998, 2)}M $FROG` : `${fmt(ta * px * 0.998, 2)} NEAR`;
    const tc = $('#tradeCta'); tc.textContent = st.side === 'buy' ? 'Buy $FROG' : 'Sell $FROG'; tc.classList.toggle('sell', st.side === 'sell');
    $('#connect').textContent = st.connected ? 'you.near' : 'Connect wallet'; $('#connect').classList.toggle('on', st.connected);
  }

  // ---- wiring
  $$('[data-set-state]').forEach(b => b.addEventListener('click', () => { st.name = b.dataset.setState; st.step = 1; if (st.name === 'open') { st.chart = 'price'; } else { st.chart = 'activity'; box.last = null; } mountChart(); render(); }));
  $('#connect').addEventListener('click', () => { st.connected = !st.connected; toast(st.connected ? 'Connected as you.near' : 'Disconnected'); render(); });
  $$('[data-kind]').forEach(b => b.addEventListener('click', () => { st.kind = b.dataset.kind; render(); }));
  $$('[data-side]').forEach(b => b.addEventListener('click', () => { st.side = b.dataset.side; render(); }));
  $$('[data-q]').forEach(b => b.addEventListener('click', () => { $('#amount').value = b.dataset.q; render(); }));
  $$('[data-tq]').forEach(b => b.addEventListener('click', () => { $('#tradeAmt').value = b.dataset.tq; render(); }));
  $('#useBal').addEventListener('click', () => { $('#amount').value = box.balance; render(); });
  $('#amount').addEventListener('input', render); $('#tradeAmt').addEventListener('input', render);
  $('#bidForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!st.connected) { st.connected = true; toast('Connected as you.near'); render(); return; }
    const amt = parseFloat($('#amount').value) || 0; if (!amt) return;
    bids.push({ t: now, kind: st.kind, who: 'you.near', amt, cum: totalIn() + amt });
    box.yourBids.push({ id: bids.length - 1, kind: st.kind, amt }); box.balance -= amt;
    toast(st.kind === 'sealed' ? 'Sealed. Your max price is encrypted until the box shuts.' : 'Plunked. You pay whatever the box clears at.');
    mountChart(); render();
  });
  $('#tab-activity').addEventListener('click', () => { st.chart = 'activity'; mountChart(); render(); });
  $('#tab-price').addEventListener('click', () => { st.chart = 'price'; mountChart(); render(); });
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === b)); $$('[data-panel]').forEach(p => (p.hidden = p.dataset.panel !== b.dataset.tab)); }));
  $$('[data-copy]').forEach(b => b.addEventListener('click', () => { const v = b.dataset.copy; (navigator.clipboard?.writeText(v) || Promise.reject()).then(() => toast(`Copied ${v}`)).catch(() => toast(v)); }));
  $('#nudge').addEventListener('click', () => { if (st.step < 4) st.step++; else { st.name = 'open'; st.chart = 'price'; mountChart(); } render(); });
  $('#claim').addEventListener('click', () => { $('#unclaimed').textContent = '0'; toast('Claimed. $FROG is in your wallet.'); });
  $('#tradeCta').addEventListener('click', () => toast(`${st.side === 'buy' ? 'Bought' : 'Sold'} via Rhea. Fees 0.1% + 0.1%.`));
  setInterval(() => {
    if (st.name === 'bidding' && st.left > 0) st.left--;
    if (st.name === 'reveal' && st.revealLeft > 0) st.revealLeft--;
    if (st.name === 'opening' && st.step < 4 && Math.random() < 0.2) st.step++;
    render();
  }, 1000);
  mountChart(); render();
})();
