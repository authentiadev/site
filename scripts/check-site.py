#!/usr/bin/env python3
"""Check the generated static website and public downloads without network access."""

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urljoin, urlsplit
from urllib.robotparser import RobotFileParser


EXCLUDED_DIRECTORIES = {"content", "templates", "scripts", "node_modules", "dist", "docs"}
VOID_ELEMENTS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
NON_VISIBLE_ELEMENTS = {"head", "script", "style", "template"}
BLOCK_ELEMENTS = {"address", "article", "aside", "blockquote", "br", "dd", "details", "div", "dl", "dt", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "section", "summary", "table", "td", "th", "tr", "ul"}
# These schema.org classes inherit WebPage and retain the same URL/graph checks.
WEB_PAGE_TYPES = {"WebPage", "CollectionPage", "AboutPage", "ContactPage", "ItemPage", "ProfilePage"}
FORBIDDEN = re.compile(
    r"\b(?:Deloitte|Imagine\s*Canada|TradeIn|ATB\s*Financial|American\s*Eagle|"
    r"Purolator|off[\s-]*shore|staffing|Philippines|Vietnam)\b",
    re.IGNORECASE,
)


def public_path(path, root):
    parts = path.relative_to(root).parts
    return not any(part.startswith(".") or part in EXCLUDED_DIRECTORIES for part in parts[:-1])


def srcset_urls(value):
    """Read URL tokens without splitting commas inside data URLs."""
    position = 0
    while position < len(value):
        while position < len(value) and (value[position].isspace() or value[position] == ","):
            position += 1
        start = position
        while position < len(value) and not value[position].isspace():
            position += 1
        candidate = value[start:position]
        if not candidate:
            break
        if candidate.endswith(","):
            yield candidate.rstrip(",")
            continue
        yield candidate
        parentheses = 0
        while position < len(value):
            char = value[position]
            position += 1
            if char == "(":
                parentheses += 1
            elif char == ")":
                parentheses = max(0, parentheses - 1)
            elif char == "," and not parentheses:
                break


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.html_languages = []
        self.h1_count = 0
        self.titles = []
        self.descriptions = []
        self.canonicals = []
        self.refreshes = []
        self.robots = []
        self.open_graph = {}
        self.breadcrumbs = []
        self.times = []
        self.ids = set()
        self.duplicate_ids = []
        self.references = []
        self.visible = []
        self.json_blocks = []
        self.base = None
        self._suppressed = []
        self._title = None
        self._json = None
        self._breadcrumb = None
        self._breadcrumb_depth = 0
        self._breadcrumb_link = None
        self._time = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        line = self.getpos()[0]
        if tag == "html":
            self.html_languages.append(attrs.get("lang", "").strip())
        if tag == "h1":
            self.h1_count += 1
        if tag == "title":
            self._title = []
        if tag == "meta" and attrs.get("name", "").lower() == "description":
            self.descriptions.append(attrs.get("content", "").strip())
        if tag == "meta" and attrs.get("http-equiv", "").lower() == "refresh":
            self.refreshes.append((attrs.get("content", ""), line))
        if tag == "meta" and attrs.get("name", "").lower() in {"robots", "googlebot"}:
            self.robots.append((attrs.get("name", "").lower(), attrs.get("content", "").lower()))
        if tag == "meta" and attrs.get("property", "").lower().startswith("og:"):
            self.open_graph.setdefault(attrs["property"].lower(), []).append(attrs.get("content", ""))
        if tag == "meta" and (attrs.get("property", "").lower() == "og:image" or attrs.get("name", "").lower() == "twitter:image"):
            self.references.append(("social image", attrs.get("content", ""), line))
        if tag == "link" and "canonical" in attrs.get("rel", "").lower().split():
            self.canonicals.append(attrs.get("href", "").strip())
        if tag == "base" and self.base is None:
            self.base = attrs.get("href", "")
        identifier = attrs.get("id")
        if identifier is not None:
            if identifier in self.ids:
                self.duplicate_ids.append((identifier, line))
            self.ids.add(identifier)
        for attribute in ("href", "src", "poster"):
            if attribute in attrs and tag != "base":
                self.references.append((attribute, attrs[attribute] or "", line))
        if "srcset" in attrs:
            self.references.extend(("srcset", url, line) for url in srcset_urls(attrs["srcset"] or ""))
        if tag in BLOCK_ELEMENTS:
            self.visible.append(" ")
        breadcrumb_label = attrs.get("aria-label", "").strip().lower() in {"breadcrumb", "breadcrumbs"}
        breadcrumb_class = bool(set(attrs.get("class", "").split()) & {"breadcrumb", "breadcrumbs"})
        if self._breadcrumb is not None and tag not in VOID_ELEMENTS:
            self._breadcrumb_depth += 1
        elif self._breadcrumb is None and (breadcrumb_label or breadcrumb_class):
            self._breadcrumb = {"links": [], "text": [], "line": line}
            self._breadcrumb_depth = 1
        if self._breadcrumb is not None and tag == "a":
            self._breadcrumb_link = {"href": attrs.get("href", ""), "label": []}
        if tag == "time":
            self._time = {"datetime": attrs.get("datetime", ""), "text": [], "line": line}
        if not self._suppressed and tag not in NON_VISIBLE_ELEMENTS:
            for attribute in ("alt", "aria-label", "title"):
                if attrs.get(attribute):
                    self.visible.extend((" ", attrs[attribute], " "))
        if tag == "script" and attrs.get("type", "").split(";", 1)[0].strip().lower() == "application/ld+json":
            self._json = (line, [])
        if tag in NON_VISIBLE_ELEMENTS:
            self._suppressed.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_ELEMENTS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == "a" and self._breadcrumb_link is not None and self._breadcrumb is not None:
            self._breadcrumb["links"].append(self._breadcrumb_link)
            self._breadcrumb_link = None
        if self._breadcrumb is not None and tag not in VOID_ELEMENTS:
            self._breadcrumb_depth -= 1
            if self._breadcrumb_depth == 0:
                self.breadcrumbs.append(self._breadcrumb)
                self._breadcrumb = None
        if tag == "time" and self._time is not None:
            self.times.append(self._time)
            self._time = None
        if tag == "title" and self._title is not None:
            self.titles.append("".join(self._title).strip())
            self._title = None
        if tag == "script" and self._json is not None:
            line, data = self._json
            self.json_blocks.append((line, "".join(data)))
            self._json = None
        if tag in NON_VISIBLE_ELEMENTS and tag in self._suppressed:
            position = len(self._suppressed) - 1 - self._suppressed[::-1].index(tag)
            del self._suppressed[position:]
        if tag in BLOCK_ELEMENTS:
            self.visible.append(" ")

    def handle_data(self, data):
        if self._title is not None:
            self._title.append(data)
        if self._json is not None:
            self._json[1].append(data)
        if not self._suppressed:
            self.visible.append(data)
            if self._breadcrumb is not None:
                self._breadcrumb["text"].append(data)
            if self._breadcrumb_link is not None:
                self._breadcrumb_link["label"].append(data)
            if self._time is not None:
                self._time["text"].append(data)


