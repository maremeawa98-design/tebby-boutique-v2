import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { fcfa, shortDate, slugify } from '../lib/format';
import { UNIVERS } from '../lib/univers';

type Rubrique = { id: number; slug: string; name: string; position: number; univers: string[]; products: { count: number }[] };
type Rate = { id: number; label: string; areas: string; fee: number; position: number };
type Member = { id: string; email: string; lastSignIn: string | null; self: boolean };

const RESERVED = UNIVERS.map((u) => u.slug);
const MIN_PASSWORD = 10;

function Rubriques() {
  const [rows, setRows] = useState<Rubrique[]>([]);
  const [name, setName] = useState('');
  const [univers, setUnivers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('*, products(count)').order('position').order('id');
    if (error) setError('Impossible de charger les rubriques.');
    else setRows(data as Rubrique[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (id: number, change: Partial<Rubrique>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const toggle = (list: string[], slug: string) => (list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]);

  async function save(row: Rubrique) {
    setError('');
    setSaved('');
    if (!row.name.trim()) return setError('Le nom de la rubrique est obligatoire.');
    if (!row.univers.length) return setError(`Choisis au moins un univers pour ${row.name}.`);
    const { error } = await supabase.from('categories').update({ name: row.name.trim(), univers: row.univers }).eq('id', row.id);
    if (error) setError("L'enregistrement a échoué.");
    else setSaved(`${row.name} enregistrée.`);
  }

  async function move(index: number, step: number) {
    const a = rows[index];
    const b = rows[index + step];
    if (!b) return;
    // Les positions sont renumérotées pour rester distinctes.
    const next = rows.map((r) => (r === a ? b : r === b ? a : r));
    setRows(next);
    const results = await Promise.all(next.map((r, i) => supabase.from('categories').update({ position: i + 1 }).eq('id', r.id)));
    if (results.some((r) => r.error)) {
      setError("Le nouvel ordre n'a pas été enregistré.");
      load();
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaved('');
    const slug = slugify(name);
    if (!slug) return setError('Indique un nom de rubrique.');
    if (RESERVED.includes(slug)) return setError('Ce nom est réservé à un univers.');
    if (!univers.length) return setError('Choisis au moins un univers.');
    const position = Math.max(0, ...rows.map((r) => r.position)) + 1;
    const { error } = await supabase.from('categories').insert({ slug, name: name.trim(), position, univers });
    if (error) return setError(error.code === '23505' ? 'Cette rubrique existe déjà.' : "L'ajout a échoué.");
    setName('');
    setUnivers([]);
    load();
  }

  async function remove(row: Rubrique) {
    setError('');
    const { error } = await supabase.from('categories').delete().eq('id', row.id);
    setPending(null);
    if (error) setError(error.code === '23503' ? `${row.name} contient encore des produits.` : 'La suppression a échoué.');
    else load();
  }

  return (
    <section className="panel form">
      <h2>Rubriques</h2>
      <p className="muted">Le nom change sans modifier l'adresse de la page. Une rubrique vide n'apparaît pas sur le site.</p>
      <ul className="settings">
        {rows.map((r, i) => (
          <li key={r.id}>
            <label>Nom<input value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} /></label>
            <div className="checks" role="group" aria-label={`Univers de ${r.name}`}>
              {UNIVERS.map((u) => (
                <label className="check" key={u.slug}>
                  <input type="checkbox" checked={r.univers.includes(u.slug)} onChange={() => patch(r.id, { univers: toggle(r.univers, u.slug) })} />
                  {u.name}
                </label>
              ))}
            </div>
            <div className="actions">
              <button onClick={() => save(r)}>Enregistrer</button>
              <button aria-label={`Monter ${r.name}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button aria-label={`Descendre ${r.name}`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
              {r.products[0].count > 0 ? (
                <span className="muted">{r.products[0].count} produit{r.products[0].count > 1 ? 's' : ''}</span>
              ) : pending === r.id ? (
                <>
                  <button className="danger" onClick={() => remove(r)}>Oui, supprimer</button>
                  <button onClick={() => setPending(null)}>Non</button>
                </>
              ) : (
                <button onClick={() => setPending(r.id)}>Supprimer</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="muted" role="status">{saved}</p>}
      <form className="form" onSubmit={add}>
        <h3>Nouvelle rubrique</h3>
        <label>Nom<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="checks" role="group" aria-label="Univers de la nouvelle rubrique">
          {UNIVERS.map((u) => (
            <label className="check" key={u.slug}>
              <input type="checkbox" checked={univers.includes(u.slug)} onChange={() => setUnivers((l) => toggle(l, u.slug))} />
              {u.name}
            </label>
          ))}
        </div>
        <div className="actions"><button className="primary">Ajouter la rubrique</button></div>
      </form>
    </section>
  );
}

function Delivery() {
  const [rows, setRows] = useState<(Omit<Rate, 'fee'> & { fee: string })[]>([]);
  const [draft, setDraft] = useState({ label: '', areas: '', fee: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('delivery_rates').select('*').order('position').order('id');
    if (error) setError('Impossible de charger les tarifs.');
    else setRows((data as Rate[]).map((r) => ({ ...r, fee: String(r.fee) })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (id: number, change: Partial<(typeof rows)[number]>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const check = (label: string, fee: string) => {
    if (!label.trim()) return 'Le nom de la zone est obligatoire.';
    if (fee.trim() === '' || !Number.isInteger(Number(fee)) || Number(fee) < 0) return 'Indique un tarif entier en FCFA.';
    return '';
  };

  async function save(row: (typeof rows)[number]) {
    setSaved('');
    const invalid = check(row.label, row.fee);
    setError(invalid);
    if (invalid) return;
    const { error } = await supabase.from('delivery_rates')
      .update({ label: row.label.trim(), areas: row.areas.trim(), fee: Number(row.fee) }).eq('id', row.id);
    if (error) setError(error.code === '23505' ? 'Cette zone existe déjà.' : "L'enregistrement a échoué.");
    else setSaved(`${row.label} : ${fcfa(Number(row.fee))}.`);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaved('');
    const invalid = check(draft.label, draft.fee);
    setError(invalid);
    if (invalid) return;
    const position = Math.max(0, ...rows.map((r) => r.position)) + 1;
    const { error } = await supabase.from('delivery_rates')
      .insert({ label: draft.label.trim(), areas: draft.areas.trim(), fee: Number(draft.fee), position });
    if (error) return setError(error.code === '23505' ? 'Cette zone existe déjà.' : "L'ajout a échoué.");
    setDraft({ label: '', areas: '', fee: '' });
    load();
  }

  async function remove(id: number) {
    setPending(null);
    if (rows.length === 1) return setError('Garde au moins une zone de livraison.');
    const { error } = await supabase.from('delivery_rates').delete().eq('id', id);
    if (error) setError('La suppression a échoué.');
    else load();
  }

  return (
    <section className="panel form">
      <h2>Livraison</h2>
      <p className="muted">Les commandes déjà passées gardent leurs frais.</p>
      <ul className="settings">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="grid2">
              <label>Zone<input value={r.label} onChange={(e) => patch(r.id, { label: e.target.value })} /></label>
              <label>Tarif (FCFA)<input inputMode="numeric" value={r.fee} onChange={(e) => patch(r.id, { fee: e.target.value })} /></label>
            </div>
            <label>Secteurs<input value={r.areas} onChange={(e) => patch(r.id, { areas: e.target.value })} /></label>
            <div className="actions">
              <button onClick={() => save(r)}>Enregistrer</button>
              {pending === r.id ? (
                <>
                  <button className="danger" onClick={() => remove(r.id)}>Oui, supprimer</button>
                  <button onClick={() => setPending(null)}>Non</button>
                </>
              ) : (
                <button onClick={() => setPending(r.id)}>Supprimer</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="muted" role="status">{saved}</p>}
      <form className="form" onSubmit={add}>
        <h3>Nouvelle zone</h3>
        <div className="grid2">
          <label>Zone<input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
          <label>Tarif (FCFA)<input inputMode="numeric" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} /></label>
        </div>
        <label>Secteurs<input value={draft.areas} onChange={(e) => setDraft({ ...draft, areas: e.target.value })} /></label>
        <div className="actions"><button className="primary">Ajouter la zone</button></div>
      </form>
    </section>
  );
}

async function team<T = { ok: boolean }>(body: Record<string, string>) {
  const { data, error } = await supabase.functions.invoke('equipe', { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? "L'action a échoué. Vérifie ta connexion.");
  }
  return data as T;
}

function Team() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reset, setReset] = useState<{ id: string; password: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers((await team<{ members: Member[] }>({ action: 'list' })).members);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(body: Record<string, string>, done: string) {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      await team(body);
      setSaved(done);
      await load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run({ action: 'add', email, password }, `Compte créé pour ${email}. Transmets-lui son mot de passe.`)) {
      setEmail('');
      setPassword('');
    }
  }

  return (
    <section className="panel form">
      <h2>Équipe</h2>
      <p className="muted">Chaque membre a les mêmes droits que toi, y compris sur les comptes de l'équipe.</p>
      {members === null && !error && <p className="muted">Chargement…</p>}
      <ul className="settings">
        {members?.map((m) => (
          <li key={m.id}>
            <p><strong>{m.email}</strong>{m.self && ' (toi)'}<br />
              <span className="muted">{m.lastSignIn ? `Dernière connexion : ${shortDate(m.lastSignIn)}` : 'Jamais connecté'}</span>
            </p>
            {!m.self && (reset?.id === m.id ? (
              <form
                className="row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run({ action: 'password', userId: m.id, password: reset.password }, `Mot de passe changé pour ${m.email}.`)) setReset(null);
                }}
              >
                <input aria-label={`Nouveau mot de passe de ${m.email}`} type="text" autoComplete="off" minLength={MIN_PASSWORD} required value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} />
                <button className="primary" disabled={busy}>Valider</button>
                <button type="button" onClick={() => setReset(null)}>Annuler</button>
              </form>
            ) : (
              <div className="actions">
                <button onClick={() => setReset({ id: m.id, password: '' })}>Changer son mot de passe</button>
                {pending === m.id ? (
                  <>
                    <button className="danger" disabled={busy} onClick={async () => { await run({ action: 'remove', userId: m.id }, `${m.email} n'a plus accès.`); setPending(null); }}>Oui, retirer ce compte</button>
                    <button onClick={() => setPending(null)}>Non</button>
                  </>
                ) : (
                  <button onClick={() => setPending(m.id)}>Retirer</button>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="muted" role="status">{saved}</p>}
      <form className="form" onSubmit={add}>
        <h3>Nouveau membre</h3>
        <label>E-mail<input type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Mot de passe de départ<input type="text" autoComplete="off" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <div className="actions"><button className="primary" disabled={busy}>Créer le compte</button></div>
      </form>
    </section>
  );
}

function Account({ email }: { email: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved('');
    const { error: wrong } = await supabase.auth.signInWithPassword({ email, password: current });
    if (wrong) setError('Le mot de passe actuel est incorrect.');
    else {
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) setError('Ce mot de passe a été refusé. Choisis-en un autre.');
      else {
        setSaved('Mot de passe modifié.');
        setCurrent('');
        setNext('');
      }
    }
    setBusy(false);
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h2>Mon compte</h2>
      <p className="muted">{email}</p>
      <label>Mot de passe actuel<input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label>Nouveau mot de passe<input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={next} onChange={(e) => setNext(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="muted" role="status">{saved}</p>}
      <div className="actions"><button className="primary" disabled={busy}>Changer le mot de passe</button></div>
    </form>
  );
}

export default function Settings({ email }: { email: string }) {
  return (
    <>
      <h1>Réglages</h1>
      <p className="muted">Les rubriques et les tarifs apparaissent sur le site à sa prochaine mise à jour.</p>
      <div className="stack">
        <Rubriques />
        <Delivery />
        <Team />
        <Account email={email} />
      </div>
    </>
  );
}
