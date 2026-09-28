/* Center business hours (America/New_York), modelled on the Worn Wear store timer:
   open → "마감까지", waiting (4h before open) → "시작까지", closed-night, weekend, US holiday.
   Pure: no DOM. Loaded in the browser as window.GBHours and in tests via vm. */
(function (root) {
  'use strict';

  const TZ = 'America/New_York';
  const CENTERS = {
    NJ: { name: '뉴저지', open: 9 * 60, close: 17 * 60 },
    DE: { name: '델라웨어', open: 9 * 60, close: 15 * 60 },
  };
  const WAIT_WINDOW_MIN = 4 * 60; // countdown to opening starts 4h before, like Worn Wear
  // Observed US federal holidays the centers close on
  const HOLIDAYS = {
    '2026-01-01': '새해', '2026-05-25': '메모리얼 데이', '2026-07-03': '독립기념일 대체', '2026-09-07': '노동절',
    '2026-11-26': '추수감사절', '2026-12-25': '크리스마스',
    '2027-01-01': '새해', '2027-05-31': '메모리얼 데이', '2027-07-05': '독립기념일 대체', '2027-09-06': '노동절',
    '2027-11-25': '추수감사절', '2027-12-24': '크리스마스 대체',
  };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');

  function wall(now) {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(now).forEach((x) => { p[x.type] = x.value; });
    const h = Number(p.hour) % 24;
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h, mi: Number(p.minute), s: Number(p.second) };
  }

  // Calendar day `off` days after the given ET wall date
  function dayInfo(w, off) {
    const dt = new Date(Date.UTC(w.y, w.m - 1, w.d + off));
    const key = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    const dow = dt.getUTCDay();
    return { key, dow, holiday: HOLIDAYS[key] || null, work: dow !== 0 && dow !== 6 && !HOLIDAYS[key] };
  }

  function remain(sec) {
    sec = Math.max(0, Math.round(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return { full: `${d}일 ${h}시간`, short: `${d}d ${h}h` };
    if (h > 0) return { full: `${h}시간 ${m}분`, short: `${h}h ${pad(m)}m` };
    return { full: `${m}분 ${s}초`, short: `${m}m ${pad(s)}s` };
  }

  function kstLabel(date) {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    const map = { Sun: '일', Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토' };
    return `${map[p.weekday]} ${pad(Number(p.hour) % 24)}:${p.minute}`;
  }

  function status(code, now) {
    now = now || new Date();
    const c = CENTERS[code] || CENTERS.NJ;
    const w = wall(now);
    const secs = w.h * 3600 + w.mi * 60 + w.s;
    const openS = c.open * 60, closeS = c.close * 60;
    const today = dayInfo(w, 0);

    let off = 0;
    while (off < 21 && !(dayInfo(w, off).work && (off > 0 || secs < openS))) off++;
    const next = dayInfo(w, off);
    const toOpen = off * 86400 + openS - secs;
    const reopenAt = new Date(now.getTime() + toOpen * 1000);
    const hours = `${pad(c.open / 60)}:00–${pad(c.close / 60)}:00`;
    const clock = `${pad(w.h)}:${pad(w.mi)}`;
    const reopenLocal = `${off === 0 ? '오늘' : off === 1 ? '내일' : DOW[next.dow] + '요일'} ${pad(c.open / 60)}:00`;
    const base = { code, name: c.name, clock, date: `${pad(w.m)}.${pad(w.d)}`, dow: DOW[today.dow], hours, reopenKst: kstLabel(reopenAt) };

    if (today.work && secs >= openS && secs < closeS) {
      const r = remain(closeS - secs);
      return { ...base, state: 'open', remainSec: closeS - secs, full: `업무 중 · 마감까지 ${r.full}`, short: `업무 중 ${r.short}` };
    }
    const r = remain(toOpen);
    if (toOpen <= WAIT_WINDOW_MIN * 60) {
      return { ...base, state: 'waiting', remainSec: toOpen, full: `업무 대기 · 시작까지 ${r.full}`, short: `대기 ${r.short}` };
    }
    // Long gap: weekend or holiday. Same-day evening / early morning: closed for the night.
    const gapDay = today.work ? dayInfo(w, 1) : today;
    const offDay = !today.work || (secs >= closeS && off >= 2);
    if (offDay) {
      const hol = today.holiday || (!gapDay.work && gapDay.holiday) || null;
      if (hol) {
        return { ...base, state: 'holiday', holiday: hol, remainSec: toOpen, full: `미국 공휴일(${hol}) 휴무 · ${reopenLocal} 재개`, short: '공휴일 휴무' };
      }
      return { ...base, state: 'weekend', remainSec: toOpen, full: `주말 휴무 · ${reopenLocal} 재개`, short: '주말 휴무' };
    }
    return { ...base, state: 'closed', remainSec: toOpen, full: `업무 종료 · ${reopenLocal} 재개`, short: `종료 · ${pad(c.open / 60)}:00` };
  }

  root.GBHours = { status, remain, CENTERS, HOLIDAYS, WAIT_WINDOW_MIN };
})(typeof window !== 'undefined' ? window : globalThis);
