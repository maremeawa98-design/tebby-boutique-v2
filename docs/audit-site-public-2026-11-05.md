# Audit du site public TEBBY (5 novembre 2026)

Version auditée : build local, avant déploiement. Aucune correction n'a été faite pendant l'audit.

**Verdict :** solide techniquement, mais pas prêt à être lancé. 3 bloquants et 4 bugs, dont 2 peuvent faire perdre une commande.

## Scores Lighthouse (mobile simulé)

| Page | Performance | Accessibilité | Bonnes pratiques | SEO | LCP |
|---|---|---|---|---|---|
| Accueil | 92 | 100 | 100 | 100 | 3,1 s |
| Femme | 89 | 100 | 100 | 100 | 3,5 s |
| Fiche produit | 93 | 100 | 100 | 100 | 3,0 s |

Points sains : 111 liens internes valides, un seul h1 par page, aucun décalage de mise en page, aucune clé secrète dans `dist`, brouillons non publiés, contrastes sans alerte axe.

## Bloquants de lancement
1. Anti-spam absent : `create_order` est ouvert et sans limite.
2. `PUBLIC_SITE_URL` vide : canonique, sitemap et robots pointent vers l'ancien site Render.
3. Légal : mentions légales, CGV et politique de confidentialité absentes. Données collectées : nom, téléphone, quartier (loi 2008-12, à confirmer avec un juriste ou la CDP).

## Bugs
4. Grave : un numéro invalide affiche « Vérifiez votre connexion ». Cause probable dans la gestion d'erreur de `src/islands/CartDrawer.tsx`.
5. Grave : un article retiré du catalogue provoque la même erreur générique, sans indiquer l'article.
6. Le prix du panier et du message WhatsApp vient de `localStorage`. La base recalcule le bon prix, mais le message peut différer. Constaté dans le code, pas sur une commande réelle.
7. À 320 px, la page déborde de 9 px et le compteur du panier est coupé.

## Importants
- Accessoires absents du menu mobile.
- Focus clavier perdu après « Continuer » dans le panier, galerie de la fiche non utilisable au clavier, bouton WhatsApp hors repère.
- Pas de guide des tailles, aucune description produit, ni recherche ni tri.
- Ni avis clients, ni réseaux sociaux, ni délai de livraison.
- Pas d'image de partage sur l'accueil et la boutique, données structurées limitées aux fiches, titre « Chaussures | TEBBY » en double.
- Pas d'en-têtes de sécurité (`public/_headers` à créer pour Cloudflare).

## À améliorer ensuite
- React (environ 210 Ko non compressés) chargé sur toutes les pages, images parfois surdimensionnées. À remesurer après déploiement.
- À 768 px, le titre repousse les photos.
- 12 photos petites, un montage (ensemble confort bicolore), visuels très retouchés, sacs rappelant des modèles de luxe.

## Limites de l'audit
Tests sous Chromium uniquement, connexion simulée. Rien sur vrai téléphone, Safari, iPhone ou site déployé. Envoi WhatsApp réel non testé.

## Ordre conseillé
1. Corriger les 4 bugs, le menu mobile et le focus clavier.
2. Ajouter l'anti-spam et les en-têtes de sécurité.
3. Déployer, puis tester sur de vrais téléphones.

À fournir : domaine, informations légales (NINEA), mesures des tailles, délai de livraison.

## Suivi du 5 novembre 2026 (intégration du design noir et or)
Corrigé et vérifié : bugs 4 à 7, Accessoires dans le menu mobile, focus du panier, galerie au clavier, bouton WhatsApp dans un repère, images de partage, données structurées, titres en double, `public/_headers`.

Toujours ouvert : bloquants 1 à 3, guide des tailles, descriptions produit, recherche et tri, avis, réseaux sociaux, délai de livraison, React sur toutes les pages, photos à remplacer.

Scores après intégration (mobile simulé, local) : performance 93, 91 et 95 ; accessibilité, bonnes pratiques et SEO à 100 ; LCP de 2,9 à 3,4 s.
