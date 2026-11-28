// MIZANE — Calculateurs fiscaux régionaux, versionnés selon les textes vérifiés.
const round2=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const validAmount=n=>Number.isFinite(Number(n))&&Number(n)>=0;
const validDate=s=>{const m=String(s||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3];};
const BENIN_WHT=[
 ["BJ_AIB_GOODS_REGISTERED","AIB — achats de biens / travaux, IFU",1,"CGI Bénin 2025, art. 130 et 132-2-a"],
 ["BJ_AIB_SERVICES_REGISTERED","AIB — prestations de services, prestataire IFU",3,"CGI Bénin 2025, art. 130 et 132-2-b"],
 ["BJ_AIB_UNREGISTERED","AIB — achats / prestations à fournisseur non immatriculé IFU",5,"CGI Bénin 2025, art. 130 et 132-2-c"],
 ["BJ_NONFILED","Prélèvement — opérateur non connu du fichier DGI",10,"CGI Bénin 2025, art. 135 à 138"]
];
const BURKINA_WHT=[
 ["BF_NONRESIDENT","Prestations de non-résidents sans établissement stable",20,"CGI Burkina Faso, art. 211 à 214"],
 ["BF_NONDETERMINED_MANUAL","Régime non déterminé — prestation manuelle / vacation d’enseignement",2,"CGI Burkina Faso, art. 220 et 221"],
 ["BF_NONDETERMINED_PUBLIC","Régime non déterminé — entité publique/parapublique",5,"CGI Burkina Faso, art. 220 et 221"],
 ["BF_NONDETERMINED_OCCASIONAL","Régime non déterminé — prestation intellectuelle occasionnelle",10,"CGI Burkina Faso, art. 220 et 221"],
 ["BF_NONDETERMINED_COMPANY","Régime non déterminé — personne morale privée",20,"CGI Burkina Faso, art. 220 et 221"]
];
export function getRegionalWithholdingOptions(code){
 const rows=String(code||"").toUpperCase()==="BJ"?BENIN_WHT:String(code||"").toUpperCase()==="BF"?BURKINA_WHT:[];
 return rows.map(([code,label,rate,legalReference])=>({code,label,rate,legalReference}));
}
export function calculateRegionalIS({countryCode,fiscalProfit,additions=0,deductions=0,turnover=0,sector="standard",industry="general"}={}){
 const code=String(countryCode||"").toUpperCase();
 if(!["BJ","BF","ML"].includes(code)||!Number.isFinite(Number(fiscalProfit))||!validAmount(additions)||!validAmount(deductions)||!validAmount(turnover))return{ok:false,errors:["Données fiscales ou juridiction invalides."]};
 const profit=round2(Number(fiscalProfit)+Number(additions)-Number(deductions)),taxable=Math.max(0,profit);
 if(code==="BJ"){
  const rate=industry==="industrial"||industry==="education"?25:30;
  const minRate=sector==="real_estate"?10:sector==="building"?3:1;
  const minimum=Math.max(250000,round2(Number(turnover)*minRate/100));
  const tax=round2(taxable*rate/100);
  return{ok:true,countryCode:code,currency:"XOF",rulesVersion:"CGI-BJ-2025",fiscalProfit:profit,taxableProfit:taxable,rate,corporateTax:tax,minimumTax:minimum,minimumRate:minRate,amountDue:Math.max(tax,minimum),legalReference:"CGI Bénin 2025, art. 46 et 47",warnings:["Taux de 25 % réservé aux activités industrielles non extractives et aux établissements privés d’enseignement visés ; 30 % dans les autres cas.","Minimum calculé sur les produits encaissables déclarés ; minimum légal de 250 000 FCFA. Vérifier les exclusions et régimes particuliers."],disclaimer:"Simulation IS indicative ; elle ne détermine pas les produits encaissables ni les exonérations."};
 }
 if(code==="BF"){
  const rate=27.5,tax=round2(taxable*rate/100),minimum=round2(Number(turnover)*.005);
  return{ok:true,countryCode:code,currency:"XOF",rulesVersion:"CGI-BF-2026 / paramètres vérifiés disponibles",fiscalProfit:profit,taxableProfit:taxable,rate,corporateTax:tax,minimumTax:minimum,minimumRate:.5,amountDue:Math.max(tax,minimum),legalReference:"CGI Burkina Faso, art. 87 à 90 ; taux 27,5 % et minimum forfaitaire",warnings:["Minimum forfaitaire calculé à 0,5 % du chiffre d’affaires HT ; vérifier le plancher/plafond et les règles sectorielles applicables dans le CGI 2026 avant déclaration."],disclaimer:"Simulation IS indicative sur bénéfice fiscal déjà déterminé."};
 }
 const tax=round2(taxable*.30),minimum=profit<=0?round2(Number(turnover)*.01):0;
 return{ok:true,countryCode:code,currency:"XOF",rulesVersion:"CGI-Mali / Loi de finances 2025",fiscalProfit:profit,taxableProfit:taxable,rate:30,corporateTax:tax,minimumTax:minimum,minimumRate:1,amountDue:Math.max(tax,minimum),legalReference:"CGI Mali ; DGI Mali — régime réel : 30 % du bénéfice, 1 % du CA HT en cas de déficit",warnings:["Le minimum de 1 % du chiffre d’affaires HT est décrit par la DGI en cas de déficit ; la présente simulation l’affiche comme repère de plancher, à confirmer selon le régime et la situation exacte."],disclaimer:"Simulation indicative ; régimes IBIC/IS, minimums et crédits doivent être vérifiés au regard du CGI et de la loi de finances applicables."};
}
export function calculateRegionalWithholding({countryCode,ruleCode,baseAmount,date}={}){
 const code=String(countryCode||"").toUpperCase(),rows=code==="BJ"?BENIN_WHT:code==="BF"?BURKINA_WHT:[];
 const row=rows.find(x=>x[0]===ruleCode),base=Number(baseAmount);
 if(!row||!validAmount(base)||!validDate(date)||!["2025","2026"].includes(String(date).slice(0,4)))return{ok:false,errors:["Catégorie de retenue, base ou date invalide."]};
 const tax=round2(base*row[2]/100);
 return{ok:true,countryCode:code,currency:"XOF",ruleCode,label:row[1],baseAmount:round2(base),rate:row[2],taxAmount:tax,netPayment:round2(base-tax),date,legalReference:row[3],warnings:["Retenue applicable uniquement si le statut du payeur, du bénéficiaire, la nature du flux et les conditions du texte correspondent exactement à la catégorie choisie.","Pour le Bénin, la base AIB est hors TVA ; vérifier le mode de calcul et les cas de dispense. Pour le Burkina, vérifier résidence, établissement stable et régime du bénéficiaire."]};
}
