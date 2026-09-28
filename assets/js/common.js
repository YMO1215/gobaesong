/* ==========================================================================
   Gobaesong — shared behaviour (no framework, no network calls)
   ========================================================================== */
(function () {
  'use strict';

  const GB = (window.GB = window.GB || {});
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  GB.reduceMotion = reduceMotion;

  /* ---------- Pricing model (dummy but internally consistent) ---------- */
  const RATES = {
    NJ: { name: '뉴저지', code: 'EWR', first: 8.9, add: 2.3 },
    DE: { name: '델라웨어', code: 'ILG', first: 9.4, add: 2.4 },
  };
  const PARTNER_DISCOUNT = 0.07;
  const KRW_PER_USD = 1390;
  const VOLUMETRIC_DIVISOR = 166; // inch³ per lb
  const KG_PER_LB = 0.45359237;
  const OPTIONS = {
    consolidate: { label: '합배송', price: 3.0 },
    inspect: { label: '정밀검수', price: 2.0 },
    repack: { label: '보강 재포장', price: 3.0 },
    photo: { label: '안심뷰 사진 추가', price: 1.0 },
  };
  const INSURANCE_RATE = 0.02;
  const INSURANCE_MIN = 1.0;

  GB.RATES = RATES;
  GB.OPTIONS = OPTIONS;
  GB.KRW_PER_USD = KRW_PER_USD;
  GB.PARTNER_DISCOUNT = PARTNER_DISCOUNT;
  GB.VOLUMETRIC_DIVISOR = VOLUMETRIC_DIVISOR;

  const round2 = (n) => Math.round(n * 100) / 100;

  GB.baseRate = function (center, lb, partner) {
    const r = RATES[center] || RATES.NJ;
    const w = Math.max(1, Math.ceil(lb));
    const fee = r.first + (w - 1) * r.add;
    return round2(partner ? fee * (1 - PARTNER_DISCOUNT) : fee);
  };

  /**
   * quote({ center, weight, unit, l, w, h, partner, options: {consolidate,...}, declared })
   * Dimensions are in inches. Returns a full breakdown.
   */
  GB.quote = function (q) {
    const unit = q.unit === 'kg' ? 'kg' : 'lb';
    const actualLb = Math.max(0, Number(q.weight) || 0) / (unit === 'kg' ? KG_PER_LB : 1);
    const l = Number(q.l) || 0, w = Number(q.w) || 0, h = Number(q.h) || 0;
    const volLb = l && w && h ? (l * w * h) / VOLUMETRIC_DIVISOR : 0;
    const billable = Math.max(1, Math.ceil(Math.max(actualLb, volLb)));
    const base = GB.baseRate(q.center, billable, q.partner);
    const lines = [];
    let extras = 0;
    const opts = q.options || {};
    Object.keys(OPTIONS).forEach((k) => {
      if (opts[k]) { extras += OPTIONS[k].price; lines.push({ label: OPTIONS[k].label, price: OPTIONS[k].price }); }
    });
    if (opts.insurance) {
      const ins = round2(Math.max(INSURANCE_MIN, (Number(q.declared) || 0) * INSURANCE_RATE));
      extras += ins; lines.push({ label: '파손·분실 보험', price: ins });
    }
    const total = round2(base + extras);
    return {
      actualLb: round2(actualLb), volLb: round2(volLb), billable,
      usesVolume: volLb > actualLb, base, lines, extras: round2(extras), total,
      krw: Math.round((total * KRW_PER_USD) / 10) * 10,
      points: Math.floor(total * KRW_PER_USD * 0.01),
    };
  };

  GB.usd = (n) => '$' + (Number(n) || 0).toFixed(2);
  GB.krw = (n) => '₩' + Math.round(Number(n) || 0).toLocaleString('ko-KR');
  GB.num = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');

  /* ---------- Small helpers ---------- */
  GB.$ = (sel, root) => (root || document).querySelector(sel);
  GB.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  let toastEl, toastTimer;
  GB.toast = function (msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
  };

  GB.copy = function (text) {
    const done = () => GB.toast('복사했습니다 — ' + text);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  };
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { GB.toast('복사하지 못했습니다. 직접 선택해 주세요.'); }
    ta.remove();
  }

  GB.store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* storage unavailable: nothing to clear */ } },
  };

  GB.press = function (el) {
    if (!el) return;
    el.classList.remove('is-pressed');
    void el.offsetWidth; // restart animation
    el.classList.add('is-pressed');
  };

  /* ---------- Stamp markup ---------- */
  GB.stamp = function (status, code, extraClass) {
    const c = code ? ` <span class="stamp__code">${code}</span>` : '';
    return `<span class="stamp ${extraClass || ''}" data-status="${status}">${status}${c}</span>`;
  };
  GB.STATUSES = ['입고완료', '검수중', '결제대기', '출고', '통관중', '배송중', '완료'];

  /* ---------- Form validation (front only, nothing is sent) ---------- */
  const RULES = {
    email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, msg: '이메일 형식을 확인해 주세요.' },
    phone: { re: /^01[016789]-?\d{3,4}-?\d{4}$/, msg: '휴대폰 번호를 010-0000-0000 형식으로 입력해 주세요.' },
    pccc: { re: /^[Pp]\d{12}$/, msg: '개인통관고유부호는 P로 시작하는 13자리입니다.' },
    zip: { re: /^\d{5}$/, msg: '우편번호 5자리를 입력해 주세요.' },
    eng: { re: /^[A-Za-z][A-Za-z .,'-]*$/, msg: '영문으로 입력해 주세요.' },
    tracking: { re: /^(1Z[0-9A-Z]{16}|\d{12,22}|[A-Z]{2}\d{9}US|TBA\d{12})$/i, msg: '트래킹번호 형식을 확인해 주세요. 예: 1Z999AA10123456784' },
    url: { re: /^https?:\/\/\S+\.\S+/, msg: 'http(s):// 로 시작하는 주소를 입력해 주세요.' },
    money: { re: /^\d+(\.\d{1,2})?$/, msg: '금액을 숫자로 입력해 주세요. 예: 89.99' },
    int: { re: /^[1-9]\d{0,2}$/, msg: '1 이상의 숫자를 입력해 주세요.' },
    mailbox: { re: /^GB-?\d{6}(-\d{2})?$/i, msg: '사서함 번호 형식은 GB-000000 입니다.' },
  };
  GB.RULES = RULES;

  function fieldOf(input) { return input.closest('.field') || input.parentElement; }

  function errorEl(field) {
    let e = field.querySelector('.field__error');
    if (!e) { e = document.createElement('p'); e.className = 'field__error'; field.appendChild(e); }
    if (!e.id) e.id = 'err-' + Math.random().toString(36).slice(2, 9);
    return e;
  }

  GB.checkField = function (input) {
    const field = fieldOf(input);
    if (!field) return true;
    const val = input.type === 'checkbox' ? input.checked : String(input.value || '').trim();
    let msg = '';
    if (input.required && (input.type === 'checkbox' ? !val : val === '')) {
      msg = input.dataset.msgRequired || (input.type === 'checkbox' ? '필수 동의 항목입니다.' : '필수 입력 항목입니다.');
    } else if (val !== '' && input.dataset.rule && RULES[input.dataset.rule]) {
      const rule = RULES[input.dataset.rule];
      const v = input.dataset.rule === 'phone' ? String(val).replace(/\s/g, '') : val;
      if (!rule.re.test(v)) msg = rule.msg;
    } else if (val !== '' && input.minLength > 0 && String(val).length < input.minLength) {
      msg = `${input.minLength}자 이상 입력해 주세요.`;
    }
    const err = errorEl(field);
    if (msg) {
      field.classList.add('is-invalid');
      err.textContent = msg;
      input.setAttribute('aria-invalid', 'true');
      const ids = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
      ids.add(err.id);
      input.setAttribute('aria-describedby', Array.from(ids).join(' '));
      return false;
    }
    field.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    return true;
  };

  GB.validate = function (root) {
    const inputs = GB.$$('input, select, textarea', root).filter((i) => !i.disabled && i.type !== 'hidden' && i.offsetParent !== null && (i.required || i.dataset.rule));
    let first = null;
    inputs.forEach((i) => { if (!GB.checkField(i) && !first) first = i; });
    if (first) { first.focus({ preventScroll: false }); }
    return !first;
  };

  // Re-check a field once the user leaves it or corrects it
  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (t.matches && t.matches('input, select, textarea') && (t.required || t.dataset.rule) && t.value !== '') GB.checkField(t);
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.getAttribute && t.getAttribute('aria-invalid') === 'true') GB.checkField(t);
  });

  /* ---------- Barcode (decorative rhythm, deterministic per string) ---------- */
  GB.barcode = function (text, height) {
    const h = height || 56;
    const bars = [];
    let x = 0;
    const push = (w, fill) => { if (fill) bars.push([x, w]); x += w; };
    [2, 1, 1, 1, 2, 1].forEach((w, i) => push(w, i % 2 === 0));
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      for (let i = 0; i < 6; i++) push(1 + (((c >> (i % 5)) + i * 7 + c) % 3), i % 2 === 0);
    }
    [2, 1, 1, 1, 2].forEach((w, i) => push(w, i % 2 === 0));
    const rects = bars.map(([bx, bw]) => `<rect x="${bx}" y="0" width="${bw}" height="${h}"/>`).join('');
    return `<svg viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${rects}</svg>`;
  };

  function renderBarcodes(root) {
    GB.$$('[data-barcode]', root).forEach((el) => {
      if (el.dataset.rendered) return;
      el.innerHTML = GB.barcode(el.dataset.barcode, Number(el.dataset.barcodeH) || 56);
      el.dataset.rendered = '1';
    });
  }
  GB.renderBarcodes = renderBarcodes;

  /* ---------- Count-up ---------- */
  function countUp(el) {
    const target = Number(el.dataset.count);
    const dec = Number(el.dataset.decimals || 0);
    const fmt = (v) => dec ? v.toFixed(dec) : Math.round(v).toLocaleString('ko-KR');
    if (reduceMotion) { el.textContent = fmt(target); return; }
    const dur = 1400;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Reveal / count / stamp on view ---------- */
  function observeInView() {
    const targets = GB.$$('.reveal, [data-count], [data-press]');
    const act = (el) => {
      el.classList.add('is-in');
      if (el.hasAttribute('data-count')) countUp(el);
      if (el.hasAttribute('data-press')) GB.press(el);
    };
    if (!('IntersectionObserver' in window)) { targets.forEach(act); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { act(en.target); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
    targets.forEach((t) => io.observe(t));
  }

  /* ---------- Header: mobile menu ---------- */
  function initMenu() {
    const btn = GB.$('.menu-btn');
    const nav = GB.$('#gnav');
    if (!btn || !nav) return;
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      const header = nav.closest('.site-header');
      if (header) header.classList.toggle('is-menu-open', open);
      btn.querySelector('.menu-btn__label').textContent = open ? '닫기' : '메뉴';
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a, button')) set(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { set(false); btn.focus(); }
    });
    window.matchMedia('(min-width: 1181px)').addEventListener('change', (m) => { if (m.matches) set(false); });
  }

  /* Center-hours timer in the top bar lives in hours.js + member.js */

  /* ---------- Copy buttons ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    e.preventDefault();
    const src = b.dataset.copy;
    const text = src.startsWith('#') ? (GB.$(src) ? GB.$(src).innerText.trim() : '') : src;
    if (text) GB.copy(text);
  });

  /* ---------- Dialog close buttons ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-close-dialog]');
    if (b) { const d = b.closest('dialog'); if (d) d.close(); }
  });

  /* ---------- Boot ---------- */
  function boot() {
    initMenu();
    renderBarcodes();
    observeInView();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
