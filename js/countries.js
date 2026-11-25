// MIZANE — Référentiel international des pays et devises.
// Les profils fiscaux et plans ne sont renseignés que lorsqu'ils ont été vérifiés.
// Pour les autres pays, la devise locale est une suggestion, jamais une règle fiscale.
const countryRows = `
AF:AFN AL:ALL DZ:DZD AD:EUR AO:AOA AG:XCD AR:ARS AM:AMD AU:AUD AT:EUR AZ:AZN
BS:BSD BH:BHD BD:BDT BB:BBD BY:BYN BE:EUR BZ:BZD BJ:XOF BT:BTN BO:BOB BA:BAM
BW:BWP BR:BRL BN:BND BG:EUR BF:XOF BI:BIF KH:KHR CM:XAF CA:CAD CV:CVE CF:XAF
TD:XAF CL:CLP CN:CNY CO:COP KM:KMF CG:XAF CD:CDF CR:CRC CI:XOF HR:EUR CU:CUP
CY:EUR CZ:CZK DK:DKK DJ:DJF DM:XCD DO:DOP EC:USD EG:EGP SV:USD GQ:XAF ER:ERN
EE:EUR SZ:SZL ET:ETB FJ:FJD FI:EUR FR:EUR GA:XAF GM:GMD GE:GEL DE:EUR GH:GHS
GR:EUR GD:XCD GT:GTQ GN:GNF GW:XOF GY:GYD HT:HTG HN:HNL HU:HUF IS:ISK IN:INR
ID:IDR IR:IRR IQ:IQD IE:EUR IL:ILS IT:EUR JM:JMD JP:JPY JO:JOD KZ:KZT KE:KES
KI:AUD KP:KPW KR:KRW KW:KWD KG:KGS LA:LAK LV:EUR LB:LBP LS:LSL LR:LRD LY:LYD
LI:CHF LT:EUR LU:EUR MG:MGA MW:MWK MY:MYR MV:MVR ML:XOF MT:EUR MH:USD MR:MRU
MU:MUR MX:MXN FM:USD MD:MDL MC:EUR MN:MNT ME:EUR MA:MAD MZ:MZN MM:MMK NA:NAD
NR:AUD NP:NPR NL:EUR NZ:NZD NI:NIO NE:XOF NG:NGN MK:MKD NO:NOK OM:OMR PK:PKR
PW:USD PA:PAB PG:PGK PY:PYG PE:PEN PH:PHP PL:PLN PT:EUR QA:QAR RO:RON RU:RUB
RW:RWF KN:XCD LC:XCD VC:XCD WS:WST SM:EUR ST:STN SA:SAR SN:XOF RS:RSD SC:SCR
SL:SLE SG:SGD SK:EUR SI:EUR SB:SBD SO:SOS ZA:ZAR SS:SSP ES:EUR LK:LKR SD:SDG
SR:SRD SE:SEK CH:CHF SY:SYP TW:TWD TJ:TJS TZ:TZS TH:THB TL:USD TG:XOF TO:TOP
TT:TTD TN:TND TR:TRY TM:TMT TV:AUD UG:UGX UA:UAH AE:AED GB:GBP US:USD UY:UYU
UZ:UZS VU:VUV VA:EUR VE:VES VN:VND YE:YER ZM:ZMW ZW:ZWG
XK:EUR PS:ILS PR:USD HK:HKD MO:MOP FO:DKK GL:DKK AX:EUR BM:BMD KY:KYD GI:GIP
GG:GBP JE:GBP IM:GBP CW:XCG SX:XCG AW:AWG BQ:USD GP:EUR MQ:EUR RE:EUR YT:EUR
PF:XPF NC:XPF WF:XPF PM:EUR GF:EUR BL:EUR MF:EUR IO:USD FK:FKP GS:GBP SH:SHP
AI:XCD VG:USD VI:USD TC:USD MS:XCD PN:NZD CK:NZD NU:NZD TK:NZD AS:USD GU:USD
MP:USD CC:AUD CX:AUD NF:AUD AQ:XXX BV:NOK SJ:NOK
`.trim().split(/\s+/).map((item) => item.split(":"));

