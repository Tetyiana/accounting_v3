// Хешування пароля на клієнті через Web Crypto API.
// Це НЕ замінює повноцінний бекенд із серверною авторизацією — для локального,
// однокористувацького застосунку (дані живуть лише в localStorage конкретного
// браузера) це прибирає найгрубішу проблему: пароль більше не лежить у
// відкритому вигляді поруч із даними.

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const randomSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);

const sha256 = async (text) => {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
};

export const hashPassword = async (password) => {
  const salt = randomSalt();
  const hash = await sha256(salt + password);
  return `${salt}:${hash}`;
};

export const verifyPassword = async (password, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = await sha256(salt + password);
  return check === hash;
};
