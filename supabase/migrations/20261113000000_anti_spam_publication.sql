-- Anti-spam des commandes et demandes de mise à jour du site.

-- Les commandes passent désormais par la fonction « commander », qui vérifie Cloudflare Turnstile.
-- Le navigateur ne peut plus appeler create_order directement.
revoke execute on function public.create_order(text, text, text, text, public.payment_method, jsonb) from anon, authenticated;
grant execute on function public.create_order(text, text, text, text, public.payment_method, jsonb) to service_role;

-- Filet de sécurité : 5 commandes par numéro et par heure au plus.
create function public.limit_orders_per_phone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (
    select count(*) from public.orders
    where customer_phone = new.customer_phone and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Trop de commandes pour ce numéro. Réessayez dans une heure ou écrivez-nous sur WhatsApp.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger orders_limit_per_phone before insert on public.orders
  for each row execute function public.limit_orders_per_phone();

-- Historique des mises à jour du site demandées depuis l'admin (fonction « publier »).
create table public.site_builds (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users (id) on delete set null,
  email text not null default ''
);
create index site_builds_requested_idx on public.site_builds (requested_at desc);

alter table public.site_builds enable row level security;
revoke all on public.site_builds from anon, authenticated;
grant select on public.site_builds to authenticated;
create policy "mises à jour vues par l'équipe" on public.site_builds for select to authenticated
  using (public.is_admin());
