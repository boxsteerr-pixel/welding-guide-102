import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const files = ["index.html", "css/style.css", "js/app.js", "data/manual.json", "manifest.json", "service-worker.js", "assets/icons/icon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png"];
await Promise.all(files.map((file) => stat(path.join(root, file))));
const [html, app, dataText, manifestText, sw] = await Promise.all([read("index.html"), read("js/app.js"), read("data/manual.json"), read("manifest.json"), read("service-worker.js")]);
const manual = JSON.parse(dataText);
const manifest = JSON.parse(manifestText);

assert.equal(manual.machine.machineId, "102");
assert.equal(manual.machine.machineName, "102激光焊机");
assert.equal(manual.machine.manualVersion, "0.2.0");
assert.deepEqual(manual.faults.map(({id, page, steps}) => [id, page, steps.length]), [
  ["chiller-1-to-2", "1", 5], ["chiller-2-to-1", "2", 5],
  ["table-jam", "3", 6], ["focus-alignment", "4", 4],
  ["limit-monitor", "5", 1], ["clear-nozzle", "6", 8], ["coolant-refill", "7", 7]
]);
assert.deepEqual(manual.faults[1].steps.map(step => step.sourceNumber), ["1", "2", "3", "5", "5"]);
assert.deepEqual(manual.faults[3].steps.map(step => step.sourceNumber), ["1", "3", "4", "5"]);
assert.match(manual.faults[4].review, /现场安全审核并取得授权/);
assert.match(manual.faults[5].warning, /两个安全销/);
const figureIds = new Set();
for (const item of manual.faults) {
  for (const step of item.steps) {
    assert.ok(step.text);
    for (const figure of step.figures || []) {
      assert.ok(figure.caption && Object.hasOwn(manual.images, figure.image));
      figureIds.add(figure.image);
      for (const [x, y, w, h, kind] of figure.marks || []) {
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 100 && y + h <= 100);
        assert.ok(kind === undefined || kind === "arrow" || kind === "circle");
      }
    }
  }
}
assert.equal(figureIds.size, 24);
assert.deepEqual(figureIds, new Set(Object.keys(manual.images)));
const hashes = await Promise.all([...figureIds].map(async (id) => {
  const bytes = await readFile(path.join(root, "assets/images/emergency", `${id}.${manual.images[id].format || "jpg"}`));
  return createHash("sha256").update(bytes).digest("hex");
}));
assert.equal(new Set(hashes).size, figureIds.size, "重复原图应复用资源");
assert.deepEqual(manual.maintenance, []);
assert.deepEqual(manual.safety, []);
assert.equal(manifest.start_url, "./");
assert.equal(manifest.scope, "./");
assert.match(sw, /const CACHE_NAME = "welding-guide-102-v14"/);
for (const [, asset] of html.matchAll(/(?:src|href)="(\.\/[^"]+\?v=\d+)"/g)) {
  assert.ok(sw.includes(JSON.stringify(asset)), `离线缓存须包含 ${asset}`);
}
assert.match(html, /id="currentTime"/);
assert.match(html, /system-time\.js\?v=1/);
assert.match(sw, /system-time\.js\?v=1/);
assert.match(sw, /const CACHE_PREFIX = "welding-guide-102-"/);
assert.match(sw, /\.\/data\/manual\.json/);
assert.match(app, /fetch\("\.\/data\/manual\.json"/);
assert.match(html, /data-section="faults"/);
assert.match(html, /id="image-modal"/);

const combined = `${html}\n${app}\n${dataText}\n${manifestText}\n${sw}`;
assert.doesNotMatch(combined, /boxsteerr-pixel\.github\.io\/welding-guide\//, "不得引用101线上资源");
assert.doesNotMatch(combined, /(?:src|href)=["']\/welding-guide\//, "不得硬编码101路径");
console.log("welding-guide-102 validation: PASS");
