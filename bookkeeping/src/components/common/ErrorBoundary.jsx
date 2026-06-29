import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <h3 style={{ color: 'var(--error)' }}>Щось пішло не так</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            {this.state.error?.message || String(this.state.error)}
          </p>
          <button
            className="btn btn--primary"
            onClick={() => this.setState({ error: null })}
          >
            Спробувати знову
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
