// Crée une commande après vérification anti-robot (Cloudflare Turnstile).
import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function human(token: unknown, ip: string | null) {
  const secret = Deno.env.get('TURNSTILE_SECRET');
  // Sans clé configurée, on refuse : mieux vaut aucune commande que des milliers de fausses.
  if (!secret || typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  return Boolean((await res.json().catch(() => ({}))).success);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Méthode refusée.' });

  const body = await req.json().catch(() => null);
  if (!body) return reply(400, { error: 'Commande illisible.' });
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
  if (!(await human(body.token, ip))) {
    return reply(403, { error: 'La vérification anti-robot a échoué. Réessayez.' });
  }

  const { data, error } = await db.rpc('create_order', {
    p_name: body.name,
    p_phone: body.phone,
    p_area: body.area,
    p_note: body.note ?? '',
    p_payment: body.payment,
    p_items: body.items,
  });
  // Seuls les messages prévus par la base sont transmis au client.
  if (error) return reply(400, { error: error.code === 'P0001' ? error.message : 'Commande invalide.' });
  return reply(200, data);
});
