// Business-hours states for the top-bar timer (times given in New York local = EDT, UTC-4, in Sept 2026)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { Intl, Date, Math, String, Number, Object };
vm.runInNewContext(readFileSync(new URL('../assets/js/hours.js', import.meta.url), 'utf8'), ctx);
const { status } = ctx.GBHours;
const et = (iso) => new Date(iso + '-04:00'); // EDT

test('open on a weekday counts down to close', () => {
  const s = status('NJ', et('2026-09-29T10:00:00')); // Tue
  assert.equal(s.state, 'open');
  assert.equal(s.remainSec, 7 * 3600);
  assert.equal(s.full, '업무 중 · 마감까지 7시간 0분');
});

test('Delaware closes at 15:00', () => {
  assert.equal(status('DE', et('2026-09-29T14:59:00')).state, 'open');
  assert.equal(status('DE', et('2026-09-29T15:30:00')).state, 'closed');
  assert.equal(status('NJ', et('2026-09-29T15:30:00')).state, 'open');
});

test('waiting window starts 4h before opening', () => {
  const s = status('NJ', et('2026-09-29T06:00:00'));
  assert.equal(s.state, 'waiting');
  assert.equal(s.full, '업무 대기 · 시작까지 3시간 0분');
  assert.equal(status('NJ', et('2026-09-29T04:59:00')).state, 'closed');
});

test('weekday evening is closed with tomorrow reopen and KST time', () => {
  const s = status('NJ', et('2026-09-29T18:00:00'));
  assert.equal(s.state, 'closed');
  assert.equal(s.full, '업무 종료 · 내일 09:00 재개');
  assert.equal(s.reopenKst, '수 22:00'); // Wed 09:00 EDT = Wed 22:00 KST
});

test('Friday after close through Sunday is the weekend', () => {
  assert.equal(status('NJ', et('2026-10-02T17:30:00')).state, 'weekend'); // Fri
  const sat = status('NJ', et('2026-10-03T12:00:00'));
  assert.equal(sat.state, 'weekend');
  assert.equal(sat.full, '주말 휴무 · 월요일 09:00 재개');
  assert.equal(status('NJ', et('2026-10-05T06:00:00')).state, 'waiting'); // Mon early
});

test('US holiday closes the center and pushes reopen', () => {
  const s = status('NJ', et('2026-09-07T11:00:00')); // Labor Day, Monday
  assert.equal(s.state, 'holiday');
  assert.equal(s.holiday, '노동절');
  assert.equal(s.full, '미국 공휴일(노동절) 휴무 · 내일 09:00 재개');
  // Friday evening before a Monday holiday: reopen Tuesday
  const fri = status('NJ', et('2026-09-04T18:00:00'));
  assert.equal(fri.full, '주말 휴무 · 화요일 09:00 재개');
});
