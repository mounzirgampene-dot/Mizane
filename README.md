# MIZANE — Comptabilité générale multi-pays avec IA

Application de comptabilité générale en **partie double**, internationale (choix du pays), installable comme application sur **Android** et **Windows**, avec un **assistant IA intégré** (Mistral, Groq ou Google Gemini — clés gratuites).

## ✨ Fonctionnalités

### Comptabilité complète
- **Saisie en partie double** avec contrôle d'équilibre (débits = crédits), comptes inconnus refusés, montants contrôlés
- **5 journaux** : achats, ventes, banque, caisse, opérations diverses
- **Contrepassation** d'écritures en un clic
- **Grand livre** par compte avec filtre de période et export CSV
- **Balance générale** avec totaux, soldes débiteurs/créditeurs, contrôle d'équilibre, export CSV
- **Compte de résultat** (charges / produits / bénéfice-perte)
- **Bilan** (actif / passif) avec contrôle d'équilibre automatique et intégration du résultat
- **Tiers** (clients, fournisseurs) avec calcul des soldes
- **Exercice comptable** paramétrable, filtres de période partout
- **Clôture d'exercice & à-nouveaux** : le module **Outils** génère l'écriture de clôture (classes 6/7 → compte 12 « résultat ») puis les à-nouveaux (report des soldes classes 1 à 5) à l'ouverture du nouvel exercice, avec contrôle d'équilibre avant validation
- **Immobilisations & amortissements** : suivi des immobilisations, plans d'amortissement **linéaire et dégressif** (coefficients 1,25 à 2,25), visualisation du plan (annuités, cumul, VNC) et génération automatique de l'écriture de dotations (681 / 28x)
- **Rapprochement bancaire** : collez un relevé (CSV : `date;libellé;montant`, dates JJ/MM/AAAA ou AAAA-MM-JJ) → rapprochement automatique avec les écritures de trésorerie (classe 5) à ±4 jours, export du rapport CSV
- **Export / import** de sauvegarde JSON, export CSV, **export Excel** (balance et journal), données de démonstration
- **Plans comptables personnalisables** : ajoutez vos propres comptes

### International 🌍
- **21 pays** préconfigurés : sélection du pays dans les paramètres → **plan comptable, devise, taux de TVA et format monétaire choisis automatiquement**
- Plans inclus : **SYSCOHADA (OHADA)** — 17 pays d'Afrique de l'Ouest et Centrale, **PCG (France)**, **NCT (Tunisie)**, **CGNC (Maroc)**, plus un mode personnalisé

### Assistant IA (Mistral, Groq ou Gemini) 🤖
- **Saisie intelligente** : décrivez une opération en langage naturel (« achat de fournitures 35 000 payé en espèces, TVA 18 % ») → l'IA propose l'écriture complète, à vérifier puis valider
- **📷 Lecture de photos** : joignez la photo d'une facture, d'un reçu ou d'un ticket → l'IA (modèle vision du fournisseur) lit les montants et propose l'écriture ; la photo fonctionne aussi dans la conversation
- **📥 Remplissage automatique depuis un texte** : collez un relevé bancaire, des factures ou vos notes → l'IA crée toutes les écritures d'un coup ; grand livre, balance, bilan et compte de résultat se remplissent automatiquement
- **Conversation comptable** : posez vos questions sur vos comptes, la TVA, le résultat…
- **Audit intelligent** : analyse des écritures, signalement des erreurs, TVA oubliée, comptes suspects, recommandations
- **Assistant local de secours** (sans clé API) : résultat, balance, contrôle d'anomalies, aide TVA, import de texte ligne par ligne
- Le moteur local détecte en permanence : déséquilibres, comptes inconnus, doublons

### Impression 🖨
- **Facture imprimable** générée depuis chaque écriture de vente (bouton 🧾 dans Écritures) : en-tête société, client, total HT / TVA / TTC
- Boutons **Imprimer** sur la balance, le compte de résultat, le bilan, le grand livre et le journal des écritures

### Confort d'utilisation
- **Mode sombre / clair** (bouton 🌙, préférence mémorisée, suit le thème du système par défaut)
- **Notifications toast** pour chaque action, **aide contextuelle** sur la saisie (journaux, classes de comptes, équilibre)
- **Accessibilité** : labels sur tous les champs, navigation clavier, contrastes conformes WCAG 2.1 AA, `aria-live` sur le contenu principal

