"""Inject partials/header.html and partials/footer.html into every page,
then stamp every local asset URL with a content hash (?v=xxxxxxxx).

Pages keep the shared chrome between marker comments so the output stays
plain static HTML (no build step on Vercel). Run after editing a partial
OR any file under assets/ (otherwise browsers may pair new HTML with an old
cached CSS/JS file):

    python tools/sync_partials.py
"""
import hashlib
import io
import pathlib
import re

ASSET_REF = re.compile(r'((?:href|src)=")((?:assets/[^"?#]+)|favicon\.svg)(?:\?v=[0-9a-f]+)?(")')


def version_assets(src: str) -> str:
    def stamp(m: re.Match) -> str:
        f = ROOT / m.group(2)
        if not f.is_file():
            raise SystemExit(f"missing asset referenced: {m.group(2)}")
        digest = hashlib.sha1(f.read_bytes()).hexdigest()[:8]
        return f"{m.group(1)}{m.group(2)}?v={digest}{m.group(3)}"
    return ASSET_REF.sub(stamp, src)

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ["index.html", "guide.html", "pricing.html", "customs.html", "events.html", "support.html", "apply.html", "mypage.html"]
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
        src = version_assets(src)
        io.open(path, "w", encoding="utf-8", newline="\n").write(src)
        print(f"synced: {page}")


if __name__ == "__main__":
    main()
