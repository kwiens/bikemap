import { afterAll, afterEach, beforeAll, vi } from 'vitest';

// DOM matchers are only useful in the files that opt into jsdom. Avoid loading
// Testing Library's matcher bundle in every pure Node test worker.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

// Automatically restore all mocks between tests
afterEach(() => {
  vi.restoreAllMocks();
});

// Mock console methods to silence output during tests
beforeAll(() => {
  console.log = vi.fn();
  console.error = vi.fn();
  console.warn = vi.fn();
  console.info = vi.fn();
});

// Restore console methods after all tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.info = originalConsoleInfo;
  vi.restoreAllMocks();
});

// Create a global fetch mock
beforeAll(() => {
  global.fetch = vi.fn();
});

// Restore fetch after all tests
afterAll(() => {
  vi.restoreAllMocks();
});
