/* Events page: promotions and coupons with live/soon/ended status from today's date (KST),
   coupon wallet (this browser only), US sale calendar with D-day counters. Mock data. */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;

  const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${iso.slice(5).replace('-', '.')}(${DOW[d.getUTCDay()]})`; };
  const days = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(TODAY + 'T00:00:00Z')) / 864e5);

  function statusOf(start, end) {
    if (start && TODAY < start) return 'soon';
    if (end && TODAY > end) return 'ended';
    return 'live';
  }
  const LABEL = { live: '진행중', soon: '예정', ended: '종료' };
  const STAMP = { live: '완료', soon: '검수중', ended: '접수' };
  const period = (s, e) => (s ? md(s) : '상시') + (e ? ' – ' + md(e) : s ? ' –' : '');

  /* ---------- Promotions ---------- */
  const PROMOS = [
    { id: 'welcome', title: '첫 직구 웰컴 $5', lead: '가입하고 30일 안에 처음 결제하는 배송비에서 $5를 뺍니다.', start: null, end: null,
      target: '신규 회원 (가입 30일 이내)', cond: '배송비 $15 이상 · 1회', how: '쿠폰 WELCOME5 받기 → 결제 화면에서 선택', code: 'WELCOME5' },
    { id: 'chuseok', title: '추석 연휴 출고 7%', lead: '연휴 전 출고분 배송비를 7% 할인합니다.', start: '2026-09-20', end: '2026-09-28',
      target: '전체 회원', cond: '9.28 결제분까지 · 최대 $7', how: '쿠폰 CHUSEOK7', code: 'CHUSEOK7' },
    { id: 'de10', title: '델라웨어 면세주 10%', lead: '판매세 0% 델라웨어 센터로 받은 화물의 배송비를 10% 할인합니다.', start: '2026-10-01', end: '2026-10-31',
      target: '전체 회원', cond: '델라웨어 센터 입고분 · 최대 $10', how: '쿠폰 DE10', code: 'DE10' },
    { id: 'bf', title: '블랙프라이데이 합배송 수수료 0원', lead: '블프 주간에 산 상자를 한 번에 묶어 보내세요. 합배송 수수료($3/건)를 받지 않습니다.', start: '2026-11-20', end: '2026-12-04',
      target: '전체 회원', cond: '신청서 3건 이상 합배송', how: '신청서 옵션에서 합배송 선택 시 자동 적용', code: null },
  ];

  function renderPromos(filter) {
    const box = $('#promos');
    const list = PROMOS.map((p) => ({ ...p, st: statusOf(p.start, p.end) }))
      .sort((a, b) => ['live', 'soon', 'ended'].indexOf(a.st) - ['live', 'soon', 'ended'].indexOf(b.st));
    const shown = list.filter((p) => filter === 'all' || p.st === filter);
    box.innerHTML = shown.length ? shown.map((p, i) => `
      <article class="promo promo--${p.st}${i === 0 && filter === 'all' ? ' promo--lead' : ''}" aria-labelledby="pr-${p.id}">
        <header class="promo__head">
          <span class="stamp" data-status="${STAMP[p.st]}">${LABEL[p.st]}</span>
          <span class="promo__period mono">${period(p.start, p.end)}</span>
        </header>
        <h3 class="promo__title" id="pr-${p.id}">${esc(p.title)}</h3>
        <p class="promo__lead">${esc(p.lead)}</p>
        <dl class="promo__terms">
          <div><dt>대상</dt><dd>${esc(p.target)}</dd></div>
          <div><dt>조건</dt><dd>${esc(p.cond)}</dd></div>
          <div><dt>사용 방법</dt><dd>${esc(p.how)}</dd></div>
        </dl>
        ${p.code && p.st !== 'ended' ? `<a class="link-arrow" href="#cp-${p.code}">쿠폰 받으러 가기</a>` : ''}
      </article>`).join('') : '<p class="muted">해당하는 프로모션이 없습니다.</p>';
  }
  $$('[data-pf]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-pf]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderPromos(b.dataset.pf);
  }));

  /* ---------- Coupons ---------- */
  const COUPONS = [
    { code: 'WELCOME5', benefit: '$5', what: '첫 배송비 할인', start: null, end: null, target: '신규 회원', cond: '가입 30일 이내 · 배송비 $15 이상' },
    { code: 'DE10', benefit: '10%', what: '델라웨어 센터 배송비', start: '2026-10-01', end: '2026-10-31', target: '전체', cond: '최대 $10 · 델라웨어 입고분' },
    { code: 'CHUSEOK7', benefit: '7%', what: '추석 연휴 출고', start: '2026-09-20', end: '2026-09-28', target: '전체', cond: '최대 $7' },
    { code: 'PARTNER3', benefit: '+3%', what: '파트너스 추가 할인', start: null, end: null, target: '파트너스 회원', cond: '월 100건 이상 · 기본 7%에 추가' },
    { code: 'BUNDLE0', benefit: '$0', what: '합배송 수수료', start: '2026-11-20', end: '2026-12-04', target: '전체', cond: '3건 이상 합배송' },
    { code: 'SUMMER5', benefit: '5%', what: '여름 시즌 배송비', start: '2026-07-01', end: '2026-08-31', target: '전체', cond: '최대 $5' },
  ];
  const walletKey = () => 'gb.coupons.' + (GB.auth && GB.auth.user ? GB.auth.user.id : 'guest');

  function renderCoupons() {
    const wallet = GB.store.get(walletKey(), []);
    $('#coupons-list').innerHTML = COUPONS.map((c) => {
      const st = statusOf(c.start, c.end);
      const got = wallet.includes(c.code);
      const action = st === 'ended' ? '<span class="coupon__ended">기간이 끝났습니다</span>'
        : got ? '<span class="coupon__got">받음 · 결제 때 선택</span>'
        : `<button type="button" class="btn btn--primary btn--sm" data-get="${c.code}">${st === 'soon' ? '미리 받기' : '쿠폰 받기'}</button>`;
      return `<article class="coupon coupon--${st}" id="cp-${c.code}" role="listitem" aria-label="${esc(c.what)} 쿠폰">
        <div class="coupon__value"><b class="mono">${esc(c.benefit)}</b><span>${esc(c.what)}</span></div>
        <div class="coupon__body">
          <p class="coupon__code"><span class="mono">${c.code}</span><button type="button" class="btn-text" data-copy="${c.code}">코드 복사</button><span class="stamp" data-status="${STAMP[st]}">${LABEL[st]}</span></p>
          <dl class="coupon__terms">
            <div><dt>기간</dt><dd class="mono">${period(c.start, c.end)}</dd></div>
            <div><dt>대상</dt><dd>${esc(c.target)}</dd></div>
            <div><dt>조건</dt><dd>${esc(c.cond)}</dd></div>
          </dl>
        </div>
        <div class="coupon__act">${action}</div>
      </article>`;
    }).join('');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-get]');
    if (!b) return;
    const take = () => {
      const w = GB.store.get(walletKey(), []);
      if (!w.includes(b.dataset.get)) w.push(b.dataset.get);
      GB.store.set(walletKey(), w);
      renderCoupons();
      GB.toast(b.dataset.get + ' 쿠폰을 받았습니다');
    };
    if (GB.auth && GB.auth.available && !GB.auth.user) GB.auth.require('쿠폰은 로그인 후 받을 수 있습니다.').then(take);
    else take();
  });
  document.addEventListener('gb:auth', renderCoupons);

  /* ---------- Sale calendar ---------- */
  const SALES = [
    { date: '2026-09-07', name: 'Labor Day 세일', where: '백화점 · 아웃도어', tip: '여름 의류 재고 정리' },
    { date: null, month: '2026-10', name: 'Prime Big Deal Days', where: 'Amazon', tip: '전자기기는 델라웨어(판매세 0%)', tba: true },
    { date: '2026-11-11', name: 'Veterans Day 세일', where: '백화점 · 아웃도어', tip: '블프 전 가격 비교용' },
    { date: '2026-11-27', name: 'Black Friday', where: '거의 모든 쇼핑몰', tip: '센터 입고 폭주 · 출고 1–2일 늦어질 수 있음' },
    { date: '2026-11-30', name: 'Cyber Monday', where: '온라인 전용', tip: '합배송 수수료 0원 기간(11.20–12.04)' },
    { date: '2026-12-26', name: '연말 클리어런스', where: '백화점 · 브랜드 공식몰', tip: '연휴 항공편 감편 · 결제 서두르기' },
    { date: '2027-01-01', name: 'New Year 세일', where: '브랜드 공식몰', tip: '미국 공휴일 · 센터 휴무' },
    { date: '2027-02-15', name: "Presidents' Day 세일", where: '가전 · 매트리스 · 백화점', tip: '대형 화물은 부피무게 확인' },
    { date: '2027-05-31', name: 'Memorial Day 세일', where: '아웃도어 · 가전', tip: '미국 공휴일 · 센터 휴무' },
    { date: null, month: '2027-07', name: 'Prime Day', where: 'Amazon', tip: '회원 전용 딜 · 델라웨어 추천', tba: true },
  ];

  function tiles(n) {
    const s = String(Math.max(0, n)).padStart(3, '0');
    return `<span class="dtiles" aria-label="${n}일 남음">${s.split('').map((c) => `<i aria-hidden="true">${c}</i>`).join('')}</span>`;
  }

  function renderSales() {
    const rows = SALES.map((s) => {
      const key = s.date || s.month + '-15';
      return { ...s, left: days(key), past: s.date ? days(s.date) < 0 : TODAY.slice(0, 7) > s.month };
    });
    const next = rows.find((r) => !r.past && r.date);
    $('#ev-next').innerHTML = next ? `<b>${esc(next.name)}</b> · ${md(next.date)} · <span class="mono">D-${next.left}</span>` : '';
    $('#sale-body').innerHTML = rows.map((r) => `
      <tr class="${r.past ? 'is-past' : ''}${r === next ? ' is-next' : ''}">
        <td class="mono">${r.date ? md(r.date) : r.month.replace('-', '.') + ' 중'}</td>
        <th scope="row">${esc(r.name)}${r.tba ? ' <span class="salet__tba">예상</span>' : ''}</th>
        <td>${esc(r.where)}</td>
        <td class="salet__tip">${esc(r.tip)}</td>
        <td class="num">${r.past ? '<span class="salet__done">지남</span>' : r.date ? tiles(r.left) : '<span class="salet__tba">발표 전</span>'}</td>
      </tr>`).join('');
  }

  /* ---------- Shipping-fee specials (data in specials.js) ---------- */
  function renderSpecials(kind) {
    const S = window.GBSpecials;
    const box = $('#spc-cards');
    if (!S || !box || !GB.specialHTML) return;
    const live = S.active(TODAY);
    $('#sp-count').textContent = `진행 중 ${live.length}건`;
    // live first (ending soonest first), ended last
    const list = S.EVENTS.filter((e) => kind === 'all' || e.kind === kind)
      .slice().sort((a, b) => (S.isEnded(a, TODAY) - S.isEnded(b, TODAY)) || ((a.end || '9999') < (b.end || '9999') ? -1 : 1));
    box.innerHTML = list.map((e) => GB.specialHTML(e, 'card')).join('');
  }
  $$('[data-spk]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-spk]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderSpecials(b.dataset.spk);
  }));

  renderSpecials('all');
  renderPromos('all');
  renderCoupons();
  renderSales();
})();
