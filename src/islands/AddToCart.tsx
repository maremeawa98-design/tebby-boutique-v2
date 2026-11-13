import { useRef, useState } from 'react';
import { cart } from '../lib/cart';
import { fcfa } from '../lib/format';

type Size = { id: number; size: string; stock: number | null };
type Props = { slug: string; name: string; price: number; image: string; sizes: Size[] };

export default function AddToCart({ slug, name, price, image, sizes }: Props) {
  const available = sizes.filter((s) => s.stock === null || s.stock > 0);
  const [selected, setSelected] = useState<Size | null>(available.length === 1 ? available[0] : null);
  const [missing, setMissing] = useState(false);
  const picker = useRef<HTMLFieldSetElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const flying = useRef(false);

  function add() {
    if (!selected) {
      setMissing(true);
      picker.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (flying.current) return;
    const item = { variantId: selected.id, slug, name, size: selected.size, price, image };
    const from = button.current?.getBoundingClientRect();
    const to = document.querySelector('.cart-count')?.getBoundingClientRect();
    if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cart.add(item);
      return;
    }
    // Un point d'or file du bouton jusqu'au compteur, puis le panier s'ouvre.
    flying.current = true;
    const dot = document.createElement('span');
    dot.className = 'fuseau';
    document.body.append(dot);
    const x0 = from.left + from.width / 2;
    const x1 = to.left + 8;
    const y1 = to.top + 8;
    dot.animate(
      [
        { transform: `translate(${x0}px,${from.top}px)` },
        { transform: `translate(${(x0 + x1) / 2 - 60}px,${Math.min(from.top, y1) + 60}px) scale(1.3)` },
        { transform: `translate(${x1}px,${y1}px) scale(.6)` },
      ],
      { duration: 620, easing: 'cubic-bezier(.5,0,.2,1)' },
    ).onfinish = () => {
      dot.remove();
      flying.current = false;
      cart.add(item);
    };
  }

  return (
    <div className="buy">
      <fieldset className="sizes" ref={picker}>
        <legend>Taille</legend>
        <div className="size-list">
          {sizes.map((s) => {
            const out = s.stock !== null && s.stock <= 0;
            return (
              <label key={s.id} className={out ? 'size out' : 'size'}>
                <input
                  type="radio"
                  name="taille"
                  disabled={out}
                  checked={selected?.id === s.id}
                  onChange={() => {
                    setSelected(s);
                    setMissing(false);
                  }}
                />
                <span>{s.size}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {missing && <p className="form-error" role="alert">Choisissez d'abord une taille.</p>}
      <div className="buy-bar">
        <strong>{fcfa(price)}</strong>
        <button className="btn btn-or" disabled={available.length === 0} ref={button} onClick={add}>
          {available.length === 0 ? 'Bientôt de retour' : 'Ajouter au panier'}
        </button>
      </div>
    </div>
  );
}
