import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cart, useCart } from '../lib/cart';
import { orderMessage, subtotal, whatsappUrl, zoneFee, type Customer, type DeliveryRate } from '../lib/commande';
import { fcfa } from '../lib/format';

const emptyCustomer = (rates: DeliveryRate[]): Customer => ({ name: '', phone: '', area: '', zone: rates[0]?.label ?? '', payment: 'livraison', note: '' });
type Sent = { number: string; text: string };

type Item = ReturnType<typeof useCart>['items'][number];
type Line = Pick<Item, 'name' | 'size' | 'price' | 'quantity'>;
type Check = { items: Item[]; notice: string };

async function connect() {
  // Chargé uniquement au moment de commander, pour alléger les pages.
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_KEY, {
    auth: { persistSession: false },
  });
}
type Db = Awaited<ReturnType<typeof connect>>;

// Le panier vit dans le navigateur : on le compare au catalogue avant de commander.
async function checkCart(db: Db, items: Item[]): Promise<Check> {
  const { data, error } = await db
    .from('product_variants')
    .select('id, products(price)')
    .in('id', items.map((i) => i.variantId));
  if (error) throw error;
  const prices = new Map(
    (data as unknown as { id: number; products: { price: number } }[]).map((v) => [v.id, v.products.price]),
  );
  const gone = items.filter((i) => !prices.has(i.variantId));
  const changed = items.filter((i) => prices.has(i.variantId) && prices.get(i.variantId) !== i.price);
  const notes = [
    ...gone.map((i) => `${i.name} (${i.size}) n'est plus disponible, nous l'avons retiré du panier.`),
    ...changed.map((i) => `Le prix de ${i.name} est maintenant de ${fcfa(prices.get(i.variantId)!)}.`),
  ];
  return {
    items: items.filter((i) => prices.has(i.variantId)).map((i) => ({ ...i, price: prices.get(i.variantId)! })),
    notice: notes.join(' '),
  };
}

async function createOrder(db: Db, customer: Customer, items: Item[]) {
  const { data, error } = await db.rpc('create_order', {
    p_name: customer.name,
    p_phone: customer.phone,
    p_area: `${customer.area} (${customer.zone})`,
    p_note: customer.note,
    p_payment: customer.payment,
    p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
  });
  if (error) throw error;
  const lines: Line[] = data.items.map((l: { name: string; size: string; quantity: number; unit_price: number }) => ({
    name: l.name,
    size: l.size,
    quantity: l.quantity,
    price: l.unit_price,
  }));
  return { number: data.number as string, lines };
}

function explain(err: unknown) {
  const message = String((err as { message?: string } | null)?.message ?? '');
  if (/téléphone/i.test(message)) return "Ce numéro de téléphone n'est pas valide. Exemple : 77 123 45 67.";
  if (/nom/i.test(message)) return 'Indiquez votre nom complet.';
  if (/quartier/i.test(message)) return 'Indiquez votre quartier et votre ville.';
  if (/stock/i.test(message)) return `${message}. Réduisez la quantité ou choisissez une autre taille.`;
  if (/indisponible/i.test(message)) return "Un article n'est plus disponible. Retirez-le du panier, puis réessayez.";
  return "La commande n'a pas pu être créée. Vérifiez votre connexion, puis réessayez.";
}

// Le récapitulatif s'écrit sous les yeux du client ; la place est réservée pour éviter tout saut.
function Typed({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text.length);
      return;
    }
    const step = Math.ceil(text.length / 70);
    const timer = setInterval(() => {
      setShown((n) => {
        if (n + step >= text.length) clearInterval(timer);
        return Math.min(n + step, text.length);
      });
    }, 18);
    return () => clearInterval(timer);
  }, [text]);
  return (
    <pre>
      {text.slice(0, shown)}
      <span style={{ visibility: 'hidden' }}>{text.slice(shown)}</span>
    </pre>
  );
}

