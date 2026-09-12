/**
 * The GitHub repository description is one line. A spoken or pasted
 * objective carries line breaks, and the whole delivery failed on
 * "control characters are not allowed" for a newline nobody could see.
 */
import { describe, it, expect } from 'vitest';
import { repoDescription } from '../services/svargGithubService.js';

describe('repoDescription', () => {
  it('collapses line breaks, tabs and control characters to single spaces', () => {
    const d = repoDescription('Delivered by Svarg (Eame) — Build a\ncricket academy\r\n\tassistant\u0007 for  coaches');
    expect(d).toBe('Delivered by Svarg (Eame) — Build a cricket academy assistant for coaches');
    expect(/[\u0000-\u001f\u007f-\u009f]/.test(d)).toBe(false);
  });

  it('keeps it within what GitHub takes', () => {
    expect(repoDescription('x'.repeat(1000)).length).toBe(300);
    expect(repoDescription(undefined)).toBe('');
  });
});
