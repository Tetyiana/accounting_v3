import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const INIT_LOGIN = { email: '', password: '' };
const INIT_REG   = { name: '', email: '', password: '', confirm: '' };

const AuthPage = () => {
  const { login, register } = useAuth();
  const [mode, setMode]     = useState('login');
  const [form, setForm]     = useState(INIT_LOGIN);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (m) => { setMode(m); setError(''); setForm(m === 'login' ? INIT_LOGIN : INIT_REG); };
  const set = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleLogin = async () => {
    if (!form.email || !form.password) { setError('Заповніть усі поля'); return; }
    setLoading(true);
    const res = await login(form.email, form.password);
    setLoading(false);
    if (!res.ok) setError(res.error);
  };

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password || !form.confirm) {
      setError('Заповніть усі поля'); return;
    }
    if (form.password !== form.confirm) { setError('Паролі не збігаються'); return; }
    if (form.password.length < 6) { setError('Пароль — мінімум 6 символів'); return; }
    setLoading(true);
    const res = await register(form);
    setLoading(false);
    if (!res.ok) setError(res.error);
    // Після реєстрації App.jsx покаже FopProfileView для створення першого ФОП.
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">Ф</span>
          <div>
            <div className="auth-logo-title">Облік ФОП</div>
            <div className="auth-logo-sub">Бухгалтерія підприємця</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab${mode==='login'?' auth-tab--active':''}`} onClick={()=>switchMode('login')}>Увійти</button>
          <button className={`auth-tab${mode==='register'?' auth-tab--active':''}`} onClick={()=>switchMode('register')}>Реєстрація</button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {mode === 'login' ? (
          <div className="auth-form">
            <div className="field">
              <label>Email</label>
              <input name="email" type="email" value={form.email} onChange={set} placeholder="you@example.com" autoFocus />
            </div>
            <div className="field">
              <label>Пароль</label>
              <input name="password" type="password" value={form.password} onChange={set} placeholder="••••••"
                onKeyDown={e => e.key==='Enter' && handleLogin()} />
            </div>
            <button className="btn btn--primary btn--full" onClick={handleLogin} disabled={loading}>
              {loading ? 'Вхід...' : 'Увійти'}
            </button>
          </div>
        ) : (
          <div className="auth-form">
            <div className="field">
              <label>Ваше ім'я <span className="req">*</span></label>
              <input name="name" value={form.name} onChange={set} placeholder="Як до вас звертатись" autoFocus />
            </div>
            <div className="field">
              <label>Email <span className="req">*</span></label>
              <input name="email" type="email" value={form.email} onChange={set} placeholder="you@example.com" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Пароль <span className="req">*</span></label>
                <input name="password" type="password" value={form.password} onChange={set} placeholder="••••••" />
              </div>
              <div className="field">
                <label>Повторити <span className="req">*</span></label>
                <input name="confirm" type="password" value={form.confirm} onChange={set} placeholder="••••••" />
              </div>
            </div>
            <p className="cell-muted" style={{fontSize:'.8rem'}}>
              Після реєстрації ви додасте реквізити ФОП.
            </p>
            <button className="btn btn--primary btn--full" onClick={handleRegister} disabled={loading}>
              {loading ? 'Створення...' : 'Зареєструватися'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
