# Spatial stage reference: Vancouver, British Columbia, Canada

The shared map displays a target-like geolocation marker anchored at **49.2827°
N, 123.1207° W** (WGS84/EPSG:4326). Longitude increases east-positive:
`x=(longitude+180)/360`, `y=(90-latitude)/180`. That places the mark at map-relative
`x≈0.158`, `y≈0.226`. The component's styled `left≈15.8%`, `top≈22.62%` shows
the same calculation and is not a claim of pixel-perfect position relative to every
NASA visualization produced under other/unknown map projections.

## Headspace stage (future use)

`headspaceListeningFrame()` intentionally reserves a future listener-space model.
Vancouver is the reference receiver position. At the reference point, a *modeled*
binaural source is heard inside the listener's head; its **listener-relative local
space is `(0,0,0)`**. Gym coordinate-like positive angles/positions are not today’s
pitch/lattice/time/volume instructions. The current player stays purely musical with
a shared 69-bpm recording and regional estimated musical features.

Your target marker only opens geographic explanation. It deliberately **does not**
create/resume an AudioContext, decode the MP3, change instrumentation, or pan audio.
The movement “from Vancouver” would later require an explicit source-local coordinate
system, calibrated projections/ranges, amplitude policy, and proper HRTF or an equally
declared listener-receptive model. It is not the same as fullscreen stereo and not a
pretend pitch encoding of lat/lon. Existing scientific raster pixels are *not*
implicit appropriate lonlat for this audio expansion.

Metadata provenance: user-instructed location for repository (not user geolocation);
no GPS/browser permissions invoked. `src/lib/spatialOrigin.js` is the shared version
of that reference. `test-js/spatial-origin.test.js` asserts these semantics.
