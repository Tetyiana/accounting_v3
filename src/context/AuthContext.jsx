import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Автентифікація через Supabase Auth (email + пароль).
// user: { id, email, name } — name зберігається в user_metadata.

const AuthContext = createContext();

const toSafeUser = (sbUser) => sbUser ? {
  id:    sbUser.id,
  email: sbUser.email,
  name:  sbUser.user_metadata?.name || sbUser.email,
} : null;

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(toSafeUser(session?.user));
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(toSafeUser(session?.user));
    });
    return () => subscription.unsubscribe();
  }, []);

  const register = async ({ name, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { name } },
    });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    // Якщо email-підтвердження вимкнено — сесія є одразу
    if (data.session) setUser(toSafeUser(data.user));
    else return { ok: false, error: 'Лист підтвердження надіслано на ' + email + '. Підтвердіть пошту і увійдіть.' };
    return { ok: true };
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    setUser(toSafeUser(data.user));
    return { ok: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh',
                  fontFamily:'system-ui', color:'#4a6b62' }}>
      Завантаження…
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const translateAuthError = (msg) => {
  if (/invalid login credentials/i.test(msg)) return 'Невірний email або пароль';
  if (/already registered/i.test(msg))        return 'Цей email вже зареєстровано';
  if (/at least 6 characters/i.test(msg))     return 'Пароль має бути щонайменше 6 символів';
  if (/rate limit|only request this after/i.test(msg)) return 'Забагато спроб — зачекайте хвилину і спробуйте увійти (реєстрація вже могла пройти)';
  if (/email not confirmed/i.test(msg))       return 'Email не підтверджено — перевірте пошту (лист від Supabase) або зверніться до адміністратора';
  return msg;
};

export const useAuth = () => useContext(AuthContext);
