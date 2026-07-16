import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { EMPTY_FOP } from '../constants/fopFields';
import { dbSelect, dbInsert, dbUpdate, dbDelete, newId } from '../lib/db';

const FopContext = createContext();
const ACTIVE_KEY = (uid) => `fop_active_${uid}`;   // вибір активного — локальна зручність

export const FopProvider = ({ userId, children }) => {
  const [fops, setFops]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFopId, setActiveFopIdState] = useState(() =>
    localStorage.getItem(ACTIVE_KEY(userId)) || null
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    dbSelect('fops', { userId }).then(list => {
      if (!alive) return;
      setFops(list);
      // якщо збережений активний не існує — беремо перший
      const savedId = localStorage.getItem(ACTIVE_KEY(userId));
      if (!list.find(f => f.id === savedId)) {
        const first = list[0]?.id || null;
        setActiveFopIdState(first);
        if (first) localStorage.setItem(ACTIVE_KEY(userId), first);
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [userId]);

  const activeFop = fops.find(f => f.id === activeFopId) || null;

  const setActiveFop = useCallback((fopId) => {
    localStorage.setItem(ACTIVE_KEY(userId), fopId);
    setActiveFopIdState(fopId);
  }, [userId]);

  const addFop = useCallback((data) => {
    const newFop = {
      ...EMPTY_FOP, ...data,
      id: newId(), userId,
      createdAt: new Date().toISOString(),
    };
    setFops(p => [...p, newFop]);
    dbInsert('fops', newFop);
    setActiveFop(newFop.id);
    return newFop;
  }, [userId, setActiveFop]);

  const updateFop = useCallback((fopId, patch) => {
    setFops(p => p.map(f => f.id === fopId ? { ...f, ...patch } : f));
    const { id, userId: _u, createdAt: _c, ...clean } = patch;
    dbUpdate('fops', fopId, clean);
  }, []);

  const deleteFop = useCallback((fopId) => {
    setFops(p => {
      const updated = p.filter(f => f.id !== fopId);
      if (activeFopId === fopId) {
        const next = updated[0]?.id || null;
        if (next) setActiveFop(next);
        else { localStorage.removeItem(ACTIVE_KEY(userId)); setActiveFopIdState(null); }
      }
      return updated;
    });
    dbDelete('fops', fopId);   // каскадно видаляє всі дані ФОПа (on delete cascade)
  }, [activeFopId, setActiveFop, userId]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh',
                  fontFamily:'system-ui', color:'#4a6b62' }}>
      Завантаження даних…
    </div>
  );

  return (
    <FopContext.Provider value={{ fops, activeFop, activeFopId, setActiveFop, addFop, updateFop, deleteFop }}>
      {children}
    </FopContext.Provider>
  );
};

export const useFop = () => useContext(FopContext);
