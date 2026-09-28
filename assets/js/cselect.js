/* In-page dropdown for every <select class="select">.
   The native select stays in the form (value, validation, autosave, reset keep working) but is visually hidden;
   a designed button + listbox unfolds inside the page flow instead of the OS popup (e.g. Android's grey sheet). */
(function () {
  'use strict';
  const GB = window.GB || {};
  const NATIVE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const NATIVE_INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  let uid = 0;
  let openOne = null;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // "이름 · 요금" → main + meta so prices line up on the right
  function split(text) {
    const i = text.indexOf(' · ');
    return i > 0 ? [text.slice(0, i), text.slice(i + 3)] : [text, ''];
  }

  function enhance(sel) {
    if (sel.dataset.cs) return;
    sel.dataset.cs = '1';
    const id = 'cs' + (++uid);
    const wrap = document.createElement('div');
    wrap.className = 'cselect';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('cselect__native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cselect__btn';
    btn.id = id + '-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id + '-list');
    const list = document.createElement('ul');
    list.className = 'cselect__list';
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    list.hidden = true;
    wrap.appendChild(btn);
    wrap.appendChild(list);
    sel._csButton = btn;

    // the <label for> now points at a hidden element: send clicks to the button and name the button with it
    const label = sel.id && document.querySelector(`label[for="${sel.id}"]`);
    if (label) {
      if (!label.id) label.id = id + '-label';
      btn.setAttribute('aria-labelledby', label.id + ' ' + btn.id);
      list.setAttribute('aria-labelledby', label.id);
      label.addEventListener('click', (e) => { e.preventDefault(); btn.focus(); });
    } else if (sel.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
    }

    let active = -1;
    const opts = () => Array.from(list.querySelectorAll('[role="option"]'));

    function build() {
      let html = '';
      let n = 0;
      const item = (o) => {
        const [main, meta] = split(o.textContent.trim());
        const on = o.selected;
        return `<li role="option" id="${id}-o${n++}" data-value="${esc(o.value)}" aria-selected="${on}"${o.disabled ? ' aria-disabled="true"' : ''} class="cselect__opt${on ? ' is-on' : ''}">` +
          `<span class="cselect__main">${esc(main)}</span>${meta ? `<span class="cselect__meta">${esc(meta)}</span>` : ''}</li>`;
      };
      Array.from(sel.children).forEach((c) => {
        if (c.tagName === 'OPTGROUP') {
          html += `<li class="cselect__group" role="presentation">${esc(c.label)}</li>` + Array.from(c.children).map(item).join('');
        } else if (c.tagName === 'OPTION') html += item(c);
      });
      list.innerHTML = html;
      paint();
    }

    function paint() {
      const o = sel.options[NATIVE_INDEX.get.call(sel)];
      const [main, meta] = split(o ? o.textContent.trim() : '');
      btn.innerHTML = `<span class="cselect__main">${esc(main || '선택')}</span>${meta ? `<span class="cselect__meta">${esc(meta)}</span>` : ''}<span class="cselect__caret" aria-hidden="true"></span>`;
      btn.classList.toggle('is-placeholder', !o || o.value === '');
      btn.disabled = sel.disabled;
      wrap.classList.toggle('is-disabled', sel.disabled);
      ['aria-invalid', 'aria-describedby'].forEach((a) => {
        if (sel.hasAttribute(a)) btn.setAttribute(a, sel.getAttribute(a)); else btn.removeAttribute(a);
      });
      const val = NATIVE.get.call(sel);
      opts().forEach((li) => {
        const on = li.dataset.value === val;
        li.classList.toggle('is-on', on);
        li.setAttribute('aria-selected', String(on));
      });
    }

    function setActive(i) {
      const all = opts().filter((li) => li.getAttribute('aria-disabled') !== 'true');
      if (!all.length) return;
      active = Math.max(0, Math.min(all.length - 1, i));
      opts().forEach((li) => li.classList.remove('is-active'));
      const li = all[active];
      li.classList.add('is-active');
      list.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }

    function open() {
      if (sel.disabled) return;
      if (openOne && openOne !== api) openOne.close(false);
      openOne = api;
      list.hidden = false;
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      const all = opts().filter((li) => li.getAttribute('aria-disabled') !== 'true');
      setActive(Math.max(0, all.findIndex((li) => li.classList.contains('is-on'))));
      list.focus({ preventScroll: true });
      wrap.scrollIntoView({ block: 'nearest', behavior: GB.reduceMotion ? 'auto' : 'smooth' });
    }
    function close(focusBtn) {
      list.hidden = true;
      wrap.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      list.removeAttribute('aria-activedescendant');
      if (openOne === api) openOne = null;
      if (focusBtn) btn.focus();
    }
    function choose(li) {
      if (!li || li.getAttribute('aria-disabled') === 'true') return;
      const changed = NATIVE.get.call(sel) !== li.dataset.value;
      NATIVE.set.call(sel, li.dataset.value);
      paint();
      close(true);
      if (changed) {
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    btn.addEventListener('click', () => (list.hidden ? open() : close(true)));
    btn.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    });
    list.addEventListener('click', (e) => choose(e.target.closest('[role="option"]')));
    list.addEventListener('keydown', (e) => {
      const all = opts().filter((li) => li.getAttribute('aria-disabled') !== 'true');
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(all.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(all[active]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close(false);
    });

    // keep in sync with code that edits the select directly (innerHTML, .value =, .selectedIndex =, disabled, validation)
    new MutationObserver(build).observe(sel, { childList: true, subtree: true, characterData: true });
    new MutationObserver(paint).observe(sel, { attributes: true, attributeFilter: ['disabled', 'aria-invalid', 'aria-describedby'] });
    Object.defineProperty(sel, 'value', { configurable: true, get() { return NATIVE.get.call(this); }, set(v) { NATIVE.set.call(this, v); paint(); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return NATIVE_INDEX.get.call(this); }, set(v) { NATIVE_INDEX.set.call(this, v); paint(); } });
    sel.addEventListener('change', paint);
    if (sel.form) sel.form.addEventListener('reset', () => setTimeout(paint, 0));

    const api = { close };
    build();
  }

  document.addEventListener('click', (e) => { if (openOne && !e.target.closest('.cselect.is-open')) openOne.close(false); });

  function scan(root) { (root.querySelectorAll ? root.querySelectorAll('select.select') : []).forEach(enhance); }
  GB.enhanceSelects = scan;
  scan(document);
  // selects added later (e.g. apply.html item rows cloned from a <template>)
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('select.select')) enhance(n); else scan(n);
  }))).observe(document.body, { childList: true, subtree: true });
})();
