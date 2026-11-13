import { cart, useCart } from '../lib/cart';

export default function CartButton() {
  const { items } = useCart();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <button className="cart-button" onClick={cart.show} aria-label={`Ouvrir le panier, ${count} article${count > 1 ? 's' : ''}`}>
      Panier <span className="cart-count">{count}</span>
    </button>
  );
}
