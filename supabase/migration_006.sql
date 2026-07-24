-- Migration 006: РК тримає посилання на ПН, до якої складено коригування
-- (номер + дата коригованої ПН для XML F1201213)
alter table vat_invoices add column if not exists corrected_number text default '';
alter table vat_invoices add column if not exists corrected_date date;
alter table vat_invoices add column if not exists correction_reason text default '';
