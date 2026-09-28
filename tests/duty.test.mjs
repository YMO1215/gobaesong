import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { Math, Number, Object };
vm.runInNewContext(readFileSync(new URL('../assets/js/duty.js', import.meta.url), 'utf8'), ctx);
const { estimate } = ctx.GBDuty;

test('US express list clearance: $200 and under is duty-free, freight excluded from the judgement', () => {
  const r = estimate({ cat: 'clothing', price: 200, local: 0, ship: 30, fx: 1400 });
  assert.equal(r.taxed, false);
  assert.equal(r.limit, 200);
  assert.equal(r.tax, 0);
  assert.equal(r.totalKrw, 322000);
});

test('one dollar over: the whole value incl. freight is taxed', () => {
  const r = estimate({ cat: 'clothing', price: 201, local: 0, ship: 19, fx: 1000 });
  assert.equal(r.taxed, true);
  assert.equal(r.customsValue, 220000);
  assert.equal(r.duty, 28600);            // 13%
  assert.equal(r.vat, 24860);             // (220000 + 28600) × 10%
  assert.equal(r.tax, 53460);
});

test('US sales tax and domestic shipping count toward the limit', () => {
  assert.equal(estimate({ cat: 'shoes', price: 190, local: 15, ship: 20, fx: 1390 }).taxed, true);
});

test('supplements/food and mail use the $150 limit', () => {
  assert.equal(estimate({ cat: 'supplement', price: 160, ship: 10, fx: 1390 }).limit, 150);
  assert.equal(estimate({ cat: 'supplement', price: 160, ship: 10, fx: 1390 }).taxed, true);
  assert.equal(estimate({ cat: 'clothing', price: 160, ship: 10, fx: 1390, post: true }).taxed, true);
  assert.equal(estimate({ cat: 'clothing', price: 160, ship: 10, fx: 1390 }).taxed, false);
});

test('FTA origin zeroes duty but VAT remains; ITA electronics have no duty', () => {
  const fta = estimate({ cat: 'clothing', price: 300, ship: 0, fx: 1000, fta: true });
  assert.equal(fta.duty, 0);
  assert.equal(fta.vat, 30000);
  const e = estimate({ cat: 'electronics', price: 280, ship: 20, fx: 1000 });
  assert.equal(e.duty, 0);
  assert.equal(e.vat, 30000);
});
