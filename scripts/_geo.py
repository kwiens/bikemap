"""Small shared helpers for the trail/route build scripts.

Geometry math (haversine, line length) lives in osm_trail_elevation.py — import
it from there. This module holds utilities with no other natural home.
"""

from __future__ import annotations

import re


def slugify(name: str) -> str:
    """Match src/utils/string.ts slugify exactly — the client builds asset URLs
    (elevation JSON, route ids) with the same rules, so they must agree."""
    s = name.lower()
    s = re.sub(r"['\"]", "", s)
    s = re.sub(r"[/&]", "-", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return re.sub(r"^-|-$", "", s)
