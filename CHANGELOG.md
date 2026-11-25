# Changelog

## 2026-11-24 (evening)
- Legend on the main map for every “Colour by” option (continuous colour bar with values and units, or categories for sediment zones).
- New colour options: curvature, meander wavelength, floodplain ÷ channel width, braiding index.
- “Plain (white, no imagery)” base map.
- Clean view: the river alone, to scale, on white; colour by any measure; toggle tributaries, side channels, dams, knickpoints, reach boundaries, values on reaches, width transects, distance marks, names, sediment zones and the selected stretch; live scale bar, north arrow, colour legend and symbol key; linked long profile coloured the same way; hover readout; pan/zoom/pinch; SVG and PNG export.

## 2026-11-24 (latest)
- Shared result model: every measurement carries id, study area, value, unit, geometry, samples (n, P10–P90), source, resolution, method, method version, parameters and QC status (`ok`, `partial`, `review`, `missing`).
- Interpretation tab: observation / measurement / interpretation for planform, lateral migration, profile, knickpoints, hypsometry, sediment routing and delta; evidence chips link to the measurements; "unknown" with the missing inputs; other possible explanations listed.
- Analysis levels: Quick (on load), Standard (widths + catchment), Detailed (+ floodplain, oxbows).
- Analogue library (Compare → Analogue library): save rivers/reaches as records, filter by environment and ranges, similarity ranking with weights and metric coverage, distribution CSV, GeoJSON, library import/export, candidate systems.
- Scientific figures (Report → Scientific figures): four-panel publication figure, attribute-coloured river maps (viridis, barriers, side-by-side systems), raw vs conditioned profile; SVG and 3× PNG with captions stating sources and parameters.
- Terrain routing in a Web Worker; Overpass responses cached for 7 days in IndexedDB.
- Archive imagery acquisition dates from Esri Wayback metadata; approximate rates flagged.
- Comparison of up to four systems; ECDF plots.
- In-app synthetic self-test (9 tests) and `docs/VALIDATION.md`, `docs/KNOWN_LIMITATIONS.md`.

## Earlier on 2026-11-24
- Four workspaces (Explore, Analyze, Compare, Report); Lab and Figure studio linked on one image.
- Course shown immediately; cancellable loading; conditioning option and flag; exact-boundary comparison; matched sampling; saved projects with autosave.
- Loading indicators throughout; multi-provider river search; modern interface; eight river analysis modules; GeoJSON study areas.
