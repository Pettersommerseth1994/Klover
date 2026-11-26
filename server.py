"""Lokal utviklingsserver for Kløver.

Serverer filene i denne mappen og videresender /api/* til data.brreg.no
(Brreg avviser kall direkte fra nettleseren på grunn av CORS).
Kjør:  python3 server.py   ->  http://localhost:5173
"""
import http.server, urllib.request, urllib.error, os

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 5173


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(s):
        s.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(s):
        if not s.path.startswith("/api/"):
            return super().do_GET()
        url = "https://data.brreg.no/" + s.path[5:]
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/json"}), timeout=15)
            body, code = r.read(), r.status
        except urllib.error.HTTPError as e:
            body, code = e.read(), e.code
        except Exception:
            body, code = b"{}", 502
        s.send_response(code)
        s.send_header("Content-Type", "application/json")
        s.send_header("Content-Length", str(len(body)))
        s.end_headers()
        s.wfile.write(body)

    def log_message(s, *a):
        pass


if __name__ == "__main__":
    print(f"Kløver kjører på http://localhost:{PORT}")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
