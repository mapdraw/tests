#!/usr/bin/env python3
"""Structural GeoJSON validation per RFC 7946 (https://datatracker.ietf.org/doc/html/rfc7946).

Checks the constructs MapDraw reads and writes: FeatureCollection/Feature framing,
geometry types, position arity and coordinate ranges (sec. 3.1.1), LineString length
(3.1.4), ring closure and length (3.1.6), and the right-hand rule (exterior rings
counterclockwise, holes clockwise - also 3.1.6).

Usage: rfc7946-check.py FILE...   Exit code 0 when every file is valid.
"""

import json
import sys

GEOMETRY_TYPES = {
    "Point", "MultiPoint", "LineString", "MultiLineString",
    "Polygon", "MultiPolygon", "GeometryCollection",
}


def check_position(pos, errors, where):
    if (
        not isinstance(pos, list)
        or not 2 <= len(pos) <= 3
        or not all(isinstance(n, (int, float)) and not isinstance(n, bool) for n in pos)
    ):
        errors.append(f"{where}: not a [lon, lat(, alt)] position: {pos!r}")
        return
    if not -180 <= pos[0] <= 180:
        errors.append(f"{where}: longitude out of range: {pos[0]}")
    if not -90 <= pos[1] <= 90:
        errors.append(f"{where}: latitude out of range: {pos[1]}")


def ring_is_counterclockwise(ring):
    # Shoelace formula; positive signed area = counterclockwise.
    return (
        sum(
            (ring[i][0] * ring[i + 1][1]) - (ring[i + 1][0] * ring[i][1])
            for i in range(len(ring) - 1)
        )
        > 0
    )


def check_ring(ring, index, errors, where):
    where = f"{where} ring {index}"
    if not isinstance(ring, list) or len(ring) < 4:
        errors.append(f"{where}: fewer than 4 positions")
        return
    for i, pos in enumerate(ring):
        check_position(pos, errors, f"{where} position {i}")
    if ring[0] != ring[-1]:
        errors.append(f"{where}: not closed (first != last position)")
        return
    # Right-hand rule: exterior ring counterclockwise, holes clockwise
    if ring_is_counterclockwise(ring) != (index == 0):
        expected = "counterclockwise" if index == 0 else "clockwise"
        errors.append(f"{where}: must wind {expected} (right-hand rule)")


def check_line(line, errors, where):
    if not isinstance(line, list) or len(line) < 2:
        errors.append(f"{where}: fewer than 2 positions")
        return
    for i, pos in enumerate(line):
        check_position(pos, errors, f"{where} position {i}")


def check_geometry(geometry, errors, where):
    if not isinstance(geometry, dict):
        errors.append(f"{where}: geometry is not an object")
        return
    gtype = geometry.get("type")
    if gtype not in GEOMETRY_TYPES:
        errors.append(f"{where}: unknown geometry type {gtype!r}")
        return
    if gtype == "GeometryCollection":
        geometries = geometry.get("geometries")
        if not isinstance(geometries, list):
            errors.append(f"{where}: GeometryCollection without geometries array")
            return
        for i, member in enumerate(geometries):
            check_geometry(member, errors, f"{where} geometry {i}")
        return
    coords = geometry.get("coordinates")
    if not isinstance(coords, list):
        errors.append(f"{where}: missing coordinates array")
        return
    if gtype == "Point":
        check_position(coords, errors, where)
    elif gtype == "MultiPoint":
        for i, pos in enumerate(coords):
            check_position(pos, errors, f"{where} position {i}")
    elif gtype == "LineString":
        check_line(coords, errors, where)
    elif gtype == "MultiLineString":
        for i, line in enumerate(coords):
            check_line(line, errors, f"{where} line {i}")
    elif gtype == "Polygon":
        for i, ring in enumerate(coords):
            check_ring(ring, i, errors, where)
    elif gtype == "MultiPolygon":
        for p, polygon in enumerate(coords):
            for i, ring in enumerate(polygon):
                check_ring(ring, i, errors, f"{where} polygon {p}")


def check_feature(feature, errors, where):
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        errors.append(f'{where}: not a {{"type": "Feature"}} object')
        return
    if not isinstance(feature.get("properties"), (dict, type(None))):
        errors.append(f"{where}: properties must be an object or null")
    geometry = feature.get("geometry")
    if geometry is not None:
        check_geometry(geometry, errors, where)


def check_file(path):
    errors = []
    try:
        with open(path) as f:
            data = json.load(f)
    except (OSError, ValueError) as error:
        return [str(error)]
    if not isinstance(data, dict):
        return ["root is not a JSON object"]
    root_type = data.get("type")
    if root_type == "FeatureCollection":
        features = data.get("features")
        if not isinstance(features, list):
            return ["FeatureCollection without features array"]
        for i, feature in enumerate(features):
            check_feature(feature, errors, f"feature {i}")
    elif root_type == "Feature":
        check_feature(data, errors, "feature")
    elif root_type in GEOMETRY_TYPES:
        check_geometry(data, errors, "geometry")
    else:
        return [f"root type must be a GeoJSON object, got {root_type!r}"]
    return errors


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    failed = False
    for path in sys.argv[1:]:
        errors = check_file(path)
        if errors:
            failed = True
            print(f"✗ {path}")
            for error in errors:
                print(f"    {error}")
        else:
            print(f"✓ {path}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
