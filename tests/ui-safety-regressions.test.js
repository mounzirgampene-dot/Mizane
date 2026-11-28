import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const charts = read("../js/charts.js");
const entries = read("../js/views/core.js");
const cloudDocuments = read("../js/accounting-documents-cloud.js");

console.log("— Régressions UI et permissions —");

assert.match(charts, /data-chart-mode="table"/);
assert.match(charts, /data-chart-mode="chart"/);
assert.match(charts, /aria-pressed="true"/);
assert.match(charts, /table\.hidden = showChart/);
assert.match(charts, /chart\.hidden = !showChart/);

for (const [path, id] of [
  ["../js/customer-followups.js", "followups"],
  ["../js/commercial-margins.js", "margins"],
  ["../js/budget.js", "budget"],
  ["../js/analytical.js", "analytical"],
  ["../js/stock.js", "stock"],
]) {
  const source = read(path);
  assert.ok(source.includes(`chartModeControls("${id}")`) || source.includes(`chartModeControls('${id}')`), `${id}: contrôle Tableau/Graphiques présent`);
  assert.ok(source.includes(`bindChartMode("${id}")`) || source.includes(`bindChartMode('${id}')`), `${id}: bascule Tableau/Graphiques reliée`);
  assert.ok(source.includes(`${id}-table-view`), `${id}: conteneur tableau présent`);
  assert.ok(source.includes(`${id}-chart-view`), `${id}: conteneur graphique présent`);
}

const deleteHandler = entries.slice(entries.indexOf('$app.querySelectorAll("[data-delete-entry]")'), entries.indexOf('$app.querySelectorAll("[data-reverse]")'));
assert.ok(deleteHandler.length > 0, "gestionnaire de suppression des écritures présent");
assert.match(deleteHandler, /entry\.reversed\s*\|\|\s*entry\.reverseOf/);
assert.match(deleteHandler, /if\s*\(!confirmed\)\s*return/);
assert.match(deleteHandler, /store\.entries\.splice\(index,\s*1\)/);
assert.match(deleteHandler, /saveStore\(store\)/);
assert.match(deleteHandler, /router\.render\(\)/);

assert.match(cloudDocuments, /membership\.status\s*!==\s*"active"/);
assert.match(cloudDocuments, /canWrite:\["admin","accountant"\]\.includes\(membership\.role\)/);
assert.match(cloudDocuments, /if\(!ctx\.canWrite\)throw new Error/);
assert.match(cloudDocuments, /upsert:false/);
assert.match(cloudDocuments, /createAccountingDocumentMetadata/);

console.log("✓ Bascule des vues, suppression protégée des écritures et droits du coffre documentaire validés.");
