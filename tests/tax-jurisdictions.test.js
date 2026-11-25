import "./african-tax-calculators.test.js";
import "./regional-african-tax-calculators.test.js";
import "./foreign-tax-calculators.test.js";
import { strict as assert } from "node:assert";
import { getTaxCountryProfile, getActiveTaxRules, calculateTaxLine, buildVatReport } from "../js/tax-core.js";
import { getCountry } from "../js/countries.js";
const expected={FR:{currency:"EUR",rates:[20,10,5.5,2.1]},BE:{currency:"EUR",rates:[21,12,6]},SN:{currency:"XOF",rates:[18]},CI:{currency:"XOF",rates:[18,9]},BJ:{currency:"XOF",rates:[18]},BF:{currency:"XOF",rates:[18,10]},ML:{currency:"XOF",rates:[]},GH:{currency:"GHS",rates:[15]},NG:{currency:"NGN",rates:[7.5]},TG:{currency:"XOF",rates:[18]},SL:{currency:"SLE",rates:[15]},GM:{currency:"GMD",rates:[15]},CV:{currency:"CVE",rates:[]},CM:{currency:"XAF",rates:[19.25,0]},GA:{currency:"XAF",rates:[18,10,5,0]},TD:{currency:"XAF",rates:[19.25,9.9,0]},CD:{currency:"CDF",rates:[16,5,1,8,0]},GQ:{currency:"XAF",rates:[15,5,0]},MR:{currency:"MRU",rates:[16,0]}};
for(const [code,spec] of Object.entries(expected)){
 const p=getTaxCountryProfile(code);
 assert.equal(p.status,"active",code);
 assert.equal(p.currency,spec.currency,code);
 assert.deepEqual(p.rules.filter(x=>x.taxType==="VAT").map(x=>x.rate),spec.rates,code);
 const expectedModules={FR:["VAT","IS","IR","WITHHOLDING"],BE:["VAT","IS","IR","WITHHOLDING"],SN:["VAT","IS","IR","WITHHOLDING"],CI:["VAT","IS","IR","WITHHOLDING"],BJ:["VAT","IS","WITHHOLDING"],BF:["VAT","IS","WITHHOLDING"],ML:["IS"],GH:["VAT"],NG:["VAT"],TG:["VAT"],SL:["VAT"],GM:["VAT"],CV:[],CM:["VAT"],GA:["VAT"],TD:["VAT"],CD:["VAT"],GQ:["VAT"],MR:["VAT"]};
 assert.deepEqual(p.calculationModules,expectedModules[code],code+" : modules réellement exposés par l’interface");
 assert.ok(p.legalSources.length>=2,code+" : sources officielles");
 assert.ok(p.rules.every(x=>x.legalReference&&x.validFrom),code+" : références et dates");
 assert.deepEqual(getActiveTaxRules(code,"IS","2026-11-25"),[],code+" : règles IS détaillées non activées dans le moteur de lignes");
}

