import React from 'react';
import { useAuth } from './context/AuthContext';
import { FopProvider, useFop } from './context/FopContext';
import { SettingsProvider } from './context/SettingsContext';
import { DataProvider } from './context/DataContext';
import AuthPage from './pages/AuthPage';
import FopSelectView from './views/FopSelectView';
import FopProfileView from './views/FopProfileView';
import MainLayout from './components/Layout/MainLayout';

// Внутрішній компонент — після логіну, в межах FopProvider.
const AppWithFop = () => {
  const { fops, activeFop } = useFop();

  // Немає жодного ФОП — одразу на створення першого.
  if (fops.length === 0) return <FopProfileView mode="create" isFirst />;

  // ФОПи є, але жоден не вибраний — показуємо вибірник (як у 1С).
  if (!activeFop) return <FopSelectView />;

  // Активний ФОП є — основний інтерфейс.
  return (
    <SettingsProvider>
      <DataProvider fopId={activeFop.id}>
        <MainLayout />
      </DataProvider>
    </SettingsProvider>
  );
};

const App = () => {
  const { user } = useAuth();
  if (!user) return <AuthPage />;
  return (
    <FopProvider userId={user.id}>
      <AppWithFop />
    </FopProvider>
  );
};

export default App;
