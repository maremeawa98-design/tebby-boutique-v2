# Boutique TEBBY

Boutique en ligne de TEBBY, « la marque qui rassure » (Petit Mbao, Sénégal).
Site public statique (Astro), espace équipe sur `/admin` (React), base, photos et comptes sur Supabase.
Les commandes sont enregistrées en base puis envoyées sur WhatsApp. Aucun paiement en ligne.

Mise en ligne : voir [docs/deploiement.md](docs/deploiement.md).

## Démarrer en local

Docker doit tourner. Node 22.23.1 (voir `.node-version`).

```sh
pnpm install
pnpm db:start
cp .env.example .env   # renseigner les clés affichées par `npx supabase status`
pnpm db:reset
node --env-file=.env scripts/create-admin.mjs
node --env-file=.env scripts/import-catalogue.mjs
pnpm build && pnpm preview
```

Le site est sur http://127.0.0.1:4321, l'espace équipe sur http://127.0.0.1:4321/admin/.

## Comment le site se met à jour

Les pages sont générées au build à partir du catalogue Supabase. Une modification faite dans l'admin
(produit, prix, rubrique, tarif) n'apparaît sur le site qu'après un nouveau build.

## Catalogue

`catalogue/catalogue.json` et `catalogue/photos/` contiennent le catalogue de départ.

L'import peut être relancé. Il rétablit les valeurs du fichier pour les produits qu'il contient, y compris le statut,
le prix et les photos : ne pas le relancer sur une base déjà gérée depuis l'admin.

## Tests

```sh
pnpm db:reset
node --env-file=.env scripts/create-admin.mjs
node --env-file=.env --test tests/securite.test.mjs
```

Les tests supposent une base fraîche, avant l'import, et la modifient. Ne jamais les lancer sur la base en ligne.

## Règles métier

- Les prix d'une commande sont calculés dans `create_order`, jamais dans le navigateur.
- Le stock baisse à la confirmation et revient à l'annulation (`set_order_status`). Un stock vide signifie que la taille n'est pas suivie.
- Les alertes de commande passent par le canal privé `commandes`, réservé à l'équipe.
- Les comptes de l'équipe passent par la fonction `supabase/functions/equipe`, seule à détenir la clé secrète.
- Astro est figé en 7.4.1 : les versions suivantes demandent Node 22.23.4 ou plus.
