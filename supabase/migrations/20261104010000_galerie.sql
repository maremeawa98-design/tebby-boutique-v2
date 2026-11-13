-- Vues secondaires d'un produit (dos, autres coloris). La photo principale reste image_path.
alter table public.products add column gallery text[] not null default '{}';
