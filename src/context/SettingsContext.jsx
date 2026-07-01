import { createContext, useContext, useCallback } from 'react';
import { useFop } from './FopContext';

// SettingsContext тепер — тонка обгортка над активним ФОПом.
// Всі компоненти, що використовують useSettings(), продовжують
// працювати без змін. Дані живуть у FopContext (профіль ФОП),
// а не в окремому localStorage-ключі.

const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const { activeFop, updateFop } = useFop();

  const settings = {
    taxGroup:     activeFop?.taxGroup     ?? '3_5',
    isVatPayer:   activeFop?.isVatPayer   ?? false,
    useWarehouse: activeFop?.useWarehouse ?? false,
    useRRO:       activeFop?.useRRO       ?? false,
  };

  const setSettings = useCallback((updater) => {
    if (!activeFop) return;
    const next = typeof updater === 'function' ? updater(settings) : updater;
    updateFop(activeFop.id, next);
  }, [activeFop, updateFop, settings]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
