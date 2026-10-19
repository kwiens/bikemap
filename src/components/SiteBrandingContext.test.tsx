/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SiteBrandingProvider, SiteLogo } from './SiteBrandingContext';

afterEach(cleanup);

it('updates every logo and restores each fallback when the configured logo is removed', () => {
  function Branding({ url }: { url: string | null }) {
    return (
      <SiteBrandingProvider
        branding={{ chattanooga: { logoUrl: url, logoAlt: 'City logo' } }}
      >
        <SiteLogo cityId="chattanooga" alt="Welcome logo" className="h-12">
          <span>Welcome fallback</span>
        </SiteLogo>
        <SiteLogo cityId="chattanooga" alt="About logo" className="h-56">
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
      branding={{ chattanooga: { logoUrl: '/media/logo.png', logoAlt: null } }}
    >
      <SiteLogo cityId="chattanooga" alt="City logo" className="h-12" />
    </SiteBrandingProvider>,
  );
  expect(screen.getByRole('img', { name: 'City logo' })).toBeInTheDocument();
});

it('keeps city uploads separate and falls back only for the city without an upload', () => {
  const { rerender } = render(
    <SiteBrandingProvider
      branding={{
        chattanooga: { logoUrl: '/media/chatt.png', logoAlt: 'Bike Chatt' },
        bend: { logoUrl: '/media/bend.png', logoAlt: 'Ride Bend' },
      }}
    >
      <SiteLogo cityId="chattanooga" alt="Chatt" className="h-12" />
      <SiteLogo cityId="bend" alt="Bend" className="h-12" />
    </SiteBrandingProvider>,
  );
  expect(screen.getByRole('img', { name: 'Bike Chatt' })).toHaveAttribute(
    'src',
    '/media/chatt.png',
  );
  expect(screen.getByRole('img', { name: 'Ride Bend' })).toHaveAttribute(
    'src',
    '/media/bend.png',
  );

  rerender(
    <SiteBrandingProvider
      branding={{
        chattanooga: { logoUrl: '/media/chatt.png', logoAlt: 'Bike Chatt' },
      }}
    >
      <SiteLogo cityId="bend" alt="Bend" className="h-12">
        <span>Ride Bend default</span>
      </SiteLogo>
    </SiteBrandingProvider>,
  );
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('Ride Bend default')).toBeInTheDocument();
});
