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

The amplitude test failed on its first run (1.51 km, −25 %): the valley axis was smoothed over one wavelength measured along the valley instead of along the channel. Fixed; it now passes at 5 %. The export test also caught two results without a stated method.

## Not yet validated

- Channel width against independent bank-to-bank measurements or the Global River Widths from Landsat dataset.
- Catchment area against HydroBASINS or published basin areas (target: within 5 % for suitable basins).
- Knickpoint detection against mapped knickpoints.
- Temporal change rates against field or GIS-derived migration rates; registration error is not yet quantified.
- Interpretation rules against expert-labelled reaches (held-out sites).
- Live data services (OpenStreetMap/Overpass, Photon, Wikidata, AWS Terrain Tiles, Esri Wayback, EOX, JRC, ESA WorldCover, Macrostrat): the development environment has no internet access, so all end-to-end tests use mocked responses.

## Suggested benchmark set

Danube, Mississippi, Niger and Amazon (from the brief), plus small, well-surveyed basins where independent reference data exist.
