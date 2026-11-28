# Lot 51 — Afrique du Nord et Moyen-Orient (novembre 2026)

## Périmètre

Profils documentaires ajoutés : Égypte (EG), Libye (LY), Tunisie (TN), Jordanie (JO) et Arabie saoudite (SA). Les devises respectives sont EGP, LYD, TND, JOD et SAR.

Tous les profils restent `research_required`, avec `calculationModules: []` et `rules: []`. Les taux documentés ne sont pas des règles exécutables. Les pays sont disponibles dans le référentiel de sélection, avec `vatRates: []` pour éviter tout taux par défaut non qualifié.

## Synthèse documentaire

### Égypte (EG)

La loi TVA n° 67/2016 et ses règlements fixent un taux standard de 14 % et un taux de 5 % pour certaines machines et équipements éligibles. La loi n° 149/2026 modifie certaines dispositions, notamment le traitement de dispositifs médicaux. Le taux général d'impôt sur les sociétés est de 22,5 %, mais les lois 148 à 155/2026 ont introduit un paquet de modifications fiscales dont la consolidation complète est nécessaire avant automatisation.

Sources : Egyptian Tax Authority — lois TVA et loi 149/2026 ; loi TVA 67/2016 et règlements ; revue CIT 2026.

### Libye (LY)

Les références fiscales disponibles indiquent un taux d'impôt sur les bénéfices de 20 % (loi n° 7/2010) et une taxe du Jihad de 4 % (loi n° 44/1973). Elles indiquent également l'absence de TVA générale, tout en décrivant des frais sur importations, droits de timbre et prélèvements spécifiques. L'absence de consolidation officielle complète en 2026 impose de conserver le profil en recherche requise et de ne pas assimiler l'absence de TVA générale à l'absence de toute taxe indirecte.

Sources : références fiscales Libye — impôt sur les sociétés, autres taxes et contributions ; portail de la Libyan Tax Authority.

### Tunisie (TN)

Le Code de la TVA prévoit les taux de 19 %, 13 % et 7 % selon les opérations. La loi de finances 2026 prévoit des mesures ciblées, notamment pour certains véhicules hybrides et électriques. Le taux général de l'impôt sur les sociétés est de 20 % depuis la réforme 2025 ; des taux de 10 %, 35 % et 40 % subsistent selon les secteurs. La loi de finances 2026 instaure une contribution permanente de 4 % avec un minimum de 10 000 TND pour certains secteurs. Cette contribution est distincte de l'IS.

Sources : DGI et textes fiscaux ; African Tax Legislation Atlas ; revue fiscale 2026.

### Jordanie (JO)

La taxe générale sur les ventes est de 16 % au taux général. L'ISTD publie des catégories spécifiques à 0 %, 2 %, 4 %, 5 % et 10 %, ainsi que des exonérations. La loi sur l'impôt sur le revenu prévoit 20 % pour les personnes morales en général, 24 % pour certains secteurs réglementés et 35 % pour les banques. Le régime est donc modélisé comme `SALES_TAX`, pas comme une TVA uniforme.

Sources : Income and Sales Tax Department — lois, General Sales Tax Law et barèmes ; Income Tax Law No. 34/2014 amendée par Law No. 38/2018.

### Arabie saoudite (SA)

ZATCA confirme une TVA standard de 15 % depuis le 1er juillet 2020, avec des opérations pouvant relever du taux zéro. L'impôt sur le revenu est généralement de 20 % pour les parts imposables détenues par des non-Saoudiens/non-GCC et pour les sociétés de capitaux résidentes dans les conditions légales ; les activités pétrolières et hydrocarbures ont des taux spécifiques. La Zakat des parts saoudiennes et GCC est un régime distinct et ne doit pas être confondue avec l'impôt sur les sociétés.

Sources : ZATCA — About VAT, VAT Law, FAQ taux d'impôt sur le revenu.

## Contrôles

1. Profils fiscaux EG, LY, TN, JO et SA présents.
2. Références documentaires et devises vérifiées.
3. Aucun module de calcul ni règle fiscale activés.
4. Jordanie classée sous `SALES_TAX`, et non TVA générique.
5. Les taux généraux ne sont pas injectés dans `vatRates`.
6. Tests de profil, devises, sélecteur, tax types et blocage des calculs.
7. Cache applicatif mis à jour vers `mizane-v84`.

Aucune migration Supabase, modification de production ou intervention sur `main` n'est incluse.