const existingProfiles = [
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
  { code: "KM", name: "Comores", zone: "OHADA", currency: "KMF", plan: "syscohada", vatRates: [], locale: "fr-KM" },
  { code: "GQ", name: "Guinée Équatoriale", zone: "OHADA", currency: "XAF", plan: "syscohada", vatRates: [15, 0], locale: "es-GQ" },
  { code: "KE", name: "Kenya", zone: "International", currency: "KES", vatRates: [], locale: "en-KE" },
  { code: "RW", name: "Rwanda", zone: "International", currency: "RWF", vatRates: [], locale: "en-RW" },
  { code: "UG", name: "Uganda", zone: "International", currency: "UGX", vatRates: [], locale: "en-UG" },
  { code: "NA", name: "Namibie", zone: "International", currency: "NAD", vatRates: [], locale: "en-NA" },
  { code: "ZM", name: "Zambie", zone: "International", currency: "ZMW", vatRates: [], locale: "en-ZM" },
  { code: "TZ", name: "Tanzanie", zone: "International", currency: "TZS", vatRates: [], locale: "sw-TZ" },
  { code: "BW", name: "Botswana", zone: "International", currency: "BWP", vatRates: [], locale: "en-BW" },
  { code: "MZ", name: "Mozambique", zone: "International", currency: "MZN", vatRates: [], locale: "pt-MZ" },
  { code: "MW", name: "Malawi", zone: "International", currency: "MWK", vatRates: [], locale: "en-MW" },
  { code: "ZW", name: "Zimbabwe", zone: "International", currency: "ZWG", vatRates: [], locale: "en-ZW" },
  { code: "LS", name: "Lesotho", zone: "International", currency: "LSL", vatRates: [], locale: "en-LS" },
  { code: "SZ", name: "Eswatini", zone: "International", currency: "SZL", vatRates: [], locale: "en-SZ" },
  { code: "BI", name: "Burundi", zone: "International", currency: "BIF", vatRates: [], locale: "fr-BI" },
  { code: "DJ", name: "Djibouti", zone: "International", currency: "DJF", vatRates: [], locale: "fr-DJ" },
  { code: "ET", name: "Éthiopie", zone: "International", currency: "ETB", vatRates: [], locale: "am-ET" },
  { code: "ER", name: "Érythrée", zone: "International", currency: "ERN", vatRates: [], locale: "ti-ER" },
  { code: "SO", name: "Somalie", zone: "International", currency: "SOS", vatRates: [], locale: "so-SO" },
  { code: "FR", name: "France", zone: "UE", currency: "EUR", plan: "pcg", vatRates: [20, 10, 5.5, 0], locale: "fr-FR" },
  { code: "TN", name: "Tunisie", zone: "AFN", currency: "TND", plan: "nct", vatRates: [19, 13, 7, 0], locale: "fr-TN" },
  { code: "MA", name: "Maroc", zone: "AFN", currency: "MAD", plan: "cgnc", vatRates: [20, 10, 0], locale: "fr-MA" },
];
const profiles = new Map(existingProfiles.map((country) => [country.code, country]));
let regionNames;
try { regionNames = new Intl.DisplayNames(["fr"], { type: "region" }); } catch { regionNames = null; }

export const COUNTRIES = countryRows.map(([code, currency]) => {
  const profile = profiles.get(code);
  return profile || {
    code,
    name: regionNames?.of(code) || code,
    zone: "International",
    currency,
    vatRates: [],
    locale: "fr",
  };
}).concat([{ code: "OTHER", name: "Autre / personnalisé", zone: "—", currency: "XXX", vatRates: [], locale: "fr" }])
  .sort((a, b) => a.code === "OTHER" ? 1 : b.code === "OTHER" ? -1 : a.name.localeCompare(b.name, "fr"));

export function getCountry(code) {
  return COUNTRIES.find((country) => country.code === code) || COUNTRIES.find((country) => country.code === "OTHER");
}

const CURRENCY_SYMBOLS = {
  MAD: "DH", AOA: "Kz", MGA: "Ar", MUR: "₨", SCR: "₨", KMF: "CF", BIF: "FBu", DJF: "Fdj", ETB: "Br", ERN: "Nfk", SOS: "Sh.So.", ZWG: "ZiG", LSL: "M", SZL: "E", XOF: "F CFA", XAF: "FCFA", XPF: "F CFP",
  USD: "$US", CAD: "$CA", AUD: "$AU", NZD: "$NZ",
  GNF: "FG", CDF: "FC", MRU: "UM", GMD: "D",
  NGN: "₦", GHS: "GH₵", KES: "KSh", RWF: "FRw", UGX: "USh", NAD: "N$", ZMW: "K", TZS: "TSh", BWP: "P", MZN: "MT", MWK: "MK", ZAR: "R",
  INR: "₹", PKR: "₨", JPY: "¥", CNY: "¥",
  BRL: "R$", MXN: "MX$", RUB: "₽", TRY: "₺",
  AED: "د.إ", SAR: "ر.س", QAR: "ر.ق", KWD: "د.ك",
  BHD: "د.ب", OMR: "ر.ع.", JOD: "د.ا", EGP: "ج.م",
  TND: "د.ت", DZD: "د.ج", LBP: "ل.ل",
};

export function getCurrencyInfo(currency, locale = "fr") {
  const code = String(currency || "XXX").toUpperCase();
  let name = code;
  let symbol = CURRENCY_SYMBOLS[code] || code;
  try {
    name = new Intl.DisplayNames([locale, "fr"], { type: "currency" }).of(code) || code;
  } catch {}
  if (!CURRENCY_SYMBOLS[code]) {
    try {
      symbol = new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 })
        .formatToParts(1).find((part) => part.type === "currency")?.value || code;
    } catch {}
  }
  return { code, name, symbol };
}

export function currencyOptionLabel(currency, locale = "fr") {
  const info = getCurrencyInfo(currency, locale);
  return info.code === "XXX" ? "Devise non spécifiée (XXX)" : `${info.name} — ${info.code} — ${info.symbol}`;
}

export function formatMoney(amount, currency, locale = "fr") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount || 0);
  } catch (_e) {
    return new Intl.NumberFormat("fr", { maximumFractionDigits: 2 }).format(amount || 0) + " " + currency;
  }
}
