/* Pricing page: ruler scale, full estimator, rate table */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;

  const MAX_LB = 50;
  const TABLE_WEIGHTS = Array.from({ length: 20 }, (_, i) => i + 1).concat([22, 25, 28, 30, 35, 40, 45, 50]);
  const KG_PER_LB = 0.45359237;

  const state = { center: 'NJ', partner: false, unit: 'lb', lb: 5 };
  const range = $('#w-range');
  const input = $('#p-weight');
  const scale = $('#scale');
  const tag = $('#tag');
  const form = $('#p-form');

  /* ---------- Ruler ticks ---------- */
  function drawRuler() {
    const el = $('#ruler');
    const W = 1000;
    let s = `<svg viewBox="0 0 ${W} 56" preserveAspectRatio="none">`;
    // tick positions match the range thumb travel (thumb width is inset on both ends)
    for (let lb = 1; lb <= MAX_LB; lb++) {
      const x = ((lb - 1) / (MAX_LB - 1)) * W;
      const major = lb === 1 || lb % 5 === 0;
      s += `<line x1="${x}" y1="0" x2="${x}" y2="${major ? 22 : 10}" stroke-width="${major ? 2 : 1}" vector-effect="non-scaling-stroke"/>`;
    }
    s += '</svg>';
    el.innerHTML = s;
    // labels as HTML so they don't stretch with the SVG
    const thumb = parseFloat(getComputedStyle(scale).getPropertyValue('--thumb')) || 28;
    [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50].forEach((lb) => {
      const span = document.createElement('span');
      span.className = 'scale__num mono';
      span.textContent = lb;
      const p = (lb - 1) / (MAX_LB - 1);
      span.style.left = `calc(${p} * (100% - ${thumb}px) + ${thumb / 2}px)`;
      el.appendChild(span);
    });
    el.querySelector('svg').style.cssText = `position:absolute;left:${thumb / 2}px;right:${thumb / 2}px;width:calc(100% - ${thumb}px);height:100%`;
  }

  function placeTag() {
    const thumb = parseFloat(getComputedStyle(scale).getPropertyValue('--thumb')) || 28;
    const W = scale.clientWidth;
    const lb = Math.min(MAX_LB, Math.max(1, state.lb));
    const p = (lb - 1) / (MAX_LB - 1);
    const raw = p * (W - thumb) + thumb / 2;
    const half = tag.offsetWidth / 2;
    const left = Math.min(W - half, Math.max(half, raw));
    tag.style.left = left + 'px';
    tag.style.setProperty('--nub', raw - left + 'px');
  }

  /* ---------- Estimate ---------- */
  function readOptions() {
    const o = {};
    ['consolidate', 'inspect', 'repack', 'photo', 'insurance'].forEach((k) => { o[k] = form.elements[k].checked; });
    return o;
  }

  function render() {
    const q = GB.quote({
      center: state.center, weight: state.lb, unit: 'lb',
      l: $('#p-l').value, w: $('#p-w').value, h: $('#p-h').value,
      partner: state.partner, options: readOptions(), declared: $('#p-declared').value,
    });
    // Event special: 기본요금 → 이벤트 조정 → 예상 최종 (options stay separate on top)
    const S = window.GBSpecials;
    const evId = $('#p-event') ? $('#p-event').value : '';
    const input = specialInput();
    const res = S && evId ? S.evaluate(evId, input, q.base, GB.today()) : null;
    const shipping = res && res.ok ? (res.final == null ? res.from : res.final) : q.base;
    const total = Math.round((shipping + q.extras) * 100) / 100;
    const pending = res && res.ok && res.final == null;

    $('#tag-w').textContent = (state.unit === 'kg' ? (state.lb * KG_PER_LB).toFixed(1) + 'kg' : fmtLb(state.lb) + 'lb');
    $('#tag-p').textContent = GB.usd(q.total);
    const rows = [
      ['실무게', q.actualLb.toFixed(2) + 'lb'],
      ['부피무게', q.volLb ? q.volLb.toFixed(2) + 'lb' : '—'],
      ['적용무게', q.billable + 'lb' + (q.usesVolume ? ' · 부피' : ''), true],
      [`① 기본요금${state.partner ? ' · 파트너스' : ''}`, GB.usd(q.base)],
    ];
    if (res && res.ok && res.kind !== 'from') rows.push([`② ${res.name} ${res.kind === 'fixed' ? '고정가 적용' : '할인'}`, (shipping - q.base < 0 ? '−' : '+') + GB.usd(Math.abs(shipping - q.base)), true]);
    if (pending) rows.push(['② 착한배송 (부피무게 면제)', GB.usd(res.from) + '부터', true]);
    q.lines.forEach((l) => rows.push(['옵션 · ' + l.label, GB.usd(l.price)]));
    $('#p-lines').innerHTML = rows.map(([k, v, strong]) => `<div${strong ? ' class="is-strong"' : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#p-special').innerHTML = res ? GB.specialResultHTML(res, S.candidates(input, q.base, GB.today())) : '';
    $('#p-total').textContent = GB.usd(total) + (pending ? '부터' : '');
    $('#p-krw').textContent = pending ? '입고 후 실측으로 확정' : '약 ' + GB.krw(Math.round(total * GB.KRW_PER_USD / 10) * 10);
    $('#p-apply').href = 'apply.html' + (res && res.ok ? '?event=' + res.id : '');
    placeTag();
    highlightRow(q.billable);
  }

  /* ---------- Special (event) inputs: only the ones an event needs are enabled ---------- */
  const NEEDS = {
    health_box: ['type', 'box18'], goodship: ['trk'], vacuum: ['type', 'trk'], consolidate: ['trk'], clothing: ['type'],
    shoe1: ['type', 'qty', 'trk'], watch: ['type', 'qty', 'trk'], headphone: ['type', 'qty', 'trk'], shoes2: ['type', 'qty'],
    tablet: ['type', 'trk'], vitamin: ['type', 'qty'],
  };
  function specialInput() {
    return {
      type: $('#p-type') ? $('#p-type').value : 'general',
      weight: state.lb, qty: Number($('#p-qty') && $('#p-qty').value) || 1, trackings: Number($('#p-trk') && $('#p-trk').value) || 0,
      consolidate: form.elements.consolidate.checked, needInspect: form.elements.inspect.checked,
      box18: !!($('#p-box18') && $('#p-box18').checked),
    };
  }
  function initSpecials() {
    const S = window.GBSpecials;
    const sel = $('#p-event');
    if (!S || !sel) return;
    sel.innerHTML = GB.specialOptions('');
    $('#p-type').innerHTML = Object.entries(S.TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    const toggle = () => {
      const need = NEEDS[sel.value] || [];
      [['type', '#p-type'], ['qty', '#p-qty'], ['trk', '#p-trk'], ['box18', '#p-box18']].forEach(([k, s]) => {
        const el = $(s);
        el.disabled = !!sel.value && !need.includes(k);
        el.closest('.field, .tick').classList.toggle('is-off', el.disabled);
      });
      const e = S.byId(sel.value);
      $('#p-event-hint').textContent = e ? `${e.name} — ${e.core.join(' · ')}` : '이벤트를 고르면 판정에 필요한 칸만 켜집니다. 조건 설명은 아래 B 구획에 모두 있습니다.';
    };
    sel.addEventListener('change', () => { toggle(); render(); });
    document.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pick-special]');
      if (!b) return;
      sel.value = b.dataset.pickSpecial; toggle(); render();
    });
    toggle();

    // B section: every event with its price and all limits visible (no hidden conditions on mobile)
    const list = $('#spc-list');
    const draw = (kind) => {
      list.innerHTML = S.EVENTS.filter((e) => kind === 'all' || e.kind === kind)
        .map((e) => GB.specialHTML(e, 'table')).join('');
    };
    $$('[data-sk]').forEach((b) => b.addEventListener('click', () => {
      $$('[data-sk]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw(b.dataset.sk);
    }));
    draw('all');
  }
  const fmtLb = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  /* ---------- Rate table ---------- */
  function renderTable() {
    const c = GB.RATES[state.center];
    $('#rates-caption').textContent = `${c.name} ${c.code} · USD · ₩${GB.num(GB.KRW_PER_USD)}/$ 가정`;
    $('#rate-body').innerHTML = TABLE_WEIGHTS.map((w) => {
      const n = GB.baseRate(state.center, w, false);
      const p = GB.baseRate(state.center, w, true);
      const cls = w % 5 === 0 ? ' class="is-step"' : '';
      return `<tr data-w="${w}"${cls}><td>${w}lb</td><td class="num">${GB.usd(n)}</td><td class="num">${GB.usd(p)}</td><td class="num">${GB.krw(Math.round(n * GB.KRW_PER_USD / 10) * 10)}</td></tr>`;
    }).join('');
  }
  let lastHit = null;
  function highlightRow(w) {
    const rows = $$('#rate-body tr');
    const target = rows.find((r) => Number(r.dataset.w) >= w) || rows[rows.length - 1];
    if (lastHit === target) return;
    rows.forEach((r) => r.classList.toggle('is-hit', r === target));
    lastHit = target;
  }

  /* ---------- Wiring ---------- */
  function setLb(lb, from) {
    state.lb = Math.max(0.1, Math.min(200, lb || 0.1));
    if (from !== 'range') range.value = String(Math.min(MAX_LB, Math.max(1, state.lb)));
    if (from !== 'input') input.value = state.unit === 'kg' ? (state.lb * KG_PER_LB).toFixed(1) : fmtLb(state.lb);
    range.setAttribute('aria-valuetext', `${fmtLb(state.lb)}lb`);
    render();
  }
  range.addEventListener('input', () => setLb(Number(range.value), 'range'));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    if (!v) return;
    setLb(state.unit === 'kg' ? v / KG_PER_LB : v, 'input');
  });
  form.addEventListener('change', render);
  form.addEventListener('input', (e) => { if (e.target !== input) render(); });
  form.addEventListener('submit', (e) => e.preventDefault());

  function segToggle(attr, cb) {
    $$(`[data-${attr}]`).forEach((b) => b.addEventListener('click', () => {
      $$(`[data-${attr}]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      cb(b.dataset[attr]);
    }));
  }
  segToggle('center', (v) => { state.center = v; lastHit = null; renderTable(); render(); });
  segToggle('member', (v) => { state.partner = v === 'partner'; render(); });
  segToggle('unit', (v) => { state.unit = v; setLb(state.lb); });

  window.addEventListener('resize', placeTag);

  /* ---------- Duty & VAT estimate (rules in duty.js) ---------- */
  function initDuty() {
    const f = $('#duty-form');
    if (!f || !window.GBDuty) return;
    const draw = () => {
      const r = window.GBDuty.estimate({
        cat: f.elements.cat.value, price: f.elements.price.value, local: f.elements.local.value,
        ship: f.elements.ship.value, fx: f.elements.fx.value, post: f.elements.post.checked, fta: f.elements.fta.checked,
      });
      const st = $('#d-stamp');
      st.dataset.status = r.taxed ? '결제대기' : '완료';
      st.textContent = r.taxed ? '과세' : '면세';
      $('#d-verdict').textContent = `판정 금액 ${GB.usd(r.judged)} · 기준 $${r.limit} ${r.taxed ? '초과 → 전액 과세' : '이하'}` +
        (r.excluded ? ' · 목록통관 배제 품목' : '');
      const lines = r.taxed
        ? [['과세가격 (물품+배송)×환율', GB.krw(r.customsValue)], [`관세 ${(r.rate * 100).toFixed(1).replace('.0', '')}%`, GB.krw(r.duty)], ['부가세 10%', GB.krw(r.vat)]]
        : [['물품+배송 원화', GB.krw(r.goodsKrw)], ['관세·부가세', '없음']];
      $('#d-lines').innerHTML = lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      $('#d-tax').textContent = GB.krw(r.tax);
      $('#d-all').textContent = `물품 + 배송 + 세금 = 약 ${GB.krw(r.totalKrw)}`;
    };
    f.addEventListener('input', draw);
    f.addEventListener('change', draw);
    f.addEventListener('submit', (e) => e.preventDefault());
    $('#d-pull').addEventListener('click', () => {
      const v = parseFloat(String($('#p-total').textContent).replace(/[^0-9.]/g, ''));
      if (v > 0) { f.elements.ship.value = v.toFixed(2); draw(); GB.toast('위 견적의 배송비 ' + GB.usd(v) + '를 넣었습니다'); }
    });
    draw();
  }

  drawRuler();
  renderTable();
  initSpecials();
  setLb(5);
  initDuty();
})();
