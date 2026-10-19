/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SiteBrandingProvider, SiteLogo } from './SiteBrandingContext';

afterEach(cleanup);

it('updates every logo and restores each fallback when the configured logo is removed', () => {
  function Branding({ url }: { url: string | null }) {
    return (
      <SiteBrandingProvider branding={{ logoUrl: url, logoAlt: 'City logo' }}>
        <SiteLogo alt="Welcome logo" className="h-12">
          <span>Welcome fallback</span>
        </SiteLogo>
        <SiteLogo alt="About logo" className="h-56">
          <span>About fallback</span>
        </SiteLogo>
      </SiteBrandingProvider>
    );
  }

  const { rerender } = render(<Branding url="/media/first.png" />);
  expect(screen.getAllByRole('img', { name: 'City logo' })).toHaveLength(2);
  expect(screen.queryByText('About fallback')).not.toBeInTheDocument();

  rerender(<Branding url="/media/replacement.png" />);
  for (const logo of screen.getAllByRole('img')) {
    expect(logo).toHaveAttribute('src', '/media/replacement.png');
  }

  rerender(<Branding url={null} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('Welcome fallback')).toBeInTheDocument();
  expect(screen.getByText('About fallback')).toBeInTheDocument();
});

it('uses the caller’s accessible name when the uploaded image has no alternative text', () => {
  render(
    <SiteBrandingProvider
      branding={{ logoUrl: '/media/logo.png', logoAlt: null }}
    >
      <SiteLogo alt="City logo" className="h-12" />
    </SiteBrandingProvider>,
  );
  expect(screen.getByRole('img', { name: 'City logo' })).toBeInTheDocument();
});
