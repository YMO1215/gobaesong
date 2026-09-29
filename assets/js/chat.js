/* Floating consultation button on every page: KakaoTalk entry, mock live chat, hours (KST). */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;
  const fab = $('#chatfab');
  if (!fab) return;
  const panel = $('#chatpanel');
  const btn = $('#chatfab-btn');
  const log = $('#chatlog');

  // Counselors: weekdays 10:00–18:00 KST, lunch 12:30–13:30, closed on weekends
  function deskState(now) {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(now || new Date()).forEach((x) => { p[x.type] = x.value; });
    const mins = (Number(p.hour) % 24) * 60 + Number(p.minute);
    const weekday = !['Sat', 'Sun'].includes(p.weekday);
    if (weekday && mins >= 750 && mins < 810) return { state: 'lunch', text: '점심시간 · 13:30에 다시 연결됩니다' };
    if (weekday && mins >= 600 && mins < 1080) return { state: 'open', text: '지금 상담 가능 · 평일 10:00–18:00' };
    return { state: 'closed', text: '상담 시간 외 · 남기신 메시지는 다음 평일 오전에 답합니다' };
  }
  GB.deskState = deskState;

  function paintState() {
    const s = deskState();
    fab.dataset.state = s.state;
    $$('[data-chat-state]').forEach((el) => { el.textContent = s.text; el.dataset.state = s.state; });
    return s;
  }

  function show(view) {
    $$('[data-chat-view]', panel).forEach((v) => { v.hidden = v.dataset.chatView !== view; });
  }
  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    fab.classList.toggle('is-open', open);
    if (open) { paintState(); show('menu'); const first = $('.chatpanel__entry', panel); if (first) first.focus(); }
  }

  const ANSWERS = {
    addr: () => GB.auth && GB.auth.user
      ? `${GB.auth.user.id} 님 사서함은 ${GB.auth.user.mailbox} 입니다. 화면 맨 위 '뉴저지 주소 / 델라웨어 주소' 버튼에서 칸마다 복사할 수 있어요.`
      : '화면 맨 위 \'뉴저지 주소 / 델라웨어 주소\' 버튼을 눌러 보세요. 로그인하면 Street Address 2 에 개인 사서함 번호가 채워집니다.',
    fee: () => { const q = GB.quote({ center: 'NJ', weight: 3, unit: 'lb' }); return `뉴저지 기준 첫 1\u00A0LB $8.90, 이후 1\u00A0LB마다 $2.30 입니다. 3\u00A0LB 상자라면 ${GB.usd(q.total)}(약 ${GB.krw(q.krw)}). 상세 계산은 요금 페이지에서 할 수 있어요.`; },
    pccc: () => '개인통관고유부호는 P로 시작하는 13자리입니다. 2026년부터 유효기간 1년이 생겼고, 이름·전화번호·배송지 우편번호가 모두 맞아야 통관됩니다. 통관 가이드에 발급 순서가 있습니다.',
    track: () => GB.auth && GB.auth.user
      ? '마이페이지 여정 지도에서 입고부터 국내 배송까지 단계별 시각을 볼 수 있습니다.'
      : '로그인 후 마이페이지 여정 지도에서 확인할 수 있습니다. 운송장번호를 알려 주시면 상담원이 대신 찾아 드려요.',
  };
  const LINKS = { fee: ['요금 페이지', 'pricing.html'], pccc: ['통관 가이드', 'customs.html'], track: ['마이페이지', 'mypage.html'] };
  const LABEL = { addr: '내 미국 주소', fee: '배송비 얼마?', pccc: '통관부호', track: '내 화물 위치' };

  function say(who, text, link) {
    const li = document.createElement('li');
    li.className = 'chatlog__msg chatlog__msg--' + who;
    const p = document.createElement('p');
    p.textContent = text;
    li.appendChild(p);
    if (link) {
      const a = document.createElement('a');
      a.href = link[1];
      a.textContent = link[0] + ' 열기 →';
      li.appendChild(a);
    }
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
  }

  function startLive() {
    show('live');
    if (!log.children.length) {
      const s = deskState();
      say('bot', '안녕하세요, 고배송 상담 창구입니다. 아래 버튼을 누르거나 궁금한 점을 적어 주세요.');
      if (s.state !== 'open') say('bot', s.text);
    }
    $('#chat-text').focus();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-chat-toggle]')) return setOpen(panel.hidden);
    if (e.target.closest('[data-chat-open]')) return setOpen(true);
    if (e.target.closest('[data-chat-back]')) { show('menu'); return; }
    if (e.target.closest('[data-chat-live]')) return startLive();
    if (e.target.closest('[data-chat-kakao]')) {
      GB.toast('목업: 실제 서비스에서는 고배송 카카오톡 채널 상담창이 열립니다');
      return;
    }
    const q = e.target.closest('[data-chat-q]');
    if (q) {
      const k = q.dataset.chatQ;
      say('me', LABEL[k]);
      setTimeout(() => say('bot', ANSWERS[k](), LINKS[k]), 350);
      return;
    }
    if (!panel.hidden && !e.target.closest('#chatfab')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });

  $('#chatinput').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-text');
    const text = input.value.trim();
    if (!text) return;
    say('me', text);
    input.value = '';
    const s = deskState();
    setTimeout(() => say('bot', s.state === 'open'
      ? '상담원을 연결하고 있습니다. 대기 2번째입니다. (목업이라 실제 상담원은 연결되지 않습니다)'
      : '메시지를 남겨 두었습니다. 다음 평일 오전에 답변드립니다. (목업이라 실제로 전송되지는 않습니다)'), 400);
  });

  paintState();
  setInterval(paintState, 60000);

  /* P0-02: never sit on top of a primary action (pay, next step, apply CTAs, view switch).
     When one of them passes under the button, lift the button just above it. */
  const AVOID = '#pay-open, #next, .step__nav .btn, .deal__cta .btn, .spc__cta, .receipt__link, #p-apply, .footer__view, .coupon__act .btn, [data-fab-avoid]';
  const GAP = 12;
  const MAX_LIFT = 220;
  let lift = 0;
  let ticking = false;
  function avoid() {
    ticking = false;
    if (!panel.hidden) return;
    const r = btn.getBoundingClientRect();
    const baseTop = r.top + lift;              // where the button sits without any lift
    const baseBottom = r.bottom + lift;
    let need = 0;
    $$(AVOID).forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || el.offsetParent === null) return;
      const overlapX = b.left < r.right + GAP && b.right > r.left - GAP;
      const overlapY = b.top < baseBottom + GAP && b.bottom > baseTop - GAP;
      if (overlapX && overlapY) need = Math.max(need, baseBottom - b.top + GAP);
    });
    const next = Math.min(MAX_LIFT, Math.max(0, Math.round(need)));
    if (next !== lift) { lift = next; fab.style.setProperty('--fab-lift', lift + 'px'); }
  }
  const schedule = () => { if (!ticking) { ticking = true; requestAnimationFrame(avoid); } };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('click', () => setTimeout(schedule, 50));
  setTimeout(schedule, 300);
})();
