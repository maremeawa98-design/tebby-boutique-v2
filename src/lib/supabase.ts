import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_KEY,
);

export const photoUrl = (path: string | null) =>
  path ? supabase.storage.from('produits').getPublicUrl(path).data.publicUrl : null;
