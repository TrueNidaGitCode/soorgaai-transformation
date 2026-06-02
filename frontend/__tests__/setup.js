/**
 * Vitest global setup — runs before every test file.
 * Resets shared state so tests are fully isolated.
 */

beforeEach(() => {
  // Clear all localStorage keys
  localStorage.clear();

  // Reset the DOM to a clean blank slate
  document.body.innerHTML = '';
  document.head.innerHTML = '';

  // Restore any mocks that were spied on
  vi.restoreAllMocks();

  // Stub window.location so navigation calls don't throw in jsdom
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '', pathname: '/', assign: vi.fn(), replace: vi.fn() },
  });
});
