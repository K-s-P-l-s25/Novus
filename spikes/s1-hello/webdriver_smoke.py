import json, sys, time, urllib.request
BASE = "http://127.0.0.1:4444"
def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["value"]
app = sys.argv[1]
sid = call("POST", "/session", {"capabilities": {"alwaysMatch": {"tauri:options": {"application": app}}}})["sessionId"]
try:
    time.sleep(4)
    print("url:", call("GET", f"/session/{sid}/url")); print("src:", call("GET", f"/session/{sid}/source")[:600])
    el = lambda css: list(call("POST", f"/session/{sid}/element", {"using": "css selector", "value": css}).values())[0]
    print("before:", call("GET", f"/session/{sid}/element/{el('[data-testid=result]')}/text"))
    call("POST", f"/session/{sid}/element/{el('button')}/click", {})
    time.sleep(1)
    print("after: ", call("GET", f"/session/{sid}/element/{el('[data-testid=result]')}/text"))
finally:
    call("DELETE", f"/session/{sid}")
