// MIZANE — Moteur fiscal international, règles versionnées par juridiction et période.
// Les taux marocains 2026 sont limités aux taux normaux de 20 % et 10 %.
// Les traitements à 0 % exigent une qualification explicite et une base juridique.
export const TAX_ENGINE_VERSION = "1.0.0";

const moroccoRules = [
  { code: "MA_VAT_STANDARD", countryCode: "MA", taxType: "VAT", rate: 20, treatment: "taxable", label: "TVA — taux normal 20 %", validFrom: "2026-01-01", validTo: null, legalReference: "CGI 2026, article 99" },
  { code: "MA_VAT_REDUCED_10", countryCode: "MA", taxType: "VAT", rate: 10, treatment: "taxable", label: "TVA — taux réduit 10 %", validFrom: "2026-01-01", validTo: null, legalReference: "CGI 2026, article 99" },
  { code: "MA_VAT_EXEMPT_DEDUCTION", countryCode: "MA", taxType: "VAT", rate: 0, treatment: "exempt_with_deduction", label: "Exonération avec droit à déduction — qualification requise", validFrom: "2026-01-01", validTo: null, legalReference: "CGI 2026 — article d'exonération à préciser" },
  { code: "MA_VAT_EXEMPT_NO_DEDUCTION", countryCode: "MA", taxType: "VAT", rate: 0, treatment: "exempt_without_deduction", label: "Exonération sans droit à déduction — qualification requise", validFrom: "2026-01-01", validTo: null, legalReference: "CGI 2026 — article d'exonération à préciser" },
  { code: "MA_VAT_OUT_OF_SCOPE", countryCode: "MA", taxType: "VAT", rate: 0, treatment: "out_of_scope", label: "Hors champ de TVA — justification requise", validFrom: "2026-01-01", validTo: null, legalReference: "CGI 2026 — territorialité et champ d'application" },
];

const profiles = {
  MA: {
    countryCode: "MA",
    countryName: "Maroc",
    currency: "MAD",
    status: "active",
    authority: "Direction Générale des Impôts (DGI)",
    rulesVersion: "2026.1",
    rulesEffectiveFrom: "2026-01-01",
    legalSources: [
      { label: "Code général des impôts 2026", url: "https://www.finances.gov.ma/Publication/dgi/2025/cgi-2026-fr.pdf" },
      { label: "Loi de finances n° 50-25 pour 2026", url: "https://www.sgg.gov.ma/BO/FR/2873/2025/BO_7465-bis_fr.pdf" },
      { label: "Notes circulaires de la DGI", url: "https://www.tax.gov.ma/wps/portal/DGI/Documentation-fiscale/Notes-circulaires" },
    ],
    rules: moroccoRules,
  },
};

export function getTaxCountryProfile(countryCode) {
  const code = String(countryCode || "").trim().toUpperCase();
  const profile = profiles[code];
  return profile ? { ...profile, rules: profile.rules.map(rule => ({ ...rule })) } : {
    countryCode: code,
    countryName: code || "Pays non défini",
    currency: "",
    status: "not_configured",
    authority: "",
    rulesVersion: "",
    rulesEffectiveFrom: "",
    legalSources: [],
    rules: [],
  };
}

export function getActiveTaxRules(countryCode, taxType, date) {
  if (!isValidTaxDate(date)) return [];
  const profile = getTaxCountryProfile(countryCode);
  if (profile.status !== "active") return [];
  return profile.rules.filter(rule => rule.taxType === String(taxType || "").toUpperCase()
    && rule.validFrom <= date && (!rule.validTo || rule.validTo >= date));
}

export function validateTaxRule(rule) {
  const errors = [];
  if (!/^[A-Z]{2}$/.test(String(rule?.countryCode || ""))) errors.push("Code pays invalide.");
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(String(rule?.code || ""))) errors.push("Code fiscal invalide.");
  if (!["VAT", "IS", "IR", "WITHHOLDING", "OTHER"].includes(String(rule?.taxType || ""))) errors.push("Type d'impôt invalide.");
  const rate = Number(rule?.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.push("Taux fiscal invalide (0 à 100 %).");
  if (!isValidTaxDate(rule?.validFrom)) errors.push("Date de début d'effet invalide.");
  if (rule?.validTo && (!isValidTaxDate(rule.validTo) || rule.validTo < rule.validFrom)) errors.push("Date de fin d'effet invalide.");
  if (!String(rule?.label || "").trim()) errors.push("Libellé fiscal obligatoire.");
  return { ok: errors.length === 0, errors };
}

