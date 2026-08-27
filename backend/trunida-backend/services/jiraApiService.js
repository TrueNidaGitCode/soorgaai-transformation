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