const newEastAfricanProfiles={
 BW:{currency:"BWP",name:"Botswana",vat:"14 % standard selon les documents budgétaires 2025/26 ; 0 % opérations zéro",is:"22 % sociétés résidentes ; 30 % non-résidentes ; 15 % manufacturing/IFSC sous conditions"},
 MZ:{currency:"MZN",name:"Mozambique",vat:"16 % standard ; 5 % réduit pour secteurs/supplies désignés ; 0 % opérations éligibles",is:"32 % sur le bénéfice imposable des entités résidentes et des établissements stables"},
 MW:{currency:"MWK",name:"Malawi",vat:"17,5 % standard ; 0 % pour opérations éligibles",is:"30 % jusqu'à 5 milliards MWK ; 40 % au-delà"},
 NA:{currency:"NAD",name:"Namibie",vat:"15 % standard ; 0 % pour opérations légalement éligibles",is:"30 % non-mining ; 37,5 % autres mines ; 55 % mines de diamants"},
 ZM:{currency:"ZMW",name:"Zambie",vat:"16 % standard ; 0 % pour opérations éligibles",is:"30 % taux général ; 10 % agriculture pour les activités éligibles"},
 TZ:{currency:"TZS",name:"Tanzanie (continentale)",selectorName:"Tanzanie",vat:"18 % standard ; 0 % exportations ; 16 % conditionnel sous désignation de la Commissioner General",is:"30 % sociétés résidentes et établissements stables ; régimes préférentiels distincts"},
 KE:{currency:"KES",name:"Kenya",vat:"16 % standard ; 0 % zero-rated supplies",is:"30 % sociétés résidentes ; 37,5 % sociétés non-résidentes"},
 RW:{currency:"RWF",name:"Rwanda",vat:"18 % standard ; 0 % pour opérations légalement éligibles",is:"28 %"},
 UG:{currency:"UGX",name:"Uganda",vat:"18 % standard ; 0 % pour fournitures éligibles",is:"30 % du revenu imposable"}
};
for(const [code,spec] of Object.entries(newEastAfricanProfiles)){
 const p=getTaxCountryProfile(code);
 assert.equal(p.countryName,spec.name,code);
 assert.equal(p.currency,spec.currency,code);
 assert.equal(p.status,"research_required",code);
 assert.deepEqual(p.calculationModules,[],code);
 assert.deepEqual(p.rules,[],code);
 assert.ok(p.legalSources.length>=3,code+" : sources institutionnelles");
 assert.equal(p.taxFacts.find(x=>x.taxType==="VAT").value,spec.vat,code);
 assert.equal(p.taxFacts.find(x=>x.taxType==="IS").value,spec.is,code);
 assert.deepEqual(getActiveTaxRules(code,"VAT","2026-11-25"),[],code+" : aucune règle TVA activée");
 assert.deepEqual(getActiveTaxRules(code,"IS","2026-11-25"),[],code+" : aucune règle IS activée");
 assert.equal(calculateTaxLine({countryCode:code,taxCode:code+"_VAT_STANDARD",baseAmount:100,date:"2026-11-25"}).ok,false,code+" : calcul TVA bloqué");
 const selector=getCountry(code);
 assert.equal(selector.name,spec.selectorName||spec.name,code+" : pays disponible dans le sélecteur");
 assert.equal(selector.currency,spec.currency,code+" : devise du sélecteur");
 assert.deepEqual(selector.vatRates,[],code+" : pas de taux par défaut non activés");
}

const newSouthernAfricanProfiles={
 ZW:{currency:"ZWG",name:"Zimbabwe",vat:"15,5 % depuis le 1er janvier 2026",is:"25 % ; AIDS Levy additionnelle de 3 % sur l'impôt calculé"},
 LS:{currency:"LSL",name:"Lesotho",vat:"15 % taux général et télécommunications ; 10 % électricité ; 0 % exportations et produits de base",is:"25 % autres sociétés ; 10 % activités manufacturières éligibles et agriculture commerciale"},
 SZ:{currency:"SZL",name:"Eswatini",vat:"15 % ; exportations directes éligibles à 0 %",is:"25 % pour les déclarations 2026 selon l'avis ERS ; page de taux ERS encore affichée à 27,5 %"}
};
for(const [code,spec] of Object.entries(newSouthernAfricanProfiles)){
 const p=getTaxCountryProfile(code);
 assert.equal(p.countryName,spec.name,code);
 assert.equal(p.currency,spec.currency,code);
 assert.equal(p.status,"research_required",code);
 assert.deepEqual(p.calculationModules,[],code);
 assert.deepEqual(p.rules,[],code);
 assert.ok(p.legalSources.length>=3,code+" : sources institutionnelles");
 assert.equal(p.taxFacts.find(x=>x.taxType==="VAT").value,spec.vat,code);
 assert.equal(p.taxFacts.find(x=>x.taxType==="IS").value,spec.is,code);
 assert.deepEqual(getActiveTaxRules(code,"VAT","2026-11-25"),[],code+" : aucune règle TVA activée");
 assert.deepEqual(getActiveTaxRules(code,"IS","2026-11-25"),[],code+" : aucune règle IS activée");
 assert.equal(calculateTaxLine({countryCode:code,taxCode:code+"_VAT_STANDARD",baseAmount:100,date:"2026-11-25"}).ok,false,code+" : calcul TVA bloqué");
 const selector=getCountry(code);
 assert.equal(selector.name,spec.name,code+" : pays disponible dans le sélecteur");
 assert.equal(selector.currency,spec.currency,code+" : devise du sélecteur");
 assert.deepEqual(selector.vatRates,[],code+" : pas de taux par défaut non activés");
}
assert.match(getTaxCountryProfile("ZW").taxFacts.find(x=>x.taxType==="PAYROLL").value,/40 %/);
assert.match(getTaxCountryProfile("LS").taxFacts.find(x=>x.taxType==="PAYROLL").value,/1 020/);
assert.match(getTaxCountryProfile("SZ").taxFacts.find(x=>x.taxType==="IS").detail,/divergence/);

