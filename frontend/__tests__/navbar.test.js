/**
 * Unit tests — frontend/navbar/navbar.js
 *
 * Tests the exported pure/helper functions in isolation.
 * All DOM interactions use jsdom; fetch is mocked so no network calls occur.
 */

import {
  getNavbarPath,
  setupNavbarHandlers,
  setupNavLinks,
  setupMobileToggle,
  bindBtn,
  logoutUser,
} from '../navbar/navbar.js';

// ── DOM fixture ───────────────────────────────────────────────────────────────

function buildNavbarDOM({ role = 'user', token = null, username = null, daScore = null } = {}) {
  if (token)    localStorage.setItem('token', token);
  if (username) localStorage.setItem('username', username);
  if (role)     localStorage.setItem('role', role);
  if (daScore)  localStorage.setItem('da_score', daScore);

  document.body.innerHTML = `
    <nav class="navbar">
      <button id="loginSignupBtn" style="display:inline">Log In</button>
      <button id="logoutBtn"      style="display:none">Logout</button>
      <span   id="username-display" style="display:none"></span>
      <a      id="adminDashboardBtn" style="display:none">Admin</a>
      <a      id="myAssessmentsBtn"  style="display:none">My Assessments</a>
      <a      id="navRoadmapCta" href="#">Generate Roadmap</a>
      <button id="navToggle" class="nav-toggle" aria-expanded="false">
        <span class="nav-toggle__bar"></span>
        <span class="nav-toggle__bar"></span>
        <span class="nav-toggle__bar"></span>
      </button>
      <ul class="nav-links">
        <li><a href="/platform">Platform</a></li>
      </ul>
      <div class="nav-right">
        <a id="myAssessmentsBtn2" href="#">My link</a>
      </div>
    </nav>
  `;
}

// ── window.loadNavbar global ──────────────────────────────────────────────────

describe('window.loadNavbar global', () => {
  it('is defined after the module loads', () => {
    expect(typeof window.loadNavbar).toBe('function');
  });

  it('calls setupNavbarHandlers without throwing when navbar elements are present', () => {
    buildNavbarDOM();

    expect(() => window.loadNavbar()).not.toThrow();
  });
});

// ── getNavbarPath ─────────────────────────────────────────────────────────────

describe('getNavbarPath', () => {
  it('returns "navbar/navbar.html" when pathname ends with /', () => {
    window.location.pathname = '/';

    expect(getNavbarPath()).toBe('navbar/navbar.html');
  });

  it('returns "navbar/navbar.html" when pathname includes /index.html', () => {
    window.location.pathname = '/index.html';

    expect(getNavbarPath()).toBe('navbar/navbar.html');
  });

  it('returns "../navbar/navbar.html" when pathname has 2 or more non-empty segments', () => {
    window.location.pathname = '/dynamic-assessment/start.html';

    expect(getNavbarPath()).toBe('../navbar/navbar.html');
  });

  it('returns "navbar/navbar.html" as the default for a single-segment path', () => {
    window.location.pathname = '/about';

    expect(getNavbarPath()).toBe('navbar/navbar.html');
  });
});

// ── setupNavbarHandlers — unauthenticated ─────────────────────────────────────

describe('setupNavbarHandlers — unauthenticated user', () => {
  it('shows the login button when no token is present', () => {
    buildNavbarDOM();

    setupNavbarHandlers();

    expect(document.getElementById('loginSignupBtn').style.display).toBe('inline');
  });

  it('hides the logout button when no token is present', () => {
    buildNavbarDOM();

    setupNavbarHandlers();

    expect(document.getElementById('logoutBtn').style.display).toBe('none');
  });

  it('hides the admin button when no token is present', () => {
    buildNavbarDOM();

    setupNavbarHandlers();

    expect(document.getElementById('adminDashboardBtn').style.display).toBe('none');
  });

  it('hides My Assessments when no token and no completed assessment', () => {
    buildNavbarDOM();

    setupNavbarHandlers();

    expect(document.getElementById('myAssessmentsBtn').style.display).toBe('none');
  });

  it('hides My Assessments when no token even if da_score is present in localStorage', () => {
    buildNavbarDOM({ daScore: '{"overallScore":60}' });

    setupNavbarHandlers();

    expect(document.getElementById('myAssessmentsBtn').style.display).toBe('none');
  });
});

// ── setupNavbarHandlers — login mode ─────────────────────────────────────────

describe('setupNavbarHandlers — login nav mode', () => {
  afterEach(() => {
    delete document.body.dataset.navMode;
  });

  it('hides all auth chrome and the roadmap CTA on the login page', () => {
    buildNavbarDOM();
    document.body.dataset.navMode = 'login';

    setupNavbarHandlers();

    ['loginSignupBtn', 'logoutBtn', 'username-display', 'adminDashboardBtn', 'myAssessmentsBtn', 'navRoadmapCta']
      .forEach(id => {
        expect(document.getElementById(id).style.display).toBe('none');
      });
  });

  it('hides auth chrome even when a token and da_score are present', () => {
    buildNavbarDOM({ token: 'valid-jwt', daScore: '{"overallScore":60}' });
    document.body.dataset.navMode = 'login';

    setupNavbarHandlers();

    expect(document.getElementById('loginSignupBtn').style.display).toBe('none');
    expect(document.getElementById('myAssessmentsBtn').style.display).toBe('none');
    expect(document.getElementById('navRoadmapCta').style.display).toBe('none');
  });
});

