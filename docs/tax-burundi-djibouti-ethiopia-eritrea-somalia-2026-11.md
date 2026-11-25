# Lot 49 — Burundi, Djibouti, Éthiopie, Érythrée et Somalie

Date de recherche : 25 novembre 2026  
Branche : `feat/lot49-burundi-djibouti-ethiopia-eritrea-somalia`  
Cible : `feat/stock-integrated-dev`

## Décision de sécurité fiscale

Les cinq juridictions sont ajoutées au référentiel pays et aux profils fiscaux documentaires. **Aucun calculateur fiscal n'est activé** : chaque profil est `research_required`, avec `calculationModules: []`, `rules: []` et `vatRates: []`. Les taux indiqués sont des informations de recherche, et non des règles applicables par le moteur de calcul.

## 1. Burundi — BI

Devise : BIF (franc burundais). Autorité : Office Burundais des Recettes (OBR).

La TVA standard est publiée à 18 %. La loi n°1/10 du 30 juin 2026 fixe le budget 2026/2027 et comporte des changements fiscaux substantiels, notamment sur l'assujettissement, la facturation électronique, la déduction et le remboursement de TVA, les retenues et les régimes forfaitaires. Les synthèses fiscales consultées donnent 30 % comme taux général de référence pour les sociétés, mais les catégories et dispositions modifiées doivent être rapprochées des textes consolidés.

