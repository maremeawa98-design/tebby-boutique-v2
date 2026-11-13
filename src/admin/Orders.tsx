import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fcfa, shortDate } from '../lib/format';
import { messages, whatsappLink, type Order, type OrderStatus } from '../lib/whatsapp';

type Rate = { label: string; areas: string; fee: number };

const LABELS: Record<OrderStatus, string> = {
  nouvelle: 'Nouvelles',
  confirmee: 'Confirmées',
  payee: 'Payées',
  en_livraison: 'En livraison',
  livree: 'Livrées',
  annulee: 'Annulées',
};

const BADGES: Record<OrderStatus, string> = {
  nouvelle: 'Nouvelle',
  confirmee: 'Confirmée',
  payee: 'Payée',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée',
};

const NEXT: Record<OrderStatus, { status: OrderStatus; label: string }[]> = {
  nouvelle: [{ status: 'confirmee', label: 'Confirmer' }],
  confirmee: [{ status: 'payee', label: 'Marquer payée' }, { status: 'en_livraison', label: 'Mettre en livraison' }],
  payee: [{ status: 'en_livraison', label: 'Mettre en livraison' }],
  en_livraison: [{ status: 'livree', label: 'Marquer livrée' }],
  livree: [],
  annulee: [],
};

const WAVE_NUMBER = import.meta.env.PUBLIC_WAVE_NUMBER as string | undefined;
const STATUSES = Object.keys(LABELS) as OrderStatus[];

