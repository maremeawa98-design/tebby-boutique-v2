-- Admin complète : rubriques rattachées aux univers, tarifs de livraison,
-- bilan des ventes et alertes de commande.

-- Une rubrique peut appartenir à plusieurs univers (ensembles homme-femme).
alter table public.categories
  add column univers text[] not null default '{}'
    check (univers <@ array['femme', 'homme', 'accessoires']),
  -- Les univers partagent les adresses /boutique/… avec les rubriques.
  add constraint categories_slug_valide
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug not in ('femme', 'homme', 'accessoires'));

create table public.delivery_rates (
  id bigint generated always as identity primary key,
  label text not null unique check (length(trim(label)) between 1 and 40),
  areas text not null default '',
  fee int not null check (fee >= 0),
  position int not null default 0
);

insert into public.delivery_rates (label, areas, fee, position) values
  ('Banlieue', 'Mbao, Keur Massar, Rufisque, Pikine, Guédiawaye', 2000, 1),
  ('Dakar', 'Dakar ville', 2500, 2),
  ('Régions', 'Thiès, Mbour, Saint-Louis, Touba, Kaolack…', 5000, 3);

alter table public.delivery_rates enable row level security;
revoke all on public.delivery_rates from anon, authenticated;
grant select on public.delivery_rates to anon;
grant select, insert, update, delete on public.delivery_rates to authenticated;

create policy "tarifs lisibles" on public.delivery_rates for select using (true);
create policy "tarifs gérés par l'équipe" on public.delivery_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Ces deux fonctions s'exécutent avec les droits de l'appelant :
-- les règles de lecture des commandes s'appliquent, seule l'équipe obtient des chiffres.
create function public.order_counts() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
  from (select status, count(*) as n from public.orders group by status) s;
$$;

-- Une vente compte dès que la commande est confirmée. Les frais de livraison n'y entrent pas.
create function public.sales_report(p_days int) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with bornes as (
    select current_date - (least(greatest(coalesce(p_days, 30), 1), 366) - 1) as debut
  ),
  ventes as (
    select o.* from public.orders o, bornes b
    where o.created_at >= b.debut and o.status in ('confirmee', 'payee', 'en_livraison', 'livree')
  )
  select jsonb_build_object(
    'revenue', (select coalesce(sum(subtotal), 0) from ventes),
    'orders', (select count(*) from ventes),
    'cancelled', (select count(*) from public.orders o, bornes b where o.created_at >= b.debut and o.status = 'annulee'),
    'waiting', (select count(*) from public.orders where status = 'nouvelle'),
    'days', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'revenue', coalesce(v.revenue, 0)) order by d.day)
      from (select generate_series(b.debut, current_date, interval '1 day')::date as day from bornes b) d
      left join (select created_at::date as day, sum(subtotal) as revenue from ventes group by 1) v using (day)
    ),
    'top', coalesce((
      select jsonb_agg(t order by t.quantity desc, t.revenue desc)
      from (
        select i.product_name as name, sum(i.quantity) as quantity, sum(i.quantity * i.unit_price) as revenue
        from public.order_items i join ventes v on v.id = i.order_id
        group by i.product_name
        order by quantity desc, revenue desc
        limit 5
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.order_counts() from public, anon;
revoke execute on function public.sales_report(int) from public, anon;
grant execute on function public.order_counts() to authenticated;
grant execute on function public.sales_report(int) to authenticated;

-- Alerte en direct dans l'admin, sur un canal privé. Publier la table orders ne suffirait pas :
-- un visiteur y recevrait un événement vide à chaque commande et verrait le rythme des ventes.
-- realtime.send ne bloque jamais la commande si l'envoi échoue.
create function public.notify_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'number', new.number, 'customer_name', new.customer_name),
    tg_op, 'commandes', true
  );
  return null;
end $$;

revoke execute on function public.notify_order() from public, anon, authenticated;

create trigger orders_notify after insert or update on public.orders
  for each row execute function public.notify_order();

create policy "alertes reçues par l'équipe" on realtime.messages for select to authenticated
  using (public.is_admin() and realtime.topic() = 'commandes');

-- Sans droit de lecture, la suppression d'une photo échoue sans erreur et le fichier reste stocké.
create policy "photos listées par l'équipe" on storage.objects for select to authenticated
  using (bucket_id = 'produits' and public.is_admin());
