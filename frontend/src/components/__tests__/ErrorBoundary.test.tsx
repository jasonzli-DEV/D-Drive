import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ErrorBoundary from '../ErrorBoundary';

const ThrowError = () => {
  throw new Error('Test error');
};

const WorkingComponent = () => <div>Working component</div>;

describe('ErrorBoundary', () => {
  it('should render children when no error occurs', () => {
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <WorkingComponent />
        </ErrorBoundary>
      </BrowserRouter>
    );

    expect(screen.getByText('Working component')).toBeInTheDocument();
  });

  it('should render error UI when child component throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    spy.mockRestore();
  });

  it('should display generic error message in error state', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );

    // The ErrorBoundary shows a generic message, not the actual error
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();

    spy.mockRestore();
  });

  it('should have a reload button in error state', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );

    const reloadButton = screen.getByRole('button', { name: /reload/i });
    expect(reloadButton).toBeInTheDocument();

    spy.mockRestore();
  });

  it('should show sorry message in error state', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      </BrowserRouter>
    );

    expect(screen.getByText(/sorry/i)).toBeInTheDocument();

    spy.mockRestore();
  });
});