Sources :
- [OBR — Lois et règlements, mesures 2026/2027](https://www.obr.bi/index.php/lois-et-reglements)
- [Loi n°1/10 du 30 juin 2026 — Budget 2026/2027](https://primature.gov.bi/wp-content/uploads/2026/07/budget_burundi_2026_2027.pdf)
- [OBR — Portail d'informations commerciales, TVA](https://infocommerce.obr.bi/menu/16)

## 2. Djibouti — DJ

Devise : DJF (franc djiboutien). Autorité : Direction Générale des Impôts, Ministère du Budget.

Une divergence documentaire importante est relevée sur la TVA : la loi initiale de 2008 publiée par le ministère mentionne 7 %, tandis que des sources plus récentes rapportent une hausse à 10 % par une loi de finances de 2015. Le texte modificatif officiel et la consolidation en vigueur en 2026 doivent être obtenus. Le taux de 25 % d'impôt sur les bénéfices professionnels est une référence rapportée pour l'article 56 du CGI, mais son maintien doit être vérifié à la lumière des lois de finances postérieures. La loi de finances initiale 2026 n°203/AN/25/9ème L est recensée au Journal officiel.

Sources :
- [Journal officiel — Loi de finances initiale 2026 n°203/AN/25/9ème L](https://www.journalofficiel.dj/texte-juridique/loi-de-finances-n203-an-25-9eme-l-portant-budget-initial-de-letat-pour-lexercice-2026/)
- [Ministère des Finances — Loi TVA n°43/AN/08/6ème L](https://www.ministere-finances.dj/EF/CREATION%20DE%20LA%20TVA/SITE%20OFFICIEL%20DE%20LA%20REPUBLIQUE%20DE%20DJIBOUTI_fichiers/loi43an08.htm)
- [Journal officiel — CGI, Loi n°42/AN/08/6ème L](https://www.journalofficiel.dj/arabe/texte-juridique/loi-n42-an-08-6emel-portant-refonte-du-code-generale-des-impots/)

## 3. Éthiopie — ET

Devise : ETB (birr éthiopien). Autorité : Ministry of Revenues / Ministry of Justice.

L'article 8(2) de la Value Added Tax Proclamation n°1341/2024 fixe un taux de 15 % pour les opérations taxables ordinaires et un taux de 0 % pour les opérations zéro-taux. Le règlement d'application n°570/2025 est référencé par le ministère de la Justice comme étant en vigueur depuis janvier 2026. Le régime d'impôt sur le revenu a été modifié par la Proclamation n°1395/2025 ; la fiscalité des entreprises, les barèmes individuels, les catégories de contribuables et les règles de transition doivent être vérifiés sur le texte gazetté complet.

Sources :
- [Ministry of Justice — VAT Regulation n°570/2025](https://justice.gov.et/en/law/570-2025-value-added-tax-regulation/)
- [Ministry of Justice — Income Tax Amendment Proclamation n°1395/2025](https://justice.gov.et/en/law/proclamation-to-amend-federal-income-tax-proclamation-no-1395-2024/)
- [Ministry of Finance — texte PDF de l'amendement de l'impôt sur le revenu](https://www.mofed.gov.et/media/filer_public/7f/72/7f720781-022a-4b90-a9e7-b4724c1f3002/income_tax_amendment_proc_no_1395-2017_compressed.pdf)
- [Ministry of Justice — Tax Administration Amendment Proclamation n°1434/2026](https://justice.gov.et/en/law/tax-administration-proclamation-amendment-proclamation-no-1434-2026/)

## 4. Érythrée — ER

Devise : ERN (nakfa érythréen). Référence institutionnelle : État d'Érythrée.

La documentation fiscale officielle consolidée 2026 n'a pas pu être établie à partir des sources publiques vérifiées. Aucun taux de TVA ou d'impôt sur les bénéfices n'est donc avancé. Les références ajoutées sont des points d'accès institutionnels et des répertoires de recherche législative, et non des textes fiscaux prouvant un taux.

Sources de recherche :
- [Shabait — site officiel du gouvernement de l'État d'Érythrée](https://www.shabait.com/)
- [FAOLEX — répertoire législatif de l'Érythrée](https://faolex.apps.fao.org/countries/ERI)
- [Library of Congress — ressources législatives érythréennes](https://guides.loc.gov/law-eritrea/legislative)

## 5. Somalie — SO

Devise de référence du référentiel : SOS (shilling somalien). Autorité : Somalia Revenue Directorate, Ministry of Finance.

La loi sur l'impôt sur le revenu n°37 du 11 mai 2025 et ses règlements de 2025 ont réformé l'imposition directe. La Revenue Directorate publie pour l'impôt sur les sociétés un régime dépendant de la catégorie et du chiffre d'affaires : montant forfaitaire pour les très petites entreprises, 1,5 % du chiffre d'affaires pour certaines entreprises moyennes et 15 % du bénéfice pour les grandes entreprises ; un taux de 18 % est indiqué pour les sociétés non résidentes. La taxe sur les ventes est distincte d'une TVA générale : la Revenue Directorate publie des taux sectoriels, notamment 5 % pour plusieurs catégories et 10 %, 15 % ou 25 % pour certaines activités. La fragmentation des administrations fiscales et l'évolution des règles exigent une qualification fédérale / régionale avant toute automatisation.

Sources :
- [Somalia Revenue Directorate — Direct Tax](https://revenuedirectorate.gov.so/direct-tax)
- [Somalia Revenue Directorate — Indirect Tax](https://revenuedirectorate.gov.so/indirect-tax)
- [Ministry of Finance — Income Tax Manual 2025](https://www.mof.gov.so/sites/default/files/Publications/Somalia%20Income%20Tax%20Manual_English%20Version.pdf)
- [Ministry of Finance — Income Tax Regulations 2025](https://mof.gov.so/sites/default/files/Publications/Income%20Tax%20Regulation_%200141%2C%202025.pdf)
- [Ministry of Finance — Appropriation Act 2024, dispositions de Sales Tax](https://www.mof.gov.so/sites/default/files/Publications/Appropriation%20Act.%20for%202024%20budget.pdf)

## Contrôles requis avant activation

1. Burundi : intégrer intégralement la loi budgétaire 2026/2027 et vérifier les taux de l'impôt sur les revenus par catégorie.
2. Djibouti : obtenir la loi de finances 2015 et toutes les modifications ultérieures du CGI ; résoudre la divergence 7 % / 10 % sur la TVA.
3. Éthiopie : rapprocher les textes gazettés complets n°1341/2024, n°570/2025 et n°1395/2025, puis vérifier les amendements 2026.
4. Érythrée : obtenir les lois fiscales et barèmes officiels directement auprès des autorités ; aucune donnée chiffrée ne doit être extrapolée.
5. Somalie : consolider les lois 2025, le manuel et les règles fédérales / régionales ; distinguer systématiquement Sales Tax et TVA.

## Résultat technique

- Profils ajoutés : BI, DJ, ET, ER, SO.
- Devises déjà présentes dans le référentiel global ; entrées pays localisées et libellées.
- Taxe somalienne correctement décrite comme `SALES_TAX`, et non comme une TVA générale.
- Taux de TVA non renseignés dans les sélecteurs pour les cinq pays.
- Tests : présence des profils, devises, références, absence de règles actives et blocage du calcul.
- Cache PWA prévu : `mizane-v82`.
- Aucun changement de `main`, aucune action production, aucune action Supabase.
