import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { photoUrl, supabase } from '../lib/supabase';
import { fcfa, slugify } from '../lib/format';

type Category = { id: number; name: string; position: number };
type Variant = { id?: number; size: string; stock: string };
// Une photo déjà en ligne a un chemin, une photo à envoyer a un fichier.
type Shot = { key: string; url: string; path?: string; file?: File };

type Product = {
  id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  category_id: number;
  status: 'brouillon' | 'publie';
  image_path: string | null;
  gallery: string[];
  product_variants: { id: number; size: string; stock: number | null; position: number }[];
};
type Draft = {
  id?: number;
  name: string;
  description: string;
  price: string;
  category_id: number;
  status: 'brouillon' | 'publie';
  image_path: string | null;
  gallery: string[];
  variants: Variant[];
  removed: number[];
};

// Réduit la photo avant l'envoi pour rester dans le quota gratuit de stockage.
async function compress(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Photo illisible'))), 'image/webp', 0.82),
  );
}

const MAX_PHOTOS = 8;

// Une même photo peut servir à deux fiches : on ne supprime que celles que plus rien n'utilise.
async function removeUnused(paths: string[]) {
  if (!paths.length) return;
  const { data, error } = await supabase.from('products').select('image_path, gallery');
  if (error) return;
  const used = new Set((data as { image_path: string | null; gallery: string[] }[]).flatMap((p) => [p.image_path, ...p.gallery]));
  const unused = paths.filter((p) => !used.has(p));
  if (unused.length) await supabase.storage.from('produits').remove(unused);
}

const message = (err: unknown) => String((err as { message?: string } | null)?.message || "L'enregistrement a échoué.");

