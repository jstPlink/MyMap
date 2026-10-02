#!/usr/bin/env python3
"""Toglie dal server i punti inutili, con le stesse regole di Tracker -> Pulizia dei punti dell'app (PointStore.cleanup):
  1. accuratezza peggiore di 120 m;
  2. picchi: un punto a più di 300 m dal precedente e dal successivo, che distano tra loro meno del 40% (entro 15 minuti);
  3. punti ripetuti da fermo: entro 10 m dall'ultimo tenuto e 10 minuti, seguiti da un punto ancora fermo
     (restano il primo, l'ultimo e uno ogni 10 minuti, quindi soste e notti non cambiano).
Le soste importate da Google (accuratezza -1) non si toccano.

Uso:  python tools/clean_points.py --url https://pocketbase.tuodominio.it --email TUA@EMAIL            (solo conta)
      python tools/clean_points.py --url ... --email ... --apply                                          (cancella, dopo conferma)
La password viene chiesta da terminale (o letta da MYMAP_PASSWORD). La cancellazione sul server non si annulla: prima di
usare --apply conviene un backup (Admin PocketBase -> Settings -> Backups). Dopo --apply, su un telefono che ha ancora i
punti vecchi usa Tracker -> Pulizia dei punti, altrimenti li ricarica lui sul server.
"""
import argparse, getpass, json, math, os, sys, urllib.parse, urllib.request, urllib.error


def call(base, method, path, body=None, token=None):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "MyMap-tools/1.0")  # Cloudflare (errore 1010) blocca il nome predefinito di urllib
    if token: req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def km(a, b):
    p = math.pi / 180
    x = math.sin((b["lat"] - a["lat"]) * p / 2) ** 2 + math.cos(a["lat"] * p) * math.cos(b["lat"] * p) * math.sin((b["lon"] - a["lon"]) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def classify(pts):
    """pts: dict con ts (ms), lat, lon, acc, già ordinati per ts. Restituisce la lista dei motivi: 0 tenuto, 1 accuratezza, 2 picco, 3 sosta."""
    n = len(pts)
    reason = [0] * n
    for i, p in enumerate(pts):
        if p["acc"] > 120: reason[i] = 1
    kept = [i for i in range(n) if reason[i] == 0]
    prev = -1
    for k, b in enumerate(kept):
        c = kept[k + 1] if k + 1 < len(kept) else -1
        if prev >= 0 and c >= 0 and pts[b]["acc"] != -1 and pts[c]["ts"] - pts[prev]["ts"] < 15 * 60000:
            d1, d2 = km(pts[prev], pts[b]), km(pts[b], pts[c])
            if d1 > 0.3 and d2 > 0.3 and km(pts[prev], pts[c]) < 0.4 * min(d1, d2):
                reason[b] = 2
                continue
        prev = b
    rest = [i for i in range(n) if reason[i] == 0]
    anchor = -1
    for k, p in enumerate(rest):
        if pts[p]["acc"] == -1: anchor = -1; continue
        if anchor < 0: anchor = p; continue
        nx = rest[k + 1] if k + 1 < len(rest) else -1
        if nx >= 0 and pts[nx]["acc"] != -1 and pts[p]["ts"] - pts[anchor]["ts"] < 10 * 60000 \
                and km(pts[anchor], pts[p]) < 0.01 and km(pts[anchor], pts[nx]) < 0.01:
            reason[p] = 3
        else:
            anchor = p
    return reason


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--apply", action="store_true", help="cancella davvero (senza, conta soltanto)")
    ap.add_argument("--yes", action="store_true", help="con --apply non chiede conferma")
    a = ap.parse_args()
    base = a.url.rstrip("/")

    pw = os.environ.get("MYMAP_PASSWORD") or getpass.getpass("Password dell'utente PocketBase: ")
    code, res = call(base, "POST", "/api/collections/users/auth-with-password", {"identity": a.email, "password": pw})
    if code != 200:
        sys.exit(f"login fallito: {code} {res}")
    token = res["token"]

    pts, page = [], 1
    while True:
        q = urllib.parse.urlencode({"page": page, "perPage": 500, "sort": "ts,id", "fields": "id,ts,lat,lon,accuracy", "skipTotal": 1})
        code, res = call(base, "GET", "/api/collections/points/records?" + q, token=token)
        if code != 200:
            sys.exit(f"lettura fallita: {code} {res}")
        for r in res["items"]:
            pts.append(dict(id=r["id"], ts=r["ts"], lat=r["lat"], lon=r["lon"], acc=r["accuracy"] if r.get("accuracy") is not None else 0))
        print(f"\rletti {len(pts)}", end="", flush=True)
        if len(res["items"]) < 500: break
        page += 1
    print()

    reason = classify(pts)
    cnt = [reason.count(i) for i in range(4)]
    gone = [p["id"] for p, r in zip(pts, reason) if r]
    print(f"{len(pts)} punti: da togliere {len(gone)} ({cnt[1]} troppo imprecisi, {cnt[2]} picchi, {cnt[3]} ripetuti da fermo), resterebbero {cnt[0]}")
    if not a.apply or not gone:
        if gone: print("Solo conteggio: aggiungi --apply per cancellare.")
        return
    if not a.yes and input(f"Cancellare {len(gone)} punti dal server? Non si annulla. Scrivi 'si': ").strip().lower() not in ("si", "sì"):
        sys.exit("annullato")
    done = 0
    for i in range(0, len(gone), 300):
        chunk = gone[i:i + 300]
        reqs = [dict(method="DELETE", url=f"/api/collections/points/records/{rid}") for rid in chunk]
        code, res = call(base, "POST", "/api/batch", dict(requests=reqs), token)
        if code != 200:
            sys.exit(f"\ncancellazione fallita dopo {done} punti: {code} {res}")
        done += len(chunk)
        print(f"\rcancellati {done}/{len(gone)}", end="", flush=True)
    print("\nfatto")


if __name__ == "__main__":
    main()
