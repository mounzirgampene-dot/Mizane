// MIZANE — Modules de gestion : facturation et calculatrice.
import { store, $app, esc, money, openModal, toast } from "../state.js";
import { invoiceHTML, printHTML } from "../print.js";

import { calculate } from "../calculator.js";
export function viewBilling() {
  const invoices = (store.entries || [])
    .filter((entry) => entry.journal === "VTE" && (entry.lines || []).some((line) =>
      (Number(line.credit) || 0) > 0 && String(line.account).startsWith("7")))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);

  $app.innerHTML = `
    <h1>Facturation</h1>
    <div class="card">
      <p class="muted">Les factures sont établies à partir des écritures de ventes validées dans le journal VTE. Pour créer une nouvelle facture, utilisez la saisie comptable et choisissez le journal VTE.</p>
      <div class="grid cols-3">
        <div class="kpi"><div class="value">${invoices.length}</div><div class="label">Factures enregistrées</div></div>
        <div class="kpi"><div class="value">${money(invoices.reduce((sum, entry) => sum + entry.lines.reduce((total, line) => total + (Number(line.debit) || 0), 0), 0))}</div><div class="label">Total TTC cumulé</div></div>
        <div class="kpi"><div class="value">${money(invoices.reduce((sum, entry) => sum + entry.lines.reduce((total, line) => total + (Number(line.credit) || 0), 0), 0))}</div><div class="label">Total crédits des ventes et taxes</div></div>
      </div>
    </div>
    <div class="card">
      <h2>Registre des factures</h2>
      ${invoices.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Référence</th><th>Client</th><th class="num">TTC</th><th>Action</th></tr></thead>
        <tbody>${invoices.map((entry) => {
          const total = entry.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
          const client = (entry.lines.find((line) => line.third) || {}).third || "—";
          return `<tr><td>${esc(entry.date)}</td><td>${esc(entry.reference || "VTE-" + entry.id)}</td><td>${esc(client)}</td><td class="num">${money(total)}</td><td><button class="small" data-invoice-id="${entry.id}">Consulter / imprimer</button></td></tr>`;
        }).join("")}</tbody>
      </table></div>` : '<p class="muted">Aucune facture de vente enregistrée. Les écritures VTE comportant un compte de produits (classe 7) apparaîtront ici.</p>'}
      <div class="actions"><button class="secondary" data-go-sales>Saisir une vente</button></div>
    </div>`;

  $app.querySelector("[data-go-sales]")?.addEventListener("click", () => {
    location.hash = "entry";
    document.querySelector('#main-nav [data-route="entry"]')?.click();
  });
  $app.querySelectorAll("[data-invoice-id]").forEach((button) => button.addEventListener("click", () => {
    const entry = invoices.find((item) => item.id === Number(button.dataset.invoiceId));
    if (!entry) return toast("Cette facture n'est plus disponible.");
    openModal(`<h2>Facture ${esc(entry.reference || "#" + entry.id)}</h2>${invoiceHTML(store, entry)}
      <div class="actions"><button id="billing-print">Imprimer / enregistrer en PDF</button><button class="secondary" data-close>Fermer</button></div>`);
    document.getElementById("billing-print").addEventListener("click", () =>
      printHTML("Facture " + (entry.reference || entry.id), invoiceHTML(store, entry)));
  }));
}

export function viewCalculator() {
  $app.innerHTML = `
    <h1>Calculatrice</h1>
    <div class="card" style="max-width:620px">
      <p class="muted">Calculatrice simple pour les opérations courantes. Les calculs ne modifient pas les écritures comptables.</p>
      <div class="grid cols-2">
        <div><label for="calc-left">Premier nombre</label><input id="calc-left" type="number" step="any" inputmode="decimal" placeholder="0"></div>
        <div><label for="calc-right">Deuxième nombre</label><input id="calc-right" type="number" step="any" inputmode="decimal" placeholder="0"></div>
      </div>
      <div class="row" style="margin-top:12px">
        <div><label for="calc-operation">Opération</label><select id="calc-operation">
          <option value="+">Addition (+)</option><option value="-">Soustraction (−)</option>
          <option value="*">Multiplication (×)</option><option value="/">Division (÷)</option>
        </select></div>
        <div class="nogrow"><button id="calc-run" style="margin-top:24px">Calculer</button></div>
      </div>
      <div id="calc-result" class="card" aria-live="polite" style="margin-top:14px">
        <div class="label">Résultat</div><div class="value" id="calc-value">—</div>
      </div>
      <p id="calc-error" class="errors" role="alert"></p>
      <div class="actions"><button class="secondary" id="calc-reset">Effacer</button></div>
    </div>`;

  document.getElementById("calc-run").addEventListener("click", () => {
    const left = document.getElementById("calc-left").value;
    const right = document.getElementById("calc-right").value;
    const operator = document.getElementById("calc-operation").value;
    const output = document.getElementById("calc-value");
    const error = document.getElementById("calc-error");
    try {
      if (left.trim() === "" || right.trim() === "") throw new Error("Renseignez les deux nombres.");
      output.textContent = new Intl.NumberFormat(store.settings.locale || "fr-FR", { maximumFractionDigits: 8 }).format(calculate(left, operator, right));
      error.textContent = "";
    } catch (err) {
      output.textContent = "—";
      error.textContent = err.message;
    }
  });
  document.getElementById("calc-reset").addEventListener("click", () => {
    document.getElementById("calc-left").value = "";
    document.getElementById("calc-right").value = "";
    document.getElementById("calc-value").textContent = "—";
    document.getElementById("calc-error").textContent = "";
  });
}
