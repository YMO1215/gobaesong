/* Apply page: 4-step form, autofill, autosave, boarding-pass summary */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;

  GB.RULES.product = { re: /^[A-Za-z0-9][A-Za-z0-9 .,'&()/+#%:-]*$/, msg: '상품명은 영문·숫자로 입력해 주세요.' };

  const DRAFT_KEY = 'gb.apply.draft';
  const APPS_KEY = 'gb.applications';
  const LIST_CLEARANCE_LIMIT = 200; // USD, US-origin list clearance
  const STEP_NAMES = ['상품정보', '수취인·통관정보', '옵션', '확인'];
  const TOTAL_STEPS = 4;

  const form = $('#apply-form');
  if (!form) return;
  const itemsEl = $('#items');
  const tpl = $('#item-tpl');
  const steps = $$('.step', form);
  const segs = $$('.pass__seg');
  const nextBtn = $('#next');
  const prevBtn = $('#prev');

  const DEMO_MAILBOX = 'GB-000417';
  let mailbox = (GB.auth && GB.auth.user && GB.auth.user.mailbox) || DEMO_MAILBOX;
  $('#sum-box').textContent = mailbox;
  document.addEventListener('gb:auth', (e) => {
    mailbox = (e.detail.user && e.detail.user.mailbox) || DEMO_MAILBOX;
    $('#sum-box').textContent = mailbox;
  });

  let current = 1;
  let reached = 1;

  /* ---------- Paste buttons on every required text field ---------- */
  // required text fields + optional ones that opt in with data-paste-opt (e.g. 상품 주소)
  const PASTABLE = 'input.input[required]:not([type="checkbox"]):not([type="radio"]):not([data-nopaste]), input.input[data-paste-opt]';
  function addPasteButtons(root) {
    $$(PASTABLE, root).forEach((input) => {
      if (input.dataset.paste) return;
      input.dataset.paste = '1';
      const box = document.createElement('span');
      box.className = 'pastebox';
      input.parentNode.insertBefore(box, input);
      box.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'paste-btn';
      btn.textContent = '붙여넣기';
      const label = input.id && document.querySelector(`label[for="${input.id}"]`);
      const name = label ? label.childNodes[0].textContent.trim() : '이 칸';
      btn.setAttribute('aria-label', `${name}에 붙여넣기`);
      box.appendChild(btn);
    });
  }
  async function pasteInto(input) {
    let text = '';
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('unsupported');
      text = await navigator.clipboard.readText();
    } catch {
      input.focus();
      GB.toast('클립보드를 읽을 수 없습니다. 칸을 길게 눌러 “붙여넣기”를 선택하세요');
      return;
    }
    text = String(text).replace(/\s+/g, ' ').trim();
    if (!text) { input.focus(); GB.toast('클립보드가 비어 있습니다'); return; }
    if (input.maxLength > 0) text = text.slice(0, input.maxLength);
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    GB.checkField(input);
    input.focus();
  }
  form.addEventListener('click', (e) => {
    const b = e.target.closest('.paste-btn');
    if (b) pasteInto(b.parentNode.querySelector('input'));
  });
  addPasteButtons(form);
  // item rows added later (template clones)
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) addPasteButtons(n); }))).observe(form, { childList: true, subtree: true });

  /* ---------- Items ---------- */
  function addItem(data, animate) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const uid = Math.random().toString(36).slice(2, 8);
    $$('.field', node).forEach((f) => {
      const input = $('input, select', f);
      const label = $('label', f);
      input.id = `it-${input.dataset.k}-${uid}`;
      label.htmlFor = input.id;
    });
    if (data) $$('[data-k]', node).forEach((i) => { if (data[i.dataset.k] != null) i.value = data[i.dataset.k]; });
    if (animate) node.classList.add('is-new');
    itemsEl.appendChild(node);
    renumber();
    return node;
  }

  function renumber() {
    const list = $$('.item', itemsEl);
    list.forEach((it, i) => {
      $('.item__no', it).textContent = 'ITEM ' + String(i + 1).padStart(2, '0');
      const rm = $('.item__remove', it);
      rm.hidden = list.length === 1;
      rm.setAttribute('aria-label', `상품 ${i + 1} 삭제`);
    });
  }

  function readItems() {
    return $$('.item', itemsEl).map((it) => {
      const o = {};
      $$('[data-k]', it).forEach((i) => { o[i.dataset.k] = i.value.trim(); });
      return o;
    });
  }

  function declaredTotal(items) {
    return items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
  }

  itemsEl.addEventListener('click', (e) => {
    const rm = e.target.closest('.item__remove');
    if (!rm) return;
    const it = rm.closest('.item');
    const prev = it.previousElementSibling || it.nextElementSibling;
    it.remove();
    renumber();
    update();
    if (prev) $('input', prev).focus();
  });
  $('#add-item').addEventListener('click', () => {
    const n = addItem(null, true);
    $('input', n).focus();
    update();
  });

  /* ---------- Autofill from pasted order e-mail ---------- */
  const SAMPLE = [
    'Your Amazon.com order #112-4455120-7781 has shipped',
    'Carrier: UPS  Tracking number: 1Z999AA10123456784',
    '1 x Nike Pegasus 41 Running Shoes $129.99',
    '2 x Now Foods Vitamin D3 5000 IU $12.49',
  ].join('\n');
  const SHOPS = [['amazon', 'Amazon'], ['nike', 'Nike'], ['iherb', 'iHerb'], ['target', 'Target'], ['bestbuy', 'Best Buy'], ['best buy', 'Best Buy'], ['sephora', 'Sephora'], ['jcrew', 'J.Crew'], ['j.crew', 'J.Crew'], ['walmart', 'Walmart']];
  const CATS = [[/shoe|sneaker|boot/i, '신발'], [/vitamin|omega|supplement|protein|probiotic/i, '건강기능식품'], [/shirt|knit|sweater|jacket|pants|dress|hoodie/i, '의류'], [/bag|backpack|wallet|belt/i, '가방·잡화'], [/cream|serum|lotion|lip|perfume/i, '화장품'], [/earbud|headphone|charger|camera|laptop|ipad|watch/i, '전자기기'], [/lego|toy|baby|stroller/i, '완구·유아']];

  function runAutofill() {
    const src = $('#af-src').value;
    const out = $('#af-result');
    if (!src.trim()) { out.textContent = '붙여넣은 내용이 없습니다.'; out.classList.add('is-warn'); return; }
    let filled = 0;
    const lower = src.toLowerCase();
    const shop = SHOPS.find(([k]) => lower.includes(k));
    if (shop) { $('#f-shop').value = shop[1]; filled++; }
    const order = src.match(/(?:order|주문)\s*(?:#|no\.?|number|번호)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,})/i);
    if (order) { $('#f-order').value = order[1]; filled++; }
    const track = src.match(/\b(1Z[0-9A-Z]{16}|TBA\d{12}|\d{12,22})\b/i);
    if (track) { $('#f-track').value = track[1].toUpperCase(); filled++; }
    const lines = src.split(/\n/).map((l) => l.match(/^\s*(\d{1,3})\s*[x×]\s*(.+?)\s+\$\s?(\d+(?:\.\d{1,2})?)\s*$/i)).filter(Boolean);
    if (lines.length) {
      itemsEl.innerHTML = '';
      lines.forEach((m) => {
        const cat = (CATS.find(([re]) => re.test(m[2])) || [null, ''])[1];
        addItem({ qty: m[1], name: m[2], price: m[3], cat }, true);
      });
      filled += lines.length;
    }
    $$('input, select', form).forEach((i) => { if (i.getAttribute('aria-invalid') === 'true') GB.checkField(i); });
    update();
    out.classList.toggle('is-warn', filled === 0);
    out.textContent = filled ? `${filled}개 항목을 채웠습니다. 품목과 금액을 한 번 확인해 주세요.` : '알아볼 수 있는 주문 정보가 없습니다. 직접 입력해 주세요.';
  }
  $('#af-run').addEventListener('click', runAutofill);
  $('#af-sample').addEventListener('click', () => { $('#af-src').value = SAMPLE; runAutofill(); });

  /* ---------- Recent recipients ---------- */
  const RECENT = [
    { rname: '홍길동', reng: 'GILDONG HONG', rtel: '010-1234-5678', pccc: 'P123456789012', zip: '04001', addr: '서울특별시 마포구 월드컵북로 000', addr2: '101동 1001호' },
    { rname: '김고배', reng: 'GOBAE KIM', rtel: '010-9876-5432', pccc: 'P987654321098', zip: '06236', addr: '서울특별시 강남구 테헤란로 000', addr2: '고배빌딩 7층' },
  ];
  $$('[data-recent]').forEach((b) => b.addEventListener('click', () => {
    const r = RECENT[Number(b.dataset.recent)];
    Object.keys(r).forEach((k) => { const el = form.elements[k]; if (el) { el.value = r[k]; GB.checkField(el); } });
    update();
    GB.toast(r.rname + ' 님 정보를 불러왔습니다');
  }));
  $('#zip-find').addEventListener('click', () => {
    GB.toast('목업: 우편번호 검색 대신 예시 주소를 채웁니다');
    form.elements.zip.value = '04001';
    form.elements.addr.value = '서울특별시 마포구 월드컵북로 000';
    GB.checkField(form.elements.zip); GB.checkField(form.elements.addr);
    form.elements.addr2.focus();
    update();
  });

  /* ---------- Quote from current form ---------- */
  function currentQuote() {
    const f = form.elements;
    const items = readItems();
    return GB.quote({
      center: f.center.value,
      weight: f.estWeight.value || 1,
      unit: 'lb',
      declared: declaredTotal(items),
      options: {
        consolidate: f.ship.value === 'consolidate',
        inspect: f.inspect.value === 'precise',
        repack: f.repack.value === 'strong',
        photo: f.photo.checked,
        insurance: f.insurance.checked,
      },
    });
  }

  function optionLabels() {
    const f = form.elements;
    const out = [];
    out.push(f.ship.value === 'consolidate' ? '합배송' : '단독');
    out.push(f.inspect.value === 'precise' ? '정밀검수' : '기본 검수');
    out.push(f.repack.value === 'strong' ? '보강 재포장' : '기본 재포장');
    if (f.photo.checked) out.push('사진 +5');
    if (f.insurance.checked) out.push('보험');
    return out;
  }


  /* ---------- Shipping-fee special (event) — rules in specials.js ---------- */
  const SP = window.GBSpecials;
  const TRACKING_RE = /^(1Z[0-9A-Z]{16}|\d{12,22}|[A-Z]{2}\d{9}US|TBA\d{12})$/i;
  GB.RULES.trackings = { re: { test: (v) => String(v).split(/[\s,]+/).filter(Boolean).every((t) => TRACKING_RE.test(t)) }, msg: '트래킹번호 형식을 확인해 주세요. 여러 개면 쉼표로 구분합니다. 예: 1Z999AA10123456784' };
  const CAT_TO_TYPE = { '의류': 'clothing', '신발': 'shoes', '가방·잡화': 'hat_bag', '건강기능식품': 'supplement' };
  const trackingList = () => String(form.elements.tracking.value || '').split(/[\s,]+/).filter(Boolean);
  const selectedEvent = () => (form.elements.event ? form.elements.event.value : '') || '';
  let evKind = 'all';
  let typeTouched = false;

  function specialInput() {
    const f = form.elements;
    return {
      type: f.ptype.value || 'general',
      weight: Number(f.estWeight.value) || 1,
      qty: readItems().reduce((s, i) => s + (Number(i.qty) || 0), 0) || 1,
      trackings: trackingList().length,
      consolidate: f.ship.value === 'consolidate',
      needInspect: f.inspect.value === 'precise',
      box18: !!(f.box18 && f.box18.checked),
    };
  }
  function specialResult(q) {
    const id = selectedEvent();
    return SP && id ? SP.evaluate(id, specialInput(), q.base, GB.today()) : null;
  }
  // Shipping after the event: fixed price / % off / "from" (not estimated), options stay on top
  function feeWithSpecial(q) {
    const r = specialResult(q);
    const ship = r && r.ok ? (r.final == null ? r.from : r.final) : q.base;
    return { r, ship, total: Math.round((ship + q.extras) * 100) / 100, pending: !!(r && r.ok && r.final == null) };
  }

  function renderEventList() {
    const box = $('#ev-list');
    if (!SP || !box) return;
    const cur = selectedEvent();
    const type = form.elements.ptype.value || 'general';
    const fitOnly = $('#ev-fit').checked;
    const today = GB.today();
    const list = SP.EVENTS.filter((e) => !SP.isEnded(e, today))
      .filter((e) => e.id === cur || evKind === 'all' || (evKind === 'general' ? e.kind === 'from' : e.kind === evKind))
      .filter((e) => e.id === cur || !fitOnly || SP.fits(e, type));
    const row = (value, title, desc, price, kind) => `<label class="choice ev-choice"><input type="radio" name="event" value="${value}"${value === cur ? ' checked' : ''}>
      <span class="choice__mark" aria-hidden="true"></span>
      <span class="choice__body"><span class="choice__title">${title}${kind ? ` <span class="spc__kind spc__kind--${kind}">${SP.KIND_LABEL[kind]}</span>` : ''}</span><span class="choice__desc">${desc}</span></span>
      <span class="choice__price">${price}</span></label>`;
    box.innerHTML = row('', '해당사항 없음', '일반 무게 요금으로 계산합니다.', '일반 요금', null) +
      (list.length ? list.map((e) => row(e.id, esc(e.name), esc(e.core.join(' · ')), SP.priceLabel(e), e.kind)).join('')
        : '<p class="ev-pick__none">이 분류에 맞는 이벤트가 없습니다. 필터를 “전체”로 바꾸거나 “내 상품에 맞는 이벤트만”을 꺼 보세요.</p>');
    if (!form.elements.event || !Array.from(form.elements.event).some((r) => r.checked)) {
      const none = box.querySelector('input[value=""]');
      if (none) none.checked = true;
    }
  }

  function setDisabled(name, value, disabled, why) {
    const r = Array.from(form.elements[name]).find((x) => x.value === value);
    if (!r) return;
    r.disabled = disabled;
    const label = r.closest('.choice');
    label.classList.toggle('is-blocked', disabled);
    label.title = disabled ? why : '';
    if (disabled && r.checked) {
      Array.from(form.elements[name]).find((x) => x.value !== value).checked = true;
      GB.toast(why);
    }
  }

  function renderEventPanel() {
    if (!SP) return;
    const id = selectedEvent();
    const e = SP.byId(id);
    $('#ev-box18').hidden = id !== 'health_box';
    // conflicts are blocked, not just warned
    setDisabled('ship', 'consolidate', !!e && SP.NO_CONSOLIDATE.includes(id), e ? `${e.name}은(는) 합배송할 수 없어 단독 배송으로 바꿨습니다` : '');
    setDisabled('inspect', 'precise', !!e && SP.NO_INSPECT.includes(id), e ? `${e.name}은(는) 비검수라 정밀검수를 선택할 수 없습니다` : '');
    // tracking-required events flag the missing tracking right away
    const trackField = $('#f-track').closest('.field');
    const needTrack = !!e && SP.NEEDS_TRACKING.includes(id);
    trackField.classList.toggle('is-required-by-event', needTrack);
    const detail = $('#ev-detail');
    if (!e) { detail.innerHTML = ''; return; }
    const q = currentQuote();
    const r = specialResult(q);
    const alts = SP.candidates(specialInput(), q.base, GB.today());
    const fix = needTrack && trackingList().length < 1
      ? '<p class="ev-pick__fix"><b>트래킹번호가 필요합니다.</b> <button type="button" class="btn-text" data-goto-tracking>상품정보에서 트래킹 입력하기</button></p>' : '';
    detail.innerHTML = GB.specialHTML(e, 'table') + fix + GB.specialResultHTML(r, alts);
  }

  function eventStepOk() {
    const id = selectedEvent();
    if (!SP || !id) return true;
    const r = specialResult(currentQuote());
    if (r && r.ok) return true;
    GB.toast('선택한 배송비 이벤트의 조건이 맞지 않습니다. 조건을 고치거나 “해당사항 없음”을 고르세요');
    $('#ev-detail').scrollIntoView({ behavior: GB.reduceMotion ? 'auto' : 'smooth', block: 'center' });
    return false;
  }

  function initEvents() {
    if (!SP) return;
    $('#o-ptype').innerHTML = Object.entries(SP.TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('#o-ptype').addEventListener('change', () => { typeTouched = true; renderEventList(); renderEventPanel(); });
    $('#ev-fit').addEventListener('change', () => { renderEventList(); });
    $$('[data-evk]').forEach((b) => b.addEventListener('click', () => {
      evKind = b.dataset.evk;
      $$('[data-evk]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderEventList();
    }));
    document.addEventListener('click', (ev) => {
      const pick = ev.target.closest('[data-pick-special]');
      if (pick) {
        evKind = 'all'; $('#ev-fit').checked = false;
        $$('[data-evk]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.evk === 'all')));
        renderEventList();
        const r = Array.from(form.elements.event).find((x) => x.value === pick.dataset.pickSpecial);
        if (r) { r.checked = true; update(); }
        return;
      }
      if (ev.target.closest('[data-goto-tracking]')) { goTo(1, true); setTimeout(() => $('#f-track').focus(), 50); }
    });
    renderEventList();
  }
  // suggest 상품 분류 from the first item's 품목 until the user picks one
  function syncType() {
    if (!SP || typeTouched) return;
    const cat = (readItems()[0] || {}).cat;
    const t = CAT_TO_TYPE[cat] || 'general';
    if (form.elements.ptype.value !== t) { form.elements.ptype.value = t; renderEventList(); }
  }

  /* ---------- Summary + autosave ---------- */
  let saveTimer;
  function update() {
    const f = form.elements;
    const items = readItems();
    const declared = declaredTotal(items);
    $('#declared').textContent = GB.usd(declared);
    const note = $('#declared-note');
    const over = declared > LIST_CLEARANCE_LIMIT;
    note.textContent = over ? `$${LIST_CLEARANCE_LIMIT} 초과 · 일반통관 대상, 관·부가세가 부과될 수 있습니다` : `$${LIST_CLEARANCE_LIMIT} 이하 · 목록통관 예상`;
    note.classList.toggle('is-warn', over);

    const center = GB.RATES[f.center.value] || GB.RATES.NJ;
    $('#sum-from').textContent = center.code;
    $('#sum-from-name').textContent = center.name;
    $('#sum-name').textContent = f.rname.value.trim() || '—';
    const count = items.filter((i) => i.name).reduce((s, i) => s + (Number(i.qty) || 0), 0);
    $('#sum-items').textContent = count + '개';
    $('#sum-declared').textContent = GB.usd(declared);
    syncType();
    renderEventPanel();
    const q = currentQuote();
    const sp = feeWithSpecial(q);
    const ev = SP && SP.byId(selectedEvent());
    $('#sum-opts').textContent = (ev ? ev.name + (sp.r && sp.r.ok ? '' : '(조건 미충족)') + ' · ' : '') + optionLabels().join(' · ');
    $('#sum-fee').textContent = GB.usd(sp.total) + (sp.pending ? '부터' : '');
    $('#sum-fee-krw').textContent = sp.pending ? '입고 후 실측으로 확정' : '약 ' + GB.krw(Math.round(sp.total * GB.KRW_PER_USD / 10) * 10) + ' · ' + q.billable + 'lb 기준';
    const insLine = q.lines.find((l) => l.label.includes('보험'));
    $('#ins-price').textContent = '+' + GB.usd(insLine ? insLine.price : Math.max(1, declared * 0.02));

    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 500);
  }

  function saveDraft() {
    const data = { step: current, reached, items: readItems(), fields: {} };
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.dataset.k) return;
      if (el.type === 'radio') { if (el.checked) data.fields[el.name] = el.value; }
      else if (el.type === 'checkbox') data.fields[el.name] = el.checked;
      else data.fields[el.name] = el.value;
    });
    if (GB.store.set(DRAFT_KEY, data)) {
      const d = new Date();
      $('#save-state').textContent = `임시저장 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }

  function loadDraft() {
    const data = GB.store.get(DRAFT_KEY, null);
    if (!data) { addItem(); return false; }
    (data.items && data.items.length ? data.items : [null]).forEach((it) => addItem(it));
    Object.keys(data.fields || {}).forEach((name) => {
      const el = form.elements[name];
      if (!el) return;
      if (el instanceof RadioNodeList) { Array.from(el).forEach((r) => { r.checked = r.value === data.fields[name]; }); }
      else if (el.type === 'checkbox') el.checked = !!data.fields[name];
      else el.value = data.fields[name];
    });
    reached = Math.min(TOTAL_STEPS, data.reached || 1);
    $('#save-state').textContent = '임시저장본을 불러왔습니다';
    return data.step || 1;
  }

  $('#draft-clear').addEventListener('click', () => {
    GB.store.del(DRAFT_KEY);
    form.reset();
    itemsEl.innerHTML = '';
    addItem();
    $$('.field.is-invalid', form).forEach((f) => f.classList.remove('is-invalid'));
    reached = 1;
    goTo(1);
    update();
    $('#save-state').textContent = '새 신청서';
  });

  form.addEventListener('input', update);
  form.addEventListener('change', update);

  /* ---------- Step navigation ---------- */
  function goTo(n, focus) {
    current = n;
    reached = Math.max(reached, n);
    steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    segs.forEach((seg, i) => {
      const k = i + 1;
      seg.classList.toggle('is-now', k === n);
      seg.classList.toggle('is-done', k < n || (k <= reached && k !== n));
      const btn = $('.pass__btn', seg);
      btn.disabled = k > reached;
      if (k === n) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
      $('.pass__state', seg).textContent = k === n ? '작성 중' : k < n || k <= reached ? '완료' : '대기';
    });
    const pct = Math.round((n / TOTAL_STEPS) * 100);
    $('#progress-bar').style.width = pct + '%';
    $('#progress').setAttribute('aria-valuenow', String(pct));
    $('#progress-pct').textContent = pct + '%';
    prevBtn.hidden = n === 1;
    const label = n === TOTAL_STEPS ? '신청서 제출' : '다음 · ' + STEP_NAMES[n];
    nextBtn.firstChild.textContent = label;
    if (n === TOTAL_STEPS) buildReview();
    if (focus) {
      const h = $(`.step[data-step="${n}"] h2`);
      $('.pass').scrollIntoView({ behavior: GB.reduceMotion ? 'auto' : 'smooth', block: 'start' });
      if (h) h.focus({ preventScroll: true });
    }
    saveDraft();
  }

  segs.forEach((seg, i) => $('.pass__btn', seg).addEventListener('click', () => {
    const k = i + 1;
    if (k > reached || k === current) return;
    if (k > current && !GB.validate($(`.step[data-step="${current}"]`))) return;
    if (k > 3 && current <= 3 && !eventStepOk()) return;
    goTo(k, true);
  }));
  prevBtn.addEventListener('click', () => goTo(Math.max(1, current - 1), true));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const stepEl = $(`.step[data-step="${current}"]`);
    if (!GB.validate(stepEl)) { GB.toast('표시된 항목을 확인해 주세요'); return; }
    if (current === 3 && !eventStepOk()) return;
    if (current < TOTAL_STEPS) { goTo(current + 1, true); return; }
    // A real application belongs to an account; the file:// preview can still submit as a demo
    if (GB.auth && GB.auth.available && !GB.auth.user) {
      GB.auth.require('신청서를 제출하려면 로그인해 주세요. 작성한 내용은 그대로 남아 있습니다.').then(() => submit());
      return;
    }
    submit();
  });

  /* ---------- Review ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function buildReview() {
    const f = form.elements;
    const items = readItems();
    const q = currentQuote();
    const center = GB.RATES[f.center.value];
    const itemsHTML = items.map((it) => `<li><span>${esc(it.name || '(이름 없음)')} · ${esc(it.cat || '-')} × ${esc(it.qty || 0)}</span><b class="mono">${GB.usd((Number(it.price) || 0) * (Number(it.qty) || 0))}</b></li>`).join('');
    const block = (no, title, body, step) => `<div class="review__block"><h3><span>${no}</span>${title}</h3><div>${body}</div><button type="button" class="btn-text" data-edit="${step}">수정</button></div>`;
    const sp = feeWithSpecial(q);
    const ev = SP && SP.byId(selectedEvent());
    const lines = [['① 기본요금 · ' + q.billable + 'lb', q.base]];
    if (sp.r && sp.r.ok && !sp.pending) lines.push([`② ${ev.name} ${ev.kind === 'fixed' ? '고정가' : '할인'}`, sp.ship - q.base]);
    q.lines.forEach((l) => lines.push(['옵션 · ' + l.label, l.price]));
    const agree = $('#ev-agree');
    agree.hidden = !ev;
    agree.querySelector('input').required = !!ev;
    if (ev) {
      $('#ev-agree-title').textContent = `${ev.name}(${SP.priceLabel(ev)}) 조건을 확인했습니다.`;
      $('#ev-agree-desc').textContent = ev.core.join(' · ') + ' — 조건과 다르게 입고되면 일반 요금으로 다시 계산됩니다.';
    }
    $('#review').innerHTML =
      block('GATE 01', '배대지·상품정보', `<dl><dt>배대지</dt><dd><b>${center.name} ${center.code}</b></dd><dt>쇼핑몰</dt><dd>${esc(f.shop.value)}</dd><dt>주문번호</dt><dd class="mono">${esc(f.order.value)}</dd><dt>트래킹</dt><dd class="mono">${esc(f.tracking.value || '나중에 등록')}</dd></dl><ul class="review__items" style="margin-top:12px">${itemsHTML}</ul>`, 1) +
      block('GATE 02', '수취인·통관', `<dl><dt>수취인</dt><dd>${esc(f.rname.value)} · ${esc(f.reng.value)}</dd><dt>휴대폰</dt><dd class="mono">${esc(f.rtel.value)}</dd><dt>통관부호</dt><dd class="mono">${esc(f.pccc.value.replace(/^(P\d{4})\d{5}/i, '$1*****'))}</dd><dt>주소</dt><dd>(${esc(f.zip.value)}) ${esc(f.addr.value)} ${esc(f.addr2.value)}</dd></dl>`, 2) +
      block('GATE 03', '옵션', `<dl><dt>배송비 이벤트</dt><dd>${ev ? esc(ev.name) + ' · ' + SP.priceLabel(ev) + '<br><span class="review__sub">' + esc(ev.core.join(' · ')) + '</span>' : '해당사항 없음'}</dd><dt>선택</dt><dd>${optionLabels().join(' · ')}</dd>${f.memo.value ? `<dt>요청사항</dt><dd>${esc(f.memo.value)}</dd>` : ''}</dl>`, 3) +
      `<div class="review__fee" aria-label="예상 배송비">${lines.map(([l, p]) => `<div class="row"><span>${l}</span><b>${GB.usd(p)}</b></div>`).join('')}<div class="row total"><span>예상 합계 · 입고 후 확정</span><b>${sp.pending ? GB.usd(sp.total) + '부터' : GB.usd(sp.total)}</b></div><p class="review__dutynote">관부가세는 배송비와 별도입니다.</p></div>`;
  }
  $('#review').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) goTo(Number(b.dataset.edit), true);
  });

  /* ---------- Submit (nothing leaves the browser) ---------- */
  function submit() {
    const apps = GB.store.get(APPS_KEY, []);
    const no = `${mailbox}-${String(apps.length + 5).padStart(2, '0')}`;
    const f = form.elements;
    const items = readItems();
    apps.push({ no, shop: f.shop.value, title: items[0] ? items[0].name : '', count: items.length, declared: declaredTotal(items), at: Date.now() });
    GB.store.set(APPS_KEY, apps);
    GB.store.del(DRAFT_KEY);
    $('#done-no').textContent = no;
    form.hidden = true;
    const done = $('#done');
    done.hidden = false;
    const st = $('#sum-state');
    st.textContent = 'CONFIRMED'; st.classList.add('is-final');
    const bar = $('.bpass__bar');
    bar.innerHTML = GB.barcode(no, 40);
    $('.bpass__stub p').textContent = '신청번호 ' + no;
    $$('.pass__seg').forEach((s) => { s.classList.remove('is-now'); s.classList.add('is-done'); $('.pass__state', s).textContent = '완료'; $('.pass__btn', s).disabled = true; });
    $('#progress-bar').style.width = '100%';
    $('#progress-pct').textContent = '100%';
    $('#progress').setAttribute('aria-valuenow', '100');
    $('.pass').scrollIntoView({ behavior: GB.reduceMotion ? 'auto' : 'smooth' });
    done.focus({ preventScroll: true });
    GB.press($('.done__stamp'));
  }
  $('#again').addEventListener('click', () => { window.location.reload(); });

  /* ---------- Boot ---------- */
  initEvents();
  /* ---------- Warehouse (배대지) choice — step 1 ---------- */
  function paintWarehouse() {
    const code = form.elements.center.value;
    if (window.GBHours) {
      $$('[data-wh-state]').forEach((el) => {
        const st = window.GBHours.status(el.dataset.whState);
        el.textContent = `현지 ${st.clock} · ${st.short}`;
        el.dataset.state = st.state;
      });
    }
    const box = (GB.auth && GB.auth.user && GB.auth.user.mailbox) || mailbox;
    $('#wh-note').textContent = code === 'DE' ? `델라웨어 주소 + Address 2 에 ${box}` : `뉴저지 주소 + Address 2 에 ${box}`;
  }
  // stopPropagation: the same click would otherwise reach member.js's "click outside closes the panel"
  $('#wh-addr').addEventListener('click', (e) => { e.stopPropagation(); if (GB.showAddress) GB.showAddress(form.elements.center.value); });
  let centerTouched = false; // user choice or deep link wins over the member default
  form.addEventListener('change', (e) => { if (e.target.name === 'center') { centerTouched = true; paintWarehouse(); } });
  setInterval(paintWarehouse, 30000);

  const hadDraft = !!GB.store.get(DRAFT_KEY, null);
  let startStep = loadDraft();
  // New application: start from the member's own warehouse (chosen at signup), not always NJ
  const setCenter = (c) => { if (c === 'NJ' || c === 'DE') Array.from(form.elements.center).forEach((r) => { r.checked = r.value === c; }); };
  if (!hadDraft && GB.auth && GB.auth.user) setCenter(GB.auth.user.center);
  document.addEventListener('gb:auth', (e) => { if (!hadDraft && !centerTouched && e.detail.user && current === 1) { setCenter(e.detail.user.center); update(); paintWarehouse(); } });
  paintWarehouse();

  // Deep link from the hot deal radar: apply.html?shop=&item=&price=&cat=&url=&center=&w=
  const qs = new URLSearchParams(location.search);
  if (qs.get('item')) {
    itemsEl.innerHTML = '';
    addItem({ name: qs.get('item'), price: qs.get('price') || '', qty: '1', cat: qs.get('cat') || '', url: qs.get('url') || '' });
    if (qs.get('shop')) form.elements.shop.value = qs.get('shop');
    const c = qs.get('center');
    if (c === 'NJ' || c === 'DE') { Array.from(form.elements.center).forEach((r) => { r.checked = r.value === c; }); centerTouched = true; paintWarehouse(); }
    if (Number(qs.get('w')) > 0) form.elements.estWeight.value = qs.get('w');
    startStep = 1;
    history.replaceState(null, '', location.pathname);
    GB.toast('핫딜 상품 정보를 채웠습니다. 주문번호만 넣으면 됩니다');
  }
  // Deep link from the events page: apply.html?event=<id>
  const evParam = qs.get('event');
  if (evParam && SP && SP.byId(evParam)) {
    const ev = SP.byId(evParam);
    if (ev.types) { form.elements.ptype.value = ev.types[0]; typeTouched = true; }
    renderEventList();
    const r = Array.from(form.elements.event).find((x) => x.value === evParam);
    if (r) r.checked = true;
    if (!qs.get('item')) history.replaceState(null, '', location.pathname);
    GB.toast(`${ev.name} 이벤트를 선택해 두었습니다. 3단계 옵션에서 조건을 확인하세요`);
  }
  goTo(startStep || 1, false);
  update();
})();
