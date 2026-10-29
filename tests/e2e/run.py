"""End-to-end tests: real users' flows through the real UI, in real browsers, over real WebRTC.

Each person (sender, recipient, host, guests) is a separate, isolated browser context. Playwright
clicks and types through the app exactly as a user would. Peers connect with WebRTC, using
Trystero and a Nostr relay for discovery, as on the live site.

    docker compose run --rm test-e2e            # local relay, host-only ICE (default, CI)
    docker compose run --rm test-e2e-public     # online: the real public relays and STUN servers

    python tests/e2e/run.py [--public] [--filter text] [--browsers chromium,firefox,webkit]

Default mode serves the app and a minimal Nostr relay from one local server (tests/e2e/server.py)
and points the app at it through test-only hooks injected before the page loads; ICE uses host
candidates only, so no public STUN server or relay is involved (WebKit, which hides host
candidates behind mDNS names, gets a STUN server in the test container: see server.stun_serve).
Every request the browsers make to anything but the local server (HTTP or WebSocket) is blocked
and fails the scenario: the built app must work without any third-party origin. Public mode
injects nothing: the app behaves exactly as on the live site. Both test the built app (dist/),
so run the `build` service first.
"""
import argparse
import json
import os
import re
import sys
import time
import traceback
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from server import serve, stun_serve  # noqa: E402

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
        hooks = f"window.__USS_TEST_RELAYS__ = {json.dumps([relay])}; window.__USS_TEST_ICE_SERVERS__ = "
        self.init_script = None if public else hooks + "[];"
        self.webkit_init_script = None if public else hooks + json.dumps([{"urls": stun_serve()}]) + ";"

    def browser(self, name):
        if name not in self.browsers:
            if name == "firefox":
                self.browsers[name] = self.pw.firefox.launch(firefox_user_prefs=None if self.public else FIREFOX_PREFS)
            elif name == "webkit":
                self.browsers[name] = self.pw.webkit.launch()
            else:
                self.browsers[name] = self.pw.chromium.launch(args=[] if self.public else CHROMIUM_ARGS)
        return self.browsers[name]

    def person(self, browser="chromium"):
        """A new person: an isolated browser context (own storage, own WebRTC identity)."""
        ctx = self.browser(browser).new_context(accept_downloads=True)
        if browser == "chromium":
            # Lets the test read what the app copied; the app itself only writes.
            ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        if self.init_script:
            # Guards first: WebSocket routing patches the page, and must be in place before any script.
            ctx.route(lambda url: not self.local(url), self.block_http)
            ctx.route_web_socket(lambda url: not self.local(url), self.block_ws)
            ctx.add_init_script(self.webkit_init_script if browser == "webkit" else self.init_script)
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


def share_send(env, page, text, files=(), approve=False, keep_awake=False, own_words=None):
    page.goto(env.app)
    page.get_by_label("What do you want to send?").fill(text)
    if files:
        page.locator("form input[type=file]").set_input_files(list(files))
    # One question, one button: the passphrase isn't on the creation page (G2).
    expect(page.locator("form input[aria-label=Passphrase]")).to_be_hidden()
    if approve or own_words:
        page.get_by_text("More options").click()
    if approve:
        page.get_by_text("Let me check who’s receiving before sending").click()
    if own_words:
        page.locator("form input[aria-label=Passphrase]").fill(own_words)
        no_password_fields(page)
        expect(page.get_by_text("estimate for a typed passphrase")).to_be_visible()
    page.get_by_role("button", name="Create link").click()
    # The invitation is copied straight away, or the sender is told to copy it (G3).
    expect(page.get_by_text(re.compile("^Link copied$|Copy the invitation with the link"))).to_be_visible()
    # There's no "copy the link alone": read it from a Send with button (icons, named by aria-label).
    telegram = page.locator(".share-to").first.get_by_role("link", name="Telegram", exact=True).get_attribute("href")
    link = urllib.parse.parse_qs(urllib.parse.urlparse(telegram).query)["url"][0]
    # The generated words are shown on the waiting screen, where they're used.
    # Step 2 shows them masked, word by word, with Show (G4).
    words = page.locator(".words")
    expect(words.locator(".words-text:not([hidden])")).not_to_contain_text(re.compile("[A-Za-z]"))
    words.get_by_role("button", name="Show").click()
    passphrase = " ".join(words.locator(".words-text:not([hidden]) .word").all_inner_texts())
    if own_words:
        assert passphrase == own_words, passphrase
    else:
        assert re.fullmatch(r"[a-z]+( [a-z]+){5}", passphrase), passphrase
    warning = page.get_by_text("Don’t leave your phone or computer unattended")
    expect(warning).to_be_hidden()          # off by default
    if keep_awake:
        page.get_by_text("Keep my screen on").click()
        expect(warning).to_be_visible()
    return link, passphrase


