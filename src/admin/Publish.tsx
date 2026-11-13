import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { shortDate } from '../lib/format';

type Build = { requested_at: string; email: string };

// Le site est statique : ce bouton demande à Cloudflare de le reconstruire avec le catalogue du moment.
export default function Publish() {
  const [last, setLast] = useState<Build | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('site_builds').select('requested_at, email').order('requested_at', { ascending: false }).limit(1).maybeSingle();
    setLast(data as Build | null);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function publish() {
    setBusy(true);
    setMessage('');
    setError('');
    const { error } = await supabase.functions.invoke('publier', { body: {} });
    if (error) {
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      setError(detail?.error ?? 'La demande a échoué. Vérifie ta connexion.');
    } else {
      setMessage('Mise à jour lancée. Le site sera à jour dans 2 à 3 minutes.');
      load();
    }
    setBusy(false);
  }

  return (
    <div className="panel banner publish">
      <p>
        <strong>Site public</strong><br />
        <span className="muted">
          {last ? `Dernière mise à jour demandée le ${shortDate(last.requested_at)}${last.email ? ` par ${last.email}` : ''}.` : 'Tes changements apparaissent sur le site après une mise à jour.'}
        </span>
      </p>
      <button className="primary" disabled={busy} onClick={publish}>{busy ? 'Envoi…' : 'Mettre le site à jour'}</button>
      {message && <p className="muted" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