function Editor({ draft: initial, categories, onDone }: { draft: Draft; categories: Category[]; onDone: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [shots, setShots] = useState<Shot[]>(() =>
    [initial.image_path, ...initial.gallery].flatMap((path) => (path ? [{ key: path, path, url: photoUrl(path)! }] : [])),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setVariant = (index: number, patch: Partial<Variant>) =>
    set('variants', draft.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  function addShots(files: FileList | null) {
    const picked = [...(files ?? [])];
    const room = MAX_PHOTOS - shots.length;
    if (picked.length > room) setError(`${MAX_PHOTOS} photos au maximum par produit.`);
    const added = picked.slice(0, room).map((file) => ({ key: `${file.name}-${file.lastModified}-${Math.random()}`, file, url: URL.createObjectURL(file) }));
    setShots((list) => [...list, ...added]);
  }

  function moveShot(index: number, step: number) {
    setShots((list) => {
      const next = [...list];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });
  }

  function removeVariant(index: number) {
    const target = draft.variants[index];
    setDraft((d) => ({
      ...d,
      variants: d.variants.filter((_, i) => i !== index),
      removed: target.id ? [...d.removed, target.id] : d.removed,
    }));
  }

  function validate() {
    const price = Number(draft.price);
    if (!draft.name.trim()) return 'Le nom est obligatoire.';
    if (draft.price.trim() === '' || !Number.isInteger(price) || price < 0) return 'Indique un prix entier en FCFA.';
    const sizes = draft.variants.map((v) => v.size.trim().toLowerCase());
    if (sizes.some((s) => !s)) return 'Chaque ligne doit avoir une taille.';
    if (new Set(sizes).size !== sizes.length) return 'Une même taille apparaît deux fois.';
    if (draft.status === 'publie' && sizes.length === 0) return 'Ajoute au moins une taille avant de publier.';
    if (draft.status === 'publie' && shots.length === 0) return 'Ajoute au moins une photo avant de publier.';
    if (draft.variants.some((v) => v.stock.trim() !== '' && !(Number.isInteger(Number(v.stock)) && Number(v.stock) >= 0))) {
      return 'Le stock doit être un nombre entier, ou rester vide.';
    }
    return '';
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fields = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        price: Number(draft.price),
        category_id: draft.category_id,
        status: draft.status,
      };
      let id = draft.id;
      if (id) {
        const { error } = await supabase.from('products').update(fields).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert({ ...fields, slug: slugify(fields.name) || `produit-${Date.now()}` })
          .select('id')
          .single();
        if (error) throw error.code === '23505' ? new Error('Un produit porte déjà ce nom.') : error;
        id = data.id as number;
        // En cas d'échec plus loin, un nouvel essai met à jour ce produit au lieu d'en créer un autre.
        setDraft((d) => ({ ...d, id: data.id as number }));
      }

      if (draft.removed.length) {
        const { error } = await supabase.from('product_variants').delete().in('id', draft.removed);
        if (error) throw error;
      }
      for (const [position, v] of draft.variants.entries()) {
        const row = { size: v.size.trim(), stock: v.stock.trim() === '' ? null : Number(v.stock), position };
        const { error } = v.id
          ? await supabase.from('product_variants').update(row).eq('id', v.id)
          : await supabase.from('product_variants').upsert({ ...row, product_id: id }, { onConflict: 'product_id,size' });
        if (error) throw error;
      }

      const paths: string[] = [];
      const uploaded: Shot[] = [];
      for (const [index, shot] of shots.entries()) {
        let path = shot.path;
        if (!path) {
          path = `${id}/${Date.now()}-${index}.webp`;
          const blob = await compress(shot.file!);
          const { error } = await supabase.storage.from('produits').upload(path, blob, { contentType: 'image/webp' });
          if (error) throw error;
        }
        paths.push(path);
        uploaded.push({ ...shot, path, file: undefined });
      }
      setShots(uploaded);
      const { error: linkError } = await supabase.from('products')
        .update({ image_path: paths[0] ?? null, gallery: paths.slice(1) }).eq('id', id);
      if (linkError) throw linkError;
      const before = [initial.image_path, ...initial.gallery].filter((p): p is string => Boolean(p));
      await removeUnused(before.filter((p) => !paths.includes(p)));
      onDone();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from('products').delete().eq('id', draft.id!);
    if (error) {
      setError(message(error));
      setBusy(false);
      return;
    }
    await removeUnused(shots.flatMap((s) => (s.path ? [s.path] : [])));
    onDone();
  }

  return (
    <form className="panel form" onSubmit={save}>
      <div className="row between">
        <h1>{draft.id ? 'Modifier le produit' : 'Nouveau produit'}</h1>
        <button type="button" onClick={onDone}>Retour</button>
      </div>
      <label>Nom<input required value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
      <div className="grid2">
        <label>Prix (FCFA)<input inputMode="numeric" required value={draft.price} onChange={(e) => set('price', e.target.value)} /></label>
        <label>Catégorie
          <select value={draft.category_id} onChange={(e) => set('category_id', Number(e.target.value))}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <label>Description<textarea rows={4} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Matière, coupe, entretien…" /></label>

      <fieldset>
        <legend>Photos</legend>
        <p className="muted">La première est la photo principale du site. {MAX_PHOTOS} photos au maximum.</p>
        {shots.length === 0 && <p className="muted">Aucune photo pour le moment.</p>}
        <ul className="shots">
          {shots.map((shot, i) => (
            <li key={shot.key}>
              <img src={shot.url} alt={`Photo ${i + 1}`} />
              {i === 0 && <span className="badge">Principale</span>}
              <div className="row">
                <button type="button" aria-label={`Avancer la photo ${i + 1}`} disabled={i === 0} onClick={() => moveShot(i, -1)}>←</button>
                <button type="button" aria-label={`Reculer la photo ${i + 1}`} disabled={i === shots.length - 1} onClick={() => moveShot(i, 1)}>→</button>
                <button type="button" aria-label={`Retirer la photo ${i + 1}`} onClick={() => setShots((l) => l.filter((s) => s !== shot))}>×</button>
              </div>
            </li>
          ))}
        </ul>
        <input
          type="file"
          multiple
          aria-label="Ajouter des photos"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            addShots(e.target.files);
            e.target.value = '';
          }}
        />
      </fieldset>

      <fieldset>
        <legend>Tailles et stock</legend>
        <p className="muted">Laisse le stock vide si tu ne veux pas le suivre pour cette taille.</p>
        {draft.variants.map((v, i) => (
          <div className="variant" key={v.id ?? `new-${i}`}>
            <input aria-label="Taille" placeholder="Taille" value={v.size} onChange={(e) => setVariant(i, { size: e.target.value })} />
            <input aria-label="Stock" inputMode="numeric" placeholder="Stock" value={v.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} />
            <button type="button" onClick={() => removeVariant(i)}>Retirer</button>
          </div>
        ))}
        <button type="button" onClick={() => set('variants', [...draft.variants, { size: '', stock: '' }])}>Ajouter une taille</button>
      </fieldset>

      <label className="check">
        <input type="checkbox" checked={draft.status === 'publie'} onChange={(e) => set('status', e.target.checked ? 'publie' : 'brouillon')} />
        Visible sur la boutique
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button className="primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        {draft.id && (confirmDelete ? (
          <>
            <button type="button" className="danger" disabled={busy} onClick={remove}>Oui, supprimer définitivement</button>
            <button type="button" onClick={() => setConfirmDelete(false)}>Non</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)}>Supprimer</button>
        ))}
      </div>
    </form>
  );
}

