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
 MA:{countryCode:"MA",countryName:"Maroc",currency:"MAD",status:"active",authority:"Direction Générale des Impôts (DGI)",rulesVersion:"2026.1",rulesEffectiveFrom:"2026-01-01",calculationModules:["VAT","IS","IR","WITHHOLDING","DECLARATIONS","RECONCILIATION"],taxFacts:[{taxType:"IS",label:"IS — taux normal",value:"20 %",detail:"Sous réserve des conditions de seuil et d'historique prévues par le CGI.",legalReference:"CGI 2026, art. 19-I",sourceUrl:"https://www.finances.gov.ma/Publication/dgi/2025/cgi-2026-fr.pdf"},{taxType:"IS",label:"IS — taux majorés",value:"35 % / 40 %",detail:"35 % au-delà du seuil légal sous réserve des exceptions ; 40 % pour les établissements expressément visés.",legalReference:"CGI 2026, art. 19-I-B et C",sourceUrl:"https://www.finances.gov.ma/Publication/dgi/2025/cgi-2026-fr.pdf"}],taxScales:[],legalSources:[{label:"Code général des impôts 2026",url:"https://www.finances.gov.ma/Publication/dgi/2025/cgi-2026-fr.pdf"},{label:"Loi de finances 2026",url:"https://www.sgg.gov.ma/BO/FR/2873/2025/BO_7465-bis_fr.pdf"},{label:"Calendrier fiscal DGI",url:"https://www.tax.gov.ma/wps/portal/DGI/Vos-impots-procedures/Vos-echeances-fiscales"}],rules:moroccoRules},
 FR:{countryCode:"FR",countryName:"France métropolitaine",currency:"EUR",status:"active",authority:"Direction générale des Finances publiques (DGFiP)",rulesVersion:"2026.1",rulesEffectiveFrom:"2026-01-01",calculationModules:["VAT","IS","IR","WITHHOLDING"],taxFacts:[{taxType:"IS",label:"Impôt sur les sociétés — taux normal",value:"25 %",detail:"Le taux réduit PME et les contributions additionnelles ne sont pas calculés ici.",legalReference:"CGI, art. 219-I",sourceUrl:"https://www.impots.gouv.fr/international-professionnel/impot-sur-les-societes"}],taxScales:[{taxType:"IR",label:"Barème IR 2026 — revenus 2025, une part",currency:"EUR",brackets:[{from:0,to:11600,rate:0},{from:11600,to:29579,rate:11},{from:29579,to:84577,rate:30},{from:84577,to:181917,rate:41},{from:181917,to:null,rate:45}],detail:"Le quotient familial, plafonnements, réductions, crédits et prélèvements additionnels ne sont pas intégrés."}],legalSources:[{label:"Fiscalité des entreprises — impots.gouv.fr",url:"https://www.impots.gouv.fr/international-professionnel/fiscalite-des-entreprises"},{label:"Barème IR 2026 — Service-Public",url:"https://www.service-public.gouv.fr/particuliers/vosdroits/F1419"},{label:"BOFiP — taux de TVA",url:"https://bofip.impots.gouv.fr/bofip/1380-PGP.html/identifiant=BOI-TVA-LIQ-10-20250514"}],rules:[
 {code:"FR_VAT_STANDARD",countryCode:"FR",taxType:"VAT",rate:20,treatment:"taxable",label:"TVA — taux normal",validFrom:"2026-01-01",validTo:null,legalReference:"CGI, art. 278"},
 {code:"FR_VAT_10",countryCode:"FR",taxType:"VAT",rate:10,treatment:"taxable",eligibilityRequired:true,label:"TVA — taux intermédiaire (opérations éligibles)",validFrom:"2026-01-01",validTo:null,legalReference:"CGI, art. 279"},
 {code:"FR_VAT_55",countryCode:"FR",taxType:"VAT",rate:5.5,treatment:"taxable",eligibilityRequired:true,label:"TVA — taux réduit (opérations éligibles)",validFrom:"2026-01-01",validTo:null,legalReference:"CGI, art. 278-0 bis"},
 {code:"FR_VAT_2_1",countryCode:"FR",taxType:"VAT",rate:2.1,treatment:"taxable",eligibilityRequired:true,label:"TVA — taux particulier (opérations énumérées)",validFrom:"2026-01-01",validTo:null,legalReference:"CGI, art. 281 quater et suivants"}]},
 BE:{countryCode:"BE",countryName:"Belgique",currency:"EUR",status:"active",authority:"Service public fédéral Finances",rulesVersion:"2026.1",rulesEffectiveFrom:"2026-01-01",calculationModules:["VAT","IS","IR","WITHHOLDING"],taxFacts:[],taxScales:[{taxType:"IR",label:"IPP 2026 — revenus 2026 (exercice d'imposition 2027)",currency:"EUR",personalAllowance:11550,brackets:[{from:0,to:16720,rate:25},{from:16720,to:29510,rate:40},{from:29510,to:51070,rate:45},{from:51070,to:null,rate:50}],detail:"Barème fédéral avant additionnels communaux et mécanismes personnels ; quotité exemptée de base indiquée par le SPF : 11 550 EUR."}],legalSources:[{label:"Taux de TVA — SPF Finances",url:"https://finances.belgium.be/fr/entreprises/tva/assujettissement-tva/taux-et-calcul/taux-tva"},{label:"IS — déclaration et taux réduits — SPF Finances",url:"https://finances.belgium.be/sites/default/files/121-declaration-isoc-explications-2025.pdf"},{label:"Précompte mobilier — SPF Finances",url:"https://finances.belgium.be/fr/entreprises/impot_des_societes/Precomptes/precompte-mobilier"},{label:"Taux de l'impôt des personnes physiques — SPF Finances",url:"https://finances.belgium.be/en/private-individuals/tax-return/income/tax-rates"},{label:"Déclaration d'impôt 2026 — SPF Finances",url:"https://finances.belgium.be/fr/particuliers/declaration_impot/rentrer-declaration/declaration-impot"}],rules:[
 {code:"BE_VAT_21",countryCode:"BE",taxType:"VAT",rate:21,treatment:"taxable",label:"TVA — taux normal",validFrom:"2026-01-01",validTo:null,legalReference:"Arrêté royal n° 20"},
 {code:"BE_VAT_12",countryCode:"BE",taxType:"VAT",rate:12,treatment:"taxable",eligibilityRequired:true,label:"TVA — taux intermédiaire (opérations éligibles)",validFrom:"2026-01-01",validTo:null,legalReference:"Arrêté royal n° 20"},
 {code:"BE_VAT_6",countryCode:"BE",taxType:"VAT",rate:6,treatment:"taxable",eligibilityRequired:true,label:"TVA — taux réduit (opérations éligibles)",validFrom:"2026-01-01",validTo:null,legalReference:"Arrêté royal n° 20"}]},
 SN:{countryCode:"SN",countryName:"Sénégal",currency:"XOF",status:"active",authority:"Direction générale des Impôts et des Domaines (DGID)",rulesVersion:"CGI-2025.1 — contrôlé 2026-11",rulesEffectiveFrom:"2025-01-01",calculationModules:["VAT","IS","IR","WITHHOLDING"],taxFacts:[{taxType:"IS",label:"Impôt sur les sociétés — taux normal",value:"30 %",detail:"Taux normal du bénéfice imposable.",legalReference:"CGI, art. 36",sourceUrl:"https://www.dgid.sn/loi-reglement"},{taxType:"IS",label:"Impôt minimum forfaitaire",value:"0,5 % — minimum 500 000 FCFA, maximum 5 000 000 FCFA",detail:"Assis sur le chiffre d'affaires hors taxes de l'année précédente ; exonérations légales à contrôler.",legalReference:"CGI, art. 38 à 40",sourceUrl:"https://www.dgid.sn/loi-reglement"},{taxType:"PAYROLL",label:"Contribution forfaitaire à la charge de l'employeur",value:"3 %",detail:"Contribution employeur distincte de l'IR du salarié ; non intégrée au calculateur de salaire.",legalReference:"CGI, art. 267",sourceUrl:"https://www.dgid.sn/loi-reglement"}],taxScales:[{taxType:"IR",label:"IR annuel — barème DGID, article 173",currency:"XOF",brackets:[{from:0,to:630000,rate:0},{from:630000,to:1500000,rate:20},{from:1500000,to:4000000,rate:30},{from:4000000,to:8000000,rate:35},{from:8000000,to:13500000,rate:37},{from:13500000,to:50000000,rate:40},{from:50000000,to:null,rate:43}],detail:"Revenu imposable arrondi au millier inférieur. Réduction pour charges de famille selon l'article 174 ; calculateur avec parts 1 à 5."}],legalSources:[{label:"DGID — CGI 2025 et taux officiels",url:"https://www.dgid.sn/loi-reglement"},{label:"DGID — centre de ressources et CGI 2025",url:"https://www.dgid.sn/ressources"},{label:"CGI Sénégal annoté 2025 — copie consultable",url:"https://avip.africa/sites/default/files/2026-07/Code%20g%C3%A9n%C3%A9ral%20des%20Imp%C3%B4ts%20CGI%202025.pdf"}],rules:[{code:"SN_VAT_18",countryCode:"SN",taxType:"VAT",rate:18,treatment:"taxable",label:"TVA — taux normal",validFrom:"2025-01-01",validTo:null,legalReference:"CGI Sénégal — taux normal publié par la DGID"}]},
 CI:{countryCode:"CI",countryName:"Côte d’Ivoire",currency:"XOF",status:"active",authority:"Direction générale des Impôts (DGI)",rulesVersion:"CGI-2026.1",rulesEffectiveFrom:"2026-01-05",calculationModules:["VAT","IS","IR","WITHHOLDING"],taxFacts:[{taxType:"IS",label:"Impôt sur les bénéfices — taux de référence",value:"25 %",detail:"Taux général de référence ; taux de 30 % pour les secteurs télécommunications/TIC et jeux de hasard visés par les textes.",legalReference:"CGI 2026 — impôt sur les bénéfices",sourceUrl:"https://www.dgi.gouv.ci/"},{taxType:"PAYROLL",label:"ITS — barème mensuel progressif",value:"0 % à 32 %",detail:"Barème progressif par tranche et réduction d'impôt pour charges de famille (RICF) ; calculateur simplifié.",legalReference:"CGI, art. 115 et suivants",sourceUrl:"https://www.dgi.gouv.ci/assets/documents/LE%20SYSTEME%20FISCAL%20IVOIRIEN.pdf"},{taxType:"WITHHOLDING",label:"Retenues à la source",value:"2 % à 25 % selon la nature du paiement",detail:"AIRSI, PPSSI, IRVM, RIBIC, RIBNC, RIRL, FIRCA et retenue 2026 sur certains cachets ; catégories non interchangeables.",legalReference:"CGI, art. 19, 60 bis, 84 bis, 92, 93, 182 ; annexe fiscale 2026",sourceUrl:"https://www.dgi.gouv.ci/"}],taxScales:[{taxType:"IR",label:"ITS mensuel — barème DGI et RICF",currency:"XOF",brackets:[{from:0,to:75000,rate:0},{from:75000,to:240000,rate:16},{from:240000,to:800000,rate:21},{from:800000,to:2400000,rate:24},{from:2400000,to:8000000,rate:28},{from:8000000,to:null,rate:32}],detail:"Base mensuelle imposable ITS à saisir après abattements applicables. RICF mensuelle selon 1 à 5 parts ; cotisations sociales et contributions employeur exclues."}],legalSources:[{label:"DGI — Code général des Impôts 2026 et publications",url:"https://www.dgi.gouv.ci/"},{label:"DGI — Le système fiscal ivoirien",url:"https://www.dgi.gouv.ci/assets/documents/LE%20SYSTEME%20FISCAL%20IVOIRIEN.pdf"},{label:"DGI — Impôts et taxes en Côte d’Ivoire",url:"https://www.dgi.gouv.ci/assets/documents/IMPOTS%20ET%20TAXES%20EN%20COTE%20D%27IVOIRE%20.pdf"},{label:"DGI — Doctrine fiscale 2024, retenue RIBNC",url:"https://www.dgi.gouv.ci/assets/documents/DOCTRINE%20FISCALE%202024/REGIMES%20SPECIFIQUES/N%C2%B0%20046%20MFB%20DGI%20DLCD%20DU%2008%20JUIL%202024%20R%C3%A9gime%20fiscal%20des%20redevances%20et%20r%C3%A9mun%C3%A9rations%20de%20prestations%20de%20services%20vers%C3%A9es%20%C3%A0%20l%27%C3%A9tranger.pdf"},{label:"DGI — Communiqué TVA 2026",url:"https://www.fne.dgi.gouv.ci/uploads/communiques/pdf_696e12da46ae5_COMMUNIQUE_TAUX_REDUIT.pdf"}],rules:[{code:"CI_VAT_18",countryCode:"CI",taxType:"VAT",rate:18,treatment:"taxable",label:"TVA — taux normal",validFrom:"2026-01-05",validTo:null,legalReference:"CGI 2026, annexe fiscale à la loi n° 2025-987"},{code:"CI_VAT_9",countryCode:"CI",taxType:"VAT",rate:9,treatment:"taxable",eligibilityRequired:true,label:"TVA réduite — produits et opérations expressément visés",validFrom:"2026-01-17",validTo:null,legalReference:"Ordonnance n° 2026-03 du 7 janvier 2026 ; communiqué DGI du 16 janvier 2026"]}},

 BJ:{countryCode:"BJ",countryName:"Bénin",currency:"XOF",status:"active",authority:"Direction générale des Impôts (DGI)",rulesVersion:"CGI-2025.1",rulesEffectiveFrom:"2025-01-01",calculationModules:["VAT","IS","WITHHOLDING"],taxFacts:[{taxType:"IS",label:"IS — taux de droit commun",value:"25 % ou 30 %",detail:"25 % pour les personnes morales industrielles non extractives et les établissements privés d’enseignement visés ; 30 % dans les autres cas.",legalReference:"CGI 2025, art. 46",sourceUrl:"https://api.impots.bj/media/677eb4aa60935_B%C3%A9nin-Code%20G%C3%A9n%C3%A9ral%20des%20Imp%C3%B4ts%202025.pdf"},{taxType:"IS",label:"Minimum de perception",value:"1 %, 3 % ou 10 % des produits encaissables — minimum 250 000 FCFA",detail:"1 % en droit commun, 3 % BTP et 10 % sociétés à prépondérance immobilière ; règles particulières à contrôler.",legalReference:"CGI 2025, art. 47",sourceUrl:"https://api.impots.bj/media/677eb4aa60935_B%C3%A9nin-Code%20G%C3%A9n%C3%A9ral%20des%20Imp%C3%B4ts%202025.pdf"},{taxType:"PAYROLL",label:"ITS — barème mensuel",value:"0 % à 30 %",detail:"Barème progressif de l’article 125 ; redevance ORTB de 1 000 FCFA en mars et 3 000 FCFA en juin, selon conditions.",legalReference:"CGI 2025, art. 125 à 129",sourceUrl:"https://api.impots.bj/media/677eb4aa60935_B%C3%A9nin-Code%20G%C3%A9n%C3%A9ral%20des%20Imp%C3%B4ts%202025.pdf"}],taxScales:[{taxType:"IR",label:"ITS mensuel — barème de l’article 125",currency:"XOF",brackets:[{from:0,to:60000,rate:0},{from:60000,to:150000,rate:10},{from:150000,to:250000,rate:15},{from:250000,to:500000,rate:19},{from:500000,to:null,rate:30}],detail:"Base mensuelle selon les règles des articles 122 à 124. Redevance ORTB et rémunérations exceptionnelles traitées séparément."}],legalSources:[{label:"DGI Bénin — Code général des impôts 2025 (édition officielle)",url:"https://api.impots.bj/media/677eb4aa60935_B%C3%A9nin-Code%20G%C3%A9n%C3%A9ral%20des%20Imp%C3%B4ts%202025.pdf"},{label:"Ministère des Finances — CGI 2025",url:"https://finances.bj/documents/code-general-des-impots-2025/"}],rules:[{code:"BJ_VAT_18",countryCode:"BJ",taxType:"VAT",rate:18,treatment:"taxable",label:"TVA — taux normal",validFrom:"2025-01-01",validTo:null,legalReference:"CGI Bénin 2025, art. 241"}]},
 BF:{countryCode:"BF",countryName:"Burkina Faso",currency:"XOF",status:"active",authority:"Direction générale des Impôts (DGI)",rulesVersion:"CGI-2026 / LF-2026",rulesEffectiveFrom:"2026-01-01",calculationModules:["VAT","IS","IR","WITHHOLDING"],taxFacts:[{taxType:"IS",label:"IS — taux normal",value:"27,5 %",detail:"Taux appliqué au bénéfice imposable des sociétés ; minimum forfaitaire de perception distinct.",legalReference:"CGI Burkina Faso, art. 87 à 90",sourceUrl:"https://dgi.bf/verification/CGI"},{taxType:"IS",label:"Minimum forfaitaire de perception",value:"0,5 % du chiffre d’affaires HT",detail:"Minimum calculé sur le chiffre d’affaires hors taxes ; seuils, planchers et secteurs particuliers à contrôler.",legalReference:"CGI Burkina Faso, art. 88 à 90",sourceUrl:"https://dgi.bf/verification/CGI"},{taxType:"PAYROLL",label:"IUTS — barème mensuel",value:"0 % à 25 %",detail:"Barème progressif sur le revenu mensuel net imposable ; réductions pour charges de famille à appliquer selon le texte.",legalReference:"CGI Burkina Faso, art. 105 à 113",sourceUrl:"https://dgi.bf/verification/CGI"},{taxType:"WITHHOLDING",label:"Retenue sur prestataires non-résidents",value:"20 %",detail:"Taux sur sommes nettes versées aux non-résidents sans établissement stable, sous réserve des exceptions et conventions.",legalReference:"CGI Burkina Faso, art. 211 à 214",sourceUrl:"https://dgi.bf/verification/CGI"}],taxScales:[{taxType:"IR",label:"IUTS mensuel — barème de l’article 112",currency:"XOF",brackets:[{from:0,to:30000,rate:0},{from:30000,to:50000,rate:12.1},{from:50000,to:80000,rate:13.9},{from:80000,to:120000,rate:15.7},{from:120000,to:170000,rate:18.4},{from:170000,to:250000,rate:21.7},{from:250000,to:null,rate:25}],detail:"Barème du CGI accessible via la DGI ; réduction pour charges de famille selon l’article 113. Vérifier le texte consolidé 2026 avant paie."}],legalSources:[{label:"DGI Burkina Faso — CGI et textes fiscaux",url:"https://dgi.bf/lois/"},{label:"DGI Burkina Faso — CGI version consultable",url:"https://dgi.bf/verification/CGI"},{label:"DGI Burkina Faso — Loi de finances 2026",url:"https://dgi.bf/lois/"}],rules:[{code:"BF_VAT_18",countryCode:"BF",taxType:"VAT",rate:18,treatment:"taxable",label:"TVA — taux normal",validFrom:"2026-01-01",validTo:null,legalReference:"CGI Burkina Faso, art. 317 ; LF 2025 et textes 2026"},{code:"BF_VAT_10_HOTEL",countryCode:"BF",taxType:"VAT",rate:10,treatment:"taxable",eligibilityRequired:true,label:"TVA réduite — hébergement/restauration agréés et transport aérien national",validFrom:"2025-01-01",validTo:null,legalReference:"CGI Burkina Faso, art. 317 modifié par LF 2025"}]},
 ML:{countryCode:"ML",countryName:"Mali",currency:"XOF",status:"active",authority:"Direction générale des Impôts (DGI)",rulesVersion:"CGI Mali / LF-2025 — vérification partielle",rulesEffectiveFrom:"2025-01-01",calculationModules:["IS"],taxFacts:[{taxType:"IS",label:"IS / IBIC — régime réel",value:"30 % du bénéfice imposable",detail:"La DGI indique également un minimum de 1 % du chiffre d’affaires HT en cas de déficit pour les contribuables au régime normal.",legalReference:"DGI Mali — régime du bénéfice réel ; Loi de finances 2025",sourceUrl:"https://www.dgi.gouv.ml/les-types-dentreprises-et-les-regimes/"},{taxType:"OTHER",label:"Impôt synthétique",value:"3 % du chiffre d’affaires HT",detail:"Régime synthétique présenté par la DGI pour les entreprises dont le chiffre d’affaires HT annuel est inférieur à 50 millions FCFA, sous réserve des exclusions.",legalReference:"DGI Mali — impôts à payer",sourceUrl:"https://www.dgi.gouv.ml/les-impots-a-payer/"},{taxType:"PAYROLL",label:"Contributions employeur publiées par la DGI",value:"CFE 3,5 % · TFP 2 % · TEJ 2 % · Taxe logement 1 %",detail:"Contributions assises sur la masse salariale brute selon leurs champs respectifs ; CGS de 0,5 % sur le chiffre d’affaires HT.",legalReference:"DGI Mali — impôts à payer",sourceUrl:"https://www.dgi.gouv.ml/les-impots-a-payer/"}],taxScales:[],legalSources:[{label:"DGI Mali — Code général des impôts",url:"https://www.dgi.gouv.ml/CGI/"},{label:"DGI Mali — régimes d’imposition",url:"https://www.dgi.gouv.ml/les-types-dentreprises-et-les-regimes/"},{label:"DGI Mali — impôts et taxes à payer",url:"https://www.dgi.gouv.ml/les-impots-a-payer/"},{label:"Ministère du Budget — Loi de finances 2025",url:"https://budget.gouv.ml/sites/default/files/Loi%20de%20finances%20initiale%202025_c.pdf"}],rules:[]},
};