assert.match(getTaxCountryProfile("UG").taxFacts.find(x=>x.label.includes("seuil d'immatriculation")).value,/300 000 000 UGX/);
assert.match(getTaxCountryProfile("UG").taxFacts.find(x=>x.label.includes("PAYE")).value,/335 000 UGX/);
assert.match(getTaxCountryProfile("RW").taxFacts.find(x=>x.label.includes("seuil d'immatriculation")).value,/20 000 000 RWF/);
assert.match(getTaxCountryProfile("KE").taxFacts.find(x=>x.label.includes("seuil d'immatriculation")).value,/5 000 000 KES/);
assert.match(getTaxCountryProfile("NA").taxFacts.find(x=>x.label.includes("seuil d'immatriculation")).value,/500 000 NAD/);
assert.match(getTaxCountryProfile("BW").taxFacts.find(x=>x.taxType==="VAT").detail,/12 %/);
assert.match(getTaxCountryProfile("BW").taxFacts.find(x=>x.taxType==="VAT").value,/14 %/);
assert.match(getTaxCountryProfile("MZ").taxFacts.find(x=>x.taxType==="OTHER").value,/2 500 000 MZN/);
assert.match(getTaxCountryProfile("MW").taxFacts.find(x=>x.taxType==="IS").value,/40 % au-delà/);
assert.match(getTaxCountryProfile("MW").taxFacts.find(x=>x.label.includes("Minimum Alternative Tax")).value,/0,5 %/);

assert.match(getTaxCountryProfile("NA").taxFacts.find(x=>x.taxType==="IS").detail,/28 %/);
assert.match(getTaxCountryProfile("ZM").taxFacts.find(x=>x.label.includes("Turnover Tax")).value,/5 000 000 ZMW/);
assert.match(getTaxCountryProfile("ZM").taxFacts.find(x=>x.taxType==="IR").value,/37 %/);
assert.match(getTaxCountryProfile("TZ").taxFacts.find(x=>x.taxType==="VAT").detail,/Zanzibar/);
assert.match(getTaxCountryProfile("TZ").taxFacts.find(x=>x.label.includes("Withholding VAT")).value,/3 % sur les biens ; 6 % sur les services/);

