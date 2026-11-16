import test from "node:test";
import assert from "node:assert/strict";
import { assignShells, prepareLayerPixels } from "../src/globe/layerShells.js";

const layers = [
  { id: "precipitation" },
  { id: "active_fires" },
  { id: "carbon_monoxide" },
  { id: "nitrogen_oxides" },
  { id: "near_surface_temperature" },
];

const settings = {
  precipitation: { visible: true, opacity: 0.9 },
  active_fires: { visible: true, opacity: 0.98 },
  carbon_monoxide: { visible: true, opacity: 0.4 },
  nitrogen_oxides: { visible: true, opacity: 0.44 },
  near_surface_temperature: { visible: true, opacity: 0.4 },
};

test("the selected map hugs the Earth and the other full maps open to the right", () => {
  const shells = assignShells(layers, { settings, focus: "nitrogen_oxides" });
  const face = shells.find((shell) => shell.role === "face");
  const bands = shells.filter((shell) => shell.role === "band");
  const sparse = shells.filter((shell) => shell.role === "sparse");
  assert.equal(face.id, "nitrogen_oxides");
  assert.equal(face.radius, 1.012);
  assert.deepEqual(bands.map((shell) => shell.id), ["carbon_monoxide", "near_surface_temperature"]);
  assert.ok(bands[1].peel.start > bands[0].peel.start);
  assert.ok(bands.every((shell) => shell.opacity >= 0.82));
  assert.ok(bands[0].peel.end - bands[0].peel.start > 0.4);
  assert.deepEqual(sparse.map((shell) => shell.id), ["precipitation", "active_fires"]);
  assert.ok(sparse.every((shell) => shell.radius > bands[bands.length - 1].radius));
});

test("a hidden map is left off the globe and selected-only keeps one shell", () => {
  const hidden = { ...settings, carbon_monoxide: { visible: false, opacity: 0.4 } };
  const shells = assignShells(layers, { settings: hidden, focus: "nitrogen_oxides" });
  assert.equal(shells.some((shell) => shell.id === "carbon_monoxide"), false);
  const solo = assignShells(layers, { settings, focus: "active_fires", onlySelected: true });
  assert.deepEqual(solo.map((shell) => shell.id), ["active_fires"]);
  assert.equal(solo[0].role, "face");
});

test("caption blocks clear and near-black rain or fire pixels drop out", () => {
  const width = 20;
  const height = 10;
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.fill(255);
  pixels[0] = 2;
  pixels[1] = 2;
  pixels[2] = 2;
  pixels[3] = 255;
  const kept = (width - 1) * 4;
  pixels[kept] = 240;
  pixels[kept + 1] = 180;
  pixels[kept + 2] = 20;
  pixels[kept + 3] = 255;
  prepareLayerPixels(pixels, width, height, "active_fires");
  assert.equal(pixels[3], 0);
  assert.equal(pixels[kept + 3], 255);
  const caption = (9 * width + 1) * 4 + 3;
  assert.equal(pixels[caption], 0);
});
