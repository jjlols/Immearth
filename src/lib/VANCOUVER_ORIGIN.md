# Spatial stage reference: Vancouver, British Columbia, Canada

The shared map displays a target-like geolocation marker anchored at **49.2827°
N, 123.1207° W** (WGS84/EPSG:4326). Longitude increases east-positive:
`x=(longitude+180)/360`, `y=(90-latitude)/180`. That places the mark at map-relative
`x≈0.158`, `y≈0.226`. The component's styled `left≈15.8%`, `top≈22.62%` shows
the same calculation and is not a claim of pixel-perfect position relative to every
NASA visualization produced under other/unknown map projections.

## Reserved geographic metadata and independent artistic renderer

`headspaceListeningFrame()` intentionally preserves its geographic metadata as a
future geospatial model; it is not an audio locator or a conversion function.
Vancouver is the reference receiver position. At the reference point, a *modeled*
binaural source is heard inside the listener's head; its **listener-relative local
space is `(0,0,0)`**. Independently, `src/audio/spatialRenderer.js` provides an
optional synthetic local-metre output route with that same *modeled* listener
origin. It is explicitly not the future calibrated geographic model. Coordinates
are not today's pitch/lattice/time instructions and never convert these
coarse raster markers, lat/lon or brightness to source metres. The shared player
keeps regional estimated musical features on the same decoded recording.

Your target marker only opens geographic explanation. It deliberately **does not**
create/resume an AudioContext, decode the MP3, change instrumentation, or pan audio.
Actual movement “from Vancouver” with a scientific source would later require a separate calibrated source-local coordinate
system, calibrated projections/ranges, amplitude policy, and proper HRTF or an equally
declared listener-receptive model. It is not the same as fullscreen stereo and not a
pretend pitch encoding of lat/lon. Existing scientific raster pixels are *not*
implicit appropriate lonlat for this audio expansion.

Metadata provenance: user-instructed location for repository (not user geolocation);
no GPS/browser permissions invoked. `src/lib/spatialOrigin.js` is the shared version
of that reference. `test-js/spatial-origin.test.js` asserts these semantics.
