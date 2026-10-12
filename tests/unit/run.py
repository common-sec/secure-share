"""Run the unit test suite headlessly in real browsers.

The unit tests are JavaScript modules that run *inside* the browser (tests/unit/index.html),
because the code under test depends on browser APIs: Web Crypto, IndexedDB, Web Locks. Playwright
starts the browsers, opens that page and collects the results.

Normally run in the pinned test container (see docs/TESTING.md):
    docker compose run --rm test-unit          # = python tests/unit/run.py chromium firefox

Options:
    python tests/unit/run.py chromium          # one browser
    python tests/unit/run.py --filter room     # subset (matches file and test name)

Serves the repository on a free loopback port with tools/serve.py's handler, prints every result
and exits non-zero if anything fails.
"""
import argparse
import functools
import http.server
import sys
import threading
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from serve import Handler  # noqa: E402  (same MIME types and headers as the dev server)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Playwright is not installed: run the tests in the test container "
             "(docker compose run --rm test-unit), see docs/TESTING.md")

TIMEOUT_MS = 300_000


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def run_browser(playwright, name, url):
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
    parser.add_argument("browsers", nargs="*", default=["chromium", "firefox"], choices=["chromium", "firefox", "webkit"])
    parser.add_argument("--filter", default="")
    args = parser.parse_args()

    # Windows consoles may not be UTF-8; never crash on the ✓/✗ marks.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    server = serve()
    query = f"?filter={urllib.parse.quote(args.filter)}" if args.filter else ""
    url = f"http://127.0.0.1:{server.server_address[1]}/tests/unit/index.html{query}"
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
