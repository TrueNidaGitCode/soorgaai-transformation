/**
 * Svarg — the signed-in account menu, the same on every page that has one.
 *
 * The app home page (cob.html) drew a profile chip — initial, name, chevron —
 * opening a small menu. Blueprints and Account drew a name and a bare Logout
 * button instead, so moving between three pages changed what the top-right
 * corner looked like and what it offered. This is the home page's menu, moved
 * here so all three draw the same one. Styles: shared/profileMenu.css.
 */

/** Everything a signed-in session leaves in this browser. */
const SESSION_KEYS = [
  'token', 'username', 'userId', 'role', 'redirectAfterLogin',
  'soorgaai_blueprint_v1', 'soorgaai_blueprint_activity_v1',
  'soorgaai_executive_memory_v1', 'soorgaai_company_context_v1',
  'da_score', 'soorga_assessment_progress',
];

/**
 * Draw the menu into `wrap` if somebody is signed in.
 *
 * @param {HTMLElement} wrap  where it goes (its contents are replaced)
 * @param {object} [opts]
 * @param {() => void} [opts.afterLogout]  what happens once the session is cleared;
 *   the home page reloads, other pages go back to it
 * @returns {boolean} whether a menu was drawn
 */
export function mountProfileMenu(wrap, { afterLogout = () => { window.location.href = '/cob.html'; } } = {}) {
  if (!wrap) return false;
  if (!localStorage.getItem('token')) return false;

  const username = (localStorage.getItem('username') || 'Account').trim() || 'Account';

  wrap.innerHTML = `
    <div class="profile-menu">
      <button type="button" class="profile-btn" aria-haspopup="menu" aria-expanded="false">
        <span class="profile-avatar" aria-hidden="true"></span>
        <span class="profile-name"></span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="profile-dropdown" style="display:none" role="menu">
        <a href="/domain/domain.html" class="profile-dropdown__item" role="menuitem">My Blueprint</a>
        <a href="/account/account.html" class="profile-dropdown__item" role="menuitem">Account</a>
        <button type="button" class="profile-dropdown__item profile-dropdown__item--danger" data-logout role="menuitem">Log out</button>
      </div>
    </div>`;

  // textContent keeps any odd characters in the stored name inert.
  wrap.querySelector('.profile-avatar').textContent = username.charAt(0).toUpperCase();
  wrap.querySelector('.profile-name').textContent = username;

  const btn = wrap.querySelector('.profile-btn');
  const dropdown = wrap.querySelector('.profile-dropdown');
  const setOpen = (open) => {
    dropdown.style.display = open ? '' : 'none';
    btn.setAttribute('aria-expanded', String(open));
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(dropdown.style.display === 'none');
  });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  wrap.querySelector('[data-logout]').addEventListener('click', () => {
    SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
    afterLogout();
  });
  return true;
}
