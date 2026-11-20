import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import ErrorBoundary from './ErrorBoundary';
import * as monitoring from '../../lib/monitoring';

// No DOM library in this project: the boundary's three jobs are tested directly (React itself guarantees it calls them in this order).
describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows its children when nothing is wrong', () => {
    expect(renderToString(<ErrorBoundary><p>fine</p></ErrorBoundary>)).toContain('fine');
  });

  it('turns a crash into a message with a way out (not a black screen)', () => {
    const error = new Error('render crash');
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
    const b = new ErrorBoundary({ children: <p>fine</p>, scope: 'page' });
    b.state = { error };
    const html = renderToString(b.render());
    expect(html).toContain('role="alert"');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('Reload');
    expect(html).toContain('Go to Home');
    expect(html).not.toContain('fine');
  });

  it('reports the crash (page or whole app)', () => {
    const report = vi.spyOn(monitoring, 'captureError').mockImplementation(() => {});
    const b = new ErrorBoundary({ scope: 'page' });
    b.componentDidCatch(new Error('boom'), { componentStack: '\n at Page' });
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), { componentStack: '\n at Page', boundary: 'page' });
    new ErrorBoundary({ scope: 'app' }).componentDidCatch(new Error('x'), {});
    expect(report.mock.calls[1][1].boundary).toBe('app');
  });
});
