-- TEBBY : catalogue, commandes et droits d'accès.
-- Les montants sont en FCFA entiers. Le stock NULL signifie « non suivi ».

create type public.product_status as enum ('brouillon', 'publie');
create type public.order_status as enum ('nouvelle', 'confirmee', 'payee', 'en_livraison', 'livree', 'annulee');
create type public.payment_method as enum ('livraison', 'wave');

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.categories (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  position int not null default 0
);

create table public.products (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price int not null check (price >= 0),
  category_id bigint not null references public.categories (id),
  status public.product_status not null default 'brouillon',
  image_path text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);

create table public.product_variants (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  size text not null check (length(trim(size)) > 0),
  stock int check (stock is null or stock >= 0),
  position int not null default 0,
  unique (product_id, size)
);
create index product_variants_product_idx on public.product_variants (product_id);

create sequence public.order_number_seq start 1001;

create table public.orders (
  id bigint generated always as identity primary key,
  number text not null unique default 'TB-' || nextval('public.order_number_seq'),
  status public.order_status not null default 'nouvelle',
  customer_name text not null,
  customer_phone text not null,
  customer_area text not null,
  customer_note text not null default '',
  payment_method public.payment_method not null default 'livraison',
  subtotal int not null check (subtotal >= 0),
  delivery_fee int check (delivery_fee is null or delivery_fee >= 0),
  total int generated always as (subtotal + coalesce(delivery_fee, 0)) stored,
  admin_note text not null default '',
  stock_applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_created_idx on public.orders (status, created_at desc);

-- Les libellés et prix sont figés : modifier le catalogue ne change pas une commande passée.
create table public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  variant_id bigint references public.product_variants (id) on delete set null,
  product_name text not null,
  size text not null,
  unit_price int not null check (unit_price >= 0),
  quantity int not null check (quantity between 1 and 20)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_variant_idx on public.order_items (variant_id);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- Crée une commande. Les prix viennent toujours de la base, jamais du navigateur.
create function public.create_order(
  p_name text,
  p_phone text,
  p_area text,
  p_note text,
  p_payment public.payment_method,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_item jsonb;
  v_qty int;
  v_row record;
  v_subtotal int := 0;
  v_order public.orders;
  v_lines jsonb := '[]'::jsonb;
begin
  if length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'Nom invalide' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_area, ''))) not between 2 and 120 then
    raise exception 'Quartier invalide' using errcode = 'P0001';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Note trop longue' using errcode = 'P0001';
  end if;

  -- Numéro local à 9 chiffres : on ajoute l'indicatif du Sénégal.
  if v_phone ~ '^[37][0-9]{8}$' then
    v_phone := '221' || v_phone;
  elsif v_phone !~ '^[1-9][0-9]{9,14}$' then
    raise exception 'Numéro de téléphone invalide' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Panier invalide' using errcode = 'P0001';
  end if;

  insert into public.orders (customer_name, customer_phone, customer_area, customer_note, payment_method, subtotal)
  values (trim(p_name), v_phone, trim(p_area), coalesce(trim(p_note), ''), coalesce(p_payment, 'livraison'), 0)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
       or jsonb_typeof(v_item -> 'variant_id') is distinct from 'number' then
      raise exception 'Article invalide' using errcode = 'P0001';
    end if;
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty not between 1 and 20 then
      raise exception 'Quantité invalide' using errcode = 'P0001';
    end if;

    select v.id, v.size, v.stock, p.name, p.price into v_row
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (v_item ->> 'variant_id')::bigint and p.status = 'publie';

    if not found then
      raise exception 'Article indisponible' using errcode = 'P0001';
    end if;
    if v_row.stock is not null and v_row.stock < v_qty then
      raise exception 'Stock insuffisant pour % (%)', v_row.name, v_row.size using errcode = 'P0001';
    end if;

    insert into public.order_items (order_id, variant_id, product_name, size, unit_price, quantity)
    values (v_order.id, v_row.id, v_row.name, v_row.size, v_row.price, v_qty);

    v_subtotal := v_subtotal + v_row.price * v_qty;
    v_lines := v_lines || jsonb_build_object('name', v_row.name, 'size', v_row.size, 'quantity', v_qty, 'unit_price', v_row.price);
  end loop;

  update public.orders set subtotal = v_subtotal where id = v_order.id;

  return jsonb_build_object('number', v_order.number, 'subtotal', v_subtotal, 'items', v_lines);
end $$;

