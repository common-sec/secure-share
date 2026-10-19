"""End-to-end tests: real users' flows through the real UI, in real browsers, over real WebRTC.

Each person (sender, recipient, host, guests) is a separate, isolated browser context. Playwright
clicks and types through the app exactly as a user would. Peers connect with WebRTC, using
Trystero and a Nostr relay for discovery, as on the live site.

    docker compose run --rm test-e2e            # local relay, host-only ICE (default, CI)
    docker compose run --rm test-e2e-public     # online: the real public relays and STUN servers

    python tests/e2e/run.py [--public] [--filter text] [--browsers chromium,firefox]

Default mode serves the app and a minimal Nostr relay from one local server (tests/e2e/server.py)
and points the app at it through test-only hooks injected before the page loads; ICE uses host
candidates only, so no STUN server or public relay is involved. Every request the browsers make
to anything but the local server (HTTP or WebSocket) is blocked and fails the scenario: the built
app must work without any third-party origin. Public mode injects nothing: the app behaves
exactly as on the live site. Both test the built app (dist/), so run the `build` service first.
"""
import argparse
import json
import os
import re
import sys
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from server import serve  # noqa: E402

try:
    from playwright.sync_api import expect, sync_playwright
    from axe_playwright_python.sync_playwright import Axe
except ImportError:
    sys.exit("Run the end-to-end tests in the test container: docker compose run --rm test-e2e")

TIMEOUT = 45_000          # ms: WebRTC setup through a relay can take a few seconds
QUIET_WAIT = 8            # s: how long "nothing should happen" is observed
# Offline mode: let WebRTC use the container's own addresses (no mDNS names, loopback allowed).
CHROMIUM_ARGS = ["--disable-features=WebRtcHideLocalIpsWithMdns", "--allow-loopback-in-peer-connection"]
FIREFOX_PREFS = {"media.peerconnection.ice.obfuscate_host_addresses": False,
                 "media.peerconnection.ice.loopback": True}
AXE_BASELINE = json.loads((HERE / "axe-baseline.json").read_text(encoding="utf-8"))

expect.set_options(timeout=TIMEOUT)


# ---------------------------------------------------------------- environment
class Env:
    def __init__(self, playwright, base, public):
        self.pw, self.base, self.public = playwright, base, public
        self.app = base + "/dist/"     # the built app, exactly as deployed
        self.browsers, self.contexts = {}, []
        self.blocked = []    # third-party requests the app attempted (local mode)
        relay = base.replace("http://", "ws://") + "/relay"
        self.init_script = None if public else (
            f"window.__USS_TEST_RELAYS__ = {json.dumps([relay])}; window.__USS_TEST_ICE_SERVERS__ = [];")

    def browser(self, name):
        if name not in self.browsers:
            if name == "firefox":
                self.browsers[name] = self.pw.firefox.launch(firefox_user_prefs=None if self.public else FIREFOX_PREFS)
            else:
                self.browsers[name] = self.pw.chromium.launch(args=[] if self.public else CHROMIUM_ARGS)
        return self.browsers[name]

    def person(self, browser="chromium"):
        """A new person: an isolated browser context (own storage, own WebRTC identity)."""
        ctx = self.browser(browser).new_context(accept_downloads=True)
        if self.init_script:
            # Guards first: WebSocket routing patches the page, and must be in place before any script.
            ctx.route(lambda url: not self.local(url), self.block_http)
            ctx.route_web_socket(lambda url: not self.local(url), self.block_ws)
            ctx.add_init_script(self.init_script)
        self.contexts.append(ctx)
        page = ctx.new_page()
        page.on("pageerror", lambda e: print(f"      [{browser}] page error: {e}"))
        page.on("console", lambda m: m.type == "error" and print(f"      [{browser}] console: {m.text}"))
        return page

    def local(self, url):
        return url.startswith((self.base + "/", self.base.replace("http://", "ws://") + "/"))

    # Third-party requests are refused and remembered; the scenario then fails.
    def block_http(self, route):
        self.blocked.append(route.request.url)
        route.abort()

    def block_ws(self, ws):
        # Never connected to the real server, so nothing leaves the browser. (Calling ws.close()
        # from this handler deadlocks Playwright's sync API.)
        self.blocked.append(ws.url)

    def close_people(self):
        for ctx in self.contexts:
            ctx.close()
        self.contexts = []

    def close(self):
        self.close_people()
        for b in self.browsers.values():
            b.close()


