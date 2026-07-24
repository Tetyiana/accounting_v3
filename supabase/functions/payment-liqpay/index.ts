// LiqPay checkout для підписок «Облік ФОП».
// Дві дії:
//   POST /payment-liqpay {action:'create', fop_id, months, modules[]}
//     → повертає {data, signature} для форми LiqPay Checkout.
//   POST /payment-liqpay?callback  (server_url від LiqPay, форм-дані data+signature)
//     → перевіряє підпис, оновлює active_until у subscriptions.
//
// Секрети функції (Supabase → Functions → Secrets):
//   LIQPAY_PUBLIC_KEY   (sandbox_i… для тесту, i… для продакшену)
//   LIQPAY_PRIVATE_KEY  (парний до public)
//   PUBLIC_APP_URL      (наприклад https://tetyiana.github.io) — куди повертати після оплати
// Verify JWT: вимкнути (callback ходить без токена; для create перевіряємо самі).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...CORS } })

const PRICES: Record<string, number> = { base: 100, warehouse: 50, payroll: 100, vat: 75, rro: 50 };

// LiqPay-підпис: base64(sha1(private + data + private))
const sign = async (privateKey: string, data: string) => {
  const enc = new TextEncoder().encode(privateKey + data + privateKey);
  const hash = await crypto.subtle.digest('SHA-1', enc);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
};

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const b64d = (s: string) => decodeURIComponent(escape(atob(s)));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url);
  const isCallback = url.searchParams.has('callback');

  const publicKey = Deno.env.get('LIQPAY_PUBLIC_KEY');
  const privateKey = Deno.env.get('LIQPAY_PRIVATE_KEY');
  const appUrl = Deno.env.get('PUBLIC_APP_URL') ?? 'https://tetyiana.github.io';
  if (!publicKey || !privateKey) return json({ ok: false, error: 'LiqPay-ключі не задані у секретах функції' })

  // ─── CALLBACK від LiqPay ──────────────────────────────────────
  if (isCallback) {
    const form = await req.formData();
    const data = String(form.get('data') || '');
    const signature = String(form.get('signature') || '');
    if (!data || !signature) return json({ ok: false, error: 'bad callback' }, 400);
    const expected = await sign(privateKey, data);
    if (expected !== signature) return json({ ok: false, error: 'bad signature' }, 400);
    const payload = JSON.parse(b64d(data));
    const orderId = payload.order_id;
    if (!orderId) return json({ ok: false, error: 'no order_id' }, 400);

    const { data: pending } = await db.from('pending_payments').select('*').eq('order_id', orderId).single();
    if (!pending) return json({ ok: false, error: 'unknown order' }, 404);

    const ok = ['success', 'sandbox', 'wait_accept'].includes(payload.status);
    if (!ok) {
      await db.from('pending_payments').update({ status: 'failed', processed_at: new Date().toISOString() }).eq('order_id', orderId);
      return json({ ok: true });
    }

    const until = new Date();
    until.setMonth(until.getMonth() + pending.months);
    const untilStr = until.toISOString().slice(0, 10);

    for (const mod of pending.modules) {
      const { data: existing } = await db.from('subscriptions')
        .select('id, active_until').eq('fop_id', pending.fop_id).eq('module', mod).maybeSingle();
      // Якщо активний до пізнішої дати — продовжуємо від неї; інакше від сьогодні
      const base = existing?.active_until && new Date(existing.active_until) > new Date()
        ? new Date(existing.active_until) : new Date();
      base.setMonth(base.getMonth() + pending.months);
      const newUntil = base.toISOString().slice(0, 10);
      if (existing) {
        await db.from('subscriptions').update({ active_until: newUntil }).eq('id', existing.id);
      } else {
        await db.from('subscriptions').insert({ fop_id: pending.fop_id, module: mod, active_until: newUntil });
      }
    }
    await db.from('pending_payments').update({
      status: payload.status === 'sandbox' ? 'sandbox' : 'success',
      processed_at: new Date().toISOString(),
    }).eq('order_id', orderId);
    return json({ ok: true, active_until: untilStr });
  }

  // ─── CREATE payment ──────────────────────────────────────────
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') ?? 'sb_publishable_h-f0UaUZVyXjeD9Rj2T7-w_B97wydX1');
  const { data: { user } } = await anon.auth.getUser(auth);
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { fop_id, months, modules } = body as { fop_id: string; months: number; modules: string[] };
  if (!fop_id || !months || !Array.isArray(modules) || modules.length === 0)
    return json({ ok: false, error: 'fop_id, months, modules[] required' }, 400);

  // Перевірка, що ФОП належить користувачу
  const { data: fop } = await db.from('fops').select('id, full_name').eq('id', fop_id).eq('user_id', user.id).single();
  if (!fop) return json({ ok: false, error: 'ФОП не знайдено' }, 404);

  const amount = modules.reduce((s, m) => s + (PRICES[m] || 0), 0) * months;
  if (amount <= 0) return json({ ok: false, error: 'сума 0' }, 400);

  const orderId = `sub_${user.id.slice(0, 8)}_${Date.now()}`;
  await db.from('pending_payments').insert({
    order_id: orderId, user_id: user.id, fop_id, modules, months, amount,
  });

  const payload = {
    public_key: publicKey,
    version: '3',
    action: 'pay',
    amount, currency: 'UAH',
    description: `Облік ФОП: ${modules.join(', ')} × ${months} міс — ${fop.full_name || ''}`,
    order_id: orderId,
    server_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-liqpay?callback=1`,
    result_url: `${appUrl}/?pay=ok`,
    sandbox: publicKey.startsWith('sandbox_') ? 1 : 0,
  };
  const data = b64(JSON.stringify(payload));
  const signature = await sign(privateKey, data);
  return json({ ok: true, data, signature, order_id: orderId, amount });
})
