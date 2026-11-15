# Portail SaaS MIZANE — configuration et limites

Le portail est servi séparément de l'application comptable existante à l'adresse `/espace.html`. Aucun fichier du moteur comptable, de sa navigation, de sa base localStorage ou de ses sauvegardes n'est modifié par cette étape.

## Configuration frontend

1. Copier `js/supabase-config.example.js` vers `js/supabase-config.js`.
2. Remplacer les deux valeurs par l'URL du projet Supabase de développement et sa clé publique anon/publishable.
3. Ne jamais placer `SUPABASE_SERVICE_ROLE_KEY`, un mot de passe ou un secret serveur dans ce fichier.
4. Configurer les URL autorisées de Supabase Auth pour l'URL GitHub Pages et `/espace.html`.
5. Configurer la confirmation d'e-mail et les URL de redirection.
6. Déployer la migration SQL et l'Edge Function selon `supabase/README.md` avant d'essayer les fonctions d'entreprise.

## Parcours actuellement présents

- Inscription et connexion par e-mail/mot de passe.
- Demande de réinitialisation du mot de passe.
- Affichage des entreprises auxquelles le compte est membre.
- Création d'une entreprise via RPC `create_company` et attribution du rôle initial admin.
- Sélection d'entreprise active, mémorisée localement sur l'appareil.
- Invitation d'un collaborateur par l'Edge Function `manage-company-members` (rôle comptable ou lecteur).
- Acceptation d'une invitation par jeton pour l'adresse e-mail authentifiée.

## Limites à traiter avant une mise en production

- La migration SQL, les politiques RLS et l'Edge Function doivent être déployées et testées dans un projet Supabase de développement.
- L'envoi automatique des invitations par e-mail n'est pas intégré.
- L'interface ne liste pas encore les membres ni ne permet de changer leurs rôles/statuts ou de révoquer une invitation. L'API serveur existe, mais un endpoint de lecture protégé doit être ajouté : la politique RLS actuelle ne permet pas à un administrateur de lire les profils privés des autres utilisateurs.
- La sélection de l'entreprise est un état d'interface uniquement. Les écritures comptables locales ne sont pas encore rattachées à un `company_id` et ne sont pas synchronisées.
- La réinitialisation de mot de passe doit être complétée par un écran de mise à jour du nouveau mot de passe après retour du lien.
- La confirmation d'inscription et les liens profonds doivent être vérifiés sur le domaine GitHub Pages réel.
- Le client Supabase est chargé depuis esm.sh ; pour une exploitation durable, envisager de figer une version et d'héberger le bundle ou de passer à un outil de build.
- Ne pas présenter le portail comme un SaaS opérationnel tant que ces contrôles et la migration des données n'ont pas été validés.

## Test manuel minimal

1. Ouvrir `espace.html` : sans configuration, la page doit expliquer comment configurer Supabase et proposer le retour à l'application locale.
2. Renseigner une URL et une clé publique de projet de développement.
3. Créer un compte, confirmer l'e-mail, puis se connecter.
4. Créer une entreprise et vérifier le rôle admin.
5. Créer une seconde entreprise et vérifier que le sélecteur permet de passer de l'une à l'autre.
6. Créer une invitation, puis l'accepter avec un compte dont l'adresse correspond.
7. Vérifier les accès négatifs avec un compte non membre.
8. Vérifier que `index.html`, les saisies, les écritures et les sauvegardes locales fonctionnent toujours comme avant.

Aucun de ces essais navigateur/Supabase n'a été exécuté pendant la création de cette PR faute de configuration de projet.


## Gestion des collaborateurs

Pour un administrateur actif, le tableau de bord affiche la liste des collaborateurs de l’entreprise sélectionnée et les invitations encore valides. L’interface permet de modifier un rôle, suspendre ou réactiver un membre, retirer un membre et révoquer une invitation. Les actions sensibles demandent une confirmation dans l’interface et sont toujours revalidées côté serveur.

Les listes sont obtenues par les actions `list_company_members` et `list_company_invitations` de l’Edge Function. Elles sont réservées aux administrateurs actifs et ne divulguent jamais les jetons d’invitation. La liste des membres est plafonnée à 200 entrées et celle des invitations à 100.
