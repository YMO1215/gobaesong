/* Import duty / VAT estimate for US-origin personal purchases (reference only).
   - US express, list-clearance items: duty-free if goods value <= $200
   - Mail, or items excluded from list clearance (supplements, food, …): $150
   - Judged value = goods + US sales tax + US domestic shipping (international freight excluded)
   - Over the limit: whole value taxed. Customs value = (goods + local + international freight) × FX
     duty = customs value × rate, VAT = (customs value + duty) × 10%
   Pure: loaded as window.GBDuty in the browser and via vm in tests. */
(function (root) {
  'use strict';
  const CATS = {
    clothing: { label: '의류', rate: 0.13 },
    shoes: { label: '신발', rate: 0.13 },
    bag: { label: '가방·잡화', rate: 0.08 },
    cosmetic: { label: '화장품', rate: 0.065 },
    electronics: { label: '전자기기', rate: 0 },
    toy: { label: '완구·유아', rate: 0.08 },
    supplement: { label: '건강기능식품', rate: 0.08, excluded: true },
    food: { label: '식품', rate: 0.08, excluded: true },
  };
  const LIMIT_US_EXPRESS = 200;
  const LIMIT_OTHER = 150;
  const VAT = 0.1;

  function estimate(q) {
    const cat = CATS[q.cat] || CATS.clothing;
    const n = (v) => Math.max(0, Number(v) || 0);
    const price = n(q.price), local = n(q.local), ship = n(q.ship), fx = n(q.fx) || 1390;
    const limit = q.post || cat.excluded ? LIMIT_OTHER : LIMIT_US_EXPRESS;
    const judged = Math.round((price + local) * 100) / 100;
    const goodsKrw = Math.floor((price + local + ship) * fx);
    const base = { cat: cat.label, limit, judged, excluded: !!cat.excluded, goodsKrw };
    if (judged <= limit) return { ...base, taxed: false, customsValue: 0, duty: 0, vat: 0, tax: 0, totalKrw: goodsKrw };
    const customsValue = goodsKrw;
    const rate = q.fta ? 0 : cat.rate;
    const duty = Math.floor(customsValue * rate);
    const vat = Math.floor((customsValue + duty) * VAT);
    return { ...base, taxed: true, rate, customsValue, duty, vat, tax: duty + vat, totalKrw: goodsKrw + duty + vat };
  }

  root.GBDuty = { estimate, CATS, LIMIT_US_EXPRESS, LIMIT_OTHER };
})(typeof window !== 'undefined' ? window : globalThis);
