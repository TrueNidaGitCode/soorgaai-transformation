/**
 * SoorgaAI — Jira API Service
 *
 * Jira-specific REST calls only (project/issue listing, issue detail) —
 * mirrors confluenceApiService.js's shape exactly. OAuth mechanics (token
 * exchange/refresh, accessible-resources/cloudId lookup) live in
 * atlassianAuthService.js and are shared, not duplicated — the same
 * PersonalConfluenceConnection token/cloudId that grants Confluence access
 * grants Jira access too, once the connection's scopes include
 * read:jira-work (see atlassianAuthService.js's JIRA_SCOPES).
 */

import axios from 'axios';

export async function listProjects(cloudId, accessToken) {
  const { data } = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`,
    { headers: { Authorization: `Bearer ${accessToken}` }, params: { maxResults: 100 } }
  );
  return (data.values || []).map(p => ({ key: p.key, id: p.id, name: p.name }));
}

// Jira Cloud deprecated GET /rest/api/3/search in favor of this endpoint —
// token-based pagination (nextPageToken) instead of startAt/total.
export async function listIssues(cloudId, accessToken, projectKey, { limit = 50, maxIssues = 200 } = {}) {
  const issues = [];
  let nextPageToken;

  while (issues.length < maxIssues) {
    const { data } = await axios.post(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
      {
        jql: `project = "${projectKey}" ORDER BY created DESC`,
        maxResults: limit,
        fields: ['summary', 'status', 'priority', 'issuetype', 'updated'],
        ...(nextPageToken ? { nextPageToken } : {}),
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    for (const issue of data.issues || []) {
      issues.push({
        key:      issue.key,
        summary:  issue.fields?.summary || '',
        status:   issue.fields?.status?.name || '',
        priority: issue.fields?.priority?.name || '',
        type:     issue.fields?.issuetype?.name || '',
        updated:  issue.fields?.updated || null,
      });
    }

    // An empty first page is worth recording: it is indistinguishable in
    // the UI from a broken query, and the raw shape tells them apart.
    if (!issues.length) {
      console.log('[jiraApi] search/jql returned no issues for ' + projectKey +
        ' — keys: ' + JSON.stringify(Object.keys(data || {})) +
        ', isLast: ' + data.isLast + ', total: ' + data.total);
    }

    nextPageToken = data.nextPageToken;
    if (!nextPageToken || !data.issues?.length) break;
  }

  return issues.slice(0, maxIssues);
}

/**
 * Full detail for one issue, including its ADF-formatted description and
 * (if resolved) resolution — the raw material jiraContentService.js
 * redacts and structures into a DefectRecord.
 */
export async function getIssueDetail(cloudId, accessToken, issueKey) {
  const { data } = await axios.get(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { fields: 'summary,description,status,priority,issuetype,resolution,comment' },
    }
  );

  const comments = (data.fields?.comment?.comments || []).map(c => c.body);

  return {
    key:         data.key,
    summary:     data.fields?.summary || '',
    description: data.fields?.description || null, // ADF document or null
    status:      data.fields?.status?.name || '',
    priority:    data.fields?.priority?.name || '',
    issueType:   data.fields?.issuetype?.name || '',
    resolution:  data.fields?.resolution?.name || '',
    comments,    // each an ADF document
  };
}

/**
 * Approximate issue count for a project.
 *
 * Uses Jira's approximate-count endpoint, which is a single cheap call and
 * is covered by the read:jira-work scope we already hold — no reconnect
 * needed. Approximate is fine here: the number is shown to give the user a
 * sense of scale, not to drive any logic.
 *
 * Returns null (not 0) when the count can't be obtained, so callers can tell
 * "unknown" apart from "genuinely empty".
 */
export async function approximateIssueCount(cloudId, accessToken, projectKey) {
  // Try the cheap endpoint first: one call, no paging.
  try {
    const { data } = await axios.post(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/approximate-count`,
      { jql: `project = "${projectKey}"` },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    if (typeof data?.count === 'number' && data.count > 0) return { count: data.count, capped: false };
    // A zero here is not trustworthy — the endpoint isn't available on every
    // Jira edition and some deployments answer 200 with count:0 rather than
    // erroring. Fall through to a real count instead of reporting "0 tickets"
    // for a project that plainly has issues.
    console.warn(`[jiraApi] approximate-count returned ${JSON.stringify(data)} for ${projectKey}; falling back to a counted query`);
  } catch (err) {
    console.warn(`[jiraApi] approximate-count unavailable for ${projectKey}:`, err.response?.status || err.message);
  }

  // Fallback: page the search endpoint counting ids only. Costs a few calls,
  // but only on projects the cheap path couldn't answer for.
  try {
    let count = 0;
    let nextPageToken;
    const MAX = 500;
    while (count < MAX) {
      const { data } = await axios.post(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
        {
          jql: `project = "${projectKey}"`,
          maxResults: 100,
          fields: ['id'],
          ...(nextPageToken ? { nextPageToken } : {}),
        },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
      );
      count += (data.issues || []).length;
      nextPageToken = data.nextPageToken;
      if (!nextPageToken || !data.issues?.length) break;
    }
    return { count: Math.min(count, MAX), capped: count >= MAX };
  } catch (err) {
    console.warn(`[jiraApi] issue count failed for ${projectKey}:`, err.response?.status || err.message);
    return { count: null, capped: false };
  }
}
