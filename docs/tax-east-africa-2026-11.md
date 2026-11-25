# Lot 44 — Ajout des profils fiscaux du Kenya, du Rwanda et de l’Ouganda
**Date : 25 novembre 2026**  
**Branche cible :** `feat/stock-integrated-dev`  
**Pays ajoutés au référentiel fiscal :** Kenya (`KE`), Rwanda (`RW`) et Ouganda (`UG`)

## 1. Résultat

Trois nouvelles juridictions d’Afrique de l’Est sont ajoutées au référentiel fiscal de MIZANE et à la liste des profils pays comptables. Les codes pays et devises existaient déjà dans le référentiel mondial, mais ne disposaient pas de profils fiscaux dédiés.

| Pays | Code | Devise | TVA standard documentée | IS général documenté | Statut MIZANE |
|---|---|---|---:|---:|---|
| Kenya | KE | KES | 16 % | 30 % résident ; 37,5 % non-résident | `research_required` |
| Rwanda | RW | RWF | 18 % | 28 % | `research_required` |
| Ouganda | UG | UGX | 18 % | 30 % | `research_required` |

**Aucun calculateur n’est activé dans ce lot.** Les taux sont enregistrés comme faits documentaires et non comme règles de calcul. Les profils gardent `calculationModules: []` et `rules: []`. Les profils du sélecteur pays utilisent `vatRates: []` afin de ne pas préremplir une taxe non activée.

## 2. Kenya (KE)

### TVA
La Kenya Revenue Authority (KRA) confirme :
- taux général de 16 % pour les fournitures taxables ;
- taux zéro pour les opérations expressément listées dans la deuxième annexe du VAT Act ;
- seuil d’immatriculation obligatoire de 5 millions KES de fournitures taxables sur une période de douze mois ;
- dépôt et paiement de la déclaration VAT au plus tard le 20 du mois suivant.

Le taux de 8 % applicable historiquement à certains produits pétroliers a été supprimé par le Finance Act 2023. La page KRA actuelle confirme que les taux de TVA à retenir sont 16 % et 0 %. Les fournitures exonérées restent distinctes des opérations à taux zéro.

### Impôt sur les sociétés
La KRA indique 30 % pour les sociétés résidentes et 37,5 % pour les sociétés non-résidentes. Les incitations, entreprises de zones franches, sociétés nouvellement cotées et régimes particuliers ne sont pas modélisés.

### Sources officielles
- KRA — Value Added Tax : https://www.kra.go.ke/individual/filing-paying/types-of-taxes/value-added-tax
- KRA — Corporation Tax et échéances : https://www.kra.go.ke/business/companies-partnerships/companies-partnerships-pin-taxes/companies-partnerships-file-pay
- KRA — Incentives & Exemptions : https://www.kra.go.ke/?Itemid=203&id=20&option=com_content&task=view
- VAT Act, Cap. 476, version révisée mai 2024 : https://ikesra.kra.go.ke/server/api/core/bitstreams/de322346-9e9b-4dec-8afb-ee41b1dc09c0/content

## 3. Rwanda (RW)

### TVA
La Rwanda Revenue Authority (RRA) confirme 18 % sur les opérations taxables ordinaires et 0 % pour les opérations légalement éligibles. La RRA rappelle que les opérations exonérées ne se confondent pas avec les opérations à taux zéro.

L’immatriculation obligatoire est déclenchée lorsque le chiffre d’affaires taxable dépasse 20 millions RWF sur l’exercice précédent ou 5 millions RWF au cours du trimestre précédent. La déclaration est mensuelle, avec possibilité de périodicité trimestrielle pour les contribuables dont le chiffre d’affaires annuel ne dépasse pas 200 millions RWF ; le dépôt et le paiement sont dus dans les quinze jours suivant la période.

### Impôt sur les sociétés
La RRA confirme le taux de droit commun de 28 % sur le bénéfice imposable. Certaines sociétés nouvellement cotées peuvent bénéficier pendant cinq ans d’un taux de 20 % si au moins 40 % du capital est offert au public, ou de 25 % si au moins 30 % est offert au public. Les taux préférentiels accordés aux investisseurs enregistrés et les exonérations sectorielles nécessitent une qualification spécifique.

