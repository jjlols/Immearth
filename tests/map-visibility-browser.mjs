import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, reducedMotion: "reduce" });
await page.addInitScript(() => {
 const errors = [];
 window.__VISIBILITY_ERRORS__ = errors;
 window.addEventListener("error", (event) => errors.push(event.message));
});


const reactErrors = [];
page.on("console", (message) => {
 if (message.type() === "error") reactErrors.push(message.text());
});
await page.emulateMedia({ reducedMotion: "reduce" });
const canvasIds = () => page.locator("canvas[data-map-field]").evaluateAll((fields) => fields.map((field) => field.dataset.mapField));
try {
 const origin = process.env.JUKEBOX_URL || "http://127.0.0.1:8001";
 if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(new URL(origin).hostname)) throw new Error("The map visibility audit may only target a local server.");
 const musicUrl = new URL(origin);
 musicUrl.searchParams.set("view", "music");
 await page.goto(musicUrl.href, { waitUntil: "networkidle" });
 await page.waitForSelector("[data-source-card]");
 if (await page.locator("#intro #intro-skip").count()) {
  await page.locator("#intro-skip").click({ force: true });
  await page.waitForSelector("#intro", { state: "detached", timeout: 5000 });
 }
 for (const toggle of await page.locator(".visibility-toggle input").all()) {
  await toggle.uncheck();
  assert.equal(await toggle.isChecked(), false);
 }
 assert.deepEqual(await canvasIds(), [], "all unchecked map canvases must be removed");
 assert.deepEqual(await page.evaluate(() => window.__VISIBILITY_ERRORS__), []);
 await page.locator("[data-source-card]").first().screenshot({ path: "/tmp/map-layer-checkbox.png" });
  assert.equal(await page.locator(".primary-nav").getByRole("link", { name: "Layer explorer", exact: true }).count(), 0);
 await page.getByLabel("Show land and coasts", { exact: true }).uncheck();
 assert.equal(await page.locator(".geoplanes").count(), 0);
  assert.equal(await page.locator(".primary-nav").getByRole("link", { name: "Layer explorer", exact: true }).count(), 0);
 await page.getByLabel("Show land and coasts", { exact: true }).check();
 await page.getByLabel("Selected map only", { exact: true }).check();
 assert.deepEqual(await canvasIds(), [], "selection must not silently re-enable hidden fields");
 await page.getByRole("button", { name: "Explore Active fires musical mapping" }).click();
 assert.deepEqual(await canvasIds(), [], "focused fields remain subject to their checkbox");
 const visibleRain = page.getByLabel("Show Precipitation on map and enable its musical layer", { exact: true });
 await visibleRain.focus();
 await page.keyboard.press("Space");
 assert.equal(await visibleRain.isChecked(), true);
 await page.waitForSelector("canvas[data-map-field=precipitation]");
 assert.deepEqual(await canvasIds(), ["precipitation"]);
 await visibleRain.uncheck();
 await page.getByLabel("Selected map only", { exact: true }).uncheck();
 assert.equal(await page.locator("canvas[data-map-field=precipitation]").count(), 0);
 await page.getByRole("button", { name: "Solo / Explore" }).click();
 const focusedRain = page.getByRole("button", { name: "Explore Precipitation musical mapping" });
 await focusedRain.click();
 await visibleRain.uncheck();
 await page.locator("[data-map-field=precipitation]").waitFor({ state: "detached" });
 assert.equal(await focusedRain.getAttribute("aria-pressed"), "true", "audio focus stays separate from visual visibility");
 assert.deepEqual(reactErrors.filter((message) => message.includes("read-only field")), []);
 console.log(JSON.stringify({ tested: musicUrl.href, allFiveRemoved: true, keyboardRestore: true, focusKeepsVisibility: true, selectedOnly: true, controlledInputErrors: 0 }));
 const retired = await browser.newPage({ viewport: { width: 1400, height: 950 }, reducedMotion: "reduce" });
 try {
  const retiredUrl = new URL(origin);
  retiredUrl.searchParams.set("view", "layers");
  await retired.goto(retiredUrl.href, { waitUntil: "networkidle" });
  if (await retired.locator("#intro #intro-skip").count()) {
   await retired.locator("#intro-skip").click({ force: true });
   await retired.waitForSelector("#intro", { state: "detached", timeout: 5000 });
  }
  assert.equal(await retired.locator(".layer-studio").count(), 0);
  assert.equal(await retired.locator("#overview-title").count(), 1);
  console.log(JSON.stringify({ tested: retiredUrl.href, layerExplorerRetired: true }));
 } finally { await retired.close(); }
} finally {
 await browser.close();
}
