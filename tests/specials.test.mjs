import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { Math, Number, String, Object, Array };
vm.runInNewContext(readFileSync(new URL('../assets/js/specials.js', import.meta.url), 'utf8'), ctx);
const S = ctx.GBSpecials;
const TODAY = '2026-09-28';

test('11 events: 7 fixed, 3 discount, 1 from', () => {
  assert.equal(S.EVENTS.length, 11);
  const kinds = S.EVENTS.reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] || 0) + 1 }), {});
  assert.deepEqual({ ...kinds }, { fixed: 7, discount: 3, from: 1 });
  assert.ok(S.EVENTS.every((e) => !/테블릿/.test(JSON.stringify(e))), 'spelling is 태블릿');
});

test('no event selected = general rate', () => {
  const r = S.evaluate('', { type: 'general' }, 18.1, TODAY);
  assert.equal(r.final, 18.1);
});

test('fixed price applies when conditions hold', () => {
  const r = S.evaluate('shoe1', { type: 'shoes', qty: 1, trackings: 1, weight: 3 }, 13.5, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.final, 9.4);
});

test('discounts are taken off the general rate', () => {
  assert.equal(S.evaluate('clothing', { type: 'clothing', qty: 3 }, 20, TODAY).final, 16);
  assert.equal(S.evaluate('consolidate', { type: 'general', trackings: 2 }, 20, TODAY).final, 18);
  assert.equal(S.evaluate('shoes2', { type: 'boots', qty: 2 }, 25, TODAY).final, 20);
});

test('failing conditions fall back to the general rate with reasons', () => {
  const r = S.evaluate('vacuum', { type: 'vacuum_lgsamsung', weight: 19, trackings: 1 }, 50, TODAY);
  assert.equal(r.ok, false);
  assert.equal(r.final, 50);
  assert.match(r.reasons.join(), /18lb 초과/);
  assert.equal(S.evaluate('clothing', { type: 'hat_bag' }, 20, TODAY).ok, false);
  assert.equal(S.evaluate('shoe1', { type: 'boots', qty: 1, trackings: 1 }, 20, TODAY).ok, false);
  assert.equal(S.evaluate('vitamin', { type: 'supplement', qty: 7, weight: 3 }, 20, TODAY).ok, false);
  assert.equal(S.evaluate('vitamin', { type: 'supplement_powder', qty: 2, weight: 3 }, 20, TODAY).ok, false);
});

test('conflicts: goodship with 2+ trackings, vacuum with consolidation, tracking-required events', () => {
  assert.match(S.evaluate('goodship', { type: 'general', trackings: 2 }, 10, TODAY).reasons.join(), /합배송 스페셜/);
  assert.match(S.evaluate('vacuum', { type: 'vacuum_lgsamsung', weight: 10, trackings: 1, consolidate: true }, 50, TODAY).reasons.join(), /합배송/);
  assert.match(S.evaluate('watch', { type: 'watch', qty: 1, weight: 1, trackings: 0 }, 9, TODAY).reasons.join(), /트래킹/);
});

test('"from" price is never estimated', () => {
  const r = S.evaluate('goodship', { type: 'general', trackings: 1 }, 10, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.final, null);
  assert.equal(r.from, 6.8);
});

test('health box ends 2026-12-31 and needs the 18-size box', () => {
  assert.equal(S.evaluate('health_box', { type: 'supplement', box18: true }, 20, TODAY).final, 5.99);
  assert.equal(S.evaluate('health_box', { type: 'supplement', box18: false }, 20, TODAY).ok, false);
  assert.equal(S.evaluate('health_box', { type: 'supplement', box18: true }, 20, '2027-01-01').ok, false);
  assert.equal(S.active('2027-01-01').some((e) => e.id === 'health_box'), false);
});

test('candidates lists applicable events cheapest first', () => {
  const c = S.candidates({ type: 'supplement', qty: 2, weight: 2, box18: true, trackings: 1 }, 15, TODAY);
  assert.equal(c[0].id, 'health_box');
  assert.ok(c.some((x) => x.id === 'vitamin'));
});
