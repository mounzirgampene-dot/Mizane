// MIZANE — Conformité fiscale Maroc 2026, calculs traçables et paramétrables.
const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const amount = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : NaN;
const validDate = value => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

export const MOROCCO_TAX_VERSION = "2026.1";
export const MOROCCO_IR_BRACKETS = [
  { from: 0, to: 40000, rate: 0 },
  { from: 40000, to: 60000, rate: 10 },
  { from: 60000, to: 80000, rate: 20 },
  { from: 80000, to: 100000, rate: 30 },
  { from: 100000, to: 180000, rate: 34 },
  { from: 180000, to: Infinity, rate: 37 },
];
export const MOROCCO_WITHHOLDING_RULES = [
  { code: "MA_WHT_SERVICE_COMPANY_5", label: "Honoraires, commissions et loyers — personne morale éligible", rate: 5, taxType: "IS", legalReference: "CGI 2026, art. 19-IV-A, 15 bis et 15 ter", requiresEligibility: true },
  { code: "MA_WHT_NONRESIDENT_10", label: "Produits bruts versés à un non-résident", rate: 10, taxType: "IS_IR", legalReference: "CGI 2026, art. 19-IV-B et 73-II-B-1°", requiresTreatyReview: true },
  { code: "MA_WHT_DIVIDENDS_EXEMPT", label: "Dividendes versés à une société marocaine soumise à l'IS — exonération sous attestation", rate: 0, taxType: "IS", legalReference: "CGI 2026, art. 6-I-C-1°", requiresEligibility: true },
  { code: "MA_WHT_DIVIDENDS_2025", label: "Dividendes et produits de participation — 2025", rate: 12.5, taxType: "IS_IR", validFrom: "2025-01-01", validTo: "2025-12-31", legalReference: "CGI, art. 247-XXXVII-C", requiresEligibility: true },
  { code: "MA_WHT_DIVIDENDS_2026", label: "Dividendes et produits de participation — 2026", rate: 11.25, taxType: "IS_IR", validFrom: "2026-01-01", validTo: "2026-12-31", legalReference: "CGI 2026, art. 247-XXXVII-C", requiresEligibility: true },
  { code: "MA_WHT_DIVIDENDS_2027", label: "Dividendes et produits de participation — à compter de 2027", rate: 10, taxType: "IS_IR", validFrom: "2027-01-01", validTo: null, legalReference: "CGI 2026, art. 247-XXXVII-C", requiresEligibility: true },
  { code: "MA_WHT_FIXED_INCOME_20", label: "Produits de placements à revenu fixe / Sukuk", rate: 20, taxType: "IS", legalReference: "CGI 2026, art. 19-IV-C", requiresEligibility: true },
  { code: "MA_WHT_OCCASIONAL_30", label: "Rémunérations occasionnelles hors personnel salarié — cas visés", rate: 30, taxType: "IR", legalReference: "CGI 2026, art. 58-II-C et 73-II-G", requiresEligibility: true },
];

