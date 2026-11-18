// MIZANE — Recherche sémantique commune sur le plan comptable actif.
const STOP_WORDS = new Set([
  "achat","achats","vente","ventes","payer","paiement","paiements","reglement","reglements",
  "facture","factures","operation","operations","de","du","des","la","le","les","un","une",
  "au","aux","pour","par","avec","sur","et","en","a","d","l","chez","mon","ma","mes",
  "notre","nos","son","sa","ses","dans","apres","avant","effectue","effectuer"
]);

// Vocabulaire métier : les mots d'une opération sont rapprochés des intitulés
// réellement présents dans les plans SYSCOHADA, PCG, NCT et CGNC.
const CONCEPTS = {
  fournitures:["fourniture","bureau","papeterie","papier","stylo","cartouche","imprimante","consommable"],
  bureau:["fourniture","fournitures","papeterie","papier","stylo","cartouche"],
  loyer:["location","locations","locatif","locative","loyers","local","locaux","bail"],
  location:["loyer","loyers","locatif","locative","local","locaux","bail"],
  salaire:["salaires","remuneration","remunerations","personnel","paie","bulletin"],
  salaires:["salaire","remuneration","personnel","paie"],
  paie:["salaire","salaires","remuneration","personnel"],
  internet:["telecommunication","telecommunications","telephone","communication","abonnement"],
  wifi:["internet","telecommunication","abonnement"],
  telephone:["telecommunication","telecommunications","mobile","internet"],
  mobile:["telephone","telecommunication","abonnement"],
  electricite:["energie","eau","fourniture","consommable"],
  energie:["electricite","gaz","eau"],
  gaz:["energie","electricite"],
  eau:["energie","electricite","fourniture"],
  carburant:["carburants","essence","gasoil","diesel","transport","vehicule"],
  essence:["carburant","carburants","transport","vehicule"],
  gasoil:["carburant","carburants","transport","vehicule"],
  diesel:["carburant","carburants","transport","vehicule"],
  voiture:["vehicule","transport","materiel"],
  vehicule:["voiture","transport","carburant"],
  reparation:["entretien","maintenance","reparations"],
  reparations:["entretien","maintenance","reparation"],
  entretien:["reparation","reparations","maintenance"],
  assurance:["assurances","prime","primes"],
  assurances:["assurance","prime","primes"],
  banque:["bancaire","banques","frais","interets"],
  bancaire:["banque","banques","frais"],
  commission:["commissions","honoraires","intermediaire"],
  honoraires:["commission","commissions","intermediaires","prestation"],
  publicite:["annonce","communication","publication","marketing"],
  marketing:["publicite","annonce","communication"],
  transport:["transports","deplacement","deplacements","livraison","vehicule"],
  livraison:["transport","transports","expedition"],
  deplacement:["transport","mission","missions","voyage"],
  voyage:["deplacement","mission","transport"],
  hotel:["hebergement","mission","reception"],
  restaurant:["repas","reception","mission"],
  repas:["restaurant","reception","personnel"],
  stock:["stocks","marchandise","marchandises","approvisionnement"],
  marchandises:["marchandise","stock","approvisionnement"],
  matiere:["matieres","approvisionnement","stock"],
  materiel:["equipement","outillage","immobilisation"],
  ordinateur:["informatique","materiel","equipement"],
  informatique:["ordinateur","logiciel","materiel","telecommunication"],
  logiciel:["informatique","licence","brevet"],
  impots:["impot","taxe","taxes","fiscalite"],
  taxes:["taxe","impot","impots"],
  tva:["taxe","etat","fisc"],
  client:["clients","creance","creances"],
  clients:["client","creance","creances"],
  fournisseur:["fournisseurs","dette","dettes"],
  fournisseurs:["fournisseur","dette","dettes"],
  emprunt:["emprunts","pret","prets","credit","credits","interet"],
  credit:["emprunt","emprunts","pret","prets","banque"],
  interet:["interets","emprunt","emprunts","frais financiers"],
  caisse:["especes","liquidite","liquidites"],
  especes:["caisse","liquidite","liquidites"],
  banquecompte:["banque","comptes bancaires"],
  vente:["ventes","chiffre","affaires","marchandises","produits"],
  prestation:["prestations","service","services","honoraires"],
  service:["services","prestation","prestations"],
  subvention:["subventions","aide","aides"],
  amortissement:["amortissements","dotation","dotations"],
  don:["dons","subvention","subventions"],
  formation:["documentation","etude","etudes","personnel"],
  poste:["postal","postaux","telecommunication","affranchissement"],
  timbre:["timbres","enregistrement","fiscal"],
  securite:["sociale","cotisation","cotisations","retraite"],
  retraite:["retraites","sociale","cotisation","cotisations"]
};

