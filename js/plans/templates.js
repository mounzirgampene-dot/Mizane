// MIZANE — Modèles sectoriels indicatifs.
// Ces modèles facilitent le démarrage ; ils ne constituent pas des plans officiels
// et doivent être adaptés au référentiel légal applicable à chaque entreprise.
const makePlan = (id, name, description, accounts) => ({
  id, name, category: "sectoral-template", status: "indicative",
  official: false, version: "1.0.0", description,
  classes: [
    { code: "1", name: "Capitaux et financements" },
    { code: "2", name: "Immobilisations" },
    { code: "3", name: "Stocks et en-cours" },
    { code: "4", name: "Tiers" },
    { code: "5", name: "Trésorerie" },
    { code: "6", name: "Charges" },
    { code: "7", name: "Produits" },
  ],
  accounts,
});

export const COMMERCE = makePlan(
  "template-commerce", "Modèle sectoriel — Commerce",
  "Trame indicative pour commerce de détail et de gros ; à adapter au plan national applicable.",
  [
    ["101","Capital","equity"],["106","Réserves","equity"],["120","Résultat de l'exercice","equity"],
    ["164","Emprunts","liability"],["218","Agencements et matériel commercial","asset"],["2818","Amortissements des agencements et matériel","asset"],
    ["31","Stocks de marchandises","asset"],["37","Stocks en magasin","asset"],["397","Dépréciations des stocks","asset"],
    ["401","Fournisseurs","liability"],["409","Fournisseurs débiteurs","asset"],["411","Clients","asset"],["416","Clients douteux","asset"],
    ["421","Personnel — rémunérations dues","liability"],["431","Organismes sociaux","liability"],["445","État — taxes et TVA","liability"],
    ["512","Banques","asset"],["530","Caisse","asset"],
    ["607","Achats de marchandises","expense"],["608","Frais accessoires d'achat","expense"],["609","Réductions obtenues sur achats","income"],
    ["6037","Variation des stocks de marchandises","expense"],["613","Locations","expense"],["624","Transports sur ventes","expense"],
    ["627","Publicité et communication","expense"],["641","Impôts et taxes","expense"],["661","Salaires et charges de personnel","expense"],
    ["681","Dotations aux amortissements","expense"],["707","Ventes de marchandises","income"],["709","Rabais et remises accordés","expense"],
    ["758","Autres produits de gestion","income"],["658","Autres charges de gestion","expense"],
    ["207","Fonds commercial","asset"],["2815","Amortissements des installations commerciales","asset"],["391","Dépréciations des stocks","asset"],
    ["408","Fournisseurs — factures non parvenues","liability"],["419","Clients créditeurs","liability"],["425","Avances au personnel","asset"],
    ["4457","TVA collectée — compte de suivi","liability"],["519","Concours bancaires courants","liability"],["606","Fournitures non stockées","expense"],
    ["615","Entretien et réparations","expense"],["618","Services divers","expense"],["706","Produits des services annexes","income"],
  ]
);

export const SERVICES = makePlan(
  "template-services", "Modèle sectoriel — Prestations de services",
  "Trame indicative pour conseil, services professionnels et activités de prestation ; à adapter au plan national applicable.",
  [
    ["101","Capital","equity"],["106","Réserves","equity"],["120","Résultat de l'exercice","equity"],["164","Emprunts","liability"],
    ["205","Logiciels et droits d'utilisation","asset"],["218","Matériel informatique et mobilier","asset"],["280","Amortissements des immobilisations","asset"],
    ["401","Fournisseurs","liability"],["411","Clients","asset"],["416","Clients douteux","asset"],["418","Factures à établir","asset"],
    ["421","Personnel — rémunérations dues","liability"],["431","Organismes sociaux","liability"],["445","État — taxes et TVA","liability"],
    ["512","Banques","asset"],["530","Caisse","asset"],
    ["604","Achats d'études et prestations externes","expense"],["613","Locations","expense"],["622","Honoraires et commissions","expense"],
    ["623","Communication et publicité","expense"],["626","Télécommunications et internet","expense"],["627","Services bancaires","expense"],
    ["641","Impôts et taxes","expense"],["661","Salaires et rémunérations","expense"],["645","Charges sociales","expense"],
    ["681","Dotations aux amortissements","expense"],["706","Prestations de services","income"],["708","Produits des activités annexes","income"],
    ["709","Rabais et réductions accordés","expense"],["758","Autres produits de gestion","income"],
    ["207","Fonds commercial","asset"],["213","Constructions et aménagements","asset"],["232","Immobilisations en cours","asset"],
    ["2815","Amortissements du matériel","asset"],["409","Fournisseurs débiteurs","asset"],["419","Clients créditeurs","liability"],
    ["425","Avances au personnel","asset"],["437","Autres organismes sociaux","liability"],["4457","TVA collectée — compte de suivi","liability"],
    ["519","Concours bancaires courants","liability"],["605","Fournitures et petit équipement","expense"],["616","Assurances","expense"],
    ["618","Services divers","expense"],["625","Déplacements et missions","expense"],["631","Frais bancaires et assimilés","expense"],
  ]
);

