# Lot 30 — Calendrier fiscal et suivi des obligations déclaratives

**Date : 25 novembre 2026**  
**Juridiction opérationnelle : Maroc uniquement**  
**Branche :** `feat/stock-integrated-dev`  
**Portée :** calendrier de préparation, génération de brouillons, pièces justificatives et suivi de statut. Ce lot ne dépose aucune déclaration et n'effectue aucun paiement.

## 1. Fonctionnalités

Le calendrier marocain permet désormais de produire des échéances selon le régime TVA sélectionné. Par sécurité, le régime commence à « à déterminer » : aucune échéance TVA n’est créée tant que l’utilisateur n’a pas confirmé la périodicité.

- Mensuel : une échéance par mois, à la fin du mois suivant la période déclarée pour la télédéclaration.
- Trimestriel : une échéance par trimestre, à la fin du premier mois suivant le trimestre.
- Non assujetti / hors champ : aucune échéance TVA n'est générée.

Le calendrier comprend également les quatre échéances d'acomptes provisionnels IS (chacun égal à 25 % de l'impôt de référence, avant l'expiration des 3e, 6e, 9e et 12e mois de l'exercice ; une cotisation minimale peut relever d'un versement unique), la déclaration annuelle IS à déposer dans les trois mois de la clôture, l'état annuel des traitements et salaires, ainsi que les retenues à la source uniquement pour les mois où des opérations ont été enregistrées.

Les obligations générées comprennent un identifiant stable, une période, une date d'échéance, une référence CGI, un canal indicatif et une liste de pièces à préparer.

## 2. Génération du registre

L'utilisateur choisit la périodicité TVA dans l'espace « Déclarations », puis peut générer les brouillons du calendrier. Les identifiants stables évitent de créer des doublons lors d'une génération répétée.

Les brouillons sont enregistrés avec :
- statut initial `draft` ;
- montant non renseigné ;
- référence de récépissé vide ;
- liste de justificatifs et cases de préparation non cochées ;
- indicateur de confiance juridique et canal de dépôt à confirmer.

La génération ne marque jamais une déclaration comme déposée ou payée. Ces statuts restent des opérations explicites de suivi humain.

## 3. Sources et bases légales

1. **CGI Maroc 2026, articles 108, 110 et 111** : détermination des régimes de déclaration TVA mensuelle et trimestrielle, ainsi que les délais de déclaration et de versement. La télédéclaration suit les délais spécifiques indiqués par le CGI.
   - DGI : https://www.finances.gov.ma/Publication/dgi/2025/cgi-2026-fr.pdf
   - TGR : https://www.tgr.gov.ma/wps/wcm/connect/9856b6bb-dee8-4578-bfe8-ef1521dcc80f/CGI%2B2026%2BFR.pdf?MOD=AJPERES
2. **CGI Maroc 2026, article 170** : quatre acomptes provisionnels de 25 % de l’impôt de référence, à verser avant l’expiration des 3e, 6e, 9e et 12e mois de l’exercice ; règles particulières pour la cotisation minimale, les exercices de durée différente et les dispenses. Source DGI : https://tax.gov.ma/wps/portal/DGI/Documentation-fiscale/Code-general-des-impots/Partie2Livre1codegeneraledesimpots/
3. **CGI Maroc 2026, article 20-I** : déclaration annuelle du résultat fiscal dans les trois mois suivant la clôture.
4. **CGI Maroc 2026, article 79-I** : état annuel des traitements et salaires.
5. **CGI Maroc 2026, articles 156 et 174** : retenues à la source et versement selon leur catégorie.
6. **DGI — Vos échéances fiscales** : calendrier administratif mensuel, avis et publications à consulter pour les reports et obligations particulières : https://www.tax.gov.ma/wps/portal/DGI/Vos-impots-procedures/Vos-echeances-fiscales

## 4. Limites explicites

- Le calendrier est activé uniquement pour le Maroc. Les autres pays n'ont pas de calendrier opérationnel faute de validation pays par pays.
- Le régime TVA mensuel ou trimestriel est choisi manuellement ; MIZANE ne déduit pas automatiquement l'éligibilité à partir du chiffre d'affaires.
- Les dates sont calculées selon les textes généraux. Le CGI prévoit le report au premier jour ouvrable suivant lorsque le délai expire un jour férié ou chômé légal (art. 163) ; ce report n’est pas calculé automatiquement. Les reports administratifs, jours non ouvrables, échéances événementielles et particularités du contribuable doivent être vérifiés sur le portail DGI.
- Les retenues à la source sont générées à partir des mois des opérations enregistrées, mais la date exacte dépend de la catégorie et du fait générateur ; les éléments concernés restent signalés pour revue.
- Les échéances IS d'acomptes doivent être rapprochées du calendrier réel de l'exercice, de l'impôt de référence et des éventuelles dispenses.
- Les justificatifs sont une liste de préparation, pas un dépôt de fichiers ni une validation de leur conformité.
- Aucun dépôt SIMPL, paiement, transfert bancaire, écriture comptable automatique ou clôture n'est effectué.

## 5. Fichiers

- `js/tax-compliance-core.js` — génération des obligations, dates et justificatifs.
- `js/tax.js` — choix de périodicité, création de brouillons et affichage des justificatifs.
- `tests/tax-compliance.test.js` — tests des échéances mensuelles, trimestrielles, IS, annuelles et invalides.
- `sw.js` — cache PWA porté à `mizane-v68`.
- `tests/run.mjs` — assertions de version du cache.
- `.github/workflows/resilience-tests.yml` — exécution CI sur la branche du lot.