def no_password_fields(page):
    """Secrets are masked without type=password, so the browser doesn't offer to save them."""
    if page.evaluate("CSS.supports('-webkit-text-security', 'disc')"):
        assert page.locator("input[type=password]").count() == 0
        expect(page.locator("input[aria-label=Passphrase]").first).to_have_attribute("autocomplete", "off")


def share_open(page, link, passphrase):
    page.goto(link)
    page.locator("form input[aria-label=Passphrase]").fill(passphrase)
    no_password_fields(page)
    page.get_by_role("button", name="Open", exact=True).click()


def received_text(page):
    """The received text is masked until the recipient clicks Show."""
    expect(page.locator("pre.secret")).to_be_hidden()
    # One large button is the next step, not a small Show among others.
    page.locator(".result").get_by_role("button", name="Show the secret text").click()
    return page.locator("pre.secret").inner_text()


def download(page, scope, name):
    with page.expect_download() as info:
        page.locator(scope, has_text=name).get_by_role("link", name="Download").click()
    return Path(info.value.path()).read_bytes()


# ---------------------------------------------------------------- helpers: Secure Chat
def chat_create(env, page, nick):
    page.goto(env.app + "chat/")
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
ENGINES = ("chromium", "firefox", "webkit")
TESTS = []    # (name, function, its argument, engines used)


def scenario(name, browsers=("chromium",)):
    def register(fn):
        for b in browsers:
            TESTS.append((f"{name} [{b}]", fn, b, (b,)))
        return fn
    return register


