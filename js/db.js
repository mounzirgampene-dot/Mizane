// MIZANE — Persistance (localStorage) + import/export JSON.
import { newStore, buildAccountCache, validDate, round2 } from "./accounting.js";

const KEY = "mizane_v1";
const JOURNALS_OK = ["ACH", "VTE", "BAN", "CAI", "OD"];
const QUOTA_WARN_BYTES = 4500000;

function storageWarn(msg) {
  if (typeof document === "undefined") return;
  try {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(storageWarn._t);
    storageWarn._t = setTimeout(() => t.classList.add("hidden"), 6000);
  } catch (_e) { /* hors navigateur */ }
}

export function loadStore(planAccounts) {
  let store;
  try {
    const raw = localStorage.getItem(KEY);
    store = raw ? JSON.parse(raw) : null;
  } catch (_e) {
    store = null;
  }
  if (!store || !store.settings) store = newStore();
  if (!Array.isArray(store.assets)) store.assets = [];
  store.__planAccounts = planAccounts;
  buildAccountCache(store, planAccounts);
  return store;
}

export function saveStore(store) {
  const { __planAccounts, __accountCache, ...clean } = store;
  const json = JSON.stringify(clean);
  try {
    localStorage.setItem(KEY, json);
  } catch (_e) {
    storageWarn("⚠ Sauvegarde locale impossible : stockage plein ou indisponible. Exportez une sauvegarde (JSON) puis libérez de l'espace.");
    return false;
  }
  if (json.length > QUOTA_WARN_BYTES) storageWarn("⚠ Stockage local presque plein : pensez à exporter une sauvegarde (JSON).");
  return true;
}

export function exportJSON(store) {
  const { __planAccounts, __accountCache, ...clean } = store;
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
  downloadBlob(blob, `mizane-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
}

const num = (v) => (v === "" || v == null ? 0 : Number(v));

// Valide et nettoie une sauvegarde : structure, version, dates, journaux, montants.
export function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Fichier de sauvegarde invalide.");
  if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings) || !Array.isArray(data.entries)) {
    throw new Error("Fichier de sauvegarde invalide : sections settings et entries requises.");
  }
  if (data.version != null && (!Number.isInteger(Number(data.version)) || Number(data.version) > 1 || Number(data.version) < 1)) {
    throw new Error(`Version de sauvegarde non prise en charge (${data.version}).`);
  }
  for (const key of ["thirds", "assets"]) {
    if (data[key] != null && !Array.isArray(data[key])) throw new Error(`Section « ${key} » invalide.`);
  }
  if (data.settings.customAccounts != null && !Array.isArray(data.settings.customAccounts)) {
    throw new Error("La liste des comptes personnalisés est invalide.");
  }

  const ids = new Set();
  const entries = data.entries.map((e, index) => {
    const label = `Écriture ${index + 1}`;
    if (!e || typeof e !== "object" || Array.isArray(e)) throw new Error(`${label} : structure invalide.`);
    if (!validDate(e.date)) throw new Error(`${label} : date invalide.`);
    if (!JOURNALS_OK.includes(e.journal)) throw new Error(`${label} : journal inconnu.`);
    if (!Array.isArray(e.lines) || e.lines.length < 2) throw new Error(`${label} : au moins deux lignes sont requises.`);
    const id = Number(e.id);
    if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) throw new Error(`${label} : identifiant absent, invalide ou dupliqué.`);
    ids.add(id);

    const lines = e.lines.map((l, lineIndex) => {
      if (!l || typeof l !== "object" || Array.isArray(l)) throw new Error(`${label}, ligne ${lineIndex + 1} : structure invalide.`);
      const account = String(l.account || "").trim();
      const debitRaw = num(l.debit);
      const creditRaw = num(l.credit);
      if (!account) throw new Error(`${label}, ligne ${lineIndex + 1} : compte obligatoire.`);
      if (!Number.isFinite(debitRaw) || !Number.isFinite(creditRaw) || debitRaw < 0 || creditRaw < 0 ||
          debitRaw > 999999999999 || creditRaw > 999999999999) {
        throw new Error(`${label}, ligne ${lineIndex + 1} : montant invalide ou excessif.`);
      }
      const debit = round2(debitRaw), credit = round2(creditRaw);
      if ((debit > 0) === (credit > 0)) throw new Error(`${label}, ligne ${lineIndex + 1} : renseignez un seul côté, débit ou crédit.`);
      return { account, label: String(l.label || ""), third: String(l.third || ""), debit, credit };
    });
    const debitTotal = round2(lines.reduce((sum, l) => sum + l.debit, 0));
    const creditTotal = round2(lines.reduce((sum, l) => sum + l.credit, 0));
    if (debitTotal <= 0 || Math.abs(debitTotal - creditTotal) > 0.001) {
      throw new Error(`${label} : écriture déséquilibrée (${debitTotal} / ${creditTotal}).`);
    }
    const reverseOf = e.reverseOf == null ? null : Number(e.reverseOf);
    if (reverseOf != null && (!Number.isSafeInteger(reverseOf) || reverseOf < 1 || reverseOf === id)) {
      throw new Error(`${label} : lien de contrepassation invalide.`);
    }
    return {
      id, date: e.date, journal: e.journal, reference: String(e.reference || ""),
      lines, reversed: Boolean(e.reversed), reverseOf,
      createdAt: String(e.createdAt || ""),
    };
  });

  const entryIds = new Set(entries.map((e) => e.id));
  for (const e of entries) {
    if (e.reverseOf != null && !entryIds.has(e.reverseOf)) throw new Error(`Écriture #${e.id} : écriture d'origine de la contrepassation introuvable.`);
  }
  const nextId = data.nextId == null ? Math.max(0, ...ids) + 1 : Number(data.nextId);
  if (!Number.isSafeInteger(nextId) || nextId <= Math.max(0, ...ids)) throw new Error("Le prochain identifiant d'écriture est invalide.");

  return {
    ...data,
    version: 1,
    thirds: Array.isArray(data.thirds) ? data.thirds : [],
    assets: Array.isArray(data.assets) ? data.assets : [],
    entries,
    nextId,
  };
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(validateBackup(JSON.parse(reader.result)));
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

export function exportXLS(title, tableHTML, filename) {
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><h3>${title}</h3>${tableHTML}</body></html>`;
  downloadBlob(new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8" }), filename);
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
