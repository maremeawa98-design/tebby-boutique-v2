-- Catalogue repris de la V1. Noms, prix et catégories sont ceux du site d'origine.
-- Les tailles et les stocks réels sont inconnus : chaque produit a une ligne « À préciser »
-- sans stock suivi, à remplacer dans l'admin. Les photos restent à importer.
insert into public.categories (slug, name, position, univers) values
  ('costumes-africains', 'Costumes africains', 1, '{homme}'),
  ('ensembles-homme', 'Ensembles homme', 2, '{homme}'),
  ('ensembles-femme', 'Ensembles femme', 3, '{femme}'),
  ('tee-shirts', 'Tee-shirts', 4, '{homme}'),
  ('robes', 'Robes', 5, '{femme}'),
  ('chaussures', 'Chaussures', 6, '{accessoires}'),
  ('casquettes', 'Casquettes', 7, '{accessoires}'),
  ('lunettes', 'Lunettes', 8, '{accessoires}');

insert into public.products (slug, name, price, category_id, status, position)
select v.slug, v.name, v.price, c.id, 'publie', v.position
from (values
  ('costume-africain-blanc-de-lait', 'Costume africain blanc de lait', 20000, 'costumes-africains', 1),
  ('ensemble-blanc-de-lait', 'Ensemble blanc de lait', 15000, 'ensembles-homme', 1),
  ('ensemble-bleu-raye', 'Ensemble bleu rayé', 15000, 'ensembles-homme', 2),
  ('ensemble-marron-raye', 'Ensemble marron rayé', 15000, 'ensembles-homme', 3),
  ('ensemble-vert-et-jaune', 'Ensemble vert et jaune', 15000, 'ensembles-homme', 4),
  ('ensemble-vert-et-jaune-modele-2', 'Ensemble vert et jaune - Modèle 2', 15000, 'ensembles-homme', 5),
  ('ensemble-vert', 'Ensemble vert', 15000, 'ensembles-homme', 6),
  ('ensemble-vert-modele-2', 'Ensemble vert - Modèle 2', 15000, 'ensembles-homme', 7),
  ('ensemble-unisexe-bleu-modele-1', 'Ensemble unisexe bleu - Modèle 1', 15000, 'ensembles-homme', 8),
  ('ensemble-unisexe-bleu-modele-2', 'Ensemble unisexe bleu - Modèle 2', 15000, 'ensembles-homme', 9),
  ('ensemble-classe-femme', 'Ensemble classe femme', 10000, 'ensembles-femme', 1),
  ('ensemble-jogging-femme', 'Ensemble jogging femme', 15000, 'ensembles-femme', 2),
  ('tee-shirt-blanc', 'Tee-shirt blanc', 5000, 'tee-shirts', 1),
  ('tee-shirt-noir', 'Tee-shirt noir', 5000, 'tee-shirts', 2),
  ('tee-shirt-rouge', 'Tee-shirt rouge', 5000, 'tee-shirts', 3),
  ('robe-beige', 'Robe beige', 10000, 'robes', 1),
  ('chaussures', 'Chaussures', 15000, 'chaussures', 1),
  ('casquette-blanche', 'Casquette blanche', 5000, 'casquettes', 1),
  ('casquette-noire', 'Casquette noire', 5000, 'casquettes', 2),
  ('lunettes-tebby', 'Lunettes TEBBY', 5000, 'lunettes', 1)
) as v(slug, name, price, category, position)
join public.categories c on c.slug = v.category;

insert into public.product_variants (product_id, size, stock)
select id, 'À préciser', null from public.products;