@scenario("share: text and a file are delivered once, then the link is dead", browsers=("chromium", "firefox", "webkit"))
def share_happy_path(env, b):
    sender, recipient = env.person(b), env.person(b)
    secret_file = file_payload("keys.bin", 300_000)
    sender.goto(env.app)
    audit(sender, "share-form")
    link, passphrase = share_send(env, sender, "db-password: Karrot~Over~Stone42", [secret_file])
    audit(sender, "share-waiting")
    # The link is the home page's address, with the room's secrets only in the fragment.
    assert re.fullmatch(re.escape(env.app) + r"#r=[\w-]{22}&k=[\w-]{43}&h=[\w-]{43}", link), link

    expect(sender.locator(".page-head .lead").first).to_be_hidden()   # the intro is hidden while waiting
    expect(sender.get_by_role("status")).to_contain_text("Waiting for the recipient")
    # Steps 1-3 are the sender's; 4 waits on the recipient (orange timer), 5 hasn't started.
    expect(sender.locator(".guide-steps > li").nth(3)).to_have_class(re.compile("waiting"))

    if b == "chromium":
        # What was copied is an invitation with the link, never the passphrase.
        expect(sender.get_by_text("Link copied", exact=True)).to_be_visible()
        copied = sender.evaluate("navigator.clipboard.readText()")
        assert link in copied and copied.startswith("I’m sending you something privately"), copied
        assert passphrase not in copied, copied
    # One copy button, for the invitation with the link: no copy of the link alone.
    expect(sender.locator('input[aria-label="One-time link"]')).to_have_count(0)
    expect(sender.get_by_role("button", name=re.compile("^Copy (again|invitation)$"))).to_be_visible()
    # Messenger share links and the QR code hold the link, never the words...
    link_row, words_row = sender.locator(".share-to").nth(0), sender.locator(".share-to").nth(1)
    for name in ("Email", "Gmail", "Outlook", "WhatsApp", "Telegram", "Teams"):
        href = link_row.get_by_role("link", name=name, exact=True).get_attribute("href")
        assert urllib.parse.quote(link, safe="") in href, href
        assert urllib.parse.quote(passphrase, safe="") not in href and passphrase not in href, href
    # ...and the "send the words another way" links hold the words, never the link.
    for name in ("Text message", "WhatsApp", "Telegram", "Email", "Gmail", "Outlook"):
        href = words_row.get_by_role("link", name=name, exact=True).get_attribute("href")
        assert urllib.parse.quote(passphrase, safe="") in href, href
        assert urllib.parse.quote(link, safe="") not in href and link not in href, href
    # Sending the words the same way as the link is discouraged, not blocked.
    sender.context.route("https://wa.me/**", lambda route: route.abort())
    with sender.expect_popup() as popup:
        link_row.get_by_role("link", name="WhatsApp", exact=True).click()
    popup.value.close()
    words_row.get_by_role("link", name="WhatsApp", exact=True).click()
    warning = sender.get_by_role("alert").filter(has_text="Not recommended")
    expect(warning).to_contain_text("You sent the link with WhatsApp")
    expect(warning.get_by_role("link", name="Send anyway")).to_have_attribute("href", re.compile("^https://wa.me/"))
    warning.get_by_role("button", name="Choose another way").click()
    expect(warning).to_be_hidden()
    sender.get_by_role("button", name="QR code").click()
    expect(sender.get_by_role("img", name="QR code of the one-time link")).to_be_visible()

    share_open(recipient, link, passphrase)
    expect(recipient).to_have_title(re.compile("received a secure delivery"))
    expect(recipient.get_by_role("heading", name="Someone sent you something privately")).to_be_visible()
    expect(recipient.get_by_text("Received ✓")).to_be_visible()
    expect(recipient.locator(".guide-steps > li.done")).to_have_count(3)   # every step ticked
    assert received_text(recipient) == "db-password: Karrot~Over~Stone42"
    assert download(recipient, ".file-card", "keys.bin") == secret_file["buffer"]
    expect(sender.get_by_text("Delivered ✓")).to_be_visible()
    expect(sender).to_have_title(re.compile("^✓ Delivered"))
    expect(sender.locator(".guide-steps > li.done")).to_have_count(5)   # every step ticked
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
    link, passphrase = share_send(env, sender, "approved secret", approve=True, keep_awake=True)
    share_open(recipient, link, passphrase)
    expect(sender.get_by_role("button", name="Deliver")).to_be_visible()
    stays_quiet(lambda: recipient.get_by_text("Received ✓").is_visible())
    sender.get_by_role("button", name="Deliver").click()
    expect(recipient.get_by_text("Received ✓")).to_be_visible()
    assert received_text(recipient) == "approved secret"
    # Done clears everything from the page (G5).
    recipient.get_by_role("button", name="Done").click()
    expect(recipient.get_by_text("All done ✓")).to_be_visible()
    expect(recipient.locator("pre.secret")).to_have_count(0)
    expect(recipient.get_by_role("link", name="Send something back")).to_be_visible()


@scenario("share: the sender can choose their own words under More options")
def share_own_words(env, b):
    sender, recipient = env.person(b), env.person(b)
    link, passphrase = share_send(env, sender, "my own words", own_words="Purple Kettle 7 sings!")
    share_open(recipient, link, passphrase)
    expect(recipient.get_by_text("Received ✓")).to_be_visible()
    assert received_text(recipient) == "my own words"