# ---------------------------------------------------------------- helpers: Secure Share
def file_payload(name, size):
    data = bytes((i * 7 + 3) % 256 for i in range(size))
    return {"name": name, "mimeType": "application/octet-stream", "buffer": data}


def share_send(env, page, text, files=(), approve=False):
    page.goto(env.app + "#/share")
    page.locator("form textarea").fill(text)
    if files:
        page.locator("form input[type=file]").set_input_files(list(files))
    passphrase = page.locator("form input[aria-label=Passphrase]").input_value()
    if approve:
        page.get_by_text("Let me check who’s receiving before sending").click()
    page.get_by_role("button", name="Create one-time link").click()
    link = page.locator('input[aria-label="One-time link"]')
    expect(link).to_be_attached()
    return link.input_value(), passphrase


def share_open(page, link, passphrase):
    page.goto(link)
    page.locator("form input[aria-label=Passphrase]").fill(passphrase)
    page.get_by_role("button", name="Receive").click()


def received_text(page):
    """The received text is masked until the recipient clicks Show."""
    expect(page.locator("pre.secret")).to_be_hidden()
    page.locator(".result").get_by_role("button", name="Show").click()
    return page.locator("pre.secret").inner_text()


def download(page, scope, name):
    with page.expect_download() as info:
        page.locator(scope, has_text=name).get_by_role("link", name="Download").click()
    return Path(info.value.path()).read_bytes()


# ---------------------------------------------------------------- helpers: Secure Chat
def chat_create(env, page, nick):
    page.goto(env.app + "#/chat")
    page.get_by_placeholder("e.g. Alice").fill(nick)
    passphrase = page.locator("form input[aria-label=Passphrase]").input_value()
    page.get_by_role("button", name="Create chat room").click()
    link = page.locator(".panel input[aria-label=Link]")
    expect(link).to_be_attached()
    return link.input_value(), passphrase


def chat_join(page, link, nick, passphrase):
    page.goto(link)
    page.get_by_placeholder("e.g. Alice").fill(nick)
    page.locator("form input[aria-label=Passphrase]").fill(passphrase)
    page.get_by_role("button", name="Join chat").click()


def approve(host, nick):
    request = host.locator(".request", has_text=nick)
    expect(request).to_be_visible()
    request.get_by_role("button", name="Accept").click()


def admitted(guest):
    expect(guest.get_by_text("Messages are end-to-end encrypted")).to_be_visible()


def say(page, text):
    box = page.locator(".composer textarea")
    box.fill(text)
    box.press("Enter")


def sees(page, text):
    expect(page.locator(".messages").get_by_text(text)).to_be_visible()


def stays_quiet(check):
    """Observes for QUIET_WAIT seconds that `check()` stays false."""
    deadline = time.time() + QUIET_WAIT
    while time.time() < deadline:
        assert not check(), "something happened that shouldn't have"
        time.sleep(0.5)


# ---------------------------------------------------------------- accessibility
_axe = Axe()
RECORD = os.environ.get("E2E_AXE_RECORD") == "1"   # write axe-baseline.json instead of asserting
_recorded = {}


def audit(page, state):
    """axe-core on the current page. Known issues are listed in axe-baseline.json (to be fixed in
    docs/TODO.md, accessibility A1-A4); anything else fails the test."""
    violations = _axe.run(page).response["violations"]
    found = {v["id"]: v for v in violations}
    if RECORD:
        _recorded[state] = sorted(set(_recorded.get(state, [])) | set(found))
        return sorted(found)
    known = set(AXE_BASELINE.get(state, []))
    new = sorted(set(found) - known)
    assert not new, f"new accessibility violations on '{state}': " + "; ".join(
        f"{rid} ({found[rid]['impact']}): {found[rid]['help']}" for rid in new)
    return sorted(found)


