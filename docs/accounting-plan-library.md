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