def normal_host(host):
    return (host or "").lower().removeprefix("www.")


def compact(value):
    return " ".join(value.split())


def schema_types(node):
    value = node.get("@type", [])
    return {value} if isinstance(value, str) else {kind for kind in value if isinstance(kind, str)} if isinstance(value, list) else set()


def reference_id(value):
    return value.get("@id") if isinstance(value, dict) else None


def normalized_url(value, base):
    resolved = urlsplit(urljoin(base, value))
    path = unquote(resolved.path)
    if path.endswith("/index.html"):
        path = path[:-10]
    return resolved._replace(path=path or "/").geturl()


def public_route(relative):
    """Cloudflare Pages serves HTML at clean URLs and directory index URLs."""
    if relative == "index.html":
        return "/"
    if relative.endswith("/index.html"):
        return "/" + relative[:-10]
    return "/" + (relative[:-5] if relative.endswith(".html") else relative)


def local_target(root, url_path):
    """Resolve a public URL to a file, including Pages' implicit .html match."""
    candidate = (root / unquote(url_path).lstrip("/")).resolve()
    if not candidate.is_relative_to(root):
        return candidate
    if candidate.is_file():
        return candidate
    if candidate.is_dir() and (candidate / "index.html").is_file():
        return candidate / "index.html"
    if not url_path.endswith("/") and Path(str(candidate) + ".html").is_file():
        return Path(str(candidate) + ".html")
    return candidate


