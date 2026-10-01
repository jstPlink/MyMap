#!/usr/bin/env python3
"""Prepara un PocketBase nuovo via API, senza copiare le migrazioni: crea la collection `points`,
abilita /api/batch e (opzionale) crea l'utente dell'app. Equivale a pocketbase/pb_migrations.

Uso:  python tools/setup_server.py --url http://192.168.1.117:9090 --admin-email TUA@EMAIL [--user-email APP@EMAIL]
Le password vengono chieste da terminale (o lette da ADMIN_PASSWORD / USER_PASSWORD).
"""
import argparse, getpass, json, os, sys, urllib.request, urllib.error


def call(base, method, path, body=None, token=None):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--admin-email", required=True)
    ap.add_argument("--user-email")
    a = ap.parse_args()
    base = a.url.rstrip("/")

    pw = os.environ.get("ADMIN_PASSWORD") or getpass.getpass(f"Password superuser {a.admin_email}: ")
    code, res = call(base, "POST", "/api/collections/_superusers/auth-with-password", {"identity": a.admin_email, "password": pw})
    if code != 200:
        sys.exit(f"login superuser fallito: {code} {res}")
    tok = res["token"]

    code, _ = call(base, "GET", "/api/collections/points", token=tok)
    if code == 200:
        print("collection `points` già presente")
    else:
        owner = "@request.auth.id != '' && user = @request.auth.id"
        num = lambda n, **k: dict(type="number", name=n, **k)
        points = dict(
            type="base", name="points",
            listRule=owner, viewRule=owner, deleteRule=owner, updateRule=None,
            createRule="@request.auth.id != '' && @request.body.user = @request.auth.id",
            fields=[
                dict(type="relation", name="user", required=True, collectionId="_pb_users_auth_", maxSelect=1, cascadeDelete=True),
                dict(type="text", name="client_id", required=True),
                num("ts", required=True), num("lat", required=True), num("lon", required=True),
                num("accuracy"), num("speed"), num("bearing"), num("altitude"),
                dict(type="text", name="provider"), dict(type="text", name="activity"),
                num("battery"), dict(type="text", name="device_id"),
            ],
            indexes=[
                "CREATE UNIQUE INDEX idx_points_user_client ON points (user, client_id)",
                "CREATE INDEX idx_points_user_ts ON points (user, ts)",
            ],
        )
        code, res = call(base, "POST", "/api/collections", points, tok)
        if code not in (200, 201):
            sys.exit(f"creazione collection fallita: {code} {res}")
        print("collection `points` creata")

    # collection users: campo JSON `settings` (impostazioni del profilo) e password di almeno 5 caratteri (di default PocketBase vuole 8)
    code, users = call(base, "GET", "/api/collections/users", token=tok)
    if code != 200:
        sys.exit(f"lettura della collection users fallita: {code} {users}")
    fields, changed = users["fields"], False
    if any(f["name"] == "settings" for f in fields):
        print("campo `settings` già presente su users")
    else:
        fields.append(dict(type="json", name="settings", maxSize=500000)); changed = True
        print("campo `settings` aggiunto a users")
    for f in fields:
        if f["name"] == "password" and f.get("min") != 5:
            f["min"] = 5; changed = True
            print("lunghezza minima della password portata a 5")
    if changed:
        code, res = call(base, "PATCH", "/api/collections/users", {"fields": fields}, tok)
        if code != 200:
            sys.exit(f"aggiornamento della collection users fallito: {code} {res}")

    code, res = call(base, "PATCH", "/api/settings", {"batch": {"enabled": True, "maxRequests": 300, "timeout": 30, "maxBodySize": 0}}, tok)
    if code != 200:
        sys.exit(f"abilitazione batch fallita: {code} {res}")
    print("/api/batch abilitato (max 300 richieste)")

    if a.user_email:
        upw = os.environ.get("USER_PASSWORD") or getpass.getpass(f"Scegli la password per l'utente {a.user_email}: ")
        code, res = call(base, "POST", "/api/collections/users/records",
                         {"email": a.user_email, "password": upw, "passwordConfirm": upw, "emailVisibility": True}, tok)
        print("utente creato" if code in (200, 201) else f"utente non creato ({code}): {res}")


if __name__ == "__main__":
    main()
