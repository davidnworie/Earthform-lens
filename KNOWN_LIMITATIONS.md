# Known limitations

- **Data**: OpenStreetMap centrelines and water areas are used for geometry and width; widths are mapped water-area widths (wetted/mapped), not bankfull or active-channel widths. Elevation comes from AWS Terrain Tiles (display-grade, tens to hundreds of metres), not Copernicus DEM, FABDEM or LiDAR. HydroRIVERS, HydroBASINS, HydroATLAS, MERIT Hydro, Sentinel-1/2 rasters, Landsat and GEBCO are not integrated.
- **Profile**: running-minimum conditioning is optional; raw samples are kept, and large changes made by conditioning are flagged.
- **Catchments** are delineated live from the terrain; very large basins use coarse cells and may be clipped by the terrain window (flagged).
- **Floodplain** is a height-above-channel threshold along cross-sections; not HAND or geomorphic mapping. Terrace candidates are unconfirmed.
- **Temporal**: Esri Wayback acquisition dates are looked up from the archive metadata where available; otherwise release dates are used and the result is marked approximate. Sentinel-2 cloudless layers are annual mosaics without single acquisition dates. Change detection in the Lab works on water masks; stage and seasonal differences are not corrected.
- **Sediment routing** is a weighted interpretation of potential zones, not a sediment budget.
- **Interpretation** uses transparent rules (`efl-rules-1.0`), not calibrated classifiers; no confidence percentages are given.
- **Analogue library** stores records in this browser (IndexedDB); export the library JSON to keep or share it. Candidate systems are names to analyse, not measured records.
- **Delta** analysis depends on how completely distributaries are mapped in OpenStreetMap; wave and tide influence cannot be determined from planform alone.
- **Architecture**: modular source files compiled into one `index.html`; the custom canvas map is not MapLibre; only terrain routing runs in a Web Worker.
- **Testing**: synthetic fixtures only (see `VALIDATION.md`); live services untested from the development environment.
- **Channel width**: boundaries are OpenStreetMap water and bar polygons (undated, mixed origin), rasterised at 4–50 m. No automatic water mask from Sentinel-2/Landsat yet; dated widths need user-supplied dated polygons. Registration error between dated sources is not measured. Bankfull, bar dimensions, neck widths and tributary/distributary width ratios are not yet measured. Thread-normal measurement mode for multithread rivers is not implemented (corridor normal only).
- **Elevation**: AWS Terrain Tiles at z9 (≈ 150–300 m cells, mixed SRTM/other sources) are coarse for channel-scale profiles; small knickpoints and waterfalls below that scale are not resolvable. Spike removal can also remove a genuine short, steep step.
- **Exports**: PDF and PNG are high-resolution images (vector only in SVG). Satellite panels need a base map that allows image export; imagery licences apply to published figures. Very large figures are reduced to stay within the browser's canvas limit (≈16.7 million pixels).
- **Copernicus GLO-90 (Open-Meteo)** is a surface model with daily request limits on the free service; not used for catchment routing. User DEMs must be lat/lon or WGS 84 UTM.
- **Trace editor**: following OpenStreetMap depends on mapped connections and flow direction; tributaries more than 2 km from an edited line are dropped.
- **Comparison tests**: neighbouring reaches are not independent, so Kolmogorov–Smirnov p-values are indicative.
- **Speed**: most loading time is OpenStreetMap (Overpass) answering; large rivers still take a minute or more on busy servers. A second visit within 7 days uses the cache.
- **Channel networks**: OpenStreetMap rarely maps dry or paleo-channels on fans, and mapped flow direction can be wrong; the paper traced every channel by hand on sub-metre imagery — digitise or import lines for comparable results. Automatic widths need mapped water areas; others must be typed. The fan-or-delta call uses one study's means and is indicative only.
- **Network library and batch**: the library lives in this browser only (export JSON backups). Batch mapping relies on OpenStreetMap, which seldom maps dry fan channels; statistics are only as good as the mapped networks. The classifier is a simple regularised logistic regression; with few networks per group its accuracy is unstable.
- **Background batches** run while the page is open. Phones and browsers pause pages that are not on screen (switching apps, locking the screen, background tabs may be slowed); the batch then continues when you come back, or after a reload. For long lists, keep the page open on a laptop or desktop, or keep the screen on.

## After the technical review (Nov 2026) — still open
- **No independent validation yet.** Widths are not checked against GRWL/SWORD or field surveys, profiles not against surveyed bed profiles, sediment zones not against flux or repeat-survey data. Until then results are measurements of OSM geometry and a terrain DEM, and zones are rule outputs.
- **Climate groups** are what the user types; there is no Köppen–Geiger raster lookup (needs a raster the app does not ship).
- **Background batches** run in the browser: closing every tab stops them (they resume on the next visit). Durable server-side jobs would need a server.
- **Code structure.** The app is one file built from modules that share a scope; a modular rewrite with unit tests per function is not done. The in-app self-test covers the core maths.
- **Antimeridian** rivers and networks (crossing ±180°) are not tested.
- **Same scale across a batch** (fixed reach length and sample step) and a common colour scale across compared rivers are not yet options.
