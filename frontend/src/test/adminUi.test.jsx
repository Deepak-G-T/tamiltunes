import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AccessDenied } from '../components/auth/AdminRoute';

describe('Admin UI Components', () => {
  it('AccessDenied renders proper 403 message with dark background and return link', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AccessDenied />
      </MemoryRouter>
    );

    expect(html).toContain('Access Denied');
    expect(html).toContain('bg-[#09090B]');
    expect(html).toContain('Back to TamilTunes');
    expect(html).toContain('administrator privileges');
  });
});
