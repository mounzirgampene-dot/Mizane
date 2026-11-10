// MIZANE — Génération de facture (HTML imprimable) à partir d'une écriture de vente.
import { formatMoney } from "./countries.js";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function invoiceHTML(store, entry) {
  const s = store.settings;
  const fmt = (n) => formatMoney(n, s.currency, s.locale);
  const totTTC = entry.lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
  const htLines = entry.lines.filter((l) => (Number(l.credit) || 0) > 0 && String(l.account).startsWith("7"));
  const totHT = htLines.reduce((a, l) => a + Number(l.credit), 0);
  const totTVA = entry.lines.reduce((a, l) => a + (Number(l.credit) || 0), 0) - totHT;
  const third = (entry.lines.find((l) => l.third) || {}).third || "";

  if (htLines.length === 0) {
    return `
      <div class="inv-head"><div><h2>${esc(s.companyName)}</h2><p class="muted">${esc(s.country)} — ${esc(s.currency)}</p></div>
      <div><h3>PIÈCE COMPTABLE #${entry.id}</h3><p>Date : ${esc(entry.date)}</p><p>Journal : ${esc(entry.journal)}</p></div></div>
      <table><thead><tr><th>Compte</th><th>Libellé</th><th class="num">Débit</th><th class="num">Crédit</th></tr></thead>
      <tbody>${entry.lines.map((l) => `<tr><td>${esc(l.account)}</td><td>${esc(l.label)}</td><td class="num">${l.debit ? fmt(l.debit) : ""}</td><td class="num">${l.credit ? fmt(l.credit) : ""}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="num">${fmt(totTTC)}</td><td class="num">${fmt(totTTC)}</td></tr></tfoot></table>`;
  }

  return `
    <div class="inv-head">
      <div><h2>${esc(s.companyName)}</h2><p class="muted">${esc(s.country)} — ${esc(s.currency)}</p></div>
      <div><h3>FACTURE</h3><p>N° ${esc(entry.reference || entry.id)}</p><p>Date : ${esc(entry.date)}</p><p>Client : ${esc(third || "—")}</p></div>
    </div>
    <table><thead><tr><th>Libellé</th><th class="num">Montant HT</th></tr></thead>
    <tbody>${htLines.map((l) => `<tr><td>${esc(l.label || l.account)}</td><td class="num">${fmt(l.credit)}</td></tr>`).join("")}</tbody></table>
    <table class="inv-totals">
      <tr><td>Total HT</td><td class="num">${fmt(totHT)}</td></tr>
      ${totTVA > 0 ? `<tr><td>TVA</td><td class="num">${fmt(totTVA)}</td></tr>` : ""}
      <tr class="total"><td><strong>Total TTC à payer</strong></td><td class="num"><strong>${fmt(totTTC)}</strong></td></tr>
    </table>
    <p class="muted">Arrêtée à la somme de ${fmt(totTTC)}. Merci de votre confiance.</p>`;
}
