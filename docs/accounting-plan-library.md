# Bibliothèque des plans comptables MIZANE

## État de cette première livraison

La bibliothèque contient treize choix :

- SYSCOHADA (OHADA)
- Plan comptable général (France)
- Nouveau plan comptable tunisien
- Code général de normalisation comptable (Maroc)
- Modèle sectoriel indicatif — Commerce
- Modèle sectoriel indicatif — Prestations de services
- Modèle sectoriel indicatif — Agriculture
- Modèle sectoriel indicatif — Association / ONG

Les quatre premiers restent les référentiels nationaux ou régionaux déjà intégrés. Les neuf suivants sont des trames de démarrage génériques, non officielles et non rattachées automatiquement à un pays. Elles ne doivent pas être présentées comme conformes à un texte national sans validation préalable.

## Règles de conception

1. Un modèle sectoriel ne remplace jamais le référentiel légal applicable au pays de l'entreprise.
2. Les taux fiscaux et les obligations de déclaration restent gérés séparément du plan comptable.
3. Les comptes ajoutés par l'utilisateur restent des comptes personnalisés et ne modifient pas les fichiers de référence.
4. Les modèles utilisent les types internes MIZANE : asset, liability, equity, expense et income.
5. Les correspondances inter-référentiels, versions historiques et imports structurés feront l'objet d'étapes distinctes avec tests de non-régression.

## Prochaines étapes

