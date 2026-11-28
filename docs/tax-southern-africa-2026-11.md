# Lot 45 — Ajout des profils fiscaux Namibie, Zambie et Tanzanie
Date : 25 novembre 2026
Branche cible : feat/stock-integrated-dev
Pays ajoutés : Namibie (NA), Zambie (ZM) et Tanzanie continentale (TZ)

## 1. Synthèse

| Pays | Devise | TVA documentée | Impôt sociétés documenté | Statut |
|---|---|---:|---:|---|
| Namibie | NAD | 15 % | 30 % non-mining ; 37,5 % autres mines ; 55 % diamant | research_required |
| Zambie | ZMW | 16 % | 30 % général ; 10 % agriculture éligible | research_required |
| Tanzanie continentale | TZS | 18 % standard ; 0 % export ; 16 % conditionnel | 30 % général | research_required |

Les trois profils sont ajoutés au référentiel fiscal et au sélecteur de pays. Ils restent sans calculateur : calculationModules: [], rules: [] et vatRates: []. Les taux sont des faits documentaires, pas des règles exécutables.

## 2. Namibie (NA)

### TVA
NamRA indique un taux standard de 15 % sur la plupart des fournitures taxables et les importations, avec certaines opérations à taux zéro et des exonérations. L’immatriculation est obligatoire au-delà de 500 000 NAD de chiffre d’affaires taxable annuel ; une immatriculation volontaire peut être envisagée au-dessus de 200 000 NAD sous conditions. Les déclarations sont en principe dues le 25 du mois suivant.

### Impôt sur les sociétés
Le taux non-minier a été ramené à 30 % pour les exercices commençant à compter du 1er janvier 2025. Les taux miniers documentés sont de 37,5 % pour les mines autres que diamantifères et 55 % pour les mines de diamants.

Le budget 2025/26 annonce une réduction supplémentaire à 28 % durant l’exercice 2026/27. Le document de référence professionnel consulté en mai 2026 indiquait toutefois que cette réduction n’était pas encore promulguée à cette date. Aucune source législative promulguée plus récente n’a été vérifiée dans ce lot ; le profil conserve donc 30 % comme dernier taux de base confirmé et signale le projet à 28 % comme non certifié.

### Sources
- NamRA — ITAS Taxes (TVA, seuil, délais) : https://www.itas.namra.org.na/taxes
- NamRA — General Tax Information : https://www.namra.org.na/documents/cms/uploaded/information-brochure--general-tax-information--66d64f0d7f.pdf
- NamRA — Mining Taxation : https://www.itas.namra.org.na/assets/documents/other-forms/Mining%20Taxation%20-%2014%20July%202024.pdf
- Namibia 2025/26 Budget Statement : https://d4f7y6nbupj5z.cloudfront.net/wp-content/uploads/2025/03/Republic-of-Namibia-2025-26-Budget-Statement_250327_145903.pdf
- Value-Added Tax Act 10 of 2000 : https://namiblii.org/en/akn/na/act/2000/10/eng%402024-10-01

## 3. Zambie (ZM)

### TVA
La Zambia Revenue Authority (ZRA) confirme un taux standard de 16 %, un taux zéro pour les opérations éligibles et un régime d’exonération distinct. Les exportations sont généralement éligibles au taux zéro sous réserve des conditions légales et documentaires.

### Impôt sur les sociétés et Turnover Tax
La ZRA indique un taux général de 30 % sur le bénéfice imposable et un taux de 10 % pour certaines activités agricoles éligibles.

Les petites entreprises dont les ventes annuelles ne dépassent pas 5 millions ZMW relèvent en principe du Turnover Tax, calculé sur le chiffre d’affaires brut. Le taux documenté est de 5 % au-dessus de 30 000 ZMW et jusqu’à 5 millions ZMW, avec un montant nul jusqu’à 30 000 ZMW. Des exclusions s’appliquent notamment aux partenariats, activités minières et certaines prestations de services.

### PAYE
La ZRA publie un exemple de barème PAYE 2026 mensuel : 0 % jusqu’à 5 100 ZMW, 20 % de 5 100,01 à 7 100, 30 % de 7 100,01 à 9 200 et 37 % au-delà. Les montants fixes cumulés sont à appliquer selon la table officielle ; aucun barème exécutable n’est créé dans ce lot.

### Sources
- ZRA — Tax Information (VAT, Income Tax, Turnover Tax, PAYE) : https://www.zra.org.zm/tax-information/
- ZRA — Practice Note 2024, taux VAT : https://www.zra.org.zm/download/2024-practice-note/?refresh=678e8673a8d3d1737393779&wpdmdl=8823

