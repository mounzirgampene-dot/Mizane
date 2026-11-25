# Lot 29 — Audit de cohérence des référentiels fiscaux
**Date de l'audit : 25 novembre 2026**  
**Périmètre :** branche `feat/stock-integrated-dev`, moteur `js/tax-core.js`, calculateurs régionaux, interface `js/tax.js` et tests de juridictions.  
**Environnement :** DEV uniquement. Aucun accès en écriture à Supabase, aucune migration et aucune modification de Production ou de `main`.

## 1. Résultat exécutif

L'audit recense 18 juridictions dans le moteur : 13 profils documentaires actifs et 5 profils explicitement bloqués en attente de consolidation juridique. « Actif » ne signifie pas que tous les impôts du pays sont calculables : seuls les formulaires réellement implémentés dans l'interface doivent être annoncés comme calculateurs disponibles.

Le lot corrige une incohérence de métadonnées : plusieurs profils déclaraient un module IS ou IR alors que l'interface ne proposait aucun calculateur correspondant. Les modules ont été réalignés sur les fonctionnalités effectivement exposées, sans changer les taux ni les formules fiscales.

## 2. Modifications apportées

| Juridiction | Avant | Après | Motif |
|---|---|---|---|
| Burkina Faso | VAT, IS, IR, WITHHOLDING | VAT, IS, WITHHOLDING | Aucun calculateur IUTS/IR opérationnel dans l'interface |
| Ghana | VAT, IS | VAT | IS documenté, mais pas de calculateur IS |
| Nigeria | VAT, IS | VAT | IS documenté, mais pas de calculateur IS |
| Sierra Leone | VAT, IS | VAT | IS documenté, mais pas de calculateur IS |
| Gambie | VAT, IS | VAT | IS documenté, mais pas de calculateur IS |
| Cap-Vert | IS | Aucun | IRPC documenté, mais aucun calculateur IS/IRPC disponible |

Le Bénin, le Mali, le Sénégal, la Côte d'Ivoire, la France, la Belgique et le Maroc conservent les modules déjà raccordés à leurs formulaires respectifs. Le Togo reste limité à la TVA.

Le test de juridictions ne vérifie plus une expression tautologique : il compare désormais chaque profil à la liste exacte des modules exposés par l'interface.

## 3. Contrôles internes

1. Les 13 profils actifs disposent de règles de TVA/GST seulement lorsqu'un taux est effectivement activé ; les profils Mali et Cap-Vert n'ont pas de règle TVA active.
2. Les profils Liberia, Mauritanie, Niger, Guinée et Guinée-Bissau conservent leurs statuts `review_required` ou `research_required`, sans module de calcul, sans règle active et sans activation implicite.
3. Les règles de TVA restent datées et les taux réduits conditionnels restent soumis à confirmation d'éligibilité.
4. La règle ivoirienne de TVA réduite à 9 % demeure inapplicable avant le 17 janvier 2026.
5. Les calculs IS/IR et les retenues restent des simulations partielles ; aucune déclaration, aucun paiement et aucune écriture fiscale automatique ne sont créés.

## 4. Vérifications documentaires récentes et réserves

