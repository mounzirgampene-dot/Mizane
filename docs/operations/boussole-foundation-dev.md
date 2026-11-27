# Boussole MIZANE — Livraison fondations DEV

**Statut :** migration préparée dans une branche de fonctionnalité ; non appliquée à Supabase.
**Cible :** MIZANE-DEV uniquement après revue, tests et validation explicite du schéma.

## Livré dans cette tranche

- Domaine documentaire : documents, versions linguistiques immuables par numéro, relations.
- Dictionnaire de synonymes français/arabe.
- Préférences utilisateur privées.
- Journal append-only des consentements IA, accès ponctuel aux données métier et analytique.
- RLS activée et forcée sur toutes les tables.
- Lecture documentaire limitée aux contenus publiés et, pour les documents d'entreprise, aux membres actifs.
- Écriture éditoriale réservée au backend ; aucune écriture directe accordée aux utilisateurs sur les documents.
- Préférences limitées au propriétaire ; consentements insérables et consultables par leur propriétaire, sans UPDATE/DELETE.
- Privilèges SQL accordés explicitement, sans exposer de fonctions métier.

## Non inclus / non activé

Cette tranche ne prétend pas livrer l'ensemble de la Boussole. Les conversations, les médias/bucket, le moteur de recherche runtime, l'interface latérale, l'assistant IA, le guide complet, l'Académie, l'administration éditoriale, l'offline documentaire et la synchronisation restent à développer. Ils nécessitent des migrations et des tests spécifiques.

Aucune donnée métier n'est transmise à l'IA. Aucun bucket ni clé fournisseur n'est créé. Aucun accès Data API n'est activé automatiquement par cette migration.

## Contrôles

Un test statique vérifie la présence des tables, RLS/FORCE RLS, restrictions de consentement et prise en charge FR/AR. La CI doit exécuter ce test avec toute la suite existante. L'application Supabase et les tests RLS réels restent requis avant activation.

## Sécurité de livraison

- Migration additive et transactionnelle.
- Pas de modification des tables comptables, fiscales ou de stock.
- Pas de modification de Production.
- Pas de modification de `main`.