-- Change le statut d'une commande et applique le stock à la confirmation.
create function public.set_order_status(p_order_id bigint, p_status public.order_status)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_item record;
  v_allowed public.order_status[];
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Commande introuvable' using errcode = 'P0001';
  end if;

  v_allowed := case v_order.status
    when 'nouvelle' then array['confirmee', 'annulee']::public.order_status[]
    when 'confirmee' then array['payee', 'en_livraison', 'annulee']::public.order_status[]
    when 'payee' then array['en_livraison', 'annulee']::public.order_status[]
    when 'en_livraison' then array['livree', 'annulee']::public.order_status[]
    else array[]::public.order_status[]
  end;

  if not (p_status = any (v_allowed)) then
    raise exception 'Changement de statut impossible' using errcode = 'P0001';
  end if;

  if p_status = 'confirmee' and not v_order.stock_applied then
    for v_item in
      select i.variant_id, i.quantity, i.product_name, i.size
      from public.order_items i
      where i.order_id = v_order.id and i.variant_id is not null
      order by i.variant_id
    loop
      update public.product_variants
      set stock = stock - v_item.quantity
      where id = v_item.variant_id and stock is not null and stock >= v_item.quantity;

      if not found and exists (
        select 1 from public.product_variants where id = v_item.variant_id and stock is not null
      ) then
        raise exception 'Stock insuffisant pour % (%)', v_item.product_name, v_item.size using errcode = 'P0001';
      end if;
    end loop;
    update public.orders set stock_applied = true where id = v_order.id;
  end if;

  if p_status = 'annulee' and v_order.stock_applied then
    update public.product_variants v
    set stock = v.stock + i.quantity
    from public.order_items i
    where i.order_id = v_order.id and i.variant_id = v.id and v.stock is not null;
    update public.orders set stock_applied = false where id = v_order.id;
  end if;

  update public.orders set status = p_status where id = v_order.id returning * into v_order;
  return v_order;
end $$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.create_order(text, text, text, text, public.payment_method, jsonb) from public;
revoke execute on function public.set_order_status(bigint, public.order_status) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.create_order(text, text, text, text, public.payment_method, jsonb) to anon, authenticated;
grant execute on function public.set_order_status(bigint, public.order_status) to authenticated;

alter table public.admins enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.admins, public.orders, public.order_items from anon;
revoke all on public.categories, public.products, public.product_variants from anon;
revoke all on public.admins, public.orders, public.order_items from authenticated;
revoke all on public.categories, public.products, public.product_variants from authenticated;

grant select on public.categories, public.products, public.product_variants to anon;
grant select, insert, update, delete on public.categories, public.products, public.product_variants to authenticated;
grant select on public.admins, public.orders, public.order_items to authenticated;
-- Le statut et le stock ne changent que par set_order_status.
grant update (delivery_fee, admin_note) on public.orders to authenticated;

create policy "catégories lisibles" on public.categories for select using (true);
create policy "catégories gérées par l'équipe" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "produits publiés lisibles" on public.products for select to anon
  using (status = 'publie');
create policy "produits lus par l'équipe" on public.products for select to authenticated
  using (status = 'publie' or public.is_admin());
create policy "produits ajoutés par l'équipe" on public.products for insert to authenticated
  with check (public.is_admin());
create policy "produits modifiés par l'équipe" on public.products for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "produits supprimés par l'équipe" on public.products for delete to authenticated
  using (public.is_admin());

create policy "tailles publiées lisibles" on public.product_variants for select to anon
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'publie'));
create policy "tailles lues par l'équipe" on public.product_variants for select to authenticated
  using (public.is_admin() or exists (select 1 from public.products p where p.id = product_id and p.status = 'publie'));
create policy "tailles ajoutées par l'équipe" on public.product_variants for insert to authenticated
  with check (public.is_admin());
create policy "tailles modifiées par l'équipe" on public.product_variants for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "tailles supprimées par l'équipe" on public.product_variants for delete to authenticated
  using (public.is_admin());

create policy "équipe visible par elle-même" on public.admins for select to authenticated
  using (public.is_admin());
create policy "commandes lues par l'équipe" on public.orders for select to authenticated
  using (public.is_admin());
create policy "commandes modifiées par l'équipe" on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "lignes lues par l'équipe" on public.order_items for select to authenticated
  using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produits', 'produits', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "photos ajoutées par l'équipe" on storage.objects for insert to authenticated
  with check (bucket_id = 'produits' and public.is_admin());
create policy "photos modifiées par l'équipe" on storage.objects for update to authenticated
  using (bucket_id = 'produits' and public.is_admin()) with check (bucket_id = 'produits' and public.is_admin());
create policy "photos supprimées par l'équipe" on storage.objects for delete to authenticated
  using (bucket_id = 'produits' and public.is_admin());
