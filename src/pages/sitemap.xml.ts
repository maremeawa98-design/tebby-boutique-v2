import type { APIRoute } from 'astro';
import { getCatalogue } from '../lib/catalogue';

export const GET: APIRoute = async ({ site }) => {
  const { products, rubriques, univers } = await getCatalogue();
  const paths = [
    '/',
    '/boutique',
    '/informations',
    ...[...univers, ...rubriques].map((r) => `/boutique/${r.slug}`),
    ...products.map((p) => `/produit/${p.slug}`),
  ];
  const urls = paths.map((path) => `<url><loc>${new URL(path, site)}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
