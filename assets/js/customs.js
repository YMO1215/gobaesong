/* Customs guide: PCCC format checker (local only, nothing is sent) */
(function () {
  'use strict';
  const GB = window.GB;
  const { $ } = GB;
  const form = $('#pchk');
  if (!form) return;
  const input = $('#pchk-in');
  const out = $('#pchk-out');

  function check(raw) {
    const v = String(raw).trim().toUpperCase().replace(/[\s-]/g, '');
    if (!v) return { ok: null, msg: '형식만 확인합니다. 번호는 이 화면 밖으로 전송되지 않습니다.' };
    if (/^0\d{12}$/.test(v)) return { ok: false, msg: '첫 글자가 숫자 0 입니다. 영문 P 로 바꿔 보세요.' };
    if (!v.startsWith('P')) return { ok: false, msg: '영문 P 로 시작해야 합니다.' };
    const digits = v.slice(1);
    if (/[O]/.test(digits)) return { ok: false, msg: '숫자 자리에 영문 O 가 있습니다. 숫자 0 으로 바꿔 보세요.' };
    if (!/^\d+$/.test(digits)) return { ok: false, msg: 'P 뒤에는 숫자만 12자리 들어갑니다.' };
    if (digits.length !== 12) return { ok: false, msg: `P 뒤 숫자가 ${digits.length}자리입니다. 12자리여야 합니다.` };
    return { ok: true, msg: `${v} — 형식이 맞습니다. 명의·휴대폰·우편번호가 신청서와 같은지도 확인하세요.` };
  }

  function run() {
    const r = check(input.value);
    out.textContent = r.msg;
    out.dataset.state = r.ok === null ? '' : r.ok ? 'ok' : 'bad';
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  input.addEventListener('input', () => { if (out.dataset.state) run(); });
})();
