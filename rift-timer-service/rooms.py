"""Rift Timer room API. Run behind nginx on loopback."""
import json
import os
import re
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

DB = os.environ.get("ROOM_DATABASE", "rooms.sqlite3")
DURATIONS = {"SummonerFlash": 300, "SummonerTeleport": 300, "SummonerDot": 180,
             "SummonerSmite": 15, "SummonerHeal": 240, "SummonerBarrier": 180,
             "SummonerExhaust": 240, "SummonerBoost": 240, "SummonerHaste": 240}


def validate(state, now, previous=None):
    slots = state["slots"]
    settings = state["settings"]
    if not isinstance(slots, list) or len(slots) != 10:
        raise ValueError()
    if type(settings["lead"]) != int or not 0 <= settings["lead"] <= 600:
        raise ValueError()
    if any(type(settings[k]) != bool for k in ("sound", "voice")):
        raise ValueError()
    previous = previous or {}
    mask = state.get("loadout", previous.get("loadout", [0]*5))
    debit = settings.get("autoDeduct", previous.get("settings", {}).get("autoDeduct", 0))
    if not isinstance(mask, list) or len(mask) != 5 or any(type(m) != int or not 0 <= m <= 15 or (m & 3) == 3 for m in mask):
        raise ValueError()
    if type(debit) != int or not 0 <= debit <= 300:
        raise ValueError()
    result = []
    for i, slot in enumerate(slots):
        spell = slot["spellId"]
        if spell not in DURATIONS or (i % 2 and result[-1]["spellId"] == spell):
            raise ValueError()
        end = slot["endAt"]
        if end is not None:
            if type(end) != int or end > now + DURATIONS[spell] * 1000 + 2000:
                raise ValueError()
            if end < now - 30000:
                end = None
        result.append({"spellId": spell, "endAt": end, "alerted": False})
    return {"version": 1, "slots": result, "loadout": mask, "settings": dict({k: settings[k] for k in ("lead", "sound", "voice")}, autoDeduct=debit)}


def process(msg):
    code = msg.get("code")
    if not isinstance(code, str) or not re.fullmatch(r"[0-9]{6,32}", code):
        return 400, {"error": "请输入 6 至 32 位数字对局码"}
    action = msg.get("action")
    now = int(time.time() * 1000)
    conn = sqlite3.connect(DB, timeout=8)
    try:
        with conn:
            if action in ("create", "write"):
                if action == "create":
                    shift = now - int(msg.get("clientNow", now))
                    for slot in msg["state"]["slots"]:
                        if slot["endAt"] is not None:
                            slot["endAt"] += shift
                previous = None
                if action == "write":
                    row = conn.execute("SELECT state FROM rooms WHERE code=? AND rev=?", (code, msg["rev"])).fetchone()
                    previous = json.loads(row[0]) if row else None
                state = json.dumps(validate(msg["state"], now, previous), separators=(",", ":"))
                if action == "create":
                    try:
                        conn.execute("INSERT INTO rooms VALUES (?, 1, ?)", (code, state))
                    except sqlite3.IntegrityError:
                        return 409, {"error": "该对局码已使用，请换一个"}
                elif conn.execute("UPDATE rooms SET state=?, rev=rev+1 WHERE code=? AND rev=?",
                                  (state, code, msg["rev"])).rowcount != 1:
                    return 409, {"error": "队友刚更新了对局，已重新同步，请再试一次"}
            elif action != "read":
                raise ValueError()
            row = conn.execute("SELECT rev,state FROM rooms WHERE code=?", (code,)).fetchone()
            if not row:
                return 404, {"error": "找不到该对局，请检查对局码"}
            return 200, {"rev": row[0], "state": json.loads(row[1]), "now": now}
    finally:
        conn.close()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        status, obj = 400, {"error": "无效请求"}
        try:
            if self.path != "/rift-timer/api" or self.headers.get_content_type() != "application/json":
                raise ValueError()
            size = int(self.headers["Content-Length"])
            if not 0 < size <= 8192:
                raise ValueError()
            status, obj = process(json.loads(self.rfile.read(size).decode("utf8")))
        except (ValueError, LookupError, TypeError, AttributeError):
            pass
        except sqlite3.Error:
            status, obj = 503, {"error": "服务器暂时无法保存对局"}
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    with sqlite3.connect(DB) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, rev INTEGER, state TEXT)")
    Server(("127.0.0.1", 19437), Handler).serve_forever()

