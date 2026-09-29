/* Shared markup for shipping-fee specials (data + rules live in specials.js). */
(function () {
  'use strict';
  const GB = window.GB;
  const S = window.GBSpecials;
  if (!GB || !S) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  GB.today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  const FIELDS = [['target', '적용 대상'], ['inspect', '검수'], ['weight', '무게'], ['qty', '수량'], ['tracking', '트래킹'], ['consolidate', '합배송']];

  function kindBadge(e) {
    return `<span class="spc__kind spc__kind--${e.kind}">${S.KIND_LABEL[e.kind]}</span>`;
  }
  function period(e) {
    return e.end ? `${e.end.replace(/-/g, '.')}까지` : '상시';
  }

  /* mode: 'table' (pricing — every condition visible) | 'card' (events — core 3 + expandable) */
  GB.specialHTML = function (e, mode) {
    const ended = S.isEnded(e, GB.today());
    const facts = FIELDS.map(([k, l]) => `<div><dt>${l}</dt><dd>${esc(e[k])}</dd></div>`).join('') +
      `<div class="${e.end ? 'is-end' : ''}"><dt>기간</dt><dd>${period(e)}</dd></div>`;
    const head = `<header class="spc__head">${kindBadge(e)}${ended ? '<span class="stamp" data-status="접수">종료</span>' : e.end ? `<span class="spc__end mono">~${e.end.replace(/-/g, '.')}</span>` : ''}</header>
      <h3 class="spc__name" id="spc-${mode}-${e.id}">${esc(e.name)}</h3>
      <p class="spc__price mono">${S.priceLabel(e)}</p>`;
    if (mode === 'table') {
      // the toggle only shows on phones (base.css); on wider screens every condition stays visible
      return `<article class="spc spc--row${ended ? ' is-ended' : ''}" data-kind="${e.kind}" data-id="${e.id}" aria-labelledby="spc-${mode}-${e.id}">
        <div class="spc__lead">${head}<button type="button" class="spc__toggle" aria-expanded="true" aria-controls="spc-facts-${e.id}">조건 보기<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button></div>
        <dl class="spc__facts" id="spc-facts-${e.id}">${facts}</dl></article>`;
    }
    return `<article class="spc spc--card${ended ? ' is-ended' : ''}" data-kind="${e.kind}" id="special-${e.id}" aria-labelledby="spc-${mode}-${e.id}">
      ${head}
      <ul class="spc__core" role="list">${e.core.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      <details class="spc__more"><summary>전체 조건 보기</summary><dl class="spc__facts">${facts}</dl>
        ${e.more.length ? `<ul class="spc__notes">${e.more.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}</details>
      ${ended ? '<p class="spc__over">종료된 이벤트입니다</p>' : `<a class="btn btn--ghost btn--sm spc__cta" href="apply.html?event=${e.id}">이 조건으로 신청하기</a>`}
    </article>`;
  };

  /* Option list for <select> grouped by kind */
  GB.specialOptions = function (selected) {
    const today = GB.today();
    const group = (kind, label) => `<optgroup label="${label}">` + S.EVENTS.filter((e) => e.kind === kind && !S.isEnded(e, today))
      .map((e) => `<option value="${e.id}"${e.id === selected ? ' selected' : ''}>${esc(e.name)} · ${S.priceLabel(e)}</option>`).join('') + '</optgroup>';
    return `<option value="">해당사항 없음 · 일반 요금</option>` + S.KIND_ORDER.map((k) => group(k, S.KIND_LABEL[k])).join('');
  };

  /* Result block: 기본요금 → 이벤트 조정 → 예상 최종 (+ reasons & alternatives) */
  GB.specialResultHTML = function (res, alternatives) {
    if (!res.id) return '';
    if (!res.ok) {
      const alt = (alternatives || []).filter((a) => a.id !== res.id).slice(0, 2)
        .map((a) => `<button type="button" class="btn-text" data-pick-special="${a.id}">${esc(a.name)} (${a.final == null ? '$' + a.from.toFixed(2) + '부터' : GB.usd(a.final)})</button>`).join(' · ');
      return `<div class="spc-res spc-res--fail" role="alert"><p><b>${esc(res.name)} 조건에 맞지 않아 일반 요금으로 계산합니다.</b></p>
        <ul>${res.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        ${alt ? `<p class="spc-res__alt">대신 쓸 수 있는 이벤트: ${alt}</p>` : '<p class="spc-res__alt">지금 조건으로 쓸 수 있는 다른 이벤트가 없습니다.</p>'}</div>`;
    }
    return `<div class="spc-res spc-res--ok"><p><b>${esc(res.name)}</b> 적용 · <span class="spc__kind spc__kind--${res.kind}">${S.KIND_LABEL[res.kind]}</span></p>
      ${res.pending ? `<p class="spc-res__alt">${esc(res.pending)}</p>` : ''}</div>`;
  };
})();
