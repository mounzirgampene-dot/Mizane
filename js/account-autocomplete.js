// MIZANE — Autocomplétion commune du plan comptable.
const STOP_WORDS = new Set([
  "achat", "achats", "vente", "ventes", "paiement", "paiements", "reglement",
  "reglements", "facture", "factures", "operation", "operations", "de", "du",
  "des", "la", "le", "les", "un", "une", "au", "aux", "pour", "par", "avec",
  "sur", "et", "en", "a", "d", "l", "chez", "mon", "ma", "mes"
]);

const ACCOUNT_SYNONYMS = {
  loyer: ["location", "locations", "loyers"],
  loyers: ["location", "locations", "loyer"],
  location: ["loyer", "loyers", "locations"],
  locations: ["loyer", "loyers", "location"],
  salaire: ["salaires", "personnel", "remuneration"],
  salaires: ["salaire", "personnel", "remuneration"],
  telephone: ["telecommunication", "telecommunications", "telephone"],
  electricite: ["energie", "eau", "electricite"],
  eau: ["energie", "eau", "electricite"],
  carburant: ["carburants", "combustible", "transport"],
  fournitures: ["fourniture", "bureau", "administratives"],
  fournisseur: ["fournisseurs"],
  client: ["clients"],
  banque: ["banques", " bancaire"],
  assurance: ["assurances"],
  transport: ["transports", "deplacement", "deplacements"]
};

function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("fr")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value) {
  return normalize(value).split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function singular(word) {
  return word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
}

function descriptionScore(query, account) {
  const queryWords = words(query).map(singular);
  if (!queryWords.length) return 0;
  const labelWords = words(account.label).map(singular);
  const expanded = new Set(labelWords);
  for (const word of labelWords) {
    for (const synonym of ACCOUNT_SYNONYMS[word] || []) {
      for (const token of words(synonym)) expanded.add(singular(token));
    }
  }
  let score = 0;
  for (const word of queryWords) {
    if (expanded.has(word)) score += 3;
    else if ([...expanded].some((candidate) => candidate.startsWith(word) || word.startsWith(candidate))) score += 1;
  }
  return score;
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
      matches = accounts
        .map((account) => ({ account, score: descriptionScore(query, account) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || String(a.account.code).localeCompare(String(b.account.code), "fr"))
        .slice(0, 10).map((item) => item.account);
    } else {
      const normalizedQuery = normalize(query);
      matches = accounts.filter((account) =>
        normalize(account.code).startsWith(normalizedQuery) ||
        normalize(account.label).includes(normalizedQuery)
      ).slice(0, 10);
    }
    menu.replaceChildren();
    if (!matches.length) return close();
    matches.forEach((account, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "account-suggestion";
      option.setAttribute("role", "option");
      const code = document.createElement("strong");
      code.textContent = account.code;
      const label = document.createElement("span");
      label.textContent = account.label;
      option.append(code, label);
      option.addEventListener("mousedown", (event) => { event.preventDefault(); choose(account); });
      menu.append(option);
      if (index === active) option.classList.add("active");
    });
    menu.classList.remove("hidden");
  };

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("keydown", (event) => {
    if (menu.classList.contains("hidden")) return;
    if (event.key === "ArrowDown") { event.preventDefault(); active = Math.min(active + 1, matches.length - 1); renderActive(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); active = Math.max(active - 1, 0); renderActive(); }
    else if (event.key === "Enter" && active >= 0 && matches[active]) { event.preventDefault(); choose(matches[active]); }
    else if (event.key === "Escape") close();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));

  function renderActive() {
    [...menu.children].forEach((node, index) => {
      node.classList.toggle("active", index === active);
      node.setAttribute("aria-selected", String(index === active));
    });
  }
}
