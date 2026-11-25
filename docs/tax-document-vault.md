# Coffre documentaire fiscal MIZANE

Le coffre fiscal partagé utilise le projet Supabase MIZANE-DEV et le bucket privé `tax-evidence`.

- Les fichiers ne sont jamais publics ; le téléchargement passe par la session Supabase et les politiques RLS.
- Les chemins sont préfixés par l'identifiant de l'entreprise. Les membres actifs peuvent lire les pièces de leur entreprise.
- Seuls les rôles administrateur et comptable peuvent téléverser, vérifier ou retirer les pièces.
- Taille maximale : 15 Mo par fichier. Formats : PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, XLSX, CSV et TXT.
- Les métadonnées sont conservées dans `public.company_tax_documents`, avec entreprise, déclaration, catégorie, date, auteur et état de vérification.
- Les anciens fichiers locaux restent sur l'appareil tant que l'utilisateur n'a pas déclenché explicitement leur transfert vers le coffre cloud.
- Sans entreprise active, l'application conserve le mode local. Si une entreprise est sélectionnée mais que la session est absente ou inactive, l'accès cloud est refusé et un message explicite est affiché.

Le statut « Vérifié » signifie qu'un membre habilité a contrôlé la pièce dans MIZANE ; il ne certifie pas à lui seul sa conformité juridique. Aucun dépôt fiscal ou paiement n'est exécuté.

- Les justificatifs cloud sont également listés sur un autre appareil même si la déclaration correspondante n'y a pas encore été créée ou synchronisée.
- La suppression d'une entreprise par son administrateur nettoie d'abord les fichiers du bucket privé ; l'entreprise n'est supprimée que si le nettoyage du coffre aboutit.
- Les métadonnées structurantes sont immuables après téléversement et une vérification ne peut pas être rétrogradée par le client.
