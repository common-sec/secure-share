"""Interoperability with the reference age tool (https://age-encryption.org).

Share files and text are age files encrypted to a post-quantum hybrid identity derived from the
room keys (docs/PROTOCOL.md §7). This checks, in a real browser, that the reference `age` command
(Go, >= 1.3 for hybrid recipients) and the app agree both ways:

  1. the app derives the room's identity and encrypts text and a binary file; `age -d` decrypts them;
  2. `age -r <room recipient>` encrypts a file; the app decrypts it.

Normally run in the pinned test container, after building (see docs/TESTING.md):
    docker compose run --rm test-unit          # unit tests, then this check
    docker compose run --rm test-unit python tests/unit/age_cli.py
"""
import base64
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run import serve, sync_playwright  # noqa: E402  (same loopback server as the unit tests)

AGE = os.environ.get("AGE_BIN", "age")

# Runs in the page: the app's own modules, as the unit tests use them.
DERIVE_AND_ENCRYPT = """async ([text, fileB64]) => {
  const C = await import('/build/modules/lib/crypto.js');
  const E = await import('/build/modules/lib/encoding.js');
  const keys = await C.deriveRoomKeys(C.randomId(16), C.randomId(32), 'interop-pass-Phrase7');
  window.__AGE_KEYS__ = keys;
  return {
    identity: await C.ageIdentity(keys),
    recipient: await C.ageRecipient(keys),
    text: E.bytesToB64url(await C.ageEncrypt(keys, E.utf8.encode(text))),
    file: E.bytesToB64url(await C.ageEncrypt(keys, E.b64urlToBytes(fileB64))),
  };
}"""

DECRYPT = """async (b64) => {
  const C = await import('/build/modules/lib/crypto.js');
  const E = await import('/build/modules/lib/encoding.js');
  return E.bytesToB64url(await C.ageDecrypt(window.__AGE_KEYS__, E.b64urlToBytes(b64)));
}"""


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64u(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def check(ok: bool, what: str) -> bool:
    print(f"  {'✓' if ok else '✗'} [age-cli] {what}")
    return ok


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    version = subprocess.run([AGE, "--version"], capture_output=True, text=True, check=True).stdout.strip()
    print(f"reference age {version}")

    text = "Share text → age ✓ 🦊"
    blob = os.urandom(200_000)  # several 64 KiB chunks
    server = serve()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    ok = True
    try:
        with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
            browser = p.chromium.launch()
            try:
                page = browser.new_page()
                # Any page of the test server will do: it gives the modules their origin.
                page.goto(f"{base}/tests/unit/index.html?filter=no-test-matches-this")
                page.wait_for_selector("#summary.pass, #summary.fail")
                out = page.evaluate(DERIVE_AND_ENCRYPT, [text, b64u(blob)])
                ok = check(out["identity"].startswith("AGE-SECRET-KEY-PQ-1")
                           and out["recipient"].startswith("age1pq1"), "the room has a hybrid identity") and ok

                tmpd = Path(tmp)
                (tmpd / "key.txt").write_text(out["identity"] + "\n")
                for name, plain in (("text", text.encode()), ("file", blob)):
                    (tmpd / f"{name}.age").write_bytes(unb64u(out[name]))
                    res = subprocess.run([AGE, "-d", "-i", str(tmpd / "key.txt"), str(tmpd / f"{name}.age")], capture_output=True)
                    ok = check(res.returncode == 0 and res.stdout == plain, f"age -d decrypts the app's {name}") and ok
                    if res.returncode:
                        print("      " + res.stderr.decode(errors="replace").strip())

                (tmpd / "plain.bin").write_bytes(blob)
                res = subprocess.run([AGE, "-r", out["recipient"], "-o", str(tmpd / "cli.age"), str(tmpd / "plain.bin")], capture_output=True)
                ok = check(res.returncode == 0, "age -r encrypts to the room's recipient") and ok
                if res.returncode == 0:
                    back = unb64u(page.evaluate(DECRYPT, b64u((tmpd / "cli.age").read_bytes())))
                    ok = check(back == blob, "the app decrypts the reference tool's file") and ok
            finally:
                browser.close()
    finally:
        server.shutdown()
    print(f"[age-cli] {'passed' if ok else 'FAILED'}\n")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