export function calculateMoroccoIS({
  accountingResult, additions = 0, deductions = 0, rateCategory = "standard",
  cmGeneralBase = 0, cmReducedBase = 0, cmRate = 0.25, cmExempt = false,
  priorYearCredits = 0, withholdingCredits = 0, advancePayments = 0,
} = {}) {
  const inputs = { accountingResult, additions, deductions, cmGeneralBase, cmReducedBase, cmRate, priorYearCredits, withholdingCredits, advancePayments };
  const errors = Object.entries(inputs).filter(([key, value]) => !Number.isFinite(Number(value)) || (key !== "accountingResult" && Number(value) < 0)).map(([key]) => key + " : montant invalide.");
  if (!["standard", "high_profit", "financial"].includes(rateCategory)) errors.push("Catégorie de taux IS invalide.");
  if (Number(cmRate) !== 0.25) errors.push("Le taux général de cotisation minimale est fixé à 0,25 % ; 0,15 % est réservé aux opérations éligibles.");
  if (errors.length) return { ok: false, errors };
  const fiscalProfit = round2(Number(accountingResult) + Number(additions) - Number(deductions));
  const taxableProfit = Math.max(0, fiscalProfit);
  const rate = rateCategory === "financial" ? 40 : rateCategory === "high_profit" ? 35 : 20;
  const calculatedIS = round2(taxableProfit * rate / 100);
  const cmBase = round2(Number(cmGeneralBase) + Number(cmReducedBase));
  const cm = cmExempt ? 0 : Math.max(3000, round2(Number(cmGeneralBase) * Number(cmRate) / 100 + Number(cmReducedBase) * 0.15 / 100));
  const grossDue = Math.max(calculatedIS, cm);
  const credits = round2(Number(priorYearCredits) + Number(withholdingCredits) + Number(advancePayments));
  const netDue = Math.max(0, round2(grossDue - credits));
  const warnings = [];
  if (rateCategory === "standard" && taxableProfit >= 100000000) warnings.push("Bénéfice fiscal atteignant 100 millions MAD : vérifier le taux de 35 % et les exclusions légales.");
  if (rateCategory === "standard" && taxableProfit < 100000000) warnings.push("Le taux de 20 % sous le seuil de 100 millions MAD est soumis à la condition de bénéfice inférieur à ce seuil pendant trois exercices consécutifs ; vérifier l'historique.");
  if (rateCategory === "high_profit" && taxableProfit < 100000000) warnings.push("Le taux de 35 % doit être vérifié au regard de la règle des trois exercices consécutifs et des exceptions de l'article 19-I-B.");
  if (rateCategory === "financial") warnings.push("Le taux de 40 % est réservé aux catégories d'établissements expressément visées à l'article 19-I-C.");
  if (cmReducedBase > 0) warnings.push("Le taux CM de 0,15 % ne concerne que les ventes éligibles de produits légalement énumérés.");
  if (cmExempt) warnings.push("Exonération de cotisation minimale sélectionnée : vérifier la période de 36 mois, la date de début d'exploitation et les exceptions.");
  return {
    ok: true, countryCode: "MA", rulesVersion: MOROCCO_TAX_VERSION, currency: "MAD",
    accountingResult: round2(accountingResult), additions: round2(additions), deductions: round2(deductions),
    fiscalProfit, taxableProfit, rate, calculatedIS, cmBase, minimumContribution: cm,
    grossTaxDue: grossDue, credits, netDue, warnings,
    legalReference: "CGI 2026, articles 9, 19, 20, 144, 169 et 170",
    disclaimer: "Simulation de liquidation : les retraitements fiscaux, exclusions, crédits, déficits reportables et conditions particulières doivent être validés avant déclaration.",
  };
}

export function calculateMoroccoIR({ annualNetTaxableIncome, dependents = 0 } = {}) {
  const income = amount(annualNetTaxableIncome);
  const count = Number(dependents);
  if (!Number.isFinite(income) || !Number.isInteger(count) || count < 0 || count > 100) return { ok: false, errors: ["Revenu annuel imposable ou nombre de personnes à charge invalide."] };
  let tax = 0;
  const breakdown = [];
  for (const bracket of MOROCCO_IR_BRACKETS) {
    const taxable = Math.max(0, Math.min(income, bracket.to) - bracket.from);
    const due = round2(taxable * bracket.rate / 100);
    if (taxable > 0) breakdown.push({ from: bracket.from, to: bracket.to, rate: bracket.rate, taxableBase: round2(taxable), tax: due });
    tax = round2(tax + due);
  }
  const familyReduction = Math.min(3600, count * 600);
  const annualTax = Math.max(0, round2(tax - familyReduction));
  return {
    ok: true, currency: "MAD", annualNetTaxableIncome: round2(income),
    grossAnnualTax: tax, dependents: count, familyReduction,
    annualTax, monthlyEquivalent: round2(annualTax / 12), effectiveRate: income ? round2(annualTax / income * 100) : 0,
    breakdown, legalReference: "CGI 2026, articles 59, 73-I et 74",
    disclaimer: "Le calcul porte sur le revenu net imposable annuel déjà déterminé après exonérations et déductions légales. Il ne remplace pas le calcul de la paie, des cotisations sociales ou des avantages en nature.",
  };
}


