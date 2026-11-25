# Changelog

## 2026-11-25 (evening) — Fixes from the technical and scientific review (phase 1)
- **Statistics.** The classifier no longer leaks test data into training: standardisation (and log transforms) are fitted inside each training fold; folds are stratified by group, and rivers sharing a basin are held out together. Constant features are dropped with a note; near-perfect separation and n < 30 are flagged. With 3+ groups a Kruskal–Wallis test and Holm-adjusted pairwise Mann–Whitney tests (with Cliff's δ) are shown, with a note on multiple testing and basin non-independence.
- **Long profile.** The mouth is always the last sample. Samples with no elevation data are flagged, counted and listed (warning above 5 %); the CSV now has raw, despiked, smoothed and conditioned elevation, residual, slope, no-data and spike flags, DEM, vertical datum and conditioning method. The stats say the surface is terrain, not the channel bed.
- **Sediment zones.** Labelled as hypotheses, not measurements. New "unknown" class when evidence is weak or missing; options for relative or absolute slope classes, the upstream prior on/off and the unknown margin; raw scores and predictors downloadable; the rule version is recorded.
- **Batch integrity.** Every stored river records its OSM ID, Wikidata ID, source and mouth points, a geometry hash, the search hits and which one was used, module status (trace, profile, tributaries, widths, zones) and flags (trace vs Wikidata length, profile gaps, unfinished tributaries). Two names that find the same river no longer overwrite each other — the second is marked failed. Each river can be reviewed (unreviewed / approved / rejected); rejected rivers leave the statistics, and the statistics can use approved rivers only.
- **Run manifest** (JSON): run ID, method versions, settings, data sources, every query with its outcome, and per-river identity, modules, flags and candidates.
- **One background batch at a time** across tabs (heartbeat lock).
- **CSV exports** neutralise text that a spreadsheet would run as a formula (=, +, -, @).
- Sediment-zone shares are marked "rule-based" in the river measures and are not default classifier features.

## 2026-11-25 (afternoon, background) — Batches in the background, widths by choice, carry on after reload
- River batches run in a hidden copy of the app on the same page; the visible app stays free (search, analyse, compare). Progress shows in the list, the activity bar and the tab title, with a time estimate; Pause stops after the current river. Optional screen wake lock.
- Channel widths are measured only if you choose: "⇔ Widths: on/off" next to the search for single rivers; "Measure channel widths too" for a batch (off by default). Widths can still be measured later in the Width tab.
- Reloading carries on where you stopped: the last rivers, comparison and tab are restored automatically ("Start fresh instead" to skip), the channel network and its typed widths come back, and a running river or network batch resumes by itself.
- The hidden batch frame never overwrites your saved session.

## 2026-11-25 (afternoon, fix) — Search always reachable
- The river search can no longer be hidden: "Minimal" and the layers switch now hide only the map menus, and every visit starts with the menus shown.
- New 🔍 button in the map controls jumps to the search box and focuses it.
- Scrolling to the map no longer tucks the search under the page header.

## 2026-11-25 (afternoon, later) — Analyse a list of rivers
- "☰ Many rivers" (and Compare → Analyse a list of rivers): paste or open a list of river names, one per line, optionally with a group and a country hint (`Niger | arid | Mali`). Each river is found, traced, measured and stored; optionally its delta or fan network is mapped and stored in the network library; optionally the batch waits for channel widths. Hundreds of rivers can be queued; the list is saved and resumes after a reload; failed rivers can be retried; a warning flags names that found the same river.
- River library with groups, CSV export and the same statistics as the network library (group summaries, Welch t, Mann–Whitney, KS, bootstrap, effect sizes, power, scatter with correlations, logistic-regression classifier), with the river as the unit of analysis; river measures include length, fall, gradient, concavity, sinuosity, width, wavelength and bend ratios, ksn, tributary/dam/knickpoint densities, sediment-zone shares, elevations, latitude and the delta/fan angle and order.

## 2026-11-25 (afternoon) — Network styling everywhere, library and global statistics
- Network direction rule fixed: mapped flow direction is kept unless it gives no branching at all, so tributaries that join a river are no longer counted as channels that split.
- Colour the network by order, width, w ÷ w₀, length, l ÷ w₀, sinuosity, angle, gradient, end type or one colour — on the live (satellite) map, in the river clean view, in composed figures and in a new network clean view (white or satellite background).
- Choose what to show: angles, angle limbs, bifurcation points, l(o,j) labels, order numbers, lengths, widths, w ÷ w₀, sinuosity, width positions, excluded loops, apex, outlets, network legend; line width.
- Legend, scale bar and north arrow: size (50–300 %) and style (legend: automatic / light / dark / no box; scale: alternating, solid, line, ruler; north: arrow, compass needle, star, letter) — shared by the map, clean view, composed and network figures; optional north arrow on the live map.
- Network library stored in the browser (IndexedDB), with groups, CSV export, JSON backup/merge, map of stored networks, and re-opening.
- Batch mapping of many networks from a pasted list or CSV (name, lat, lon, radius, group [, apex]) — resumable after a reload; bulk import of hand-digitised GeoJSON networks.
- Statistics with the network as the unit: group summaries (mean ± 95 % CI, median, IQR), Welch t, Mann–Whitney U, Kolmogorov–Smirnov, bootstrap CI of the median difference, Cohen's d, Cliff's δ, sample size for 80 % power, scatter with Pearson / Spearman, channels pooled by order and group, and a logistic-regression fan/delta classifier with leave-one-out accuracy and predictions for unassigned networks.

## 2026-11-25 (noon) — Channel network: mapping that shows up
- Opening the Channel network tab on a river with a delta maps it at once; "Map … delta / lower course" now loads every mapped waterway of the delta area (not only ways touching the main stem).
- "Map channels in view" no longer refuses wide views: it maps ~110 km around the centre.
- If mapped flow directions reach under 40 % of the channels, the network is re-oriented away from the apex (and the panel says so).
- Results and errors are shown in the panel itself, with "Show on map"; on phones the page scrolls to the map after mapping.

## 2026-11-25 (midday) — Faster channel widths
- Water areas are fetched once per block of whole reaches (~300 km of river, a 3 km corridor either side of the channel) instead of one OpenStreetMap request per reach; the next block is requested while the current one is measured; three reaches are measured at a time.
- Mock: 33 reaches on a 1,600 km river now need 6 requests instead of 33; with 1.5 s per answer, widths finish in 8 s instead of 18 s (and in real use, where answers take 5–20 s, roughly a third of the time or less).

## 2026-11-25 (late morning) — Faster, sturdier tracing
- OpenStreetMap requests race the mirrors: the last good server starts at once and the next ones join after 4, 12 and 25 s; the first good answer wins and the rest are cancelled. A hanging server now costs seconds instead of up to 200 s per mirror.
- If every mirror refuses (Safari's "Load failed": usually an overloaded server dropping the connection), all are asked again with a plain GET after 3 s.
- The river is usable as soon as its course is traced: map, profile and clean view open while tributaries, dams, facts and widths are still loading.
- Mock timing: normal 1.0 s to a usable river; first mirror hanging 60 s → 5.1 s; all POSTs refused → 4.2 s.

## 2026-11-25 (afternoon) — Channel networks of fans and deltas
- New **Channel network** tab (also from the ⑂ tool without loading a river): map the channels in view from OpenStreetMap, use a loaded river's distributaries, open GeoJSON / KML / GPX lines, or digitise channels by hand (ends snap to earlier lines).
- Channel ordering after Gezovich, Plink-Björklund & Henry (2026, ESurf 14, 211–231) and Dong et al. (2016): order 1 from the apex, +1 at each bifurcation whose branches never rejoin; loops and rejoining branches are excluded and shown dashed. Apex placed automatically or tapped.
- Per channel l(o,j): length, widths w(i), w(h), w(f) (measured on water areas, OSM width tags, or typed by hand), mean width, normalised length and width (÷ first-order initial width), sinuosity, end type, gradient (optional elevations), and the angle θ at its downstream bifurcation with limbs as long as its final width (Coffey & Shaw 2017) plus a far-field angle.
- Whole network: counts by order, bifurcations, outlets, total length, hull area, channel density, apex–outlet distance, mean angle with 95 % CI, mean normalised length and width, branching, length and width ratios, width kept at bifurcations, width asymmetry, relief and slope; indicative fan-or-delta comparison with the study's means (74.0° deltas, 55.0° fans; normalised length 17.2 vs 147.1; width 0.40 vs 0.26).
- By-order box plots, network comparison (table, overlays, KS test of angles), CSV and GeoJSON exports, and a publication figure (network coloured by order with angles, and width, length and angle by order).
- Self-check on a synthetic fan: 15 channels, 4 orders, angles 60°/50°/40° recovered exactly, the loop excluded.

## 2026-11-25 (later) — Figure composer layout
- Text and symbols are drawn at a chosen print size (small / medium / large / extra large at the printed width) instead of shrinking with the figure.
- Panels take the river's shape (automatic columns; one full-width column for long west–east rivers), so far less empty space.
- Legend, inset, scale bar and north arrow are placed where they cover the least of the river; the river is refitted around the legend when needed.
- Satellite panel is rendered at the panel's own shape, without labels, so it is not cropped or crowded.

## 2026-11-25 — Map controls, journal exports, trace editor, data sources, like-for-like comparison, figure composer
- Map: zoom buttons, rotation (buttons and two-finger twist) with a compass that resets north; taps, pans and zooms work on the rotated map. Layers & map options panel switches off imagery, side channels, tributaries, labels, reach ticks, dams, position marker, legend, scale bar and the search/menus; on phones the map menus move into this panel.
- Export on every plot (⬇ on each chart), the map, the clean view (whole figure, maps only or plots only) and composed figures: PNG with embedded print resolution (300/600/1000 dpi), real PDF files, and editable SVG; journal widths 85/120/180 mm; print style (dark text on white).
- Clean view: zoom and rotation buttons; north arrow follows the rotation.
- Trace editor: cut above/below the marker, extend either end by tapping, follow connected OpenStreetMap waterways upstream or downstream, redraw a stretch between A and B, reverse direction, undo; Apply re-reads elevation, re-measures and records the edit in the results.
- Channel width is measured automatically after each river loads (two reaches at a time), shown as a step in the progress card.
- Faster loading: the elevation profile is read while tributaries load; 16 elevation tiles at a time.
- Data sources panel with recommendations and reasons: AWS Terrain Tiles (automatic or high detail), Copernicus GLO-90 via Open-Meteo, your own GeoTIFF DEM (lat/lon or WGS 84 UTM); OpenStreetMap water areas or your own water polygons for width; KML/GPX lines; base maps. Cross-check the profile against a second elevation source (bias, spread, RMS, total fall).
- Comparison of up to eight rivers: add several by name at once; Make comparable re-measures every river with one elevation source and zoom and one sampling, window and reach definition (absolute or relative scale); comparability check highlights any setting that differs; like-for-like metrics (dimensionless ratios, densities per 100 km) with % difference from a reference and ranks; Kolmogorov–Smirnov tests of per-reach distributions; normalised long profiles; normalised downstream width; ECDFs; plan views at one shared scale, aligned source → mouth.
- Figure composer: satellite view, maps coloured by several measures, location inset, downstream plots, panel letters and an automatic caption with sources and methods, for one river or every river in the comparison.

## 2026-11-24 (late night) — Clearer clean view and robust profiles
- Long profile: spikes (DEM voids, water-surface artefacts, bridges) are detected with a Hampel-type filter and removed before smoothing; the profile is conditioned with isotonic (least-squares monotone) regression instead of a running minimum, which removes the staircase and long flat segments. Conditioning method selectable (isotonic, carve, fill, none); amount of conditioning reported.
- Uncertainty band (robust SD of samples about the profile).
- Knickpoints checked at three window scales and flagged as possible artefacts near removed spikes or heavy conditioning; each carries a confidence label.
- Sediment zones carry an evidence level; a river mouth is called a terminal sink only with a delta or a mouth near sea level, otherwise noted as likely joining another river or basin.
- Clean view: side-by-side maps (2–3 attributes, linked zoom); stacked or overlaid downstream plots of elevation, slope, sinuosity, width, ksn, floodplain width, curvature, wavelength, confinement and braiding; profile layers toggle (raw, spikes, smoothed, conditioned, uncertainty); “How sinuosity is measured”, “Valley axis” and “How knickpoints are found” explanation layers drawn on the map and profile; draggable legend, scale bar, north arrow, symbol key and location inset; symbol key lists only visible features; legend ends shown as ≤ / ≥ with the clipping stated; label collision avoidance; “How to read” panel; PDF export; resolution and source in the caption.
- Two new self-tests (18 in total).

## 2026-11-24 (night) — Channel Width Intelligence
- New **Channel width** tab: station-based measurement with fixed or adaptive spacing, clipped to the exact selection.
- Width definitions kept separate: main-thread mapped water width, total wetted width B, outer wetted span Ws, active channel (water + mapped OSM bars), medial-axis width, digitised channel belt, terrain floodplain and valley floor; bankfull shown as unavailable without independent evidence.
- Multithread geometry per station: individual thread widths, N, B/N, dominant and wetted fractions, interchannel width; rejection of B > active width.
- QC per station: cells across, orientation sensitivity, edge effects, bend interference, confluence/bifurcation and dam proximity, uncertainty (±1 cell); manual exclusion and correction keeping the original.
- Full statistics (mean, median, min/max, SD, variance, IQR, CV, P5–P95, skewness, kurtosis, n, valid fraction) with block-bootstrap confidence intervals using the autocorrelation length.
- Downstream width profile, dW/ds, histogram with explicit bins, ECDF, violin + box plot; spatial context (bend apex vs inflection, above/below confluences, dams and knickpoints, per-reach variability, characteristic variation length); dimensionless ratios with numerator/denominator definitions.
- Width through time at fixed stations from dated water polygons (GeoJSON import or digitised): width change, left and right bank displacement rates, migration / widening / narrowing / stable counts, thread splitting and merging.
- Station CSV, transect GeoJSON and metadata JSON exports; width results feed Interpretation, analogue records and the clean view (transects coloured by width).
- Seven new synthetic self-tests (16 in total).

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
