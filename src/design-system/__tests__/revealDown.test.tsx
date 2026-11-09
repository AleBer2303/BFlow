import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { RevealDown } from '../components/RevealDown';

describe('RevealDown', () => {
  it('renders its children immediately when motion is skipped (test env)', () => {
    render(
      <RevealDown testID="reveal-wrapper">
        <Text>Contenido</Text>
      </RevealDown>
    );
    expect(screen.getByTestId('reveal-wrapper')).toBeTruthy();
    expect(screen.getByText('Contenido')).toBeTruthy();
  });

  it('renders nothing while not visible and shows/hides when `visible` toggles', () => {
    const { rerender } = render(
      <RevealDown visible={false} testID="reveal-wrapper">
        <Text>Contenido</Text>
      </RevealDown>
    );
    expect(screen.queryByText('Contenido')).toBeNull();

    rerender(
      <RevealDown visible testID="reveal-wrapper">
        <Text>Contenido</Text>
      </RevealDown>
    );
    expect(screen.getByText('Contenido')).toBeTruthy();

    rerender(
      <RevealDown visible={false} testID="reveal-wrapper">
        <Text>Contenido</Text>
      </RevealDown>
    );
    expect(screen.queryByText('Contenido')).toBeNull();
  });
});