assert.equal(getActiveTaxRules("CI","VAT","2026-01-16").some(x=>x.rate===9),false);
assert.equal(getActiveTaxRules("CI","VAT","2026-01-17").some(x=>x.rate===9),true);
assert.equal(calculateTaxLine({countryCode:"FR",taxCode:"FR_VAT_STANDARD",baseAmount:100,date:"2026-11-25"}).taxAmount,20);
assert.equal(calculateTaxLine({countryCode:"BE",taxCode:"BE_VAT_6",baseAmount:100,date:"2026-11-25",eligibilityConfirmed:true}).taxAmount,6);
assert.equal(calculateTaxLine({countryCode:"CI",taxCode:"CI_VAT_9",baseAmount:100,date:"2026-01-17",eligibilityConfirmed:true}).taxAmount,9);
assert.equal(calculateTaxLine({countryCode:"CI",taxCode:"CI_VAT_9",baseAmount:100,date:"2026-01-16",eligibilityConfirmed:true}).ok,false);
assert.equal(calculateTaxLine({countryCode:"CI",taxCode:"CI_VAT_9",baseAmount:100,date:"2026-01-17"}).ok,false);
const report=buildVatReport({countryCode:"SN",startDate:"2026-01-01",endDate:"2026-12-31",salesDocuments:[{id:1,type:"invoice",status:"issued",date:"2026-03-01",currency:"XOF",lines:[{amount:100000,taxRate:18}]}]});
assert.equal(report.ok,true);
assert.equal(report.byCurrency.XOF.outputVat,18000);
assert.ok(getTaxCountryProfile("CI").taxFacts.length>=2);
assert.equal(getTaxCountryProfile("BJ").status,"active");
assert.equal(getTaxCountryProfile("BF").status,"active");
assert.equal(getTaxCountryProfile("ML").status,"active");
assert.equal(getTaxCountryProfile("ML").calculationModules.includes("VAT"),false);
assert.equal(getTaxCountryProfile("ZZ").status,"not_configured");
for(const code of ["LR","NE","GN","GW","CG","CF"]){const p=getTaxCountryProfile(code);assert.ok(["review_required","research_required"].includes(p.status),code+" : pays non activé sans validation juridique");assert.deepEqual(p.calculationModules,[],code+" : aucun calculateur activé");assert.deepEqual(p.rules,[],code+" : aucune règle exploitable sans consolidation");assert.ok(p.legalSources.length>=2,code+" : références documentaires");}
assert.equal(getTaxCountryProfile("NE").taxFacts.find(x=>x.taxType==="VAT").value,"19 %");
assert.equal(getTaxCountryProfile("NE").taxFacts.find(x=>x.taxType==="IS").value,"30 %");
assert.equal(getTaxCountryProfile("GN").taxFacts.find(x=>x.taxType==="IS").value,"25 % / 30 % / 35 %");
assert.equal(getTaxCountryProfile("GN").taxFacts.find(x=>x.taxType==="VAT").value,"18 %");
assert.equal(getTaxCountryProfile("GN").taxFacts.find(x=>x.label==="Remboursement du crédit de TVA — contrats Finex").legalReference.includes("art. 11"),true);
assert.match(getTaxCountryProfile("GN").taxFacts.find(x=>x.label.includes("Taxe d’apprentissage")).value,/10 000 GNF/);
assert.match(getTaxCountryProfile("GN").taxFacts.find(x=>x.label.includes("Contribution foncière unique")).value,/15 % propriétés louées/);
assert.equal(getActiveTaxRules("GN","VAT","2026-11-25").length,0);
assert.equal(getActiveTaxRules("GN","IS","2026-11-25").length,0);
assert.equal(getActiveTaxRules("GW","VAT","2026-11-25").length,0);
assert.equal(getActiveTaxRules("NE","VAT","2026-11-25").length,0);
assert.equal(calculateTaxLine({countryCode:"GN",taxCode:"GN_VAT_18",baseAmount:100,date:"2026-11-25"}).ok,false);
assert.equal(calculateTaxLine({countryCode:"GW",taxCode:"GW_VAT_19",baseAmount:100,date:"2026-11-25"}).ok,false);
assert.equal(calculateTaxLine({countryCode:"NE",taxCode:"NE_VAT_19",baseAmount:100,date:"2026-11-25"}).ok,false);
assert.equal(getTaxCountryProfile("GN").taxFacts.find(x=>x.taxType==="VAT"&&x.value==="0 %").legalReference.includes("art. 373"),true);
assert.equal(getTaxCountryProfile("GW").taxFacts.find(x=>x.taxType==="VAT").value,"19 % normal ; 10 % pour les opérations de l’annexe I ; 0 % exportations");
assert.match(getTaxCountryProfile("GW").taxFacts.find(x=>x.taxType==="VAT").detail,/transmissions de biens et prestations de services/);
assert.equal(getTaxCountryProfile("LR").taxFacts.find(x=>x.taxType==="IS").value,"25 %");
const liberia=getTaxCountryProfile("LR");
assert.equal(liberia.currency,"LRD");
assert.equal(liberia.status,"review_required");
assert.deepEqual(liberia.calculationModules,[]);
assert.deepEqual(liberia.rules,[]);
assert.equal(liberia.taxFacts.find(x=>x.label==="GST — fournitures de biens taxables").value,"13 % ; exportations : 0 %");
assert.equal(liberia.taxFacts.find(x=>x.label==="GST — prestations de services taxables").value,"13 %");
assert.match(liberia.taxFacts.find(x=>x.label.includes("Télécommunications")).value,/5 %/);
assert.match(liberia.taxFacts.find(x=>x.label.includes("Télécommunications")).value,/15 %/);
assert.match(liberia.taxFacts.find(x=>x.label.includes("réforme annoncée")).value,/1er janvier 2027/);
assert.equal(getActiveTaxRules("LR","VAT","2026-11-25").length,0);
assert.equal(calculateTaxLine({countryCode:"LR",taxCode:"LR_GST_13",baseAmount:100,date:"2026-11-25"}).ok,false);
assert.equal(getTaxCountryProfile("MR").taxFacts.length,8);
assert.equal(calculateTaxLine({countryCode:"NE",taxCode:"NE_VAT_19",baseAmount:100,date:"2026-01-01"}).ok,false);
assert.equal(calculateTaxLine({countryCode:"GW",taxCode:"GW_VAT_19",baseAmount:100,date:"2026-01-01"}).ok,false);
assert.equal(getTaxCountryProfile("GH").taxFacts.find(x=>x.label.includes("NHIL"))?.value,undefined);
assert.equal(getTaxCountryProfile("NG").taxFacts.find(x=>x.taxType==="IS").value,"0 % petite société éligible ; 30 % autres sociétés");
assert.equal(getTaxCountryProfile("SL").taxFacts.find(x=>x.taxType==="IS").value,"30 %");
assert.equal(calculateTaxLine({countryCode:"NG",taxCode:"NG_VAT_7_5",baseAmount:100,date:"2026-01-01"}).taxAmount,7.5);
assert.equal(calculateTaxLine({countryCode:"GH",taxCode:"GH_VAT_15",baseAmount:100,date:"2026-01-01"}).taxAmount,15);
assert.equal(calculateTaxLine({countryCode:"TG",taxCode:"TG_VAT_18",baseAmount:100,date:"2026-01-01"}).taxAmount,18);
assert.equal(calculateTaxLine({countryCode:"SL",taxCode:"SL_GST_15",baseAmount:100,date:"2026-01-01"}).taxAmount,15);
assert.equal(calculateTaxLine({countryCode:"GM",taxCode:"GM_VAT_15",baseAmount:100,date:"2026-01-01"}).taxAmount,15);
assert.equal(getTaxCountryProfile("CV").calculationModules.includes("VAT"),false);
assert.equal(calculateTaxLine({countryCode:"CM",taxCode:"CM_VAT_STANDARD_INVOICED",baseAmount:1000,date:"2026-01-01"}).taxAmount,192.5);
assert.equal(calculateTaxLine({countryCode:"GA",taxCode:"GA_VAT_18",baseAmount:1000,date:"2026-01-01"}).taxAmount,180);
assert.equal(calculateTaxLine({countryCode:"GA",taxCode:"GA_VAT_5_CEMENT",baseAmount:1000,date:"2026-01-01"}).ok,false);
assert.equal(calculateTaxLine({countryCode:"GA",taxCode:"GA_VAT_5_CEMENT",baseAmount:1000,date:"2026-01-01",eligibilityConfirmed:true}).taxAmount,50);
assert.equal(calculateTaxLine({countryCode:"TD",taxCode:"TD_VAT_STANDARD_INVOICED",baseAmount:1000,date:"2026-01-01"}).taxAmount,192.5);
assert.equal(calculateTaxLine({countryCode:"TD",taxCode:"TD_VAT_REDUCED_INVOICED",baseAmount:1000,date:"2026-01-01"}).ok,false);
assert.equal(calculateTaxLine({countryCode:"TD",taxCode:"TD_VAT_REDUCED_INVOICED",baseAmount:1000,date:"2026-01-01",eligibilityConfirmed:true}).taxAmount,99);
assert.equal(getTaxCountryProfile("CM").calculationModules.includes("IS"),false);
assert.equal(getTaxCountryProfile("GA").calculationModules.includes("IS"),false);
assert.equal(getTaxCountryProfile("TD").calculationModules.includes("IS"),false);
assert.equal(getTaxCountryProfile("CG").status,"research_required");
assert.equal(getTaxCountryProfile("GA").taxFacts.find(x=>x.label.includes("Minimum forfaitaire")).value,"IMF : 1 % du CA fiscal HT ; MP : 1 000 000 FCFA");
assert.equal(calculateTaxLine({countryCode:"CD",taxCode:"CD_VAT_16",baseAmount:1000,date:"2026-01-01"}).taxAmount,160);
assert.equal(calculateTaxLine({countryCode:"CD",taxCode:"CD_VAT_5",baseAmount:1000,date:"2026-01-01"}).ok,false);
assert.equal(calculateTaxLine({countryCode:"CD",taxCode:"CD_VAT_5",baseAmount:1000,date:"2026-01-01",eligibilityConfirmed:true}).taxAmount,50);
assert.equal(calculateTaxLine({countryCode:"CD",taxCode:"CD_VAT_1",baseAmount:1000,date:"2026-01-01",eligibilityConfirmed:true}).taxAmount,10);
assert.equal(calculateTaxLine({countryCode:"CD",taxCode:"CD_VAT_8",baseAmount:1000,date:"2026-08-17"}).ok,false);
assert.equal(calculateTaxLine({countryCode:"CD",taxCode:"CD_VAT_8",baseAmount:1000,date:"2026-08-17",eligibilityConfirmed:true}).taxAmount,80);
assert.equal(calculateTaxLine({countryCode:"GQ",taxCode:"GQ_VAT_15",baseAmount:1000,date:"2025-01-01"}).taxAmount,150);
assert.equal(calculateTaxLine({countryCode:"GQ",taxCode:"GQ_VAT_5",baseAmount:1000,date:"2025-01-01",eligibilityConfirmed:true}).taxAmount,50);
assert.equal(getTaxCountryProfile("CD").calculationModules.includes("IS"),false);
assert.equal(getTaxCountryProfile("GQ").calculationModules.includes("IS"),false);
assert.equal(getTaxCountryProfile("CF").status,"research_required");
assert.equal(calculateTaxLine({countryCode:"MR",taxCode:"MR_VAT_16",baseAmount:1000,date:"2026-01-01"}).taxAmount,160);
assert.equal(calculateTaxLine({countryCode:"MR",taxCode:"MR_VAT_18_TELEPHONY",baseAmount:1000,date:"2026-01-01"}).ok,false);
assert.equal(getTaxCountryProfile("MR").taxFacts.find(x=>x.label.includes("Téléphonie")).value,"16 % depuis la loi de finances 2022");
assert.equal(calculateTaxLine({countryCode:"MR",taxCode:"MR_VAT_0_EXPORT",baseAmount:1000,date:"2026-01-01",eligibilityConfirmed:true}).taxAmount,0);
assert.equal(getTaxCountryProfile("MR").calculationModules.includes("IS"),false);

