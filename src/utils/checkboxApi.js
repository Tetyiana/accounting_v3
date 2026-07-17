// Інтеграція з ПРРО Checkbox (api.checkbox.ua, API v1).
// Авторизація касира логіном/паролем + ліцензійний ключ каси в заголовку.
// Токен живе в sessionStorage (до закриття вкладки).

const BASE = 'https://api.checkbox.ua/api/v1';
const TOKEN_KEY = 'checkbox_token';

const headers = (licenseKey, withAuth = true) => {
  const h = { 'Content-Type': 'application/json', 'X-Client-Name': 'oblik-fop', 'X-Client-Version': '1.0' };
  if (licenseKey) h['X-License-Key'] = licenseKey;
  const t = sessionStorage.getItem(TOKEN_KEY);
  if (withAuth && t) h['Authorization'] = `Bearer ${t}`;
  return h;
};

const call = async (path, { method = 'GET', body, licenseKey, withAuth = true } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: headers(licenseKey, withAuth),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.detail?.[0]?.msg || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
};

export const cbSignIn = async (login, password) => {
  const data = await call('/cashier/signin', {
    method: 'POST', withAuth: false, body: { login, password },
  });
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
  return data;
};

export const cbSignedIn = () => !!sessionStorage.getItem(TOKEN_KEY);
export const cbSignOut = () => sessionStorage.removeItem(TOKEN_KEY);

// Поточна зміна касира: null якщо закрита
export const cbCurrentShift = async (licenseKey) => {
  try {
    const s = await call('/cashier/shift', { licenseKey });
    return s && s.status === 'OPENED' ? s : null;
  } catch { return null; }
};

export const cbOpenShift = (licenseKey) =>
  call('/shifts', { method: 'POST', licenseKey, body: {} });

// Z-звіт: закриття зміни
export const cbCloseShift = (licenseKey) =>
  call('/shifts/close', { method: 'POST', licenseKey, body: { skip_client_name_check: true } });

// X-звіт (проміжний, без закриття)
export const cbXReport = (licenseKey) =>
  call('/reports', { method: 'POST', licenseKey, body: {} });

// Чек продажу. items: [{name, price(грн), qty}], payment: 'CASH'|'CARD'
export const cbSellReceipt = (licenseKey, items, payment, total) =>
  call('/receipts/sell', {
    method: 'POST', licenseKey,
    body: {
      goods: items.map(it => ({
        good: { name: it.name, price: Math.round(it.price * 100), code: it.code || it.name.slice(0, 20) },
        quantity: Math.round((+it.qty || 1) * 1000),
      })),
      payments: [{ type: payment === 'CASH' ? 'CASH' : 'CASHLESS', value: Math.round(total * 100) }],
    },
  });

export const receiptUrl = (id) => `https://check.checkbox.ua/${id}`;
