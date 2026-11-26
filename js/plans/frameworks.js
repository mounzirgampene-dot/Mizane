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
  ,
  "japan-gaap": {
    id: "japan-gaap",
    name: "Japanese GAAP — J-GAAP / Designated IFRS / JMIS",
    jurisdictions: ["JP"],
    authority: "Accounting Standards Board of Japan (ASBJ) et Financial Services Agency (FSA)",
    status: "framework-verified",
    standard: "J-GAAP constitue le cadre de référence général ; les sociétés cotées peuvent, pour leurs états consolidés, recourir également aux Designated IFRS, JMIS ou US GAAP sous les conditions applicables.",
    effectiveFrom: null,
    sourceUrl: "https://www.asb-j.jp/en/accounting_standards.html",
    sourceLabel: "ASBJ — Accounting Standards",
    note: "Le catalogue ASBJ signale des révisions publiées en 2026, notamment sur les instruments financiers et les impôts courants. Ces normes de reporting ne constituent pas un plan de comptes universel."
  },
  "china-cas": {
    id: "china-cas",
    name: "Accounting Standards for Business Enterprises — China CAS",
    jurisdictions: ["CN"],
    authority: "Ministry of Finance of the People's Republic of China (MOF)",
    status: "framework-verified",
    standard: "Système national de normes comptables pour les entreprises, avec interprétations et dispositions sectorielles publiées par le ministère des Finances.",
    effectiveFrom: null,
    sourceUrl: "https://kjs.mof.gov.cn/zt/kjzzss/qykjzzjs/index.htm",
    sourceLabel: "MOF — Accounting Standards for Business Enterprises",
    note: "Le MOF a publié en septembre 2026 un projet de révision de la liste des comptes et traitements principaux pour consultation. Ce projet n'est pas traité comme une règle en vigueur ; aucun nouveau plan chinois n'est activé sur la base de ce seul projet."
  },
  "korea-gaap": {
    id: "korea-gaap",
    name: "Korean GAAP — K-IFRS / K-GAAP",
    jurisdictions: ["KR"],
    authority: "Korea Accounting Standards Board (KASB) et autorités publiques compétentes",
    status: "framework-verified",
    standard: "K-IFRS s'applique obligatoirement aux sociétés cotées et à certaines entités d'intérêt public ; K-GAAP / Accounting Standards for Non-Public Entities concerne les autres entités selon leur situation.",
    effectiveFrom: null,
    sourceUrl: "https://www.ifrs.org/use-around-the-world/use-of-ifrs-standards-by-jurisdiction/view-jurisdiction/south-korea/",
    sourceLabel: "IFRS Foundation — South Korea jurisdiction profile",
    note: "Le référentiel dépend du statut de l'entité. K-IFRS et K-GAAP sont des cadres normatifs et ne constituent pas un plan de comptes universel."
  },
  "mexico-nif": {
    id: "mexico-nif",
    name: "Normas de Información Financiera — NIF 2026",
    jurisdictions: ["MX"],
    authority: "Consejo Mexicano de Normas de Información Financiera y de Sostenibilidad (CINIF)",
    status: "framework-verified",
    standard: "Édition NIF 2026, comprenant les normes en vigueur au 1er janvier 2026 et les améliorations publiées pour l'exercice.",
    effectiveFrom: "2026-01-01",
    sourceUrl: "https://cinif.org.mx/normatividad_NIF2026.php",
    sourceLabel: "CINIF — Normatividad NIF 2026",
    note: "Le CINIF publie le corpus NIF applicable au reporting financier mexicain. Il s'agit de normes de reconnaissance, évaluation et présentation, pas d'un plan de comptes unique."
  },
  "nz-ifrs": {
    id: "nz-ifrs",
    name: "New Zealand Accounting Standards — NZ IFRS / PBE",
    jurisdictions: ["NZ"],
    authority: "External Reporting Board (XRB) et New Zealand Accounting Standards Board (NZASB)",
    status: "framework-verified",
    standard: "Cadre à plusieurs niveaux distinguant notamment les entités à but lucratif et les Public Benefit Entities (PBE), avec normes et dates d'application selon la catégorie.",
    effectiveFrom: null,
    sourceUrl: "https://www.xrb.govt.nz/standards/recently-issued/new-accounting-standards/",
    sourceLabel: "XRB — Recently issued accounting standards",
    note: "Le XRB publie les normes et leurs dates obligatoires d'application, y compris des normes nouvelles applicables à partir de 2027 et 2029. Le cadre NZ IFRS/PBE ne constitue pas un plan de comptes national universel."
  }
  ,
  "singapore-sfrs": {
    id: "singapore-sfrs",
    name: "Singapore Financial Reporting Standards — SFRS(I) / FRS",
    jurisdictions: ["SG"],
    authority: "Accounting Standards Committee (ASC), sous l'Accounting and Corporate Regulatory Authority (ACRA)",
    status: "framework-verified",
    standard: "SFRS(I)s, FRS, SFRS for Small Entities et Charities Accounting Standard ; l'applicabilité dépend de la catégorie d'entité et de son statut.",
    effectiveFrom: "2026-01-01",
    sourceUrl: "https://www.acra.gov.sg/regulations/accounting-standards-financial-reporting-surveillance/accounting-standards/",
    sourceLabel: "ACRA — Guide to accounting standards",
    note: "ACRA publie les cadres et leurs périodes d'application. Les normes de reporting ne constituent pas une nomenclature de comptes universelle."
  },
  "philippines-pfrs": {
    id: "philippines-pfrs",
    name: "Philippine Financial Reporting Standards — PFRS",
    jurisdictions: ["PH"],
    authority: "Financial and Sustainability Reporting Standards Council (FSRSC)",
    status: "framework-verified",
    standard: "PFRS, Philippine Accounting Standards (PAS) et cadres PFRS pour PME ; les dates d'effet et options varient selon la catégorie d'entité.",
    effectiveFrom: null,
    sourceUrl: "https://www.pfsrsc.org/government-organization-our-standards",
    sourceLabel: "FSRSC — Our Standards",
    note: "Les prononcements et dates d'application sont publiés par le FSRSC. Ces normes de reporting ne constituent pas un plan de comptes universel."
  },
  "indonesia-sak": {
    id: "indonesia-sak",
    name: "Standar Akuntansi Keuangan Indonesia — SAK",
    jurisdictions: ["ID"],
    authority: "Dewan Standar Akuntansi Keuangan (DSAK-IAI), Ikatan Akuntan Indonesia (IAI)",
    status: "framework-verified",
    standard: "SAK Indonesia comprend les PSAK et ISAK ; plusieurs piliers coexistent, notamment SAK Indonesia, SAK Internasional, SAK EP et SAK EMKM selon le statut de l'entité.",
    effectiveFrom: "2025-01-01",
    sourceUrl: "https://web.iaiglobal.or.id/Berita-IAI/detail/standar_akuntansi_keuangan_indonesia",
    sourceLabel: "IAI — Standar Akuntansi Keuangan Indonesia",
    note: "Le cadre est différencié selon l'obligation de reddition publique et la taille de l'entité. SAK décrit les normes de reporting et non un plan de comptes unique."
  },
  "thailand-tfrs": {
    id: "thailand-tfrs",
    name: "Thai Financial Reporting Standards — TFRS",
    jurisdictions: ["TH"],
    authority: "Federation of Accounting Professions (TFAC), sous approbation réglementaire",
    status: "framework-verified",
    standard: "TFRS pour les entités ayant une responsabilité publique ; TFRS for Non-Publicly Accountable Entities pour les autres entités éligibles.",
    effectiveFrom: null,
    sourceUrl: "https://acpro-std.tfac.or.th/standard/1/Thai-Financial-Reporting-Standards",
    sourceLabel: "TFAC — Thai Financial Reporting Standards",
    note: "Les TFRS traduisent et adoptent les normes IFRS avec un décalage national d'application généralement d'un an. Il ne s'agit pas d'un plan de comptes universel."
  },
  "hong-kong-hkfrs": {
    id: "hong-kong-hkfrs",
    name: "Hong Kong Financial Reporting Standards — HKFRS",
    jurisdictions: ["HK"],
    authority: "Hong Kong Institute of Certified Public Accountants (HKICPA), sous la supervision de l'AFRC",
    status: "framework-verified",
    standard: "HKFRS Accounting Standards, HKFRS for Private Entities et SME-FRF/SME-FRS pour les entités éligibles.",
    effectiveFrom: null,
    sourceUrl: "https://www.hkicpa.org.hk/en/Standards-setting/Standards/Members-Handbook-and-Due-Process/Due-Process/Financial-reporting",
    sourceLabel: "HKICPA — Financial Reporting Standards",
    note: "Le choix dépend de l'éligibilité et de la catégorie de l'entité. Les HKFRS sont alignées sur les IFRS, mais ne constituent pas une nomenclature de comptes universelle."
  }
};

export function getAccountingFramework(id) {
  return ACCOUNTING_FRAMEWORKS[id] || null;
}

export function getCountryAccountingFramework(countryCode) {
  return Object.values(ACCOUNTING_FRAMEWORKS).find((framework) => framework.jurisdictions.includes(countryCode)) || null;
}