@scenario("chat: approve guests, messages and files relay through the host, remove a member",
          browsers=("chromium", "firefox", "webkit"))
def chat_group(env, b):
    host, bob, carol = env.person(b), env.person(b), env.person(b)
    host.goto(env.app + "chat/")
    audit(host, "chat-form")
    link, passphrase = chat_create(env, host, "Alice")
    audit(host, "chat-room-host")
    assert re.fullmatch(re.escape(env.app) + r"chat/#r=[\w-]{22}&k=[\w-]{43}&h=[\w-]{43}", link), link

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



@scenario("chat: a reload resumes the room, the passphrase is not stored, and everyone sees the time limit")
def chat_reload(env, b):
    host, bob = env.person(b), env.person(b)
    link, passphrase = chat_create(env, host, "Alice")
    expect(host.get_by_text("It closes automatically at")).to_be_visible()
    chat_join(bob, link, "Bob", passphrase)
    approve(host, "Bob")
    admitted(bob)
    expect(bob.get_by_text("This room closes automatically at")).to_be_visible()
    assert passphrase not in host.evaluate("JSON.stringify(sessionStorage)"), "passphrase kept in sessionStorage"

    host.reload()
    expect(host.get_by_text("Room resumed after a reload")).to_be_visible()
    expect(host.get_by_text("not kept after a reload")).to_be_visible()
    expect(host.locator(".members").get_by_text("Bob")).to_be_visible()
    say(host, "back after a reload")
    sees(bob, "back after a reload")

# Every ordered pair of different engines, for both flows: the roles aren't symmetric (the host
# relays for its guests, the sender offers and the recipient asks), so A → B and B → A both count.
CROSS_PAIRS = [(a, b) for a in ENGINES for b in ENGINES if a != b]


def cross_scenario(name):
    def register(fn):
        for a, b in CROSS_PAIRS:
            TESTS.append((f"{name} [{a} → {b}]", fn, (a, b), (a, b)))
        return fn
    return register


@cross_scenario("share across browsers: text and a file delivered")
def share_cross_browser(env, pair):
    a, b = pair
    sender, recipient = env.person(a), env.person(b)
    secret_file = file_payload("notes.bin", 200_000)
    link, passphrase = share_send(env, sender, f"from {a} to {b}", [secret_file])
    share_open(recipient, link, passphrase)
    expect(recipient.get_by_text("Received ✓")).to_be_visible()
    assert recipient.locator("pre.secret").inner_text() == f"from {a} to {b}"
    assert download(recipient, ".file-card", "notes.bin") == secret_file["buffer"]
    expect(sender.get_by_text("Delivered ✓")).to_be_visible()


@cross_scenario("chat across browsers: guest admitted, messages both ways")
def chat_cross_browser(env, pair):
    a, b = pair
    host, guest = env.person(a), env.person(b)
    link, passphrase = chat_create(env, host, "Alice")
    chat_join(guest, link, "Bob", passphrase)
    approve(host, "Bob")
    admitted(guest)
    say(guest, f"hi from {b}")
    sees(host, f"hi from {b}")
    say(host, f"hi from {a}")
    sees(guest, f"hi from {a}")


@scenario("passwords page passes the accessibility checks")
def passwords_a11y(env, b):
    page = env.person(b)
    page.goto(env.app + "passwords/")
    expect(page.locator(".pw").first).to_be_visible()
    audit(page, "passwords")


# ---------------------------------------------------------------- static pages
PAGES = {   # path -> (heading, mounts a tool)
    "": ("Secure Share", True),
    "chat/": ("Secure Chat", True),
    "passwords/": ("Password Generator", True),
    "how-it-works/": ("How it works", False),
    "faq/": ("Frequently asked questions", False),
}