## 🚀 Installation

### Android
1. Ouvrez l'application dans **Chrome**
2. Menu ⋮ → **« Ajouter à l'écran d'accueil »** / **« Installer l'application »**
3. MIZANE s'installe comme une application native et fonctionne **hors ligne**

### Windows
1. Ouvrez l'application dans **Edge** (ou Chrome)
2. Cliquez sur l'icône **« Installer l'application »** dans la barre d'adresse
3. MIZANE apparaît dans le menu Démarrer et fonctionne **hors ligne**

### Lancer en local
```bash
npx serve .        # ou : python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## 🤖 Brancher l'IA (clé gratuite)
Trois fournisseurs sont intégrés, tous avec **offre gratuite sans carte bancaire** :

| Fournisseur | Créer la clé | Particularité |
|---|---|---|
| **Google Gemini** (par défaut) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Connexion avec un compte Google, clé immédiate, lecture de photos incluse |
| **Groq** | [console.groq.com/keys](https://console.groq.com/keys) | Très rapide, clé immédiate, lecture de photos incluse (Llama 4 Scout) |
| **Mistral AI** | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) | Lecture de photos (Pixtral) |

1. Créez une clé sur le site du fournisseur (quelques clics, aucune carte demandée)
2. Dans MIZANE : **Paramètres → Assistant IA** → choisissez le **Fournisseur**, collez la **Clé API**, choisissez le modèle
3. La clé reste stockée **uniquement sur votre appareil**, **chiffrée localement** (AES-GCM, Web Crypto) ; les requêtes vont directement au fournisseur choisi
4. Un fournisseur **Personnalisé** (compatible OpenAI) est aussi disponible pour brancher n'importe quel autre service

## ✅ Tests & qualité
```bash
npm test        # 37 tests : moteur comptable, amortissements, clôture/à-nouveaux, rapprochement, cas limites, fournisseurs IA (mock)
npm run lint    # ESLint (exécuté aussi en CI)
```

## 🔐 Confidentialité
- Toutes les données comptables restent **sur votre appareil** (localStorage). Rien n'est envoyé sur Internet, sauf les textes/photos que vous soumettez à l'assistant IA (envoyés au fournisseur choisi : Mistral, Groq ou Google) et les sauvegardes que vous exportez vous-même.
- La clé API du fournisseur IA est **chiffrée avant stockage** (AES-GCM via Web Crypto, clé générée sur l'appareil). Ce chiffrement protège d'une lecture directe du stockage ; il ne remplace pas le verrouillage de votre appareil. Une page « Confidentialité » dans les Paramètres détaille tout cela.

## 🗂 Structure
```
index.html            Point d'entrée
js/accounting.js      Moteur comptable (partie double, balance, bilan, anomalies)
js/plans.js           Plans comptables SYSCOHADA / PCG / NCT / CGNC
js/countries.js       Référentiels pays (devise, TVA, plan)
js/ai.js              Assistant IA multi-fournisseurs (Mistral, Groq, Gemini) + assistant local
js/db.js              Persistance locale, import/export, démo, export Excel
js/finance.js         Amortissements, rapprochement bancaire, clôture d'exercice
js/crypto.js          Chiffrement local des secrets (AES-GCM)
js/views/             Écrans (tableau de bord, saisie, états, outils, assistant IA, paramètres)
js/invoice.js         Génération de facture imprimable
js/print.js           Impression des états
tests/run.mjs         Tests automatisés
sw.js + manifest      Application progressive (PWA, hors-ligne)
```

## 🔒 Données
Toutes les données restent **sur votre appareil** (localStorage), clé IA incluse (chiffrée). Exportez régulièrement une sauvegarde JSON depuis Paramètres.

## 🗺 Feuille de route
Pistes prévues pour les prochaines itérations : IndexedDB (stockage plus robuste), interface en anglais (i18n), rôles multi-utilisateurs, sauvegarde cloud chiffrée, import OFX, prévisions de trésorerie assistées par IA.

## 📄 Licence
MIT
