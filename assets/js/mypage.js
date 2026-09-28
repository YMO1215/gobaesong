/* My page: journey map, shipments list, safe-view photos, payment dialog */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;

  const PAID_KEY = 'gb.paid';
  const S = GB.STATUSES; // 입고완료 → 완료
  const LAST = S.length - 1;

  /* Dummy shipments following the real flow. times[i] = when S[i] was stamped. */
  const SHIPS = [
    { no: 'GB-000417-03', title: 'Nike Pegasus 41 외 1건', shop: 'Nike', status: '결제대기', lb: 6, weighed: 5.7, declared: 154.97,
      opts: { inspect: true, repack: true }, track: '1Z999AA10123456784', kr: '', times: ['09.25 11:02', '09.26 09:40', '09.26 15:12'] },
    { no: 'GB-000417-04', title: 'Now Foods Vitamin D3 ×2', shop: 'iHerb', status: '검수중', lb: 2, weighed: 1.6, declared: 24.98,
      opts: {}, track: '1Z999AA10123456791', kr: '', times: ['09.27 14:25', '09.28 08:10'] },
    { no: 'GB-000417-02', title: 'LEGO Technic 42151', shop: 'Target', status: '통관중', lb: 5, weighed: 4.3, declared: 49.99,
      opts: { photo: true }, track: '9400100000000000000000', kr: '', times: ['09.21 10:10', '09.21 16:30', '09.22 09:02', '09.23 18:40', '09.25 06:15'] },
    { no: 'GB-000417-01', title: 'Patagonia Better Sweater', shop: 'Patagonia', status: '배송중', lb: 3, weighed: 2.4, declared: 139.0,
      opts: {}, track: '1Z999AA10123456708', kr: '6070-1234-5678', times: ['09.18 09:30', '09.18 13:05', '09.18 17:44', '09.19 18:40', '09.21 05:50', '09.22 10:20'] },
    { no: 'GB-000416-12', title: 'Sony WH-1000XM6', shop: 'Best Buy', status: '완료', lb: 4, weighed: 3.1, declared: 399.99,
      opts: { insurance: true }, track: '1Z999AA10123456715', kr: '6070-8765-4321', times: ['09.08 10:12', '09.08 15:40', '09.09 08:31', '09.10 18:40', '09.12 07:05', '09.12 13:20', '09.13 16:02'] },
  ];

  let points = 12480;
  let selected = null;
  let filter = 'all';

  const idxOf = (s) => S.indexOf(s.status);
  const quoteOf = (s) => GB.quote({ center: 'NJ', weight: s.lb, unit: 'lb', declared: s.declared, options: s.opts });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Restore state from this browser ---------- */
  const paid = GB.store.get(PAID_KEY, []);
  SHIPS.forEach((s) => {
    if (paid.includes(s.no) && s.status === '결제대기') { s.status = '출고'; s.times.push('결제 후 출고 대기'); }
  });
  // Account header + US address follow the logged-in member (member.js); shipments stay sample data
  const ADDR = {
    NJ: ['000 LOGISTICS AVE UNIT B', 'EDISON, NJ 08800 USA', '뉴저지 센터'],
    DE: ['000 HARBOR RD SUITE B', 'NEW CASTLE, DE 19700 USA', '델라웨어 센터'],
  };
  function applyUser(u) {
    const demo = $('#my-demo');
    if (demo) demo.hidden = !!u;
    if (!u) return;
    const a = ADDR[u.center] || ADDR.NJ;
    $('#my-name').textContent = u.id;
    $('#my-box').textContent = u.mailbox;
    $('#my-center').textContent = a[2];
    $('#my-since').textContent = '가입 ' + String(u.createdAt || '').slice(0, 7).replace('-', '.');
    $('#addr-text').innerHTML = `${esc(u.name)}\n${a[0]}\n<b id="addr-box">${esc(u.mailbox)}</b>\n${a[1]}`;
  }
  applyUser(GB.auth && GB.auth.user);
  document.addEventListener('gb:auth', (e) => applyUser(e.detail.user));

  /* ---------- Safe-view illustrations (duotone line work, no stock photos) ---------- */
  const corners = (w, h) => `<path class="o" d="M10 26V10h16M${w - 26} 10h16v16M10 ${h - 26}v16h16M${w - 10} ${h - 26}v16h-16"/>`;

  function svExterior(s) {
    return `<svg viewBox="0 0 320 180" role="img" aria-label="${esc(s.no)} 입고 상자 외관">
      ${corners(320, 180)}
      <path class="l" d="M40 158h240" stroke-dasharray="4 6"/>
      <path class="face2" d="M160 28l70 35-70 35-70-35z"/>
      <path class="face" d="M90 63l70 35v60l-70-35z"/>
      <path class="face2" d="M160 98l70-35v60l-70 35z" opacity=".75"/>
      <path class="l" d="M160 28l70 35-70 35-70-35zM90 63v60l70 35 70-35V63M160 98v60"/>
      <path d="M195 45.5l-70 35v60" fill="none" stroke="#FF5C1A" stroke-width="7" opacity=".9"/>
      <path class="pf" d="M176 110l38-19v22l-38 19z"/>
      <path d="M181 118l6-3M181 123l14-7M181 128l10-5" stroke="#0B1F3A" stroke-width="2"/>
      <text class="t" x="232" y="40">${esc(s.no)}</text>
    </svg>`;
  }
  function svOpen(s) {
    return `<svg viewBox="0 0 200 150" role="img" aria-label="개봉 검수, 수량 일치">
      ${corners(200, 150)}
      <path class="face2" d="M40 62l60 30 60-30-60-30z" opacity=".6"/>
      <path class="l" d="M40 62l60-30 60 30-60 30z"/>
      <path class="face" d="M40 62l60 30v42l-60-30z"/>
      <path class="face2" d="M100 92l60-30v42l-60 30z" opacity=".75"/>
      <path class="l" d="M40 62v42l60 30 60-30V62M100 92v42"/>
      <path class="l" d="M40 62l-18-20 60-30 18 20M160 62l18-20-60-30-18 20"/>
      <path class="o" d="M72 64l26-13 26 13-26 13zM72 64v10l26 13 26-13V64"/>
      <text class="t" x="14" y="140">QTY ${Math.max(1, s.title.includes('외') ? 2 : 1)}/${Math.max(1, s.title.includes('외') ? 2 : 1)} OK</text>
    </svg>`;
  }
  function svScale(s) {
    return `<svg viewBox="0 0 200 150" role="img" aria-label="실측 무게 ${s.weighed}lb">
      ${corners(200, 150)}
      <path class="face" d="M30 104l70-32 70 32-70 32z"/>
      <path class="l" d="M30 104l70-32 70 32-70 32zM30 104v6l70 32 70-32v-6"/>
      <path class="face2" d="M100 50l34 17-34 17-34-17z"/>
      <path class="face" d="M66 67l34 17v22l-34-17z"/>
      <path class="l" d="M100 50l34 17-34 17-34-17zM66 67v22l34 17 34-17V67M100 84v22"/>
      <rect x="120" y="22" width="64" height="30" fill="#06132A" stroke="#F6F4EE" stroke-width="1.2"/>
      <text class="tb" x="152" y="44" text-anchor="middle">${s.weighed.toFixed(1)}</text>
      <text class="t" x="152" y="62" text-anchor="middle">LB</text>
    </svg>`;
  }

  function renderSafeview(s) {
    const box = $('#safeview');
    const wrap = box.closest('.safeview');
    const i = idxOf(s);
    const t = (k) => s.times[k] || s.times[s.times.length - 1] || '';
    wrap.classList.toggle('is-empty', i < 1);
    if (i < 1) {
      box.innerHTML = '<p class="sv-empty">입고 직후입니다. 검수가 시작되면 사진이 여기에 올라옵니다.</p>';
      $('#sv-count').textContent = '0장';
      return;
    }
    const figs = [`<figure class="sv">${svExterior(s)}<figcaption><span>EXTERIOR · 외관</span><span>${t(0)}</span></figcaption></figure>`];
    if (i >= 2) {
      figs.push(`<figure class="sv">${svOpen(s)}<figcaption><span>OPEN</span><span>${t(1)}</span></figcaption></figure>`);
      figs.push(`<figure class="sv">${svScale(s)}<figcaption><span>WEIGHT</span><span>${t(1)}</span></figcaption></figure>`);
    }
    box.innerHTML = figs.join('');
    $('#sv-count').textContent = figs.length + '장' + (s.opts.photo ? ' +5' : '');
    $('#sv-note').textContent = i < 2 ? '검수 진행 중 · 개봉·계량 사진이 곧 추가됩니다' : '뉴저지 센터 검수대 · 촬영 시각은 현지 기준';
  }

  /* ---------- Journey map ---------- */
  function renderJourney(s) {
    const i = idxOf(s);
    const f = i / LAST;
    $('#j-title').textContent = s.title;
    $('#j-no').textContent = s.no;
    $('#j-track').textContent = s.track;

    const stepsEl = $('#j-steps');
    stepsEl.innerHTML = S.map((name, k) => {
      const state = k < i || (k === i && i === LAST) ? 'is-done' : k === i ? 'is-now' : 'is-todo';
      const time = k <= i ? (s.times[k] || '') : '';
      const stamp = k <= i ? GB.stamp(name, '', 'j-stamp') : '';
      const cur = k === i ? ' aria-current="step"' : '';
      return `<li class="journey__step ${state}"${cur}><span class="journey__dot" aria-hidden="true"></span><span class="journey__name">${name}</span><span class="journey__time">${time}</span><span class="journey__stamp">${stamp}</span></li>`;
    }).join('');
    $('#j-progress').style.setProperty('--f', String(f));

    // arc + plane
    $('#j-arc-done').setAttribute('stroke-dashoffset', String(100 - f * 100));
    const arc = $('#j-arc');
    const len = arc.getTotalLength();
    const p = arc.getPointAtLength(len * f);
    const a = arc.getPointAtLength(Math.min(len, len * f + 1));
    const b = arc.getPointAtLength(Math.max(0, len * f - 1));
    const ang = Math.atan2(a.y - b.y, a.x - b.x) * 180 / Math.PI;
    $('#j-plane').style.transform = `translate(${p.x}px, ${p.y}px) rotate(${ang}deg)`;

    // stamps land one after another
    $$('.j-stamp', stepsEl).forEach((el, k) => {
      el.style.setProperty('--stamp-rot', (k % 2 ? 4 : -5) + 'deg');
      if (GB.reduceMotion) return;
      el.style.opacity = '0';
      setTimeout(() => { el.style.opacity = ''; GB.press(el); }, 120 + k * 110);
    });

    const q = quoteOf(s);
    const feeKnown = i >= 2;
    const facts = [
      ['실측 무게', i >= 1 ? `${s.weighed}lb → 적용 ${s.lb}lb` : '검수 후 확정'],
      ['배송비', feeKnown ? `${GB.usd(q.total)} · ${GB.krw(q.krw)}` : '검수 후 확정'],
      ['신고 금액', GB.usd(s.declared) + (s.declared > 200 ? ' · 일반통관' : ' · 목록통관')],
      ['국내 운송장', s.kr ? `우체국 ${s.kr}` : '출고 후 발급'],
    ];
    $('#j-facts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd class="${/\d/.test(v) ? 'mono' : ''}">${v}</dd></div>`).join('');
    renderSafeview(s);
  }

  /* ---------- Shipments table ---------- */
  function visible(s) {
    if (filter === 'moving') return s.status !== '완료';
    if (filter === 'pay') return s.status === '결제대기';
    if (filter === 'done') return s.status === '완료';
    return true;
  }

  function renderList() {
    const rows = SHIPS.filter(visible);
    $('#ship-empty').hidden = rows.length > 0;
    $('#ship-body').innerHTML = rows.map((s) => {
      const q = quoteOf(s);
      const fee = idxOf(s) >= 2 ? GB.usd(q.total) : '—';
      const sel = selected === s ? ' class="is-selected"' : '';
      return `<tr data-no="${s.no}"${sel}><td>${s.no}</td><td><span class="title">${esc(s.title)}</span><span class="shop">${esc(s.shop)}</span></td>` +
        `<td class="num">${idxOf(s) >= 1 ? s.lb + 'lb' : '—'}</td><td class="num">${fee}</td><td>${GB.stamp(s.status)}</td>` +
        `<td><button class="btn-text" type="button" data-pick="${s.no}" aria-label="${s.no} 여정 보기">여정 보기</button></td></tr>`;
    }).join('');
  }

  function select(s, scroll) {
    selected = s;
    renderJourney(s);
    renderList();
    if (scroll) $('.journeycard').scrollIntoView({ behavior: GB.reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  $('#ship-body').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-no]');
    if (!tr) return;
    const s = SHIPS.find((x) => x.no === tr.dataset.no);
    if (s) select(s, !!e.target.closest('[data-pick]'));
  });
  $$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    $$('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  }));

  /* ---------- Header counters + alert ---------- */
  function renderCounts() {
    $('#moving-count').textContent = SHIPS.filter((s) => s.status !== '완료').length;
    const waiting = SHIPS.filter((s) => s.status === '결제대기');
    $('#pay-count').textContent = waiting.length;
    const alert = $('#payalert');
    const target = waiting[0];
    if (!target) {
      alert.classList.add('is-paid');
      $('.stamp', alert).dataset.status = '완료';
      $('.stamp', alert).textContent = '결제완료';
      $('#payalert-title').innerHTML = '결제할 배송비가 없습니다.';
      $('.payalert__txt .small', alert).textContent = '다음 출고편: 수요일 18:40 EST · 결제한 화물은 여정 지도에서 확인하세요.';
      $('#pay-open').hidden = true;
    } else {
      $('#payalert-fee').textContent = GB.usd(quoteOf(target).total);
    }
  }
  function setPoints(v) {
    points = v;
    $('#point-total').textContent = GB.num(v);
    $('#point-side').textContent = GB.num(v);
  }

  /* ---------- Payment dialog ---------- */
  const dlg = $('#paydlg');
  let paying = null;

  function payTotals() {
    const q = quoteOf(paying);
    const use = $('#pay-usepoint').checked ? Math.min(points, q.krw) : 0;
    $('#pay-total').textContent = GB.krw(q.krw - use);
    return { q, use };
  }

  $('#pay-open').addEventListener('click', () => {
    paying = SHIPS.find((s) => s.status === '결제대기');
    if (!paying) return;
    const q = quoteOf(paying);
    $('#pay-no').textContent = paying.no;
    const lines = [[`기본요금 · ${paying.lb}lb`, GB.usd(q.base)]].concat(q.lines.map((l) => [l.label, GB.usd(l.price)]));
    lines.push(['합계 (USD)', GB.usd(q.total)], ['원화 환산', GB.krw(q.krw)]);
    $('#pay-lines').innerHTML = lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#pay-pt-have').textContent = GB.num(points);
    $('#pay-pt-max').textContent = GB.num(Math.min(points, q.krw));
    $('#pay-usepoint').checked = false;
    $('#pay-done').hidden = true;
    $('#pay-go').hidden = false;
    $('#pay-go').textContent = '결제하기';
    dlg.classList.remove('is-busy');
    payTotals();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  });
  $('#pay-usepoint').addEventListener('change', payTotals);

  $('#pay-go').addEventListener('click', () => {
    if (!paying) return;
    const { q, use } = payTotals();
    dlg.classList.add('is-busy');
    $('#pay-go').textContent = '승인 요청 중…';
    setTimeout(() => {
      dlg.classList.remove('is-busy');
      $('#pay-go').hidden = true;
      $('#pay-earn').textContent = GB.num(Math.floor((q.krw - use) * 0.01));
      $('#pay-done').hidden = false;
      GB.press($('#pay-done .stamp'));
      $('#pay-done .btn').focus();
      if (use) setPoints(points - use);
      paying.status = '출고';
      paying.times.push('방금 · 출고 대기');
      const list = GB.store.get(PAID_KEY, []);
      if (!list.includes(paying.no)) { list.push(paying.no); GB.store.set(PAID_KEY, list); }
      renderCounts();
      select(paying, false);
      GB.toast(paying.no + ' 배송비 결제 완료');
    }, 1200);
  });

  /* ---------- Boot ---------- */
  renderCounts();
  select(SHIPS.find((s) => s.status === '결제대기') || SHIPS[0], false);
  setPoints(points);
})();
