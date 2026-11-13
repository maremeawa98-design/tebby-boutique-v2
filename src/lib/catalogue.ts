import { createClient } from '@supabase/supabase-js';
import type { DeliveryRate } from './commande';
import { UNIVERS } from './univers';

export type Variant = { id: number; size: string; stock: number | null; position: number };
export type Category = { id: number; slug: string; name: string; position: number; univers: string[] };
export type Product = {
  id: number;
  slug: string;
  name: string;
  description: string;
  price: number;
  category_id: number;
  image_path: string;
  gallery: string[];
  position: number;
  product_variants: Variant[];
  number: string;
  image: string;
  views: string[];
  category: Category;
};

const db = createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_KEY, {
  auth: { persistSession: false },
});
const url = (path: string) => db.storage.from('produits').getPublicUrl(path).data.publicUrl;

async function load() {
  const [categories, products, rates] = await Promise.all([
    db.from('categories').select('*').order('position'),
    db.from('products').select('*, product_variants(*)').not('image_path', 'is', null).order('position').order('id'),
    db.from('delivery_rates').select('label, areas, fee').order('position').order('id'),
  ]);
  if (categories.error) throw categories.error;
  if (products.error) throw products.error;
  if (rates.error) throw rates.error;

  const byId = new Map((categories.data as Category[]).map((c) => [c.id, c]));
  const order = (p: { category_id: number }) => byId.get(p.category_id)!.position;
  const items = (products.data as Product[])
    .sort((a, b) => order(a) - order(b) || a.position - b.position)
    .map((p, index) => ({
      ...p,
      number: String(index + 1).padStart(3, '0'),
      image: url(p.image_path),
      views: p.gallery.map(url),
      category: byId.get(p.category_id)!,
      product_variants: [...p.product_variants].sort((a, b) => a.position - b.position || a.id - b.id),
    }));

  const rubriques = (categories.data as Category[])
    .map((category) => {
      const list = items.filter((p) => p.category_id === category.id);
      return { ...category, products: list, from: Math.min(...list.map((p) => p.price)) };
    })
    .filter((c) => c.products.length > 0);

  const univers = UNIVERS.map((u) => ({
    ...u,
    rubriques: rubriques.filter((r) => r.univers.includes(u.slug)).map((r) => r.slug),
  })).filter((u) => u.rubriques.length > 0);
  const universOf = (rubrique: string) => univers.find((u) => u.rubriques.includes(rubrique));

  return { products: items, rubriques, univers, universOf, rates: rates.data as DeliveryRate[] };
}

let cache: ReturnType<typeof load> | undefined;
export const getCatalogue = () => (cache ??= load());
