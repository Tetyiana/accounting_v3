import { supabase } from './supabase';
import { toRow, fromRow, newId } from './db';

// Шлях у bucket: {userId}/{fopId}/{entityType}/{timestamp}_{filename}
// Перший сегмент = userId, що збігається з RLS для storage.objects.

const safeName = (name) => name.replace(/[^\w.\-]+/g, '_').slice(-120);

export const uploadFile = async (file, { fopId, entityType, subfolder = '' }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Не авторизовано');
  const stamp = Date.now();
  const path = `${user.id}/${fopId}/${entityType}${subfolder ? '/' + subfolder : ''}/${stamp}_${safeName(file.name)}`;
  const { error } = await supabase.storage.from('files').upload(path, file, { upsert: false });
  if (error) throw error;
  return { path, filename: file.name, mime: file.type || '', size: file.size || 0 };
};

export const signedUrl = async (path, expiresIn = 3600) => {
  const { data, error } = await supabase.storage.from('files').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
};

export const removeFile = async (path) => {
  await supabase.storage.from('files').remove([path]);
};

// ── attachments (для будь-яких сутностей: транзакція, контрагент, документ) ──
export const listAttachments = async (entityType, entityId) => {
  const { data, error } = await supabase.from('attachments')
    .select('*').eq('entity_type', entityType).eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
};

export const attachFile = async (file, { fopId, entityType, entityId }) => {
  const up = await uploadFile(file, { fopId, entityType, subfolder: entityId });
  const item = {
    id: newId(), fopId, entityType, entityId,
    filename: up.filename, storagePath: up.path, mime: up.mime, size: up.size,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from('attachments').insert(toRow(item));
  if (error) { await removeFile(up.path); throw error; }
  return item;
};

export const detachFile = async (attachmentId, storagePath) => {
  if (storagePath) await removeFile(storagePath);
  await supabase.from('attachments').delete().eq('id', attachmentId);
};

// ── fop_documents (статутні документи ФОПа) ──
export const FOP_DOC_CATEGORIES = [
  { id: 'passport',    label: 'Паспорт' },
  { id: 'rnokpp',      label: 'РНОКПП / ІПН' },
  { id: 'ep_extract',  label: 'Витяг з реєстру ЄП' },
  { id: 'vat_cert',    label: 'Свідоцтво платника ПДВ' },
  { id: 'license',     label: 'Ліцензія / дозвіл' },
  { id: 'requisites',  label: 'Реквізити' },
  { id: 'contract',    label: 'Договір' },
  { id: 'other',       label: 'Інше' },
];

export const listFopDocuments = async (fopId) => {
  const { data, error } = await supabase.from('fop_documents')
    .select('*').eq('fop_id', fopId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(fromRow);
};

export const addFopDocument = async (file, { fopId, category, title }) => {
  const up = await uploadFile(file, { fopId, entityType: 'fop_docs', subfolder: category });
  const item = {
    id: newId(), fopId, category, title: title || file.name,
    filename: up.filename, storagePath: up.path, mime: up.mime, size: up.size,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from('fop_documents').insert(toRow(item));
  if (error) { await removeFile(up.path); throw error; }
  return item;
};

export const removeFopDocument = async (id, storagePath) => {
  if (storagePath) await removeFile(storagePath);
  await supabase.from('fop_documents').delete().eq('id', id);
};

// Завантаження факсиміле/печатки в fops
export const uploadFacsimile = async (file, { fopId, kind }) => {
  // kind: 'stamp' | 'signature'
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Не авторизовано');
  const path = `${user.id}/${fopId}/facsimile/${kind}_${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`;
  const { error } = await supabase.storage.from('files').upload(path, file, { upsert: true });
  if (error) throw error;
  const col = kind === 'stamp' ? 'stamp_path' : 'signature_path';
  await supabase.from('fops').update({ [col]: path }).eq('id', fopId);
  return path;
};
