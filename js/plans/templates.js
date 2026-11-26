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


const INDUSTRY = makePlan("template-industry", "Modèle sectoriel — Industrie / Fabrication",
  "Trame indicative pour production industrielle ; coûts de production, en-cours, stocks et immobilisations à adapter au référentiel local.",
  [["101","Capital","equity"],["164","Emprunts","liability"],["213","Bâtiments industriels","asset"],["215","Machines de production","asset"],["231","Immobilisations en cours","asset"],["2815","Amortissements des machines","asset"],["31","Matières premières","asset"],["32","En-cours de production","asset"],["35","Produits finis","asset"],["397","Dépréciations des stocks","asset"],["401","Fournisseurs","liability"],["408","Factures non parvenues","liability"],["411","Clients","asset"],["421","Personnel","liability"],["431","Organismes sociaux","liability"],["512","Banques","asset"],["601","Achats de matières premières","expense"],["602","Consommables industriels","expense"],["611","Sous-traitance industrielle","expense"],["615","Maintenance des machines","expense"],["661","Salaires de production","expense"],["681","Dotations aux amortissements","expense"],["701","Ventes de produits finis","income"],["713","Variation des stocks de produits","income"],["419","Avances reçues des clients","liability"],["425","Avances au personnel","asset"],["4456","Taxes déductibles — suivi","asset"],["4457","Taxes collectées — suivi","liability"],["606","Fournitures industrielles","expense"],["758","Cessions de rebuts et produits annexes","income"]]);

const CONSTRUCTION = makePlan("template-construction", "Modèle sectoriel — BTP / Construction",
  "Trame indicative pour bâtiment et travaux publics ; situations de travaux, retenues de garantie et avances clients à adapter aux règles locales.",
  [["101","Capital","equity"],["164","Emprunts","liability"],["213","Bâtiments et installations","asset"],["215","Engins et matériel de chantier","asset"],["231","Immobilisations en cours","asset"],["2815","Amortissements des engins","asset"],["31","Stocks de matériaux","asset"],["34","Travaux en cours — suivi à adapter","asset"],["401","Fournisseurs","liability"],["404","Fournisseurs d'immobilisations","liability"],["411","Clients","asset"],["418","Situations de travaux à établir","asset"],["419","Avances reçues des clients","liability"],["421","Personnel","liability"],["431","Organismes sociaux","liability"],["512","Banques","asset"],["530","Caisse chantier","asset"],["601","Achats de matériaux","expense"],["611","Sous-traitance de travaux","expense"],["613","Locations d'engins","expense"],["615","Entretien des équipements","expense"],["661","Main-d'œuvre de chantier","expense"],["681","Dotations aux amortissements","expense"],["704","Travaux et prestations de construction","income"],["425","Avances au personnel","asset"],["4456","Taxes déductibles — suivi","asset"],["4457","Taxes collectées — suivi","liability"],["618","Services extérieurs de chantier","expense"],["708","Locations et prestations annexes","income"],["758","Autres produits de chantier","income"]]);

const HOSPITALITY = makePlan("template-hospitality", "Modèle sectoriel — Hôtellerie / Restauration",
  "Trame indicative pour hôtels, restaurants et hébergement ; stocks alimentaires, boissons, commissions de plateformes et taxes touristiques à adapter localement.",
  [["101","Capital","equity"],["164","Emprunts","liability"],["213","Bâtiments et aménagements","asset"],["218","Mobilier et équipements","asset"],["2818","Amortissements du mobilier","asset"],["31","Stocks alimentaires","asset"],["32","Stocks de boissons","asset"],["397","Dépréciations des stocks","asset"],["401","Fournisseurs","liability"],["408","Factures non parvenues","liability"],["411","Clients et agences","asset"],["416","Créances douteuses","asset"],["421","Personnel","liability"],["431","Organismes sociaux","liability"],["512","Banques","asset"],["530","Caisse et points de vente","asset"],["601","Achats alimentaires","expense"],["602","Achats de boissons","expense"],["613","Locations","expense"],["615","Entretien et réparations","expense"],["623","Publicité et plateformes de réservation","expense"],["661","Salaires et charges de personnel","expense"],["681","Dotations aux amortissements","expense"],["706","Prestations d'hébergement","income"],["707","Ventes de repas","income"],["708","Boissons et services annexes","income"],["425","Avances au personnel","asset"],["4456","Taxes déductibles — suivi","asset"],["4457","Taxes collectées — suivi","liability"],["519","Concours bancaires courants","liability"]]);

