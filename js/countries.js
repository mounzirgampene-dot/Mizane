// MIZANE — Référentiels pays : devise, plan comptable, TVA, format.
export const COUNTRIES = [
  // Zone OHADA (SYSCOHADA)
  { code: "SN", name: "Sénégal", zone: "OHADA", currency: "XOF", plan: "syscohada", vatRates: [18, 10, 0], locale: "fr-SN" },
  { code: "CI", name: "Côte d'Ivoire", zone: "OHADA", currency: "XOF", plan: "syscohada", vatRates: [18, 0], locale: "fr-CI" },
  { code: "ML", name: "Mali", zone: "OHADA", currency: "XOF", plan: "syscohada", vatRates: [18, 0], locale: "fr-ML" },
  { code: "BF", name: "Burkina Faso", zone: "OHADA", currency: "XOF", plan: "syscohada", vatRates: [18, 0], locale: "fr-BF" },
  { code: "BJ", name: "Bénin", zone: "OHADA", currency: "XOF", plan: "syscohada", vatRates: [18, 0], locale: "fr-BJ" },
  { code: "TG", name: "Togo", zone: "OHADA", currency: "XOF", plan: "syscohada", vatRates: [18, 0], locale: "fr-TG" },
  { code: "NE", name: "Niger", zone: "OHADA", currency: "XOF", plan: "syscohada", vatRates: [19, 0], locale: "fr-NE" },
  { code: "GW", name: "Guinée-Bissau", zone: "OHADA", currency: "XOF", plan: "syscohada", vatRates: [17, 0], locale: "pt-GW" },
  { code: "GN", name: "Guinée", zone: "OHADA", currency: "GNF", plan: "syscohada", vatRates: [18, 0], locale: "fr-GN" },
  { code: "CM", name: "Cameroun", zone: "OHADA", currency: "XAF", plan: "syscohada", vatRates: [19.25, 0], locale: "fr-CM" },
  { code: "GA", name: "Gabon", zone: "OHADA", currency: "XAF", plan: "syscohada", vatRates: [18, 0], locale: "fr-GA" },
  { code: "CG", name: "Congo", zone: "OHADA", currency: "XAF", plan: "syscohada", vatRates: [18.9, 0], locale: "fr-CG" },
  { code: "CD", name: "Rép. Dém. du Congo", zone: "OHADA", currency: "CDF", plan: "syscohada", vatRates: [16, 0], locale: "fr-CD" },
  { code: "TD", name: "Tchad", zone: "OHADA", currency: "XAF", plan: "syscohada", vatRates: [18, 0], locale: "fr-TD" },
  { code: "CF", name: "République Centrafricaine", zone: "OHADA", currency: "XAF", plan: "syscohada", vatRates: [19, 0], locale: "fr-CF" },
  { code: "KM", name: "Comores", zone: "OHADA", currency: "KMF", plan: "syscohada", vatRates: [17, 0], locale: "fr-KM" },
  { code: "GQ", name: "Guinée Équatoriale", zone: "OHADA", currency: "XAF", plan: "syscohada", vatRates: [15, 0], locale: "es-GQ" },
  // Autres pays
  { code: "FR", name: "France", zone: "UE", currency: "EUR", plan: "pcg", vatRates: [20, 10, 5.5, 0], locale: "fr-FR" },
  { code: "TN", name: "Tunisie", zone: "AFN", currency: "TND", plan: "nct", vatRates: [19, 13, 7, 0], locale: "fr-TN" },
  { code: "MA", name: "Maroc", zone: "AFN", currency: "MAD", plan: "cgnc", vatRates: [20, 14, 10, 7, 0], locale: "fr-MA" },
  { code: "OTHER", name: "Autre / personnalisé", zone: "—", currency: "XXX", plan: "syscohada", vatRates: [0], locale: "fr" },
];

export function getCountry(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[COUNTRIES.length - 1];
}

export function formatMoney(amount, currency, locale = "fr") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount || 0);
  } catch (e) {
    return new Intl.NumberFormat("fr", { maximumFractionDigits: 2 }).format(amount || 0) + " " + currency;
  }
}
