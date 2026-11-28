# Lot 42 — Actualisation juridique du référentiel fiscal du Liberia
**Date : 25 novembre 2026**  
**Branche cible :** `feat/stock-integrated-dev`  
**Pays :** Liberia (`LR`, devise `LRD`)  
**Périmètre :** référentiel documentaire et garde-fous de non-activation ; aucun calculateur fiscal ajouté.

## 1. Décision exécutive

Le profil Liberia existait déjà dans `js/tax-core.js`, avec le statut `review_required`, aucun module de calcul et aucune règle active. Le présent lot actualise les informations fiscales à partir de l'amendement officiel du Liberia Revenue Code approuvé en 2026 et des documents budgétaires du ministère des Finances de novembre 2026.

**Décision conservatoire maintenue :** Liberia reste `review_required`, `calculationModules: []`, `rules: []`. Aucun taux GST ou VAT n'est ajouté au moteur exécutable. Aucun calculateur TVA/GST, IS, IR, retenue ou paie n'est activé.

## 2. Texte officiel — Liberia Tax Amendment Act of December 2025

Le PDF publié par la Liberia Revenue Authority porte le titre *An Act to Amend the Liberia Revenue Code, to be referred to as Liberia Tax Amendment Act of December 2025*. Il indique une approbation le 24 mars 2026 et une impression par autorité le 1er avril 2026. La Part 3 prévoit une entrée en vigueur immédiatement après publication en handbill.

### 2.1 Goods Tax — fournitures de biens

La section 1000(b)(3) fixe la taxe sur les fournitures taxables de biens à **13 %** de la base taxable et prévoit un taux de **0 %** pour les exportations de biens. Ces taux sont repris comme faits documentaires, sans création de règle exécutable.

### 2.2 Services Tax — prestations de services

La section 1021(a) institue la taxe sur les services fournis au Liberia par un prestataire enregistré. La section 1021(b)(1) fixe le taux général à **13 %** de la base taxable définie à la section 1025.

### 2.3 Télécommunications — contradiction à résoudre

La section 1021(b)(2) prévoit une surtaxe additionnelle de **5 %** sur les services de télécommunications visés à la section 1022(a)(2). L'avis officiel de la LRA du 7 avril 2026 affirme néanmoins que le taux des télécommunications est maintenu à **15 %**, alors qu'il annonce le nouveau taux de 13 % pour les services.

Les documents consultés ne permettent pas d'expliquer de façon certaine l'articulation entre le taux de 13 % et la surtaxe de 5 %, ni de concilier cette rédaction avec le taux de 15 % annoncé par la LRA. MIZANE ne calcule donc aucun taux total de télécommunications et ne crée aucune règle GST pour cette catégorie.

### 2.4 Date d'application

Le texte législatif indique une entrée en vigueur à la publication en handbill. L'avis LRA du 7 avril 2026 annonce que la mise en œuvre par l'administration commence le 1er mai 2026. Ces deux indications sont conservées séparément ; le moteur ne déduit pas une date d'effet technique non contrôlée pour chaque catégorie de taxe.

## 3. Transition vers la TVA au 1er janvier 2027

Le *Draft FY2027 Revenue Forecast* du Ministry of Finance and Development Planning, daté de novembre 2026, indique :
1. que les taux GST en vigueur jusqu'au 31 décembre 2026 sont de 13 % pour les ventes de biens et de services, à l'exception des services GSM/télécommunications à 15 % ;
2. que la VAT au taux standard de 15 % remplace le GST à compter du 1er janvier 2027 ;
3. que la loi VAT a été adoptée par la législature et signée par le Président, avec une entrée en vigueur annoncée au 1er janvier 2027 ;
4. que les exportations sont à taux zéro et que les produits pétroliers et le riz sont annoncés comme exclus de la VAT dans la présentation budgétaire.

Le document est un rapport prévisionnel officiel du MFDP, et non le texte intégral de la loi VAT. Le texte législatif VAT, ses règlements, les seuils d'enregistrement, les catégories exonérées, les modalités de déduction et de remboursement, ainsi que les règles transitoires n'ont pas été contrôlés article par article dans ce lot. La VAT de 15 % est donc enregistrée comme réforme future annoncée, **non applicable au 25 novembre 2026** et non activée dans le moteur.

## 4. Impôt sur les sociétés

La stratégie officielle de mobilisation des ressources 2025–2029 publiée par la LRA indique un taux général de **25 %** pour les entreprises générales. Elle distingue les petites entreprises imposées sur le chiffre d'affaires, les petits commerçants et plusieurs secteurs spécifiques.