export default function Products() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('products').select('*, product_variants(*)').order('category_id').order('position').order('id'),
      supabase.from('categories').select('*').order('position'),
    ]);
    if (p.error || c.error) setError('Impossible de charger le catalogue.');
    else {
      setError('');
      setProducts(p.data as Product[]);
      setCategories(c.data as Category[]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { window.scrollTo(0, 0); }, [draft]);

  if (draft) {
    return (
      <Editor
        key={draft.id ?? 'nouveau'}
        draft={draft}
        categories={categories}
        onDone={() => { setDraft(null); load(); }}
      />
    );
  }

  const edit = (p: Product) =>
    setDraft({
      id: p.id,
      name: p.name,
      description: p.description,
      price: String(p.price),
      category_id: p.category_id,
      status: p.status,
      image_path: p.image_path,
      gallery: p.gallery,
      variants: [...p.product_variants]
        .sort((a, b) => a.position - b.position || a.id - b.id)
        .map((v) => ({ id: v.id, size: v.size, stock: v.stock?.toString() ?? '' })),
      removed: [],
    });

  const create = () =>
    setDraft({
      name: '', description: '', price: '', category_id: categories[0]?.id ?? 0,
      status: 'brouillon', image_path: null, gallery: [], variants: [{ size: '', stock: '' }], removed: [],
    });

  const query = slugify(search);
  const visible = products?.filter((p) => slugify(p.name).includes(query)) ?? [];
  const toComplete = (p: Product) =>
    !p.image_path || p.product_variants.some((v) => v.size === 'À préciser');

  return (
    <>
      <div className="row between">
        <h1>Produits</h1>
        <button className="primary" onClick={create}>Nouveau produit</button>
      </div>
      <input className="search" type="search" aria-label="Rechercher un produit" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      {products === null && !error && <p className="muted">Chargement…</p>}
      {categories.map((category) => {
        const items = visible.filter((p) => p.category_id === category.id);
        if (!items.length) return null;
        return (
          <section key={category.id}>
            <h2 className="category">{category.name} ({items.length})</h2>
            <ul className="products">
              {items.map((p) => (
                <li key={p.id}>
                  <button className="product" onClick={() => edit(p)}>
                    {p.image_path ? <img src={photoUrl(p.image_path)!} alt="" loading="lazy" /> : <span className="noimage">Photo</span>}
                    <span className="info">
                      <strong>{p.name}</strong>
                      <span>{fcfa(p.price)}</span>
                      <span className="tags">
                        {p.status === 'brouillon' && <span className="badge annulee">Brouillon</span>}
                        {toComplete(p) && <span className="badge nouvelle">À compléter</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