const HEALTHCARE = makePlan("template-healthcare", "Modèle sectoriel — Santé / Clinique",
  "Trame indicative pour cabinet médical, clinique ou laboratoire ; actes réglementés, tiers payants, stocks pharmaceutiques et confidentialité à adapter aux règles locales.",
  [["101","Capital ou fonds propres","equity"],["164","Emprunts","liability"],["205","Logiciels médicaux","asset"],["213","Bâtiments et aménagements","asset"],["215","Équipements médicaux","asset"],["2815","Amortissements des équipements","asset"],["31","Stocks de médicaments","asset"],["32","Consommables médicaux","asset"],["397","Dépréciations des stocks","asset"],["401","Fournisseurs","liability"],["408","Factures non parvenues","liability"],["411","Patients et organismes payeurs","asset"],["416","Créances douteuses","asset"],["421","Personnel","liability"],["431","Organismes sociaux","liability"],["441","Subventions à recevoir","asset"],["512","Banques","asset"],["530","Caisse","asset"],["601","Achats de médicaments","expense"],["602","Consommables médicaux","expense"],["604","Analyses sous-traitées","expense"],["615","Maintenance des équipements","expense"],["661","Salaires et rémunérations","expense"],["681","Dotations aux amortissements","expense"],["706","Consultations et soins","income"],["707","Actes médicaux et techniques","income"],["741","Subventions d'exploitation","income"],["425","Avances au personnel","asset"],["437","Autres organismes sociaux","liability"],["4457","Taxes collectées — suivi","liability"]]);

const TRANSPORT = makePlan("template-transport", "Modèle sectoriel — Transport / Logistique",
  "Trame indicative pour transporteurs, livraison et entreposage ; flotte, carburant, péages, sous-traitance et coûts par trajet à adapter au cadre local.",
  [["101","Capital","equity"],["164","Financement de véhicules","liability"],["215","Véhicules et matériel de transport","asset"],["218","Matériel de manutention","asset"],["2815","Amortissements de la flotte","asset"],["31","Pièces détachées","asset"],["32","Stocks de carburant","asset"],["397","Dépréciations des stocks","asset"],["401","Fournisseurs","liability"],["408","Factures non parvenues","liability"],["411","Clients","asset"],["416","Clients douteux","asset"],["421","Personnel","liability"],["431","Organismes sociaux","liability"],["512","Banques","asset"],["530","Caisse","asset"],["601","Achats de carburant","expense"],["602","Pièces et consommables","expense"],["604","Transport sous-traité","expense"],["615","Entretien et réparations de la flotte","expense"],["616","Assurances véhicules et marchandises","expense"],["624","Péages et stationnement","expense"],["661","Salaires des conducteurs et logisticiens","expense"],["681","Dotations aux amortissements","expense"],["706","Prestations de transport","income"],["707","Livraison et distribution","income"],["708","Entreposage et services logistiques","income"],["425","Avances au personnel","asset"],["437","Autres organismes sociaux","liability"],["4457","Taxes collectées — suivi","liability"]]);

export const SECTORAL_TEMPLATES = [COMMERCE, SERVICES, AGRICULTURE, ASSOCIATION, INDUSTRY, CONSTRUCTION, HOSPITALITY, HEALTHCARE, TRANSPORT];
