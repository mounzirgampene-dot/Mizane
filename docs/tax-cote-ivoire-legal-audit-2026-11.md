# Dossier d’audit juridique — Côte d’Ivoire (Lot 38)

**Date de vérification :** 25 novembre 2026  
**Branche de travail :** `feat/lot38-ci-tax-audit-2026-11`  
**Branche de base :** `feat/stock-integrated-dev`  
**Commit de départ :** `8d43164e4d90df08e9d604e620b5b17977b72824`

## 1. Objet et limites

Ce dossier consigne le contrôle juridique du profil fiscal ivoirien déjà présent dans `js/tax-core.js` et des calculateurs de `js/african-tax-calculators.js`. Il ne constitue pas une activation de nouveaux impôts ni une validation générale de toutes les retenues répertoriées.

Les sources de référence sont prioritairement les publications de la Direction générale des Impôts (DGI). Lorsqu’un point n’est pas suffisamment établi par un texte officiel accessible, il est explicitement laissé en vérification. Aucun taux ne doit être étendu à une catégorie de contribuables au-delà de son champ légal.

## 2. Sources officielles consultées

1. **Code général des Impôts 2026 — version officielle DGI.** La DGI indique la disponibilité de l’édition 2026 sur son site depuis le 8 juillet 2026.  
   - Portail officiel du Code 2026 : https://dgi.cgici.com/page-0.html?V=202021  
   - Portail de la DGI : https://www.dgi.gouv.ci/

2. **Annexe fiscale 2026 — loi n° 2025-987 du 19 décembre 2025 portant budget de l’État pour 2026.**  
   - PDF publié par la DGI : https://www.fiscalitelocale.dgi.gouv.ci/documents/ANNEXE%20FISCALE%202026.pdf  
   - Version HTML DGI : https://www.dgi.gouv.ci/assets/documents/EBOOK/ANNEXE_FISCALE_2026/files/basic-html/page5.html

3. **Communiqué DGI du 16 janvier 2026 — taux réduit de TVA.** Il expose l’application de l’ordonnance n° 2026-03 du 7 janvier 2026 et fixe l’entrée en vigueur du taux réduit au 17 janvier 2026.  
   - https://www.fne.dgi.gouv.ci/uploads/communiques/pdf_696e12da46ae5_COMMUNIQUE_TAUX_REDUIT.pdf

4. **Bulletin officiel de la DGI 2026 — commentaire de l’article premier de l’annexe fiscale 2026.** Les pages 28 et 29 détaillent l’extension de la retenue BNC de 7,5 % aux intervenants non salariés des productions radiophoniques, télévisuelles et cinématographiques, ainsi que les limites de son champ.  
   - Page 28 : https://www.dgi.gouv.ci/assets/documents/EBOOK/BODGI_2026/files/basic-html/page28.html  
   - Page 29 : https://www.dgi.gouv.ci/assets/documents/EBOOK/BODGI_2026/files/basic-html/page29.html  
   - Texte de l’article premier : https://www.dgi.gouv.ci/assets/documents/EBOOK/ANNEXE_FISCALE_2026/files/basic-html/page44.html

5. **DGI — Impôts et taxes en Côte d’Ivoire.** La fiche officielle consultée indique le taux BIC de droit commun de 25 % et le taux de 30 % pour les entreprises du secteur des télécommunications et des technologies de l’information et de la communication ; elle présente également le barème ITS.  
   - https://www.dgi.gouv.ci/assets/documents/IMPOTS%20ET%20TAXES%20EN%20COTE%20D%27IVOIRE%20.pdf

6. **DGI — Le système fiscal ivoirien.** La fiche expose le barème ITS et la réduction d’impôt pour charges de famille (RICF), ainsi que les règles générales de l’IMF.  
   - https://www.dgi.gouv.ci/assets/documents/LE%20SYSTEME%20FISCAL%20IVOIRIEN.pdf  
   - Barème ITS, page HTML : https://www.dgi.gouv.ci/assets/documents/EBOOK/LE_SYTEME_FISCAL_IVOIRIEN/files/basic-html/page32.html  
   - Acompte sur revenus locatifs, page HTML : https://www.dgi.gouv.ci/assets/documents/EBOOK/LE_SYTEME_FISCAL_IVOIRIEN/files/basic-html/page43.html

