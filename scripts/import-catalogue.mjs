// Importe catalogue/catalogue.json dans Supabase. Le script peut être relancé sans créer de doublon.
// Usage : node --env-file=.env scripts/import-catalogue.mjs
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const { PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = process.env;
if (!url || !key) throw new Error('Renseigne PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY.');

const db = createClient(url, key, { auth: { persistSession: false } });
const catalogue = JSON.parse(await readFile('catalogue/catalogue.json', 'utf8'));
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

async function upload(file) {
  const body = await readFile(`catalogue/photos/${file}`);
  const path = `catalogue/${file.split('/').pop()}`;
  must(await db.storage.from('produits').upload(path, body, { contentType: 'image/webp', upsert: true }));
  return path;
}

const categories = must(await db.from('categories').upsert(catalogue.categories, { onConflict: 'slug' }).select('id, slug'));
const categoryId = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

// Fiches de départ remplacées par un produit du catalogue.
must(await db.from('products').delete().in('slug', catalogue.removed_seed_slugs));

for (const item of catalogue.products) {
  const image_path = await upload(item.photo);
  const gallery = [];
  for (const view of item.views) gallery.push(await upload(`vues/${view}`));
  const [row] = must(await db.from('products').upsert({
    slug: item.slug,
    name: item.name,
    price: item.price,
    category_id: categoryId[item.category],
    status: item.status,
    position: item.position,
    image_path,
    gallery,
  }, { onConflict: 'slug' }).select('id'));

  // Ne touche pas aux tailles déjà renseignées, seulement à la ligne provisoire.
  const sizes = catalogue.sizes[item.category] ?? catalogue.sizes.default;
  const variants = must(await db.from('product_variants').select('id, size').eq('product_id', row.id));
  if (variants.every((v) => v.size === 'À préciser')) {
    must(await db.from('product_variants').delete().eq('product_id', row.id));
    must(await db.from('product_variants').insert(
      sizes.map((size, position) => ({ product_id: row.id, size, stock: null, position })),
    ));
  }
}

console.log(`${catalogue.products.length} produits importés.`);
