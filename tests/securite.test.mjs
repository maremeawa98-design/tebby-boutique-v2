// Lancer avec : node --env-file=.env --test tests/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(url, process.env.PUBLIC_SUPABASE_KEY, opts);
const service = createClient(url, process.env.SUPABASE_SECRET_KEY, opts);

const anon = client();
const stranger = client();
const admin = client();
const email = `visiteur-${Date.now()}@test.local`;
const customer = ['Awa Diop', '77 123 45 67', 'Petit Mbao', '', 'livraison'];
// create_order n'est plus ouvert au navigateur : les tests l'appellent comme la fonction « commander ».
// Chaque commande a son propre numéro, pour ne pas buter sur la limite de 5 par heure.
let phones = 0;
const fresh = () => [customer[0], `70 ${String(++phones).padStart(7, '0')}`, ...customer.slice(2)];
const order = (_db, items, c = fresh()) =>
  service.rpc('create_order', { p_name: c[0], p_phone: c[1], p_area: c[2], p_note: c[3], p_payment: c[4], p_items: items });

let variant;
let product;

before(async () => {
  await service.auth.admin.createUser({ email, password: 'motdepasse-test-1', email_confirm: true });
  assert.ifError((await stranger.auth.signInWithPassword({ email, password: 'motdepasse-test-1' })).error);
  assert.ifError((await admin.auth.signInWithPassword({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).error);
  const { data } = await service.from('products').select('id, price, product_variants(id)').eq('slug', 'tee-shirt-noir').single();
  product = data;
  variant = data.product_variants[0].id;
  await service.from('product_variants').update({ stock: 5 }).eq('id', variant);
});

after(() => [anon, stranger, admin, service].forEach((db) => db.realtime.disconnect()));

test('le catalogue public expose les 20 produits publiés', async () => {
  const { data, error } = await anon.from('products').select('id');
  assert.ifError(error);
  assert.equal(data.length, 20);
});

test('un brouillon est invisible pour un visiteur', async () => {
  await service.from('products').update({ status: 'brouillon' }).eq('id', product.id);
  const { data } = await anon.from('products').select('id').eq('id', product.id);
  const { data: sizes } = await anon.from('product_variants').select('id').eq('product_id', product.id);
  await service.from('products').update({ status: 'publie' }).eq('id', product.id);
  assert.equal(data.length, 0);
  assert.equal(sizes.length, 0);
});

test('un visiteur ne peut ni lire ni modifier les données protégées', async () => {
  assert.ok((await anon.from('orders').select('id')).error);
  assert.ok((await anon.from('order_items').select('id')).error);
  assert.ok((await anon.from('admins').select('user_id')).error);
  assert.ok((await anon.from('products').update({ price: 1 }).eq('id', product.id)).error);
  assert.ok((await anon.from('orders').insert({ customer_name: 'x' })).error);
});

test('un compte connecté sans droits reste bloqué', async () => {
  assert.deepEqual((await stranger.from('orders').select('id')).data ?? [], []);
  const update = await stranger.from('products').update({ price: 1 }).eq('id', product.id).select();
  assert.deepEqual(update.data ?? [], []);
  assert.ok((await stranger.from('admins').insert({ user_id: (await stranger.auth.getUser()).data.user.id })).error);
  assert.ok((await stranger.rpc('set_order_status', { p_order_id: 1, p_status: 'annulee' })).error);
  const upload = await stranger.storage.from('produits').upload(`pirate-${Date.now()}.png`, new Blob(['x'], { type: 'image/png' }));
  assert.ok(upload.error);
  const { data } = await service.from('products').select('price').eq('id', product.id).single();
  assert.equal(data.price, product.price);
});

test('le prix vient de la base, pas du navigateur', async () => {
  const { data, error } = await order(anon, [{ variant_id: variant, quantity: 2, unit_price: 1 }]);
  assert.ifError(error);
  assert.match(data.number, /^TB-\d+$/);
  assert.equal(data.subtotal, product.price * 2);
});

test('le téléphone local reçoit l\'indicatif du Sénégal', async () => {
  const { data } = await order(anon, [{ variant_id: variant, quantity: 1 }], customer);
  const { data: row } = await service.from('orders').select('customer_phone').eq('number', data.number).single();
  assert.equal(row.customer_phone, '221771234567');
});

test('les commandes invalides sont refusées sans laisser de trace', async () => {
  const { count: before } = await service.from('orders').select('*', { count: 'exact', head: true });
  const cases = [
    [[]],
    [[{ variant_id: variant }]],
    [[{ variant_id: variant, quantity: 0 }]],
    [[{ variant_id: variant, quantity: 21 }]],
    [[{ variant_id: variant, quantity: -1 }]],
    [[{ variant_id: 999999, quantity: 1 }]],
    [[{ variant_id: variant, quantity: 6 }]],
    [[{ variant_id: variant, quantity: 1 }], ['A', ...fresh().slice(1)]],
    [[{ variant_id: variant, quantity: 1 }], [customer[0], '123', ...customer.slice(2)]],
  ];
  for (const [items, c] of cases) assert.ok((await order(anon, items, c)).error, JSON.stringify(items));
  const { count: after } = await service.from('orders').select('*', { count: 'exact', head: true });
  assert.equal(after, before);
});

test('le stock baisse à la confirmation et revient à l\'annulation', async () => {
  const stock = async () => (await service.from('product_variants').select('stock').eq('id', variant).single()).data.stock;
  const start = await stock();
  const { data } = await order(anon, [{ variant_id: variant, quantity: 2 }]);
  const { data: row } = await service.from('orders').select('id').eq('number', data.number).single();
  assert.equal(await stock(), start);

  assert.ifError((await admin.rpc('set_order_status', { p_order_id: row.id, p_status: 'confirmee' })).error);
  assert.equal(await stock(), start - 2);

  assert.ifError((await admin.rpc('set_order_status', { p_order_id: row.id, p_status: 'annulee' })).error);
  assert.equal(await stock(), start);

  assert.ok((await admin.rpc('set_order_status', { p_order_id: row.id, p_status: 'confirmee' })).error);
  assert.equal(await stock(), start);
});

test('une confirmation échoue si le stock a disparu entre-temps', async () => {
  const { data } = await order(anon, [{ variant_id: variant, quantity: 3 }]);
  const { data: row } = await service.from('orders').select('id').eq('number', data.number).single();
  await service.from('product_variants').update({ stock: 1 }).eq('id', variant);
  assert.ok((await admin.rpc('set_order_status', { p_order_id: row.id, p_status: 'confirmee' })).error);
  const { data: after } = await service.from('orders').select('status, stock_applied').eq('id', row.id).single();
  assert.deepEqual(after, { status: 'nouvelle', stock_applied: false });
  await service.from('product_variants').update({ stock: 5 }).eq('id', variant);
});

test('l\'équipe modifie les frais de livraison mais pas le statut ni le montant en direct', async () => {
  const { data } = await order(anon, [{ variant_id: variant, quantity: 1 }]);
  const { data: row } = await service.from('orders').select('id, subtotal').eq('number', data.number).single();
  const fee = await admin.from('orders').update({ delivery_fee: 1500 }).eq('id', row.id).select('total').single();
  assert.ifError(fee.error);
  assert.equal(fee.data.total, row.subtotal + 1500);
  assert.ok((await admin.from('orders').update({ status: 'livree' }).eq('id', row.id)).error);
  assert.ok((await admin.from('orders').update({ subtotal: 0 }).eq('id', row.id)).error);
});

test('les tarifs sont publics en lecture et réservés à l\'équipe en écriture', async () => {
  const { data } = await anon.from('delivery_rates').select('id, fee');
  assert.ok(data.length >= 3);
  const before = data[0];
  assert.ok((await anon.from('delivery_rates').update({ fee: 1 }).eq('id', before.id).select()).error);
  const blocked = await stranger.from('delivery_rates').update({ fee: 1 }).eq('id', before.id).select();
  assert.equal(blocked.data?.length ?? 0, 0);
  const { data: same } = await anon.from('delivery_rates').select('fee').eq('id', before.id).single();
  assert.equal(same.fee, before.fee);
  const done = await admin.from('delivery_rates').update({ fee: before.fee + 1 }).eq('id', before.id).select();
  assert.equal(done.data.length, 1);
  await admin.from('delivery_rates').update({ fee: before.fee }).eq('id', before.id);
});

test('le bilan et les compteurs ne donnent rien hors de l\'équipe', async () => {
  assert.ok((await anon.rpc('sales_report', { p_days: 30 })).error);
  assert.ok((await anon.rpc('order_counts')).error);
  await service.from('product_variants').update({ stock: null }).eq('id', variant);
  assert.ifError((await order(anon, [{ variant_id: variant, quantity: 1 }])).error);
  const report = await stranger.rpc('sales_report', { p_days: 30 });
  assert.equal(report.data?.waiting ?? 0, 0);
  assert.deepEqual((await stranger.rpc('order_counts')).data ?? {}, {});
  const seen = await admin.rpc('sales_report', { p_days: 30 });
  assert.ok(seen.data.waiting >= 1);
  assert.equal(seen.data.days.length, 30);
});

test('une rubrique ne peut pas prendre l\'adresse d\'un univers', async () => {
  const { error } = await admin.from('categories').insert({ slug: 'femme', name: 'Femme', univers: ['femme'] });
  assert.ok(error);
  const wrong = await admin.from('categories').insert({ slug: 'essai', name: 'Essai', univers: ['enfants'] });
  assert.ok(wrong.error);
  const blocked = await stranger.from('categories').insert({ slug: 'essai-2', name: 'Essai', univers: ['femme'] });
  assert.ok(blocked.error);
});

test('personne ne peut créer de compte depuis le site', async () => {
  const { error } = await client().auth.signUp({ email: `libre-${Date.now()}@test.local`, password: 'motdepasse-test-1' });
  assert.ok(error);
});

const equipe = async (db, body) => {
  const token = db ? (await db.auth.getSession()).data.session.access_token : null;
  const res = await fetch(`${url}/functions/v1/equipe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.PUBLIC_SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test('seule l\'équipe gère les comptes, et un membre retiré perd l\'accès', async () => {
  assert.equal((await equipe(null, { action: 'list' })).status, 401);
  assert.equal((await equipe(stranger, { action: 'list' })).status, 403);
  assert.equal((await equipe(stranger, { action: 'add', email: 'pirate@test.local', password: 'motdepasse-test-1' })).status, 403);

  const mail = `membre-${Date.now()}@test.local`;
  assert.equal((await equipe(admin, { action: 'add', email: mail, password: 'court' })).status, 400);
  assert.equal((await equipe(admin, { action: 'add', email: mail, password: 'motdepasse-test-1' })).status, 200);
  assert.equal((await equipe(admin, { action: 'add', email: mail, password: 'motdepasse-test-1' })).status, 400);

  const { members } = (await equipe(admin, { action: 'list' })).body;
  const member = members.find((m) => m.email === mail);
  const self = members.find((m) => m.self);
  assert.ok(member && self);
  assert.equal((await equipe(admin, { action: 'remove', userId: self.id })).status, 400);
  assert.equal((await equipe(admin, { action: 'password', userId: self.id, password: 'motdepasse-test-2' })).status, 400);
  // Un compte sans droits n'est pas un membre : il ne peut pas être ciblé.
  const { data: outsider } = await stranger.auth.getUser();
  assert.equal((await equipe(admin, { action: 'remove', userId: outsider.user.id })).status, 404);

  assert.equal((await equipe(admin, { action: 'password', userId: member.id, password: 'motdepasse-test-2' })).status, 200);
  const colleague = client();
  assert.ifError((await colleague.auth.signInWithPassword({ email: mail, password: 'motdepasse-test-2' })).error);
  assert.equal((await colleague.rpc('is_admin')).data, true);

  assert.equal((await equipe(admin, { action: 'remove', userId: member.id })).status, 200);
  assert.ok((await client().auth.signInWithPassword({ email: mail, password: 'motdepasse-test-2' })).error);
});

test('l\'alerte en direct n\'arrive qu\'à l\'équipe', async () => {
  const listen = async (db) => {
    const seen = [];
    await db.realtime.setAuth();
    const channel = db.channel('commandes', { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, ({ payload }) => seen.push(payload));
    const status = await new Promise((resolve) => {
      channel.subscribe((s) => ['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s) && resolve(s));
    });
    return { seen, status, channel, db };
  };
  const [team, other, visitor] = [await listen(admin), await listen(stranger), await listen(anon)];
  // Écoute la table directement, comme le ferait un curieux.
  const curious = [];
  const open = anon.channel('curieux')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (e) => curious.push(e));
  await new Promise((resolve) => open.subscribe((s) => s === 'SUBSCRIBED' && resolve()));
  await new Promise((r) => setTimeout(r, 4000));
  await service.from('product_variants').update({ stock: null }).eq('id', variant);
  assert.ifError((await order(client(), [{ variant_id: variant, quantity: 1 }])).error);
  await new Promise((r) => setTimeout(r, 3000));
  await Promise.all([team, other, visitor].map((e) => e.db.removeChannel(e.channel)));
  await anon.removeChannel(open);
  assert.equal(team.status, 'SUBSCRIBED');
  assert.equal(team.seen.length, 1);
  assert.deepEqual(Object.keys(team.seen[0]).sort(), ['customer_name', 'id', 'number']);
  assert.notEqual(other.status, 'SUBSCRIBED');
  assert.notEqual(visitor.status, 'SUBSCRIBED');
  assert.equal(other.seen.length, 0);
  assert.equal(visitor.seen.length, 0);
  assert.equal(curious.length, 0);
});

const call = async (name, db, body) => {
  const token = db ? (await db.auth.getSession()).data.session?.access_token : null;
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.PUBLIC_SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test('le navigateur ne peut plus créer de commande sans passer la vérification anti-robot', async () => {
  const direct = { p_name: 'Bot', p_phone: '771112233', p_area: 'Mbao', p_note: '', p_payment: 'livraison', p_items: [{ variant_id: variant, quantity: 1 }] };
  assert.ok((await anon.rpc('create_order', direct)).error);
  assert.ok((await stranger.rpc('create_order', direct)).error);
  await service.from('product_variants').update({ stock: null }).eq('id', variant);
  const body = { name: 'Awa Diop', phone: '70 9000001', area: 'Petit Mbao', payment: 'livraison', items: [{ variant_id: variant, quantity: 1 }] };
  assert.equal((await call('commander', null, body)).status, 403);
  assert.equal((await call('commander', null, { ...body, token: '' })).status, 403);
  // La clé secrète de test de Cloudflare accepte n'importe quel jeton.
  const ok = await call('commander', null, { ...body, token: 'XXXX.DUMMY.TOKEN.XXXX' });
  assert.equal(ok.status, 200);
  assert.match(ok.body.number, /^TB-\d+$/);
  const wrong = await call('commander', null, { ...body, phone: '123', token: 'XXXX.DUMMY.TOKEN.XXXX' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /téléphone/i);
});

test('un même numéro ne peut pas passer plus de 5 commandes par heure', async () => {
  await service.from('product_variants').update({ stock: null }).eq('id', variant);
  const c = [customer[0], '70 8000001', ...customer.slice(2)];
  for (let i = 0; i < 5; i++) assert.ifError((await order(anon, [{ variant_id: variant, quantity: 1 }], c)).error);
  const { error } = await order(anon, [{ variant_id: variant, quantity: 1 }], c);
  assert.match(error?.message ?? '', /Trop de commandes/);
});

test('seule l\'équipe peut lancer la mise à jour du site, une fois toutes les 2 minutes', async () => {
  assert.equal((await call('publier', null, {})).status, 401);
  assert.equal((await call('publier', stranger, {})).status, 403);
  assert.ok((await stranger.from('site_builds').select('id')).data?.length === 0);
  const first = await call('publier', admin, {});
  assert.ok([200, 502, 503].includes(first.status), JSON.stringify(first));
  if (first.status === 200) assert.equal((await call('publier', admin, {})).status, 429);
});
