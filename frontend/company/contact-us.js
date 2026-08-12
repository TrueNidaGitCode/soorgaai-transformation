/**
 * SoorgaAI — Contact Us page
 * Shared nav wiring + the contact form submission.
 */

import { initMarketingNav } from '../shared/marketingNav.js';

const API_BASE = () => window.CONFIG?.API_BASE || 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
  initMarketingNav();
  wireContactForm();
});

function wireContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const submitBtn  = document.getElementById('contact-submit');
  const errorEl    = document.getElementById('contact-error');
  const successEl  = document.getElementById('contact-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const name    = document.getElementById('contact-name').value.trim();
    const email   = document.getElementById('contact-email').value.trim();
    const company = document.getElementById('contact-company').value.trim();
    const message = document.getElementById('contact-message').value.trim();

    if (!name || !email || !message) {
      showError('Please fill in your name, email, and message.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const resp = await fetch(`${API_BASE()}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, message }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      form.hidden = true;
      successEl.hidden = false;
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send message';
    }
  });

  function showError(text) {
    errorEl.textContent = text;
    errorEl.hidden = false;
  }
}
