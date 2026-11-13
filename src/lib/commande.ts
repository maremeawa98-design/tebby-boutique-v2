import { fcfa } from './format';
import type { CartItem } from './cart';

export const SALES_NUMBER = import.meta.env.PUBLIC_WHATSAPP_SALES as string;
export const whatsappUrl = (text: string) => `https://wa.me/${SALES_NUMBER}?text=${encodeURIComponent(text)}`;

export type DeliveryRate = { label: string; areas: string; fee: number };

export type Customer = {
  name: string;
  phone: string;
  area: string;
  zone: string;
  payment: 'livraison' | 'wave';
  note: string;
};

type Line = Pick<CartItem, 'name' | 'size' | 'price' | 'quantity'>;

export const subtotal = (items: Line[]) => items.reduce((sum, i) => sum + i.price * i.quantity, 0);
export const zoneFee = (rates: DeliveryRate[], zone: string) => rates.find((r) => r.label === zone)?.fee ?? null;

export function orderMessage(items: Line[], customer: Customer, fee: number | null, number?: string) {
  const total = subtotal(items);
  const lines = items.map((i) => `- ${i.quantity} x ${i.name} (${i.size}) : ${fcfa(i.price * i.quantity)}`);
  return [
    number ? `Bonjour TEBBY, voici ma commande ${number} :` : 'Bonjour TEBBY, voici ma commande :',
    '',
    ...lines,
    '',
    `Articles : ${fcfa(total)}`,
    fee === null ? 'Livraison : à confirmer' : `Livraison estimée (${customer.zone}) : ${fcfa(fee)}`,
    ...(fee === null ? [] : [`Total estimé : ${fcfa(total + fee)}`]),
    `Paiement : ${customer.payment === 'wave' ? 'Wave' : 'à la livraison'}`,
    '',
    `Nom : ${customer.name || '…'}`,
    `Quartier : ${customer.area || '…'}`,
    ...(customer.note ? [`Note : ${customer.note}`] : []),
  ].join('\n');
}
