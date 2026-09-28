"""Refresh the home-page hot deal radar with real Patagonia Worn Wear listings.

Uses the same public Shopify endpoint and request style as the thrift_wear
collector (venv/main/thrift_wear/app/collector.py):
  GET https://wornwear.patagonia.com/collections/{handle}/products.json?limit=&page=1
  - same User-Agent / Accept headers, via `requests` (curl gets a 403 from Shopify)
  - never adds `sort_by` / `filter` (robots.txt forbids them)
  - one request per collection, a pause between them, stop on HTTP 429

It picks a handful of discounted, in-stock items across categories and rewrites
assets/js/deals-data.js. The site only reads that file — nothing is crawled per visit.

    python tools/fetch_wornwear.py            # 8 deals
    python tools/fetch_wornwear.py --count 6
    python tools/sync_partials.py             # then refresh asset hashes
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import pathlib
import re
import sys
import time

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "js" / "deals-data.js"
SITE = "https://wornwear.patagonia.com"
LIST_PATH = "/collections/{handle}/products.json"
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
COLLECTIONS = (("mens", 60), ("packs-and-gear", 30))   # (handle, items to read)
REQUEST_DELAY_SEC = 2.0
DEAL_LIFETIME_DAYS = 3          # one-of-a-kind used items sell fast; stale deals hide themselves
KST = dt.timezone(dt.timedelta(hours=9))

# Category from Shopify tags → (label, 품목 for the application form, estimated shipping weight lb)
CATEGORIES = (
    ("Jackets", "재킷", "의류", 2), ("Vests", "조끼", "의류", 1), ("Fleece", "플리스", "의류", 2),
    ("Sweaters", "스웨터", "의류", 2), ("Pants", "바지", "의류", 2), ("Shorts", "반바지", "의류", 1),
    ("Shirts", "셔츠", "의류", 1), ("T-Shirts", "티셔츠", "의류", 1), ("Tops", "상의", "의류", 1),
)
GEAR = ("가방·장비", "가방·잡화", 3)


def classify(tags: list[str], handle: str) -> tuple[str, str, int]:
    if handle == "packs-and-gear":
        return GEAR
    for tag, label, cat, lb in CATEGORIES:
        if tag in tags:
            return label, cat, lb
    return "의류", "의류", 2


def fetch(session: requests.Session, handle: str, limit: int) -> list[dict]:
    params = {"limit": limit, "page": 1}
    assert "sort_by" not in params and "filter" not in params  # robots
    r = session.get(SITE + LIST_PATH.format(handle=handle), params=params, timeout=25)
    if r.status_code == 429:
        raise SystemExit(f"{handle}: HTTP 429 — Worn Wear asked us to slow down. Try again later.")
    r.raise_for_status()
    return r.json().get("products") or []


def thumb(src: str) -> str:
    return re.sub(r"(\.(?:jpg|jpeg|png|webp))(\?|$)", r"\1?width=480&", src, count=1) if src else ""


def next_update(today: dt.date) -> dt.date:
    # 운영 주기: 매주 월·목
    for d in range(1, 8):
        day = today + dt.timedelta(days=d)
        if day.weekday() in (0, 3):
            return day
    return today + dt.timedelta(days=3)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=8)
    args = ap.parse_args()

    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9"})
    pool: list[dict] = []
    for i, (handle, limit) in enumerate(COLLECTIONS):
        if i:
            time.sleep(REQUEST_DELAY_SEC)
        for p in fetch(s, handle, limit):
            tags = p.get("tags") or []
            label, cat, lb = classify(tags, handle)
            img = thumb(str((p.get("images") or [{}])[0].get("src") or ""))
            for v in p.get("variants") or []:
                try:
                    price, was = float(v.get("price") or 0), float(v.get("compare_at_price") or 0)
                except ValueError:
                    continue
                if not v.get("available") or price <= 0 or was <= price or not img:
                    continue
                size, _, cond = str(v.get("title") or "").rpartition(" / ")
                pool.append({
                    "id": f"ww{v['id']}", "product": p.get("id"), "shop": "Worn Wear", "title": p.get("title", ""),
                    "item": re.sub(r"[^A-Za-z0-9 .,'&()/+#%:-]", "", f"{p.get('title', '')} ({size or cond})").strip(),
                    "label": label, "size": size, "condition": cond,
                    "price": round(price, 2), "was": round(was, 2), "lb": lb, "lbEstimated": True, "cat": cat, "center": "NJ",
                    "url": f"{SITE}/products/{p.get('handle')}?variant={v['id']}", "image": img,
                    "off": round((1 - price / was) * 100),
                })

    # Deepest discounts first, one item per product, rotating across categories for variety
    pool.sort(key=lambda d: (-d["off"], d["price"]))
    picked, seen_products, by_label = [], set(), {}
    for d in pool:
        by_label.setdefault(d["label"], []).append(d)
    while len(picked) < args.count and any(by_label.values()):
        for label in list(by_label):
            queue = by_label[label]
            while queue and queue[0]["product"] in seen_products:
                queue.pop(0)
            if queue and len(picked) < args.count:
                d = queue.pop(0)
                seen_products.add(d["product"])
                picked.append(d)
    if not picked:
        sys.exit("No discounted in-stock items found — deals-data.js left unchanged.")

    now = dt.datetime.now(KST)
    today = now.date()
    expires = (today + dt.timedelta(days=DEAL_LIFETIME_DAYS)).isoformat()
    deals = []
    for d in picked:
        d = {k: v for k, v in d.items() if k not in ("product", "off")}
        d["expires"] = expires
        deals.append(d)
    data = {
        "updated": today.isoformat(), "nextUpdate": next_update(today).isoformat(), "cadence": "매주 월·목 업데이트",
        "affiliate": False, "real": True, "source": "Patagonia Worn Wear", "fetched": now.strftime("%Y-%m-%d %H:%M KST"),
        "deals": deals,
    }
    body = json.dumps(data, ensure_ascii=False, indent=2)
    js = ("/* 핫딜 레이더 — Patagonia Worn Wear 실제 매물 (tools/fetch_wornwear.py 가 생성).\n"
          "   수집: 공개 products.json 을 컬렉션마다 1회만 읽어 할인 중인 재고에서 분류별로 골랐다.\n"
          "   중고 1점씩이라 먼저 팔릴 수 있다. expires 가 지나면 화면에서 자동으로 빠진다.\n"
          "   다시 가져오기: python tools/fetch_wornwear.py && python tools/sync_partials.py */\n"
          f"window.GB_DEALS = {body};\n")
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(js)
    print(f"wrote {len(deals)} deals → {OUT.relative_to(ROOT)} (fetched {data['fetched']})")
    for d in deals:
        print(f"  -{round((1 - d['price'] / d['was']) * 100):>3}%  ${d['price']:>7.2f}  {d['label']:<6} {d['title']} [{d['size']} · {d['condition']}]")


if __name__ == "__main__":
    main()
