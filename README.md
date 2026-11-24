# Earthform Lens

**Read landscapes from satellite images.** Open a Google Earth screenshot, a satellite GeoTIFF or an elevation model, and Earthform Lens finds the water and channels, measures the landforms, compares dates, explains every number, and turns the results into art and ready-to-post carousels.

Everything runs in the browser. Images never leave your device.

## What it does

| Section | What you get |
|---|---|
| **Discover** | Curated places (rivers, deltas, coasts, deserts, ice, seafloor canyons) with Google Earth links |
| **✦ Findings** | One-tap automatic analysis. Each result is a card: the number, what it means, a map of where it is, and how it was measured |
| **Posts** | A carousel built from the findings: cover, one slide per finding, a numbers slide, plus a caption with hashtags. 4:5, 1:1 or 9:16; Photo, Print or Night styles |
| **Studio** | Art: Atlas enhance (dehaze, colour balance, deep-navy water grading), presets, framing, serif label box |
| **Lab** | Step-by-step analysis: Prepare → Measure → Compare → Results, with plots and CSV/JSON export |

### Analysis
- **Water and channels:** k-means colour clustering, spatial spreading, and a logistic-regression classifier trained on each image's own confident pixels. Also handles sediment-laden and blackwater rivers.
- **Rivers:** centreline, sinuosity, meander bends (radius/width), necks and cutoff risk, oxbow lakes, width along the channel.
- **Tributaries and distributaries:** every branch on the main channel classified by junction geometry (or depth on the seafloor), with junction angle, bank, length, width ratio and confluence spacing.
- **Networks:** Strahler order, Horton ratios, deltas (apex, mouths, opening angle), braiding index.
- **Seafloor:** canyons and submarine channels traced on Google Earth bathymetry with a multi-scale Hessian valley filter. Lighter blue is treated as shallower, which sets the downslope direction.
- **Lakes, patterns, land cover, terrain, dunes** (Fourier crest spacing and trend).
- **Change over time:** Fourier–Mellin alignment (handles different crop, zoom and rotation), then river-migration or shoreline mode with numbered change events.

## Rivers: explore a whole river from source to mouth

Open the **Rivers** tab (or **Explore a river** on the home screen), type a river's name (for example *Danube*) and pick it from the list. Earthform Lens then:

- **traces the river's course** from OpenStreetMap, following the direction OSM waterways are drawn in (downstream), and finds every tributary, distributary, dam and weir along it;
- **builds the long profile** from AWS Terrain Tiles: elevation and slope from source to mouth, knickpoints, Langbein concavity, total fall and mean gradient;
- **splits the river into reaches** (length adjustable) with sinuosity, bends, meander wavelength, slope, fall, a multi-channel index and, on request, channel width measured across OpenStreetMap's water areas;
- **lists the tributaries** with the kilometre where each joins and its bank, plus length, basin area and discharge from Wikidata; charts how the basin grows downstream and fits Hack's law; any tributary can be opened and explored in turn;
- **flies along the river** over satellite imagery, and sends any view to the image tools (Lab, Findings, Studio, Posts) with its scale already set;
- lets you **draw a river by hand** on the map when it isn't in OpenStreetMap;
- exports the long profile, reaches and tributaries as CSV and the course as GeoJSON.

The explorer needs an internet connection and runs on a normal web host such as GitHub Pages. Pages hosted inside Claude cannot reach these services.

Data sources: © OpenStreetMap contributors (ODbL), AWS Terrain Tiles (Mapzen; SRTM and others), imagery © Esri, Maxar, Earthstar Geographics, Wikidata (CC0). Please respect the [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) and Overpass usage policies: the app makes one search and one geometry request per river.

## Use it
Open the hosted page, or download `index.html` and open it in any modern browser. No install and no server needed.

## Develop
The app is a single HTML file assembled from `src/`:

```
python3 build.py   # writes index.html
```

Edit files in `src/` and rebuild. The GitHub Actions workflow in `.github/workflows/pages.yml` rebuilds and publishes to GitHub Pages on every push to `main`.

| File | Role |
|---|---|
| `shell.html` | Markup and CSS |
| `core.js`, `tiff.js` | Image maths (distance transforms, morphology, labelling, thinning) and GeoTIFF reader |
| `studio.js` | Art engine |
| `lab.js` | Lab app: water, channel, network, lakes, terrain, measure, export |
| `ml.js` | Pixel features, k-means cluster expansion, self-trained classifier |
| `atlas.js` | Atlas enhancement |
| `align.js` | Image alignment between dates |
| `chx.js`, `branch.js` | Channel extras, focus modes, tributaries/distributaries, seafloor channels |
| `auto.js`, `series.js` | Automatic pipeline, Findings report, multi-date change |
| `story.js` | Findings cards and social-post slides |
| `discover.js`, `gloss.js`, `plot.js` | Places, explanations of every metric, plot builder |

## Notes
Measurements from screenshots depend on the scale you set (tap the scale bar). Colours in Google Earth imagery are processed mosaics, so treat water detection and change maps as estimates and check them against the image.
