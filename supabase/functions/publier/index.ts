// Lance la reconstruction du site sur Cloudflare. L'adresse du hook reste secrète ici.
import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const WAIT_SECONDS = 120;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Méthode refusée.' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return reply(401, { error: 'Connexion requise.' });
  const { data: member } = await db.from('admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
  if (!member) return reply(403, { error: 'Accès refusé.' });

  const hook = Deno.env.get('DEPLOY_HOOK_URL');
  if (!hook) return reply(503, { error: "La mise à jour du site n'est pas encore configurée." });

  // Un build dure 2 à 3 minutes : inutile d'en relancer un pendant ce temps.
  const { data: last } = await db.from('site_builds').select('requested_at').order('requested_at', { ascending: false }).limit(1).maybeSingle();
  const elapsed = last ? (Date.now() - new Date(last.requested_at).getTime()) / 1000 : Infinity;
  if (elapsed < WAIT_SECONDS) {
    return reply(429, { error: `Une mise à jour est déjà en cours. Réessayez dans ${Math.ceil(WAIT_SECONDS - elapsed)} secondes.` });
  }

  const res = await fetch(hook, { method: 'POST' });
  if (!res.ok) return reply(502, { error: "Cloudflare n'a pas accepté la demande. Réessayez plus tard." });
  await db.from('site_builds').insert({ requested_by: auth.user.id, email: auth.user.email ?? '' });
  return reply(200, { ok: true });
});
