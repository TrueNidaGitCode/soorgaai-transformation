import {
  generateCompanyContextDraft,
  getCompanyContext,
  saveCompanyContext,
  clearCompanyContext,
} from '../services/companyContextService.js';

export async function get(req, res) {
  try {
    const ctx = await getCompanyContext(req.user._id);
    return res.json(ctx
      ? { content: ctx.content }
      : { content: null }
    );
  } catch (err) {
    console.error('companyContext get error:', err);
    return res.status(500).json({ error: 'Failed to retrieve company context.' });
  }
}

export async function generate(req, res) {
  try {
    const result = await generateCompanyContextDraft(req.user._id);
    return res.json(result);
  } catch (err) {
    console.error('companyContext generate error:', err);
    const isUnavailable =
      err.message?.includes('not configured') ||
      err.message?.includes('All LLM providers') ||
      err.message?.includes('No valid LLM providers');
    if (isUnavailable) {
      return res.status(503).json({ error: 'AI is not available. Please try again later.' });
    }
    return res.status(500).json({ error: 'Failed to generate company context.' });
  }
}

export async function approve(req, res) {
  try {
    const { content, orgName, role } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required.' });
    }
    await saveCompanyContext(req.user._id, content, orgName, role);
    return res.json({ ok: true });
  } catch (err) {
    console.error('companyContext approve error:', err);
    return res.status(500).json({ error: 'Failed to save company context.' });
  }
}

export async function clear(req, res) {
  try {
    await clearCompanyContext(req.user._id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('companyContext clear error:', err);
    return res.status(500).json({ error: 'Failed to clear company context.' });
  }
}
