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
