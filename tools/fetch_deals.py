"""Refresh the home-page hot deal radar with real discounted items from US Shopify stores.

Same approach as the gateway apps' Shopify collectors
(thrift_wear/app/collector.py, shop_watch/app/collectors/shopify.py):
  GET {site}/collections/{handle}/products.json?limit=&page=1
  - `requests` with a browser User-Agent (curl gets 403 from some stores)
  - NO `Accept-Language` header: Shopify Markets stores answer in the visitor's local
    currency when they see it (shop_watch note, 2026-08-30)
  - never adds `sort_by` / `filter` / `+` tags (robots.txt), stop on HTTP 429
  - one collection request per store + one product page to read the ACTIVE currency
    (`Shopify.currency.active`) — e.g. TRÈS BIEN answers in SEK from Korea although its
    store currency is EUR; prices are converted to USD with ECB rates (frankfurter.app)

Writes assets/js/deals-data.js; the site only reads that file (nothing is crawled per visit).

    python tools/fetch_deals.py
    python tools/sync_partials.py
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
import unicodedata

import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "js" / "deals-data.js"
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
REQUEST_DELAY_SEC = 1.5
KST = dt.timezone(dt.timedelta(hours=9))

# key, name, site, [(collection handle, items to read)], deals to take, used?, where it ships from
STORES = (
    # US stores only — Gobaesong forwards from New Jersey/Delaware, so EU shops (CULTIZM, TRÈS BIEN)
    # would ship twice (EU → US → KR). They were removed on the owner's request (2026-09-29).
    ("wornwear", "Worn Wear", "https://wornwear.patagonia.com", (("mens", 60), ("packs-and-gear", 30)), 3, True, "US"),
    ("cncpts", "CNCPTS", "https://cncpts.com", (("apparel-sale", 60),), 3, False, "US"),
    # ONENESS: kept, but its public JSON has no compare_at_price (discounts are applied at checkout),
    # so it yields no verifiable sale price and is skipped automatically — we never guess a discount.
    ("oneness", "ONENESS", "https://www.onenessboutique.com", (("mens-sale", 60),), 3, False, "US"),
    ("totem", "Totem Brand Co.", "https://totembrandco.com", (("sale", 60),), 3, False, "US"),
)
REQUIRED_CURRENCY = "USD"   # a US store answering in another currency is skipped, never converted
# Things that can't fly (lithium e-boards etc.) or aren't parcels
BLOCK = re.compile(r"onewheel|e-?board|electric skate|battery|lithium|power ?bank|knife|aerosol|gift ?card|sample", re.I)

# keyword → (label, 품목 for the application form, estimated shipping lb)
KINDS = (
    (r"boot", "부츠", "신발", 5), (r"sneaker|shoe|runner|trainer|clog|loafer|sandal|slide|mule", "신발", "신발", 4),
    (r"jacket|coat|parka|anorak|shell|puffer|down\b", "재킷", "의류", 3), (r"fleece|hood|hoodie|sweat|crew|knit|sweater|cardigan", "상의", "의류", 2),
    (r"vest|gilet", "조끼", "의류", 1), (r"jean|pant|trouser|chino|cargo", "바지", "의류", 2), (r"short", "반바지", "의류", 1),
    (r"shirt|tee|t-shirt|polo|top|tank", "셔츠", "의류", 1), (r"bag|backpack|pack|duffel|tote|shopper|wallet|pouch", "가방", "가방·잡화", 2),
    (r"cap|hat|beanie|sock|belt|glove|scarf|eyewear|sunglass|glasses", "잡화", "가방·잡화", 1),
)


def kind(text: str, handle: str) -> tuple[str, str, int]:
    if handle == "packs-and-gear":
        return "가방·장비", "가방·잡화", 3
    for rx, label, cat, lb in KINDS:
        if re.search(rx, text, re.I):
            return label, cat, lb
    return "의류", "의류", 2


def get_json(s: requests.Session, url: str, **params):
    assert not {"sort_by", "filter"} & set(params)  # robots
    r = s.get(url, params=params, headers={"Accept": "application/json"}, timeout=25)
    if r.status_code == 429:
        raise RuntimeError("HTTP 429 — store asked us to slow down")
    r.raise_for_status()
    return r.json()


def active_currency(s: requests.Session, site: str, handle: str) -> str:
    html = s.get(f"{site}/products/{handle}", timeout=25).text
    m = re.search(r'Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"', html)
    return m.group(1) if m else "USD"


def usd_rates(codes: set[str]) -> dict[str, float]:
    rates = {"USD": 1.0}
    need = sorted(codes - {"USD"})
    if need:
        r = requests.get("https://api.frankfurter.app/latest", params={"from": "USD", "to": ",".join(need)}, timeout=20)
        r.raise_for_status()
        for code, per_usd in r.json()["rates"].items():
            rates[code] = 1 / per_usd   # 1 unit of `code` in USD
    return rates


def ascii_item(text: str) -> str:
    """Product name the application form accepts (English letters/digits/basic marks): È→E, '|'→' '."""
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    t = re.sub(r"[^A-Za-z0-9 .,'&()/+#%:-]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def thumb(src: str) -> str:
    return re.sub(r"(\.(?:jpg|jpeg|png|webp))(\?|$)", r"\1?width=480&", src, count=1) if src else ""


def next_update(today: dt.date) -> dt.date:
    for d in range(1, 8):
        day = today + dt.timedelta(days=d)
        if day.weekday() in (0, 3):   # 매주 월·목
            return day
    return today + dt.timedelta(days=3)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=12)
    args = ap.parse_args()
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})   # no Accept-Language on purpose

    raw: list[dict] = []
    currencies: set[str] = set()
    report = []
    for key, name, site, collections, take, used, origin in STORES:
        pool = []
        try:
            first_handle = None
            for handle, limit in collections:
                products = get_json(s, f"{site}/collections/{handle}/products.json", limit=limit, page=1).get("products") or []
                time.sleep(REQUEST_DELAY_SEC)
                for p in products:
                    first_handle = first_handle or p.get("handle")
                    text = " ".join([p.get("title", ""), p.get("product_type", ""), " ".join(p.get("tags") or [])])
                    if BLOCK.search(text):
                        continue
                    label, cat, lb = kind(f"{p.get('product_type', '')} {p.get('title', '')}", handle)
                    img = thumb(str((p.get("images") or [{}])[0].get("src") or ""))
                    for v in p.get("variants") or []:
                        try:
                            price, was = float(v.get("price") or 0), float(v.get("compare_at_price") or 0)
                        except ValueError:
                            continue
                        if not v.get("available") or price <= 0 or was <= price or not img:
                            continue
                        vt = str(v.get("title") or "")
                        size, _, cond = vt.rpartition(" / ") if used else (vt if vt != "Default Title" else "", "", "")
                        pool.append({"store": key, "shop": name, "product": p.get("id"), "title": p.get("title", ""),
                                     "vendor": p.get("vendor", ""), "label": label, "cat": cat, "lb": lb,
                                     "size": size, "condition": cond, "used": used, "origin": origin,
                                     "p": price, "w": was, "off": round((1 - price / was) * 100),
                                     "url": f"{site}/products/{p.get('handle')}?variant={v['id']}", "image": img,
                                     "id": f"{key}-{v['id']}"})
            cur = active_currency(s, site, first_handle) if first_handle else "USD"
            time.sleep(REQUEST_DELAY_SEC)
        except Exception as exc:  # one store failing must not sink the others
            report.append(f"  ! {name}: {exc}")
            continue
        if cur != REQUIRED_CURRENCY:
            report.append(f"  ! {name}: answers in {cur}, not {REQUIRED_CURRENCY} — skipped")
            continue
        currencies.add(cur)
        pool.sort(key=lambda d: (-d["off"], d["p"]))
        picked, seen = [], set()
        for d in pool:                                   # best discount, one per product, vary the kind
            if d["product"] in seen or any(x["label"] == d["label"] for x in picked) and len(pool) > take * 3:
                continue
            seen.add(d["product"]); d["currency"] = cur; picked.append(d)
            if len(picked) == take:
                break
        raw += picked
        report.append(f"  {name}: currency {cur}, discounted in stock {len(pool)}, picked {len(picked)}")

    if not raw:
        sys.exit("No deals found — deals-data.js left unchanged.")
    rates = usd_rates(currencies)
    now = dt.datetime.now(KST)
    today = now.date()
    nxt = next_update(today)
    deals = []
    for d in raw[: args.max]:
        fx = rates[d["currency"]]
        item = ascii_item(d["title"] + (f" ({d['size']})" if d["size"] else ""))
        deals.append({
            "id": d["id"], "shop": d["shop"], "title": d["title"], "item": item, "label": d["label"], "cat": d["cat"],
            "size": d["size"], "condition": d["condition"], "used": d["used"], "origin": d["origin"],
            "price": round(d["p"] * fx, 2), "was": round(d["w"] * fx, 2),
            **({"currency": d["currency"], "priceLocal": d["p"], "wasLocal": d["w"]} if d["currency"] != "USD" else {}),
            "lb": d["lb"], "lbEstimated": True, "center": "NJ", "url": d["url"], "image": d["image"],
            "expires": (nxt + dt.timedelta(days=1)).isoformat() if not d["used"] else (today + dt.timedelta(days=3)).isoformat(),
        })
    data = {
        "updated": today.isoformat(), "nextUpdate": nxt.isoformat(), "cadence": "매주 월·목 업데이트",
        "affiliate": False, "real": True, "source": "Shopify 쇼핑몰 %d곳" % len({d["shop"] for d in deals}),
        "shops": sorted({d["shop"] for d in deals}), "fetched": now.strftime("%Y-%m-%d %H:%M KST"),
        "fx": {k: round(v, 5) for k, v in rates.items() if k != "USD"}, "deals": deals,
    }
    js = ("/* 핫딜 레이더 — Shopify 쇼핑몰 실제 할인 매물 (tools/fetch_deals.py 가 생성).\n"
          "   가게마다 세일 컬렉션을 1회 읽고, 적용 통화(Shopify.currency.active)를 확인해 USD 로 환산했다.\n"
          "   expires 가 지나면 화면에서 자동으로 빠진다. 다시: python tools/fetch_deals.py && python tools/sync_partials.py */\n"
          f"window.GB_DEALS = {json.dumps(data, ensure_ascii=False, indent=2)};\n")
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(js)
    print("\n".join(report))
    print(f"wrote {len(deals)} deals (fx {data['fx']}) → {OUT.relative_to(ROOT)}")
    for d in deals:
        loc = f" ({d['currency']} {d['priceLocal']:.2f})" if "currency" in d else ""
        print(f"  -{round((1 - d['price'] / d['was']) * 100):>3}%  ${d['price']:>7.2f}{loc}  {d['shop']:<16} {d['label']:<4} {d['title'][:48]}")


if __name__ == "__main__":
    main()