### Ghana
La Ghana Revenue Authority confirme le taux VAT de 15 %, auquel s'ajoutent NHIL 2,5 % et GETFund 2,5 % sur la même base. Le moteur ne calcule actuellement que la composante VAT de 15 % : les deux prélèvements doivent rester clairement identifiés comme exclus du total calculé. La GRA confirme aussi le taux général IS de 25 %, tout en publiant des taux sectoriels et géographiques différents. Son avis relatif à l'Income Tax (Amendment) Act 2026 fixe l'entrée en vigueur du nouveau barème PAYE au 1er septembre 2026 ; le barème est documenté mais aucun calculateur de paie n'est activé.
Sources : [GRA — VAT](https://gra.gov.gh/domestic-tax/tax-types/vat/), [GRA — Corporate Income Tax](https://gra.gov.gh/domestic-tax/tax-types/corporate-income-tax/), [GRA — Income Tax Amendment Act 2026](https://gra.gov.gh/news/portfolio/amendments-income-tax-act-2026-act-1178/).

### Maroc
Le CGI 2026 demeure la source primaire du profil. Une vérification secondaire récente confirme les taux IS 2026 de 20 % sous le seuil légal, 35 % au-delà et 40 % pour les établissements financiers et assimilés visés, ainsi que l'existence d'une cotisation minimale. Le calculateur doit continuer à exiger la qualification de la catégorie et de l'assiette ; les taux ne constituent pas un taux unique applicable à toute société.
Sources : [DGI — CGI 2026](https://www.finances.gov.ma/Publication/dgi/2025/cgi-2026-fr.pdf), [PwC — Morocco Corporate Tax, révision du 30 avril 2026](https://taxsummaries.pwc.com/morocco/corporate/taxes-on-corporate-income).

### Sierra Leone
La Finance Act 2026 prévoit le retour du taux de corporation tax à 30 % depuis 25 % et rétablit une minimum alternate tax. Le profil mentionne le taux de 30 %, mais le minimum alternatif et plusieurs retenues doivent faire l'objet d'un traitement juridique distinct avant tout calculateur IS.
Source officielle : [Ministry of Finance — Fiscal Strategy Statement 2027–2029, tableau 14](https://mof.gov.sl/wp-content/uploads/2026/11/Fiscal-Strategy-Statement-FSS-2027.pdf).

## 5. Points à traiter dans un lot ultérieur — aucune activation automatique

| Priorité | Pays / sujet | Constat | Décision conservatoire |
|---|---|---|---|
| Haute | Togo — TVA | La référence du taux normal renvoie à une brochure OTR de 2020, tandis que le seuil a été actualisé en 2025. | Conserver le calcul TVA isolé, mais obtenir le CGI consolidé et la loi de finances applicable avant validation réglementaire. |
| Haute | Burkina Faso — IUTS | Barème documenté, mais aucun calculateur de paie exposé ; le taux et les réductions doivent être rapprochés du CGI consolidé 2026. | Ne pas annoncer le module IR comme opérationnel. |
| Haute | Ghana — prélèvements NHIL/GETFund | Deux prélèvements de 2,5 % sont dus en plus de la VAT de 15 % sur la même base, mais le calculateur ne les totalise pas. | Afficher l'exclusion et ne pas présenter le montant VAT seul comme charge fiscale indirecte totale. |
| Haute | Sierra Leone — minimum alternate tax | Le changement de taux IS est documenté ; le minimum alternatif restauré n'est pas calculé. | Aucun calculateur IS activé. |
| Moyenne | France et Belgique — IR | Les barèmes sont associés à des années de revenus/exercices différents et leurs mécanismes personnels ne sont pas intégralement modélisés. | Conserver les libellés de période et les avertissements ; revalider chaque barème au prochain exercice. |
| Moyenne | Mali — IS | Le profil est partiel et le minimum de 1 % du chiffre d'affaires en cas de déficit dépend du régime et de la situation exacte. | Conserver l'avertissement et l'absence de TVA active. |
| Moyenne | Cap-Vert — IRPC | Les taux 25 % et 4 % sont documentés, mais les conditions d'éligibilité et le calculateur ne sont pas implémentés. | Profil documentaire uniquement. |
| Moyenne | Liberia, Mauritanie, Niger, Guinée, Guinée-Bissau | Les textes et mises à jour 2026 ne sont pas consolidés de manière suffisante pour une activation fiable. | Statuts bloqués inchangés. |

## 6. Limites et décision

Cet audit est un contrôle de cohérence logicielle et documentaire, pas une opinion fiscale opposable. Les taux peuvent dépendre du secteur, du régime, du chiffre d'affaires, de la résidence, de la nature de l'opération, des conventions et des exonérations. Les sources administratives et les textes consolidés priment sur les résumés secondaires.

**Décision du lot 29 :** correction des métadonnées de modules et renforcement des tests ; aucune modification de taux, aucune activation de pays en attente, aucune modification des calculs fiscaux existants.

## 7. Fichiers concernés

- `js/tax-core.js` — déclaration des modules disponibles.
- `tests/tax-jurisdictions.test.js` — assertions explicites sur les modules réellement exposés.
- `docs/tax-reference-audit-2026-11.md` — présent rapport.
