// Crée ou met à jour un compte de l'équipe : node --env-file=.env scripts/create-admin.mjs
import { createClient } from '@supabase/supabase-js';

const { PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
if (!url || !key || !email || !password) {
  throw new Error('Renseigne PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_EMAIL et ADMIN_PASSWORD.');
}

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: list, error: listError } = await db.auth.admin.listUsers();
if (listError) throw listError;

let user = list.users.find((u) => u.email === email);
if (user) {
  const { error } = await db.auth.admin.updateUserById(user.id, { password });
  if (error) throw error;
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
}

const { error } = await db.from('admins').upsert({ user_id: user.id });
if (error) throw error;
console.log(`Compte équipe prêt : ${email}`);