# ---------------------------------------------------------------- scenarios
TESTS = []


def scenario(name, browsers=("chromium",)):
    def register(fn):
        for b in browsers:
            TESTS.append((f"{name} [{b}]", fn, b))
        return fn
    return register


@scenario("share: text and a file are delivered once, then the link is dead", browsers=("chromium", "firefox"))
def share_happy_path(env, b):
    sender, recipient = env.person(b), env.person(b)
    secret_file = file_payload("keys.bin", 300_000)
    sender.goto(env.app + "#/share")
    audit(sender, "share-form")
    link, passphrase = share_send(env, sender, "db-password: Karrot~Over~Stone42", [secret_file])
    audit(sender, "share-waiting")

    expect(sender.locator(".page-head .lead").first).to_be_hidden()   # the intro is hidden while waiting
    expect(sender.get_by_role("status")).to_contain_text("Waiting for the recipient")

    share_open(recipient, link, passphrase)
    expect(recipient).to_have_title(re.compile("received a secure delivery"))
    expect(recipient.get_by_text("Received ✓")).to_be_visible()
    assert received_text(recipient) == "db-password: Karrot~Over~Stone42"
    assert download(recipient, ".file-card", "keys.bin") == secret_file["buffer"]
    expect(sender.get_by_text("Delivered ✓")).to_be_visible()
    expect(sender).to_have_title(re.compile("^✓ Delivered"))
    audit(recipient, "share-received")
    recipient.get_by_role("button", name="Clear from screen").click()
    expect(recipient.locator("pre.secret")).to_have_count(0)

    late = env.person(b)
    share_open(late, link, passphrase)
    stays_quiet(lambda: late.get_by_text("Received ✓").is_visible())
    expect(late.get_by_text("Looking for the sender")).to_be_visible()


@scenario("share: a wrong passphrase is refused and the sender is told")
def share_wrong_passphrase(env, b):
    sender, recipient = env.person(b), env.person(b)
    link, _ = share_send(env, sender, "secret")
    share_open(recipient, link, "not-the-passphrase")
    expect(recipient.get_by_text("Wrong passphrase.")).to_be_visible()
    expect(sender.get_by_text("Someone entered a wrong passphrase (1)")).to_be_visible()
    expect(sender.get_by_text("Delivered ✓")).to_have_count(0)


@scenario("share: with approval, nothing is sent until the sender clicks Deliver")
def share_with_approval(env, b):
    sender, recipient = env.person(b), env.person(b)
    link, passphrase = share_send(env, sender, "approved secret", approve=True)
    share_open(recipient, link, passphrase)
    expect(sender.get_by_role("button", name="Deliver")).to_be_visible()
    stays_quiet(lambda: recipient.get_by_text("Received ✓").is_visible())
    sender.get_by_role("button", name="Deliver").click()
    expect(recipient.get_by_text("Received ✓")).to_be_visible()
    assert received_text(recipient) == "approved secret"


@scenario("chat: approve guests, messages and files relay through the host, remove a member",
          browsers=("chromium", "firefox"))
def chat_group(env, b):
    host, bob, carol = env.person(b), env.person(b), env.person(b)
    host.goto(env.app + "#/chat")
    audit(host, "chat-form")
    link, passphrase = chat_create(env, host, "Alice")
    audit(host, "chat-room-host")

    chat_join(bob, link, "Bob", passphrase)
    approve(host, "Bob")
    admitted(bob)
    chat_join(carol, link, "Carol", passphrase)
    approve(host, "Carol")
    admitted(carol)
    audit(carol, "chat-room-guest")

    say(bob, "hello from Bob")
    sees(carol, "hello from Bob")      # guest → host → guest
    sees(host, "hello from Bob")
    say(host, "welcome both")
    sees(bob, "welcome both")
    sees(carol, "welcome both")

    report = file_payload("report.pdf", 120_000)
    bob.locator(".composer input[type=file]").set_input_files([report])
    assert download(carol, ".file-card", "report.pdf") == report["buffer"]

    host.locator(".members li", has_text="Carol").get_by_role("button", name="Remove").click()
    expect(carol.get_by_text("The host removed you from the room.")).to_be_visible()
    expect(bob.locator(".members")).not_to_contain_text("Carol")