export function calculateMoroccoIRProfessional({
  fiscalProfit, additions = 0, deductions = 0, dependents = 0,
  minimumContributionBase = 0, cmRate = 0.25, cmExempt = false,
  credits = 0,
} = {}) {
  const values = { fiscalProfit, additions, deductions, minimumContributionBase, credits };
  const errors = Object.entries(values).filter(([key, value]) => !Number.isFinite(Number(value)) || (key !== "fiscalProfit" && Number(value) < 0)).map(([key]) => key + " : montant invalide.");
  if (![0.25, 0.15, 4].includes(Number(cmRate))) errors.push("Taux de cotisation minimale IR non autorisé.");
  if (errors.length) return { ok: false, errors };
  const profit = round2(Number(fiscalProfit) + Number(additions) - Number(deductions));
  const taxableProfit = Math.max(0, profit);
  const ir = calculateMoroccoIR({ annualNetTaxableIncome: taxableProfit, dependents });
  if (!ir.ok) return ir;
  const minimumContribution = cmExempt ? 0 : Math.max(1500, round2(Number(minimumContributionBase) * Number(cmRate) / 100));
  const grossDue = Math.max(ir.annualTax, minimumContribution);
  const netDue = Math.max(0, round2(grossDue - Number(credits)));
  const warnings = [];
  if (cmRate === 0.15) warnings.push("Le taux de 0,15 % est réservé aux ventes commerciales des produits légalement énumérés.");
  if (cmRate === 4) warnings.push("Le taux de 4 % ne concerne que les professions expressément visées aux articles 89-I-12° et 91-VI-1° du CGI.");
  if (cmExempt) warnings.push("L'exonération de cotisation minimale IR est limitée aux trois premiers exercices de l'activité professionnelle ou agricole, sous conditions.");
  return {
    ok: true, currency: "MAD", fiscalProfit: profit, taxableProfit,
    annualIR: ir.annualTax, grossAnnualIR: ir.grossAnnualTax,
    minimumContribution, grossDue, credits: round2(credits), netDue,
    cmRate: Number(cmRate), warnings,
    legalReference: "CGI 2026, articles 73, 74 et 144",
    disclaimer: "Simulation IR professionnel et cotisation minimale : vérifier le régime RNR/RNS, la nature de l'activité, les exonérations et les éléments de base avant déclaration.",
  };
}

export function calculateMoroccoWithholding({ ruleCode, baseAmount, customRate, customLegalReference, date, payerEligible = false, treatyRate, applyTreaty = false } = {}) {
  const base = amount(baseAmount);
  if (!Number.isFinite(base) || !validDate(date)) return { ok: false, errors: ["Base ou date de mise à disposition invalide."] };
  const rule = MOROCCO_WITHHOLDING_RULES.find(item => item.code === ruleCode);
  let rate = rule?.rate;
  if (ruleCode === "CUSTOM") {
    rate = Number(customRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100 || !String(customLegalReference || "").trim()) return { ok: false, errors: ["Un taux personnalisé valide et sa référence juridique sont obligatoires."] };
  } else if (!rule) return { ok: false, errors: ["Catégorie de retenue inconnue."] };
  if (rule?.code === "MA_WHT_SERVICE_COMPANY_5" && !payerEligible) return { ok: false, errors: ["Le taux de 5 % exige un payeur et un bénéficiaire répondant aux conditions de l'article 19-IV-A."] };
  if (rule?.validFrom && date < rule.validFrom || rule?.validTo && date > rule.validTo) return { ok: false, errors: ["Cette version du taux de retenue sur dividendes n'est pas applicable à la date choisie."] };
  const warnings = [];
  if (rule?.requiresTreatyReview) warnings.push("Vérifier la convention fiscale applicable, le bénéficiaire effectif et les justificatifs avant d'appliquer un taux conventionnel.");
  if (rule?.requiresEligibility) warnings.push("Vérifier le statut fiscal du bénéficiaire, la nature exacte du revenu et les conditions légales.");
  if (applyTreaty) {
    const treaty = treatyRate === "" || treatyRate == null ? NaN : Number(treatyRate);
    if (!Number.isFinite(treaty) || treaty < 0 || treaty > rate) return { ok: false, errors: ["Taux conventionnel invalide : justificatif et taux autorisé requis."] };
    rate = treaty;
    warnings.push("Taux conventionnel appliqué sur saisie expresse : conserver le certificat de résidence et les justificatifs.");
  }
  const taxAmount = round2(base * rate / 100);
  return { ok: true, currency: "MAD", ruleCode: rule?.code || "CUSTOM", label: rule?.label || "Taux personnalisé", rate, baseAmount: round2(base), taxAmount, netPayment: round2(base - taxAmount), date, legalReference: rule?.legalReference || String(customLegalReference), warnings };
}

