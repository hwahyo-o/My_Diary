import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the foundation shell heading', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'My Diary' }),
    ).toBeInTheDocument();
  });
});
