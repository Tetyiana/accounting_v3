import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useFop } from '../../context/FopContext';

import HomeView      from '../../views/HomeView';
import JournalView   from '../../views/JournalView';
import WarehouseView from '../../views/WarehouseView';
import DebtorsView   from '../../views/DebtorsView';
import SalesView     from '../../views/SalesView';
import KdvView       from '../../views/KdvView';
import DirectoriesView from '../../views/DirectoriesView';
import RegistryView from '../../views/RegistryView';
import DpsView from '../../views/DpsView';
import AccountingView from '../../views/AccountingView';
import PricingView from '../../views/PricingView';
import RroView from '../../views/RroView';
import DocumentsView from '../../views/DocumentsView';
import ReportsView   from '../../views/ReportsView';
import VatView       from '../../views/VatView';
import SettingsView  from '../../views/SettingsView';
import TrashView     from '../../views/TrashView';
import PayrollView   from '../../views/PayrollView';
import FopProfileView from '../../views/FopProfileView';
import ContractsView from '../../views/ContractsView';
import HelpView from '../../views/HelpView';
import SupportView from '../../views/SupportView';

const TABS = [
  { id: 'home',      label: 'Головна',           icon: '⌂', group: 'main' },
  { id: 'journal',   label: 'Банк / Каса',            icon: '₴', group: 'main' },
  { id: 'sales',       label: 'Продажі/Закупівлі',  icon: '🗒', group: 'main' },
  { id: 'contracts',   label: 'Договори',            icon: '📄', group: 'main' },
  { id: 'debtors',     label: 'Дебітори/Кредитори', icon: '⇄', group: 'main' },
  { id: 'registry',    label: 'Книга КОГО',          icon: '📒', group: 'main' },
  { id: 'directories', label: 'Довідники',           icon: '📋', group: 'main' },
  { id: 'warehouse', label: 'Склад',              icon: '▢', group: 'main', setting: 'useWarehouse' },
  { id: 'payroll',   label: 'Зарплата',           icon: '👥', group: 'main' },
  { id: 'kdv',       label: 'Книга доходів',      icon: '📒', group: 'main' },
  { id: 'accounting',  label: 'Бухгалтерія',         icon: '📐', group: 'main' },
  { id: 'dps',         label: 'Звітність ДПС',       icon: '🏛', group: 'main' },
  { id: 'reports',   label: 'Звіти',              icon: '▥', group: 'main' },
  { id: 'vat',       label: 'ПДВ',                icon: '%', group: 'main', setting: 'isVatPayer' },
  { id: 'rro',       label: 'РРО / Каса',         icon: '🖨', group: 'main', setting: 'useRRO' },
  { id: 'help',        label: 'Інструкція',          icon: 'ℹ', group: 'bottom' },
  { id: 'support',     label: 'Підтримка',           icon: '🛟', group: 'bottom' },
  { id: 'pricing',     label: 'Тарифи',              icon: '💳', group: 'bottom' },
  { id: 'trash',     label: 'Кошик',              icon: '🗑', group: 'bottom' },
  { id: 'settings',  label: 'Налаштування',       icon: '⚙', group: 'bottom' },
];

const RroPlaceholder = () => (
  <div className="view-placeholder">
    <div className="placeholder-icon">🖨</div>
    <h3>РРО / ПРРО (Checkbox)</h3>
    <p>Модуль у розробці. Credentials налаштовуються у профілі ФОП.</p>
  </div>
);

const VIEWS = {
  home:      (props) => <HomeView {...props} />,
  journal:   ()     => <JournalView />,
  sales:     ()     => <SalesView />,
  debtors:     ()     => <DebtorsView />,
  directories: ()     => <DirectoriesView />,
  registry:    ()     => <RegistryView />,
  warehouse: ()     => <WarehouseView />,
  payroll:   ()     => <PayrollView />,
  documents: ()     => <DocumentsView />,
  reports:   ()     => <ReportsView />,
  vat:       ()     => <VatView />,
  rro:       ()     => <RroView />,
  trash:     ()     => <TrashView />,
  settings:  ()     => <SettingsView />,
  kdv:       ()     => <KdvView />,
  accounting:()     => <AccountingView />,
  dps:       ()     => <DpsView />,
  pricing:   ()     => <PricingView />,
  contracts: ()     => <ContractsView />,
  help:      ()     => <HelpView />,
  support:   ()     => <SupportView />,
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
};

