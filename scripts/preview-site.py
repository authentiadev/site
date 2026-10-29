#!/usr/bin/env python3
"""Serve a loopback-only preview with the static routes used by Cloudflare Pages."""

import argparse
import functools
import ipaddress
import os
import socket
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ROOTS = {"content", "scripts", "docs", "dist", "node_modules"}
HOST_METADATA = {"_redirects", "_headers"}


def exact_redirects(directory):
    """Read local exact-path redirects; wildcard/proxy rules are outside this preview."""
    redirects = {}
    try:
        lines = (directory / "_redirects").read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return redirects
    for line in lines:
        fields = line.split("#", 1)[0].split()
        if len(fields) != 3:
            continue
        source, target, status = fields
        if (not source.startswith("/") or source.startswith("//") or
                not target.startswith("/") or target.startswith("//") or
                any(character in source for character in ("*", ":", "?"))):
            continue
        if status in {"301", "302", "303", "307", "308"}:
            redirects[source] = (target, int(status))
    return redirects


class PreviewHandler(SimpleHTTPRequestHandler):
    server_version = "AuthentiaPreview/1.0"

    def __init__(self, *args, directory=None, **kwargs):
        self.root = Path(directory or ROOT).resolve()
        super().__init__(*args, directory=str(self.root), **kwargs)

    def _safe_file(self, candidate):
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(self.root)
            return resolved if resolved.is_file() else None
        except (FileNotFoundError, OSError, ValueError):
            return None

    def _redirect(self, target, query, status=HTTPStatus.PERMANENT_REDIRECT):
        if query:
            target += ("&" if "?" in target else "?") + query
        self.send_response(status)
        self.send_header("Location", target)
        self.send_header("Content-Length", "0")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return None

    def _file(self, filename, status=HTTPStatus.OK):
        try:
            handle = filename.open("rb")
        except OSError:
            return self._missing()
        info = os.fstat(handle.fileno())
        self.send_response(status)
        self.send_header("Content-Type", self.guess_type(str(filename)))
        self.send_header("Content-Length", str(info.st_size))
        self.send_header("Last-Modified", self.date_time_string(info.st_mtime))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        return handle

    def _missing(self):
        custom = self._safe_file(self.root / "404.html")
        if custom:
            return self._file(custom, HTTPStatus.NOT_FOUND)
        self.send_error(HTTPStatus.NOT_FOUND, "Page not found")
        return None

    def send_head(self):
        try:
            parsed = urlsplit(self.path)
            request_path = unquote(parsed.path, errors="strict")
        except (UnicodeDecodeError, ValueError):
            return self._missing()
        if (not request_path.startswith("/") or request_path.startswith("//") or
                "\x00" in request_path or "\\" in request_path):
            return self._missing()
        parts = request_path.strip("/").split("/")
        if (any(part in {".", ".."} or part.startswith(".") for part in parts) or
                parts[0].lower() in PRIVATE_ROOTS or parts[0].lower() in HOST_METADATA):
            return self._missing()

        redirect = exact_redirects(self.root).get(request_path)
        if redirect:
            return self._redirect(redirect[0], parsed.query, redirect[1])

        requested = self.root / request_path.lstrip("/")
        direct = self._safe_file(requested)
        if direct:
            if request_path.endswith(".html"):
                clean = request_path[:-10] if request_path.rsplit("/", 1)[-1] == "index.html" else request_path[:-5]
                return self._redirect(clean or "/", parsed.query)
            return self._file(direct)

        # Prefer a flat HTML page to a same-named directory of subpages.
        if not request_path.endswith("/"):
            html = self._safe_file(Path(str(requested) + ".html"))
            if html:
                if request_path.endswith("/index"):
                    return self._redirect(request_path[:-5] or "/", parsed.query)
                return self._file(html)

        index = self._safe_file(requested / "index.html")
        if index:
            if not request_path.endswith("/"):
                return self._redirect(request_path + "/", parsed.query)
            return self._file(index)
        return self._missing()

    def list_directory(self, path):
        # Defense in depth: this preview never provides directory listings.
        return self._missing()


def create_server(directory=ROOT, bind="127.0.0.1", port=8766):
    if bind != "localhost":
        try:
            if not ipaddress.ip_address(bind).is_loopback:
                raise ValueError("Preview binding must be a loopback address")
        except ValueError as error:
            raise ValueError("Use localhost or a loopback IP address for --bind") from error
    root = Path(directory).resolve()
    if not root.is_dir():
        raise ValueError("Preview directory must exist")
    handler = functools.partial(PreviewHandler, directory=str(root))
    server_class = ThreadingHTTPServer
    if ":" in bind:
        class IPv6Server(ThreadingHTTPServer):
            address_family = socket.AF_INET6
        server_class = IPv6Server
    return server_class((bind, port), handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--directory", type=Path, default=ROOT)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("--port must be between 0 and 65535")
    try:
        server = create_server(args.directory, args.bind, args.port)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Preview could not start: {error}\n")
    address = server.server_address
    host = f"[{address[0]}]" if ":" in address[0] else address[0]
    print(f"Serving {args.directory.resolve()} at http://{host}:{address[1]}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
