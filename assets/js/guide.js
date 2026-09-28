/* Guide page: per-step prep checklist saved in this browser, check-in meter */
(function () {
  'use strict';
  const GB = window.GB;
  const { $, $$ } = GB;
  const KEY = 'gb.guide';
  const boxes = $$('[data-ck]');
  if (!boxes.length) return;
  const saved = GB.store.get(KEY, {});
  boxes.forEach((b) => { b.checked = !!saved[b.dataset.ck]; });

  function render() {
    const done = boxes.filter((b) => b.checked).length;
    $('#ck-done').textContent = done;
    $('#ck-total').textContent = boxes.length;
    const pct = Math.round((done / boxes.length) * 100);
    $('#ck-bar span').style.width = pct + '%';
    $('#ck-bar').setAttribute('aria-valuenow', String(pct));
    $$('#ck-gates li').forEach((li, i) => {
      const gate = $(`#g${i + 1}`);
      const own = $$('[data-ck]', gate);
      const all = own.length && own.every((b) => b.checked);
      li.classList.toggle('is-done', all);
      gate.classList.toggle('is-done', all);
    });
  }

  document.addEventListener('change', (e) => {
    const b = e.target.closest('[data-ck]');
    if (!b) return;
    const data = GB.store.get(KEY, {});
    data[b.dataset.ck] = b.checked;
    GB.store.set(KEY, data);
    render();
    if (b.checked && $$('[data-ck]', b.closest('.gate')).every((x) => x.checked)) GB.toast(b.closest('.gate').querySelector('.gate__no').textContent + ' 준비 완료');
  });
  $('#ck-reset').addEventListener('click', () => { GB.store.del(KEY); boxes.forEach((b) => { b.checked = false; }); render(); });
  $$('[data-guide-addr]').forEach((b) => b.addEventListener('click', () => GB.showAddress && GB.showAddress()));

  // Show the member's own mailbox in the example shipping form
  const fill = (u) => $$('[data-auth-box-fallback]').forEach((el) => { el.textContent = u ? u.mailbox : 'GB-000000'; });
  fill(GB.auth && GB.auth.user);
  document.addEventListener('gb:auth', (e) => fill(e.detail.user));

  // Highlight the gate being read
  if ('IntersectionObserver' in window) {
    const links = $$('#ck-gates a');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-here', a.getAttribute('href') === '#' + en.target.id));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('.gate').forEach((g) => io.observe(g));
  }
  render();
})();