export const AGRICULTURE = makePlan(
  "template-agriculture", "Modèle sectoriel — Agriculture",
  "Trame indicative pour exploitation agricole ; les règles de stocks biologiques, récoltes et subventions doivent être adaptées au référentiel applicable.",
  [
    ["101","Capital ou fonds de l'exploitant","equity"],["106","Réserves","equity"],["120","Résultat de l'exercice","equity"],["164","Emprunts agricoles","liability"],
    ["213","Aménagements et constructions agricoles","asset"],["215","Matériel et équipements agricoles","asset"],["241","Plantations et actifs biologiques — à qualifier","asset"],
    ["281","Amortissements des immobilisations","asset"],["31","Stocks d'intrants et matières","asset"],["32","Cultures en cours — suivi analytique","asset"],
    ["33","Récoltes et produits agricoles","asset"],["34","Animaux et productions animales — à qualifier","asset"],
    ["401","Fournisseurs","liability"],["411","Clients","asset"],["421","Personnel","liability"],["445","État — taxes et TVA","liability"],
    ["512","Banques","asset"],["530","Caisse","asset"],
    ["601","Semences et plants","expense"],["602","Engrais et amendements","expense"],["603","Produits phytosanitaires","expense"],
    ["604","Aliments et fournitures d'élevage","expense"],["605","Eau, énergie et carburants","expense"],["611","Travaux agricoles sous-traités","expense"],
    ["613","Locations de terres et matériels","expense"],["641","Taxes et contributions","expense"],["661","Salaires agricoles","expense"],
    ["681","Dotations aux amortissements","expense"],["701","Ventes de produits agricoles","income"],["702","Ventes de produits transformés","income"],
    ["74","Subventions d'exploitation — traitement à adapter","income"],["758","Autres produits agricoles","income"],
    ["207","Fonds commercial et droits","asset"],["214","Matériel spécialisé et équipements","asset"],["218","Autres équipements agricoles","asset"],
    ["232","Immobilisations agricoles en cours","asset"],["2815","Amortissements du matériel agricole","asset"],["391","Dépréciations des stocks d'intrants","asset"],
    ["409","Avances versées aux fournisseurs","asset"],["419","Clients créditeurs","liability"],["425","Avances au personnel","asset"],
    ["437","Organismes sociaux — autres","liability"],["4457","TVA collectée — compte de suivi","liability"],["519","Concours bancaires courants","liability"],
    ["608","Frais accessoires sur achats agricoles","expense"],["616","Assurances agricoles","expense"],["618","Services divers","expense"],
    ["625","Déplacements et missions","expense"],["628","Frais de télécommunication","expense"],["708","Produits accessoires agricoles","income"],
  ]
);

export const ASSOCIATION = makePlan(
  "template-association", "Modèle sectoriel — Association / ONG",
  "Trame indicative pour association ou ONG ; fonds affectés, dons et subventions nécessitent une adaptation aux règles locales.",
  [
    ["101","Fonds associatifs","equity"],["102","Fonds dédiés et réserves — à qualifier","equity"],["120","Excédent ou déficit de l'exercice","equity"],
    ["164","Emprunts et dettes financières","liability"],["218","Matériel et équipements","asset"],["280","Amortissements","asset"],
    ["401","Fournisseurs","liability"],["411","Adhérents et bénéficiaires débiteurs","asset"],["421","Personnel — rémunérations dues","liability"],
    ["431","Organismes sociaux","liability"],["441","Subventions à recevoir","asset"],["442","Dons et legs à recevoir","asset"],
    ["467","Autres comptes de tiers","liability"],["512","Banques","asset"],["530","Caisse","asset"],
    ["604","Prestations et activités sous-traitées","expense"],["606","Fournitures et consommables","expense"],["613","Locations","expense"],
    ["622","Honoraires","expense"],["623","Communication et collecte de fonds","expense"],["641","Taxes et contributions","expense"],
    ["661","Salaires et charges de personnel","expense"],["681","Dotations aux amortissements","expense"],
    ["706","Prestations et activités associatives","income"],["741","Subventions d'exploitation","income"],["742","Dons et legs","income"],
    ["743","Cotisations des membres","income"],["744","Mécénat et parrainage","income"],["758","Autres produits","income"],
    ["207","Fonds commercial et droits","asset"],["213","Constructions et aménagements","asset"],["232","Immobilisations en cours","asset"],
    ["2815","Amortissements du matériel","asset"],["409","Fournisseurs débiteurs","asset"],["418","Produits à recevoir","asset"],
    ["419","Adhérents créditeurs","liability"],["425","Avances au personnel","asset"],["437","Autres organismes sociaux","liability"],
    ["448","Autres créances et dettes","asset"],["519","Concours bancaires courants","liability"],["605","Achats non stockés","expense"],
    ["616","Assurances","expense"],["618","Services divers","expense"],["625","Déplacements et missions","expense"],
    ["631","Frais bancaires","expense"],["708","Produits accessoires","income"],["745","Produits de manifestations","income"],
  ]
);

export const SECTORAL_TEMPLATES = [COMMERCE, SERVICES, AGRICULTURE, ASSOCIATION];
