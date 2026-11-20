import React from 'react';
import { captureError } from '../../lib/monitoring';

/**
 * Catches a crash while drawing a screen so the person sees a message and a way out, not a black page.
 * `scope="page"` wraps one page (the menu and player stay usable); `scope="app"` is the last line of defence.
 * A page boundary sits inside a wrapper keyed by the path, so going to another page remounts it and clears the error.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureError(error, { componentStack: info?.componentStack, boundary: this.props.scope || 'page' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const full = this.props.scope === 'app';
    return (
      <div role="alert" data-testid="error-boundary" className={`${full ? 'min-h-screen' : 'min-h-[50vh]'} flex flex-col items-center justify-center gap-4 px-6 text-center bg-[#09090B] text-white`}>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-zinc-400 max-w-sm">This screen hit a problem. It has been reported. Reloading usually fixes it.</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 px-5 rounded-full bg-brand-500 text-black text-sm font-bold">Reload</button>
          <button type="button" onClick={() => { window.location.href = '/'; }} className="min-h-11 px-5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-semibold">Go to Home</button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
