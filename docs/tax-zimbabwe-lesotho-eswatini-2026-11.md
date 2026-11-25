# Lot 47 — Zimbabwe, Lesotho et Eswatini (25 novembre 2026)

## Périmètre et statut

Les trois juridictions sont ajoutées au référentiel international et au sélecteur de pays, avec leur devise locale et des faits fiscaux documentés. Elles restent toutes en statut `research_required`. Aucun taux n'est transformé en règle de calcul : `calculationModules`, `rules` et les taux du sélecteur restent vides. Les divergences et les limites des publications sont conservées dans les fiches.

## Zimbabwe (ZW) — ZWG

- TVA : ZIMRA confirme le passage du taux normal de 15 % à 15,5 % à compter du 1er janvier 2026. Les catégories à taux zéro, exonérées et spéciales doivent être qualifiées selon le VAT Act.
- Impôt des sociétés : le barème ZIMRA affiche 25 % pour les sociétés et trusts ; l'AIDS Levy de 3 % s'applique à l'impôt calculé. Des taux particuliers existent pour les mines, investisseurs agréés, zones économiques spéciales et fabricants exportateurs.
- PAYE : ZIMRA publie des tables 2026 par devise et périodicité, avec des taux marginaux pouvant atteindre 40 %. Les crédits, déductions et revenus multi-devises rendent insuffisante une simple grille marginale.
- Sources institutionnelles : [ZIMRA — VAT](https://www.zimra.co.zw/domestic-taxes/vat/mechanics-of-vat), [Public Notice 07/2026](https://zimra.co.zw/public-notices?download=4441%3Apublic-notice-07-of-2026-change-of-vat-rate-on-submission-of-return-category-a&start=40), [Tax Rates](https://www.zimra.co.zw/domestic-taxes/corporate/tax-rates), [PAYE tables](https://www.zimra.co.zw/domestic-taxes/tax-tables), [PAYE explained](https://www.zimra.co.zw/domestic-taxes/individual/paye-explained).

## Lesotho (LS) — LSL

- TVA : RSL publie un taux général de 15 %, 10 % pour l'électricité, 15 % pour les télécommunications et 0 % pour les exportations et produits de base. Les listes de qualification et exonérations restent à contrôler dans le VAT Act et ses annexes.
- Impôt des sociétés : 25 % pour les autres sociétés ; 10 % pour certaines activités manufacturières éligibles et l'agriculture commerciale. L'accès au taux réduit dépend de conditions légales.
- PIT/PAYE : les taux marginaux publiés sont 20 % et 30 %. Le communiqué RSL relatif à l'année 2026/27 confirme, dès le 1er avril 2026, un seuil inférieur de M 6 480 par mois et un crédit mensuel non remboursable de M 1 020.
- Sources institutionnelles : [RSL — Tax Rates](https://www.rsl.org.ls/tax-rates), [RSL — VAT](https://www.rsl.org.ls/index.php/value-added-tax-vat), [Corporate Income Tax Guide](https://www.rsl.org.ls/sites/default/files/2024-07/Corporate%20Income%20Tax%20Guide.pdf), [Income Tax Structure 2026/2027](https://www.rsl.org.ls/sites/default/files/2026-04/Income%20Tax%20structure%202026%20-%202027.pdf).

## Eswatini (SZ) — SZL

- TVA : l'ERS publie un taux standard de 15 % et confirme le taux zéro pour les exportations directes éligibles.
- Impôt des sociétés : divergence officielle à résoudre. La page ERS « Rates and Thresholds » indique encore 27,5 %, tandis que l'avis ERS relatif aux déclarations 2026 indique un taux CIT de 25 % et 1,75 % du chiffre d'affaires pour le groupe des contribuables présomptifs. Le profil signale explicitement cette divergence et ne permet aucun calcul automatique.
- PIT/PAYE : la page ERS publie des taux marginaux de 20 %, 25 %, 30 % et 33 %, avec un rebate annuel ordinaire pouvant atteindre E 8 200. Les cas particuliers et crédits doivent être consolidés.
- Sources institutionnelles : [ERS — VAT](https://www.ers.org.sz/VAT/Eswatini), [Rates and Thresholds](https://www.ers.org.sz/IncomeTax/RatesandThres), [Tax Legislations](https://www.ers.org.sz/LegalandPolicy/TaxLegislation), [Notice for Filing Income Tax Returns 2026](https://ers.org.sz/whatsnew-file/1791462650754-1784270658474_Notice_for_Filing_Income_tax_Returns_Public_Notice_Final_Aligned.pdf).

## Contrôles et limites

- Les trois profils ont été ajoutés au moteur documentaire et au sélecteur de pays.
- Les devises enregistrées sont ZWG, LSL et SZL ; les taux du sélecteur restent vides.
- Tests dédiés : profil présent, devise, sources institutionnelles, statut de recherche, absence de règles actives, blocage des calculs et présence dans le sélecteur.
- Cache PWA incrémenté de `mizane-v79` à `mizane-v80`.
- Les calculateurs restent désactivés jusqu'à la consolidation des textes applicables, annexes, seuils, dates d'effet et règles de calcul détaillées.
- Ce lot ne modifie ni `main`, ni les services Supabase, ni le domaine, ni la production.
