import hashlib
import json
import threading
import unittest
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.error import HTTPError
import sync as blocklist


def revision(ips):
    return hashlib.sha256(json.dumps(ips, separators=(",", ":")).encode()).hexdigest()


class BlocksTest(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        folder = Path(self.stack.enter_context(TemporaryDirectory()))
        self.path = folder / "rules.yaml"
        self.settings_path = folder / "settings.json"
        self.stack.enter_context(patch.object(blocklist, "OUTPUT_FILE", self.path))
        self.stack.enter_context(patch.dict("os.environ", {"BLOCKLIST_SETTINGS": str(self.settings_path)}))
        self.settings = dict(url=blocklist.SOURCE_URL, secret="fixture-secret", file=str(self.path), statusUrl=blocklist.STATUS_URL)
        self.save_settings()
        self.snapshot = dict(ips=["1.2.3.4"], revision=revision(["1.2.3.4"]))

    def save_settings(self):
        self.settings_path.write_text(json.dumps(self.settings))

    def observed(self):
        config = blocklist.build_config(self.snapshot["ips"], self.snapshot["revision"])
        return [dict(router, name=name + "@file", status="enabled", middlewares=["jobstash-ip-block-reject@file"])
                for name, router in config["http"]["routers"].items()]

    def test_ipv4_ipv6_and_frontend_only(self):
        ips = ["1.2.3.4", "2001:db8::1"]
        config = blocklist.build_config(ips, revision(ips))
        routers = config["http"]["routers"]
        self.assertEqual(len(routers), 2)
        for router in routers.values():
            self.assertIn("Host(`jobstash.xyz`)", router["rule"])
            self.assertNotIn("recruiters.rip", router["rule"])
            self.assertIn("ClientIP(`2001:db8::1`)", router["rule"])
        self.assertEqual(blocklist.build_config([], revision([]))["http"].get("routers", {}), {})

    def test_invalid_and_changed_lists_rejected(self):
        for ips in [["example.com"], ["1.2.3.4/24"], ["1.2.3.4`) || Host(`any"], ["fe80::1%eth0"]]:
            with self.subTest(ips=ips), self.assertRaises(ValueError):
                blocklist.build_config(ips, revision(ips))
        with self.assertRaises(ValueError):
            blocklist.build_config(["1.2.3.4"], revision([]))

    def test_only_confirm_exact_loaded_rules(self):
        config = blocklist.build_config(self.snapshot["ips"], self.snapshot["revision"])
        self.assertFalse(blocklist.config_loaded(config, []))
        observed = self.observed()
        self.assertTrue(blocklist.config_loaded(config, observed))
        observed[0]["status"] = "disabled"
        self.assertFalse(blocklist.config_loaded(config, observed))

    def test_failure_preserves_last_file_and_does_not_ack(self):
        self.path.write_text("previous working rules")
        with patch.object(blocklist, "request_json", side_effect=[self.snapshot, RuntimeError("proxy down")]) as request:
            with self.assertRaises(RuntimeError):
                blocklist.sync()
            self.assertEqual(self.path.read_text(), "previous working rules")
            self.assertEqual(request.call_count, 2)
        with patch.object(blocklist, "request_json", side_effect=RuntimeError("API down")):
            with self.assertRaises(RuntimeError):
                blocklist.sync()
            self.assertEqual(self.path.read_text(), "previous working rules")

    def test_rejected_new_file_is_removed(self):
        with patch.object(blocklist, "request_json", side_effect=[self.snapshot, RuntimeError("proxy down")]):
            with self.assertRaises(RuntimeError):
                blocklist.sync()
        self.assertFalse(self.path.exists())

    def test_destinations_rejected_before_network_or_output_access(self):
        for key, value in [("url", "http://169.254.169.254/latest/meta-data/"),
                           ("url", blocklist.SOURCE_URL + "/../admin"),
                           ("statusUrl", "http://attacker.invalid/api/http/routers"),
                           ("file", "/etc/cron.d/attacker"),
                           ("file", str(self.path.parent / ".." / "escaped.yaml"))]:
            with self.subTest(key=key, value=value):
                settings = dict(self.settings, **{key: value})
                self.settings_path.write_text(json.dumps(settings))
                with patch.object(blocklist, "request_json") as request, patch.object(Path, "read_bytes") as read_bytes, patch.object(Path, "exists") as exists, patch.object(Path, "unlink") as unlink, patch.object(blocklist, "write_atomic") as write:
                    with self.assertRaises(ValueError):
                        blocklist.sync()
                    for effect in [request, read_bytes, exists, unlink, write]:
                        effect.assert_not_called()

    def test_unapproved_requests_and_status_credentials_rejected(self):
        with patch.object(blocklist, "build_opener") as opener:
            for url in ["file:///etc/passwd", "http://169.254.169.254/", blocklist.SOURCE_URL + "?destination=elsewhere"]:
                with self.subTest(url=url), self.assertRaises(ValueError):
                    blocklist.request_json(url, "fixture-secret")
            with self.assertRaises(ValueError):
                blocklist.request_json(blocklist.STATUS_URL, "fixture-secret")
            opener.assert_not_called()

    def test_loopback_http_sync_and_redirect_rejection(self):
        calls = []
        test = self
        self.failure = None

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                calls.append((self.path, self.headers.get("x-blocklist-key"), self.headers.get("Host")))
                if self.path == "/redirect" or (self.path == "/proxy/ack" and test.failure == "ack"):
                    self.send_response(test.redirect_status)
                    self.send_header("Location", "/stolen")
                    self.end_headers()
                    return
                if self.path == "/status" and test.failure == "status":
                    self.send_error(503)
                    return
                payload = test.snapshot if self.path == "/proxy" else test.observed()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode())

            def do_POST(self):
                self.do_GET()

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = "http://127.0.0.1:" + str(server.server_port)
            with patch.object(blocklist, "SOURCE_URL", base + "/proxy"), patch.object(blocklist, "STATUS_URL", base + "/status"), patch.dict("os.environ", {"http_proxy": "http://127.0.0.1:1", "https_proxy": "http://127.0.0.1:1", "no_proxy": ""}):
                self.settings.update(url=blocklist.SOURCE_URL, statusUrl=blocklist.STATUS_URL)
                self.save_settings()
                blocklist.sync()
                self.assertEqual(json.loads(self.path.read_text()), blocklist.build_config(self.snapshot["ips"], self.snapshot["revision"]))
                self.assertEqual(calls, [("/proxy", "fixture-secret", "127.0.0.1:" + str(server.server_port)),
                                         ("/status", None, "jobstash-blocklist-check.internal"),
                                         ("/proxy/ack", "fixture-secret", "127.0.0.1:" + str(server.server_port))])
            for status in [301, 302, 303, 307, 308]:
                self.redirect_status = status
                with self.subTest(status=status), patch.object(blocklist, "SOURCE_URL", base + "/redirect"):
                    # Exercise the real HTTP redirect handler; only the initial endpoint may receive credentials.
                    with self.assertRaises(HTTPError):
                        blocklist.request_json(blocklist.SOURCE_URL, "fixture-secret")
                    self.assertEqual(calls[-1][0], "/redirect")
                    self.assertFalse(any(path == "/stolen" for path, _, _ in calls))
            for failure in ["status", "ack"]:
                for existing in [False, True]:
                    with self.subTest(failure=failure, existing=existing), patch.object(blocklist, "SOURCE_URL", base + "/proxy"), patch.object(blocklist, "STATUS_URL", base + "/status"):
                        self.failure = failure
                        self.redirect_status = 307
                        self.settings.update(url=blocklist.SOURCE_URL, statusUrl=blocklist.STATUS_URL)
                        self.save_settings()
                        calls.clear()
                        if existing:
                            self.path.write_text("previous working rules")
                        else:
                            self.path.unlink(missing_ok=True)
                        with self.assertRaises(HTTPError):
                            blocklist.sync()
                        if existing:
                            self.assertEqual(self.path.read_text(), "previous working rules")
                        else:
                            self.assertFalse(self.path.exists())
                        self.assertEqual([path for path, _, _ in calls],
                                         ["/proxy", "/status"] + (["/proxy/ack"] if failure == "ack" else []))
                        self.assertIsNone(calls[1][1])
                        self.assertFalse(any(path == "/stolen" for path, _, _ in calls))
        finally:
            server.shutdown()
            thread.join()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