// ── setupNavbarHandlers — authenticated ──────────────────────────────────────

describe('setupNavbarHandlers — authenticated user', () => {
  it('hides the login button when a token is present', () => {
    buildNavbarDOM({ token: 'valid-jwt' });

    setupNavbarHandlers();

    expect(document.getElementById('loginSignupBtn').style.display).toBe('none');
  });

  it('shows the logout button when a token is present', () => {
    buildNavbarDOM({ token: 'valid-jwt' });

    setupNavbarHandlers();

    expect(document.getElementById('logoutBtn').style.display).toBe('inline');
  });

  it('shows My Assessments when a token is present', () => {
    buildNavbarDOM({ token: 'valid-jwt' });

    setupNavbarHandlers();

    expect(document.getElementById('myAssessmentsBtn').style.display).toBe('inline');
  });

  it('displays the username greeting when token and username are present', () => {
    buildNavbarDOM({ token: 'valid-jwt', username: 'TestUser' });

    setupNavbarHandlers();

    const display = document.getElementById('username-display');
    expect(display.textContent).toBe('Hi, TestUser');
    expect(display.style.display).toBe('inline');
  });

  it('shows the admin button when role is "admin"', () => {
    buildNavbarDOM({ token: 'valid-jwt', role: 'admin' });

    setupNavbarHandlers();

    expect(document.getElementById('adminDashboardBtn').style.display).toBe('inline');
  });

  it('hides the admin button when role is "user"', () => {
    buildNavbarDOM({ token: 'valid-jwt', role: 'user' });

    setupNavbarHandlers();

    expect(document.getElementById('adminDashboardBtn').style.display).toBe('none');
  });
});

// ── setupNavbarHandlers — navRoadmapCta ───────────────────────────────────────

describe('setupNavbarHandlers — Generate Roadmap CTA', () => {
  it('sets the navRoadmapCta href from window.SoorgaAuth.getRoadmapHref when available', () => {
    buildNavbarDOM();
    window.SoorgaAuth = { getRoadmapHref: () => '/dynamic-assessment/start.html' };

    setupNavbarHandlers();

    expect(document.getElementById('navRoadmapCta').getAttribute('href'))
      .toContain('/dynamic-assessment/start.html');
  });

  it('does not throw when window.SoorgaAuth is not defined', () => {
    buildNavbarDOM();
    window.SoorgaAuth = undefined;

    expect(() => setupNavbarHandlers()).not.toThrow();
  });

  it('does not throw when navRoadmapCta element is absent from DOM', () => {
    // Build DOM without the navRoadmapCta element
    document.body.innerHTML = `
      <button id="loginSignupBtn" style="display:inline">Log In</button>
      <button id="logoutBtn" style="display:none">Logout</button>
    `;
    window.SoorgaAuth = { getRoadmapHref: () => '/dynamic-assessment/start.html' };

    expect(() => setupNavbarHandlers()).not.toThrow();
  });
});

// ── setupNavbarHandlers — missing DOM elements ────────────────────────────────

describe('setupNavbarHandlers — missing required DOM elements', () => {
  it('returns early without throwing when loginSignupBtn is absent', () => {
    document.body.innerHTML = '<button id="logoutBtn">Logout</button>';

    expect(() => setupNavbarHandlers()).not.toThrow();
  });

  it('returns early without throwing when logoutBtn is absent', () => {
    document.body.innerHTML = '<button id="loginSignupBtn">Log In</button>';

    expect(() => setupNavbarHandlers()).not.toThrow();
  });
});

// ── setupNavLinks ─────────────────────────────────────────────────────────────

describe('setupNavLinks', () => {
  it('navigates to scorecard when My Assessments is clicked and da_score is set', () => {
    buildNavbarDOM({ daScore: '{"overallScore":60}' });

    setupNavLinks();
    document.getElementById('myAssessmentsBtn').click();

    expect(window.location.href).toBe('/dynamic-assessment/scorecard.html');
  });

  it('navigates to start when My Assessments is clicked and da_score is not set', () => {
    buildNavbarDOM();

    setupNavLinks();
    document.getElementById('myAssessmentsBtn').click();

    expect(window.location.href).toBe('/dynamic-assessment/start.html');
  });

  it('navigates to admin dashboard when Admin is clicked and role is admin', () => {
    buildNavbarDOM({ role: 'admin' });

    setupNavLinks();
    document.getElementById('adminDashboardBtn').click();

    expect(window.location.href).toBe('/admin/dashboard.html');
  });

  it('navigates to admin login when Admin is clicked and role is not admin', () => {
    buildNavbarDOM({ role: 'user' });

    setupNavLinks();
    document.getElementById('adminDashboardBtn').click();

    expect(window.location.href).toBe('/admin/login.html');
  });

  it('does not throw when myAssessmentsBtn is absent from the DOM', () => {
    document.body.innerHTML = '<button id="adminDashboardBtn">Admin</button>';

    expect(() => setupNavLinks()).not.toThrow();
  });
});

