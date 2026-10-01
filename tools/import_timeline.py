#!/usr/bin/env python3
"""Importa l'export "Spostamenti" (Timeline.json di Google Maps, formato on-device) in PocketBase.

Legge semanticSegments[].timelinePath (percorsi), semanticSegments[].visit (soste) e rawSignals[].position (fix GPS con accuratezza).
client_id è un hash di (ts, lat, lon): rilanciare lo script non crea duplicati.

Uso:  python tools/import_timeline.py takeout/Spostamenti.json --url https://pocketbase.fplinio.it --email TUA@EMAIL [--only takeout-visit]
La password si legge da MYMAP_PASSWORD, altrimenti viene chiesta.
"""
import argparse, getpass, hashlib, json, os, re, sys, urllib.request, urllib.error
from datetime import datetime

STAY_STEP = 30 * 60 * 1000  # un punto ogni 30 minuti dentro una visita
NUM = re.compile(r"-?\d+(?:\.\d+)?")


def latlng(s):
    a = NUM.findall(s)
    return float(a[0]), float(a[1])


def ms(iso):
    return int(datetime.fromisoformat(iso).timestamp() * 1000)


def extract(path):
    d = json.load(open(path, encoding="utf8"))
    out = {}
    for seg in d.get("semanticSegments", []):
        for p in seg.get("timelinePath", []):
            lat, lon = latlng(p["point"])
            out[(ms(p["time"]), round(lat, 6), round(lon, 6))] = dict(provider="takeout-path")
    for r in d.get("rawSignals", []):
        pos = r.get("position")
        if not pos:
            continue
        lat, lon = latlng(pos["LatLng"])
        rec = dict(provider="takeout-raw")
        if "accuracyMeters" in pos: rec["accuracy"] = pos["accuracyMeters"]
        if "altitudeMeters" in pos: rec["altitude"] = pos["altitudeMeters"]
        if "speedMetersPerSecond" in pos: rec["speed"] = pos["speedMetersPerSecond"]
        out[(ms(pos["timestamp"]), round(lat, 6), round(lon, 6))] = rec  # il fix grezzo vince sul percorso
    # Visite (soste): Google non registra un tracciato quando stai fermo, quindi la notte a casa non ha punti.
    # Ogni visita diventa un punto ogni 30 minuti, con accuracy = -1 per riconoscerli come "sosta" (non sono tracciati).
    for seg in d.get("semanticSegments", []):
        v = seg.get("visit")
        if not v:
            continue
        place = v.get("topCandidate", {}).get("placeLocation", {}).get("latLng")
        if not place:
            continue
        lat, lon = latlng(place)
        t0, t1 = ms(seg["startTime"]), ms(seg["endTime"])
        t = t0
        while t < t1 + STAY_STEP:
            key = (min(t, t1), round(lat, 6), round(lon, 6))
            out.setdefault(key, dict(provider="takeout-visit", accuracy=-1))
            t += STAY_STEP
    return out


def call(base, method, path, body=None, token=None):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--url", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="importa solo questo tipo di punti (takeout-path, takeout-raw, takeout-visit): utile per aggiungere i nuovi senza rimandare i vecchi")
    a = ap.parse_args()
    base = a.url.rstrip("/")

    pts = extract(a.file)
    if a.only:
        pts = {k: v for k, v in pts.items() if v.get("provider") == a.only}
    keys = sorted(pts)
    print(f"{len(keys)} punti unici, dal {datetime.fromtimestamp(keys[0][0]/1000):%d/%m/%Y} al {datetime.fromtimestamp(keys[-1][0]/1000):%d/%m/%Y}")
    if a.dry_run:
        return

    pw = os.environ.get("MYMAP_PASSWORD") or getpass.getpass("Password dell'utente PocketBase: ")
    code, res = call(base, "POST", "/api/collections/users/auth-with-password", {"identity": a.email, "password": pw})
    if code != 200:
        sys.exit(f"login fallito: {code} {res}")
    token, user = res["token"], res["record"]["id"]

    def body(k):
        ts, lat, lon = k
        cid = "gt-" + hashlib.sha1(f"{ts}|{lat}|{lon}".encode()).hexdigest()[:20]
        return dict(user=user, client_id=cid, ts=ts, lat=lat, lon=lon, device_id="google-takeout", **pts[k])

    sent = dup = 0
    for i in range(0, len(keys), 300):
        chunk = keys[i:i + 300]
        reqs = [dict(method="POST", url="/api/collections/points/records", body=body(k)) for k in chunk]
        code, _ = call(base, "POST", "/api/batch", dict(requests=reqs), token)
        if code == 200:
            sent += len(chunk)
        else:  # duplicato (batch transazionale): reinvio punto per punto
            for k in chunk:
                c, t = call(base, "POST", "/api/collections/points/records", body(k), token)
                if c in (200, 201): sent += 1
                elif c == 400 and "client_id" in str(t): dup += 1
                else: sys.exit(f"errore {c}: {t}")
        print(f"\r{min(i + 300, len(keys))}/{len(keys)}", end="", flush=True)
    print(f"\nnuovi: {sent}, già presenti: {dup}")


if __name__ == "__main__":
    main()
