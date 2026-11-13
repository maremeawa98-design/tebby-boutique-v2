# Plan de déploiement TEBBY

Mis à jour le 13 novembre 2026. Projet Supabase : `gdoitiynfzvfyuptzxnt` (région eu-west-2, Londres).

## Ce qu'on met en ligne

| Élément | Service | Coût |
|---|---|---|
| Code source | GitHub, dépôt `maremeawa98-design/tebby-boutique-v2` | Gratuit |
| Site public et espace équipe | Cloudflare Pages, reconstruit à chaque push | Gratuit (500 builds par mois) |
| Base, photos, comptes, alertes | Supabase, offre Free | Gratuit |
| Nom de domaine | Registraire au choix, DNS chez Cloudflare | Environ 10 000 à 15 000 FCFA par an (.com) |

Légende : **[Vous]** = à faire par TEBBY (comptes, paiements, informations). **[Dev]** = travail de développement.

---

## Étape 0. Prérequis

1. **[Vous]** Donner l'accès en écriture au dépôt GitHub au développeur, ou pousser le code depuis le compte `maremeawa98-design`.
2. **[Vous]** Choisir le nom de domaine (par exemple `tebby.sn` ou `tebby-boutique.com`).
3. **[Vous]** Créer les comptes, avec une adresse e-mail de la marque :
   - Supabase : https://supabase.com
   - Cloudflare : https://dash.cloudflare.com
4. **[Vous]** Rassembler pour les textes légaux : nom du responsable, NINEA, RCCM, adresse, délai de livraison, conditions de retour.

## Étape 1. Finir le code avant la mise en ligne (fait le 13 novembre)

5. **Anti-spam des commandes** : fait. Les commandes passent par la fonction `commander`, qui vérifie Cloudflare Turnstile. L'appel direct de `create_order` est fermé, et un même numéro ne peut pas passer plus de 5 commandes par heure.
6. **Bouton « Mettre le site à jour »** : fait, dans Produits et Réglages. Il appelle la fonction `publier`, qui garde le deploy hook secret et refuse un second build dans les 2 minutes.
7. **Pages légales** : faites (`/mentions-legales`, `/conditions-de-vente`, `/confidentialite`), avec des champs **[à compléter]** surlignés. **[Vous]** fournir NINEA, RCCM, adresse, délai de livraison, frais de retour et durée de conservation. Faire relire par un juriste si possible.
8. **Maintien en éveil** : fait, `.github/workflows/maintien-supabase.yml`. **[Dev]** ajouter les secrets `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` dans GitHub (Settings > Secrets and variables > Actions). GitHub suspend les tâches planifiées d'un dépôt sans activité pendant 60 jours : il suffit alors de les réactiver.

## Étape 2. Supabase en ligne

10. **[Vous]** Créer le projet `tebby`, région **West EU (Paris)**, la plus proche de Dakar. Garder le mot de passe de la base dans un gestionnaire de mots de passe.
11. **[Dev]** Relier et envoyer le schéma :
    ```sh
    npx supabase login
    npx supabase link --project-ref <ref-du-projet>
    npx supabase db push            # applique supabase/migrations, sans seed.sql
    npx supabase functions deploy equipe
    npx supabase functions deploy commander
    npx supabase functions deploy publier
    npx supabase secrets set TURNSTILE_SECRET=<clé secrète Turnstile>
    npx supabase secrets set DEPLOY_HOOK_URL=<adresse du deploy hook Cloudflare>
    ```
    `db push` demande le mot de passe de la base : le lancer depuis le Terminal du Mac.
12. **[Dev]** Importer le catalogue et créer le premier compte de l'équipe, avec un fichier `.env.production` local, jamais versionné :
    ```sh
    node --env-file=.env.production scripts/import-catalogue.mjs
    node --env-file=.env.production scripts/create-admin.mjs
    ```
    Ne jamais lancer `tests/securite.test.mjs` sur cette base.
13. **[Vous + Dev]** Réglages dans le tableau de bord Supabase :
    - Authentication > Sign In / Providers : **désactiver les inscriptions** (« Allow new users to sign up »).
    - Authentication > URL Configuration : Site URL `https://<domaine>`, Redirect URLs `https://<domaine>/admin/**`.
    - Authentication > Passwords : longueur minimale 10.
    - Authentication > Emails : modèle « Reset password » en français.
    - Authentication > SMTP : brancher un service d'envoi (Resend, Brevo, gratuits). Sans lui, les e-mails « mot de passe oublié » sont très limités.
    - Realtime > Settings : n'autoriser que les canaux privés.