7. **DGI — Doctrine fiscale n° 046 du 8 juillet 2024, rémunérations de prestations de services versées à l’étranger.** Elle confirme le taux de 25 % appliqué à une base nette après déduction forfaitaire de 20 %, soit un effet de 20 % sur le montant brut dans le cas ordinaire décrit.  
   - https://www.dgi.gouv.ci/assets/documents/DOCTRINE%20FISCALE%202024/REGIMES%20SPECIFIQUES/N%C2%B0%20046%20MFB%20DGI%20DLCD%20DU%2008%20JUIL%202024%20R%C3%A9gime%20fiscal%20des%20redevances%20et%20r%C3%A9mun%C3%A9rations%20de%20prestations%20de%20services%20vers%C3%A9es%20%C3%A0%20l%27%C3%A9tranger.pdf

8. **DGI — formulaire de retenue sur les revenus locatifs.** Le formulaire officiel rattache la retenue à l’acompte d’impôt sur les revenus locatifs aux articles 168 et suivants du CGI.  
   - https://www.dgi.gouv.ci/assets/documents/imprimes/06_RETENUE_A_LA_SOURCE_A_TITRE_DACOMPTE_SUR_LES_REVENUS_LOCATIFS.pdf

9. **Bulletin officiel de la DGI 2025 — commentaire de l’article 7 de l’annexe fiscale 2025.** Il décrit la suppression, sous conditions, de la retenue de 7,5 % pour certains bénéficiaires et le maintien du prélèvement de 2 % sur les paiements aux prestataires du secteur informel. Ce point doit être rapproché du CGI 2026 avant de modéliser une retenue générique.  
   - Page 33 : https://www.dgi.gouv.ci/assets/documents/EBOOK/BODGI_2025/files/basic-html/page33.html  
   - Page 34 : https://www.dgi.gouv.ci/assets/documents/EBOOK/BODGI_2025/files/basic-html/page34.html

## 3. Résultats de vérification

### 3.1. TVA : taux normal et taux réduit

Le taux normal de 18 % et le taux réduit de 9 % sont confirmés par les publications de la DGI et l’annexe fiscale 2026, complétée par l’ordonnance n° 2026-03.

Le taux de 9 % concerne les biens et opérations expressément visés par le texte, notamment les fibres de jute et de sisal, les aliments pour bétail et animaux de basse-cour, certains intrants et emballages associés. Il ne constitue pas un taux réduit général.

Le communiqué DGI précise que le taux de 9 % s’applique à compter du **17 janvier 2026**. Il précise également le traitement transitoire des opérations réalisées entre le 5 et le 16 janvier 2026 : elles ne doivent pas faire l’objet d’une réclamation de TVA auprès des contribuables, mais toute TVA effectivement facturée pendant cette période doit être reversée au Trésor. Cette situation transitoire ne doit pas être simplifiée en une exonération générale ou en un taux zéro.

**État du code :** les règles `CI_VAT_18` et `CI_VAT_9` existent déjà, avec une date de prise d’effet au 5 janvier 2026 pour le taux normal et au 17 janvier 2026 pour le taux réduit. Le caractère conditionnel du taux de 9 % doit être conservé.

**Point à traiter dans le calculateur :** documenter explicitement la période transitoire du 5 au 16 janvier 2026 et empêcher l’application automatique du taux de 9 % à des produits ou opérations non éligibles.

### 3.2. Impôt sur les bénéfices : taux de 25 % et de 30 %

La documentation officielle DGI consultée indique :
- 25 % comme taux de référence de l’impôt sur les bénéfices ;
- 30 % pour les entreprises du secteur des télécommunications et des technologies de l’information et de la communication.

Le Bulletin officiel DGI 2025 confirme séparément le taux de 30 % pour les entreprises exploitant des jeux de hasard, notamment les opérateurs de jeux en ligne, casinos et exploitants de machines à sous.

**État du code :** le calculateur `calculateCoteIvoireIS` applique 25 % au secteur général et 30 % aux secteurs sélectionnés « télécommunications » et « jeux ». La structure correspond aux catégories documentées. La qualification exacte de l’activité doit toutefois rester une condition préalable et ne peut pas être déduite du seul nom commercial de l’entreprise.

**Limite :** l’impôt minimum forfaitaire, les crédits, déficits, exonérations, contributions et retraitements particuliers ne sont pas calculés par ce module. La simulation doit continuer à l’indiquer clairement.