- Ajouter une fiche de métadonnées versionnée pour chaque référentiel (autorité, pays, texte source, date d'effet, statut de validation).
- Créer des plans personnalisés persistants par entreprise, sans altérer les plans de référence.
- Construire les tables de correspondance entre plans et les contrôles de compatibilité.
- Valider chaque plan national à partir des textes officiels et des nomenclatures publiées par les autorités compétentes.
- Tester les écritures, balances, grands livres et états financiers pour chaque référentiel avant activation générale.


## Lot 1 — cinq nouveaux cadres comptables nationaux (26 novembre 2026)

La bibliothèque de métadonnées identifie désormais cinq cadres documentés par leurs autorités ou organismes comptables :

| Juridiction | Cadre identifié | Autorité / source |
|---|---|---|
| Royaume-Uni | UK GAAP : FRS 102, FRS 101 et FRS 105 selon l'éligibilité | FRC — https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/uk-accounting-standards/frs-102/ |
| Inde | Ind AS et, selon le champ légal, Accounting Standards (AS) | MCA — https://www.mca.gov.in/bin/dms/getdocument?mds=or7qLBnXTOzP8cLwIQLfzw%253D%253D&type=open |
| Brésil | Normas Brasileiras de Contabilidade (NBC) et prononcements CPC recevant force normative par adoption compétente | CFC — https://cfc.org.br/tecnica/normas-brasileiras-de-contabilidade/normas-completas/ |
| Canada | IFRS, ASPE, ASNPO et PSAS selon la catégorie d'entité | CPA Canada — https://www.cpawsb.ca/learner-support/cpa-canada-handbook-resources/ |
| Australie | Australian Accounting Standards (AASB), application par niveaux et type d'entité | AASB — https://standards.aasb.gov.au/accounting-standards |

Ces entrées sont des **cadres de normes de reporting vérifiés**, et non cinq plans de comptes prétendument officiels. Les autorités citées ne publient pas un plan de comptes universel directement déductible de ces normes. MIZANE affiche donc le cadre applicable et sa source dans les paramètres, mais conserve le plan comptable déjà choisi tant qu'une nomenclature de comptes officielle, complète et exploitable n'a pas été vérifiée. Aucun compte artificiel, taux fiscal ou module de calcul n'est activé par ce lot.

Pour l'Inde, la fiche référence l'amendement MCA publié au Journal officiel le 12 août 2026. Pour le Royaume-Uni, FRS 102 connaît des changements majeurs applicables principalement aux exercices ouverts à compter du 1er janvier 2026. Pour le Canada et le Brésil, plusieurs cadres ou niveaux de normalisation coexistent ; la sélection finale devra être affinée selon la forme et la taille de l'entité.


## Lot 2 — cinq cadres comptables supplémentaires (26 novembre 2026)

| Juridiction | Cadre identifié | Autorité / source |
|---|---|---|
| Japon | Japanese GAAP (J-GAAP), avec autres cadres autorisés pour certaines sociétés cotées | ASBJ — https://www.asb-j.jp/en/accounting_standards.html |
| Chine continentale | Accounting Standards for Business Enterprises (CAS) | Ministère des Finances — https://kjs.mof.gov.cn/zt/kjzzss/qykjzzjs/index.htm |
| Corée du Sud | K-IFRS et K-GAAP selon le statut de l'entité | IFRS Foundation — https://www.ifrs.org/use-around-the-world/use-of-ifrs-standards-by-jurisdiction/view-jurisdiction/south-korea/ |
| Mexique | Normas de Información Financiera (NIF), édition 2026 | CINIF — https://cinif.org.mx/normatividad_NIF2026.php |
| Nouvelle-Zélande | NZ IFRS et normes PBE selon les catégories d'entités | XRB — https://www.xrb.govt.nz/standards/recently-issued/new-accounting-standards/ |

Les entrées de ce lot décrivent les cadres de reporting et leur autorité. Elles ne sont pas ajoutées comme plans de comptes opérationnels tant que la nomenclature complète, sa portée juridique et ses versions applicables n'ont pas été vérifiées.

**Précaution Chine :** le ministère des Finances a publié en septembre 2026 un projet de révision de la liste des comptes et traitements comptables pour consultation. Ce projet est explicitement identifié comme un texte de consultation, et non comme une nomenclature entrée en vigueur. Les changements proposés ne sont donc pas activés dans MIZANE.

**Précaution Japon et Corée :** plusieurs cadres coexistent selon le type d'entité et le statut de cotation. Le choix final devra dépendre de la qualification de l'entreprise, pas seulement du pays sélectionné.


## Lot 3 — cinq cadres d'Asie du Sud-Est et d'Asie (26 novembre 2026)

| Juridiction | Cadre identifié | Autorité / source |
|---|---|---|
| Singapour | SFRS(I), FRS, SFRS for Small Entities et Charities Accounting Standard | ACRA — https://www.acra.gov.sg/regulations/accounting-standards-financial-reporting-surveillance/accounting-standards/ |
| Philippines | PFRS, PAS et cadres PFRS pour PME | FSRSC — https://www.pfsrsc.org/government-organization-our-standards |
| Indonésie | SAK Indonesia, SAK Internasional, SAK EP et SAK EMKM | IAI — https://web.iaiglobal.or.id/Berita-IAI/detail/standar_akuntansi_keuangan_indonesia |
| Thaïlande | TFRS et TFRS for Non-Publicly Accountable Entities | TFAC — https://acpro-std.tfac.or.th/standard/1/Thai-Financial-Reporting-Standards |
| Hong Kong | HKFRS, HKFRS for Private Entities et SME-FRF/SME-FRS | HKICPA — https://www.hkicpa.org.hk/en/Standards-setting/Standards/Members-Handbook-and-Due-Process/Due-Process/Financial-reporting |

Comme pour les lots précédents, il s'agit de cadres de reporting documentés, non de plans de comptes universels. Les cadres simplifiés ne peuvent être sélectionnés qu'après contrôle de l'éligibilité de l'entité. Aucune nomenclature fictive n'est ajoutée.


## Lot 4 — cinq modèles sectoriels indicatifs supplémentaires

MIZANE propose désormais neuf modèles sectoriels indicatifs : commerce, services, agriculture, association/ONG, industrie/fabrication, BTP/construction, hôtellerie/restauration, santé/clinique et transport/logistique.

Les cinq nouveaux modèles ajoutent des comptes de base pour les stocks, immobilisations, tiers, charges et produits propres aux activités visées. Ils ne remplacent pas les normes nationales, les règles de valorisation, les obligations sectorielles ni les plans réglementaires éventuellement imposés aux banques, assureurs, établissements de santé ou sociétés cotées. Ils doivent être adaptés et validés par un professionnel compétent avant toute utilisation réelle.


## Lot 5 — plans comptables personnalisés

Les entreprises peuvent désormais créer un plan personnalisé en copiant un référentiel intégré ou un modèle sectoriel, puis modifier son nom et sa description, ajouter ou retirer des comptes, l'activer, l'exporter au format JSON ou importer un plan précédemment exporté.

Les plans personnalisés sont stockés dans les paramètres de l'entreprise, dans la sauvegarde locale MIZANE et dans le snapshot de synchronisation de l'entreprise. Les plans officiels et les modèles sectoriels d'origine restent inchangés. Un compte déjà utilisé dans une écriture ne peut pas être retiré du plan actif afin de préserver l'intégrité des journaux et des états.

Le format d'échange est versionné (`mizane-custom-plan`, version 1). L'import valide les identifiants, les codes de comptes, les libellés, les types et l'absence de doublons. Les plans personnalisés ne sont pas certifiés comme référentiels réglementaires : leur conformité relève de la validation du professionnel comptable compétent.


## Lot 6 — versions, correspondances et simulation de migration

Le noyau de gestion permet d'enregistrer plusieurs éditions d'un même plan avec leur libellé, dates d'effet, autorité, référence documentaire, URL HTTPS et statut. Les dates ne sont jamais déduites automatiquement : elles doivent être justifiées par une source compétente.

Les correspondances prennent en charge les relations exactes, un-vers-plusieurs, plusieurs-vers-un et les comptes explicitement non rapprochés. Chaque règle porte un statut, une note et une référence justificative. Les comptes sources ne peuvent pas être affectés à plusieurs règles dans une même table ; les types incompatibles sont refusés. Les répartitions un-vers-plusieurs exigent des pourcentages explicites totalisant 100 %.

La simulation n'utilise que les règles approuvées, contrôle l'équilibre débit/crédit, signale les comptes non rapprochés et bloque les écritures incomplètes. Elle ne modifie jamais les écritures d'origine et n'applique aucune migration automatiquement. Aucune correspondance universelle n'est préremplie : chaque rapprochement doit être établi et justifié par un professionnel à partir des nomenclatures réellement utilisées.

Les collections planVersions et planMappings sont conservées dans les paramètres, les sauvegardes locales et les snapshots synchronisés. Elles sont validées à l'import et avant synchronisation. Les référentiels intégrés restent inchangés.