@scenario("chat: a declined guest is told and gets nothing")
def chat_declined(env, b):
    host, eve = env.person(b), env.person(b)
    link, passphrase = chat_create(env, host, "Alice")
    chat_join(eve, link, "Eve", passphrase)
    request = host.locator(".request", has_text="Eve")
    expect(request).to_be_visible()
    request.get_by_role("button", name="Decline").click()
    expect(eve.get_by_text("The host declined your request to join.")).to_be_visible()


@scenario("chat: a wrong passphrase is refused")
def chat_wrong_passphrase(env, b):
    host, mallory = env.person(b), env.person(b)
    link, _ = chat_create(env, host, "Alice")
    chat_join(mallory, link, "Mallory", "guess-guess-guess")
    expect(mallory.get_by_text("Wrong passphrase.")).to_be_visible()
    expect(host.get_by_text("Someone tried to join with a wrong passphrase (1).")).to_be_visible()


@scenario("chat: a locked room can't be joined")
def chat_locked(env, b):
    host, late = env.person(b), env.person(b)
    link, passphrase = chat_create(env, host, "Alice")
    host.get_by_text("Lock room").click()
    expect(host.get_by_text("Room locked")).to_be_visible()
    chat_join(late, link, "Late", passphrase)
    stays_quiet(lambda: host.locator(".request").count() > 0)
    expect(late.get_by_text("Looking for the host")).to_be_visible()


@scenario("chat across browsers: Chromium host, Firefox guest", browsers=("chromium",))
def chat_cross_browser(env, b):
    host, guest = env.person("chromium"), env.person("firefox")
    link, passphrase = chat_create(env, host, "Alice")
    chat_join(guest, link, "Fox", passphrase)
    approve(host, "Fox")
    admitted(guest)
    say(guest, "hi from Firefox")
    sees(host, "hi from Firefox")
    say(host, "hi from Chromium")
    sees(guest, "hi from Chromium")


@scenario("passwords page passes the accessibility checks")
def passwords_a11y(env, b):
    page = env.person(b)
    page.goto(env.app + "#/password")
    expect(page.locator(".pw").first).to_be_visible()
    audit(page, "passwords")


# ---------------------------------------------------------------- runner
def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--public", action="store_true", help="use the real public relays and STUN servers")
    parser.add_argument("--filter", default="")
    parser.add_argument("--browsers", default="chromium,firefox", help="browsers allowed to run scenarios")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    allowed = set(args.browsers.split(","))
    selected = [t for t in TESTS if args.filter in t[0] and t[2] in allowed]
    server, base = serve()
    print(f"e2e: {len(selected)} scenarios, {'public relays + STUN' if args.public else 'local relay, host-only ICE'}\n")
    failed = 0
    with sync_playwright() as p:
        env = Env(p, base, args.public)
        try:
            for name, fn, b in selected:
                start = time.time()
                try:
                    env.blocked = []
                    fn(env, b)
                    assert not env.blocked, f"the app tried to reach third parties: {env.blocked}"
                    print(f"  ✓ {name} ({time.time() - start:.1f} s)", flush=True)
                except Exception:  # noqa: BLE001 - report every failure and continue
                    failed += 1
                    print(f"  ✗ {name} ({time.time() - start:.1f} s)", flush=True)
                    print("\n".join("      " + l for l in traceback.format_exc().strip().splitlines()[-12:]))
                finally:
                    env.close_people()
        finally:
            env.close()
            server.shutdown()
    if RECORD:  # the project is mounted read-only in the container: print, review, then commit
        print("accessibility findings (candidate tests/e2e/axe-baseline.json):")
        print(json.dumps(_recorded, indent=2, sort_keys=True))
    print(f"\ne2e: {len(selected) - failed} passed, {failed} failed")
    sys.exit(1 if failed or not selected else 0)


if __name__ == "__main__":
    main()
