#!/usr/bin/env python3
"""Copy saved IP blocks into Traefik; retain the last working file on failure."""
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import tempfile
import time
from urllib.request import Request, urlopen

PREFIX = "jobstash-ip-block-"

def build_config(ips, revision):
    if not isinstance(ips, list):
        raise ValueError("Invalid IP list")
    for ip in ips:
        if not isinstance(ip, str) or "%" in ip:
            raise ValueError("Invalid IP address")
        ipaddress.ip_address(ip)
    expected = hashlib.sha256(json.dumps(ips, separators=(",", ":")).encode()).hexdigest()
    if revision != expected:
        raise ValueError("Blocklist revision mismatch")
    routers = {}
    if ips:
        rule = "(Host(`jobstash.xyz`) || Host(`www.jobstash.xyz`)) && (" + " || ".join("ClientIP(`" + ip + "`)" for ip in ips) + ")"
        for entry in ["http", "https"]:
            router = {"entryPoints": [entry], "rule": rule, "priority": 100000,
                      "service": "noop@internal", "middlewares": ["jobstash-ip-block-reject"]}
            if entry == "https":
                router["tls"] = {}
            routers[PREFIX + revision + "-" + entry] = router
    return {"http": {**({"routers": routers} if routers else {}), "middlewares": {
        "jobstash-ip-block-reject": {"ipAllowList": {"sourceRange": ["0.0.0.0/32"]}}
    }}}

def request_json(url, secret=None, body=None, host=None):
    headers = {"Accept": "application/json"}
    if secret:
        headers["x-blocklist-key"] = secret
    if host:
        headers["Host"] = host
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urlopen(request, timeout=5) as response:
        return json.load(response)

def write_atomic(path, content):
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".blocklist-", delete=False) as output:
        temporary = output.name
        output.write(content)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)

def config_loaded(config, observed):
    expected = config["http"].get("routers", {})
    actual = {r["name"].removesuffix("@file"): r for r in observed if r.get("name", "").startswith(PREFIX) and r["name"].endswith("@file")}
    return actual.keys() == expected.keys() and all(
        actual[name].get("status") == "enabled" and actual[name].get("rule") == router["rule"]
        and actual[name].get("service") == "noop@internal"
        and actual[name].get("middlewares") == ["jobstash-ip-block-reject@file"]
        for name, router in expected.items())

def sync():
    settings = json.loads(Path(os.environ.get("BLOCKLIST_SETTINGS", "/etc/jobstash-ip-blocks.json")).read_text())
    snapshot = request_json(settings["url"], settings["secret"])
    config = build_config(snapshot["ips"], snapshot["revision"])
    path = Path(settings["file"])
    encoded = json.dumps(config, indent=2).encode()
    previous = path.read_bytes() if path.exists() else None
    changed = previous != encoded
    if changed:
        write_atomic(path, encoded)
    try:
        for attempt in range(8):
            observed = request_json(settings["statusUrl"], host="jobstash-blocklist-check.internal")
            if config_loaded(config, observed):
                request_json(settings["url"] + "/ack", settings["secret"], {"revision": snapshot["revision"]})
                return
            time.sleep(1)
        raise RuntimeError("Traefik has not accepted the saved IP blocks")
    except Exception:
        if changed:
            if previous is not None:
                write_atomic(path, previous)
            else:
                path.unlink(missing_ok=True)
        raise

if __name__ == "__main__":
    sync()