## Étape 3. Cloudflare Pages

14. **[Vous]** Dans Cloudflare : Turnstile > Add widget, nom `TEBBY`, mode **Managed**, domaines `<domaine>` et `<projet>.pages.dev`. Garder la clé publique (site key) et la clé secrète (secret key).
14 bis. **[Vous]** Dans Cloudflare : Workers & Pages > Créer > Pages > Connecter GitHub > dépôt `tebby-boutique-v2`.
15. **[Dev]** Réglages du build :
    - Framework : Astro. Commande : `pnpm build`. Dossier de sortie : `dist`.
    - Version de Node : lue dans `.node-version` (22.23.1).
    - Variables d'environnement (production) :

      | Variable | Valeur |
      |---|---|
      | `PUBLIC_SUPABASE_URL` | URL du projet Supabase |
      | `PUBLIC_SUPABASE_KEY` | Clé publique (publishable) |
      | `PUBLIC_SITE_URL` | `https://<domaine>` |
      | `PUBLIC_WHATSAPP_SALES` | `221781898385` |
      | `PUBLIC_WAVE_NUMBER` | `78 189 83 85` |
      | `PUBLIC_TURNSTILE_SITE_KEY` | Clé publique Turnstile |

      La clé secrète Supabase ne va **jamais** dans Cloudflare.
16. **[Dev]** Premier déploiement sur l'adresse `*.pages.dev`, puis vérifications de l'étape 5.
17. **[Dev]** Créer le deploy hook (Settings > Builds > Deploy hooks) et l'enregistrer comme secret de la fonction `publier`.
18. **[Dev]** Les en-têtes de sécurité de `public/_headers` sont appliqués automatiquement. Vérifier qu'ils sont bien servis.

## Étape 4. Domaine

19. **[Vous]** Acheter le domaine. Le plus simple : directement chez Cloudflare (Registrar, prix coûtant, pour un .com). Pour un .sn, passer par un registraire agréé, puis confier les DNS à Cloudflare.
20. **[Dev]** Cloudflare Pages > Custom domains : ajouter `<domaine>` et `www.<domaine>` (redirection vers le domaine principal). Le certificat HTTPS est automatique.
21. **[Dev]** Mettre à jour `PUBLIC_SITE_URL` et les URL Supabase de l'étape 13, puis relancer un build.
22. **[Vous + Dev]** Ancien site Render : le remplacer par une redirection vers le nouveau domaine, pour ne pas perdre les visiteurs ni le référencement.

## Étape 5. Vérifications avant d'annoncer le site

23. **[Dev]** Sur l'adresse en ligne :
    - Commande complète, du panier au message WhatsApp, puis visible dans l'admin.
    - Alerte en direct dans l'admin à l'arrivée d'une commande.
    - Modification d'un produit dans l'admin, puis « Mettre le site à jour » : le changement apparaît en quelques minutes.
    - Mot de passe oublié : l'e-mail arrive et le lien fonctionne.
    - Création et retrait d'un membre de l'équipe.
    - Lighthouse et accessibilité, en-têtes de sécurité, aucune erreur dans la console.
24. **[Vous]** Tester sur de vrais téléphones, dont au moins un iPhone : navigation, animations, commande, envoi WhatsApp réel.
25. **[Vous]** Supprimer les commandes de test depuis l'admin (Annuler), ou demander au développeur de les effacer.

## Étape 6. Après le lancement

26. **[Vous]** Google Search Console : ajouter le domaine, valider, soumettre `https://<domaine>/sitemap.xml`.
27. **[Vous]** Mettre le lien du site dans la bio Instagram, TikTok, le statut et le catalogue WhatsApp Business.
28. **[Vous]** Une fois par mois, exporter les commandes. L'offre gratuite de Supabase ne fournit pas de sauvegarde téléchargeable.
29. **[Dev]** Surveiller les quotas gratuits : Supabase (500 Mo de base, 1 Go de photos), Cloudflare (500 builds par mois).

## Restera à faire, sans bloquer le lancement

- Guide des tailles (mesures à fournir), descriptions des produits, délai de livraison affiché.
- Deux photos à remplacer (Chemise kaki, Blazer noir cintré) et 12 photos trop petites.
- Style noir et or pour l'admin.
