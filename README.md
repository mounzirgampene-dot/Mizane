# MIZANE — Comptabilité générale multi-pays avec IA

Application de comptabilité générale en **partie double**, internationale (choix du pays), installable comme application sur **Android** et **Windows**, avec un **assistant IA Mistral** intégré.

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
- **Export / import** de sauvegarde JSON, export CSV, données de démonstration
- **Plans comptables personnalisables** : ajoutez vos propres comptes

### International 🌍
- **21 pays** préconfigurés : sélection du pays dans les paramètres → plan comptable, devise, taux de TVA et format monétaire adaptés automatiquement
- Plans inclus : **SYSCOHADA (OHADA)** — 17 pays d'Afrique de l'Ouest et Centrale, **PCG (France)**, **NCT (Tunisie)**, **CGNC (Maroc)**, plus un mode personnalisé

### Assistant IA (Mistral) 🤖
- **Saisie intelligente** : décrivez une opération en langage naturel (« achat de fournitures 35 000 payé en espèces, TVA 18 % ») → l'IA propose l'écriture complète, à vérifier puis valider
- **Conversation comptable** : posez vos questions sur vos comptes, la TVA, le résultat…
- **Audit intelligent** : analyse des écritures, signalement des erreurs, TVA oubliée, comptes suspects, recommandations
- **Assistant local de secours** (sans clé API) : résultat, balance, contrôle d'anomalies, aide TVA
- Le moteur local détecte en permanence : déséquilibres, comptes inconnus, doublons

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

## 🤖 Brancher l'IA Mistral
1. Créez une clé API sur [console.mistral.ai](https://console.mistral.ai) (offre gratuite disponible)
2. Dans MIZANE : **Paramètres → Assistant IA** → collez la clé, choisissez le modèle
3. La clé reste stockée **uniquement sur votre appareil** ; les requêtes vont directement à api.mistral.ai

## ✅ Tests
```bash
npm test        # 23 tests du moteur comptable (validation, balance, bilan, anomalies…)
```

## 🗂 Structure
```
index.html            Point d'entrée
js/accounting.js      Moteur comptable (partie double, balance, bilan, anomalies)
js/plans.js           Plans comptables SYSCOHADA / PCG / NCT / CGNC
js/countries.js       Référentiels pays (devise, TVA, plan)
js/ai.js              Assistant IA Mistral + assistant local
js/db.js              Persistance locale, import/export, démo
js/app.js             Interface et écrans
tests/run.mjs         Tests automatisés
sw.js + manifest      Application progressive (PWA, hors-ligne)
```

## 🔐 Données
Toutes les données restent **sur votre appareil** (localStorage). Exportez régulièrement une sauvegarde JSON depuis Paramètres.

## 📄 Licence
MIT
