# Lot 46 — Ajout des profils fiscaux Botswana, Mozambique et Malawi
Date : 25 novembre 2026
Branche cible : feat/stock-integrated-dev

## 1. Synthèse

| Pays | Devise | TVA documentée | IS documenté | Statut |
|---|---|---:|---:|---|
| Botswana | BWP | 14 % selon le budget 2025/26 ; page BURS dédiée affiche 12 % | 22 % résidentes ; 30 % non-résidentes | research_required |
| Mozambique | MZN | 16 % standard ; 5 % réduit ; 0 % opérations éligibles | 32 % | research_required |
| Malawi | MWK | 17,5 % depuis le 31 décembre 2025 | 30 % jusqu'à 5 milliards MWK ; 40 % au-delà | research_required |

Les trois juridictions sont ajoutées au référentiel fiscal et au sélecteur pays. Aucun calculateur n'est activé ; les taux restent documentaires, avec calculationModules: [], rules: [] et vatRates: [].

## 2. Botswana (BW)

Le budget officiel du Botswana 2025/26 présente un taux VAT de 14 % et un seuil d'immatriculation de P1 million. La page BURS des sociétés confirme un taux de 22 % pour les sociétés résidentes, 30 % pour les non-résidentes, et des taux de 15 % pour certaines sociétés de fabrication approuvées et les sociétés IFSC éligibles.

Une divergence documentaire subsiste : la page BURS dédiée à la TVA affiche toujours 12 % et un seuil de P500 000. Le portail BURS des taux fiscaux publie des documents actualisés jusqu'en septembre 2026, mais la documentation ouverte ne permet pas de confirmer l'alignement complet de la page TVA avec les textes récents. Le profil consigne donc le taux de 14 % du budget 2025/26 en indiquant clairement la divergence BURS, sans activer de calculateur ni seuil de contrôle.

Sources :
- BURS — Tax Rates : https://www.burs.org.bw/index.php/my-services/tax-rates
- BURS — Companies : https://burs.org.bw/index.php/tax/income-tax/companies
- BURS — Value Added Tax (page actuellement en divergence) : https://www.burs.org.bw/index.php/tax/value-added-tax
- Government of Botswana — 2025/26 Budget Speech : https://www.gov.bw/sites/default/files/2025-03/key%20features%20of%20the%202025-2026%20Budget%20Speech%20FINAL.pdf

## 3. Mozambique (MZ)

Le portail de l'Autoridade Tributária de Moçambique répertorie la Lei n.º 22/2022 relative à l'IVA, avec une mise à jour de son catalogue législatif en septembre 2026. Les informations institutionnelles régionales indiquent un taux standard de 16 %, un taux réduit de 5 % pour certaines opérations désignées et un taux zéro pour des opérations limitativement énumérées, notamment certaines exportations et opérations de transport international.

L'impôt sur les bénéfices des personnes collectives (IRPC) est documenté à 32 % pour les entités résidentes et les établissements stables. Les non-résidents sans établissement stable sont généralement imposés par retenue finale à la source, avec des taux distincts selon la nature du revenu. Les régimes miniers, pétroliers, les zones économiques spéciales, les retenues et les règles d'importation doivent être consolidés avant activation.

Sources :
- Autoridade Tributária — legislação fiscal, Lei 22 IVA 2022 : https://www.at.gov.mz/legislacao/aduaneira
- SADC Investment Portal — Mozambique, VAT and CIT : https://invest.sadc.int/how-invest/mozambique
- PwC — Mozambique corporate income tax, 11 August 2026 : https://taxsummaries.pwc.com/mozambique/corporate/taxes-on-corporate-income
- Autoridade Tributária — portal : https://www.at.gov.mz/

## 4. Malawi (MW)

La Malawi Revenue Authority (MRA) a publié une notice officielle sur les nouvelles mesures fiscales prenant effet le 31 décembre 2025, à la suite des Taxation (Amendment) and Value Added Tax (Amendment) (No.2) Acts 2025.

Les principaux éléments documentés sont :
1. TVA standard portée de 16,5 % à 17,5 %.
2. Impôt sur les sociétés de 30 % sur le revenu imposable annuel jusqu'à 5 milliards MWK et 40 % au-delà.
3. Minimum Alternative Tax de 0,5 % du chiffre d'affaires pour certaines entreprises dépassant 5 milliards MWK et ayant au moins trois ans d'activité, avec paiement du montant le plus élevé entre CIT et MAT et mécanisme de crédit.
4. Nouvelles tranches PAYE mensuelles : 0 % jusqu'à 170 000 MWK ; 30 % de 170 001 à 1 570 000 ; 35 % de 1 570 001 à 10 000 000 ; 40 % au-delà.

Le barème PAYE, la MAT et le CIT progressif sont des faits documentaires uniquement ; aucun calculateur de paie ou d'impôt sur les sociétés n'est activé.

Sources :
- MRA — Public Notice: New Tax Measures, effect 31 December 2025 : https://www.mra.mw/admin/storage/download_files/1767952247_NEW%20TAX%20MEASURES...pdf
- Parliament of Malawi — VAT Amendment (No. 2) Act 2025, Act No. 37 : https://elibrary.rat.gov.mw/items/8f8e90c1-9ce8-4d21-ae77-04eea5b28643/full
- Ministry of Finance — Mid-year Budget Statement 2025 : https://finance.gov.mw/documents/uploads/2025-11/Mid%20year%20Budget%20Statement%2020.11.2025%2010.49pm.pdf
- MRA — official portal : https://www.mra.mw/

## 5. Modifications techniques

1. js/tax-core.js : profils BW, MZ et MW avec faits documentaires, autorités et références.
2. js/countries.js : profils pays et symboles BWP, MZN et MWK.
3. tests/tax-jurisdictions.test.js : tests des statuts, devises, sources, taux documentaires, absence de règles actives et rejet des calculs.
4. sw.js et tests/run.mjs : cache PWA porté de mizane-v78 à mizane-v79.

## 6. Conditions avant activation

- Botswana : rapprocher la page BURS TVA affichant 12 % avec le budget 2025/26 et les textes 2026 ; confirmer les taux et seuils après la refonte fiscale annoncée.
- Mozambique : obtenir les textes intégraux consolidés de l'IVA et de l'IRPC, les listes des taux réduits/exonérés, les retenues, les règles numériques et les régimes d'incitation.
- Malawi : consolider les Acts 2025, les barèmes complets, la MAT, les crédits et les obligations de déclaration avant tout calcul.

Conclusion : trois nouvelles juridictions sont désormais répertoriées dans MIZANE avec leurs devises et leurs données fiscales essentielles. Les calculateurs restent désactivés jusqu'à la vérification complète des textes et des divergences documentaires.
