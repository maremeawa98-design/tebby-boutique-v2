import { fcfa } from './format';

export type OrderItem = { id: number; product_name: string; size: string; unit_price: number; quantity: number };
export type OrderStatus = 'nouvelle' | 'confirmee' | 'payee' | 'en_livraison' | 'livree' | 'annulee';
export type Order = {
  id: number;
  number: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  customer_area: string;
  customer_note: string;
  payment_method: 'livraison' | 'wave';
  subtotal: number;
  delivery_fee: number | null;
  total: number;
  admin_note: string;
  created_at: string;
  order_items: OrderItem[];
};

const lines = (order: Order) =>
  order.order_items
    .map((i) => `- ${i.quantity} x ${i.product_name} (${i.size}) : ${fcfa(i.unit_price * i.quantity)}`)
    .join('\n');

const totals = (order: Order) =>
  order.delivery_fee === null
    ? `Articles : ${fcfa(order.subtotal)}\nLivraison : à confirmer`
    : `Articles : ${fcfa(order.subtotal)}\nLivraison : ${fcfa(order.delivery_fee)}\nTotal : ${fcfa(order.total)}`;

export const messages = {
  confirmation: (o: Order) =>
    `Bonjour ${o.customer_name}, nous avons bien reçu votre commande TEBBY ${o.number}.\n\n${lines(o)}\n\n${totals(o)}\n\nLivraison à : ${o.customer_area}\nPouvez-vous nous confirmer ces informations ?`,
  wave: (o: Order, waveNumber: string) =>
    `Bonjour ${o.customer_name}, pour régler votre commande ${o.number} par Wave, merci d'envoyer ${fcfa(o.total)} au ${waveNumber}, puis de nous partager la capture du paiement.`,
  delivery: (o: Order) =>
    `Bonjour ${o.customer_name}, votre commande TEBBY ${o.number} est en route vers ${o.customer_area}.`,
  thanks: (o: Order) =>
    `Bonjour ${o.customer_name}, votre commande TEBBY ${o.number} est livrée. Merci de votre confiance !`,
};

export const whatsappLink = (phone: string, text: string) =>
  `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
