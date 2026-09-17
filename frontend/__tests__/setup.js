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

  // Every page loads config.js before its own script, so window.CONFIG is
  // always there in the browser and never was here. Code that read it threw,
  // and where that throw was caught — login's profile check fails open on
  // purpose — the test passed while exercising only the catch block.
  window.CONFIG = { API_BASE: 'http://api.test/api' };
});