## 4. Tanzanie continentale (TZ)

### Périmètre territorial
Le profil couvre uniquement Mainland Tanzania. Zanzibar dispose d’un régime TVA distinct et ne doit pas être fusionné dans les calculs continentaux. MIZANE ne propose donc pas un taux national unique qui masquerait cette distinction.

### TVA
Le VAT Act, Cap. 148, fixe le taux standard à 18 % et le taux zéro pour les opérations éligibles. Le paragraphe 5(6), introduit en 2025, prévoit un taux de 16 % pour certaines fournitures standard-rated à des personnes non immatriculées payant par banque ou moyen électronique approuvé ; cette mesure dépend d’une désignation publique de la Commissioner General et ne doit pas être traitée comme un taux général.

Le Finance Act 2026 modifie les règles de retenue de TVA par les agents désignés : 3 % sur les biens et 6 % sur les services sont retenus sur le taux standard de 18 %. Les fournitures mixtes sont ventilées selon un ratio 3:2. La retenue à la source n’est pas un taux de TVA réduit.

### Impôt sur les sociétés
TISEZA confirme un taux de 30 % sur le revenu net des sociétés résidentes. Les sociétés nouvellement cotées, les assembleurs et certains fabricants peuvent bénéficier de régimes particuliers. Les activités minières, pétrolières et les prestations de services aux secteurs extractifs exigent une analyse séparée.

### Seuil d’immatriculation
Les sources secondaires fiscales consultées indiquent un seuil de 200 millions TZS sur douze mois ou 100 millions TZS sur six mois pour Mainland Tanzania. Les fournisseurs de services professionnels, certaines entités publiques et les fournisseurs non-résidents de services numériques peuvent être soumis à des règles particulières ou à une absence de seuil. Le montant et ses exceptions doivent être rapprochés de la réglementation TRA en vigueur avant tout paramétrage ; ce lot ne l’ajoute pas comme fait fiscal dans le moteur.

### Sources
- Tax Revenue Appeals Board — VAT Act, Cap. 148 : https://www.trab.go.tz/uploads/documents/en-1776866166-THE%20VALUE%20ADDED%20TAX%20ACT.pdf
- TISEZA — Corporate Income Tax 30 % : https://www.tiseza.go.tz/faqs/30-when-are-investors-supposed-to-pay-corporate-tax-what-is-the-percentage
- Finance Act 2026, Act 2 of 2026 : https://africanlii.org/en/akn/tz/act/2026/2/eng%402026-06-30
- Ministry of Finance — Income Tax Act, Cap. 332 : https://mof.go.tz/uploads/documents/en-1676545432-THE%20INCOME%20TAX%20ACT%2C%20CAP%20332%20R.E.%202019.pdf
- Tanzania National Bureau of Statistics — Tax Statistics Report 2024/25 : https://www.nbs.go.tz/uploads/statistics/documents/en-1791955295-Tax%20Statistics%20Report%202024%20-%202025%20Mainland%20Tanzania.pdf

## 5. Modifications techniques

1. js/tax-core.js : profils fiscaux NA, ZM et TZ, faits fiscaux, autorités et références.
2. js/countries.js : profils pays, devises NAD/ZMW/TZS et symboles monétaires.
3. tests/tax-jurisdictions.test.js : vérifie le statut de recherche, les devises, les faits documentaires, l’absence de règles actives et le rejet des calculs.
4. sw.js et tests/run.mjs : cache PWA porté de mizane-v77 à mizane-v78.

## 6. Conditions avant activation

- Namibie : obtenir les textes promulgués relatifs à la baisse éventuelle de 28 %, rapprocher les taux de retenue, le régime des fabricants, les exonérations et les règles de TVA import.
- Zambie : consolider les règles de TVA, les régimes miniers, agricoles, le Turnover Tax, les seuils et les tranches PAYE 2026 avec les textes primaires en vigueur.
- Tanzanie : intégrer séparément Mainland et Zanzibar ; vérifier les avis de désignation relatifs au taux conditionnel de 16 %, les retenues de TVA, les seuils de registration et les changements Finance Act 2026.

Conclusion : trois nouvelles juridictions sont désormais disponibles dans les profils MIZANE, sans calculateur actif. Le moteur reste protégé contre les erreurs liées aux taux particuliers, aux seuils et aux distinctions territoriales.
