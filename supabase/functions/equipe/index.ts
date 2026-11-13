// Comptes de l'équipe. La clé secrète reste ici, jamais dans le navigateur.
import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const refuse = (status: number, error: string) => reply(status, { error });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isMember = async (id: string) =>
  Boolean((await db.from('admins').select('user_id').eq('user_id', id).maybeSingle()).data);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return refuse(405, 'Méthode refusée.');

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return refuse(401, 'Connexion requise.');
  if (!(await isMember(auth.user.id))) return refuse(403, 'Accès refusé.');

  const { action, email, password, userId } = await req.json().catch(() => ({}));
  const weak = typeof password !== 'string' || password.length < 10;

  if (action === 'list') {
    const { data: rows, error } = await db.from('admins').select('user_id, created_at').order('created_at');
    if (error) return refuse(500, 'Liste indisponible.');
    const { data: list, error: usersError } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) return refuse(500, 'Liste indisponible.');
    const byId = new Map(list.users.map((u) => [u.id, u]));
    return reply(200, {
      members: rows.map((r) => ({
        id: r.user_id,
        email: byId.get(r.user_id)?.email ?? '',
        lastSignIn: byId.get(r.user_id)?.last_sign_in_at ?? null,
        self: r.user_id === auth.user!.id,
      })),
    });
  }

  if (action === 'add') {
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return refuse(400, 'Adresse e-mail invalide.');
    if (weak) return refuse(400, 'Le mot de passe doit contenir au moins 10 caractères.');
    const { data, error } = await db.auth.admin.createUser({ email: email.trim().toLowerCase(), password, email_confirm: true });
    if (error) return refuse(400, /already|registered|exists/i.test(error.message) ? 'Ce compte existe déjà.' : 'Création impossible.');
    const { error: linkError } = await db.from('admins').insert({ user_id: data.user.id });
    if (linkError) {
      await db.auth.admin.deleteUser(data.user.id);
      return refuse(500, 'Création impossible.');
    }
    return reply(200, { ok: true });
  }

  if (action === 'password' || action === 'remove') {
    if (typeof userId !== 'string' || !(await isMember(userId))) return refuse(404, 'Membre introuvable.');
    if (userId === auth.user.id) return refuse(400, 'Utilise « Mon compte » pour ton propre accès.');

    if (action === 'password') {
      if (weak) return refuse(400, 'Le mot de passe doit contenir au moins 10 caractères.');
      const { error } = await db.auth.admin.updateUserById(userId, { password });
      return error ? refuse(500, 'Modification impossible.') : reply(200, { ok: true });
    }
    const { error } = await db.auth.admin.deleteUser(userId);
    return error ? refuse(500, 'Suppression impossible.') : reply(200, { ok: true });
  }

  return refuse(400, 'Action inconnue.');
});