const lot48Profiles={
 AO:{currency:"AOA",name:"Angola",vat:"14 %",is:"25 %"},
 MG:{currency:"MGA",name:"Madagascar",vat:"20 %",is:"20 %"},
 MU:{currency:"MUR",name:"Maurice",vat:"15 %",is:"15 % en règle générale ; 3 % pour certaines sociétés exportatrices de biens"},
 SC:{currency:"SCR",name:"Seychelles",vat:"15 %",is:"15 % sur les premiers SCR 1 000 000 ; 25 % au-delà"},
 KM:{currency:"KMF",name:"Comores",vat:"Non validé",is:"35 %"}
};
for(const [code,spec] of Object.entries(lot48Profiles)){
 const p=getTaxCountryProfile(code);
 assert.equal(p.countryName,spec.name,code);
 assert.equal(p.currency,spec.currency,code);
 assert.equal(p.status,"research_required",code);
 assert.deepEqual(p.calculationModules,[],code+" : aucun module fiscal activé");
 assert.deepEqual(p.rules,[],code+" : aucune règle fiscale activée");
 assert.ok(p.legalSources.length>=3,code+" : références documentaires");
 assert.equal(p.taxFacts.find(x=>x.taxType==="VAT").value,spec.vat,code);
 assert.equal(p.taxFacts.find(x=>x.taxType==="IS").value,spec.is,code);
 assert.deepEqual(getActiveTaxRules(code,"VAT","2026-11-25"),[],code+" : aucune règle TVA active");
 assert.deepEqual(getActiveTaxRules(code,"IS","2026-11-25"),[],code+" : aucune règle IS active");
 assert.equal(calculateTaxLine({countryCode:code,taxCode:code+"_VAT_STANDARD",baseAmount:100,date:"2026-11-25"}).ok,false,code+" : calcul TVA bloqué");
 const selector=getCountry(code);
 assert.equal(selector.name,spec.name,code+" : pays présent dans le sélecteur");
 assert.equal(selector.currency,spec.currency,code+" : devise du sélecteur");
 assert.deepEqual(selector.vatRates,[],code+" : aucun taux par défaut non validé");
}
assert.match(getTaxCountryProfile("MG").taxFacts.find(x=>x.taxType==="VAT").detail,/loi de finances rectificative 2026/);
assert.match(getTaxCountryProfile("MU").taxFacts.find(x=>x.taxType==="IS").detail,/Finance Act 2026/);
assert.match(getTaxCountryProfile("SC").taxFacts.find(x=>x.taxType==="VAT").detail,/annexes du VAT Act en 2025/);
assert.match(getTaxCountryProfile("KM").taxFacts.find(x=>x.taxType==="IS").detail,/1,5 % du chiffre d'affaires/);


const lot49Profiles={
 BI:{currency:"BIF",name:"Burundi",taxType:"VAT",value:"18 %"},
 DJ:{currency:"DJF",name:"Djibouti",taxType:"VAT",value:"Non validé (7 % historique / 10 % rapporté)"},
 ET:{currency:"ETB",name:"Éthiopie",taxType:"VAT",value:"15 %"},
 ER:{currency:"ERN",name:"Érythrée",taxType:"VAT",value:"Non documenté — à vérifier"},
 SO:{currency:"SOS",name:"Somalie",taxType:"SALES_TAX",value:"5 % pour plusieurs catégories ; taux sectoriels distincts"}
};
for(const [code,spec] of Object.entries(lot49Profiles)){
 const p=getTaxCountryProfile(code);
 assert.equal(p.countryName,spec.name,code);
 assert.equal(p.currency,spec.currency,code);
 assert.equal(p.status,"research_required",code);
 assert.deepEqual(p.calculationModules,[],code+" : aucun module fiscal activé");
 assert.deepEqual(p.rules,[],code+" : aucune règle fiscale activée");
 assert.ok(p.legalSources.length>=3,code+" : références documentaires");
 assert.equal(p.taxFacts.find(x=>x.taxType===spec.taxType).value,spec.value,code);
 assert.deepEqual(getActiveTaxRules(code,spec.taxType,"2026-11-25"),[],code+" : aucune règle fiscale active");
 assert.equal(calculateTaxLine({countryCode:code,taxCode:code+"_VAT_STANDARD",baseAmount:100,date:"2026-11-25"}).ok,false,code+" : calcul fiscal bloqué");
 const selector=getCountry(code);
 assert.equal(selector.name,spec.name,code+" : pays présent dans le sélecteur");
 assert.equal(selector.currency,spec.currency,code+" : devise du sélecteur");
 assert.deepEqual(selector.vatRates,[],code+" : aucun taux TVA par défaut");
}
assert.match(getTaxCountryProfile("BI").taxFacts.find(x=>x.taxType==="VAT").detail,/facturation, de déduction et de remboursement/);
assert.match(getTaxCountryProfile("DJ").taxFacts.find(x=>x.taxType==="VAT").detail,/7 %.*10 %/);
assert.match(getTaxCountryProfile("ET").taxFacts.find(x=>x.taxType==="VAT").legalReference,/1341\/2024/);
assert.match(getTaxCountryProfile("ER").taxFacts.find(x=>x.taxType==="IS").detail,/Aucun code fiscal consolidé/);
assert.match(getTaxCountryProfile("SO").taxFacts.find(x=>x.taxType==="SALES_TAX").detail,/Il ne s'agit pas d'une TVA générale/);


const lot50Profiles={
 ZA:{currency:"ZAR",name:"Afrique du Sud",facts:["15 % — taux normal","27 % — taux général"]},
 SD:{currency:"SDG",name:"Soudan",facts:["Taux actuel non confirmé — textes officiels divergents dans leur ancienneté","Taux et catégories à consolider"]},
 SS:{currency:"SSP",name:"Soudan du Sud",facts:["Régime et taux 2026 à confirmer","Projet de barème 2026/27 : 0 % à 20 % sur salaires — non activé"]},
 ST:{currency:"STN",name:"São Tomé-et-Príncipe",facts:["15 % taux normal ; 7,5 % taux réduit ; régimes spéciaux","Taux 2026 à confirmer"]},
 DZ:{currency:"DZD",name:"Algérie",facts:["19 % taux normal ; 9 % taux réduit","19 % production ; 23 % BTP/hydraulique/tourisme ; 26 % autres activités"]}
};
for(const [code,spec] of Object.entries(lot50Profiles)){
 const p=getTaxCountryProfile(code);
 assert.equal(p.countryName,spec.name,code);
 assert.equal(p.currency,spec.currency,code);
 assert.equal(p.status,"research_required",code);
 assert.deepEqual(p.calculationModules,[],code+" : aucun module fiscal activé");
 assert.deepEqual(p.rules,[],code+" : aucune règle fiscale activée");
 assert.ok(p.legalSources.length>=3,code+" : références documentaires");
 assert.equal(p.taxFacts.find(x=>x.taxType==="VAT").value,spec.facts[0],code);
 assert.equal(p.taxFacts.find(x=>x.taxType==="IS"||x.taxType==="IR").value,spec.facts[1],code);
 assert.deepEqual(getActiveTaxRules(code,"VAT","2026-11-25"),[],code+" : aucune règle TVA active");
 assert.deepEqual(getActiveTaxRules(code,"IS","2026-11-25"),[],code+" : aucune règle IS active");
 assert.equal(calculateTaxLine({countryCode:code,taxCode:code+"_VAT_STANDARD",baseAmount:100,date:"2026-11-25"}).ok,false,code+" : calcul fiscal bloqué");
 const selector=getCountry(code);
 assert.equal(selector.name,spec.name,code+" : pays présent dans le sélecteur");
 assert.equal(selector.currency,spec.currency,code+" : devise du sélecteur");
 assert.deepEqual(selector.vatRates,[],code+" : aucun taux TVA par défaut");
}
assert.match(getTaxCountryProfile("ZA").taxFacts.find(x=>x.taxType==="IS").detail,/27 %/);
assert.match(getTaxCountryProfile("SD").taxFacts.find(x=>x.taxType==="VAT").detail,/15 %.*17 %/);
assert.match(getTaxCountryProfile("SS").taxFacts.find(x=>x.taxType==="IR").detail,/projet/);
assert.match(getTaxCountryProfile("ST").taxFacts.find(x=>x.taxType==="VAT").detail,/CIVA consolidé/);
assert.match(getTaxCountryProfile("DZ").taxFacts.find(x=>x.taxType==="IS").detail,/10 %/);

console.log("Lot 23/33/34/35 — juridictions fiscales internationales et Afrique centrale : OK");