def iso_date(value):
    if not isinstance(value, str):
        raise ValueError("Expected an ISO date string")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return date.fromisoformat(value)
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def dictionaries(value):
    if isinstance(value, dict):
        yield value
        for nested in value.values():
            yield from dictionaries(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from dictionaries(nested)


def validate(root, as_of, config=None):
    errors = []
    seen_errors = set()

    def fail(path, message, line=None):
        try:
            location = str(path.relative_to(root))
        except ValueError:
            location = str(path)
        if line is not None:
            location += ":" + str(line)
        error = location + ": " + message
        if error not in seen_errors:
            errors.append(error)
            seen_errors.add(error)

    config = config or root / "content/site.json"
    try:
        site = json.loads(config.read_text(encoding="utf-8"))
        origin = site["url"].rstrip("/")
        host = normal_host(urlsplit(origin).hostname)
        if not host or urlsplit(origin).scheme not in {"http", "https"}:
            raise ValueError("site.url must be an absolute HTTP(S) URL")
    except (OSError, ValueError, KeyError, TypeError) as error:
        print("FAIL: Cannot read site origin from " + str(config) + ": " + str(error))
        return 1

    pages = {}
    for path in sorted(root.rglob("*.html")):
        if not public_path(path, root):
            continue
        page = Page(path)
        try:
            page.feed(path.read_text(encoding="utf-8"))
            page.close()
        except (OSError, UnicodeError, ValueError) as error:
            fail(path, "Cannot parse HTML: " + str(error))
            continue
        pages[path.resolve()] = page
    if not pages:
        print("FAIL: No public HTML pages found. Run node scripts/build-site.mjs first.")
        return 1

    preferred = {}
    title_owners = {}
    description_owners = {}
    shared_schema_ids = {}
    modified_dates = {}

    def check_graph(path, page, relative, canonical, parsed_blocks):
        if len(parsed_blocks) != 1 or not isinstance(parsed_blocks[0], dict) or not isinstance(parsed_blocks[0].get("@graph"), list):
            fail(path, "Expected exactly one JSON-LD document containing an @graph array")
            return
        document = parsed_blocks[0]
        if document.get("@context") not in ("https://schema.org", "https://schema.org/"):
            fail(path, "Structured graph must declare the schema.org context")
        nodes = document["@graph"]
        if not all(isinstance(node, dict) for node in nodes):
            fail(path, "Every structured graph node must be an object")
            return
        nodes_by_id = {}
        for node in nodes:
            identifier = node.get("@id")
            if not isinstance(identifier, str) or not identifier:
                fail(path, "Structured graph node has no stable @id")
                continue
            try:
                identity_url = urlsplit(identifier)
                if identity_url.scheme != "https" or not identity_url.hostname:
                    fail(path, "Structured graph @id must be an absolute HTTPS URL: " + identifier)
            except ValueError:
                fail(path, "Invalid structured graph @id: " + identifier)
            if identifier in nodes_by_id:
                fail(path, "Duplicate structured graph @id: " + identifier)
            nodes_by_id[identifier] = node

        single = {}
        for kind in ("Organization", "WebSite", "WebPage"):
            matches = [node for node in nodes if (schema_types(node) & WEB_PAGE_TYPES if kind == "WebPage" else kind in schema_types(node))]
            if len(matches) != 1:
                fail(path, "Expected exactly one " + kind + " node in the graph")
                continue
            single[kind] = matches[0]
            if kind in {"Organization", "WebSite"}:
                identifier = matches[0].get("@id")
                previous = shared_schema_ids.setdefault(kind, identifier)
                if identifier != previous:
                    fail(path, kind + " @id differs from the other canonical pages")
        organization = single.get("Organization", {})
        website = single.get("WebSite", {})
        webpage = single.get("WebPage", {})
        if organization and (organization.get("name") != site["name"] or not organization.get("url") or normalized_url(organization.get("url", ""), origin) != origin + "/"):
            fail(path, "Organization name and URL must identify the configured company")
        if website and (website.get("name") != site["name"] or not website.get("url") or normalized_url(website.get("url", ""), origin) != origin + "/"):
            fail(path, "WebSite name and URL must identify the canonical home page")
        if webpage and webpage.get("url") != canonical:
            fail(path, "WebPage.url must match the canonical URL")
        if webpage and reference_id(webpage.get("isPartOf")) != website.get("@id"):
            fail(path, "WebPage.isPartOf must reference the WebSite node")

        for node in dictionaries(document):
            kinds = schema_types(node)
            if kinds & {"FAQPage", "QAPage"}:
                fail(path, "FAQ/Q&A rich-result markup is inappropriate for this consultancy site")
            if "BreadcrumbList" in kinds and (not isinstance(node.get("itemListElement"), list) or len(node["itemListElement"]) < 2):
                fail(path, "BreadcrumbList needs at least two ListItems for Google Search")
            for key in ("datePublished", "dateModified"):
                if key in node:
                    try:
                        stamp = iso_date(node[key])
                        if stamp > as_of:
                            fail(path, key + " is in the future: " + node[key])
                        if key == "dateModified" and kinds & (WEB_PAGE_TYPES | {"Article", "BlogPosting"}):
                            previous = modified_dates.setdefault(path, stamp)
                            if stamp != previous:
                                fail(path, "WebPage and Article modification dates disagree")
                    except ValueError as error:
                        fail(path, "Invalid " + key + ": " + str(error))
            if node.get("datePublished") and node.get("dateModified"):
                try:
                    if iso_date(node["datePublished"]) > iso_date(node["dateModified"]):
                        fail(path, "dateModified predates datePublished")
                except ValueError:
                    pass
            commerce = kinds & {"Offer", "AggregateOffer"} or set(node) & {"offers", "price", "lowPrice", "highPrice", "priceCurrency", "priceSpecification"}
            product = site.get("products", {}).get(Path(relative).stem, {})
            if commerce and not product.get("checkoutUrl"):
                fail(path, "Offers or price markup published without a configured checkout")

        article_nodes = [node for node in nodes if schema_types(node) & {"Article", "BlogPosting"}]
        if relative.startswith("insights/") and len(article_nodes) != 1:
            fail(path, "Insight page must contain exactly one Article or BlogPosting node")
        text = compact("".join(page.visible))
        for article in article_nodes:
            for field in ("author", "publisher"):
                values = article.get(field)
                values = values if isinstance(values, list) else [values]
                if not values:
                    fail(path, "Article." + field + " is missing")
                for value in values:
                    linked = nodes_by_id.get(reference_id(value))
                    if linked is None or "Organization" not in schema_types(linked):
                        fail(path, "Article." + field + " must reference the existing Organization @id")
            name = organization.get("name", "")
            if name and not re.search(r"\bby\s*:?\s+" + re.escape(name) + r"\b", text, re.I):
                fail(path, "Article has no visible author byline matching its Organization author")
            entity = article.get("mainEntityOfPage")
            if reference_id(entity) != webpage.get("@id") and entity not in (canonical, webpage.get("@id")):
                fail(path, "Article.mainEntityOfPage must identify this WebPage")
            for field in ("dateModified", "datePublished"):
                if field not in article:
                    continue
                try:
                    stamp = iso_date(article[field])
                    matching_times = [item for item in page.times if item["datetime"] and iso_date(item["datetime"]) == stamp and compact("".join(item["text"]))]
                    if not matching_times:
                        fail(path, "Article." + field + " has no matching visible <time datetime> date")
                except ValueError as error:
                    fail(path, "Invalid visible article date: " + str(error))

        if relative == "index.html":
            if any("BreadcrumbList" in schema_types(node) for node in nodes) and not page.breadcrumbs:
                fail(path, "Homepage graph advertises a breadcrumb trail that is not visible")
            return
        trails = [node for node in nodes if "BreadcrumbList" in schema_types(node)]
        if len(trails) != 1:
            fail(path, "Expected exactly one BreadcrumbList on a non-home canonical page")
            return
        if len(page.breadcrumbs) != 1:
            fail(path, "Expected one visible breadcrumb navigation matching the graph")
            return
        trail = trails[0]
        if webpage and reference_id(webpage.get("breadcrumb")) != trail.get("@id"):
            fail(path, "WebPage.breadcrumb must reference the BreadcrumbList node")
        items = trail.get("itemListElement")
        if not isinstance(items, list) or len(items) < 2 or not all(isinstance(item, dict) for item in items):
            fail(path, "BreadcrumbList must contain an ordered trail of at least two ListItems")
            return
        visible = page.breadcrumbs[0]
        visible_text = compact(" ".join(visible["text"]))
        actual_urls = [normalized_url(link["href"], canonical) for link in visible["links"]]
        expected_urls = []
        expected_labels = []
        for position, item in enumerate(items, 1):
            if "ListItem" not in schema_types(item) or item.get("position") != position:
                fail(path, "Breadcrumb ListItem positions must follow visible order from 1")
            name = item.get("name", "")
            if not isinstance(name, str) or not name.strip() or compact(name) not in visible_text:
                fail(path, "Breadcrumb name is missing from visible navigation: " + repr(name))
            item_url = item.get("item")
            item_url = item_url.get("@id") if isinstance(item_url, dict) else item_url
            if not item_url and position != len(items):
                fail(path, "Non-final breadcrumb item has no URL")
            if item_url:
                if not isinstance(item_url, str) or not item_url.startswith("https://"):
                    fail(path, "Breadcrumb item URL must be absolute HTTPS")
                    continue
                resolved = normalized_url(item_url, canonical)
                if position == len(items) and resolved != normalized_url(canonical, canonical):
                    fail(path, "Final breadcrumb URL must identify the current canonical page")
                if position != len(items) or resolved in actual_urls:
                    expected_urls.append(resolved)
                    expected_labels.append(compact(name))
        if actual_urls != expected_urls:
            fail(path, "Breadcrumb graph URLs do not match the visible links in order")
        actual_labels = [compact("".join(link["label"])) for link in visible["links"]]
        if actual_labels != expected_labels:
            fail(path, "Breadcrumb graph names do not match the visible linked labels in order")

    reference_count = 0
    guide_count = 0
    for path, page in pages.items():
        relative = path.relative_to(root).as_posix()
        document_url = origin + public_route(relative)
        base_url = urljoin(document_url, page.base) if page.base is not None else document_url
        expected_canonical = origin + public_route(relative)
        if page.refreshes:
            if len(page.refreshes) != 1:
                fail(path, "Expected at most one meta-refresh redirect")
            else:
                refresh, line = page.refreshes[0]
                match = re.fullmatch(r"\s*0\s*;\s*url\s*=\s*(.+?)\s*", refresh, re.I)
                if match is None:
                    fail(path, "Expected an immediate meta-refresh with a URL target", line)
                else:
                    destination = match.group(1)
                    if len(destination) > 1 and destination[0] in "\"'" and destination[-1] == destination[0]:
                        destination = destination[1:-1]
                    try:
                        redirect_url = urlsplit(urljoin(base_url, destination))
                        target = local_target(root, redirect_url.path)
                        if redirect_url.scheme not in {"http", "https"} or normal_host(redirect_url.hostname) != host:
                            fail(path, "Meta-refresh must target a local HTTP(S) URL", line)
                        elif not target.is_relative_to(root) or not target.is_file():
                            fail(path, "Meta-refresh target does not exist locally: " + destination, line)
                        elif target == path:
                            fail(path, "Meta-refresh redirects to the same page", line)
                        else:
                            expected_canonical = redirect_url.geturl()
                            page.references.append(("meta refresh", destination, line))
                    except ValueError as error:
                        fail(path, "Invalid meta-refresh URL: " + str(error), line)
        standalone_guide = relative.startswith("downloads/")
        canonical_page = not standalone_guide and not page.refreshes and relative != "404.html"
        guide_count += int(standalone_guide)
        if not standalone_guide:
            if len(page.html_languages) != 1 or not page.html_languages[0]:
                fail(path, "Expected one <html> element with a non-empty lang attribute")
            if page.h1_count != 1:
                fail(path, "Expected exactly one H1; found " + str(page.h1_count))
            required_metadata = [("title", page.titles), ("meta description", page.descriptions)]
            if relative != "404.html":
                required_metadata.append(("canonical", page.canonicals))
            for label, values in required_metadata:
                if len(values) != 1 or not values[0]:
                    fail(path, "Expected exactly one non-empty " + label)
            if len(page.canonicals) == 1 and page.canonicals[0]:
                if page.canonicals[0] != expected_canonical:
                    fail(path, "Canonical does not match this page: " + page.canonicals[0])
                canonical_url = urlsplit(page.canonicals[0])
                if canonical_url.scheme != "https" or not canonical_url.hostname or canonical_url.query or canonical_url.fragment:
                    fail(path, "Canonical must be an absolute HTTPS URL without query or fragment")
        robot_rules = {rule for _, value in page.robots for rule in re.split(r"[\s,]+", value) if rule}
        if relative == "404.html" and "noindex" not in robot_rules:
            fail(path, "404 fallback page must declare noindex")
        if standalone_guide:
            generic_rules = {rule for agent, value in page.robots if agent == "robots" for rule in re.split(r"[\s,]+", value) if rule}
            if "noindex" not in generic_rules or {"nofollow", "none", "index"} & robot_rules:
                fail(path, "Standalone printable guide/sample must declare noindex and permit following links")
        if canonical_page:
            if {"noindex", "none"} & robot_rules:
                fail(path, "Preferred canonical page is blocked from indexing")
            preferred[expected_canonical] = path
            for label, values, owners in (("title", page.titles, title_owners), ("meta description", page.descriptions, description_owners)):
                if len(values) == 1 and values[0]:
                    normalized = compact(values[0]).casefold()
                    other = owners.setdefault(normalized, path)
                    if other != path:
                        fail(path, "Duplicate preferred-page " + label + " also used by " + str(other.relative_to(root)))
            expected_properties = {"og:url": expected_canonical, "og:title": page.titles[0] if len(page.titles) == 1 else None, "og:description": page.descriptions[0] if len(page.descriptions) == 1 else None}
            for key, expected in expected_properties.items():
                values = page.open_graph.get(key, [])
                if len(values) != 1 or not values[0] or (expected is not None and values[0] != expected):
                    fail(path, key + " must appear once and match the canonical page metadata")
            for key in ("og:type", "og:image"):
                values = page.open_graph.get(key, [])
                if len(values) != 1 or not values[0]:
                    fail(path, "Expected one non-empty " + key)
            for image in page.open_graph.get("og:image", []):
                image_url = urlsplit(image)
                if image_url.scheme != "https" or not image_url.hostname:
                    fail(path, "Open Graph image must be an absolute HTTPS URL")
        for identifier, line in page.duplicate_ids:
            fail(path, "Duplicate ID " + repr(identifier), line)
        for item in page.times:
            try:
                if iso_date(item["datetime"]) > as_of:
                    fail(path, "Visible datetime is in the future: " + item["datetime"], item["line"])
                if not compact("".join(item["text"])):
                    fail(path, "Time element has no visible date text", item["line"])
            except ValueError as error:
                fail(path, "Invalid visible datetime: " + str(error), item["line"])
        parsed_blocks = []
        for line, data in page.json_blocks:
            try:
                parsed = json.loads(data)
                if not isinstance(parsed, (dict, list)):
                    raise ValueError("JSON-LD must be an object or array")
                parsed_blocks.append(parsed)
            except ValueError as error:
                fail(path, "Invalid structured JSON: " + str(error), line)
        if canonical_page:
            check_graph(path, page, relative, expected_canonical, parsed_blocks)
        text = "".join(page.visible)
        # The owner confirmed consent for the original named homepage testimonials.
        # Keep this exception tied to Sara's exact attribution; cases remain anonymous.
        if relative == "index.html":
            text = re.sub(r"\bSara J\.\s+Vice President • Purolator Inc\.",
                          "Sara J. Vice President • [consented testimonial company]", text, count=1)
        for term in sorted({match.group() for match in FORBIDDEN.finditer(text)}, key=str.lower):
            fail(path, "Prohibited wording in visible content: " + repr(term))

        for attribute, value, line in page.references:
            reference_count += 1
            if not value.strip():
                fail(path, "Empty " + attribute + " reference", line)
                continue
            try:
                absolute = urlsplit(urljoin(base_url, value.strip()))
                if absolute.scheme not in {"http", "https"} or normal_host(absolute.hostname) != host:
                    continue
                target = local_target(root, absolute.path)
                if not target.is_relative_to(root):
                    fail(path, "Local reference escapes the website: " + value, line)
                    continue
                if not target.is_file():
                    fail(path, "Missing local " + attribute + " target: " + value, line)
                    continue
                if attribute == "href" and target.suffix.lower() in {".html", ".htm"} and absolute.path.endswith(".html"):
                    fail(path, "Internal HTML link should use its clean Pages URL: " + value, line)
                fragment = unquote(absolute.fragment).split(":~:", 1)[0]
                if fragment and target.suffix.lower() in {".html", ".htm"}:
                    target_page = pages.get(target)
                    if target_page is None:
                        fail(path, "Anchor targets HTML outside the checked public pages: " + value, line)
                    elif fragment not in target_page.ids:
                        fail(path, "Missing local anchor: " + value, line)
            except ValueError as error:
                fail(path, "Invalid URL " + repr(value) + ": " + str(error), line)

    sitemap = root / "sitemap.xml"
    try:
        namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        tree = ET.fromstring(sitemap.read_text(encoding="utf-8"))
        if tree.tag != "{" + namespace["s"] + "}urlset":
            fail(sitemap, "Expected a sitemap urlset in the standard namespace")
        listed = set()
        for record in tree.findall("s:url", namespace):
            locations = record.findall("s:loc", namespace)
            if len(locations) != 1 or not locations[0].text:
                fail(sitemap, "Each sitemap entry needs one non-empty loc")
                continue
            location = locations[0].text.strip()
            parsed = urlsplit(location)
            if parsed.scheme != "https" or not parsed.hostname or parsed.query or parsed.fragment:
                fail(sitemap, "Sitemap loc must be an absolute HTTPS canonical URL: " + location)
            if location in listed:
                fail(sitemap, "Duplicate sitemap URL: " + location)
            listed.add(location)
            if location not in preferred:
                fail(sitemap, "Sitemap includes a non-preferred, redirect, guide or 404 URL: " + location)
            stamps = record.findall("s:lastmod", namespace)
            if len(stamps) > 1:
                fail(sitemap, "Multiple lastmod values for " + location)
            for value in stamps:
                try:
                    stamp = iso_date((value.text or "").strip())
                    if stamp > as_of:
                        fail(sitemap, "Future lastmod date for " + location)
                    expected = modified_dates.get(preferred.get(location))
                    if expected is not None and stamp != expected:
                        fail(sitemap, "lastmod disagrees with the page modification date: " + location)
                except ValueError as error:
                    fail(sitemap, "Invalid lastmod for " + location + ": " + str(error))
        for missing in sorted(set(preferred) - listed):
            fail(sitemap, "Preferred page missing from sitemap: " + missing)
    except (OSError, ET.ParseError, ValueError) as error:
        fail(sitemap, "Cannot validate sitemap: " + str(error))

    robots_path = root / "robots.txt"
    try:
        robots_text = robots_path.read_text(encoding="utf-8")
        groups = []
        group = {"agents": [], "rules": []}
        sitemap_declarations = []
        for raw_line in robots_text.splitlines():
            statement = raw_line.split("#", 1)[0].strip()
            if not statement or ":" not in statement:
                continue
            field, value = (part.strip() for part in statement.split(":", 1))
            field = field.lower()
            if field == "user-agent":
                if group["rules"]:
                    groups.append(group)
                    group = {"agents": [], "rules": []}
                group["agents"].append(value.lower())
            elif field in {"allow", "disallow"}:
                group["rules"].append((field, value))
            elif field == "sitemap":
                sitemap_declarations.append(value)
        if group["agents"]:
            groups.append(group)
        wildcard = {rule for group in groups if "*" in group["agents"] for rule in group["rules"]}
        if ("allow", "/") not in wildcard or not {("disallow", "/content/"), ("disallow", "/scripts/")} <= wildcard:
            fail(robots_path, "Wildcard crawler policy must allow the site and exclude content/ and scripts/")
        for group in groups:
            if any(agent != "*" for agent in group["agents"]) and set(group["rules"]) != wildcard:
                fail(robots_path, "Specific crawler group must repeat the wildcard exclusions and permissions: " + ", ".join(group["agents"]))
        if sitemap_declarations != [origin + "/sitemap.xml"]:
            fail(robots_path, "Sitemap declaration must identify the canonical sitemap once")
        robots = RobotFileParser()
        robots.parse(robots_text.splitlines())
        agents = {"Googlebot", "*"} | {agent for group in groups for agent in group["agents"]}
        for path, page in pages.items():
            relative = path.relative_to(root).as_posix()
            if relative == "404.html" or page.refreshes:
                continue
            location = origin + public_route(relative)
            for agent in agents:
                if not robots.can_fetch(agent, location):
                    fail(robots_path, "Crawler " + agent + " cannot access public page/noindex guide: " + relative)
    except OSError as error:
        fail(robots_path, "Cannot validate crawler rules: " + str(error))

    redirects_path = root / "_redirects"
    try:
        redirect_rules = {}
        for line, raw in enumerate(redirects_path.read_text(encoding="utf-8").splitlines(), 1):
            statement = raw.split("#", 1)[0].strip()
            if not statement:
                continue
            fields = statement.split()
            if len(fields) != 3 or fields[2] not in {"301", "308"}:
                fail(redirects_path, "Expected an explicit permanent source/target/status redirect", line)
                continue
            source, destination, _ = fields
            if not source.startswith("/") or not destination.startswith("/"):
                fail(redirects_path, "Static redirect aliases must remain local", line)
                continue
            if source in redirect_rules:
                fail(redirects_path, "Duplicate redirect alias: " + source, line)
            redirect_rules[source] = destination
            target_url = urlsplit(destination)
            target = local_target(root, target_url.path)
            if not target.is_relative_to(root) or not target.is_file():
                fail(redirects_path, "Redirect destination does not exist: " + destination, line)
            if source == destination or target_url.path.endswith(".html"):
                fail(redirects_path, "Redirect alias must target a different clean URL", line)
            if local_target(root, source).is_file():
                fail(redirects_path, "Redirect alias conflicts with an existing public file: " + source, line)
        for slug in ("contact", "case-studies", "privacy", "terms"):
            if redirect_rules.get("/" + slug + "/") != "/" + slug:
                fail(redirects_path, "Missing clean trailing-slash alias for /" + slug + "/")
        for source in redirect_rules:
            visited = set()
            current = source
            while current in redirect_rules:
                if current in visited:
                    fail(redirects_path, "Redirect cycle involving " + source)
                    break
                visited.add(current)
                current = redirect_rules[current]
    except OSError as error:
        fail(redirects_path, "Cannot validate legacy clean-route aliases: " + str(error))

    allowed_archives = set()
    resource_manifest = config.parent / "resources.json"
    if resource_manifest.exists():
        try:
            resources = json.loads(resource_manifest.read_text(encoding="utf-8"))
            if not isinstance(resources, list):
                raise ValueError("Expected a resource array")
            for resource in resources:
                resource_url = origin + "/resources/" + resource["slug"] + ".html"
                paid = str(resource.get("kind", "")).lower() == "paid"
                if paid and resource.get("download"):
                    fail(resource_manifest, "Paid resource exposes a full download: " + resource["slug"])
                for field in ("download", "sample"):
                    value = resource.get(field)
                    if not value:
                        continue
                    destination = urlsplit(urljoin(resource_url, value))
                    if normal_host(destination.hostname) != host:
                        continue
                    local_file = (root / unquote(destination.path).lstrip("/")).resolve()
                    if local_file.suffix.lower() != ".zip":
                        continue
                    if not local_file.is_relative_to(root):
                        fail(resource_manifest, "Resource archive escapes the website: " + value)
                        continue
                    relative = local_file.relative_to(root)
                    free_download = not paid and field == "download" and relative.parts[:2] == ("downloads", "free")
                    sample_download = field == "sample" and relative.parts[:2] == ("downloads", "samples") and re.search(r"(?:^|[-_])sample(?:[-_.]|$)", local_file.name, re.I)
                    if free_download or sample_download:
                        allowed_archives.add(local_file)
        except (OSError, ValueError, KeyError, TypeError) as error:
            fail(resource_manifest, "Cannot validate public resource archives: " + str(error))

    archives = sorted(path for path in root.rglob("*.zip") if public_path(path, root))
    for archive in archives:
        if archive.resolve() not in allowed_archives:
            fail(archive, "Unexpected public ZIP; only declared free downloads or paid samples may be published, and full paid packs must stay outside the website")
        try:
            with zipfile.ZipFile(archive) as package:
                if not package.infolist():
                    fail(archive, "Empty download archive")
                names = set()
                for member in package.infolist():
                    name = member.filename.replace("\\", "/")
                    member_path = PurePosixPath(name)
                    if member_path.is_absolute() or ".." in member_path.parts or (member_path.parts and ":" in member_path.parts[0]):
                        fail(archive, "Unsafe archive member path: " + member.filename)
                    if member.filename in names:
                        fail(archive, "Duplicate archive member: " + member.filename)
                    names.add(member.filename)
                damaged = package.testzip()
                if damaged is not None:
                    fail(archive, "ZIP CRC failure: " + damaged)
        except (OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as error:
            fail(archive, "Unreadable download archive: " + str(error))

    summary = f"{len(pages)} public HTML pages ({guide_count} standalone guides), {reference_count} references, {len(archives)} ZIP archives"
    if errors:
        for error in errors:
            print("FAIL " + error)
        print(f"FAILED: {len(errors)} issues across {summary}.")
        return 1
    print("PASS: " + summary + ".")
    print("Local assets, anchors, SEO metadata, linked structured graphs, breadcrumbs, indexing rules, sitemap, public wording and ZIP integrity checked; no network requests made.")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent, help="Website root (defaults to this repository)")
    parser.add_argument("--config", type=Path, help="Site configuration outside the public output; resources.json is read from the same directory")
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today(), help="Latest permitted content date, YYYY-MM-DD (defaults to today)")
    arguments = parser.parse_args()
    return validate(arguments.root.resolve(), arguments.as_of, arguments.config.resolve() if arguments.config else None)


if __name__ == "__main__":
    sys.exit(main())