export function buildMoroccoTaxCalendar({ fiscalEnd, year, withholdingMonths = [] } = {}) {
  const errors = [];
  if (!validDate(fiscalEnd)) errors.push("Date de clôture d'exercice invalide.");
  const targetYear = Number(year);
  if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2200) errors.push("Année fiscale invalide.");
  if (errors.length) return { ok: false, errors, items: [] };
  const nextDate = (date, months, day) => {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(Math.min(day, last)).padStart(2, "0");
  };
  const items = [
    { id: "IS_ANNUAL_" + fiscalEnd.slice(0, 4), taxType: "IS", title: "Déclaration annuelle du résultat fiscal (IS)", period: fiscalEnd.slice(0, 4), dueDate: nextDate(fiscalEnd, 3, Number(fiscalEnd.slice(8, 10))), legalReference: "CGI 2026, art. 20-I", confidence: "statutory" },
    { id: "PAYROLL_ANNUAL_" + targetYear, taxType: "IR", title: "État annuel des traitements et salaires", period: String(targetYear - 1), dueDate: targetYear + "-02-28", legalReference: "CGI 2026, art. 79-I", confidence: "statutory" },
  ];
  for (const month of withholdingMonths) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) continue;
    const [y, m] = month.split("-").map(Number);
    const due = new Date(Date.UTC(y, m + 1, 0));
    const dueDate = due.getUTCFullYear() + "-" + String(due.getUTCMonth() + 1).padStart(2, "0") + "-" + String(due.getUTCDate()).padStart(2, "0");
    items.push({ id: "WHT_" + month, taxType: "WITHHOLDING", title: "Déclaration / versement des retenues à la source — à confirmer selon la catégorie", period: month, dueDate, legalReference: "CGI 2026, articles 156 et 174", confidence: "review_required" });
  }
  return { ok: true, items: items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), disclaimer: "Calendrier indicatif. Les échéances TVA, acomptes IS, retenues particulières et reports liés aux jours fériés doivent être confirmés selon le régime et le calendrier DGI de l'année." };
}

export function reconcileTaxLedger({ entries = [], accounts = {}, declared = {}, startDate, endDate } = {}) {
  const results = [];
  for (const [taxType, accountCodes] of Object.entries(accounts || {})) {
    const codes = (Array.isArray(accountCodes) ? accountCodes : [accountCodes]).map(value => String(value || "").trim()).filter(Boolean);
    if (!codes.length) continue;
    let debit = 0, credit = 0;
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (startDate && validDate(startDate) && entry?.date < startDate) continue;
      if (endDate && validDate(endDate) && entry?.date > endDate) continue;
      for (const line of Array.isArray(entry?.lines) ? entry.lines : []) {
        if (!codes.includes(String(line?.account || ""))) continue;
        debit += Number(line.debit || 0);
        credit += Number(line.credit || 0);
      }
    }
    const ledgerBalance = round2(credit - debit);
    const declaredAmount = Number(declared?.[taxType]);
    results.push({
      taxType, accounts: codes, debit: round2(debit), credit: round2(credit), ledgerBalance,
      declaredAmount: Number.isFinite(declaredAmount) ? round2(declaredAmount) : null,
      difference: Number.isFinite(declaredAmount) ? round2(ledgerBalance - declaredAmount) : null,
      status: Number.isFinite(declaredAmount) ? Math.abs(ledgerBalance - declaredAmount) <= 0.01 ? "balanced" : "difference" : "missing_declaration",
    });
  }
  return { ok: true, results, disclaimer: "Rapprochement indicatif sur les comptes sélectionnés. Vérifier le sens du solde, les écritures de règlement, les extournes et le périmètre de période avant validation." };
}

export function validateTaxDeclaration(item) {
  const errors = [];
  if (!String(item?.taxType || "").trim()) errors.push("Type de déclaration obligatoire.");
  if (!String(item?.period || "").trim()) errors.push("Période obligatoire.");
  if (!validDate(item?.dueDate)) errors.push("Échéance invalide.");
  if (!["draft", "reviewed", "filed", "paid"].includes(String(item?.status || "draft"))) errors.push("Statut de déclaration invalide.");
  if (item?.paymentDate && !validDate(item.paymentDate)) errors.push("Date de paiement invalide.");
  if (item?.amount !== "" && item?.amount != null && (!Number.isFinite(Number(item.amount)) || Number(item.amount) < 0)) errors.push("Montant déclaré invalide.");
  if (item?.status === "paid" && !item.paymentDate) errors.push("Une date de paiement est requise pour le statut payé.");
  return { ok: errors.length === 0, errors };
}
