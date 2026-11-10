// MIZANE — Persistance (localStorage) + import/export JSON.
import { newStore, buildAccountCache } from "./accounting.js";

const KEY = "mizane_v1";

export function loadStore(planAccounts) {
  let store;
  try {
    const raw = localStorage.getItem(KEY);
    store = raw ? JSON.parse(raw) : null;
  } catch (e) {
    store = null;
  }
  if (!store || !store.settings) store = newStore();
  store.__planAccounts = planAccounts;
  buildAccountCache(store, planAccounts);
  return store;
}

export function saveStore(store) {
  const { __planAccounts, __accountCache, ...clean } = store;
  localStorage.setItem(KEY, JSON.stringify(clean));
}

export function exportJSON(store) {
  const { __planAccounts, __accountCache, ...clean } = store;
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
  downloadBlob(blob, `mizane-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.settings || !Array.isArray(data.entries)) throw new Error("Fichier de sauvegarde invalide.");
        resolve(data);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsText(file);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function resetStore() {
  localStorage.removeItem(KEY);
}

export function demoData(store) {
  const y = new Date().getFullYear();
  const d = (m, day) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  store.entries = [];
  store.nextId = 1;
  const E = (date, journal, reference, lines) => store.entries.push({
    id: store.nextId++, date, journal, reference, lines, reversed: false, reverseOf: null, createdAt: new Date().toISOString(),
  });
  // Apport en capital
  E(d(1, 5), "BAN", "Apport capital", [
    { account: "521", label: "Dépôt en banque", debit: 5000000, credit: 0 },
    { account: "101", label: "Capital social", debit: 0, credit: 5000000 },
  ]);
  // Achat marchandises à crédit + TVA
  E(d(1, 12), "ACH", "FCT-001 Fournisseur Diallo", [
    { account: "601", label: "Achat marchandises", debit: 800000, credit: 0 },
    { account: "4453", label: "TVA récupérable 18%", debit: 144000, credit: 0 },
    { account: "401", label: "Fournisseur Diallo", third: "Diallo & Fils", debit: 0, credit: 944000 },
  ]);
  // Vente au comptant espèces
  E(d(1, 20), "VTE", "TCK-014 Client comptant", [
    { account: "571", label: "Caisse", debit: 472000, credit: 0 },
    { account: "701", label: "Ventes marchandises", debit: 0, credit: 400000 },
    { account: "4431", label: "TVA facturée 18%", debit: 0, credit: 72000 },
  ]);
  // Vente à crédit
  E(d(2, 3), "VTE", "FCT-002 Client Ndiaye", [
    { account: "411", label: "Client Ndiaye", third: "Awa Ndiaye", debit: 1180000, credit: 0 },
    { account: "701", label: "Ventes marchandises", debit: 0, credit: 1000000 },
    { account: "4431", label: "TVA facturée 18%", debit: 0, credit: 180000 },
  ]);
  // Règlement fournisseur par banque
  E(d(2, 10), "BAN", "Vir. Fournisseur Diallo", [
    { account: "401", label: "Fournisseur Diallo", third: "Diallo & Fils", debit: 500000, credit: 0 },
    { account: "521", label: "Banque", debit: 0, credit: 500000 },
  ]);
  // Loyer
  E(d(2, 28), "OD", "Loyer boutique", [
    { account: "6221", label: "Loyer", debit: 250000, credit: 0 },
    { account: "521", label: "Banque", debit: 0, credit: 250000 },
  ]);
  // Salaires
  E(d(2, 28), "OD", "Salaires janvier", [
    { account: "6611", label: "Salaires", debit: 600000, credit: 0 },
    { account: "521", label: "Banque", debit: 0, credit: 600000 },
  ]);
  // Achat matériel de transport
  E(d(3, 6), "ACH", "Facture moto", [
    { account: "2455", label: "Matériel de transport", debit: 1500000, credit: 0 },
    { account: "521", label: "Banque", debit: 0, credit: 1500000 },
  ]);
  store.thirds = [
    { name: "Diallo & Fils", type: "fournisseur", phone: "+221 77 000 00 01", email: "diallo@example.sn" },
    { name: "Awa Ndiaye", type: "client", phone: "+221 77 000 00 02", email: "awa@example.sn" },
  ];
  return store;
}