@scenario("static pages: content, metadata and links without JavaScript")
def static_pages(env, b):
    ctx = env.browser(b).new_context(java_script_enabled=False)
    env.contexts.append(ctx)
    page = ctx.new_page()
    for path, (heading, tool) in PAGES.items():
        response = page.goto(env.app + path)
        assert response.ok, f"{path}: HTTP {response.status}"
        # What crawlers and link previews see: real content, its own title and description.
        expect(page.get_by_role("heading", level=1)).to_have_text(heading)
        assert "CommonSec Share" in page.title(), page.title()
        assert len(page.locator('meta[name="description"]').get_attribute("content")) > 80
        canonical = page.locator('link[rel="canonical"]').get_attribute("href")
        assert canonical.startswith("https://") and canonical.endswith("/" + path), canonical
        assert page.locator('meta[property="og:url"]').get_attribute("content") == canonical
        assert page.locator('meta[property="og:image"]').get_attribute("content").endswith("/og-image.png")
        assert page.locator('meta[name="twitter:card"]').get_attribute("content") == "summary_large_image"
        schemas = [json.loads(s) for s in page.locator('script[type="application/ld+json"]').all_text_contents()]
        types = {s["@type"] for s in schemas}
        assert ("WebApplication" in types) == tool, (path, types)
        if path == "faq/":
            faq = next(s for s in schemas if s["@type"] == "FAQPage")
            shown = page.locator(".faq-item h2").all_text_contents()
            assert [q["name"] for q in faq["mainEntity"]] == shown, faq
        if tool:   # the tool's page says it needs JavaScript, and still explains itself
            expect(page.locator("noscript")).to_have_count(1)
            expect(page.locator("#about h2")).to_be_visible()
        # Every link and asset of the page resolves, wherever the site is served from.
        for url in page.locator('a[href]:not([href^="http"]), link[href]:not([href^="http"])').evaluate_all(
                "els => els.map(e => e.href)"):
            assert page.request.get(url).ok, f"{path}: broken link {url}"
    for name in ("robots.txt", "sitemap.xml", "site.webmanifest", "og-image.png", "favicon.svg"):
        assert page.request.get(env.app + name).ok, name
    sitemap = page.request.get(env.app + "sitemap.xml").text()
    assert all(f"/{p}</loc>" in sitemap for p in PAGES), sitemap


@scenario("static pages: links in the old format still open the right tool")
def legacy_links(env, b):
    page = env.person(b)
    page.goto(env.app + "#/chat?r=" + "a" * 22 + "&k=" + "b" * 43 + "&h=" + "c" * 43)
    expect(page).to_have_url(env.app + "chat/#r=" + "a" * 22 + "&k=" + "b" * 43 + "&h=" + "c" * 43)
    expect(page.get_by_role("button", name="Join chat")).to_be_visible()
    page.goto(env.app + "#/password")
    expect(page).to_have_url(re.compile(re.escape(env.app + "passwords/")))
    expect(page.locator(".pw").first).to_be_visible()


@scenario("content pages pass the accessibility checks")
def content_a11y(env, b):
    page = env.person(b)
    for path, state in (("how-it-works/", "how-it-works"), ("faq/", "faq")):
        page.goto(env.app + path)
        audit(page, state)


# ---------------------------------------------------------------- runner
def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--public", action="store_true", help="use the real public relays and STUN servers")
    parser.add_argument("--filter", default="")
    parser.add_argument("--browsers", default=",".join(ENGINES), help="browsers allowed to run scenarios")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    allowed = set(args.browsers.split(","))
    selected = [t for t in TESTS if args.filter in t[0] and set(t[3]) <= allowed]
    server, base = serve()
    print(f"e2e: {len(selected)} scenarios, {'public relays + STUN' if args.public else 'local relay, host-only ICE'}\n")
    failed = 0
    with sync_playwright() as p:
        env = Env(p, base, args.public)
        try:
            for name, fn, b, _ in selected:
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
