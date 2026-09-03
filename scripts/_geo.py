"""Small shared helpers for the trail/route build scripts.

Every script here is run standalone (`python scripts/foo.py`), which puts
scripts/ on sys.path, so a plain `from _geo import ...` works everywhere.
"""

from __future__ import annotations

import math
import re

# Unit conversions (meters -> miles / feet).
M_TO_MI = 1 / 1609.344
M_TO_FT = 3.280839895

EARTH_RADIUS_M = 6371000.0

# Max endpoint gap, in degrees (~100 ft), treated as "connected" when chaining
# trail segments back together across tile boundaries.
TOLERANCE = 0.0003


def haversine_m(lng1, lat1, lng2, lat2):
    """Great-circle distance in meters (matches ride-stats haversineDistance)."""
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlng / 2) ** 2)
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def dist_deg(a, b):
    """Planar distance in degrees between two [lng, lat] points."""
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


def esc(s: str) -> str:
    """Escape a string for embedding in a single-quoted TS literal."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


def slugify(name: str) -> str:
    """Match src/utils/string.ts slugify exactly — the client builds asset URLs
    (elevation JSON, route ids) with the same rules, so they must agree."""
    s = name.lower()
    s = re.sub(r"['\"]", "", s)
    s = re.sub(r"[/&]", "-", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return re.sub(r"^-|-$", "", s)