Le Liberia Revenue Code amended 2020 prévoit également des mécanismes de minimum tax et d'imposition forfaitaire qui dépendent de la catégorie du contribuable. Les changements et paiements anticipés mentionnés dans le projet budgétaire FY2027 ne sont pas assimilés à une règle générale de calcul IS. Aucun calculateur IS n'est activé.

## 5. Sources et niveau de preuve

| Source | Contenu exploité | Limite |
|---|---|---|
| LRA — Liberia Tax Amendment Act of December 2025 | §§1000, 1021 et date d'effet ; texte publié par la LRA | L'articulation du surtax télécom avec le taux annoncé par la LRA reste contradictoire |
| LRA — Revenue Notice du 7 avril 2026 | 13 % sur certains services et maintien annoncé à 15 % pour les télécommunications ; mise en œuvre à partir du 1er mai 2026 | Avis synthétique, ne détaille pas l'assiette ni la formule de cumul |
| MFDP — Draft FY2027 Revenue Forecast, novembre 2026 | GST 13 % biens/services, 15 % GSM ; VAT 15 % prévue au 1er janvier 2027 | Rapport budgétaire ; le texte intégral de la loi VAT n'a pas été examiné |
| LRA — Domestic Resource Mobilization Strategy 2025–2029 | IS général 25 % et régimes particuliers | Synthèse stratégique ; ne suffit pas à construire un calculateur multi-régimes |
| LRA — Business Tax Kinds | Informations administratives sur les catégories et obligations | Page générique présentant des taux sectoriels antérieurs ; à lire avec les amendements 2026 |

### Liens institutionnels

- [Liberia Tax Amendment Act of December 2025 — PDF LRA](https://revenue.lra.gov.lr/wp-content/uploads/2026/04/LRC-Amendment-December-2025.pdf)
- [LRA — avis officiel sur l'ajustement des taux GST, 7 avril 2026](https://revenue.lra.gov.lr/important-revenue-noticeadjustment-to-goods-and-services-tax-gst-rates/)
- [MFDP — Draft FY2027 Revenue Forecast, novembre 2026](https://mfdp.gov.lr/uploads/documents/2026/11/draft-revenue-forecast-fy2027.pdf)
- [LRA — Liberia Domestic Resource Mobilization Strategy 2025–2029](https://revenue.lra.gov.lr/wp-content/uploads/2025/09/Liberia-DRM-Strategy-2025-2029.pdf)
- [LRA — Business Tax Kinds](https://www.lra.gov.lr/domestic-tax-profile/businesstaxkinds/)
- [LRA — Tax Laws and Amendments](https://revenue.lra.gov.lr/tax-laws-and-amendments/)

## 6. Modifications MIZANE

- Actualisation du profil Liberia dans `js/tax-core.js` : biens 13 % / exportations 0 %, services 13 %, surtaxe télécom documentée avec conflit explicite, réforme VAT 15 % annoncée pour 2027, IS général 25 %.
- Ajout des références officielles LRA et MFDP.
- Maintien de `status: "review_required"`, `calculationModules: []` et `rules: []`.
- Renforcement de `tests/tax-jurisdictions.test.js` : contrôle des faits documentaires, du blocage du profil et du refus de calcul.
- Cache PWA porté de `mizane-v75` à `mizane-v76`, avec mise à jour de l'assertion de test correspondante.
- Aucun changement dans `js/countries.js` : Liberia (`LRD`) est déjà présent dans le sélecteur pays/devises.
- Aucune migration Supabase, aucune opération Supabase, aucune modification de `main` et aucun déploiement Production.

## 7. Conditions préalables à une activation future

1. Obtenir une clarification écrite de la LRA sur le cumul de la surtaxe télécom de 5 % avec le taux de services de 13 % et le taux total annoncé de 15 %.
2. Obtenir le texte intégral de la loi VAT et ses règlements publiés, puis vérifier la date d'entrée en vigueur et les règles de transition.
3. Vérifier les seuils d'enregistrement, les exonérations, les exportations, les crédits de taxe, les remboursements et la TVA à l'importation.
4. Consolider les règles de CIT, minimum tax, presumptive tax, acomptes et retenues avec les amendements 2026.
5. Concevoir des tests de calcul uniquement après constitution d'une matrice juridique article par article.

**Conclusion :** le Liberia est mieux documenté et ses principales modifications GST/VAT 2026–2027 sont désormais tracées dans MIZANE. Le pays reste volontairement non activé tant que la contradiction sur les télécommunications et le texte complet de la VAT 2027 ne sont pas résolus.
