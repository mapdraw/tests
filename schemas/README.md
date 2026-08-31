# Vendored Schemas

Local copies of the official schemas used by `../validate-exports.sh`, so validation runs
offline (`xmllint --nonet`). Downloaded 2026-08-31.

| File                   | Source                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `gpx.xsd`              | https://www.topografix.com/GPX/1/1/gpx.xsd                      |
| `gpx_style.xsd`        | https://www.topografix.com/GPX/gpx_style/0/2/gpx_style.xsd      |
| `ogckml22.xsd`         | https://schemas.opengis.net/kml/2.2.0/ogckml22.xsd              |
| `atom-author-link.xsd` | https://schemas.opengis.net/kml/2.2.0/atom-author-link.xsd      |
| `xAL.xsd`              | https://docs.oasis-open.org/election/external/xAL.xsd           |

`atom-author-link.xsd` and `xAL.xsd` are imported by `ogckml22.xsd`. One line of
`ogckml22.xsd` is patched: the xAL import's `schemaLocation` points to the local
`xAL.xsd` instead of the absolute OASIS URL, so `--nonet` validation works.

GeoJSON has no schema; `../rfc7946-check.py` implements the structural rules of
RFC 7946 (https://datatracker.ietf.org/doc/html/rfc7946) instead.