### 3.3. ITS et RICF

La fiche fiscale DGI consultée présente le barème mensuel progressif suivant : 0 %, 16 %, 21 %, 24 %, 28 % et 32 %, pour les tranches respectives de 0 à 75 000 FCFA, 75 001 à 240 000 FCFA, 240 001 à 800 000 FCFA, 800 001 à 2 400 000 FCFA, 2 400 001 à 8 000 000 FCFA et au-delà de 8 000 000 FCFA.

Le barème RICF publié par la DGI prévoit des réductions mensuelles liées au nombre de parts. Le calculateur existant accepte les parts de 1 à 5, par demi-part.

**État du code :** les tranches `CI_ITS` et la table `CI_RICF` correspondent aux valeurs de la documentation DGI consultée.

**Limite :** le calculateur prend en entrée une assiette mensuelle imposable, et non nécessairement le salaire brut. Il ne remplace pas une liquidation complète de paie et ne calcule pas les cotisations sociales, contributions employeur, exonérations individuelles ou situations particulières.

### 3.4. Retenue BNC de 7,5 % : extension de 2026

L’article premier de l’annexe fiscale 2026 étend la retenue de 7,5 % prévue à l’article 96 du CGI aux intervenants non salariés des productions radiophoniques, télévisuelles et cinématographiques. Le commentaire officiel DGI cite notamment les animateurs, scripteurs, chroniqueurs, consultants, comédiens, techniciens indépendants, acteurs et figurants.

Le commentaire DGI précise une limite importante : la retenue concerne les rémunérations des personnes non salariées relevant de la taxe communale de l’entreprenant ou ne justifiant pas d’une immatriculation au fichier de la DGI. À l’inverse, lorsque les personnes concernées figurent dans le fichier de la DGI, leurs rémunérations ne sont pas soumises à cette retenue de 7,5 % au titre de cette mesure.

**État du code :** `CI_ARTISTS_2026` existe à 7,5 %. Son libellé et les avertissements de l’interface doivent rendre explicites le champ des productions concernées, le statut non salarié et la condition d’immatriculation. Le taux ne doit pas être présenté comme applicable à tout cachet ou à toute rémunération artistique.

### 3.5. RIBNC versées à des non-résidents

La doctrine DGI n° 046/2024 confirme un taux de retenue de 25 % appliqué à une base nette obtenue après déduction forfaitaire de 20 % sur les encaissements bruts, dans le cas qu’elle décrit. L’effet arithmétique est donc de 20 % du montant brut lorsque la retenue reste à la charge du bénéficiaire.

**État du code :** la règle `CI_RIBNC` applique 25 % à 80 % de la base brute. Le calcul arithmétique correspond à la doctrine citée. Les cas de prise en charge de la retenue par le débiteur, les réassurances, les conventions fiscales et les exceptions doivent rester signalés comme non calculés.

### 3.6. Retenue sur revenus locatifs : référence juridique à corriger

Le calculateur `CI_RIRL` applique actuellement un taux unique de **7,5 %** et cite l’article 93 du CGI. Ces deux paramètres sont incompatibles avec les documents officiels DGI consultés.

Le formulaire officiel DGI rattache l’acompte sur les revenus locatifs aux **articles 168 et suivants**. La fiche « Le système fiscal ivoirien », à la rubrique consacrée à cet acompte, indique :
- **12 % du montant brut des loyers** pour le cas général décrit, notamment les loyers pris en location par les entreprises soumises au régime réel, à la taxe d’État de l’entreprenant ou à l’impôt des microentreprises, ainsi que les cas d’intermédiaires concernés ;
- **15 %** lorsque les locaux loués appartiennent à une personne morale ou à une entreprise ;
- le dispositif concerne également les ambassades et organismes internationaux, sous réserve des conditions et exceptions applicables.

Il s’agit d’un **acompte sur l’impôt sur les revenus locatifs**, et non d’un taux général de retenue sur tous les loyers ni d’un impôt autonome de 7,5 %. La base documentée est le montant brut des loyers. Les articles 168 et 169, les catégories de payeurs, les intermédiaires et la distinction entre bailleur personne physique et bailleur personne morale doivent être représentés correctement.

