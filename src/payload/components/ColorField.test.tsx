/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorField } from './ColorField';

const fieldState = vi.hoisted(() => ({
  setValue: vi.fn(),
  showError: false,
  value: '#c3f44d',
}));

vi.mock('@payloadcms/ui', () => ({
  FieldLabel: ({ htmlFor, label }: { htmlFor: string; label: string }) => (
    <label htmlFor={htmlFor}>{label}</label>
  ),
  useField: () => fieldState,
}));

const props = {
  field: {
    admin: { description: 'Changes selected tabs and highlighted cards.' },
    label: 'Selected items & highlights',
    name: 'primaryColor',
    type: 'text' as const,
  },
  path: 'primaryColor',
} as Parameters<typeof ColorField>[0];

beforeEach(() => {
  fieldState.setValue.mockReset();
  fieldState.showError = false;
  fieldState.value = '#c3f44d';
});

describe('ColorField', () => {
  it('renders an accessible label and explains the frontend impact', () => {
    render(<ColorField {...props} />);

    expect(screen.getByLabelText('Selected items & highlights')).toHaveValue(
      '#c3f44d',
    );
    expect(
      screen.getByText('Changes selected tabs and highlighted cards.'),
    ).toBeInTheDocument();
  });

  it('updates the field from the text input and native color picker', () => {
    render(<ColorField {...props} />);

    fireEvent.change(screen.getByLabelText('Selected items & highlights'), {
      target: { value: '#123456' },
    });
    fireEvent.change(
      screen.getByLabelText('Selected items & highlights colour picker'),
      { target: { value: '#654321' } },
    );

    expect(fieldState.setValue).toHaveBeenNthCalledWith(1, '#123456');
    expect(fieldState.setValue).toHaveBeenNthCalledWith(2, '#654321');
  });

  it('marks the text input when Payload reports a validation error', () => {
    fieldState.showError = true;

    render(<ColorField {...props} />);

    expect(
      screen
        .getByLabelText('Selected items & highlights')
        .getAttribute('style'),
    ).toContain('var(--theme-error-500, #c00)');
  });
});
