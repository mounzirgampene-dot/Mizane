# Copilote documentaire IA — MIZANE

## Périmètre

Le module accepte les justificatifs JPEG, PNG, WebP et les PDF. Les PDF sont lus dans le navigateur avec PDF.js 4.10.38 chargé depuis jsDelivr ; aucun document n'est envoyé à un service de conversion tiers. Le texte extractible est récupéré sur 20 pages au maximum. Les pages numérisées sont rendues en images JPEG et jusqu'à quatre pages image sont transmises au fournisseur IA, conformément à la limite du serveur.

Les PDF sont limités à 20 Mo, le texte extrait à 48 000 caractères et les photos à 15 Mo avant compression. Un avertissement indique les pages omises ou le texte tronqué. Les PDF protégés, illisibles ou nécessitant plus de quatre pages numérisées pour une lecture vision complète doivent être vérifiés par un autre moyen.

## Rapprochement indicatif

À partir des faits retournés par le fournisseur IA (date, total, devise, référence et tiers), MIZANE calcule localement des correspondances possibles avec :
- les écritures comptables non contrepassées ;
- les opérations des relevés bancaires déjà importés.

Le score combine la proximité du montant, de la date, de la référence et du libellé. Les devises différentes sont exclues ; aucune conversion n'est réalisée. Les suggestions ne modifient ni les écritures ni les lignes de relevé et ne valident aucun rapprochement. L'utilisateur doit contrôler les originaux et utiliser le workflow comptable ou bancaire approprié.

## Données et confidentialité

Les fichiers sont traités dans le navigateur. Les textes extraits et, pour les pages numérisées, les images rendues sont envoyés au fournisseur IA choisi par l'entreprise via la fonction serveur MIZANE existante. Les clés fournisseur restent côté serveur. Aucun PDF ou image source n'est conservé automatiquement dans MIZANE et aucun lien de fichier permanent n'est créé par ce lot.

## Limites

- PDF multipage jusqu'à 20 pages ; quatre pages numérisées maximum envoyées comme images.
- Qualité d'extraction variable selon la qualité du scan, l'encodage, les tableaux et les polices du PDF.
- Les rapprochements sont des suggestions locales, non une preuve de paiement ou de conformité.
- Aucun taux fiscal n'est déduit et aucune écriture n'est postée sans validation humaine.
