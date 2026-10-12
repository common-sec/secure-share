"""Tiny local dev server: correct MIME types for ES modules (Windows registry can break them)."""
import http.server
import sys

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    # Loopback by default. Inside the dev container we bind 0.0.0.0 and compose publishes the port
    # on the host's 127.0.0.1 only.
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    with http.server.ThreadingHTTPServer((host, port), Handler) as httpd:
        print(f"Serving on http://localhost:{port}", flush=True)
        httpd.serve_forever()
