# Lot 50 — Afrique australe, Afrique du Nord et golfe de Guinée (novembre 2026)

## Périmètre

Juridictions ajoutées au référentiel MIZANE DEV : Afrique du Sud (ZA), Soudan (SD), Soudan du Sud (SS), São Tomé-et-Príncipe (ST) et Algérie (DZ).

Les cinq pays sont disponibles dans le sélecteur et disposent d'un profil fiscal documentaire. **Aucun calculateur fiscal n'est activé** : chaque profil reste `research_required`, avec `calculationModules: []` et `rules: []`. Les taux affichés sont des informations de recherche, pas des règles exécutables.

## Synthèse des recherches

### Afrique du Sud (ZA)

SARS confirme la TVA standard de 15 % et précise que l'augmentation annoncée à 15,5 %, puis 16 %, a été retirée. Le taux général d'impôt sur les sociétés est de 27 % pour les années d'imposition se terminant entre le 1er avril 2026 et le 31 mars 2027. Le barème personnel 2026/27 est progressif de 18 % à 45 %. Les régimes spéciaux (SBC, zones économiques, secteurs miniers, etc.) nécessitent des conditions propres : aucune règle n'est activée.

Sources : SARS VAT ; SARS Companies, Trusts and SBC ; National Treasury/SARS Tax Guide 2026/27.

### Soudan (SD)

La Taxation Chamber publie les textes sur la TVA et l'impôt sur le revenu. Le texte de TVA accessible présente un taux de 15 %, avec mention d'une décision du Conseil des ministres du 7 mai 2015 qui l'aurait porté à 17 %. L'absence d'une consolidation officielle datée de 2026 interdit de certifier le taux actuel. Les taux de l'impôt sur les sociétés et les catégories applicables restent à reconstruire à partir des lois et amendements. Aucun taux n'est donc présumé.

Sources : Sudan Taxation Chamber — Tax Laws, VAT et Income Tax ; texte de la loi TVA publié par l'administration.

### Soudan du Sud (SS)

Le ministère des Finances met à disposition le Finance Bill 2026/2027. Ce document présente des propositions, dont un barème de salaires de 0 % à 20 %, mais précise que l'entrée en vigueur dépend de la signature présidentielle ; certaines modifications attendent les observations de la SSRA. Ces dispositions sont donc traitées comme un projet, jamais comme du droit en vigueur. Les taux de taxes indirectes doivent également être confrontés au texte promulgué et aux instructions de la SSRA.

Source : Ministry of Finance and Planning — Finance Bill 2026/2027.

### São Tomé-et-Príncipe (ST)

La Direction des Impostos publie les codes de facturation de TVA avec un taux normal de 15 % et un taux réduit de 7,5 %, ainsi que des régimes spéciaux. Les textes de base comprennent la Lei n.º 13/2019, la Lei n.º 02/2023 et le Decreto-Lei n.º 12/2023. Les codes de facturation affichant certains régimes spéciaux à 0 % ne suffisent pas à établir une règle générale : il faut vérifier leur assiette, leur portée et les conditions du CIVA consolidé. Le taux d'IRC 2026 n'est pas validé dans cette passe.

Sources : Direcção dos Impostos — codes IVA ; législation IVA ; législation IRC ; manuel IVA du ministère.

### Algérie (DZ)

La DGI confirme le taux normal de TVA de 19 % et le taux réduit de 9 %. L'article 53 de la loi de finances 2026 modifie le champ du taux réduit. La DGI publie les taux d'IBS de 19 % pour la production, 23 % pour le BTP, l'hydraulique et le tourisme, et 26 % pour les autres activités ; un taux réduit de 10 % peut concerner certains bénéfices réinvestis sous conditions. L'affectation sectorielle et les conditions d'éligibilité nécessitent une consolidation article par article avant toute activation.

Sources : DGI — TVA ; DGI — IBS ; loi n° 25-17 du 14 décembre 2025 portant loi de finances 2026 ; AAPI — système fiscal.

## Contrôles et décisions

1. Les cinq codes pays sont présents dans `js/countries.js` et utilisent leurs devises respectives.
2. Les cinq profils sont présents dans `js/tax-core.js`.
3. Tous les profils ont le statut `research_required`.
4. Tous les profils conservent `calculationModules: []` et `rules: []`.
5. Le sélecteur expose `vatRates: []` pour éviter de suggérer un taux fiscal par défaut.
6. Les tests vérifient les données documentaires, le blocage des calculs et l'absence de règles actives.
7. Le cache applicatif passe de `mizane-v82` à `mizane-v83`.

Aucune migration Supabase, aucune modification de production et aucune modification de la branche `main` ne sont incluses dans ce lot.