const MainLayout = () => {
  const { user, logout }    = useAuth();
  const { settings }        = useSettings();
  const { activeFop, fops, setActiveFop } = useFop();
  const [active, setActive] = useState('home');
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [fopDropdown, setFopDropdown] = useState(false);
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectTab = (id) => {
    setActive(id);
    if (isMobile) setDrawerOpen(false);
  };

  const visibleTabs = TABS.filter(t => {
    if (t.setting) return settings[t.setting];
    return true;
  });

  const mainTabs   = visibleTabs.filter(t => t.group === 'main');
  const bottomTabs = visibleTabs.filter(t => t.group === 'bottom');

  const renderView = () => {
    if (active === 'fop-new') {
      return <FopProfileView mode="create" onCancel={() => setActive('home')} />;
    }
    const fn = VIEWS[active];
    return fn ? fn({ setActiveTab: setActive }) : null;
  };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()
    : '?';

  return (
    <div className={`main-layout${sideCollapsed && !isMobile ? ' sidebar-collapsed' : ''}${isMobile ? ' is-mobile' : ''}`}>

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          {isMobile ? (
            <button className="hamburger-btn" onClick={() => setDrawerOpen(true)} title="Меню">☰</button>
          ) : (
            <button className="sidebar-toggle" onClick={() => setSideCollapsed(p => !p)} title="Згорнути меню">
              {sideCollapsed ? '▶' : '◀'}
            </button>
          )}
          <span className="header-logo">Облік ФОП</span>

          {/* ─── Перемикач ФОП (як вибір компанії в 1С) ──── */}
          <div className="fop-switcher" style={{position:'relative'}}>
            <button
              className="fop-switcher-btn"
              onClick={() => setFopDropdown(p => !p)}
              title="Змінити ФОП"
            >
              <span className="fop-switcher-name">
                {activeFop?.fullName || 'ФОП'}
              </span>
              <span className="fop-switcher-chevron">{fopDropdown ? '▲' : '▼'}</span>
            </button>

            {fopDropdown && (
              <>
                <div className="fop-dropdown-backdrop" onClick={() => setFopDropdown(false)} />
                <div className="fop-dropdown">
                  {fops.map(f => (
                    <button
                      key={f.id}
                      className={`fop-dropdown-item${f.id === activeFop?.id ? ' fop-dropdown-item--active' : ''}`}
                      onClick={() => { setActiveFop(f.id); setFopDropdown(false); }}
                    >
                      <span className="fop-dropdown-avatar">{f.fullName?.charAt(0) || 'Ф'}</span>
                      <div>
                        <div>{f.fullName || 'Без назви'}</div>
                        <div className="fop-dropdown-meta">{f.rnokpp}</div>
                      </div>
                      {f.id === activeFop?.id && <span>✓</span>}
                    </button>
                  ))}
                  <div className="fop-dropdown-divider" />
                  <button
                    className="fop-dropdown-item fop-dropdown-item--add"
                    onClick={() => { setFopDropdown(false); setActive('fop-new'); }}
                  >
                    + Додати ФОП
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="header-right">
          <div className="user-badge">
            <span className="user-avatar">{initials}</span>
            <span className="user-name">{user?.name}</span>
          </div>
          <button className="btn btn--ghost btn--sm"
            onClick={() => window.confirm('Вийти з облікового запису?') && logout()}>
            Вийти
          </button>
        </div>
      </header>

      {/* ─── Sidebar ────────────────────────────────────────── */}
      {!isMobile && (
      <aside className="sidebar">
        <nav className="sidebar-nav">
          <div className="sidebar-group">
            {mainTabs.map(tab => (
              <button
                key={tab.id}
                className={`sidebar-item${active === tab.id ? ' sidebar-item--active' : ''}`}
                onClick={() => selectTab(tab.id)}
                title={tab.label}
              >
                <span className="sidebar-item-icon">{tab.icon}</span>
                <span className="sidebar-item-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-bottom">
          {bottomTabs.map(tab => (
            <button
              key={tab.id}
              className={`sidebar-item${active === tab.id ? ' sidebar-item--active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              <span className="sidebar-item-icon">{tab.icon}</span>
              <span className="sidebar-item-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </aside>
      )}

      {isMobile && drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="sidebar sidebar--drawer">
            <div className="drawer-header">
              <span className="header-logo">Облік ФОП</span>
              <button className="btn-close" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>
        <nav className="sidebar-nav">
          <div className="sidebar-group">
            {mainTabs.map(tab => (
              <button
                key={tab.id}
                className={`sidebar-item${active === tab.id ? ' sidebar-item--active' : ''}`}
                onClick={() => selectTab(tab.id)}
                title={tab.label}
              >
                <span className="sidebar-item-icon">{tab.icon}</span>
                <span className="sidebar-item-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-bottom">
          {bottomTabs.map(tab => (
            <button
              key={tab.id}
              className={`sidebar-item${active === tab.id ? ' sidebar-item--active' : ''}`}
              onClick={() => selectTab(tab.id)}
            >
              <span className="sidebar-item-icon">{tab.icon}</span>
              <span className="sidebar-item-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </aside>
        </>
      )}

      {/* ─── Content ────────────────────────────────────────── */}
      <main className="content-area">
        {renderView()}
      </main>

    </div>
  );
};

export default MainLayout;
