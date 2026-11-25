// MIZANE — Calculateurs fiscaux partiels Sénégal / Côte d'Ivoire.
// Sources : CGI Sénégal 2025 et textes en vigueur vérifiés ; CGI CI 2026 et publications DGI.
const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const amount=n=>Number.isFinite(Number(n))&&Number(n)>=0;
const signed=n=>Number.isFinite(Number(n));
const dateOK=s=>{const m=String(s||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3];};
function progressive(income,brackets){let tax=0;const breakdown=[];for(const b of brackets){const base=Math.max(0,Math.min(income,b.to)-b.from);if(base){const due=round2(base*b.rate/100);tax=round2(tax+due);breakdown.push({from:b.from,to:Number.isFinite(b.to)?b.to:null,rate:b.rate,base:round2(base),tax:due});}}return{tax,breakdown};}
const SN_BRACKETS=[{from:0,to:630000,rate:0},{from:630000,to:1500000,rate:20},{from:1500000,to:4000000,rate:30},{from:4000000,to:8000000,rate:35},{from:8000000,to:13500000,rate:37},{from:13500000,to:50000000,rate:40},{from:50000000,to:Infinity,rate:43}];
const SN_FAMILY={1:{r:0,min:0,max:0},1.5:{r:10,min:100000,max:300000},2:{r:15,min:200000,max:650000},2.5:{r:20,min:300000,max:1100000},3:{r:25,min:400000,max:1650000},3.5:{r:30,min:500000,max:2030000},4:{r:35,min:600000,max:2490000},4.5:{r:40,min:700000,max:2755000},5:{r:45,min:800000,max:3180000}};
const CI_ITS=[{from:0,to:75000,rate:0},{from:75000,to:240000,rate:16},{from:240000,to:800000,rate:21},{from:800000,to:2400000,rate:24},{from:2400000,to:8000000,rate:28},{from:8000000,to:Infinity,rate:32}];
const CI_RICF={1:0,1.5:5500,2:11000,2.5:16500,3:22000,3.5:27500,4:33000,4.5:38500,5:44000};
export function calculateSenegalIS({fiscalProfit,additions=0,deductions=0,priorYearTurnover=0,taxpayerCategory="standard",minimumTaxExempt=false}={}){
 if(!signed(fiscalProfit)||!amount(additions)||!amount(deductions)||!amount(priorYearTurnover)||taxpayerCategory!=="standard"||typeof minimumTaxExempt!=="boolean")return{ok:false,errors:["Résultat fiscal, chiffre d'affaires ou catégorie de contribuable invalide."]};
 const profit=round2(Number(fiscalProfit)+Number(additions)-Number(deductions)),taxable=Math.max(0,profit),is=round2(taxable*.30);
 const floors={standard:500000},caps={standard:5000000};
 const imf=minimumTaxExempt?0:Math.min(caps[taxpayerCategory],Math.max(floors[taxpayerCategory],Number(priorYearTurnover)*.005));
 return{ok:true,countryCode:"SN",currency:"XOF",rulesVersion:"CGI-2025 / CGI-2025 — règles en vigueur vérifiées en 2026",fiscalProfit:profit,taxableProfit:taxable,corporateRate:30,corporateTax:is,priorYearTurnover:round2(Number(priorYearTurnover)),minimumTaxRate:.5,minimumTaxFloor:floors[taxpayerCategory],minimumTaxCeiling:caps[taxpayerCategory],minimumTax:round2(imf),minimumTaxExempt,taxpayerCategory,amountDue:round2(Math.max(is,imf)),legalReference:"CGI Sénégal, art. 36 et 38 à 40 ; art. 40, CGI 2025",warnings:["Société supposée soumise à l'IS et non exonérée. Régimes sectoriels, crédits, déficits et retraitements spécifiques non calculés.","IMF calculé sur CA HT de l'année précédente à 0,5 %, avec plancher/plafond selon le service de rattachement. Confirmer les exonérations."],disclaimer:"Simulation IS + IMF indicative ; la catégorie de rattachement doit être confirmée auprès de la DGID."};
}
export function calculateSenegalIR({annualTaxableIncome,familyParts=1}={}){
 const raw=Number(annualTaxableIncome),parts=Number(familyParts),f=SN_FAMILY[parts];
 if(!amount(raw)||!f)return{ok:false,errors:["Revenu annuel imposable invalide ou nombre de parts hors barème (1 à 5 par demi-part)."]};
 const income=Math.floor(raw/1000)*1000,r=progressive(income,SN_BRACKETS),gross=Math.min(r.tax,round2(income*.43));
 const reduction=f.r?Math.min(f.max,Math.max(f.min,round2(gross*f.r/100))):0,net=round2(Math.max(0,gross-reduction));
 return{ok:true,countryCode:"SN",currency:"XOF",rulesVersion:"CGI-2025",annualTaxableIncome:round2(raw),roundedTaxableIncome:income,familyParts:parts,grossAnnualTax:gross,familyReduction:reduction,annualTax:net,monthlyEquivalent:round2(net/12),effectiveRate:income?round2(net/income*100):0,breakdown:r.breakdown,legalReference:"CGI Sénégal, art. 173 et 174",warnings:["Saisir le revenu imposable après les abattements de sa catégorie. Retenues catégorielles et régimes spéciaux non recalculés."],disclaimer:"Revenu arrondi au millier de FCFA inférieur ; réduction familiale calculée selon le barème de l'article 174."};
}
const SN_WHT=[
["SN_DIVIDENDS","Produits des actions et parts sociales",10,"CGI Sénégal, art. 173-2"],
["SN_BONDS","Revenus d'obligations",13,"CGI Sénégal, art. 173-2"],
["SN_BONDS_5Y","Obligations émises au Sénégal, échéance ≥ 5 ans",6,"CGI Sénégal, art. 173-2"],
["SN_LOTTERY","Lots",15,"CGI Sénégal, art. 173-2"],
["SN_OTHER_CAPITAL","Autres revenus de capitaux mobiliers",16,"CGI Sénégal, art. 173-2"],
["SN_BANK_DEPOSITS","Intérêts de comptes de dépôts éligibles",8,"CGI Sénégal, art. 173-2 et 101"],
["SN_CASH_BONDS","Intérêts des bons de caisse",20,"CGI Sénégal, art. 173-2"]];
const CI_WHT=[
["CI_AIRSI","AIRSI — vente de marchandises à opérateur visé (base TTC)",5,"gross","CGI Côte d'Ivoire, art. 19"],
["CI_PPSSI","PPSSI — service par micro-entreprise / entreprenant (base HT)",2,"gross","CGI Côte d'Ivoire, art. 84 bis"],
["CI_IRVM","IRVM — revenus de valeurs mobilières",15,"gross","CGI Côte d'Ivoire, art. 182"],
["CI_RIBIC","RIBIC — bénéficiaire résident non immatriculé, cas éligible",7.5,"gross","CGI Côte d'Ivoire, art. 93"],
["CI_RIBNC","RIBNC — prestataire non-résident sans installation professionnelle",25,"net80","CGI Côte d'Ivoire, art. 92-2° a) ; doctrine DGI n°046/2024"],
["CI_RIRL_PERSONAL","Acompte revenus locatifs — propriétaire personne physique",12,"gross","CGI Côte d'Ivoire, art. 168 et 169 ; DGI, Le système fiscal ivoirien","Acompte sur revenus locatifs : 12 % du loyer brut pour un propriétaire personne physique, sous réserve des conditions de retenue et du rôle de l’intermédiaire."],
["CI_RIRL_LEGAL","Acompte revenus locatifs — propriétaire personne morale ou entreprise",15,"gross","CGI Côte d'Ivoire, art. 168 et 169 ; DGI, Le système fiscal ivoirien","Acompte sur revenus locatifs : 15 % du loyer brut lorsque le local appartient à une personne morale ou à une entreprise ; vérifier le redevable légal et les exceptions."],
["CI_FIRCA","Prélèvement FIRCA — filières agricoles, cas général",2,"gross","CGI Côte d'Ivoire, art. 60 bis"],
["CI_FIRCA_CACAO","Prélèvement FIRCA — pisteurs café-cacao",7.5,"gross","CGI Côte d'Ivoire, art. 60 bis"],
["CI_ARTISTS_2026","Rémunérations de certains artistes, sportifs et intervenants non salariés",7.5,"gross","Annexe fiscale 2026 — extension de la retenue sur cachets"]];
export function getAfricanWithholdingOptions(code){const c=String(code||"").toUpperCase();return(c==="SN"?SN_WHT.map(x=>({code:x[0],label:x[1],rate:x[2],legalReference:x[3]})):c==="CI"?CI_WHT.map(x=>({code:x[0],label:x[1],rate:x[2],legalReference:x[4]})):[]);}
export function calculateSenegalWithholding({ruleCode,baseAmount,date}={}){
 const base=Number(baseAmount),rule=SN_WHT.find(x=>x[0]===ruleCode);
 if(!amount(base)||!dateOK(date)||!["2025","2026"].includes(String(date).slice(0,4)))return{ok:false,errors:["Base ou date invalide ; référentiel CGI 2025 sous réserve des textes ultérieurs."]};
 if(!rule)return{ok:false,errors:["Catégorie de retenue inconnue pour le Sénégal."]};
 const due=round2(base*rule[2]/100);return{ok:true,countryCode:"SN",currency:"XOF",ruleCode,label:rule[1],baseAmount:round2(base),rate:rule[2],taxAmount:due,netPayment:round2(base-due),date,legalReference:rule[3],warnings:["Vérifier qualification du revenu, exonérations, résidence et convention fiscale éventuelle."]};
}
export function calculateCoteIvoireIS({fiscalProfit,additions=0,deductions=0,sector="standard"}={}){
 if(!signed(fiscalProfit)||!amount(additions)||!amount(deductions)||!["standard","telecom","games"].includes(sector))return{ok:false,errors:["Résultat fiscal, retraitements ou secteur invalide."]};
 const profit=round2(Number(fiscalProfit)+Number(additions)-Number(deductions)),taxable=Math.max(0,profit),rate=sector==="standard"?25:30,due=round2(taxable*rate/100);
 return{ok:true,countryCode:"CI",currency:"XOF",rulesVersion:"CGI-2026",fiscalProfit:profit,taxableProfit:taxable,sector,rate,corporateTax:due,amountDue:due,legalReference:"CGI Côte d'Ivoire — taux de référence 25 %, taux sectoriel 30 % télécommunications/TIC et jeux de hasard",warnings:["Taux 30 % réservé aux secteurs expressément visés ; vérifier la qualification de l'activité.","Impôt minimum forfaitaire, crédits, déficits, contributions et retraitements particuliers exclus."],disclaimer:"Simulation sur bénéfice fiscal déjà déterminé ; le résultat comptable n'est pas automatiquement la base imposable."};
}
export function calculateCoteIvoireITS({monthlyTaxableSalary,familyParts=1}={}){
 const salary=Number(monthlyTaxableSalary),parts=Number(familyParts);
 if(!amount(salary)||!Object.prototype.hasOwnProperty.call(CI_RICF,parts))return{ok:false,errors:["Salaire mensuel imposable ou nombre de parts RICF invalide (1 à 5 par demi-part)."]};
 const r=progressive(salary,CI_ITS),reduction=CI_RICF[parts],due=round2(Math.max(0,r.tax-reduction));
 return{ok:true,countryCode:"CI",currency:"XOF",rulesVersion:"CGI-2026",monthlyTaxableSalary:round2(salary),familyParts:parts,grossMonthlyTax:r.tax,familyReduction:reduction,monthlyTax:due,annualEquivalent:round2(due*12),effectiveRate:salary?round2(due/salary*100):0,breakdown:r.breakdown,legalReference:"CGI Côte d'Ivoire, art. 115 et suivants — barème ITS et RICF publiés par la DGI",warnings:["Saisir l'assiette mensuelle ITS après abattements et exclusions. Cotisations sociales, contribution employeur, pensions, expatriation et exonérations particulières exclus."],disclaimer:"Simulation ITS et RICF, non équivalente à une paie complète."};
}
export function calculateCoteIvoireWithholding({ruleCode,baseAmount,date}={}){
 const base=Number(baseAmount),rule=CI_WHT.find(x=>x[0]===ruleCode);
 if(ruleCode==="CI_RIRL")return{ok:false,errors:["Ancienne règle RIRL à 7,5 % retirée : sélectionner 12 % pour un propriétaire personne physique ou 15 % pour une personne morale/entreprise, après vérification des conditions légales."]};
 if(!amount(base)||!dateOK(date)||!String(date).startsWith("2026-"))return{ok:false,errors:["Base ou date invalide ; règles de retenue versionnées pour 2026."]};
 if(!rule)return{ok:false,errors:["Catégorie de retenue inconnue pour la Côte d'Ivoire."]};
 const taxable=rule[3]==="net80"?round2(base*.8):base,due=round2(taxable*rule[2]/100);
 const warnings=["Retenue applicable uniquement à la catégorie et au bénéficiaire visés. Vérifier territorialité, convention, exonérations et formalités avant paiement."];
 if(rule[5])warnings.push(rule[5]);
 return{ok:true,countryCode:"CI",currency:"XOF",ruleCode,label:rule[1],baseAmount:round2(base),taxableBase:taxable,rate:rule[2],effectiveRate:round2(due/base*100),taxAmount:due,netPayment:round2(base-due),date,legalReference:rule[4],warnings};
}
