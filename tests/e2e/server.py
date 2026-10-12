"""Test web server: serves the app (same handler as tools/serve.py) plus a minimal Nostr relay.

The relay lives at ws://<same origin>/relay so the app's Content Security Policy
(connect-src 'self' wss:) applies unchanged. It speaks the subset of NIP-01 that Trystero uses:
EVENT (stored, acknowledged with OK, broadcast to matching subscriptions), REQ (stored matches,
then EOSE, then live events) and CLOSE. Filters: ids, authors, kinds, since, until, limit, #<tag>.
It does not verify signatures: it is a test double for a public relay, which also can't read
anything, since Trystero encrypts what it publishes.

Standard library only (RFC 6455 WebSocket framing implemented below).
"""
import base64
import functools
import hashlib
import http.server
import json
import struct
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from serve import Handler  # noqa: E402

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


# ---------------------------------------------------------------- Nostr relay state
class Relay:
    def __init__(self):
        self.lock = threading.Lock()
        self.events = []
        self.subs = {}  # connection -> {sub_id: [filters]}

    @staticmethod
    def matches(f, ev):
        if "ids" in f and ev.get("id") not in f["ids"]:
            return False
        if "authors" in f and ev.get("pubkey") not in f["authors"]:
            return False
        if "kinds" in f and ev.get("kind") not in f["kinds"]:
            return False
        if "since" in f and ev.get("created_at", 0) < f["since"]:
            return False
        if "until" in f and ev.get("created_at", 0) > f["until"]:
            return False
        for key, values in f.items():
            if key.startswith("#"):
                name = key[1:]
                if not any(len(t) > 1 and t[0] == name and t[1] in values for t in ev.get("tags", [])):
                    return False
        return True

    def handle(self, conn, msg):
        kind = msg[0] if msg else None
        if kind == "EVENT" and len(msg) > 1 and isinstance(msg[1], dict):
            ev = msg[1]
            with self.lock:
                self.events.append(ev)
                targets = [(c, sid) for c, subs in self.subs.items() for sid, fs in subs.items()
                           if any(self.matches(f, ev) for f in fs)]
            conn.send_json(["OK", ev.get("id", ""), True, ""])
            for c, sid in targets:
                c.send_json(["EVENT", sid, ev])
        elif kind == "REQ" and len(msg) > 1:
            sid, filters = msg[1], [f for f in msg[2:] if isinstance(f, dict)]
            with self.lock:
                self.subs.setdefault(conn, {})[sid] = filters
                stored = [ev for ev in self.events if any(self.matches(f, ev) for f in filters)]
            limit = min((f["limit"] for f in filters if "limit" in f), default=None)
            for ev in (stored[-limit:] if limit else stored):
                conn.send_json(["EVENT", sid, ev])
            conn.send_json(["EOSE", sid])
        elif kind == "CLOSE" and len(msg) > 1:
            with self.lock:
                self.subs.get(conn, {}).pop(msg[1], None)
        else:
            conn.send_json(["NOTICE", "unsupported message"])

    def disconnect(self, conn):
        with self.lock:
            self.subs.pop(conn, None)


# ---------------------------------------------------------------- WebSocket connection
class WebSocket:
    def __init__(self, rfile, wfile):
        self.rfile, self.wfile = rfile, wfile
        self.send_lock = threading.Lock()

    def _send_frame(self, opcode, payload):
        header = bytes([0x80 | opcode])
        n = len(payload)
        if n < 126:
            header += bytes([n])
        elif n < 65536:
            header += bytes([126]) + struct.pack("!H", n)
        else:
            header += bytes([127]) + struct.pack("!Q", n)
        with self.send_lock:
            try:
                self.wfile.write(header + payload)
                self.wfile.flush()
            except OSError:
                pass

    def send_json(self, obj):
        self._send_frame(0x1, json.dumps(obj).encode())

    def messages(self):
        """Yields complete text messages until the client closes."""
        buffer = b""
        while True:
            head = self.rfile.read(2)
            if len(head) < 2:
                return
            fin, opcode = head[0] & 0x80, head[0] & 0x0F
            masked, n = head[1] & 0x80, head[1] & 0x7F
            if n == 126:
                n = struct.unpack("!H", self.rfile.read(2))[0]
            elif n == 127:
                n = struct.unpack("!Q", self.rfile.read(8))[0]
            mask = self.rfile.read(4) if masked else b"\0\0\0\0"
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(self.rfile.read(n)))
            if opcode == 0x8:  # close
                self._send_frame(0x8, b"")
                return
            if opcode == 0x9:  # ping
                self._send_frame(0xA, data)
                continue
            if opcode in (0x1, 0x0):
                buffer += data
                if fin:
                    yield buffer.decode("utf-8", "replace")
                    buffer = b""


# ---------------------------------------------------------------- HTTP + relay handler
class TestHandler(Handler):
    relay = None  # set by serve()

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.split("?")[0] == "/relay" and self.headers.get("Upgrade", "").lower() == "websocket":
            return self._relay()
        return super().do_GET()

    def _relay(self):
        key = self.headers.get("Sec-WebSocket-Key", "")
        # RFC 6455 §4.2.2 mandates SHA-1 here: it's a protocol checksum proving the server read the
        # handshake, not a security control. Any other hash breaks every WebSocket client.
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()  # nosemgrep: python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1
        # WebSocket requires an HTTP/1.1 status line; Python's handler defaults to HTTP/1.0
        # (Chromium tolerates that, Firefox rightly doesn't).
        self.protocol_version = "HTTP/1.1"
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        self.wfile.flush()
        conn = WebSocket(self.rfile, self.wfile)
        try:
            for text in conn.messages():
                try:
                    self.relay.handle(conn, json.loads(text))
                except (ValueError, TypeError, IndexError):
                    conn.send_json(["NOTICE", "invalid message"])
        finally:
            self.relay.disconnect(conn)
            self.close_connection = True


def serve(host="127.0.0.1", port=0):
    """Starts the server in a background thread; returns (server, base_url)."""
    relay = Relay()
    handler = functools.partial(type("H", (TestHandler,), {"relay": relay}), directory=str(ROOT))
    server = http.server.ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://{host}:{server.server_address[1]}"


if __name__ == "__main__":
    srv, url = serve(port=int(sys.argv[1]) if len(sys.argv) > 1 else 8090)
    print(f"Serving {url} (relay at {url.replace('http', 'ws')}/relay)", flush=True)
    threading.Event().wait()
