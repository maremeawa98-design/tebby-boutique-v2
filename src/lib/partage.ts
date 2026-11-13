import { getImage } from 'astro:assets';
import { cropPosition } from './cadrage';

// Image de partage (WhatsApp, réseaux sociaux) tirée d'une photo produit.
export async function shareImage(product: { image: string; slug: string; category: { slug: string } }) {
  const image = await getImage({ src: product.image, width: 800, height: 1067, fit: 'cover', position: cropPosition(product), format: 'jpg' });
  return image.src;
}
