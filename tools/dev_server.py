"""Server locale per provare l'interfaccia web.

  python tools/dev_server.py                         dati demo su http://localhost:8123 (aggiungere ?layout=web per vedere il layout del sito)
  python tools/dev_server.py --proxy http://IP:9090  inoltra /api al PocketBase: il sito funziona come online, con i dati veri
                                                     (si accede con email e password dell'account, come sul sito vero)

Serve la cartella web/ senza cache, così ogni modifica si vede ricaricando la pagina.
"""
import argparse, http.server, os, socketserver, urllib.error, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")
SKIP = {"connection", "transfer-encoding", "content-encoding", "content-length", "keep-alive", "host"}


def handler(proxy):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=ROOT, **k)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def forward(self):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else None
            h = {k: v for k, v in self.headers.items() if k.lower() not in SKIP}
            req = urllib.request.Request(proxy + self.path, data=body, method=self.command, headers=h)
            try:
                r = urllib.request.urlopen(req, timeout=60)
            except urllib.error.HTTPError as e:
                r = e
            data = r.read()
            self.send_response(r.status if hasattr(r, "status") else r.code)
            for k, v in r.headers.items():
                if k.lower() not in SKIP:
                    self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self.forward() if proxy and self.path.startswith("/api/") else super().do_GET()

        def do_POST(self): self.forward()
        def do_PATCH(self): self.forward()
        def do_DELETE(self): self.forward()

        def log_message(self, *a): pass
    return H


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8123)
    ap.add_argument("--proxy", help="indirizzo di PocketBase, ad esempio http://192.168.1.117:9090")
    a = ap.parse_args()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", a.port), handler(a.proxy.rstrip("/") if a.proxy else None)) as s:
        print(f"MyMap su http://localhost:{a.port}" + (f"  (API da {a.proxy})" if a.proxy else "  (dati demo)"), flush=True)
        s.serve_forever()