function OrderCard({ order, rates, onChange }: { order: Order; rates: Rate[]; onChange: () => void }) {
  const [fee, setFee] = useState(order.delivery_fee?.toString() ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const open = order.status !== 'livree' && order.status !== 'annulee';

  async function setStatus(status: OrderStatus) {
    setBusy(true);
    setError('');
    const { error } = await supabase.rpc('set_order_status', { p_order_id: order.id, p_status: status });
    setBusy(false);
    if (error) setError(error.message);
    else onChange();
  }

  async function saveFee(input: string) {
    const value = input.trim() === '' ? null : Number(input);
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      setError('Indique un montant entier en FCFA.');
      return;
    }
    if (value === order.delivery_fee) return;
    setError('');
    const { error } = await supabase.from('orders').update({ delivery_fee: value }).eq('id', order.id);
    if (error) setError(error.message);
    else onChange();
  }

  const send = (text: string) => whatsappLink(order.customer_phone, text);

  return (
    <article className="panel order">
      <header className="row between">
        <h2>{order.number}</h2>
        <span className={`badge ${order.status}`}>{BADGES[order.status]}</span>
      </header>
      <p className="muted">{shortDate(order.created_at)} · {order.payment_method === 'wave' ? 'Paiement Wave' : 'Paiement à la livraison'}</p>
      <p><strong>{order.customer_name}</strong> · +{order.customer_phone}<br />{order.customer_area}</p>
      {order.customer_note && <p className="note">{order.customer_note}</p>}
      <ul className="lines">
        {order.order_items.map((item) => (
          <li key={item.id}>
            <span>{item.quantity} × {item.product_name} <span className="muted">({item.size})</span></span>
            <span>{fcfa(item.unit_price * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="row between totals">
        <label className="inline">Livraison (FCFA)
          <input inputMode="numeric" value={fee} disabled={!open} onChange={(e) => setFee(e.target.value)} onBlur={() => saveFee(fee)} placeholder="À confirmer" />
        </label>
        <strong>Total : {fcfa(order.total)}</strong>
      </div>
      {open && (
        <div className="rates" role="group" aria-label="Tarifs de livraison">
          {rates.map((rate) => (
            <button key={rate.label} title={rate.areas} onClick={() => saveFee(String(rate.fee))}>
              {rate.label} · {fcfa(rate.fee)}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {open && (
        <div className="actions">
          <a className="whatsapp" href={send(messages.confirmation(order))} target="_blank" rel="noreferrer">Récapitulatif WhatsApp</a>
          {WAVE_NUMBER && order.delivery_fee !== null && (
            <a className="whatsapp" href={send(messages.wave(order, WAVE_NUMBER))} target="_blank" rel="noreferrer">Demander le paiement Wave</a>
          )}
          {order.status === 'en_livraison' && (
            <a className="whatsapp" href={send(messages.delivery(order))} target="_blank" rel="noreferrer">Annoncer la livraison</a>
          )}
        </div>
      )}
      {order.status === 'livree' && (
        <div className="actions">
          <a className="whatsapp" href={send(messages.thanks(order))} target="_blank" rel="noreferrer">Envoyer un remerciement</a>
        </div>
      )}

      {open && (
        <div className="actions">
          {NEXT[order.status].map((next) => (
            <button key={next.status} className="primary" disabled={busy} onClick={() => setStatus(next.status)}>{next.label}</button>
          ))}
          {confirmCancel ? (
            <>
              <button className="danger" disabled={busy} onClick={() => setStatus('annulee')}>Oui, annuler la commande</button>
              <button onClick={() => setConfirmCancel(false)}>Non</button>
            </>
          ) : (
            <button onClick={() => setConfirmCancel(true)}>Annuler</button>
          )}
        </div>
      )}
    </article>
  );
}

const PAGE = 30;

// La recherche passe dans un filtre : on ne garde que les lettres, chiffres, espaces et tirets.
const clean = (text: string) => text.replace(/[^\p{L}\p{N} -]/gu, '').trim();

export default function Orders({ tick }: { tick: number }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<OrderStatus, number>>>({});
  const [rates, setRates] = useState<Rate[]>([]);
  const [status, setStatus] = useState<OrderStatus>('nouvelle');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(clean(search)), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    supabase.from('delivery_rates').select('label, areas, fee').order('position').order('id')
      .then(({ data }) => setRates((data as Rate[]) ?? []));
  }, []);

  const load = useCallback(async () => {
    let request = supabase
      .from('orders')
      .select('*, order_items(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, limit - 1);
    if (query) {
      const digits = query.replace(/\D/g, '');
      const fields = [`number.ilike.%${query}%`, `customer_name.ilike.%${query}%`];
      if (digits.length >= 3) fields.push(`customer_phone.ilike.%${digits}%`);
      request = request.or(fields.join(','));
    } else {
      request = request.eq('status', status);
    }
    const [list, tally] = await Promise.all([request, supabase.rpc('order_counts')]);
    if (list.error || tally.error) setError('Impossible de charger les commandes.');
    else {
      setError('');
      setOrders(list.data as Order[]);
      setTotal(list.count ?? 0);
      setCounts(tally.data as typeof counts);
    }
  }, [limit, query, status]);

  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => { setLimit(PAGE); }, [query, status]);

  return (
    <>
      <div className="row between">
        <h1>Commandes</h1>
        <button onClick={load}>Actualiser</button>
      </div>
      <input className="search" type="search" aria-label="Rechercher une commande" placeholder="Nom, téléphone ou numéro…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {!query && (
        <div className="chips" role="group" aria-label="Filtrer par statut">
          {STATUSES.map((s) => (
            <button key={s} aria-pressed={s === status} onClick={() => setStatus(s)}>
              {LABELS[s]} ({counts[s] ?? 0})
            </button>
          ))}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {orders === null && !error && <p className="muted">Chargement…</p>}
      {query && orders !== null && <p className="muted">{total} résultat{total > 1 ? 's' : ''}, tous statuts confondus.</p>}
      {orders !== null && orders.length === 0 && !query && <p className="muted">Aucune commande ici pour le moment.</p>}
      <div className="stack">
        {orders?.map((order) => <OrderCard key={`${order.id}-${order.status}-${order.delivery_fee}`} order={order} rates={rates} onChange={load} />)}
      </div>
      {orders !== null && orders.length < total && (
        <div className="more"><button onClick={() => setLimit((n) => n + PAGE)}>Voir plus ({total - orders.length})</button></div>
      )}
    </>
  );
}
