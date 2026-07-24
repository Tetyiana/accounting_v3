// AI-асистент техпідтримки Облік ФОП.
// Деплой: Supabase → Edge Functions → нова функція support-ai, Verify JWT ВИМКНУТИ.
// Секрети: ANTHROPIC_API_KEY (console.anthropic.com → API Keys).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

const SYSTEM = `Ти — AI-асистент технічної підтримки застосунку «Облік ФОП» — бухгалтерії для українських ФОП (спрощена система). Модулі: журнал операцій (банк/каса, імпорт виписки ПриватБанк CSV), продажі/закупівлі (рахунки, накладні, акти з друком), дебітори/кредитори, реєстр документів, довідники контрагентів, склад, зарплата (аванс+остаточна, накази), КДВ (книга доходів), спрощений бухоблік (шахматка, журнал-ордери), звітність ДПС (декларація ЄП з друком), ПДВ (реєстри ПН, декларація), ПРРО через Checkbox (зміни, X/Z-звіти, фіскалізація чеків), звіти (стан розрахунків з бюджетом), тарифи по модулях. Стек: React PWA на GitHub Pages, база Supabase (RLS по користувачу).
Ключова методологія: касовий метод — дохід і сплата податків визнаються ТІЛЬКИ з реальних операцій банк/каса; сплата зарплатних податків — лише операцією на ДПС/ПФУ.
Відповідай українською, коротко і по суті. Якщо проблема схожа на кеш браузера/PWA — порадь повністю закрити ВСІ вкладки застосунку і відкрити знову. Якщо записи «зникли» — можлива причина: ФОП створений до оновлення бази, порадь перевірити зі свіжоствореним ФОПом. Якщо потрібна зміна коду — чесно скажи, що це передасться розробнику, і сформулюй проблему для нього. Не вигадуй функцій, яких немає.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ ok: false, error: 'Секрет ANTHROPIC_API_KEY не заданий' })

  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') ?? 'sb_publishable_h-f0UaUZVyXjeD9Rj2T7-w_B97wydX1')
  const { data: { user } } = await anon.auth.getUser(auth)
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

  const { ticket_id } = await req.json().catch(() => ({}))
  if (!ticket_id) return json({ ok: false, error: 'ticket_id required' }, 400)

  const { data: t } = await db.from('support_tickets').select('*').eq('id', ticket_id).single()
  const { data: msgs } = await db.from('support_messages').select('*').eq('ticket_id', ticket_id).order('created_at')
  if (!t) return json({ ok: false, error: 'ticket not found' }, 404)

  const history = [
    { role: 'user', content: `Звернення${t.page ? ` (розділ: ${t.page})` : ''}: ${t.title}\n${t.description || ''}` },
    ...(msgs || []).map((m) => ({ role: m.author === 'user' ? 'user' : 'assistant', content: m.body })),
  ]
  const merged: { role: string; content: string }[] = []
  for (const m of history) {
    if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += '\n' + m.content
    else merged.push({ ...m })
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: SYSTEM, messages: merged }),
  })
  const data = await r.json()
  const text = (data?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim()
  if (!text) return json({ ok: false, error: data?.error?.message || 'Порожня відповідь AI' })

  await db.from('support_messages').insert({ ticket_id, author: 'assistant', body: text })
  if (t.status === 'new') await db.from('support_tickets').update({ status: 'answered' }).eq('id', ticket_id)
  return json({ ok: true })
})
