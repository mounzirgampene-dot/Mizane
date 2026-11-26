// MIZANE — Référentiels comptables nationaux : métadonnées vérifiées.
// Ces entrées décrivent les normes de reporting ; elles ne prétendent pas être
// des plans de comptes normalisés. Aucun compte n'est généré sans nomenclature officielle.
export const ACCOUNTING_FRAMEWORKS = {
  "uk-gaap": {
    id: "uk-gaap",
    name: "UK GAAP — FRS 102 / FRS 101 / FRS 105",
    jurisdictions: ["GB"],
    authority: "Financial Reporting Council (FRC)",
    status: "framework-verified",
    standard: "FRS 102 (standard général), FRS 101 (cadre à informations réduites) et FRS 105 (micro-entités), selon l'éligibilité.",
    effectiveFrom: "2026-01-01",
    sourceUrl: "https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/uk-accounting-standards/frs-102/",
    sourceLabel: "FRC — UK Accounting Standards",
    note: "Les amendements de la revue périodique 2024 de FRS 102 s'appliquent principalement aux exercices ouverts à compter du 1er janvier 2026. FRS 102 n'est pas un plan de comptes."
  },
  "ind-as": {
    id: "ind-as",
    name: "Ind AS — Indian Accounting Standards",
    jurisdictions: ["IN"],
    authority: "Ministry of Corporate Affairs (MCA), sur recommandation de l'ICAI et après examen par la NFRA",
    status: "framework-verified",
    standard: "Normes Ind AS notifiées sous le Companies Act 2013 ; des normes comptables distinctes (AS) existent pour certaines entités non soumises à Ind AS.",
    effectiveFrom: "2026-08-12",
    sourceUrl: "https://www.mca.gov.in/bin/dms/getdocument?mds=or7qLBnXTOzP8cLwIQLfzw%253D%253D&type=open",
    sourceLabel: "MCA — Companies (Indian Accounting Standards) Amendment Rules, 2026",
    note: "Ind AS est une convergence modifiée des IFRS, avec carve-outs et carve-ins. Le choix du référentiel dépend du champ d'application légal de l'entité. Aucun plan de comptes universel n'est généré."
  },
  "brazil-nbc": {
    id: "brazil-nbc",
    name: "Normas Brasileiras de Contabilidade (NBC) / Pronunciamentos CPC",
    jurisdictions: ["BR"],
    authority: "Conselho Federal de Contabilidade (CFC), Comitê de Pronunciamentos Contábeis (CPC) et régulateurs compétents",
    status: "framework-verified",
    standard: "Les prononcements CPC servent de base ; leur force normative résulte de leur adoption par l'autorité réglementaire compétente, notamment le CFC ou la CVM selon le champ.",
    effectiveFrom: null,
    sourceUrl: "https://cfc.org.br/tecnica/normas-brasileiras-de-contabilidade/normas-completas/",
    sourceLabel: "CFC — Normas Brasileiras de Contabilidade",
    note: "Les NBC/CPC constituent un corpus de normes de présentation et de comptabilisation, pas un plan de comptes unique applicable à toutes les entités."
  },
  "canada-as": {
    id: "canada-as",
    name: "Canadian Accounting Standards — IFRS / ASPE / ASNPO / PSAS",
    jurisdictions: ["CA"],
    authority: "Accounting Standards Board (AcSB) et Public Sector Accounting Board (PSAB)",
    status: "framework-verified",
    standard: "Part I IFRS ; Part II ASPE ; Part III ASNPO ; normes du secteur public PSAS. Le référentiel dépend de la nature et du statut de l'entité.",
    effectiveFrom: null,
    sourceUrl: "https://www.cpawsb.ca/learner-support/cpa-canada-handbook-resources/",
    sourceLabel: "CPA Canada — Handbook frameworks",
    note: "Le Canada dispose de plusieurs cadres de reporting ; il n'existe pas de plan de comptes national unique déduit de ces normes."
  },
  "aasb": {
    id: "aasb",
    name: "Australian Accounting Standards — AASB",
    jurisdictions: ["AU"],
    authority: "Australian Accounting Standards Board (AASB)",
    status: "framework-verified",
    standard: "Normes AASB avec application par niveaux (tiers) et dispositions spécifiques selon le type d'entité.",
    effectiveFrom: "2026-01-01",
    sourceUrl: "https://standards.aasb.gov.au/accounting-standards",
    sourceLabel: "AASB — Accounting Standards portal",
    note: "Le portail officiel présente les versions applicables par période. AASB définit les règles de reporting et ne constitue pas un plan de comptes universel."
  }
};

export function getAccountingFramework(id) {
  return ACCOUNTING_FRAMEWORKS[id] || null;
}

export function getCountryAccountingFramework(countryCode) {
  return Object.values(ACCOUNTING_FRAMEWORKS).find((framework) => framework.jurisdictions.includes(countryCode)) || null;
}
