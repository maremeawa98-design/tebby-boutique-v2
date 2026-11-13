import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useOrderAlerts } from './alertes';
import Dashboard from './Dashboard';
import Orders from './Orders';
import Products from './Products';
import Settings from './Settings';

const MIN_PASSWORD = 10;

function Login({ notice }: { notice: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    if (forgot) {
      // Même réponse que le compte existe ou non, pour ne pas révéler les adresses de l'équipe.
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin/` });
      setSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError('E-mail ou mot de passe incorrect.');
    }
    setBusy(false);
  }

  return (
    <main className="login">
      <form className="panel" onSubmit={submit}>
        <h1 className="brand">TEBBY</h1>
        <p className="muted">{forgot ? 'Mot de passe oublié' : 'Espace équipe'}</p>
        <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {!forgot && <label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
        {(error || notice) && <p className="error" role="alert">{error || notice}</p>}
        {sent && <p className="muted" role="status">Si ce compte existe, un e-mail vient de partir. Pense à regarder les indésirables.</p>}
        <button className="primary" disabled={busy}>{busy ? 'Un instant…' : forgot ? 'Recevoir le lien' : 'Se connecter'}</button>
        <button type="button" className="plain" onClick={() => { setForgot(!forgot); setError(''); setSent(false); }}>
          {forgot ? 'Retour à la connexion' : 'Mot de passe oublié ?'}
        </button>
      </form>
    </main>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError('Ce mot de passe a été refusé. Choisis-en un autre.');
    else onDone();
  }

  return (
    <main className="login">
      <form className="panel" onSubmit={submit}>
        <h1 className="brand">TEBBY</h1>
        <p className="muted">Choisis ton nouveau mot de passe, 10 caractères minimum.</p>
        <label>Nouveau mot de passe<input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>Enregistrer</button>
      </form>
    </main>
  );
}

type Tab = 'commandes' | 'produits' | 'bilan' | 'reglages';
const TABS: { id: Tab; label: string }[] = [
  { id: 'commandes', label: 'Commandes' },
  { id: 'produits', label: 'Produits' },
  { id: 'bilan', label: 'Bilan' },
  { id: 'reglages', label: 'Réglages' },
];

function Shell({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>('commandes');
  const alerts = useOrderAlerts();
  const { markSeen, unseen } = alerts;

  useEffect(() => {
    if (tab === 'commandes' && unseen > 0 && !document.hidden) markSeen();
  }, [tab, unseen, markSeen]);

  return (
    <>
      <header className="topbar">
        <span className="brand">TEBBY</span>
        <nav aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}{t.id === 'commandes' && unseen > 0 && <span className="count" aria-label={`${unseen} nouvelles`}>{unseen}</span>}
            </button>
          ))}
        </nav>
        <button className="link" onClick={() => supabase.auth.signOut()}>Déconnexion</button>
      </header>
      <main className="content">
        {!alerts.enabled && (
          <div className="panel banner">
            <p>Active le son pour entendre les nouvelles commandes tant que cette page reste ouverte.</p>
            <button className="primary" onClick={alerts.enable}>Activer les alertes</button>
          </div>
        )}
        {tab === 'commandes' && <Orders tick={alerts.tick} />}
        {tab === 'produits' && <Products />}
        {tab === 'bilan' && <Dashboard tick={alerts.tick} />}
        {tab === 'reglages' && <Settings email={email} />}
      </main>
      {alerts.toast && (
        <div className="toast" role="status">
          <button className="plain" onClick={() => { setTab('commandes'); alerts.clearToast(); }}>{alerts.toast}</button>
          <button aria-label="Fermer" onClick={alerts.clearToast}>×</button>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next) setAllowed(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    setAllowed(null);
    supabase.rpc('is_admin').then(({ data }) => {
      if (data === true) {
        setNotice('');
        setAllowed(true);
      } else {
        setNotice("Ce compte n'a pas accès à l'espace équipe.");
        supabase.auth.signOut();
      }
    });
  }, [userId]);

  if (recovery && session) return <NewPassword onDone={() => setRecovery(false)} />;
  if (!session || allowed === false) return <Login notice={notice} />;
  if (allowed === null) return <p className="center muted">Chargement…</p>;
  return <Shell email={session.user.email ?? ''} />;
}
