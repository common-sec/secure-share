"""Run the browser test suite headlessly, on a developer machine or in CI.

Setup (once):
    python -m pip install -r tests/requirements.txt
    python -m playwright install chromium firefox

Run:
    python tests/run_headless.py                 # Chromium and Firefox
    python tests/run_headless.py chromium        # one browser
    python tests/run_headless.py msedge          # an installed browser (msedge, chrome) instead of
                                                 # Playwright's bundled builds: no browser download needed
    python tests/run_headless.py --filter room   # subset (matches file and test name)

Serves the repository on a free local port with tools/serve.py's handler, opens /tests/ in each
browser, prints every result and exits non-zero if anything fails.
"""
import argparse
import functools
import http.server
import sys
import threading
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from serve import Handler  # noqa: E402  (same MIME types and headers as the dev server)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Playwright is not installed. Run:\n"
             "  python -m pip install -r tests/requirements.txt\n"
             "  python -m playwright install chromium firefox")

TIMEOUT_MS = 300_000


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# Installed, branded browsers driven through Playwright's Chromium engine.
CHANNELS = {"msedge": "msedge", "chrome": "chrome"}


def run_browser(playwright, name, url):
    if name in CHANNELS:
        browser = playwright.chromium.launch(channel=CHANNELS[name])
    else:
        browser = getattr(playwright, name).launch()
    try:
        page = browser.new_page()
        page.on("pageerror", lambda e: print(f"  [{name}] page error: {e}"))
        page.goto(url)
        # The runner marks #summary with .pass/.fail when done. (wait_for_function would need
        # 'unsafe-eval', which the test page's CSP rightly forbids.)
        page.wait_for_selector("#summary.pass, #summary.fail", timeout=TIMEOUT_MS)
        results = page.evaluate("() => window.__TEST_RESULTS__")
    finally:
        browser.close()

    for r in results["results"]:
        mark = "✓" if r["ok"] else "✗"
        print(f"  {mark} [{name}] {r['file']} › {r['name']} ({r['ms']} ms)")
        if not r["ok"]:
            print("\n".join("      " + line for line in r["error"].splitlines()))
    print(f"[{name}] {results['passed']} passed, {results['failed']} failed\n")
    return results["failed"] == 0 and results["passed"] > 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("browsers", nargs="*", default=["chromium", "firefox"], choices=["chromium", "firefox", "webkit", *CHANNELS])
    parser.add_argument("--filter", default="")
    args = parser.parse_args()

    # Windows consoles may not be UTF-8; never crash on the ✓/✗ marks.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    server = serve()
    query = f"?filter={urllib.parse.quote(args.filter)}" if args.filter else ""
    url = f"http://127.0.0.1:{server.server_address[1]}/tests/index.html{query}"
    ok = True
    try:
        with sync_playwright() as p:
            for name in args.browsers:
                ok = run_browser(p, name, url) and ok
    finally:
        server.shutdown()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