export default function CartDrawer({ rates }: { rates: DeliveryRate[] }) {
  const { items, open } = useCart();
  const dialog = useRef<HTMLDialogElement>(null);
  const [customer, setCustomer] = useState(() => emptyCustomer(rates));
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'panier' | 'infos'>('panier');
  const [notice, setNotice] = useState('');
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Le contenu change sans changer de page : on ramène le focus sur le titre.
  useEffect(() => {
    if (dialog.current?.open) title.current?.focus();
  }, [step, sent]);

  const set = <K extends keyof Customer>(key: K, value: Customer[K]) => setCustomer((c) => ({ ...c, [key]: value }));
  const fee = zoneFee(rates, customer.zone);
  const total = subtotal(items);

  function close() {
    cart.hide();
    setStep('panier');
    setNotice('');
    if (sent) setSent(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const db = await connect();
      const check = await checkCart(db, items);
      if (check.notice) {
        cart.replace(check.items);
        setNotice(check.notice);
        setStep('panier');
      } else {
        const order = await createOrder(db, customer, items);
        setSent({ number: order.number, text: orderMessage(order.lines, customer, fee, order.number) });
        cart.clear();
        setCustomer(emptyCustomer(rates));
        setStep('panier');
      }
    } catch (err) {
      setError(explain(err));
    }
    setBusy(false);
  }

  return (
    <dialog ref={dialog} className="drawer" aria-label="Votre panier" onClose={close} onClick={(e) => e.target === dialog.current && close()}>
      <div className="drawer-inner">
        <div className="drawer-head">
          <h2 ref={title} tabIndex={-1}>{sent ? 'Commande prête' : step === 'infos' && items.length > 0 ? 'Vos coordonnées' : 'Votre panier'}</h2>
          <button className="drawer-close" onClick={close}>Fermer</button>
        </div>

        {notice && !sent && <p className="notice" role="status">{notice}</p>}

        {sent ? (
          <div className="sent">
            <p className="etiquette sent-number">{sent.number}</p>
            <p>Il reste une étape : envoyez ce message à TEBBY, l'équipe vous répond sur WhatsApp pour confirmer.</p>
            <div className="bubble"><Typed text={sent.text} /></div>
            <a className="btn btn-whatsapp" href={whatsappUrl(sent.text)} target="_blank" rel="noreferrer">Envoyer sur WhatsApp</a>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">
            <p>Rien pour l'instant.</p>
            <a className="btn btn-or" href="/boutique">Voir la boutique</a>
          </div>
        ) : step === 'panier' ? (
          <>
            <ul className="lines">
              {items.map((item) => (
                <li key={item.variantId}>
                  <img src={item.image} alt="" width="64" height="85" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                  <div>
                    <a href={`/produit/${item.slug}`}>{item.name}</a>
                    <p>Taille {item.size} · {fcfa(item.price)}</p>
                    <div className="qty">
                      <button aria-label={`Retirer un ${item.name}`} onClick={() => cart.setQuantity(item.variantId, item.quantity - 1)}>−</button>
                      <span aria-live="polite">{item.quantity}</span>
                      <button aria-label={`Ajouter un ${item.name}`} onClick={() => cart.setQuantity(item.variantId, item.quantity + 1)}>+</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="drawer-foot">
              <dl className="sum">
                <div className="sum-total"><dt>Articles</dt><dd>{fcfa(total)}</dd></div>
              </dl>
              <button className="btn btn-or" onClick={() => { setNotice(''); setStep('infos'); }}>Continuer</button>
              <p className="fine">Livraison ajoutée à l'étape suivante.</p>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="checkout">
            <button type="button" className="back" onClick={() => setStep('panier')}>Modifier le panier</button>
            <div className="field-row">
              <label>Nom<input required minLength={2} maxLength={80} autoComplete="name" value={customer.name} onChange={(e) => set('name', e.target.value)} /></label>
              <label>Téléphone<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="77 123 45 67" value={customer.phone} onChange={(e) => set('phone', e.target.value)} /></label>
            </div>
            <label>Quartier et ville<input required minLength={2} maxLength={90} autoComplete="address-level2" value={customer.area} onChange={(e) => set('area', e.target.value)} /></label>

            <fieldset className="choices">
              <legend>Zone de livraison</legend>
              {rates.map((rate) => (
                <label key={rate.label} title={rate.areas}>
                  <input type="radio" name="zone" checked={customer.zone === rate.label} onChange={() => set('zone', rate.label)} />
                  <span>{rate.label}<small>{fcfa(rate.fee)}</small></span>
                </label>
              ))}
            </fieldset>

            <fieldset className="choices">
              <legend>Paiement</legend>
              <label><input type="radio" name="paiement" checked={customer.payment === 'livraison'} onChange={() => set('payment', 'livraison')} /><span>À la livraison</span></label>
              <label><input type="radio" name="paiement" checked={customer.payment === 'wave'} onChange={() => set('payment', 'wave')} /><span>Wave</span></label>
            </fieldset>

            <details className="fold">
              <summary>Ajouter une précision</summary>
              <textarea aria-label="Une précision" rows={2} maxLength={400} value={customer.note} onChange={(e) => set('note', e.target.value)} />
            </details>
            <details className="fold">
              <summary>Voir mon message à TEBBY</summary>
              <div className="bubble"><pre>{orderMessage(items, customer, fee)}</pre></div>
            </details>

            <div className="drawer-foot">
              <dl className="sum">
                <div><dt>Articles</dt><dd>{fcfa(total)}</dd></div>
                <div><dt>Livraison estimée</dt><dd>{fee === null ? 'À confirmer' : fcfa(fee)}</dd></div>
                <div className="sum-total"><dt>Total estimé</dt><dd>{fcfa(total + (fee ?? 0))}</dd></div>
              </dl>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="btn btn-or" disabled={busy}>{busy ? 'Création…' : 'Créer ma commande'}</button>
              <p className="fine">Rien n'est débité ici. On confirme le total avec vous sur WhatsApp.</p>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
