/* Index page: flight arc, mailbox issue, departures board, estimate receipt */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;

  /* ---------- Flight arc: plane travels EWR → ICN, line draws behind it ---------- */
  function initRoute() {
    const fig = $('.route');
    const path = $('#route-path');
    const plane = $('.route__plane');
    const kmEl = $('#route-km');
    if (!fig || !path || !plane) return;

    const VB_W = 1000, VB_H = 180;
    const TOTAL_KM = 11300;
    const FLIGHT_MS = 14000, PAUSE_MS = 1800;
    const geo = $('.route__ghost') || path; // fixed geometry; `path` gets rewritten each frame
    const len = geo.getTotalLength();
    // Trail is rebuilt as a polyline (dash tricks are unreliable with non-scaling strokes)
    const SAMPLES = 160;
    const pts = Array.from({ length: SAMPLES + 1 }, (_, i) => geo.getPointAtLength((i / SAMPLES) * len));

    function place(p) {
      const rect = fig.getBoundingClientRect();
      const sx = rect.width / VB_W, sy = rect.height / VB_H;
      const at = geo.getPointAtLength(p * len);
      const ahead = geo.getPointAtLength(Math.min(len, p * len + 2));
      const behind = geo.getPointAtLength(Math.max(0, p * len - 2));
      const angle = Math.atan2((ahead.y - behind.y) * sy, (ahead.x - behind.x) * sx) * 180 / Math.PI;
      plane.style.left = (at.x / VB_W) * 100 + '%';
      plane.style.top = (at.y / VB_H) * 100 + '%';
      plane.style.transform = `rotate(${angle}deg)`;
      const n = Math.floor(p * SAMPLES);
      let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      for (let i = 1; i <= n; i++) d += 'L' + pts[i].x.toFixed(1) + ' ' + pts[i].y.toFixed(1);
      d += 'L' + at.x.toFixed(1) + ' ' + at.y.toFixed(1);
      path.setAttribute('d', p > 0 ? d : 'M0 0');
      if (kmEl) kmEl.textContent = GB.num(TOTAL_KM * (1 - p));
    }

    if (GB.reduceMotion) { place(0.62); window.addEventListener('resize', () => place(0.62)); return; }

    let t0 = null, visible = true;
    const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; });
    io.observe(fig);
    function frame(t) {
      if (t0 === null) t0 = t;
      const elapsed = (t - t0) % (FLIGHT_MS + PAUSE_MS);
      const raw = Math.min(1, elapsed / FLIGHT_MS);
      const p = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2; // ease in-out
      if (visible) place(p);
      requestAnimationFrame(frame);
    }
    place(0);
    requestAnimationFrame(frame);
  }

  /* ---------- Departures board ---------- */
  const ITEMS = [
    ['러닝화', 'Nike'], ['캐시미어 니트', 'J.Crew'], ['비타민 D3 3병', 'iHerb'], ['무선 이어폰', 'Best Buy'],
    ['캠핑 체어', 'REI'], ['레고 테크닉', 'Target'], ['유아 카시트', 'Amazon'], ['선글라스', 'Ray-Ban'],
    ['단백질 파우더', 'GNC'], ['백팩', 'Patagonia'], ['핸드크림 세트', 'Sephora'], ['커피 그라인더', 'Williams Sonoma'],
  ];
  const FLIGHTS = ['KE0092', 'KE0082', 'OZ0221', 'KE0094'];
  const NEXT = { '입고완료': '검수중', '검수중': '결제대기', '결제대기': '출고', '출고': '통관중', '통관중': '배송중', '배송중': '완료', '완료': '입고완료' };

  const rnd = (n) => Math.floor(Math.random() * n);
  const pad = (n) => String(n).padStart(2, '0');
  const tiles = (s) => '<span class="tiles" aria-label="' + s + '">' + s.split('').map((ch) => ch === ':' ? ':' : '<i aria-hidden="true">' + ch + '</i>').join('') + '</span>';

  function nyNow() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    return { h: Number(get('hour')), m: Number(get('minute')), s: get('second'), label: `${get('hour')}:${get('minute')}:${get('second')}` };
  }

  function makeRow(i, now) {
    const minutesAgo = i * 7 + rnd(5);
    const total = (now.h * 60 + now.m - minutesAgo + 1440) % 1440;
    const [name, shop] = ITEMS[rnd(ITEMS.length)];
    return {
      time: pad(Math.floor(total / 60)) + ':' + pad(total % 60),
      box: 'GB-' + rnd(10) + rnd(10) + '****',
      name, shop,
      lb: (1 + Math.random() * 11).toFixed(1),
      flight: FLIGHTS[rnd(FLIGHTS.length)],
      status: GB.STATUSES[Math.min(6, Math.floor(i * 0.9) + rnd(2))],
    };
  }

  function rowHTML(r) {
    return `<td>${tiles(r.time)}</td><td>${r.box}</td><td class="item">${r.name}<span>${r.shop}</span></td>` +
      `<td class="num">${r.lb}lb</td><td class="hide-md">${r.flight}</td><td><span class="flap">${GB.stamp(r.status)}</span></td>`;
  }

  function initBoard() {
    const body = $('#board-body');
    if (!body) return;
    const timeEl = $('#board-time');
    const counters = { in: $('#bt-in'), checked: $('#bt-checked'), out: $('#bt-out') };
    const counts = { in: 1248, checked: 1102, out: 386 };
    let now = nyNow();
    let rows = Array.from({ length: 8 }, (_, i) => makeRow(i, now));

    body.innerHTML = rows.map((r) => `<tr>${rowHTML(r)}</tr>`).join('');
    const stamp = () => { if (timeEl) timeEl.textContent = `기준 ${now.label} EST`; };
    stamp();

    if (GB.reduceMotion) return;

    let visible = false;
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(body);

    setInterval(() => {
      if (!visible || document.hidden) return;
      now = nyNow();
      stamp();
      if (Math.random() < 0.35) {
        // a new parcel arrives at the top of the board
        const r = makeRow(0, now);
        r.status = '입고완료';
        rows.unshift(r); rows = rows.slice(0, 8);
        const tr = document.createElement('tr');
        tr.innerHTML = rowHTML(r);
        tr.className = 'is-fresh';
        body.insertBefore(tr, body.firstChild);
        if (body.children.length > 8) body.lastElementChild.remove();
        counts.in += 1;
      } else {
        // an existing parcel advances one stop
        const idx = rnd(rows.length);
        const r = rows[idx];
        r.status = NEXT[r.status];
        if (r.status === '검수중') counts.checked += 1;
        if (r.status === '출고') counts.out += 1;
        const cell = body.children[idx] && body.children[idx].querySelector('.flap');
        if (cell) {
          cell.classList.remove('is-flipping'); void cell.offsetWidth; cell.classList.add('is-flipping');
          setTimeout(() => { cell.innerHTML = GB.stamp(r.status); }, 280);
        }
      }
      Object.keys(counters).forEach((k) => { if (counters[k]) counters[k].textContent = GB.num(counts[k]); });
    }, 2600);
  }

  /* ---------- Estimate receipt ---------- */
  function initCalc() {
    const form = $('#calc-form');
    if (!form) return;
    const d = new Date();
    const dateEl = $('#calc-date');
    if (dateEl) dateEl.textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    const out = {
      actual: $('#q-actual'), vol: $('#q-vol'), bill: $('#q-bill'), base: $('#q-base'),
      extra: $('#q-extra'), total: $('#q-total'), krw: $('#q-krw'), points: $('#q-points'),
    };
    const set = (el, v) => { if (el) el.textContent = v; };
    function calc() {
      const fd = new FormData(form);
      const q = GB.quote({
        center: fd.get('center'), weight: fd.get('weight'), unit: fd.get('unit'),
        l: fd.get('l'), w: fd.get('w'), h: fd.get('h'), partner: !!fd.get('partner'),
        options: { consolidate: !!fd.get('consolidate'), inspect: !!fd.get('inspect'), repack: !!fd.get('repack') },
      });
      set(out.actual, q.actualLb.toFixed(2) + 'lb');
      set(out.vol, q.volLb ? q.volLb.toFixed(2) + 'lb' : '—');
      set(out.bill, q.billable + 'lb' + (q.usesVolume ? ' · 부피 적용' : ''));
      set(out.base, GB.usd(q.base));
      set(out.extra, GB.usd(q.extras));
      set(out.total, GB.usd(q.total));
      set(out.krw, '약 ' + GB.krw(q.krw));
      set(out.points, `완료 시 ${GB.num(q.points)}P 적립 예정 · 환율 ₩${GB.num(GB.KRW_PER_USD)}/$ 가정`);
    }
    form.addEventListener('input', calc);
    form.addEventListener('change', calc);
    form.addEventListener('submit', (e) => e.preventDefault());
    calc();
  }

  /* ---------- Help desk open state (KST) ---------- */
  function initDesk() {
    const el = $('[data-open-status]');
    if (!el) return;
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const wd = get('weekday');
    const mins = Number(get('hour')) * 60 + Number(get('minute'));
    const weekday = !['Sat', 'Sun'].includes(wd);
    const lunch = mins >= 12 * 60 + 30 && mins < 13 * 60 + 30;
    const open = weekday && mins >= 10 * 60 && mins < 18 * 60 && !lunch;
    el.dataset.state = open ? 'open' : 'closed';
    el.textContent = open ? '지금 상담 가능' : lunch && weekday ? '점심시간 · 13:30 재개' : '상담 시간 외 · 1:1 문의를 남겨 주세요';
  }

  /* ---------- Hot deal radar: hand-curated list in deals-data.js ---------- */
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const fmtDay = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${iso.replace(/-/g, '.')}(${DOW[d.getUTCDay()]})`; };
  const escH = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function initRadar() {
    const rail = $('#radar-rail');
    const data = window.GB_DEALS;
    if (!rail || !data) return;
    const today = new Date().toISOString().slice(0, 10);
    const live = data.deals.filter((d) => !d.expires || d.expires >= today); // stale deals never show
    $('#radar-cadence').textContent = data.cadence.replace(' 업데이트', '');
    $('#radar-updated').textContent = fmtDay(data.updated);
    $('#radar-next').textContent = fmtDay(data.nextUpdate);
    $('#radar-affiliate').textContent = data.affiliate ? '일부 링크는 제휴 링크이며 구매 시 수수료를 받을 수 있습니다.' : '제휴·광고 링크가 아닙니다.';
    $('#radar-count').textContent = live.length ? `딜 ${live.length}개 · 끝난 딜은 자동으로 내려갑니다` : '';
    if (data.real) {
      // real listings pulled by tools/fetch_wornwear.py — say so, and when
      $('#radar-sub').textContent = `· ${data.source} 실제 매물`;
      $('#radar-lead').textContent = `${data.source}(파타고니아 공식 중고몰)의 실제 매물을 ${data.fetched}에 가져왔습니다. 중고 한 점씩이라 먼저 팔릴 수 있고, 가격·재고는 판매처 사정에 따라 바뀝니다.`;
      $('#radar-badge').textContent = `실제 매물 · ${data.fetched.slice(5, 16).replace('-', '.')} 기준`;
      $('#radar-badge').classList.add('is-real');
    }
    if (!live.length) {
      rail.innerHTML = '<p class="radar__empty">이번 주 딜을 고르는 중입니다. 다음 갱신일에 다시 확인해 주세요.</p>';
      return;
    }
    rail.innerHTML = live.map((d) => {
      const off = Math.round((1 - d.price / d.was) * 100);
      const q = GB.quote({ center: d.center, weight: d.lb, unit: 'lb' });
      const link = 'apply.html?' + new URLSearchParams({ shop: d.shop, item: d.item, price: d.price.toFixed(2), cat: d.cat, url: d.url, center: d.center, w: String(d.lb) }).toString();
      return `<article class="deal" role="listitem" aria-labelledby="deal-${d.id}">
        <span class="deal__hole" aria-hidden="true"></span>
        ${d.image ? `<img class="deal__img" src="${escH(d.image)}" alt="${escH(d.title)} 상품 사진" loading="lazy" decoding="async" width="480" height="480">` : ''}
        <p class="deal__shop mono">${escH(d.shop)} · ${escH(d.label || d.cat)}</p>
        <span class="deal__off stamp" data-status="결제대기" style="--stamp-rot:${off % 2 ? 4 : -4}deg">−${off}%</span>
        <h3 class="deal__title" id="deal-${d.id}">${escH(d.title)}</h3>
        ${d.size || d.condition ? `<p class="deal__meta">${escH([d.size, d.condition].filter(Boolean).join(' · '))}${data.real ? ' · 중고 1점' : ''}</p>` : ''}
        <p class="deal__price"><b class="mono">${GB.usd(d.price)}</b><s class="mono" aria-label="정가">${GB.usd(d.was)}</s></p>
        <dl class="deal__ship">
          <div><dt>예상 배송비</dt><dd class="mono">${GB.usd(q.total)} · ${d.lbEstimated ? '약 ' : ''}${d.lb}lb · ${d.center}</dd></div>
          <div><dt>딜 종료</dt><dd class="mono">${d.expires ? d.expires.slice(5).replace('-', '.') + '까지' : '재고 소진 시'}</dd></div>
        </dl>
        ${d.note ? `<p class="deal__note">${escH(d.note)}</p>` : ''}
        <div class="deal__cta">
          <a class="deal__src" href="${escH(d.url)}" target="_blank" rel="noopener noreferrer">원문 보기<span class="sr-only"> (${escH(d.shop)}, 새 창)</span> ↗</a>
          <a class="btn btn--primary btn--sm" href="${escH(link)}">이 상품으로 신청서</a>
        </div>
      </article>`;
    }).join('');
    $$('[data-rail]').forEach((b) => b.addEventListener('click', () => {
      const card = rail.querySelector('.deal');
      const step = card ? card.getBoundingClientRect().width + 16 : 300;
      rail.scrollBy({ left: Number(b.dataset.rail) * step * 2, behavior: GB.reduceMotion ? 'auto' : 'smooth' });
    }));
  }

  /* ---------- Shipping-fee specials strip: operator-picked top 3 (specials.js `featured`) ---------- */
  function initSpecialStrip() {
    const S = window.GBSpecials;
    const list = $('#spstrip-list');
    if (!S || !list) return;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    const live = S.active(today);
    $('#spstrip-count').textContent = `${live.length}건`; // never hard-coded
    const top = live.filter((e) => e.featured).sort((a, b) => a.featured - b.featured).slice(0, 3);
    list.innerHTML = top.map((e) => `<li><a href="events.html#special-${e.id}">
      <span class="spc__kind spc__kind--${e.kind}">${S.KIND_LABEL[e.kind]}</span>
      <b>${escH(e.name)}</b>
      <span class="mono spstrip__price">${S.priceLabel(e)}${e.end ? ` · ${e.end.replace(/-/g, '.')}까지` : ''}</span></a></li>`).join('');
  }

  initRoute();
  initRadar();
  initSpecialStrip();
  initBoard();
  initCalc();
  initDesk();
})();
