// MIZANE — Impression : injecte le document dans une zone dédiée puis lance l'impression.
import { invoiceHTML } from "./invoice.js";
import { store, esc } from "./state.js";

export { invoiceHTML };

export function printHTML(title, inner) {
  let area = document.getElementById("print-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "print-area";
    document.body.appendChild(area);
  }
  area.innerHTML = `
    <div class="print-doc">
      <div class="print-head">${esc(title)}</div>
      ${inner}
      <div class="print-foot">Édité avec MIZANE — ${esc(store.settings.companyName)} — ${new Date().toLocaleString()}</div>
    </div>`;
  window.print();
}
