# Validation status

Earthform Lens is **not yet validated as a research-grade tool**. This file records what has been tested and what has not.

## Synthetic self-test (in the app: Rivers → Data → *Run synthetic self-test*)

The self-test runs the app's own geometry, routing and export code on shapes with known answers. Last run: November 2026, headless Chrome.

| Test | Expected | Result | Tolerance | Status |
|---|---|---|---|---|
| Straight channel length | 100 km | 100.000 km | 1 % | pass |
| Straight channel sinuosity | 1.000 | 1.000 | 2 % | pass |
| Sine channel length (λ 5 km, A 1 km, 50 km valley) | 66.033 km (numerical integral) | 66.033 km | 1 % | pass |
| Sine channel sinuosity | 1.3207 | 1.3207 | 2 % | pass |
| Meander wavelength | 5.00 km | 5.00 km | 5 % | pass |
| Meander amplitude (peak-to-peak) | 2.00 km | 2.03 km | 5 % | pass |
| Catchment area, closed synthetic valley (Web Worker routing) | 139.24 km² | 139.24 km² | 1 % | pass |
| Repeatability (identical inputs) | identical | identical | exact | pass |
| Export integrity (unit + method on every result) | 29/29 | 29/29 | exact | pass |
| Multithread transect: total wetted width B (180 + 95 + 65 m) | 340 m | 340 m | 0.5 % | pass |
| Multithread transect: thread count N | 3 | 3 | exact | pass |
| Multithread transect: mean thread width B/N | 113.3 m | 113.3 m | 0.5 % | pass |
| Multithread transect: dominant fraction | 52.9 % | 52.9 % | 0.5 % | pass |
| Multithread transect: wetted fraction of a 600 m braidplain | 56.7 % | 56.7 % | 0.5 % | pass |
| Straight 200 m channel, rasterised polygon, station engine | 200 m | 200 m | 5 % | pass |
| Medial-axis (distance-transform) width, same channel | 200 m | 200 m | 8 % | pass |
| Profile with 3 deep multi-sample dips (DEM voids): max error after spike removal + isotonic conditioning (old running-minimum method: 150 m) | 0 m | 0.45 m | exact | pass |
| Dip samples detected and removed | 20 | 20 | exact | pass |

The amplitude test failed on its first run (1.51 km, −25 %): the valley axis was smoothed over one wavelength measured along the valley instead of along the channel. Fixed; it now passes at 5 %. The export test also caught two results without a stated method.

## Statistics checks (in the self-test)
- Kruskal–Wallis H and p on the Hollander & Wolfe example match SciPy (H = 0.7714, p = 0.680).
- On 80 records with random group labels, the cross-validated classifier accuracy is near chance (43 %), as it should be without leakage.
- A feature with no variation is left out of the classifier.

## Not yet validated

- Long profiles and knickpoints against surveyed or lidar profiles; the noisy-DEM mock (±3 m noise, 0.4 % pits of −120 m) gives 77 spikes removed, ≤6.5 m conditioning and no false knickpoints, but this is synthetic.
- Sediment-zone confidence labels (strong / moderate / weak) are rule-based margins, not calibrated probabilities.

- Channel width on curved channels, islands, junctions and missing data against hand-digitised boundaries; error and coverage by width class and source.

- Channel width against independent bank-to-bank measurements or the Global River Widths from Landsat dataset.
- Catchment area against HydroBASINS or published basin areas (target: within 5 % for suitable basins).
- Knickpoint detection against mapped knickpoints.
- Temporal change rates against field or GIS-derived migration rates; registration error is not yet quantified.
- Interpretation rules against expert-labelled reaches (held-out sites).
- Live data services (OpenStreetMap/Overpass, Photon, Wikidata, AWS Terrain Tiles, Esri Wayback, EOX, JRC, ESA WorldCover, Macrostrat): the development environment has no internet access, so all end-to-end tests use mocked responses.

## Suggested benchmark set

Danube, Mississippi, Niger and Amazon (from the brief), plus small, well-surveyed basins where independent reference data exist.