function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("fr").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function singular(word) {
  if (word.length > 4 && word.endsWith("s")) return word.slice(0,-1);
  return word;
}
function tokens(value) {
  return normalize(value).split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)).map(singular);
}

export function searchAccountsByDescription(accounts, query, limit = 10) {
  const queryTokens = tokens(query);
  if (!queryTokens.length) return [];
  const expandedQuery = new Set(queryTokens);
  for (const token of queryTokens) {
    for (const related of CONCEPTS[token] || []) {
      for (const word of tokens(related)) expandedQuery.add(word);
    }
  }
  const scored = accounts.map((account) => {
    const labelTokens = tokens(account.label);
    const labelSet = new Set(labelTokens);
    let score = 0;
    for (const token of expandedQuery) {
      if (labelSet.has(token)) score += queryTokens.includes(token) ? 5 : 2;
      else if (labelTokens.some((label) => label.startsWith(token) || token.startsWith(label))) score += 1;
    }
    // Les comptes de détail passent avant les comptes collectifs en cas d'égalité.
    return { account, score: score + Math.min(String(account.code).length, 6) * 0.01 };
  });
  return scored.filter((item) => item.score > 0)
    .sort((a,b) => b.score-a.score || String(a.account.code).localeCompare(String(b.account.code),"fr"))
    .slice(0,limit).map((item) => item.account);
}

export function attachAccountAutocomplete(input, accounts, onSelect, displayField = "code", searchMode = "account") {
  if (!input) return;
  const wrapper = document.createElement("div");
  wrapper.className = "account-autocomplete";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(input);
  const menu = document.createElement("div");
  menu.className = "account-suggestions hidden";
  menu.setAttribute("role", "listbox");
  wrapper.append(menu);
  let matches = [];
  let active = -1;
  const close = () => { menu.classList.add("hidden"); menu.replaceChildren(); active = -1; };
  const choose = (account) => {
    input.value = String(account[displayField] ?? account.code);
    onSelect(account);
    close();
  };
  const render = () => {
    const query = input.value.trim();
    if (!query) return close();
    if (searchMode === "description") {
      matches = searchAccountsByDescription(accounts, query);
    } else {
      const normalizedQuery = normalize(query);
      matches = accounts.filter((account) =>
        normalize(account.code).startsWith(normalizedQuery) ||
        normalize(account.label).includes(normalizedQuery)
      ).slice(0,10);
    }
    menu.replaceChildren();
    if (!matches.length) return close();
    matches.forEach((account,index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "account-suggestion";
      option.setAttribute("role","option");
      const code = document.createElement("strong");
      code.textContent = account.code;
      const label = document.createElement("span");
      label.textContent = account.label;
      option.append(code,label);
      option.addEventListener("mousedown",(event)=>{event.preventDefault();choose(account);});
      menu.append(option);
      if(index===active) option.classList.add("active");
    });
    menu.classList.remove("hidden");
  };
  input.addEventListener("input",render);
  input.addEventListener("focus",render);
  input.addEventListener("keydown",(event)=>{
    if(menu.classList.contains("hidden")) return;
    if(event.key==="ArrowDown"){event.preventDefault();active=Math.min(active+1,matches.length-1);renderActive();}
    else if(event.key==="ArrowUp"){event.preventDefault();active=Math.max(active-1,0);renderActive();}
    else if(event.key==="Enter"&&active>=0&&matches[active]){event.preventDefault();choose(matches[active]);}
    else if(event.key==="Escape") close();
  });
  input.addEventListener("blur",()=>setTimeout(close,120));
  function renderActive(){
    [...menu.children].forEach((node,index)=>{
      node.classList.toggle("active",index===active);
      node.setAttribute("aria-selected",String(index===active));
    });
  }
}
