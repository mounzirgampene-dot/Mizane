# Bibliothèque des plans comptables MIZANE

## État de cette première livraison

La bibliothèque contient huit choix :

- SYSCOHADA (OHADA)
- Plan comptable général (France)
- Nouveau plan comptable tunisien
- Code général de normalisation comptable (Maroc)
- Modèle sectoriel indicatif — Commerce
- Modèle sectoriel indicatif — Prestations de services
- Modèle sectoriel indicatif — Agriculture
- Modèle sectoriel indicatif — Association / ONG

Les quatre premiers restent les référentiels nationaux ou régionaux déjà intégrés. Les quatre suivants sont des trames de démarrage génériques, non officielles et non rattachées automatiquement à un pays. Elles ne doivent pas être présentées comme conformes à un texte national sans validation préalable.

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
