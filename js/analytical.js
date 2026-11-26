// MIZANE — Écran de comptabilité analytique.
import { saveStore } from "./db.js";
import { store, planAccounts, $app, toast, esc, money } from "./state.js";
import { buildAnalyticalReport, validateAnalyticalCenter, validateAnalyticalAllocation } from "./analytical-core.js";

const accountTypes = () => Object.fromEntries([...planAccounts, ...(store.settings.customAccounts || [])].map(item => [String(item.code), item.type]));
const ensureData = () => {
  if (!Array.isArray(store.settings.analyticalCenters)) store.settings.analyticalCenters = [];
  if (!Array.isArray(store.settings.analyticalAllocations)) store.settings.analyticalAllocations = [];
};
const typeLabel = type => type === "cost" ? "Centre de coûts" : type === "profit" ? "Centre de profit" : "Centre mixte";

export function viewAnalytical() {
  ensureData();
  const centers = store.settings.analyticalCenters;
  const allocations = store.settings.analyticalAllocations;
  const types = accountTypes();
  const start = store.settings.exerciceStart || "";
  const end = store.settings.exerciceEnd || "";
  const report = buildAnalyticalReport({ centers, allocations, entries: store.entries || [], accountTypes: types, startDate: start, endDate: end });
  const centerOptions = centers.map(center => '<option value="' + esc(center.id) + '">' + esc(center.name) + '</option>').join("");
  const sourceOptions = report.unallocated.map(item => '<option value="' + item.entryId + ':' + item.lineIndex + '">' + esc(item.date + " · " + item.journal + " · " + item.account + " — " + item.label + " · " + money(item.amount) + " · reste " + item.remainingPercentage + " %") + '</option>').join("");
  const rows = report.rows.map(row => '<tr><td><strong>' + esc(row.name) + '</strong><div class="muted">' + typeLabel(row.type) + '</div></td><td class="num">' + money(row.income) + '</td><td class="num">' + money(row.expenses) + '</td><td class="num">' + money(row.result) + '</td><td>' + row.allocations + '</td></tr>').join("");
  const unallocatedRows = report.unallocated.slice(0, 100).map(item => '<tr><td>' + esc(item.date) + '</td><td>' + esc(item.account + " — " + item.label) + '</td><td>' + (item.type === "expense" ? "Charge" : "Produit") + '</td><td class="num">' + money(item.amount) + '</td><td class="num">' + item.remainingPercentage + ' %</td></tr>').join("");
  const issueRows = report.issues.map(item => '<li>' + esc(item.message) + ' (affectation ' + esc(item.allocationId) + ')</li>').join("");
  const allocationRows = allocations.map(item => {
    const entry = store.entries.find(row => String(row.id) === String(item.entryId));
    const line = entry?.lines?.[Number(item.lineIndex)];
    const center = centers.find(row => row.id === item.centerId);
    return '<tr><td>' + esc(entry?.date || "—") + '</td><td>' + esc(line?.account || "—") + '</td><td>' + esc(center?.name || "Centre supprimé") + '</td><td class="num">' + esc(item.percentage) + ' %</td><td><button type="button" class="danger small" data-aa-delete="' + esc(item.id) + '">Retirer</button></td></tr>';
  }).join("");
  $app.innerHTML = `
    <h1>Comptabilité analytique</h1>
    <p class="muted">Exercice : ${esc(start)} → ${esc(end)}. Les affectations analytiques sont distinctes des écritures générales : aucune écriture comptable n'est modifiée.</p>
    <div class="grid cols-3">
      <section class="card kpi"><div class="label">Produits affectés</div><div class="value">${money(report.totals.income)}</div></section>
      <section class="card kpi"><div class="label">Charges affectées</div><div class="value">${money(report.totals.expenses)}</div></section>
      <section class="card kpi"><div class="label">Résultat analytique</div><div class="value">${money(report.totals.result)}</div></section>
    </div>
    <section class="card">
      <h2>Centres analytiques</h2>
      <p class="muted">Créez des centres de coûts, de profit ou mixtes : services, départements, projets, agences ou activités.</p>
      <div class="row"><div><label>Nom du centre</label><input id="aa-center-name" maxlength="100" placeholder="Ex. Service commercial"></div><div><label>Type</label><select id="aa-center-type"><option value="cost">Centre de coûts</option><option value="profit">Centre de profit</option><option value="mixed">Centre mixte</option></select></div><div class="nogrow"><button id="aa-center-add">Créer le centre</button></div></div>
      ${centers.length ? '<div class="table-wrap"><table><thead><tr><th>Centre</th><th>Type</th><th>Affectations</th></tr></thead><tbody>' + centers.map(center => '<tr><td>' + esc(center.name) + '</td><td>' + typeLabel(center.type) + '</td><td>' + allocations.filter(item => item.centerId === center.id).length + '</td></tr>').join("") + '</tbody></table></div>' : '<p class="muted">Aucun centre créé.</p>'}
    </section>
    <section class="card">
      <h2>Affecter des charges et produits</h2>
      <p class="muted">Une ligne peut être répartie entre plusieurs centres. Le cumul des affectations est limité à 100 %. Les montants non affectés restent visibles dans la liste de contrôle.</p>
      <div class="row"><div><label>Ligne comptable non totalement affectée</label><select id="aa-source"><option value="">Sélectionner une ligne</option>${sourceOptions}</select></div><div><label>Centre analytique</label><select id="aa-target"><option value="">Sélectionner un centre</option>${centerOptions}</select></div><div><label>Pourcentage</label><input id="aa-percentage" type="number" min="0.01" max="100" step="0.01" value="100"></div><div class="nogrow"><button id="aa-allocate" ${!centers.length || !report.unallocated.length ? "disabled" : ""}>Affecter</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Compte</th><th>Centre</th><th class="num">Part</th><th>Action</th></tr></thead><tbody>${allocationRows || '<tr><td colspan="5" class="muted">Aucune affectation enregistrée.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card">
      <h2>Résultats par centre</h2>
      <div class="table-wrap"><table><thead><tr><th>Centre</th><th class="num">Produits</th><th class="num">Charges</th><th class="num">Résultat</th><th>Affectations</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Aucun résultat analytique pour cette période.</td></tr>'}</tbody></table></div>
    </section>
    <section class="card">
      <h2>Éléments non affectés</h2>
      <p class="muted">${report.unallocated.length} ligne(s) comportent encore une part non affectée. Affichage limité aux 100 premières.</p>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Compte</th><th>Nature</th><th class="num">Montant</th><th class="num">Part restante</th></tr></thead><tbody>${unallocatedRows || '<tr><td colspan="5" class="muted">Toutes les lignes admissibles sont affectées.</td></tr>'}</tbody></table></div>
    </section>
    ${issueRows ? '<section class="card"><h2>Anomalies d’affectation</h2><ul>' + issueRows + '</ul></section>' : ""}
  `;
  $app.querySelector("#aa-center-add")?.addEventListener("click", () => {
    const center = { id: "ac-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), name: $app.querySelector("#aa-center-name").value.trim(), type: $app.querySelector("#aa-center-type").value, createdAt: new Date().toISOString() };
    const validation = validateAnalyticalCenter(center, centers);
    if (!validation.ok) return toast(validation.errors.join(" "));
    centers.push(center); saveStore(store); toast("Centre analytique créé."); viewAnalytical();
  });
  $app.querySelector("#aa-allocate")?.addEventListener("click", () => {
    const [entryId, lineIndex] = ($app.querySelector("#aa-source").value || "").split(":");
    const allocation = { id: "al-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), entryId, lineIndex: Number(lineIndex), centerId: $app.querySelector("#aa-target").value, percentage: Number($app.querySelector("#aa-percentage").value), createdAt: new Date().toISOString() };
    const validation = validateAnalyticalAllocation(allocation, { centers, allocations, entries: store.entries || [], accountTypes: types });
    if (!validation.ok) return toast(validation.errors.join(" "));
    allocations.push(allocation); saveStore(store); toast("Affectation analytique enregistrée."); viewAnalytical();
  });
  $app.querySelectorAll("[data-aa-delete]").forEach(button => button.addEventListener("click", () => {
    store.settings.analyticalAllocations = allocations.filter(item => item.id !== button.dataset.aaDelete);
    saveStore(store); toast("Affectation retirée."); viewAnalytical();
  }));
}
