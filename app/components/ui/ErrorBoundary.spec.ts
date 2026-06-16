import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';

/**
 * Tests for the reusable ErrorBoundary component.
 *
 * Since we're using JSDOM (no full React rendering),
 * we test the class methods and state transitions directly.
 */

// Mock the logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('ErrorBoundary', () => {
  describe('getDerivedStateFromError', () => {
    it('should return hasError: true with the error', () => {
      const testError = new Error('Test crash');
      const state = ErrorBoundary.getDerivedStateFromError(testError);

      expect(state).toEqual({
        hasError: true,
        error: testError,
      });
    });

    it('should capture the error message', () => {
      const error = new Error('Component render failed');
      const state = ErrorBoundary.getDerivedStateFromError(error);

      expect(state.hasError).toBe(true);
      expect(state.error?.message).toBe('Component render failed');
    });
  });

  describe('Error recovery', () => {
    it('should define _handleRetry method', () => {
      const instance = new ErrorBoundary({ children: null });
      expect(typeof (instance as any)._handleRetry).toBe('function');
    });

    it('should reset state on retry', () => {
      const instance = new ErrorBoundary({ children: null });

      // Simulate error state
      instance.state = { hasError: true, error: new Error('crash') };

      // Simulate setState by calling the retry handler
      const setStateSpy = vi.fn();
      instance.setState = setStateSpy;
      (instance as any)._handleRetry();

      expect(setStateSpy).toHaveBeenCalledWith({
        hasError: false,
        error: undefined,
      });
    });
  });

  describe('componentDidCatch', () => {
    it('should call onError callback when provided', () => {
      const onError = vi.fn();
      const instance = new ErrorBoundary({
        children: null,
        onError,
        panelName: 'TestPanel',
      });

      const testError = new Error('test');
      const errorInfo = { componentStack: 'at TestComponent' } as any;

      instance.componentDidCatch(testError, errorInfo);

      expect(onError).toHaveBeenCalledWith(testError, errorInfo);
    });

    it('should not throw when onError is not provided', () => {
      const instance = new ErrorBoundary({ children: null });
      const testError = new Error('test');
      const errorInfo = { componentStack: 'at TestComponent' } as any;

      expect(() => {
        instance.componentDidCatch(testError, errorInfo);
      }).not.toThrow();
    });
  });

  describe('constructor', () => {
    it('should initialize with hasError: false', () => {
      const instance = new ErrorBoundary({ children: null });
      expect(instance.state.hasError).toBe(false);
      expect(instance.state.error).toBeUndefined();
    });
  });

  describe('props interface', () => {
    it('should accept panelName prop', () => {
      const instance = new ErrorBoundary({
        children: null,
        panelName: 'Workbench',
      });

      expect(instance.props.panelName).toBe('Workbench');
    });

    it('should accept fallback prop', () => {
      const fallback = 'Fallback content';
      const instance = new ErrorBoundary({
        children: null,
        fallback,
      });

      expect(instance.props.fallback).toBe(fallback);
    });
  });
});
