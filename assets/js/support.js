/* Support page: counter sign, FAQ filter/search, inquiry form, notices */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;

  const pad = (n) => String(n).padStart(2, '0');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = new Date();
  const ymd = String(today.getFullYear()).slice(2) + pad(today.getMonth() + 1) + pad(today.getDate());

  /* ---------- Counter sign (KST business hours) ---------- */
  function initCounter() {
    const flap = $('#counter-flap');
    if (!flap) return;
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const mins = Number(get('hour')) * 60 + Number(get('minute'));
    const weekday = !['Sat', 'Sun'].includes(get('weekday'));
    const lunch = weekday && mins >= 750 && mins < 810;
    const open = weekday && mins >= 600 && mins < 1080 && !lunch;
    const word = open ? 'OPEN' : lunch ? 'LUNCH' : 'CLOSED';
    flap.className = 'counter__flap ' + (open ? 'is-open' : 'is-closed');
    flap.innerHTML = `<span class="mono" aria-label="${word}">${word.split('').map((c) => `<i aria-hidden="true">${c}</i>`).join('')}</span>`;
    $('#counter-state').textContent = open ? '지금 상담 가능 · 대기 2명' : lunch ? '점심시간 · 13:30에 다시 엽니다' : '상담 시간 외 · 1:1 문의는 다음 영업일 오전에 답합니다';
    if (!GB.reduceMotion) $$('i', flap).forEach((i, k) => { i.style.animationDelay = k * 90 + 'ms'; i.classList.add('is-flip'); });
  }

  /* ---------- FAQ ---------- */
  function initFaq() {
    const items = $$('.qa');
    if (!items.length) return;
    let cat = 'all';
    let query = '';
    items.forEach((d) => {
      const s = $('summary', d);
      d.dataset.q = s.textContent.replace(/^Q/, '').trim();
      d.dataset.a = $('.qa__a', d).textContent.trim();
    });
    // counts per category
    const counts = { all: items.length };
    items.forEach((d) => { counts[d.dataset.cat] = (counts[d.dataset.cat] || 0) + 1; });
    $$('[data-n]').forEach((el) => { el.textContent = counts[el.dataset.n] || 0; });

    function apply() {
      const q = query.toLowerCase();
      let n = 0;
      items.forEach((d) => {
        const inCat = cat === 'all' || d.dataset.cat === cat;
        const hitQ = !q || d.dataset.q.toLowerCase().includes(q);
        const hitA = q && d.dataset.a.toLowerCase().includes(q);
        const show = inCat && (hitQ || hitA);
        d.hidden = !show;
        const text = esc(d.dataset.q);
        const marked = q && hitQ ? text.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`) : text;
        $('summary', d).innerHTML = `<span class="qa__q mono">Q</span>${marked}`;
        if (q && show && hitA && !hitQ) d.open = true;
        if (show) n++;
      });
      $('#faq-count').textContent = (q ? `‘${query}’ 검색 결과 ` : (cat === 'all' ? '전체 ' : '')) + n + '개';
      $('#faq-none').hidden = n > 0;
    }

    // Filter state lives in the URL (?cat=&q=#faq) so Back steps through filters instead of leaving the page
    const input = $('#faq-q');
    const CATS = $$('.cat').map((b) => b.dataset.cat);
    function syncControls() {
      $$('.cat').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cat === cat)));
      input.value = query;
      const filtered = cat !== 'all' || !!query;
      $$('[data-faq-reset]').forEach((b) => { if (b.classList.contains('faq__reset')) b.hidden = !filtered; });
    }
    function toURL(mode) {
      const u = new URL(location.href);
      u.searchParams.delete('cat'); u.searchParams.delete('q');
      if (cat !== 'all') u.searchParams.set('cat', cat);
      if (query) u.searchParams.set('q', query);
      u.hash = 'faq';
      if (u.href === location.href) return;
      history[mode === 'push' ? 'pushState' : 'replaceState']({ faq: true }, '', u);
    }
    function fromURL() {
      const u = new URL(location.href);
      const c = u.searchParams.get('cat');
      cat = CATS.includes(c) ? c : 'all';
      query = (u.searchParams.get('q') || '').trim().slice(0, 40);
    }
    const commit = (mode) => { syncControls(); apply(); toURL(mode); };
    const toList = () => $('#faq').scrollIntoView({ behavior: GB.reduceMotion ? 'auto' : 'smooth' });

    $$('.cat').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.cat; commit('push'); }));
    let typing = false;
    input.addEventListener('input', () => {
      query = input.value.trim();
      // first keystroke of a new search makes one history entry; the rest just update it
      commit(typing ? 'replace' : 'push');
      typing = true;
    });
    input.addEventListener('blur', () => { typing = false; });
    $('#faq-search-form').addEventListener('submit', (e) => { e.preventDefault(); query = input.value.trim(); typing = false; commit('replace'); toList(); });
    $$('[data-q]').forEach((b) => b.addEventListener('click', () => { query = b.dataset.q; typing = false; commit('push'); toList(); }));
    $$('[data-faq-reset]').forEach((b) => b.addEventListener('click', () => {
      cat = 'all'; query = ''; typing = false; commit('push');
    }));
    window.addEventListener('popstate', () => { fromURL(); typing = false; syncControls(); apply(); });

    fromURL();
    syncControls();
    apply();
    if (cat !== 'all' || query) setTimeout(toList, 0);
  }

  /* ---------- Inquiry form ---------- */
  const MAX_FILES = 3;
  const MAX_BYTES = 5 * 1024 * 1024;
  function initAsk() {
    const form = $('#ask-form');
    if (!form) return;
    $('#ask-date').textContent = '접수 후 번호가 발급됩니다';
    const body = $('#q-body');
    const len = $('#q-len');
    body.addEventListener('input', () => { len.textContent = `${body.value.length}/1000`; });

    const file = $('#q-file');
    const list = $('#q-file-list');
    file.addEventListener('change', () => {
      const files = Array.from(file.files || []);
      const field = file.closest('.field');
      const tooMany = files.length > MAX_FILES;
      const tooBig = files.some((f) => f.size > MAX_BYTES);
      field.classList.toggle('is-invalid', tooMany || tooBig);
      if (tooMany || tooBig) {
        list.textContent = tooMany ? `사진은 ${MAX_FILES}장까지 첨부할 수 있습니다.` : '5MB가 넘는 사진이 있습니다.';
        list.style.color = 'var(--danger)';
        file.value = '';
        return;
      }
      list.style.color = '';
      list.textContent = files.length ? files.map((f) => `${f.name} (${Math.ceil(f.size / 1024)}KB)`).join(' · ') : '파손 부위나 라벨 사진이 있으면 답이 빨라집니다.';
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!GB.validate(form)) { GB.toast('표시된 칸을 확인해 주세요'); return; }
      const no = `Q-${ymd}-${String(Math.floor(1000 + Math.random() * 9000))}`;
      $('#ask-no').textContent = no;
      $('#ask-date').textContent = 'No. ' + no;
      form.classList.add('is-sent');
      const done = $('#ask-done');
      done.hidden = false;
      done.focus();
      GB.press($('.stamp', done));
    });
    $('#ask-again').addEventListener('click', () => {
      form.reset();
      form.classList.remove('is-sent');
      $('#ask-done').hidden = true;
      $('#ask-date').textContent = '접수 후 번호가 발급됩니다';
      len.textContent = '0/1000';
      list.textContent = '파손 부위나 라벨 사진이 있으면 답이 빨라집니다.';
      $('#q-type').focus();
    });
  }

  /* ---------- Notices ---------- */
  const NOTICES = [
    { d: '2026.09.24', c: '출고', t: '추석 연휴 인천세관 통관 일정 안내 (10.3–10.9)', pin: true, b: ['연휴 기간 인천세관 통관 업무가 축소됩니다. 10월 1일 이후 출고분은 통관이 10월 10일부터 순차 진행됩니다.', '뉴저지·델라웨어 센터 입고와 검수는 미국 일정대로 정상 운영합니다.'] },
    { d: '2026.09.19', c: '요금', t: '델라웨어 센터 10월 유류할증료 동결', b: ['10월 유류할증료는 9월과 같으며 요금표 금액에 이미 포함되어 있습니다.'] },
    { d: '2026.09.11', c: '서비스', t: '안심뷰 사진 기본 제공 1장 → 2장으로 변경', b: ['9월 15일 입고분부터 외관과 개봉 사진 2장을 기본으로 제공합니다. 추가 5장 옵션 요금은 그대로 $1.00입니다.'] },
    { d: '2026.09.02', c: '통관', t: '건강기능식품은 $150 기준 · 6병 초과 시 수입 요건 확인', b: ['건강기능식품은 목록통관 배제 품목이라 미국발이어도 $150 기준으로 수입신고합니다. 6병을 넘으면 금액과 관계없이 요건 확인과 과세 대상입니다. 신청서에 병 수를 정확히 적어 주세요.'] },
    { d: '2026.08.27', c: '출고', t: '9월 항공 출고편 월·수·금 18:40 ET 고정', b: ['9월부터 국적기 직항 출고편을 주 3회로 고정합니다. 결제 마감은 각 출고일 12:00 ET입니다.'] },
    { d: '2026.08.14', c: '서비스', t: '마이페이지 여정 지도 업데이트', b: ['입고부터 완료까지 일곱 단계가 한 줄로 보이도록 마이페이지를 바꿨습니다. 단계마다 시각이 함께 표시됩니다.'] },
    { d: '2026.08.05', c: '요금', t: '파트너스 기본요금 할인율 5% → 7% 상향', b: ['8월 결제분부터 파트너스 회원의 기본요금 할인율이 7%로 오릅니다.'] },
    { d: '2026.07.22', c: '통관', t: '개인통관고유부호 명의 불일치 보류 건 증가 안내', b: ['수취인 이름과 통관부호 명의가 다른 경우 세관 보류가 늘고 있습니다. 신청서의 명의 확인 항목을 꼭 체크해 주세요.'] },
    { d: '2026.07.10', c: '서비스', t: '델라웨어 센터 토요일 입고 시작', b: ['7월 12일부터 델라웨어 센터가 토요일에도 입고를 받습니다. 검수는 월요일에 진행됩니다.'] },
    { d: '2026.06.30', c: '출고', t: '미국 독립기념일 센터 휴무 (7.4)', b: ['7월 4일은 두 센터 모두 휴무입니다. 7월 3일 입고분은 7월 7일 출고편에 실립니다.'] },
  ];
  const PAGE = 6;

  function initNotices() {
    const list = $('#notice-list');
    if (!list) return;
    let cat = 'all';
    let limit = PAGE;
    const more = $('#notice-more');
    function render() {
      const rows = NOTICES.filter((n) => cat === 'all' || n.c === cat);
      list.innerHTML = rows.slice(0, limit).map((n) =>
        `<details class="nt${n.pin ? ' is-pin' : ''}"><summary><time datetime="${n.d.replace(/\./g, '-')}">${n.d}</time><span class="badge${n.c === '출고' ? ' badge--navy' : ''}">${n.c}</span><span class="nt__title">${esc(n.t)}</span></summary>` +
        `<div class="nt__body">${n.b.map((p) => `<p>${esc(p)}</p>`).join('')}</div></details>`
      ).join('');
      more.hidden = rows.length <= limit;
    }
    $$('[data-ncat]').forEach((b) => b.addEventListener('click', () => {
      cat = b.dataset.ncat; limit = PAGE;
      $$('[data-ncat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }));
    more.addEventListener('click', () => { limit += PAGE; render(); });
    render();
    // deep link from other pages opens the pinned notice
    if (location.hash === '#notice') { const first = $('.nt', list); if (first) first.open = true; }
  }

  initCounter();
  initFaq();
  initAsk();
  initNotices();
})();