**Correction apportée dans le Lot 38 :** la règle unique `CI_RIRL` à 7,5 % a été remplacée par deux options distinctes : `CI_RIRL_PERSONAL` à 12 % pour un propriétaire personne physique et `CI_RIRL_LEGAL` à 15 % lorsque le local appartient à une personne morale ou à une entreprise. Les deux options renvoient aux articles 168 et 169 et portent un avertissement sur les redevables légaux et les exceptions. L’ancien identifiant `CI_RIRL` renvoie désormais une erreur explicite afin d’éviter qu’une ancienne sélection applique silencieusement le mauvais taux.

**Limite restante :** la sélection 12 % / 15 % dépend de la qualité du propriétaire ; le calculateur ne vérifie pas à lui seul si le payeur est soumis au régime de retenue, si un intermédiaire est seul tenu de prélever, ni les cas d’exonération. Ces conditions doivent être contrôlées avant paiement.

### 3.7. Autres retenues : AIRSI, PPSSI, RIBIC, IRVM et FIRCA

Les règles existantes couvrent des prélèvements juridiquement distincts. Elles ne doivent pas être traitées comme un taux unique de retenue à la source.

Le commentaire DGI de l’annexe fiscale 2025 décrit une dispense conditionnelle de certaines retenues de 7,5 % lorsque les conditions relatives au prélèvement de 2 % sur les paiements aux prestataires du secteur informel sont réunies. Le champ exact doit être rapproché du CGI 2026 et de chaque catégorie d’opération.

**État :** ne pas étendre les règles `CI_RIBIC`, `CI_AIRSI`, `CI_PPSSI`, `CI_IRVM`, `CI_FIRCA` ou `CI_FIRCA_CACAO` à des catégories plus larges sans vérification article par article. Le calculateur de retenue doit conserver un avertissement sur la qualité du bénéficiaire, la nature du paiement, l’immatriculation, les exonérations et les conventions fiscales.

## 4. Décisions de sécurité fiscale

1. Aucun nouvel impôt n’est introduit ; la règle RIRL erronée à 7,5 % est corrigée en deux options conditionnelles de 12 % et 15 %, conformément aux documents DGI consultés.
2. Les règles de TVA 18 % et 9 % existantes sont conservées, sous réserve de la documentation de la période transitoire.
3. Le champ de la retenue BNC 7,5 % de 2026 doit être explicitement conditionné.
4. La règle `CI_RIRL` a été remplacée par `CI_RIRL_PERSONAL` (12 %) et `CI_RIRL_LEGAL` (15 %), avec références aux articles 168 et 169. L’ancien identifiant renvoie une erreur explicite. Les conditions relatives au payeur, à l’intermédiaire et aux exonérations restent à vérifier au moment de l’utilisation.
5. Les retenues AIRSI, PPSSI, RIBIC, IRVM et FIRCA restent soumises à une vérification juridique individuelle.
6. Aucun calculateur fiscal du Niger, de la Guinée ou de la Guinée-Bissau n’est activé par ce dossier.

## 5. Travaux suivants

1. Contrôler dans le CGI 2026 les articles 19, 51, 84 bis, 92 à 99, 115 et suivants, 168 et 169, 182 et 355, en priorité les conditions exactes de l’acompte sur revenus locatifs.
2. Rapprocher chaque retenue ivoirienne de son article exact, de son assiette, du statut du bénéficiaire et de ses exonérations.
3. Ajouter des tests de non-régression pour les dates d’entrée en vigueur de la TVA, le taux réduit conditionnel et les retenues soumises à conditions.
4. Corriger uniquement les écarts démontrés, dans une PR ciblant exclusivement `feat/stock-integrated-dev`.
5. Le fichier `tests/african-tax-calculators.test.js` est désormais exécuté par `npm test` ; les tests ciblent les deux taux RIRL, les montants calculés et le rejet de l’ancien identifiant. Exécuter le lint, les workflows CI et contrôler la disponibilité d’un Preview avant toute fusion dans DEV.

---

**Conclusion :** le contrôle juridique a confirmé plusieurs paramètres déjà présents dans MIZANE et a révélé une erreur substantielle dans la retenue sur revenus locatifs : la référence à l’article 93 et le taux unique de 7,5 % ont été remplacés par deux options conditionnelles fondées sur les articles 168 et 169 et les publications officielles DGI. Les calculateurs et tests ont été adaptés sans modifier la TVA ni les autres taux fiscaux.
