// Point de cadrage des photos recadrées en 3:4 : le haut par défaut pour garder
// les visages, le centre quand le vêtement est photographié seul.
const CENTRE = new Set(['jupes', 'pantalons', 'chaussures', 'casquettes', 'lunettes', 'blazers-hauts']);
const PAR_PRODUIT: Record<string, string> = {};

export const focus = (product: { slug: string; category: { slug: string } }) =>
  PAR_PRODUIT[product.slug] ?? (CENTRE.has(product.category.slug) ? '50% 50%' : '50% 0');

// Même choix pour les images recadrées au build.
export const cropPosition = (product: { slug: string; category: { slug: string } }) =>
  focus(product) === '50% 0' ? 'top' : 'center';

// Photo de couverture d'une rubrique, quand la première ne convient pas.
export const COUVERTURES: Record<string, string> = {
  'ensembles-confort': 'ensemble-confort-vert-foret',
  'ensembles-veste': 'ensemble-veste-courte-marron',
};