### Sources officielles
- RRA — VAT brochure 2025 : https://www.rra.gov.rw/fileadmin/user_upload/VAT__EN_2025.pdf
- RRA — Corporate Income Tax rate : https://www.rra.gov.rw/en/details?cHash=7da5b611b8147eab5731a6e44b2da161&tx_news_pi1%5Baction%5D=detail&tx_news_pi1%5Bcontroller%5D=News&tx_news_pi1%5Bnews%5D=2209
- RRA — VAT Registration : https://www.rra.gov.rw/en/domestic-tax-services/value-added-tax/default-title-1
- RRA — Law No. 014/2025 amending Income Tax Law : https://www.rra.gov.rw/en/home?cHash=642bee585effc2e37a08ef25e12f7b12&tx_news_pi1%5Baction%5D=detail&tx_news_pi1%5Bnews%5D=459
- RRA — VAT filing frequency and rates : https://www.rra.gov.rw/en/domestic-tax-services/value-added-tax/penalties-and-interest

## 4. Ouganda (UG)

### TVA
La URA confirme le taux standard de 18 % et l’existence de fournitures à taux zéro et exonérées, selon les annexes de la loi.

Le seuil d’immatriculation a été relevé de 150 à 300 millions UGX par le VAT (Amendment) Act 2026, Act 14 of 2026, avec effet au 1er juillet 2026. La URA a publié une notice le 30 octobre 2026 confirmant le seuil annuel de 300 millions UGX et son équivalent de 75 millions UGX sur trois mois consécutifs. Les contribuables déjà inscrits dont le chiffre d’affaires tombe sous le seuil peuvent demander leur radiation ou conserver volontairement leur immatriculation.

### Impôt sur les sociétés
La URA indique un taux général de 30 % sur le revenu imposable. Les régimes présomptifs, entreprises minières, incitations et dispositions propres aux non-résidents ne sont pas modélisés.

### PAYE — changement 2026
La URA a publié le 7 septembre 2026 les nouvelles tranches mensuelles PAYE applicables aux résidents à compter du 1er juillet 2026. Les taux et montants fixes cumulés sont ajoutés comme fait documentaire uniquement ; aucun barème exécutable ni calculateur de paie n’est activé.

### Sources officielles
- URA — VAT : https://ura.go.ug/en/value-added-tax-vat/
- URA — Revised VAT registration threshold, 30 October 2026 : https://ura.go.ug/en/revised-value-added-tax-registration-threshold/
- URA — Corporation Tax : https://ura.go.ug/en/corporation-tax/
- URA — effective date of Income Tax Amendment Act 2026 : https://ura.go.ug/en/effective-date-of-the-income-tax-amendment-act-2026-and-the-excise-duty-amendment-act-2026/
- URA — PAYE return changes, 7 September 2026 : https://ura.go.ug/en/changes-to-paye-return-form-following-the-income-tax-amendment-act-2026/
- Uganda VAT (Amendment) Act 2026, Act 14 of 2026 : https://ulii.org/sw/akn/ug/act/2026/14/eng%402026-06-05
- URA — Taxation Handbook 8th Edition 2025–26 : https://ura.go.ug/en/download/taxation-handbook-8th-edition-2025-26/

## 5. Modifications MIZANE

1. `js/tax-core.js` : création des profils fiscaux KE, RW et UG, avec sources, taux et seuils documentaires.
2. `js/countries.js` : ajout de profils de pays comptables identifiés et localisés pour Kenya, Rwanda et Ouganda ; aucune TVA par défaut n’est injectée.
3. `tests/tax-jurisdictions.test.js` : tests des devises, statuts, sources, faits fiscaux, sélecteur de pays, absence de règles actives et rejet des calculs.
4. `sw.js` et `tests/run.mjs` : cache PWA porté de `mizane-v76` à `mizane-v77`.

## 6. Conditions préalables à l’activation

- Kenya : consolider le Finance Act 2026 et les amendements récents du Income Tax Act, les taux de retenue, les régimes turnover tax, les seuils spéciaux et les listes exhaustives de taux zéro/exonération.
- Rwanda : rapprocher le texte intégral de la loi TVA amendée en mai 2025, l’Income Tax Law amendée en 2025, les régimes d’investissement, les retenues à la source et les règles d’e-invoicing.
- Ouganda : consolider l’Income Tax Amendment Act 2026, le VAT Amendment Act 2026, les règles de retenue, les obligations EFRIS, les taux zéro/exonérations et les régimes de calcul de l’impôt des petites entreprises.

**Conclusion :** trois nouvelles juridictions sont désormais identifiées dans le référentiel fiscal MIZANE. Les devises et profils pays sont reconnus, les données de référence sont consultables, mais les calculateurs restent verrouillés jusqu’à la consolidation des textes et des règles d’application.
