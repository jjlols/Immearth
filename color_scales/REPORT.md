# Scientific extraction report — NASA Earth Information Center

**Review execution:** 14 November 2026. Live NASA access was available. All five
extractors executed, all five scales were found, and all five JSON records and
legend images were generated. Every numeric interpretation from raster labels
is marked `estimated`, never authoritative `verified`. No fabricated lookup
tables are supplied.

| Category | Scale found | Method | Numeric values verified | Scientific summary and cautions |
|---|---|---|---|---|
| Precipitation | **Yes — two** | SVS 4285 `rainbarblack2.png` & `snowbarblack2.png`, exact discrete RGB runs | **No — estimated from official labels** | Separate liquid/frozen IMERG rate scales, units mm/hour. Ten regular blocks, plus an overflow extension starting around 50. Do not smooth or make one combined gradient. Grey/left swatch meaning remains unassigned. |
| Active fires | **Yes** | Legend crop from official SVS 5113 primary movie frame | **No — estimated from official video labels** | Moving five-day VIIRS **fire radiative power**, not a count or categorical detection map. Labels 0, 2, 4, 6, 8 MW. White endpoint extension not calibrated. No standalone linked colorbar found. |
| Carbon monoxide | **Yes, with corrected source** | SVS **5153** `CO_colorbar_plain.png`, reviewed ticks and 128 samples | **No — estimated from official raster ticks** | CO **not CO2**, near-surface GEOS-CF, ppbv. Anchors 40, 100, 130, 200, 500; nonuniform mapping. Supplied 5115 verified as CO2 and never supplies this palette. |
| Nitrogen oxides | **Yes** | SVS 5154 `NOx_colorbar_plain.png`, reviewed ticks and 128 samples | **No — estimated from official raster ticks** | NO + NO2 near-surface GEOS-CF concentration. Labels are powers of ten: 10^-3 through 10^1 ppbv. log10 interpolation is estimated, not an official lookup table. |
| Near-surface temperature | **Yes** | SVS 5147 `NearSurfaceTemperature_colorbar_plain.png`, ticks and 128 samples | **No — estimated from official raster ticks** | T2M, Celsius. Eight labels -40, -20, -10, 0, 10, 20, 30, 40 °C with very cold/hot extensions. Text conflict: short caption says 3m, longer description says 2m; 2m is used with warning. |

## Verification hierarchy used

1. NASA page titles/descriptions validate scientific quantity. The links to all
explicitly captioned colorbar media cards were inspected. Highest-resolution
official PNG assets were used for four categories (including two precipitation
scales). Structured official RGB/value lookup tables were not present on any
of the reviewed pages. Therefore numerical verification is **not** claimed.
2. NASA's primary active-fire visualization supplies an in-video scale. An
independent frame extraction recovers its complete labeled legend. It does
not use Agent 1's movie or output data.
3. Read-only optional input images are supported if official discovery fails.
Missing/corrupt inputs become warnings and explicit failure records. Generic
embedded detection returns RGB colors only and leaves units/values `null`.

Raw RGB palette generation is not considered calibration. There is no sorting
of map colors or fabricated numerical endpoint. Both the relationship to the
visualization and uncertainties are preserved in `scale.json`.

## CO source correction and integration

The corrected category name and every output path use `carbon_monoxide`.
[SVS 5115](https://svs.gsfc.nasa.gov/5115/) is **Global Atmospheric Carbon
Dioxide (CO2)**, verified on the live page and saved in
`source_evidence/carbon_dioxide_reference_mismatch.html`.
[SVS 5153](https://svs.gsfc.nasa.gov/5153/) is **Carbon Monoxide (CO)** and its
GEOS-CF near-surface colorbar is the only CO source used. Pass 5153 to Agent 1
during integration to avoid acquiring the scientific quantity CO2 under a CO
filename. Original supplied page 5115 is retained in metadata with the mismatch
warning for traceability.

## Reproducibility and validation

The program fetches its official sources directly. `source_evidence/` preserves
NASA HTML used for scientific validation, and fixtures preserve reviewed PNG
legend assets plus a real official movie frame. Asset hashes for standalone
raster scales are checked: changed assets require manual review. Pinned tick
geometry is a raster-specific scientific lookup aid, not an assertion that NASA
publishes machine-readable numeric calibration.

Offline tests use mocked failure paths, synthetic horizontal/vertical images,
discrete palettes, and real source fixtures. They verify JSON status/null
fields, tolerance of missing/corrupt files, rejection of unverified mappings,
and no dependency on `download_eic.py`. No DeepSpace assistance was needed;
no unsupported DeepSpace APIs are used or claimed.

See `README.md` for setup, commands, source-image integration, full uncertainty
semantics, and the one-time active-fire movie decode requirement.
