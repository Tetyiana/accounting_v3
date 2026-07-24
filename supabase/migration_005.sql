-- Migration 005: платежі підписок через LiqPay
-- Виконати в Supabase → SQL Editor.

create table if not exists pending_payments (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  fop_id uuid not null references fops(id) on delete cascade,
  modules text[] not null,          -- ['base','vat',...]
  months int not null default 1,
  amount numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','success','failed','sandbox')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

grant all on pending_payments to authenticated;
grant all on pending_payments to service_role;
alter table pending_payments enable row level security;

drop policy if exists pending_payments_owner on pending_payments;
create policy pending_payments_owner on pending_payments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- base-модуль треба зберігати в subscriptions, як і інші, щоб мати active_until
-- (раніше base не додавався взагалі). Це робить payment-liqpay при першій успішній оплаті.
