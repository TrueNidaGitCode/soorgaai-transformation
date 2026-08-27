/**
 * SoorgaAI — Confluence API Service
 *
 * Confluence-specific REST calls only (space/page listing, page content
 * fetch). The OAuth mechanics (token exchange/refresh, accessible-resources
 * lookup) moved to atlassianAuthService.js, since Jira needs the exact same
 * plumbing — re-exported here so no existing caller's import line changes.
 */

import axios from 'axios';
import {
  isAtlassianOAuthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getAccessibleResources,
  getValidAccessToken,
  CONFLUENCE_SCOPES,
} from './atlassianAuthService.js';

export {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  getAccessibleResources,
  getValidAccessToken,
  CONFLUENCE_SCOPES,
};

export const isConfluenceOAuthConfigured = isAtlassianOAuthConfigured;

// ── Discovery (metadata only) ────────────────────────────────────────────────

// Confluence REST API v1 (/wiki/rest/api/...) has been retired by Atlassian
// (410 Gone) — these use the current v2 API (/wiki/api/v2/...). v2 lists
// pages by numeric space ID rather than key, so listPages resolves the key
// to an ID first; this keeps every route/URL in the rest of the codebase
// still keyed by space key, only the internal Atlassian call changes.

export async function listSpaces(cloudId, accessToken) {
  const { data } = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces`,
    { headers: { Authorization: `Bearer ${accessToken}` }, params: { limit: 100 } }
  );
  return (data.results || []).map(s => ({ key: s.key, id: String(s.id), name: s.name, type: s.type }));
}

async function resolveSpaceId(cloudId, accessToken, spaceKey) {
  const { data } = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces`,
    { headers: { Authorization: `Bearer ${accessToken}` }, params: { keys: spaceKey, limit: 1 } }
  );
  const space = (data.results || [])[0];
  if (!space) throw new Error(`Confluence space "${spaceKey}" not found.`);
  return String(space.id);
}

export async function listPages(cloudId, accessToken, spaceKey, { limit = 100, maxPages = 500 } = {}) {
  const spaceId = await resolveSpaceId(cloudId, accessToken, spaceKey);

  const pages = [];
  let url = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/spaces/${spaceId}/pages`;
  let params = { limit };

  while (url && pages.length < maxPages) {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
    });

    for (const p of data.results || []) {
      pages.push({ id: p.id, title: p.title, lastModified: p.version?.createdAt || null });
    }

    if (data._links?.next && pages.length < maxPages) {
      url = `https://api.atlassian.com${data._links.next}`;
      params = undefined; // next link already has the full query string
    } else {
      url = null;
    }
  }

  return pages.slice(0, maxPages);
}

/**
 * Fetches macro-resolved static HTML for one page (body.export_view).
 * Diagrams/images/attachments remain out of scope — only text content is used.
 * spaceKey is not resolvable from the v2 page response (only a numeric
 * spaceId is) — callers already know which space they asked for and pass
 * their own spaceKey through separately rather than relying on this field.
 */
export async function getPageContent(cloudId, accessToken, pageId) {
  const { data } = await axios.get(
    `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/${pageId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { 'body-format': 'export_view' },
    }
  );

  return {
    id:           data.id,
    title:        data.title,
    spaceKey:     '',
    html:         data.body?.export_view?.value || '',
    lastModified: data.version?.createdAt || null,
    permalink:    data._links?.base && data._links?.webui ? `${data._links.base}${data._links.webui}` : '',
  };
}
