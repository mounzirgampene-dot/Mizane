// MIZANE — Calculateurs fiscaux étrangers vérifiés, version 2026.1.
// Calculs partiels et transparents : les règles complexes non modélisées restent exclues.
const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const validAmount = value => Number.isFinite(Number(value)) && Number(value) >= 0;
const validSigned = value => Number.isFinite(Number(value));
const validDate = value => { const m=String(value||"").match(/^(\\d{4})-(\\d{2})-(\\d{2})$/); if(!m)return false; const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]; };
const FR_IR_BRACKETS = [
  { from: 0, to: 11600, rate: 0 },
  { from: 11600, to: 29579, rate: 11 },
  { from: 29579, to: 84577, rate: 30 },
  { from: 84577, to: 181917, rate: 41 },
  { from: 181917, to: Infinity, rate: 45 },
];
const BE_IR_BRACKETS = [
  { from: 0, to: 16720, rate: 25 },
  { from: 16720, to: 29510, rate: 40 },
  { from: 29510, to: 51070, rate: 45 },
  { from: 51070, to: Infinity, rate: 50 },
];
function progressiveTax(income, brackets) {
  let tax = 0;
  const breakdown = [];
  for (const bracket of brackets) {
    const base = Math.max(0, Math.min(income, bracket.to) - bracket.from);
    const due = round2(base * bracket.rate / 100);
    if (base > 0) breakdown.push({ from: bracket.from, to: Number.isFinite(bracket.to) ? bracket.to : null, rate: bracket.rate, base: round2(base), tax: due });
    tax = round2(tax + due);
  }
  return { tax, breakdown };
}
export function calculateFranceIS({ fiscalProfit, additions = 0, deductions = 0, reducedRateEligible = false } = {}) {
  const values = { fiscalProfit, additions, deductions };
  if (!validSigned(fiscalProfit) || !validAmount(additions) || !validAmount(deductions) || ![true, false].includes(reducedRateEligible)) {
    return { ok: false, errors: ["Résultat fiscal ou retraitements invalides."] };
  }
  const adjustedProfit = round2(Number(fiscalProfit) + Number(additions) - Number(deductions));
  const taxableProfit = Math.max(0, adjustedProfit);
  const reducedBase = reducedRateEligible ? Math.min(taxableProfit, 42500) : 0;
  const normalBase = round2(taxableProfit - reducedBase);
  const reducedTax = round2(reducedBase * 15 / 100);
  const normalTax = round2(normalBase * 25 / 100);
  return {
    ok: true, countryCode: "FR", currency: "EUR", rulesVersion: "2026.1",
    fiscalProfit: adjustedProfit, taxableProfit, reducedRateEligible,
    reducedBase, reducedRate: reducedBase ? 15 : null, reducedTax,
    normalBase, normalRate: 25, normalTax, grossTax: round2(reducedTax + normalTax),
    legalReference: "CGI, art. 219-I-b",
    warnings: reducedRateEligible
      ? ["Le taux PME de 15 % sur les premiers 42 500 EUR suppose notamment un chiffre d'affaires HT inférieur ou égal à 10 M EUR, un capital entièrement libéré et détenu à au moins 75 % par des personnes physiques ou sociétés éligibles. Vérifier toutes les conditions et exclusions."]
      : ["Taux normal de 25 % appliqué. Le taux PME de 15 % n'est pas activé sans confirmation documentée de toutes les conditions."],
    disclaimer: "Simulation IS simplifiée. Contributions additionnelles, régimes spéciaux, déficits reportables, crédits d'impôt, intégration fiscale et retraitements particuliers ne sont pas calculés.",
  };
}
export function calculateFranceIR({ annualTaxableIncome, householdParts = 1 } = {}) {
  const income = Number(annualTaxableIncome), parts = Number(householdParts);
  if (!validAmount(income) || !Number.isFinite(parts) || parts < 1 || parts > 20 || Math.round(parts * 2) !== parts * 2) {
    return { ok: false, errors: ["Revenu net imposable ou nombre de parts invalide (parts par demi-unité)."] };
  }
  const perPart = income / parts;
  const result = progressiveTax(perPart, FR_IR_BRACKETS);
  const grossTax = round2(result.tax * parts);
  return {
    ok: true, countryCode: "FR", currency: "EUR", rulesVersion: "2026.1",
    annualTaxableIncome: round2(income), householdParts: parts, incomePerPart: round2(perPart),
    annualTax: grossTax, monthlyEquivalent: round2(grossTax / 12),
    effectiveRate: income ? round2(grossTax / income * 100) : 0,
    breakdown: result.breakdown, legalReference: "CGI, art. 197 — barème 2026 sur revenus 2025",
    warnings: ["Calcul au barème par quotient familial uniquement : plafonnement de l'avantage du quotient familial, décote, réductions/crédits, revenus à taux proportionnel et contributions additionnelles exclus."],
    disclaimer: "Le revenu saisi doit être le revenu net imposable du foyer avant division par le nombre de parts. Simulation indicative, non équivalente au simulateur DGFiP complet.",
  };
}
export function calculateBelgiumIS({ fiscalProfit, additions = 0, deductions = 0, smallCompanyEligible = false } = {}) {
  const values = { fiscalProfit, additions, deductions };
  if (!validSigned(fiscalProfit) || !validAmount(additions) || !validAmount(deductions) || ![true, false].includes(smallCompanyEligible)) {
    return { ok: false, errors: ["Résultat fiscal ou retraitements invalides."] };
  }
  const adjustedProfit = round2(Number(fiscalProfit) + Number(additions) - Number(deductions));
  const taxableProfit = Math.max(0, adjustedProfit);
  const reducedBase = smallCompanyEligible ? Math.min(taxableProfit, 100000) : 0;
  const normalBase = round2(taxableProfit - reducedBase);
  const reducedTax = round2(reducedBase * 20 / 100);
  const normalTax = round2(normalBase * 25 / 100);
  return {
    ok: true, countryCode: "BE", currency: "EUR", rulesVersion: "2026.1",
    fiscalProfit: adjustedProfit, taxableProfit, smallCompanyEligible,
    reducedBase, reducedRate: reducedBase ? 20 : null, reducedTax,
    normalBase, normalRate: 25, normalTax, grossTax: round2(reducedTax + normalTax),
    legalReference: "CIR 92, art. 215, al. 2 et art. 2, § 1er, 5°",
    warnings: smallCompanyEligible
      ? ["Le taux réduit de 20 % sur les premiers 100 000 EUR suppose la qualité de petite société et le respect de toutes les conditions et exclusions de l'article 215 CIR 92, notamment la rémunération minimale du dirigeant lorsque requise. Vérifier le dossier."]
      : ["Taux ordinaire de 25 % appliqué. Le taux PME de 20 % n'est pas activé sans confirmation documentée des conditions."],
    disclaimer: "Simulation IS simplifiée. Cotisations distinctes, déductions, limitations, pertes, crédits, régimes spéciaux et conditions détaillées non calculés.",
  };
}
export function calculateBelgiumIR({ annualTaxableIncome, personalAllowance = 11550 } = {}) {
  const income = Number(annualTaxableIncome), allowance = Number(personalAllowance);
  if (!validAmount(income) || !validAmount(allowance) || allowance > 50000) {
    return { ok: false, errors: ["Revenu imposable ou quotité exemptée invalide."] };
  }
  const result = progressiveTax(income, BE_IR_BRACKETS);
  const allowanceReduction = round2(Math.min(result.tax, allowance * 0.25));
  const annualTax = round2(Math.max(0, result.tax - allowanceReduction));
  return {
    ok: true, countryCode: "BE", currency: "EUR", rulesVersion: "2026.1",
    annualTaxableIncome: round2(income), personalAllowance: round2(allowance),
    grossTax: result.tax, allowanceReduction, annualTax,
    effectiveRate: income ? round2(annualTax / income * 100) : 0,
    breakdown: result.breakdown, legalReference: "CIR 92 — barème revenus 2026, exercice d'imposition 2027",
    warnings: ["Calcul fédéral simplifié. Additionnels communaux, réductions personnelles, majorations familiales, revenus distinctement imposés, quotités exemptées majorées et règles de non-résidents exclus."],
    disclaimer: "Le montant de base de la quotité exemptée (11 550 EUR pour les revenus 2026) est valorisé ici au taux de première tranche de 25 %. Le calcul complet doit être vérifié avec Tax-Calc du SPF Finances.",
  };
}
const WHT = {
  FR: [{ code: "FR_NONRESIDENT_DIVIDENDS", label: "Dividendes de source française versés à un non-résident", rate: 12.8, legalReference: "CGI, art. 119 bis et 187 — taux en vigueur au 1er janvier 2026" }],
  BE: [{ code: "BE_MOVABLE_INCOME_STANDARD", label: "Précompte mobilier — taux de base", rate: 30, legalReference: "CIR 92 — précompte mobilier, taux de base SPF Finances" }],
};
export function calculateForeignWithholding({ countryCode, ruleCode, baseAmount, date, treatyRate, applyTreaty = false } = {}) {
  const code = String(countryCode || "").toUpperCase();
  const base = Number(baseAmount);
  if (!["FR", "BE"].includes(code) || !validAmount(base) || !/^2026-\d{2}-\d{2}$/.test(String(date || ""))) {
    return { ok: false, errors: ["Juridiction, base ou date invalide ; ces règles sont versionnées pour 2026."] };
  }
  const rule = WHT[code].find(item => item.code === ruleCode);
  if (!rule) return { ok: false, errors: ["Catégorie de retenue inconnue pour cette juridiction."] };
  let rate = rule.rate;
  const warnings = ["Vérifier la résidence fiscale, la qualification du bénéficiaire, les conditions d'application et les éventuelles exonérations avant toute retenue."];
  if (applyTreaty) {
    const treaty = treatyRate === "" || treatyRate == null ? NaN : Number(treatyRate);
    if (!Number.isFinite(treaty) || treaty < 0 || treaty > rate) return { ok: false, errors: ["Taux conventionnel invalide : justificatif et disposition conventionnelle requis."] };
    rate = treaty;
    warnings.push("Taux conventionnel saisi manuellement : conserver le certificat de résidence et la preuve du droit au bénéfice de la convention.");
  }
  const taxAmount = round2(base * rate / 100);
  return { ok: true, countryCode: code, currency: "EUR", ruleCode, label: rule.label, baseAmount: round2(base), rate, taxAmount, netPayment: round2(base - taxAmount), date, legalReference: rule.legalReference, warnings };
}
