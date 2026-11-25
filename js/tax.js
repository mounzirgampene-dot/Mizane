// MIZANE — Espace fiscal : référentiel pays et aperçu analytique TVA.
import { store, $app, esc, money } from "./state.js";
import { buildVatReport, getActiveTaxRules, getTaxCountryProfile } from "./tax-core.js";

const today = () => new Date().toISOString().slice(0, 10);
const fiscalStart = () => store.settings.exerciceStart || today().slice(0, 4) + "-01-01";
const fiscalEnd = () => store.settings.exerciceEnd || today().slice(0, 4) + "-12-31";
const amount = (value, currency) => {
  try { return new Intl.NumberFormat(store.settings.locale || "fr-MA", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return Number(value || 0).toFixed(2) + " " + currency; }
};

export function viewTax() {
  const countryCode = String(store.settings.country || "").toUpperCase();
  const profile = getTaxCountryProfile(countryCode);
  const startDate = document.getElementById("tax-start")?.value || fiscalStart();
  const endDate = document.getElementById("tax-end")?.value || fiscalEnd();
  const rules = getActiveTaxRules(countryCode, "VAT", endDate);
  const sales = store.billing?.documents || [];
  const purchases = store.billing?.purchases?.documents || [];
  const report = buildVatReport({ countryCode, startDate, endDate, salesDocuments: sales, purchaseDocuments: purchases });
  const currencies = report.ok ? Object.entries(report.byCurrency) : [];
  const summaryCards = currencies.map(([currency, item]) => `
    <section class="card kpi"><div class="label">TVA nette théorique · ${esc(currency)}</div><div class="value">${amount(item.netVatPayable, currency)}</div><div class="muted">Collectée : ${amount(item.outputVat, currency)} · Déductible qualifiée : ${amount(item.deductibleInputVat, currency)}</div></section>`).join("");
  const rows = report.ok ? report.rows.map(row => `<tr><td>${esc(row.direction === "sales" ? "Ventes" : "Achats")}</td><td>${esc(row.label)}</td><td class="num">${row.rate.toFixed(2)} %</td><td class="num">${amount(row.baseAmount, row.currency)}</td><td class="num">${amount(row.taxAmount, row.currency)}</td><td class="num">${amount(row.deductibleTax, row.currency)}</td></tr>`).join("") : "";
  const warnings = report.ok ? report.warnings.map(item => `<li>${esc(item.message)} ${item.documentId == null ? "" : "Document #" + esc(item.documentId)}${item.line ? " — ligne " + item.line : ""}</li>`).join("") : "";
  const sourceLinks = profile.legalSources.map(item => `<li><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.label)}</a></li>`).join("");
  const ruleRows = rules.map(rule => `<tr><td>${esc(rule.code)}</td><td>${esc(rule.label)}</td><td class="num">${rule.rate.toFixed(2)} %</td><td>${esc(rule.validFrom)}${rule.validTo ? " → " + esc(rule.validTo) : " → en vigueur"}</td></tr>`).join("");
  $app.innerHTML = `
    <h1>Gestion fiscale internationale</h1>
    <p class="muted">Référentiel : ${esc(profile.countryName)} · ${profile.status === "active" ? "Pays activé" : "Référentiel non configuré"} · Version ${esc(profile.rulesVersion || "—")} · Devise : ${esc(profile.currency || store.settings.currency || "—")}</p>
    ${profile.status !== "active" ? `<section class="card"><h2>Référentiel fiscal indisponible</h2><p>Le moteur international est prêt à accueillir ce pays, mais ses règles n'ont pas encore été vérifiées et activées. Aucun taux ne sera supposé.</p></section>` : `
      <form id="tax-period-form" class="card">
        <h2>Aperçu TVA — période fiscale</h2>
        <div class="row">
          <div><label for="tax-start">Du</label><input id="tax-start" type="date" value="${esc(startDate)}" required></div>
          <div><label for="tax-end">Au</label><input id="tax-end" type="date" value="${esc(endDate)}" required></div>
          <div class="nogrow"><button type="submit">Actualiser le calcul</button></div>
        </div>
        <p class="muted">Les montants sont ventilés par devise et calculés à partir des factures de vente et d'achat enregistrées. Les montants en devises différentes ne sont jamais additionnés.</p>
      </form>
      <div class="grid cols-3">${summaryCards || '<section class="card"><p class="muted">Aucun document fiscal exploitable sur cette période.</p></section>'}</div>
      <section class="card table-wrap">
        <h2>Détail par nature et taux</h2>
        <table><thead><tr><th>Flux</th><th>Traitement</th><th class="num">Taux</th><th class="num">Base</th><th class="num">TVA</th><th class="num">TVA déductible</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">Aucune ligne de TVA à afficher.</td></tr>'}</tbody></table>
      </section>
      <section class="card">
        <h2>Référentiel TVA actif</h2>
        <p class="muted">Autorité : ${esc(profile.authority)} · Application à partir du ${esc(profile.rulesEffectiveFrom)}. Les taux réduits sont réservés aux opérations légalement éligibles ; le choix du taux doit être justifié par la nature de l'opération.</p>
        <div class="table-wrap"><table><thead><tr><th>Code</th><th>Traitement fiscal</th><th class="num">Taux</th><th>Validité</th></tr></thead><tbody>${ruleRows}</tbody></table></div>
        <h3>Sources juridiques</h3><ul>${sourceLinks}</ul>
      </section>
      <section class="card">
        <h2>Points à vérifier</h2>
        <p>${report.ok ? report.warnings.length + " alerte(s) de qualification." : esc(report.errors.join(" "))}</p>
        <ul>${warnings || '<li>Aucune anomalie de taux détectée dans les lignes analysées.</li>'}</ul>
        <p class="muted">${esc(report.disclaimer || "Les calculs restent indicatifs tant que le référentiel fiscal du pays n'est pas activé.")}</p>
      </section>
    `}
    <p class="muted">Le module ne dépose aucune déclaration, n'effectue aucun paiement et ne génère aucune écriture comptable. Les règles fiscales et les justificatifs restent soumis à validation humaine.</p>
  `;
  document.getElementById("tax-period-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const start = document.getElementById("tax-start").value;
    const end = document.getElementById("tax-end").value;
    if (!start || !end || start > end) return window.alert("La période fiscale est invalide.");
    viewTax();
  });
}
