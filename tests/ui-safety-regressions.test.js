import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const charts = read("../js/charts.js");
const entries = read("../js/views/core.js");
const accountingSync = read("../js/accounting-sync.js");
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
assert.match(entries, /hasAccountingSyncBaseline\(activeCompanyId\)/);
assert.match(entries, /Suppression suspendue : synchronisez d’abord cette entreprise/);
assert.match(accountingSync, /export function hasAccountingSyncBaseline\(companyId\)/);
assert.match(accountingSync, /SHADOW_PREFIX \+ String\(companyId\)/);

assert.match(deleteHandler, /if\s*\(!confirmed\)\s*return/);
assert.match(deleteHandler, /store\.entries\.splice\(index,\s*1\)/);
assert.match(deleteHandler, /saveStore\(store\)/);
assert.match(deleteHandler, /if\s*\(!saveStore\(store\)\)/);
assert.match(deleteHandler, /store\.entries\.splice\(index,\s*0,\s*removedEntry\)/);
assert.match(deleteHandler, /Suppression annulée : la sauvegarde locale a échoué/);

assert.match(deleteHandler, /router\.render\(\)/);

assert.match(cloudDocuments, /membership\.status\s*!==\s*"active"/);
assert.match(cloudDocuments, /canWrite:\["admin","accountant"\]\.includes\(membership\.role\)/);
assert.match(cloudDocuments, /if\(!ctx\.canWrite\)throw new Error/);
assert.match(cloudDocuments, /upsert:false/);
assert.match(cloudDocuments, /createAccountingDocumentMetadata/);


const settings = read("../js/views/assistant.js");
const companyStorage = read("../js/company-storage.js");
const portal = read("../js/saas-portal.js");
const app = read("../js/app.js");

assert.match(settings, /const hasPostedEntries = \(\) => Array\.isArray\(store\.entries\) && store\.entries\.length > 0/);
assert.match(settings, /Changement de plan bloqué/);
assert.match(settings, /Le pays a changé, mais le plan comptable actif est conservé/);
assert.match(settings, /Enregistrement refusé : une migration comptable contrôlée est obligatoire/);
assert.match(settings, /s\.country = c\.code/);
assert.match(settings, /s\.currency = document\.getElementById\("s-currency"\)\.value/);
assert.match(settings, /applyPlanMigration\(store, \{ sourcePlan: source, targetPlan: target, mapping \}\)/);

assert.match(companyStorage, /export function lockCompanyStorage/);
assert.match(companyStorage, /export function unlockCompanyStorage/);
assert.match(companyStorage, /reason: "session-locked"/);
assert.match(companyStorage, /lock\.companyId !== targetCompanyId/);
assert.match(companyStorage, /authorizedCompanyMember = false/);
assert.doesNotMatch(companyStorage, /removeItem\(["']mizane_v1["']\)/);
assert.match(portal, /\["admin","accountant"\]\.includes\(lockedMembership\.role\)/);
assert.match(portal, /unlockCompanyStorage\(session\.user\.id,sessionLock\.companyId,\{authorizedCompanyMember:true\}\)/);
assert.match(app, /storageStatus\.reason === "session-locked"/);

console.log("✓ Bascule des vues, suppression synchronisée, coffre documentaire, verrouillage de session et protection pays/plan validés.");
