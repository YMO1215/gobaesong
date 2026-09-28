/* Shared chrome for every page: center-hours timer, NJ/DE address panels,
   header login state, and the login / signup dialog backed by /api/auth/*. */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;
  const root = document.documentElement;
  const CACHE_KEY = 'gb.user';

  GB.RULES.userid = { re: /^[a-z][a-z0-9_]{3,19}$/, msg: '영문 소문자로 시작하는 4–20자(소문자·숫자·_)로 입력해 주세요.' };
  GB.RULES.password = { re: /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/, msg: '영문과 숫자를 섞어 8자 이상 입력해 주세요.' };

  /* ======================= Center hours timer ======================= */
  function tickHours() {
    if (!window.GBHours) return;
    const now = new Date();
    const nj = window.GBHours.status('NJ', now);
    const t = $('#ctimer');
    if (t) {
      t.dataset.state = nj.state;
      $('[data-ctimer-clock]', t).textContent = nj.clock;
      $('[data-ctimer-full]', t).textContent = nj.full;
      $('[data-ctimer-short]', t).textContent = nj.short;
      $('[data-ctimer-kst]', t).textContent = nj.state === 'open' ? '' : `한국 ${nj.reopenKst}`;
      t.title = `뉴저지 센터 · 미국 동부 ${nj.dow} ${nj.clock} · 업무시간 평일 ${nj.hours}` +
        (nj.state === 'open' ? '' : ` · 다음 업무 시작: 한국시간 ${nj.reopenKst}`);
    }
    $$('.addrpop').forEach((p) => {
      if (p.hidden) return;
      const s = window.GBHours.status(p.dataset.center, now);
      $('[data-addr-clock]', p).textContent = `${s.date}(${s.dow}) ${s.clock}`;
      const st = $('[data-addr-status]', p);
      st.textContent = `업무시간 ${s.hours} · ${s.full}`;
      st.dataset.state = s.state;
    });
  }

  /* ======================= Address panels ======================= */
  let openPanel = null;
  function setPanel(code) {
    $$('.addrpop').forEach((p) => { p.hidden = p.dataset.center !== code; });
    $$('.addr-btn').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.addr === code)));
    openPanel = code;
    if (code) tickHours();
  }
  function closePanel(returnFocus) {
    const code = openPanel;
    setPanel(null);
    if (returnFocus && code) { const b = $(`.addr-btn[data-addr="${code}"]`); if (b) b.focus(); }
  }
  GB.showAddress = (code) => {
    setPanel(code || (GB.auth.user && GB.auth.user.center) || 'NJ');
    const p = $(`#addr-${openPanel}`);
    if (p) p.scrollIntoView({ block: 'nearest', behavior: GB.reduceMotion ? 'auto' : 'smooth' });
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.addr-btn');
    if (btn) { const code = btn.dataset.addr; return openPanel === code ? closePanel(false) : setPanel(code); }
    if (e.target.closest('[data-addr-close]')) return closePanel(true);

    const row = e.target.closest('[data-copy-row]');
    if (row) {
      const dd = row.parentElement.querySelector('dd');
      if (row.parentElement.classList.contains('is-personal') && !GB.auth.user) return GB.auth.open('login', '로그인하면 개인 사서함 번호와 이름을 복사할 수 있습니다.');
      return GB.copy(dd.textContent.trim());
    }
    const all = e.target.closest('[data-copy-all]');
    if (all) {
      const lines = $$('.addrpop__rows > div', all.closest('.addrpop')).map((d) => `${$('dt', d).textContent}: ${$('dd', d).textContent.trim()}`);
      return GB.copy(lines.join('\n'));
    }
    if (openPanel && !e.target.closest('.addrpop') && !e.target.closest('dialog')) closePanel(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openPanel && !$('#authdlg[open]')) closePanel(true); });

  /* ======================= Auth state ======================= */
  const auth = (GB.auth = { user: null, ready: false, available: location.protocol !== 'file:', reason: '' });

  function readCache() { try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } }
  function writeCache(u) { try { if (u) sessionStorage.setItem(CACHE_KEY, JSON.stringify(u)); else sessionStorage.removeItem(CACHE_KEY); } catch { /* private mode: header just re-checks next load */ } }

  function render() {
    const u = auth.user;
    root.classList.toggle('is-authed', !!u);
    $$('[data-auth-id]').forEach((el) => { el.textContent = u ? u.id : ''; });
    $$('[data-auth-box]').forEach((el) => { el.textContent = u ? u.mailbox : ''; });
    $$('[data-auth-initial]').forEach((el) => { el.textContent = u ? u.id.charAt(0).toUpperCase() : ''; });
    $$('.addrpop').forEach((p) => {
      $('[data-addr-name]', p).textContent = u ? u.name : '로그인 후 표시';
      $('[data-addr-box]', p).textContent = u ? u.mailbox : '로그인 후 표시';
      p.classList.toggle('is-locked', !u);
    });
  }

  function setUser(u, silent) {
    auth.user = u || null;
    writeCache(auth.user);
    render();
    if (!silent) document.dispatchEvent(new CustomEvent('gb:auth', { detail: { user: auth.user } }));
  }

  async function api(path, body) {
    const res = await fetch('/api/auth/' + path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* HTML error page: treated as server unavailable */ }
    return { ok: res.ok, status: res.status, data };
  }

  async function refresh() {
    if (!auth.available) { auth.reason = 'file'; auth.ready = true; setUser(null); return; }
    try {
      const r = await api('me');
      if (r.data && r.data.ready === false) { auth.available = false; auth.reason = 'store'; }
      setUser(r.ok ? r.data.user : null);
    } catch {
      auth.available = false; auth.reason = 'network';
      setUser(null);
    }
    auth.ready = true;
  }

  const OFFLINE_MSG = {
    file: '파일로 직접 열어서 회원 서버에 연결할 수 없습니다. npm run dev 로 띄우거나 배포된 주소에서 이용해 주세요.',
    store: '회원 저장소가 아직 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.',
    network: '회원 서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.',
  };

  /* ======================= Dialog ======================= */
  const dlg = $('#authdlg');
  let pending = [];

  function showAlert(msg) {
    const a = $('#au-alert');
    if (!a) return;
    a.hidden = !msg;
    a.textContent = msg || '';
  }

  function setTab(tab) {
    const isLogin = tab === 'login';
    $('#au-login').hidden = !isLogin;
    $('#au-signup').hidden = isLogin;
    $('#au-welcome').hidden = true;
    $$('[role="tab"][data-auth-tab]', dlg).forEach((t) => {
      const on = t.dataset.authTab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $('.authdlg__tabs', dlg).hidden = false;
    $('#au-title').textContent = isLogin ? '로그인' : '회원가입 · 사서함 발급';
    showAlert(auth.available ? '' : OFFLINE_MSG[auth.reason] || OFFLINE_MSG.network);
  }

  auth.open = function (tab, reason) {
    if (!dlg) return;
    closePanel(false);
    setTab(tab === 'signup' ? 'signup' : 'login');
    const r = $('#au-reason');
    r.hidden = !reason;
    r.textContent = reason || '';
    if (!dlg.open) { if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); }
    const first = $(tab === 'signup' ? '#au-s-id' : '#au-l-id');
    if (first) setTimeout(() => first.focus(), 30);
  };

  // Resolves with the user once logged in (used by the apply form's final submit)
  auth.require = function (reason) {
    if (auth.user) return Promise.resolve(auth.user);
    return new Promise((resolve) => { pending.push(resolve); auth.open('login', reason); });
  };

  function flushPending() { const list = pending; pending = []; list.forEach((fn) => fn(auth.user)); }
  if (dlg) dlg.addEventListener('close', () => { if (!auth.user) pending = []; });

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-auth-open]');
    if (opener) { e.preventDefault(); return auth.open(opener.dataset.authOpen); }
    const tab = e.target.closest('[data-auth-tab]');
    if (tab) return setTab(tab.dataset.authTab);
    if (e.target.closest('[data-auth-show-addr]')) { dlg.close(); return GB.showAddress(); }
    if (e.target.closest('[data-auth-logout]')) return logout();
    const idBtn = e.target.closest('.hauth__id');
    const menu = $('#hauth-menu');
    if (idBtn) { const open = menu.hidden; menu.hidden = !open; idBtn.setAttribute('aria-expanded', String(open)); return; }
    if (menu && !menu.hidden && !e.target.closest('.hauth__menu')) { menu.hidden = true; $('.hauth__id').setAttribute('aria-expanded', 'false'); }
  });
  if (dlg) {
    $('.authdlg__tabs', dlg).addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = $('#au-login').hidden ? 'login' : 'signup';
      setTab(next);
      $(`[role="tab"][data-auth-tab="${next}"]`, dlg).focus();
    });
  }

  function applyServerErrors(form, errors) {
    let first = null;
    Object.entries(errors || {}).forEach(([name, msg]) => {
      const input = form.elements[name];
      if (!input || !input.closest) return;
      const field = input.closest('.field');
      let err = $('.field__error', field);
      if (!err) { err = document.createElement('p'); err.className = 'field__error'; err.id = 'err-' + input.id; field.appendChild(err); }
      err.textContent = msg;
      field.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), err.id].filter(Boolean).join(' '));
      if (!first) first = input;
    });
    if (first) first.focus();
  }

  function busy(form, on, label) {
    const b = $('button[type="submit"]', form);
    b.disabled = on;
    if (on) { b.dataset.label = b.textContent; b.textContent = label; } else if (b.dataset.label) b.textContent = b.dataset.label;
  }

  function passwordsMatch(form) {
    const pw2 = form.elements.password2;
    if (!pw2 || !pw2.value) return true;
    if (pw2.value === form.elements.password.value) return true;
    applyServerErrors(form, { password2: '비밀번호가 서로 다릅니다.' });
    return false;
  }

  async function submitAuth(form, path, payload, doneMsg) {
    showAlert('');
    if (!auth.available) { showAlert(OFFLINE_MSG[auth.reason] || OFFLINE_MSG.network); return; }
    busy(form, true, path === 'signup' ? '사서함 발급 중…' : '확인 중…');
    try {
      const r = await api(path, payload);
      if (!r.ok) {
        if (r.data.errors) applyServerErrors(form, r.data.errors);
        showAlert(r.data.message || '요청을 처리하지 못했습니다.');
        return;
      }
      setUser(r.data.user);
      GB.toast(doneMsg(r.data.user));
      return r.data.user;
    } catch {
      showAlert(OFFLINE_MSG.network);
    } finally {
      busy(form, false);
    }
  }

  const loginForm = $('#au-login');
  if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!GB.validate(loginForm)) return;
    const u = await submitAuth(loginForm, 'login', { id: loginForm.elements.id.value.trim(), password: loginForm.elements.password.value }, (x) => `${x.id} 님, 반갑습니다`);
    if (u) { loginForm.reset(); dlg.close(); flushPending(); }
  });

  const signupForm = $('#au-signup');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!GB.validate(signupForm) || !passwordsMatch(signupForm)) return;
      const f = signupForm.elements;
      const u = await submitAuth(signupForm, 'signup', {
        id: f.id.value.trim(), password: f.password.value, name: f.name.value.trim(), email: f.email.value.trim(),
        center: f.center.value, agree: f.agree.checked,
      }, (x) => `사서함 ${x.mailbox} 발급 완료`);
      if (!u) return;
      signupForm.reset();
      signupForm.hidden = true;
      $('.authdlg__tabs', dlg).hidden = true;
      $('#au-reason').hidden = true;
      $('#au-title').textContent = '가입 완료';
      const w = $('#au-welcome');
      w.hidden = false;
      w.focus();
      GB.press($('.stamp', w));
      flushPending();
    });

    // live id availability
    const idInput = signupForm.elements.id;
    const hint = $('#au-s-id-hint');
    let timer, seq = 0;
    idInput.addEventListener('input', () => {
      clearTimeout(timer);
      hint.dataset.state = '';
      hint.textContent = '영문 소문자로 시작하는 4–20자 (소문자·숫자·_)';
      const v = idInput.value.trim().toLowerCase();
      if (!auth.available || !GB.RULES.userid.re.test(v)) return;
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const r = await fetch('/api/auth/check-id?id=' + encodeURIComponent(v), { credentials: 'same-origin' }).then((x) => x.json());
          if (mine !== seq) return;
          hint.dataset.state = r.available ? 'ok' : 'taken';
          hint.textContent = r.available ? `${v} — 쓸 수 있는 아이디입니다.` : `${v} — ${r.reason || '쓸 수 없습니다.'}`;
        } catch { /* availability is a convenience; signup still re-checks on the server */ }
      }, 350);
    });
    signupForm.elements.password2.addEventListener('input', () => {
      const f = signupForm.elements.password2.closest('.field');
      if (f.classList.contains('is-invalid') && signupForm.elements.password2.value === signupForm.elements.password.value) {
        f.classList.remove('is-invalid');
        signupForm.elements.password2.removeAttribute('aria-invalid');
      }
    });
  }

  async function logout() {
    $('#hauth-menu').hidden = true;
    try { await api('logout', {}); } catch { /* cookie will expire; clear the UI regardless */ }
    setUser(null);
    GB.toast('로그아웃했습니다');
  }

  /* ======================= Boot ======================= */
  const cached = readCache();
  if (cached) setUser(cached, true);
  render();
  tickHours();
  setInterval(tickHours, 1000);
  refresh();
  // index.html?signup=1 (fallback href of every 사서함 발급 button) opens the signup dialog
  const qs = new URLSearchParams(location.search);
  if (qs.has('signup')) {
    qs.delete('signup');
    history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash);
    if (!readCache()) auth.open('signup');
  }
})();
