import React, { createContext, useContext, useState } from 'react';
import { hashPassword, verifyPassword } from '../utils/crypto';

// AuthContext відповідає лише за обліковий запис (логін/реєстрація/вихід).
// Дані ФОП (реквізити, налаштування) — у FopContext.

const AuthContext = createContext();

const USERS_KEY   = 'fop_users';
const CURRENT_KEY = 'fop_current';

const getUsers = () => {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
  catch { return []; }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null'); }
    catch { return null; }
  });

  // Реєстрація: тільки ім'я + email + пароль. ФОП додається окремо.
  const register = async ({ name, email, password }) => {
    const users = getUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: 'Цей email вже зареєстровано' };
    }
    const id           = Date.now().toString();
    const passwordHash = await hashPassword(password);
    const newUser      = { id, name, email: email.toLowerCase(), passwordHash };
    localStorage.setItem(USERS_KEY, JSON.stringify([...users, newUser]));
    const safe = { id, name, email: newUser.email };
    localStorage.setItem(CURRENT_KEY, JSON.stringify(safe));
    setUser(safe);
    return { ok: true };
  };

  const login = async (email, password) => {
    const found = getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!found) return { ok: false, error: 'Невірний email або пароль' };

    const valid = found.passwordHash
      ? await verifyPassword(password, found.passwordHash)
      : found.password === password;
    if (!valid) return { ok: false, error: 'Невірний email або пароль' };

    // Тиха міграція зі старої схеми (відкритий пароль → хеш).
    if (!found.passwordHash) {
      const passwordHash = await hashPassword(password);
      const migrated = getUsers().map(u =>
        u.id === found.id ? { ...u, passwordHash, password: undefined } : u
      );
      localStorage.setItem(USERS_KEY, JSON.stringify(migrated));
    }

    const { password: _p, passwordHash: _h, ...safe } = found;
    localStorage.setItem(CURRENT_KEY, JSON.stringify(safe));
    setUser(safe);
    return { ok: true };
  };

  const logout = () => {
    localStorage.removeItem(CURRENT_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