export function resolveTaxRule({ countryCode, taxType = "VAT", taxCode, date } = {}) {
  if (!String(taxCode || "").trim()) return null;
  return getActiveTaxRules(countryCode, taxType, date).find(rule => rule.code === taxCode) || null;
}

export function calculateTaxLine({ baseAmount, taxCode, countryCode, taxType = "VAT", date } = {}) {
  const base = Number(baseAmount);
  if (!Number.isFinite(base) || base < 0) return { ok: false, errors: ["Base imposable invalide."] };
  const rule = resolveTaxRule({ countryCode, taxType, taxCode, date });
  if (!rule) return { ok: false, errors: ["Règle fiscale absente, inactive ou non applicable à la date de l'opération."] };
  const taxAmount = round2(base * rule.rate / 100);
  return { ok: true, errors: [], countryCode: rule.countryCode, taxCode: rule.code, taxType: rule.taxType, rate: rule.rate, treatment: rule.treatment, baseAmount: round2(base), taxAmount, totalAmount: round2(base + taxAmount), ruleVersion: getTaxCountryProfile(countryCode).rulesVersion };
}

export function buildVatReport({ countryCode, startDate, endDate, salesDocuments = [], purchaseDocuments = [] } = {}) {
  if (!isValidTaxDate(startDate) || !isValidTaxDate(endDate) || startDate > endDate) {
    return { ok: false, errors: ["La période fiscale est invalide."], byCurrency: {}, rows: [], warnings: [] };
  }
  const profile = getTaxCountryProfile(countryCode);
  if (profile.status !== "active") {
    return { ok: false, errors: ["Le référentiel fiscal de ce pays n'est pas encore activé."], byCurrency: {}, rows: [], warnings: [] };
  }
  const byCurrency = {};
  const rows = [];
  const warnings = [];
  let documentsCount = 0;
  const collect = (documents, direction) => {
    for (const document of Array.isArray(documents) ? documents : []) {
      if (!isValidTaxDate(document?.date) || document.date < startDate || document.date > endDate) continue;
      if (!["invoice", "credit_note"].includes(document?.type)) continue;
      if (["draft", "cancelled", "credited", "void", "rejected"].includes(String(document?.status || "").toLowerCase())) continue;
      const currency = String(document.currency || profile.currency || "").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        warnings.push({ code: "invalid_currency", documentId: document.id ?? null, message: "Devise invalide ou absente sur un document fiscal." });
        continue;
      }
      const sign = document.type === "credit_note" ? -1 : 1;
      const lines = Array.isArray(document.lines) ? document.lines : [];
      if (!lines.length) {
        warnings.push({ code: "missing_lines", documentId: document.id ?? null, message: "Document sans lignes détaillées : exclu du calcul par taux." });
        continue;
      }
      documentsCount += 1;
      const documentRules = getActiveTaxRules(countryCode, "VAT", document.date);
      const rulesByRate = new Map(documentRules.filter(rule => rule.treatment === "taxable").map(rule => [rule.rate, rule]));
      for (const [index, line] of lines.entries()) {
        const rawBase = line?.amount !== undefined && line?.amount !== null
          ? Number(line.amount)
          : Number(line?.quantity || 0) * Number(direction === "sales" ? line?.unitPrice || 0 : line?.unitCost || line?.unitPrice || 0);
        if (!Number.isFinite(rawBase) || rawBase < 0) {
          warnings.push({ code: "invalid_base", documentId: document.id ?? null, line: index + 1, message: "Base imposable invalide : ligne ignorée." });
          continue;
        }
        const explicitRule = line?.taxCode ? documentRules.find(item => item.code === line.taxCode) || null : null;
        const rawRate = line?.taxRate ?? document?.accounting?.taxRate ?? document?.taxRate;
        let rate = rawRate === "" || rawRate === null || rawRate === undefined ? NaN : Number(rawRate);
        if (!Number.isFinite(rate) && explicitRule) rate = explicitRule.rate;
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          warnings.push({ code: "missing_tax_rate", documentId: document.id ?? null, line: index + 1, message: "Taux fiscal absent ou invalide : ligne à qualifier." });
          continue;
        }
        let rule = explicitRule;
        if (rule && Math.abs(rule.rate - rate) > 0.0001) {
          warnings.push({ code: "tax_code_rate_mismatch", documentId: document.id ?? null, line: index + 1, message: "Le code fiscal et le taux de TVA de la ligne sont incohérents." });
          rule = null;
        }
        if (!line?.taxCode && rate > 0) rule = rulesByRate.get(rate) || null;
        if (!rule) {
          warnings.push({ code: rate === 0 ? "zero_rate_unqualified" : "unsupported_rate", documentId: document.id ?? null, line: index + 1, rate, message: rate === 0 ? "Taux 0 % : distinguer exonération avec ou sans droit à déduction et opération hors champ." : "Taux non reconnu par le référentiel actif : vérifier la date et la qualification fiscale." });
        }
        const taxAmount = round2(rawBase * rate / 100) * sign;
        const baseAmount = round2(rawBase) * sign;
        const key = currency + "|" + (rule?.code || "UNCLASSIFIED_" + String(rate));
        let row = rows.find(item => item.key === key && item.direction === direction);
        if (!row) {
          row = { key, currency, direction, taxCode: rule?.code || null, label: rule?.label || (rate === 0 ? "TVA 0 % — qualification manquante" : "Taux non référencé"), rate, treatment: rule?.treatment || "unclassified", baseAmount: 0, taxAmount: 0, deductibleTax: 0, lineCount: 0 };
          rows.push(row);
        }
        row.baseAmount = round2(row.baseAmount + baseAmount);
        row.taxAmount = round2(row.taxAmount + taxAmount);
        if (direction === "purchases" && line?.taxDeductible === true && rule?.treatment === "taxable") row.deductibleTax = round2(row.deductibleTax + taxAmount);
        row.lineCount += 1;
        const summary = byCurrency[currency] ||= { salesBase: 0, outputVat: 0, purchaseBase: 0, inputVat: 0, deductibleInputVat: 0, unclassifiedBase: 0, unclassifiedVat: 0, netVatPayable: 0 };
        if (direction === "sales") {
          summary.salesBase = round2(summary.salesBase + baseAmount);
          summary.outputVat = round2(summary.outputVat + taxAmount);
        } else {
          summary.purchaseBase = round2(summary.purchaseBase + baseAmount);
          summary.inputVat = round2(summary.inputVat + taxAmount);
          if (line?.taxDeductible === true && rule?.treatment === "taxable") summary.deductibleInputVat = round2(summary.deductibleInputVat + taxAmount);
        }
        if (!rule) {
          summary.unclassifiedBase = round2(summary.unclassifiedBase + baseAmount);
          summary.unclassifiedVat = round2(summary.unclassifiedVat + taxAmount);
        }
      }
    }
  };
  collect(salesDocuments, "sales");
  collect(purchaseDocuments, "purchases");
  for (const summary of Object.values(byCurrency)) summary.netVatPayable = round2(summary.outputVat - summary.deductibleInputVat);
  return {
    ok: true,
    errors: [],
    countryCode: profile.countryCode,
    rulesVersion: profile.rulesVersion,
    currency: profile.currency,
    startDate,
    endDate,
    documentsCount,
    byCurrency,
    rows: rows.sort((a, b) => a.currency.localeCompare(b.currency) || a.direction.localeCompare(b.direction) || a.rate - b.rate),
    warnings,
    disclaimer: "Simulation analytique provisoire : ne constitue pas une déclaration fiscale officielle. La déductibilité doit être qualifiée et justifiée ligne par ligne.",
  };
}

function isValidTaxDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}
function round2(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
