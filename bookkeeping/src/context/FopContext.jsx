import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { EMPTY_FOP } from '../constants/fopFields';

const FopContext = createContext();

// Ключі localStorage — ізольовані по userId, щоб бухгалтер міг мати
// кількох клієнтів-ФОП під одним логіном.
const FOPS_KEY        = (uid) => `fop_list_${uid}`;
const ACTIVE_FOP_KEY  = (uid) => `fop_active_${uid}`;

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)); }
  catch { return fallback; }
};

export const FopProvider = ({ userId, children }) => {
  const fopsKey       = useMemo(() => FOPS_KEY(userId),       [userId]);
  const activeFopKey  = useMemo(() => ACTIVE_FOP_KEY(userId), [userId]);

  const [fops, setFops] = useState(() => load(fopsKey, []));
  const [activeFopId, setActiveFopIdState] = useState(() =>
    localStorage.getItem(activeFopKey) || null
  );

  const persist = useCallback((list) => {
    localStorage.setItem(fopsKey, JSON.stringify(list));
    setFops(list);
  }, [fopsKey]);

  // ─── Активний ФОП ─────────────────────────────────────────
  const activeFop = useMemo(
    () => fops.find(f => f.id === activeFopId) || null,
    [fops, activeFopId]
  );

  const setActiveFop = useCallback((fopId) => {
    localStorage.setItem(activeFopKey, fopId);
    setActiveFopIdState(fopId);
  }, [activeFopKey]);

  // ─── CRUD ──────────────────────────────────────────────────
  const addFop = useCallback((data) => {
    const newFop = {
      ...EMPTY_FOP,
      ...data,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    const updated = [...fops, newFop];
    persist(updated);
    setActiveFop(newFop.id);
    return newFop;
  }, [fops, persist, setActiveFop]);

  const updateFop = useCallback((fopId, patch) => {
    const updated = fops.map(f => f.id === fopId ? { ...f, ...patch } : f);
    persist(updated);
  }, [fops, persist]);

  const deleteFop = useCallback((fopId) => {
    const updated = fops.filter(f => f.id !== fopId);
    persist(updated);
    if (activeFopId === fopId) {
      const next = updated[0]?.id || null;
      if (next) setActiveFop(next);
      else { localStorage.removeItem(activeFopKey); setActiveFopIdState(null); }
    }
  }, [fops, persist, activeFopId, activeFopKey, setActiveFop]);

  return (
    <FopContext.Provider value={{
      fops, activeFop, activeFopId,
      setActiveFop, addFop, updateFop, deleteFop,
    }}>
      {children}
    </FopContext.Provider>
  );
};

export const useFop = () => useContext(FopContext);