// ── setupMobileToggle ─────────────────────────────────────────────────────────

describe('setupMobileToggle', () => {
  it('adds is-open class to .navbar when toggle is clicked', () => {
    buildNavbarDOM();

    setupMobileToggle();
    document.getElementById('navToggle').click();

    expect(document.querySelector('.navbar').classList.contains('is-open')).toBe(true);
  });

  it('sets aria-expanded="true" on toggle when menu opens', () => {
    buildNavbarDOM();

    setupMobileToggle();
    document.getElementById('navToggle').click();

    expect(document.getElementById('navToggle').getAttribute('aria-expanded')).toBe('true');
  });

  it('removes is-open class when toggle is clicked a second time', () => {
    buildNavbarDOM();

    setupMobileToggle();
    document.getElementById('navToggle').click(); // open
    document.getElementById('navToggle').click(); // close

    expect(document.querySelector('.navbar').classList.contains('is-open')).toBe(false);
  });

  it('sets aria-expanded="false" after menu is closed', () => {
    buildNavbarDOM();

    setupMobileToggle();
    document.getElementById('navToggle').click(); // open
    document.getElementById('navToggle').click(); // close

    expect(document.getElementById('navToggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the menu and resets aria-expanded when a nav link is clicked', () => {
    buildNavbarDOM();

    setupMobileToggle();
    document.getElementById('navToggle').click(); // open menu
    expect(document.querySelector('.navbar').classList.contains('is-open')).toBe(true);

    document.querySelector('.nav-links a').click(); // click a nav link

    expect(document.querySelector('.navbar').classList.contains('is-open')).toBe(false);
    expect(document.getElementById('navToggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('returns early without throwing when navToggle is absent', () => {
    document.body.innerHTML = '<nav class="navbar"></nav>';

    expect(() => setupMobileToggle()).not.toThrow();
  });
});

// ── bindBtn ───────────────────────────────────────────────────────────────────

describe('bindBtn', () => {
  it('calls the handler when the bound element is clicked', () => {
    document.body.innerHTML = '<button id="testBtn">Click</button>';
    const handler = vi.fn();

    bindBtn('testBtn', handler);
    document.getElementById('testBtn').click();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('prevents the default event action on click', () => {
    document.body.innerHTML = '<a id="testLink" href="/somewhere">Link</a>';
    const handler = vi.fn();

    bindBtn('testLink', handler);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const prevented = !document.getElementById('testLink').dispatchEvent(event);

    expect(prevented).toBe(true);
  });

  it('navigates to the login page when the login button is clicked while unauthenticated', () => {
    buildNavbarDOM(); // no token → loginBtn.onclick is set to the login redirect arrow fn
    setupNavbarHandlers();

    document.getElementById('loginSignupBtn').click();

    expect(window.location.href).toBe('/login/login.html');
  });

  it('does not throw when the element id does not exist in the DOM', () => {
    expect(() => bindBtn('nonExistentId', vi.fn())).not.toThrow();
  });

  it('does not call handler when the element is absent', () => {
    const handler = vi.fn();

    bindBtn('doesNotExist', handler);

    expect(handler).not.toHaveBeenCalled();
  });
});

// ── logoutUser ────────────────────────────────────────────────────────────────

describe('logoutUser', () => {
  it('removes the token from localStorage', () => {
    buildNavbarDOM({ token: 'jwt-to-clear' });

    logoutUser();

    expect(localStorage.getItem('token')).toBeNull();
  });

  it('removes username from localStorage', () => {
    buildNavbarDOM({ token: 'tok', username: 'Alice' });

    logoutUser();

    expect(localStorage.getItem('username')).toBeNull();
  });

  it('removes userId from localStorage', () => {
    localStorage.setItem('userId', '123');
    buildNavbarDOM({ token: 'tok' });

    logoutUser();

    expect(localStorage.getItem('userId')).toBeNull();
  });

  it('removes role from localStorage', () => {
    buildNavbarDOM({ token: 'tok', role: 'admin' });

    logoutUser();

    expect(localStorage.getItem('role')).toBeNull();
  });

  it('removes redirectAfterLogin from localStorage', () => {
    localStorage.setItem('redirectAfterLogin', '/dashboard');
    buildNavbarDOM({ token: 'tok' });

    logoutUser();

    expect(localStorage.getItem('redirectAfterLogin')).toBeNull();
  });

  it('navigates to /index.html after clearing state', () => {
    buildNavbarDOM({ token: 'tok' });

    logoutUser();

    expect(window.location.href).toBe('/index.html');
  });

  it('does not throw when localStorage keys are already absent', () => {
    // localStorage is already cleared from setup.js beforeEach
    buildNavbarDOM();

    expect(() => logoutUser()).not.toThrow();
  });
});
