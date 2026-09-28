"""Inject partials/header.html and partials/footer.html into every page.

Pages keep the shared chrome between marker comments so the output stays
plain static HTML (no build step on Vercel). Run after editing a partial:

    python tools/sync_partials.py
"""
import io
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "apply.html", "mypage.html", "pricing.html", "support.html"]
BLOCKS = {
    "HEADER": ROOT / "partials" / "header.html",
    "FOOTER": ROOT / "partials" / "footer.html",
}


def render(block: str, page: str) -> str:
    html = io.open(BLOCKS[block], encoding="utf-8").read().rstrip("\n")
    if block == "HEADER":
        # Mark the current page in the main nav
        html = html.replace(f'<li><a href="{page}">', f'<li><a href="{page}" aria-current="page">')
    return html


def main() -> None:
    for page in PAGES:
        path = ROOT / page
        if not path.exists():
            print(f"skip (missing): {page}")
            continue
        src = io.open(path, encoding="utf-8").read()
        for block in BLOCKS:
            pattern = re.compile(rf"(<!-- {block}:START -->).*?(<!-- {block}:END -->)", re.S)
            if not pattern.search(src):
                raise SystemExit(f"{page}: {block} markers not found")
            src = pattern.sub(lambda m: m.group(1) + "\n" + render(block, page) + "\n" + m.group(2), src)
        io.open(path, "w", encoding="utf-8", newline="\n").write(src)
        print(f"synced: {page}")


if __name__ == "__main__":
    main()
