/* 배송비 이벤트(스페셜) — 단일 데이터 + 판정 로직. pricing · apply · events · index 가 모두 이 파일을 쓴다.
   근거: 고배송 모바일 신청서 화면의 이벤트 옵션(수정 지시서). 운영 투입 전 관리자 기준으로 요금·종료일 재대조 필요.
   공식은 주어진 것만 쓴다: 고정가(fixed) / 일반 요금 할인(discount) / "부터"(from: 최종 금액 미확정 → 추정하지 않음).
   Pure: window.GBSpecials in the browser, vm in tests. */
(function (root) {
  'use strict';

  // 상품 종류 — 이벤트 판정 입력
  const TYPES = {
    general: '일반 상품',
    clothing: '의류',
    hat_bag: '모자·가방',
    shoes: '신발(부츠 제외)',
    boots: '부츠',
    supplement: '건강보조식품(정제·캡슐)',
    supplement_powder: '건강보조식품(파우더·액상)',
    watch: '시계',
    headphone: '헤드폰',
    tablet: '태블릿',
    vacuum_lgsamsung: '무선청소기(LG·삼성)',
    vacuum_other: '청소기(그 밖의 브랜드·유선)',
  };

  /* kind: fixed | discount | from
     inspect: '검수' | '비검수' | '수량 확인'
     featured: 메인 스트립 노출 순서(운영자가 정함, 없으면 미노출) */
  const EVENTS = [
    { id: 'health_box', name: '건강식품 한박스 스페셜', kind: 'fixed', price: 5.99, end: '2026-12-31', featured: 1,
      inspect: '검수 · 수량만 확인', target: '건강식품', weight: '무게 무관', qty: '수량만 확인(상품 확인 안 함)',
      tracking: '여러 트래킹·여러 상품 허용', consolidate: '가능(여러 트래킹)',
      core: ['18호 박스(8×6×4in) 안에 들어갈 것', '무게 무관', '2026.12.31까지'],
      more: ['검수는 수량만 확인하며 상품 내용은 확인하지 않습니다.', '여러 트래킹·여러 상품을 한 박스로 받을 수 있습니다.'] },
    { id: 'goodship', name: '착한배송', kind: 'from', price: 6.80, featured: null,
      inspect: '비검수', target: '모든 상품', weight: '부피무게 면제', qty: '상품 여러 개 허용',
      tracking: '트래킹 1개', consolidate: '불가(트래킹 2개 이상이면 합배송 스페셜로 변경)',
      core: ['비검수 · 상품 확인 없음', '부피무게 면제', '트래킹 1개만'],
      more: ['부피가 커지지 않도록 재포장합니다.', '최종 금액은 입고 후 실측으로 확정됩니다.'] },
    { id: 'vacuum', name: 'LG 삼성 청소기', kind: 'fixed', price: 30, featured: null,
      inspect: '검수', target: 'LG·삼성 무선청소기', weight: '18\u00A0LB 이하', qty: '1대',
      tracking: '정확한 트래킹번호 필수', consolidate: '불가',
      core: ['LG·삼성 무선청소기', '18\u00A0LB 이하', '합배송 불가'],
      more: ['정확한 트래킹번호가 있어야 합니다.'] },
    { id: 'consolidate', name: '합배송 스페셜', kind: 'discount', rate: 0.10, featured: 3,
      inspect: '수량 확인', target: '모든 상품', weight: '일반 요금 기준', qty: '제한 없음',
      tracking: '트래킹 입력 필수 · 복수 트래킹·오더번호 허용', consolidate: '가능(합배송·묶음배송)',
      core: ['모든 상품 · 일반 요금 10% 할인', '트래킹 입력 필수', '복수 트래킹·오더번호 허용'],
      more: ['착한배송에 트래킹을 2개 이상 넣으면 이 이벤트로 바뀝니다.', '수량을 확인합니다.'] },
    { id: 'clothing', name: '의류 스페셜', kind: 'discount', rate: 0.20, featured: 2,
      inspect: '수량 확인', target: '의류(모자·가방 제외)', weight: '일반 요금 기준', qty: '제한 없음',
      tracking: '복수 트래킹·오더번호 허용', consolidate: '가능(합배송·묶음배송)',
      core: ['의류만 · 일반 요금 20% 할인', '모자·가방 제외', '합배송·묶음배송 가능'],
      more: ['수량을 확인합니다.'] },
    { id: 'shoe1', name: '신발 1켤레', kind: 'fixed', price: 9.40, featured: null,
      inspect: '비검수', target: '신발 1켤레(부츠 제외)', weight: '제한 없음', qty: '신발 1개',
      tracking: '정확한 트래킹번호 필수', consolidate: '불가(단품)',
      core: ['신발 1켤레 · 부츠 제외', '브랜드 신발박스 포함', '정확한 트래킹번호 필수'],
      more: ['폴리백(파우치)으로 포장합니다.', '비검수입니다.'] },
    { id: 'watch', name: '시계', kind: 'fixed', price: 7.30, featured: null,
      inspect: '비검수', target: '시계(손목시계 포함)', weight: '4\u00A0LB 이하', qty: '단품 1개',
      tracking: '정확한 트래킹번호 필수', consolidate: '불가(단품)',
      core: ['단품 1개', '4\u00A0LB 이하', '정확한 트래킹번호 필수'],
      more: ['손목시계를 포함합니다.', '비검수입니다.'] },
    { id: 'headphone', name: '헤드폰', kind: 'fixed', price: 8.30, featured: null,
      inspect: '비검수', target: '헤드폰', weight: '4\u00A0LB 이하', qty: '단품 1개',
      tracking: '정확한 트래킹번호 1개 필수', consolidate: '불가(단품)',
      core: ['단품 1개', '4\u00A0LB 이하', '트래킹번호 1개'],
      more: ['비검수입니다.'] },
    { id: 'shoes2', name: '신발 2개 이상', kind: 'discount', rate: 0.20, featured: null,
      inspect: '검수', target: '신발 2개 이상(부츠 포함)', weight: '일반 요금 기준', qty: '2개 이상',
      tracking: '제한 없음', consolidate: '가능',
      core: ['신발 2개 이상 · 일반 요금 20% 할인', '부츠류 포함', '신발박스 포함'],
      more: [] },
    { id: 'tablet', name: '태블릿', kind: 'fixed', price: 7.30, featured: null,
      inspect: '비검수', target: '모든 태블릿', weight: '4\u00A0LB 이하', qty: '단품',
      tracking: '정확한 트래킹번호 필수', consolidate: '불가(단품)',
      core: ['모든 태블릿', '4\u00A0LB 이하', '정확한 트래킹번호 필수'],
      more: ['추가 상품 조건은 이벤트 상세에서 확인하세요.', '비검수입니다.'] },
    { id: 'vitamin', name: '비타민', kind: 'fixed', price: 7.30, featured: null,
      inspect: '수량 확인', target: '건강보조식품(파우더·액상 제외)', weight: '총 4\u00A0LB 이하', qty: '최대 6병',
      tracking: '제한 없음', consolidate: '가능',
      core: ['최대 6병', '총 4\u00A0LB 이하', '파우더·액상 제외'],
      more: ['모든 건강보조식품에 적용합니다.', '수량을 확인합니다.'] },
  ];

  // Which product types an event can apply to (null = every type) — used to narrow the list by 상품 분류
  const TYPE_FIT = {
    health_box: ['supplement', 'supplement_powder'], vacuum: ['vacuum_lgsamsung'], clothing: ['clothing'], shoe1: ['shoes'],
    watch: ['watch'], headphone: ['headphone'], shoes2: ['shoes', 'boots'], tablet: ['tablet'], vitamin: ['supplement'],
  };
  EVENTS.forEach((e) => { e.types = TYPE_FIT[e.id] || null; });
  // Events that ship a single item or forbid consolidation, and events without inspection
  const NO_CONSOLIDATE = ['vacuum', 'shoe1', 'watch', 'headphone', 'tablet', 'goodship'];
  const NO_INSPECT = ['goodship', 'shoe1', 'watch', 'headphone', 'tablet'];
  const NEEDS_TRACKING = ['vacuum', 'consolidate', 'shoe1', 'watch', 'headphone', 'tablet'];
  const fits = (e, type) => !e.types || e.types.includes(type);

  const KIND_LABEL = { fixed: '고정가', discount: '일반 요금 할인', from: '최저가부터' };
  // Display order everywhere (dropdown, pricing list, apply list, event cards): 최저가부터 → 일반 요금 할인 → 고정가
  const KIND_ORDER = ['from', 'discount', 'fixed'];
  EVENTS.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)); // stable: keeps order within a kind
  const byId = (id) => EVENTS.find((e) => e.id === id) || null;
  const usd = (n) => '$' + (Math.round(n * 100) / 100).toFixed(2);

  function priceLabel(e) {
    if (e.kind === 'fixed') return usd(e.price) + ' 고정';
    if (e.kind === 'discount') return `일반 요금 ${Math.round(e.rate * 100)}% 할인`;
    return usd(e.price) + '부터';
  }

  function isEnded(e, today) { return !!(e.end && today && today > e.end); }

  /* input: { type, weight(lb), qty, trackings, consolidate(bool), needInspect(bool), box18(bool) }
     returns reasons[] — empty means the event applies */
  function check(e, i) {
    const r = [];
    const t = i.type || 'general';
    const w = Number(i.weight) || 0, q = Number(i.qty) || 0, tr = Number(i.trackings) || 0;
    const noInspect = () => { if (i.needInspect) r.push('비검수 이벤트라 정밀검수를 받을 수 없습니다'); };
    const exactTracking = () => { if (tr < 1) r.push('정확한 트래킹번호가 필요합니다 — 상품정보 단계에서 입력'); };
    const single = () => { if (q !== 1) r.push(`단품 1개만 됩니다(지금 ${q}개)`); if (i.consolidate) r.push('단품 이벤트라 합배송할 수 없습니다'); };
    switch (e.id) {
      case 'health_box':
        if (!['supplement', 'supplement_powder'].includes(t)) r.push('건강식품에만 적용됩니다');
        if (!i.box18) r.push('18호 박스(8×6×4in)에 들어가야 합니다');
        break;
      case 'goodship':
        noInspect();
        if (tr >= 2) r.push('트래킹이 2개 이상이면 합배송 스페셜로 바뀝니다');
        if (i.consolidate) r.push('합배송은 합배송 스페셜로 신청하세요');
        break;
      case 'vacuum':
        if (t !== 'vacuum_lgsamsung') r.push('LG·삼성 무선청소기만 됩니다');
        if (w > 18) r.push(`18\u00A0LB 초과(${w}\u00A0LB) — 일반 요금으로 계산됩니다`);
        exactTracking();
        if (i.consolidate) r.push('청소기 이벤트는 합배송이 안 됩니다');
        break;
      case 'consolidate':
        if (tr < 1) r.push('트래킹번호를 1개 이상 입력해야 합니다');
        break;
      case 'clothing':
        if (t === 'hat_bag') r.push('모자·가방은 의류 스페셜에서 빠집니다');
        else if (t !== 'clothing') r.push('의류에만 적용됩니다');
        break;
      case 'shoe1':
        if (t === 'boots') r.push('부츠는 신발 1켤레 이벤트에서 빠집니다(신발 2개 이상은 부츠 포함)');
        else if (t !== 'shoes') r.push('신발에만 적용됩니다');
        noInspect(); exactTracking(); single();
        break;
      case 'watch':
        if (t !== 'watch') r.push('시계에만 적용됩니다');
        if (w > 4) r.push(`4\u00A0LB 초과(${w}\u00A0LB)`);
        noInspect(); exactTracking(); single();
        break;
      case 'headphone':
        if (t !== 'headphone') r.push('헤드폰에만 적용됩니다');
        if (w > 4) r.push(`4\u00A0LB 초과(${w}\u00A0LB)`);
        if (tr !== 1) r.push(tr < 1 ? '트래킹번호 1개가 필요합니다' : '트래킹번호는 1개만 됩니다');
        noInspect(); single();
        break;
      case 'shoes2':
        if (!['shoes', 'boots'].includes(t)) r.push('신발에만 적용됩니다');
        if (q < 2) r.push('신발이 2개 이상이어야 합니다');
        break;
      case 'tablet':
        if (t !== 'tablet') r.push('태블릿에만 적용됩니다');
        if (w > 4) r.push(`4\u00A0LB 초과(${w}\u00A0LB)`);
        noInspect(); exactTracking();
        if (i.consolidate) r.push('단품 이벤트라 합배송할 수 없습니다');
        break;
      case 'vitamin':
        if (t === 'supplement_powder') r.push('파우더·액상은 비타민 이벤트에서 빠집니다');
        else if (t !== 'supplement') r.push('건강보조식품에만 적용됩니다');
        if (q > 6) r.push(`최대 6병입니다(지금 ${q}병)`);
        if (w > 4) r.push(`총 4\u00A0LB 초과(${w}\u00A0LB)`);
        break;
      default:
        r.push('알 수 없는 이벤트입니다');
    }
    return r;
  }

  /* baseFee: general shipping (USD) for the same parcel, computed by the caller from the rate table */
  function evaluate(id, input, baseFee, today) {
    const e = byId(id);
    if (!e) return { id: null, ok: true, final: baseFee, steps: [['일반 요금', baseFee]], label: '해당사항 없음' };
    const reasons = check(e, input || {});
    if (isEnded(e, today)) reasons.unshift(`${e.end.replace(/-/g, '.')} 종료된 이벤트입니다`);
    const out = { id: e.id, name: e.name, kind: e.kind, label: priceLabel(e), ok: reasons.length === 0, reasons };
    if (!out.ok) { out.final = baseFee; out.steps = [['일반 요금', baseFee]]; out.fallback = true; return out; }
    if (e.kind === 'fixed') { out.final = e.price; out.steps = [['일반 요금', baseFee], [`${e.name} 고정가`, e.price - baseFee]]; }
    else if (e.kind === 'discount') {
      const off = Math.round(baseFee * e.rate * 100) / 100;
      out.final = Math.round((baseFee - off) * 100) / 100;
      out.steps = [['일반 요금', baseFee], [`${e.name} ${Math.round(e.rate * 100)}% 할인`, -off]];
    } else { out.final = null; out.from = e.price; out.steps = [['착한배송 최저가', e.price]]; out.pending = '부피무게 면제 · 최종 금액은 입고 후 실측으로 확정'; }
    return out;
  }

  // All events that apply, cheapest known price first (for "대안" suggestions)
  function candidates(input, baseFee, today) {
    return EVENTS.filter((e) => !isEnded(e, today))
      .map((e) => evaluate(e.id, input, baseFee, today))
      .filter((r) => r.ok)
      .sort((a, b) => (a.final == null ? a.from : a.final) - (b.final == null ? b.from : b.final));
  }

  function active(today) { return EVENTS.filter((e) => !isEnded(e, today)); }

  root.GBSpecials = { EVENTS, TYPES, KIND_LABEL, KIND_ORDER, NO_CONSOLIDATE, NO_INSPECT, NEEDS_TRACKING, fits, byId, priceLabel, check, evaluate, candidates, active, isEnded };
})(typeof window !== 'undefined' ? window : globalThis);
