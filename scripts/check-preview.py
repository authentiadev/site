#!/usr/bin/env python3
"""Exercise the preview over loopback HTTP using temporary public files only."""

import http.client
import importlib.util
import sys
import tempfile
import threading
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("preview-site.py")
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("authentia_preview", SCRIPT)
PREVIEW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREVIEW)


class PreviewRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="authentia-preview-test-")
        cls.directory = Path(cls.temporary.name) / "public"
        cls.directory.mkdir()
        files = {
            "index.html": "<!doctype html><title>Home</title><p>HOME</p>",
            "404.html": "<!doctype html><title>Missing</title><p>CUSTOM MISSING</p>",
            "services.html": "<!doctype html><title>Services</title><p>FLAT SERVICES</p>",
            "services/ai-strategy.html": "<!doctype html><p>STRATEGY</p>",
            "contact.html": "<!doctype html><p>CONTACT</p>",
            "case-studies.html": "<!doctype html><p>CASES</p>",
            "privacy.html": "<!doctype html><p>PRIVACY</p>",
            "terms.html": "<!doctype html><p>TERMS</p>",
            "guide/index.html": "<!doctype html><p>GUIDE INDEX</p>",
            "notindex.html": "<!doctype html><p>ORDINARY FILENAME</p>",
            "downloads/samples/example-sample.html": "<!doctype html><p>SAMPLE</p>",
            "css/site.css": "body { color: black; }",
            "docs/private.txt": "NOT PUBLIC",
            ".DS_Store": "HIDDEN",
            "_redirects": "/contact/ /contact 301\n/case-studies/ /case-studies 301\n/privacy/ /privacy 301\n/terms/ /terms 301\n",
        }
        for name, contents in files.items():
            filename = cls.directory / name
            filename.parent.mkdir(parents=True, exist_ok=True)
            filename.write_text(contents, encoding="utf-8")
        (cls.directory / "empty").mkdir()
        outside = Path(cls.temporary.name) / "private.txt"
        outside.write_text("OUTSIDE ROOT", encoding="utf-8")
        (cls.directory / "leak.txt").symlink_to(outside)
        PREVIEW.PreviewHandler.log_message = lambda *args: None
        cls.server = PREVIEW.create_server(cls.directory, "127.0.0.1", 0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join(timeout=5)
        cls.server.server_close()
        cls.temporary.cleanup()

    def fetch(self, target, method="GET"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
        try:
            connection.request(method, target)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_clean_flat_page_precedes_same_named_subpage_directory(self):
        status, headers, body = self.fetch("/services")
        self.assertEqual(status, 200)
        self.assertNotIn("Location", headers)
        self.assertIn(b"FLAT SERVICES", body)
        self.assertIn(b"STRATEGY", self.fetch("/services/ai-strategy")[2])

    def test_html_aliases_redirect_to_clean_routes_and_preserve_query(self):
        for requested, destination in [
            ("/services.html", "/services"),
            ("/services/ai-strategy.html", "/services/ai-strategy"),
            ("/index.html", "/"),
            ("/guide/index.html", "/guide/"),
            ("/guide/index", "/guide/"),
            ("/notindex.html", "/notindex"),
        ]:
            with self.subTest(requested=requested):
                status, headers, body = self.fetch(requested + "?source=preview")
                self.assertEqual(status, 308)
                self.assertEqual(headers["Location"], destination + "?source=preview")
                self.assertEqual(body, b"")

    def test_exact_generated_trailing_slash_redirects(self):
        for name in ["contact", "case-studies", "privacy", "terms"]:
            with self.subTest(name=name):
                status, headers, _ = self.fetch(f"/{name}/?keep=1")
                self.assertEqual(status, 301)
                self.assertEqual(headers["Location"], f"/{name}?keep=1")

    def test_home_and_real_directory_index(self):
        self.assertIn(b"HOME", self.fetch("/")[2])
        status, headers, _ = self.fetch("/guide")
        self.assertEqual(status, 308)
        self.assertEqual(headers["Location"], "/guide/")
        self.assertIn(b"GUIDE INDEX", self.fetch("/guide/")[2])

    def test_clean_download_sample_and_its_html_alias(self):
        self.assertIn(b"SAMPLE", self.fetch("/downloads/samples/example-sample")[2])
        status, headers, _ = self.fetch("/downloads/samples/example-sample.html")
        self.assertEqual(status, 308)
        self.assertEqual(headers["Location"], "/downloads/samples/example-sample")

    def test_custom_missing_page_has_real_404_status(self):
        for target in ["/missing", "/missing.html", "/empty/", "/css/"]:
            with self.subTest(target=target):
                status, headers, body = self.fetch(target)
                self.assertEqual(status, 404)
                self.assertIn("text/html", headers["Content-Type"])
                self.assertIn(b"CUSTOM MISSING", body)
                self.assertNotIn(b"Directory listing", body)

    def test_head_and_asset_mime(self):
        status, headers, body = self.fetch("/services", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertEqual(int(headers["Content-Length"]), len((self.directory / "services.html").read_bytes()))
        self.assertIn("text/css", self.fetch("/css/site.css")[1]["Content-Type"])
        self.assertEqual(self.fetch("/missing", "HEAD")[0], 404)

    def test_private_paths_traversal_and_outside_symlink_are_not_served(self):
        for target in ["/docs/private.txt", "/DOCS/private.txt", "/.DS_Store", "/_redirects", "/%2e%2e/private.txt", "/leak.txt", "/services/%2e%2e/contact"]:
            with self.subTest(target=target):
                status, _, body = self.fetch(target)
                self.assertEqual(status, 404)
                self.assertNotIn(b"OUTSIDE ROOT", body)
                self.assertNotIn(b"NOT PUBLIC", body)

    def test_non_loopback_binding_is_rejected(self):
        with self.assertRaises(ValueError):
            PREVIEW.create_server(self.directory, "0.0.0.0", 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
