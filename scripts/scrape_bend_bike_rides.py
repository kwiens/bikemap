#!/usr/bin/env python3
"""Scrape trail metadata from bendbikerides.com.

Every /trail/<slug> page embeds the complete trail record in its server-rendered
RSC payload. We pull the slug list from sitemap.xml, fetch each trail page, parse
the embedded data object, and emit a CSV (one row per trail) plus a JSONL backup
that also keeps the encoded path geometry.

This is reference data only: we use Bend Bike Rides' curated trail list to inform
our own, not to copy their content.

Usage:
    python scripts/scrape_bend_bike_rides.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SITEMAP = "https://bendbikerides.com/sitemap.xml"
BASE = "https://bendbikerides.com"
UA = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"
OUT_DIR = Path(__file__).resolve().parent.parent / "data"
CSV_PATH = OUT_DIR / "bend-bike-rides.csv"
JSONL_PATH = OUT_DIR / "bend-bike-rides.jsonl"

M_TO_MI = 1 / 1609.344
M_TO_FT = 3.280839895


def get(url: str) -> str:
    req = Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def slugs_from_sitemap() -> list[str]:
    xml = get(SITEMAP)
    return [m for m in re.findall(r"<loc>https://bendbikerides\.com/trail/([^<]+)</loc>", xml)]


def _jstr(s: str) -> str:
    """Decode a captured JSON string body (escapes like \\u2019, \\" intact).

    The page payload is JSON-ish, so apostrophes/accents arrive as \\uXXXX
    escapes. Wrapping in quotes and json.loads restores them; a raw UTF-8 body
    decodes unchanged. Falls back to the raw capture rather than raising (a
    trailing backslash or bad escape must not masquerade as a fetch failure)."""
    try:
        return json.loads(f'"{s}"')
    except Exception:  # noqa: BLE001
        return s


def _bool_array(raw: str):
    """Turn a `[!0,!1]` style RSC bool array into a single value.

    True if every entry is one-way, False if every entry is two-way, 'mixed' for
    a blend, '' when the array is empty (unknown)."""
    vals = re.findall(r"!0|!1|true|false", raw)
    if not vals:
        return ""
    flags = [v in ("!0", "true") for v in vals]
    if all(flags):
        return True
    if not any(flags):
        return False
    return "mixed"


def parse(html: str, slug: str) -> dict | None:
    # Anchor the start on this trail's record header, then take the object up to
    # its real terminator `}});`. (Anchoring the *end* on areaClosures breaks for
    # trails with a populated closure, whose nested `]` defeats a simple charclass.)
    m = re.search(r'name:"((?:[^"\\]|\\.)*)",slug:"' + re.escape(slug) + r'",type:"trail",', html)
    if not m:
        return None
    end = html.find("}});", m.end())
    if end == -1:
        return None
    name = _jstr(m.group(1))
    blob = html[m.start():end + 3]

    def find(pat, cast=str, default=None):
        mm = re.search(pat, blob)
        if not mm:
            return default
        try:
            return cast(mm.group(1))
        except (ValueError, TypeError):
            return default

    difficulty = ",".join(re.findall(r'"([^"]+)"', find(r'difficulty:\$R\[\d+\]=\[([^\]]*)\]', str, "") or ""))
    one_way = _bool_array(find(r'oneWay:\$R\[\d+\]=\[([^\]]*)\]', str, "") or "")
    ebike = find(r'ebikeOkay:(!1|!0|true|false)') in ("!0", "true")
    closed = find(r'closed:(!1|!0|true|false)') in ("!0", "true")

    cm = re.search(r'complex:\$R\[\d+\]=\{name:"((?:[^"\\]|\\.)*)",slug:"([^"]+)"\}', blob)
    pois_blob = re.search(r'pois:\$R\[\d+\]=\[(.*?)\],areaClosures', blob, re.S)
    pois = [_jstr(p) for p in
            re.findall(r'\{name:"((?:[^"\\]|\\.)*)",slug:"[^"]+"\}', pois_blob.group(1) if pois_blob else "")]
    closure_blob = re.search(r'areaClosures:\$R\[\d+\]=\[(.*)$', blob, re.S)
    closures = [_jstr(c) for c in
                re.findall(r'name:"((?:[^"\\]|\\.)*)"', closure_blob.group(1) if closure_blob else "")]
    fp = re.search(r'flagPoint:\$R\[\d+\]=\[([-\d.]+),([-\d.]+)\]', blob)
    pm = re.search(r'path:\$R\[\d+\]=\[([^\]]*)\]', blob)

    # Pull all elevation stats from inside the single elevation object, so
    # avg/gain/loss are anchored to it (not the first match anywhere in the
    # blob) and negative values (below sea level) parse.
    elev_m = re.search(r'elevation:\$R\[\d+\]=\{([^}]*)\}', blob)
    elev_blob = elev_m.group(1) if elev_m else ""

    def elev(key: str):
        mm = re.search(rf'(?<![A-Za-z]){key}:(-?[\d.]+)', elev_blob)
        if not mm:
            return None
        try:
            return float(mm.group(1))
        except ValueError:
            return None

    return {
        "slug": slug,
        "name": name,
        "url": f"{BASE}/trail/{slug}",
        "difficulty": difficulty,
        "one_way": one_way,
        "ebike_ok": ebike,
        "closed": closed,
        "segments": find(r'segmentCount:(\d+)', int),
        "distance_m": find(r'(?<![A-Za-z])distance:(-?[\d.]+)', float),
        "elev_min_m": elev("min"),
        "elev_max_m": elev("max"),
        "elev_avg_m": elev("avg"),
        "elev_gain_m": elev("gain"),
        "elev_loss_m": elev("loss"),
        "complex": _jstr(cm.group(1)) if cm else None,
        "complex_slug": cm.group(2) if cm else None,
        "closure": ";".join(closures),
        "pois": ";".join(pois),
        "flag_lat": float(fp.group(2)) if fp else None,
        "flag_lng": float(fp.group(1)) if fp else None,
        "path": ",".join(re.findall(r'"([^"]+)"', pm.group(1))) if pm else None,
    }


def fetch_one(slug: str) -> dict | None:
    # The site occasionally serves a soft-404 SSR shell (cold cache) with no data
    # object; a short delay warms it. Retry *network* failures and empty shells,
    # but let a parse exception propagate — a deterministic parser bug must surface
    # loudly, not hide behind 5 "flaky fetch" retries.
    last = "no-data-object"
    for attempt in range(5):
        try:
            html = get(f"{BASE}/trail/{slug}")
        except (URLError, HTTPError, TimeoutError, ConnectionError, OSError) as e:
            last = f"net: {e}"
            time.sleep(2.0 * (attempt + 1))
            continue
        rec = parse(html, slug)
        if rec:
            return rec
        last = "no-data-object"
        time.sleep(2.0 * (attempt + 1))
    return {"slug": slug, "name": None, "url": f"{BASE}/trail/{slug}", "_error": last}


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    slugs = slugs_from_sitemap()
    print(f"{len(slugs)} trail slugs from sitemap", file=sys.stderr)

    records: list[dict] = []
    done = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fetch_one, s): s for s in slugs}
        for fut in as_completed(futs):
            rec = fut.result()
            if rec:
                records.append(rec)
            done += 1
            if done % 25 == 0:
                print(f"  {done}/{len(slugs)}", file=sys.stderr)

    errs = [r for r in records if r.get("_error")]
    records = [r for r in records if not r.get("_error")]
    records.sort(key=lambda r: r["slug"])

    csv_cols = [
        "slug", "name", "url", "complex", "difficulty", "one_way", "ebike_ok",
        "closed", "segments", "distance_m", "distance_mi", "elev_gain_m",
        "elev_loss_m", "elev_gain_ft", "elev_loss_ft", "elev_min_m", "elev_max_m",
        "closure", "pois", "flag_lat", "flag_lng",
    ]
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=csv_cols, extrasaction="ignore")
        w.writeheader()
        for r in records:
            row = dict(r)
            if r.get("distance_m") is not None:
                row["distance_mi"] = round(r["distance_m"] * M_TO_MI, 2)
            if r.get("elev_gain_m") is not None:
                row["elev_gain_ft"] = round(r["elev_gain_m"] * M_TO_FT)
            if r.get("elev_loss_m") is not None:
                row["elev_loss_ft"] = round(r["elev_loss_m"] * M_TO_FT)
            w.writerow(row)

    with JSONL_PATH.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\nWrote {len(records)} trails -> {CSV_PATH}", file=sys.stderr)
    print(f"Wrote full records -> {JSONL_PATH}", file=sys.stderr)
    if errs:
        print(f"{len(errs)} errors:", file=sys.stderr)
        for e in errs[:20]:
            print(f"  {e['slug']}: {e['_error']}", file=sys.stderr)


if __name__ == "__main__":
    main()
