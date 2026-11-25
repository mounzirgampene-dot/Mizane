# Lot 48 — Angola, Madagascar, Maurice, Seychelles et Comores

Date de recherche : 25 novembre 2026  
Branche de travail : `feat/lot48-angola-madagascar-mauritius-seychelles-comores`  
Cible : `feat/stock-integrated-dev`

## Décision de sécurité fiscale

Les cinq juridictions sont ajoutées au référentiel pays et au moteur de profils, mais **aucun calculateur fiscal n'est activé**. Chaque profil conserve `status: "research_required"`, `calculationModules: []` et `rules: []`. Les listes `vatRates` des cinq entrées du sélecteur sont vides. Les chiffres indiqués ci-dessous sont des éléments documentaires préliminaires et ne constituent pas une autorisation de calcul ou de déclaration.

## 1. Angola — AO

Devise : AOA (kwanza). Autorité : Administração Geral Tributária (AGT).

Les références fiscales consultées indiquent un IVA général de 14 % et un taux général d'Imposto Industrial de 25 %. La Circular n.º 01 GACV/GJ/AGT/2026 de l'AGT commente les mesures fiscales de la Lei n.º 14/25 du 30 décembre 2025 portant OGE 2026. Les régimes simplifiés, les taux sectoriels, les seuils, les règles de Cabinda et les retenues doivent être rapprochés des textes consolidés avant activation.

Sources institutionnelles :
- [AGT — Circular n.º 01/2026](https://www.ucm.minfin.gov.ao/cs/groups/public/documents/document/aw41/mzux/~edisp/minfin5351435.pdf)
- [Portal do Contribuinte](https://portaldocontribuinte.minfin.gov.ao/)
- [AGT](https://agt.minfin.gov.ao/)

## 2. Madagascar — MG

Devise : MGA (ariary). Autorité : Direction générale des Impôts (DGI).

Le Code des impôts mis à jour suivant la LFI 2026 indique une TVA normale de 20 %, un taux de 10 % pour les importations et ventes de gaz butane visées, et 0 % pour les exportations. Le taux de 20 % est documenté pour l'impôt sur les revenus au régime réel. La Loi n° 2026-004 portant loi de finances rectificative 2026 a été promulguée le 16 juillet 2026 ; ses modifications doivent être intégrées au référentiel avant toute activation.

Sources institutionnelles :
- [DGI — Codes et manuels, CDI-LFI 2026 et CPF-LFI 2026](https://www.impots.mg/explorer?path=%2Flegislation%2FCodes+et+Manuels)
- [Loi n° 2025-021 portant loi de finances 2026](https://cnlegis.gov.mg/uploads/L2025-021_VF.pdf)
- [Ministère de l'Économie et des Finances](https://www.mef.gov.mg/)

## 3. Maurice — MU

Devise : MUR (roupie mauricienne). Autorité : Mauritius Revenue Authority (MRA).

La MRA publie une TVA standard de 15 %, un taux général d'impôt sur les sociétés de 15 % et un taux de 3 % pour certaines sociétés engagées dans l'exportation de biens. La Finance Act 2026 figure désormais dans le répertoire officiel des lois du ministère des Finances ; ses changements et dates d'effet doivent être contrôlés en particulier pour l'impôt sur le revenu, les dispositifs d'incitation et les services numériques.

Sources institutionnelles :
- [MRA — Overview of Taxes](https://mra.mu/index.php/taxes-duties/overview-of-taxes)
- [MRA — Corporate Taxation](https://mra.mu/index.php/taxes-duties/corporate-taxation)
- [Ministry of Finance — Acts and Regulations, Finance Act 2026](https://mof.govmu.org/Pages/Acts-and-Regulations.aspx)
- [MRA — Value Added Tax Act](https://www.mra.mu/download/VATAct.pdf)

## 4. Seychelles — SC

Devise : SCR (roupie seychelloise). Autorité : Seychelles Revenue Commission (SRC).

La SRC publie une TVA standard de 15 % et un barème de Business Tax des sociétés de 15 % sur les premiers SCR 1 000 000 puis 25 % au-delà. Les régimes des entreprises individuelles et des sociétés de personnes diffèrent. Les amendements du VAT Act adoptés en 2024 et les règlements modificatifs de 2025 doivent être consolidés, notamment les changements d'annexes et de seuils.

Sources institutionnelles :
- [SRC — Tax System](https://src.gov.sc/seychelles-tax-system/)
- [SRC — FAQ, Business Tax rates](https://src.gov.sc/faq/)
- [SRC — Legislation, Business Tax Act et VAT Act](https://src.gov.sc/legislation/)

## 5. Comores — KM

Devise : KMF (franc comorien). Autorité : Administration Générale des Impôts et des Domaines (AGID).

Le CGI accessible sur le portail du ministère de la Justice indique à l'article 33 un taux d'impôt sur les sociétés de 35 %, avec un taux particulier de 50 % pour certaines entreprises publiques industrielles ou commerciales remplissant les conditions prévues. L'article 35 prévoit un minimum forfaitaire de 1,5 % du chiffre d'affaires. Le document consulté est une édition CGI 2023, complétée par la loi de finances 2025 ; aucune consolidation officielle 2026 n'a pu être confirmée. Le taux de TVA 2026 n'est donc pas renseigné.

Sources institutionnelles :
- [Ministère de la Justice — Code général des impôts 2023](https://justice.gouv.km/texte/code-general-des-impots-2023/)
- [CGI Comores — PDF](https://justice.gouv.km/wp-content/uploads/2025/03/comores-cgi-2023.pdf)
- [Loi de finances 2025 — décret de promulgation](https://justice.gouv.km/wp-content/uploads/2025/03/decret-n-24-186pr-du-19-decembre-2024-promulgation-de-la-loi-n-24-016pr-portant-loi-de-finances-2025-1.pdf)

## Vérifications restantes avant activation

1. Obtenir les textes fiscaux consolidés applicables au 1er janvier 2026 et toutes les lois rectificatives postérieures.
2. Vérifier article par article les taux, assiettes, seuils, exonérations, retenues, régimes sectoriels et dates d'effet.
3. Pour les Comores, obtenir la loi de finances 2026 et les textes d'application ; à défaut, conserver le profil en recherche requise.
4. Faire relire les règles par juridiction avant d'ajouter des objets dans `rules` ou des modules dans `calculationModules`.

## Résultat technique

- Profils ajoutés : AO, MG, MU, SC, KM.
- Devises renseignées dans le référentiel.
- Entrée Comores normalisée : aucun taux de TVA prérempli.
- Tests dédiés : profils, devises, statut bloqué, absence de règles actives, absence de taux par défaut dans le sélecteur.
- Cache PWA : `mizane-v81`.
- Aucun changement de `main`, aucun déploiement de production, aucune action Supabase.