export function getTaxCountryProfile(countryCode) {
  const code = String(countryCode || "").trim().toUpperCase();
  const profile = profiles[code];
  return profile ? { ...profile, rules: profile.rules.map(rule => ({ ...rule })), calculationModules: [...(profile.calculationModules || [])], taxFacts: (profile.taxFacts || []).map(item => ({ ...item })), taxScales: (profile.taxScales || []).map(item => ({ ...item, brackets: (item.brackets || []).map(bracket => ({ ...bracket })) })) } : {
    countryCode: code,
    countryName: code || "Pays non défini",
    currency: "",
    status: "not_configured",
    authority: "",
    rulesVersion: "",
    rulesEffectiveFrom: "",
    legalSources: [],
    calculationModules: [],
    taxFacts: [],
    taxScales: [],
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

export function calculateTaxLine({ baseAmount, taxCode, countryCode, taxType = "VAT", date, eligibilityConfirmed = false } = {}) {
  const base = Number(baseAmount);
  if (!Number.isFinite(base) || base < 0) return { ok: false, errors: ["Base imposable invalide."] };
  const rule = resolveTaxRule({ countryCode, taxType, taxCode, date });
  if (!rule) return { ok: false, errors: ["Règle fiscale absente, inactive ou non applicable à la date de l'opération."] };
  if (rule.eligibilityRequired && eligibilityConfirmed !== true) return { ok: false, errors: ["Ce taux réduit exige la confirmation documentée de l'éligibilité de l'opération."] };
  const taxAmount = round2(base * rule.rate / 100);
  return { ok: true, errors: [], countryCode: rule.countryCode, taxCode: rule.code, taxType: rule.taxType, rate: rule.rate, treatment: rule.treatment, eligibilityRequired: Boolean(rule.eligibilityRequired), baseAmount: round2(base), taxAmount, totalAmount: round2(base + taxAmount), ruleVersion: getTaxCountryProfile(countryCode).rulesVersion };
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
        if (rule?.eligibilityRequired && line?.eligibilityConfirmed !== true) {
          warnings.push({ code: "eligibility_confirmation_required", documentId: document.id ?? null, line: index + 1, rate, message: "Taux réduit non validé : une confirmation documentée de l’éligibilité est requise." });
          rule = null;
        }
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
