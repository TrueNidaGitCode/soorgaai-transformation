/**
 * SoorgaAI — Business Objective Length Limit
 *
 * Single source of truth, shared by the guest and authenticated generation
 * paths so they can never drift out of sync with each other or with the
 * frontend's soft character-counter guidance (index.html, domain.html).
 *
 * 8000 chars (~1,300-1,600 words) comfortably fits a detailed multi-step
 * spec — Claude/Gemini context windows make this cheap; the point of the
 * cap is only to reject pathological input with a clear message, never to
 * silently truncate a legitimate one.
 */
export const MAX_OBJECTIVE_LENGTH = 8000;
