/**
 * SoorgaAI — Blueprint PDF Export Service
 *
 * Renders a Company Blueprint into an executive-ready PDF document.
 * No platform branding. No internal references. Appears as a company-owned asset.
 *
 * Public API:
 *   generateBlueprintPDF(blueprint) → Promise<Buffer>
 */

import PDFDocument from 'pdfkit';

// ── Layout constants ──────────────────────────────────────────────────────────

const PAGE_W  = 595.28;
const PAGE_H  = 841.89;
const ML      = 60;          // margin left
const MR      = 60;          // margin right
const MT      = 72;          // margin top (content starts here)
const MB      = 60;          // margin bottom
const CW      = PAGE_W - ML - MR;  // content width = 475.28
const FOOTER_Y = PAGE_H - MB + 12;

// ── Colour palette ────────────────────────────────────────────────────────────

const NAVY        = '#0B1F4B';
const ACCENT      = '#1A56DB';
const TEXT        = '#111827';
const MUTED       = '#6B7280';
const BORDER      = '#E5E7EB';
const WHITE       = '#FFFFFF';
const CARD_BG     = '#F8FAFF';
const ACCENT_BAR  = '#DBEAFE';

// ── Low-level draw helpers ────────────────────────────────────────────────────

function hLine(doc, y, color = BORDER, width = 0.5) {
  doc.save()
    .moveTo(ML, y).lineTo(ML + CW, y)
    .lineWidth(width).strokeColor(color).stroke()
    .restore();
}

function filledRect(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function checkPageBreak(doc, neededHeight) {
  if (doc.y + neededHeight > PAGE_H - MB) {
    doc.addPage();
  }
}

function cap(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str = '', maxLen = 80) {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

// ── Running elements ──────────────────────────────────────────────────────────

function renderRunningHeader(doc, companyName) {
  const textY = MT - 28;
  const lineY = MT - 10;

  doc.save();
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
  doc.text(companyName || '', ML, textY, { width: CW / 2, lineBreak: false });
  doc.text('AI Strategy Blueprint', ML, textY, { width: CW, align: 'right', lineBreak: false });
  hLine(doc, lineY, BORDER, 0.5);
  doc.restore();

  doc.y = MT;
}

function renderPageNumber(doc, num) {
  doc.save();
  hLine(doc, FOOTER_Y - 6, BORDER, 0.5);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text(String(num), ML, FOOTER_Y, { width: CW, align: 'center', lineBreak: false });
  doc.text('CONFIDENTIAL', ML, FOOTER_Y, { width: CW, align: 'right', lineBreak: false });
  doc.restore();
}

// ── Cover page ────────────────────────────────────────────────────────────────

function renderCoverPage(doc, blueprint) {
  // Full navy background
  filledRect(doc, 0, 0, PAGE_W, PAGE_H, NAVY);

  // Top accent bar
  filledRect(doc, 0, 0, PAGE_W, 6, ACCENT);

  // Decorative corner geometry
  doc.save()
    .moveTo(PAGE_W - 160, 0).lineTo(PAGE_W, 0).lineTo(PAGE_W, 160)
    .fill('rgba(255,255,255,0.03)');
  doc.restore();

  // Company name
  doc.font('Helvetica-Bold').fontSize(26).fillColor(WHITE);
  doc.text(blueprint.companyName || 'Company', ML, 180, { width: CW });

  // Industry tag
  const industry = blueprint.industry || 'Industry';
  doc.font('Helvetica').fontSize(10).fillColor('rgba(255,255,255,0.55)');
  doc.text(industry, ML, doc.y + 6, { width: CW });

  // Blueprint title
  doc.moveDown(1.8);
  doc.font('Helvetica-Bold').fontSize(34).fillColor(WHITE);
  doc.text('AI Strategy Blueprint', ML, doc.y, { width: CW });

  // Divider
  const divY = doc.y + 22;
  doc.save().moveTo(ML, divY).lineTo(ML + 80, divY)
    .lineWidth(2).strokeColor(ACCENT).stroke().restore();

  // Metadata block
  const metaY = divY + 32;
  const col2  = ML + 140;

  doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.45)');

  const rows = [
    ['Version',        blueprint.version || '1.0'],
    ['Generated',      fmtDate(blueprint.generatedAt)],
    ['Last Updated',   fmtDate(blueprint.updatedAt)],
  ];

  rows.forEach(([label, value], i) => {
    const ry = metaY + i * 22;
    doc.text(label, ML, ry, { continued: false });
    doc.font('Helvetica-Bold').fillColor(WHITE).text(value, col2, ry);
    doc.font('Helvetica').fillColor('rgba(255,255,255,0.45)');
  });

  // Bottom confidential
  doc.font('Helvetica').fontSize(7.5).fillColor('rgba(255,255,255,0.3)');
  doc.text('CONFIDENTIAL — FOR AUTHORISED RECIPIENTS ONLY', ML, PAGE_H - 44, {
    width: CW, align: 'center',
  });
  doc.save().moveTo(ML, PAGE_H - 52).lineTo(ML + CW, PAGE_H - 52)
    .lineWidth(0.5).strokeColor('rgba(255,255,255,0.12)').stroke().restore();
}

// ── Table of contents ─────────────────────────────────────────────────────────

function renderTOC(doc, entries) {
  doc.y = MT;

  doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY);
  doc.text('Table of Contents', ML, doc.y);
  doc.moveDown(0.3);
  hLine(doc, doc.y, NAVY, 1.5);
  doc.moveDown(1.2);

  entries.forEach(({ title, page, level }) => {
    const indent  = level === 2 ? 18 : 0;
    const fontW   = level === 1 ? 'Helvetica-Bold' : 'Helvetica';
    const size    = level === 1 ? 10.5 : 9.5;
    const color   = level === 1 ? TEXT : MUTED;
    const topGap  = level === 1 ? 8 : 0;

    if (topGap) doc.moveDown(0.5);

    const y = doc.y;
    // Dotted leader line
    const titleW = CW - indent - 30;
    doc.font(fontW).fontSize(size).fillColor(color);
    doc.text(title, ML + indent, y, { width: titleW, lineBreak: false });

    // Page number right-aligned
    doc.font('Helvetica').fontSize(size).fillColor(MUTED);
    doc.text(String(page), ML, y, { width: CW, align: 'right', lineBreak: false });

    doc.moveDown(level === 1 ? 0.7 : 0.5);
  });
}

// ── Executive summary ─────────────────────────────────────────────────────────

function buildExecSummary(blueprint) {
  const completed = (blueprint.capabilities || []).filter(c => c.status === 'completed');

  // Strategic themes from capability names
  const themes = completed.map(c => c.capabilityName);

  // Key recommendations: first priorityAction from each capability (max 6)
  const recommendations = [];
  for (const cap of completed) {
    for (const sec of (cap.sections || [])) {
      const actions = sec.brief?.priorityActions || [];
      if (actions.length > 0) { recommendations.push(actions[0]); break; }
    }
    if (recommendations.length >= 6) break;
  }

  // Expected outcomes: first successMetric from each capability (max 6)
  const outcomes = [];
  for (const cap of completed) {
    for (const sec of (cap.sections || [])) {
      const metrics = sec.brief?.successMetrics || [];
      if (metrics.length > 0) { outcomes.push(metrics[0]); break; }
    }
    if (outcomes.length >= 6) break;
  }

  // Opening narrative: strategicPosition from first completed section
  let narrative = '';
  for (const cap of completed) {
    for (const sec of (cap.sections || [])) {
      const pos = sec.brief?.strategicPosition;
      if (pos) { narrative = pos; break; }
    }
    if (narrative) break;
  }

  return { themes, recommendations, outcomes, narrative };
}

function renderExecutiveSummary(doc, blueprint) {
  const { themes, recommendations, outcomes, narrative } = buildExecSummary(blueprint);

  // Title
  doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY);
  doc.text('Executive Summary', ML, doc.y);
  doc.moveDown(0.3);
  hLine(doc, doc.y, NAVY, 1.5);
  doc.moveDown(1.2);

  // Business Objective block
  sectionSubHead(doc, 'Business Objective');
  doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(
    blueprint.businessObjective || '—',
    ML, doc.y, { width: CW, lineGap: 3 }
  );
  doc.moveDown(1.2);

  // Strategic narrative (first paragraph of content)
  if (narrative) {
    sectionSubHead(doc, 'Strategic Foundation');
    doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(
      narrative, ML, doc.y, { width: CW, lineGap: 3 }
    );
    doc.moveDown(1.2);
  }

  // Strategic Themes
  if (themes.length > 0) {
    checkPageBreak(doc, themes.length * 16 + 40);
    sectionSubHead(doc, 'Capability Domains');
    themes.forEach((t, i) => bulletItem(doc, `${i + 1}.  ${t}`));
    doc.moveDown(1);
  }

  // Key Recommendations
  if (recommendations.length > 0) {
    checkPageBreak(doc, recommendations.length * 18 + 60);
    accentBlock(doc, 'Key Recommendations', recommendations);
    doc.moveDown(1);
  }

  // Expected Outcomes
  if (outcomes.length > 0) {
    checkPageBreak(doc, outcomes.length * 18 + 60);
    accentBlock(doc, 'Expected Outcomes', outcomes);
  }
}

// ── Capability + section renderers ────────────────────────────────────────────

function renderCapabilityHeader(doc, cap) {
  // Capability title
  doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY);
  doc.text(cap.capabilityName, ML, doc.y, { width: CW });
  doc.moveDown(0.25);
  hLine(doc, doc.y, NAVY, 1.5);
  doc.moveDown(0.4);

  if (cap.completedAt) {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
    doc.text(`Last updated: ${fmtDate(cap.completedAt)}`, ML, doc.y);
    doc.moveDown(1.2);
  } else {
    doc.moveDown(0.8);
  }
}

function renderSection(doc, section) {
  const brief = section.brief || {};
  if (!brief.strategicPosition) return;

  checkPageBreak(doc, 80);

  // Section title
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT);
  doc.text(section.title, ML, doc.y, { width: CW });
  doc.moveDown(0.25);
  hLine(doc, doc.y, ACCENT_BAR, 0.75);
  doc.moveDown(0.8);

  // Strategic position narrative
  doc.font('Helvetica').fontSize(10).fillColor(TEXT);
  doc.text(brief.strategicPosition, ML, doc.y, { width: CW, lineGap: 3 });
  doc.moveDown(1);

  // Section-specific structured content
  renderStructuredContent(doc, brief, section.title);

  // Priority Actions
  if ((brief.priorityActions || []).length > 0) {
    checkPageBreak(doc, brief.priorityActions.length * 18 + 50);
    accentBlock(doc, 'Priority Actions', brief.priorityActions);
    doc.moveDown(0.8);
  }

  // Success Indicators
  if ((brief.successMetrics || []).length > 0) {
    checkPageBreak(doc, brief.successMetrics.length * 18 + 50);
    accentBlock(doc, 'Success Indicators', brief.successMetrics, '#D1FAE5', '#065F46');
    doc.moveDown(0.8);
  }

  doc.moveDown(0.6);
  hLine(doc, doc.y, BORDER, 0.4);
  doc.moveDown(1.2);
}

// ── Structured content by section ─────────────────────────────────────────────

function renderStructuredContent(doc, brief, title) {
  switch (title) {
    case 'Vision':
      renderPillarList(doc, brief.strategicPillars, 'Strategic Pillars');
      renderKpiHighlights(doc, brief.kpiHighlights);
      break;

    case 'Alignment':
      renderTitleDescList(doc, brief.alignmentInitiatives, 'Alignment Initiatives');
      break;

    case 'Commitment':
      renderCommitmentPillars(doc, brief.commitmentPillars);
      renderTitleDescList(doc, brief.governanceNodes, 'Governance Structure');
      break;

    case 'Business-Led Roadmap':
      renderQuadrants(doc, brief.matrixQuadrants);
      renderQuarterlyPlan(doc, brief.quarterlyPlan);
      break;

    case 'Strategic Roadmap Design':
      renderFunnelStages(doc, brief.funnelStages);
      break;

    case 'Solution-Centric Organization':
      renderSolutionPortfolio(doc, brief.solutionPortfolio);
      break;

    case 'Cross-Functional Delivery Teams':
      renderTitleDescList(doc, brief.teamRoles, 'Team Roles');
      renderLifecycleStages(doc, brief.lifecycleStages);
      break;

    case 'End-to-End Ownership':
      renderWaterfallItems(doc, brief.waterfallItems);
      break;

    case 'Data Privacy & Security':
      renderNamedPillars(doc, brief.securityPillars, 'Security Pillars');
      break;

    case 'Ethical AI Guidelines':
      renderNamedPillars(doc, brief.ethicsPillars, 'Ethics Pillars');
      break;

    case 'Model Validation & Monitoring':
      renderNamedPillars(doc, brief.modelLifecycleStages, 'Model Lifecycle');
      break;

    case 'Regulatory Compliance':
      renderNamedPillars(doc, brief.complianceControls, 'Compliance Controls');
      break;

    case 'Trust & Adoption':
      renderNamedPillars(doc, brief.adoptionStages, 'Adoption Stages');
      break;

    default:
      break;
  }
}

// ── Sub-renderers ─────────────────────────────────────────────────────────────

function sectionSubHead(doc, label) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT);
  doc.text(label.toUpperCase(), ML, doc.y, { width: CW, characterSpacing: 0.6 });
  doc.moveDown(0.4);
}

function bulletItem(doc, text, indent = 0) {
  const x = ML + indent;
  doc.font('Helvetica').fontSize(10).fillColor(TEXT);
  doc.text(`•  ${text}`, x, doc.y, { width: CW - indent, lineGap: 2 });
}

function accentBlock(doc, label, items, bgColor = ACCENT_BAR, textColor = '#1E3A8A') {
  const lineH  = 16;
  const padV   = 10;
  const padH   = 14;
  const totalH = padV + items.length * lineH + padV;

  checkPageBreak(doc, totalH + 36);

  const bY = doc.y;
  // Left accent bar
  filledRect(doc, ML, bY, 3, totalH, ACCENT);
  // Background
  filledRect(doc, ML + 3, bY, CW - 3, totalH, bgColor);

  // Label
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor);
  doc.text(label.toUpperCase(), ML + padH, bY + padV - 1, {
    width: CW - padH, characterSpacing: 0.5, lineBreak: false,
  });

  // Items
  doc.font('Helvetica').fontSize(9.5).fillColor(TEXT);
  items.forEach((item, i) => {
    doc.text(`•  ${item}`, ML + padH, bY + padV + 14 + i * lineH, {
      width: CW - padH - 10, lineBreak: false,
    });
  });

  doc.y = bY + totalH + 6;
}

// Strategic pillars [{title, description, businessImpactTag}]
function renderPillarList(doc, pillars = [], label = 'Strategic Pillars') {
  if (!pillars || pillars.length === 0) return;
  checkPageBreak(doc, 60);
  sectionSubHead(doc, label);

  pillars.forEach((p, i) => {
    checkPageBreak(doc, 50);
    const tag = p.businessImpactTag ? `  [${p.businessImpactTag}]` : '';
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
    doc.text(`${i + 1}.  ${p.title || ''}${tag}`, ML, doc.y, { width: CW });
    if (p.description) {
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
      doc.text(p.description, ML + 14, doc.y, { width: CW - 14, lineGap: 2 });
    }
    doc.moveDown(0.6);
  });
  doc.moveDown(0.4);
}

// KPI highlights [{value, label, description}]
function renderKpiHighlights(doc, kpis = []) {
  if (!kpis || kpis.length === 0) return;
  checkPageBreak(doc, 60);
  sectionSubHead(doc, 'Key Performance Indicators');

  kpis.forEach(k => {
    checkPageBreak(doc, 32);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT);
    doc.text(`${k.value || ''}  `, ML, doc.y, { continued: true });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(k.label || '', { continued: false });
    if (k.description) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      doc.text(k.description, ML + 8, doc.y, { width: CW - 8, lineGap: 1 });
    }
    doc.moveDown(0.5);
  });
  doc.moveDown(0.4);
}

// Generic [{title, description}] list
function renderTitleDescList(doc, items = [], label = '') {
  if (!items || items.length === 0) return;
  checkPageBreak(doc, 60);
  if (label) sectionSubHead(doc, label);

  items.forEach(item => {
    checkPageBreak(doc, 40);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT);
    doc.text(item.title || item.name || '', ML, doc.y, { width: CW });
    if (item.description) {
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
      doc.text(item.description, ML + 10, doc.y, { width: CW - 10, lineGap: 2 });
    }
    doc.moveDown(0.7);
  });
  doc.moveDown(0.4);
}

// Commitment pillars [{title, actions[]}]
function renderCommitmentPillars(doc, pillars = []) {
  if (!pillars || pillars.length === 0) return;
  checkPageBreak(doc, 60);
  sectionSubHead(doc, 'Commitment Pillars');

  pillars.forEach(p => {
    checkPageBreak(doc, 50);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY);
    doc.text(p.title || '', ML, doc.y, { width: CW });
    doc.moveDown(0.25);
    (p.actions || []).forEach(a => bulletItem(doc, a, 10));
    doc.moveDown(0.6);
  });
  doc.moveDown(0.4);
}

// Matrix quadrants [{title, initiatives[]}]
function renderQuadrants(doc, quadrants = []) {
  if (!quadrants || quadrants.length === 0) return;
  checkPageBreak(doc, 80);
  sectionSubHead(doc, 'Priority Matrix');

  quadrants.forEach(q => {
    checkPageBreak(doc, 50);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT);
    doc.text(q.title || '', ML, doc.y, { width: CW });
    doc.moveDown(0.2);
    (q.initiatives || []).forEach(i => bulletItem(doc, i, 10));
    doc.moveDown(0.6);
  });
  doc.moveDown(0.4);
}

// Quarterly plan [{quarter, initiatives[]}]
function renderQuarterlyPlan(doc, plan = []) {
  if (!plan || plan.length === 0) return;
  checkPageBreak(doc, 80);
  sectionSubHead(doc, 'Quarterly Roadmap');

  plan.forEach(q => {
    checkPageBreak(doc, 50);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
    doc.text(q.quarter || '', ML, doc.y, { width: CW });
    doc.moveDown(0.2);
    (q.initiatives || []).forEach(i => bulletItem(doc, i, 10));
    doc.moveDown(0.6);
  });
  doc.moveDown(0.4);
}

// Funnel stages [string]
function renderFunnelStages(doc, stages = []) {
  if (!stages || stages.length === 0) return;
  checkPageBreak(doc, 60);
  sectionSubHead(doc, 'Roadmap Stages');

  stages.forEach((s, i) => {
    bulletItem(doc, `Stage ${i + 1}: ${s}`);
  });
  doc.moveDown(0.8);
}

// Solution portfolio [{name, businessOwner, deliveryTeam, kpis[]}]
function renderSolutionPortfolio(doc, portfolio = []) {
  if (!portfolio || portfolio.length === 0) return;
  checkPageBreak(doc, 100);
  sectionSubHead(doc, 'Solution Portfolio');

  portfolio.forEach(sol => {
    checkPageBreak(doc, 60);
    const boxY = doc.y;
    filledRect(doc, ML, boxY, CW, 1, BORDER);
    doc.moveDown(0.3);

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY);
    doc.text(sol.name || '—', ML, doc.y, { width: CW });
    doc.moveDown(0.2);

    const cols = [
      { label: 'Business Owner', value: sol.businessOwner },
      { label: 'Delivery Team',  value: sol.deliveryTeam  },
      { label: 'KPIs',           value: (sol.kpis || []).join(' · ') },
    ];
    cols.forEach(c => {
      if (!c.value) return;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
      doc.text(`${c.label}:  `, ML + 8, doc.y, { continued: true });
      doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(c.value, { continued: false });
    });
    doc.moveDown(0.6);
  });
  doc.moveDown(0.4);
}

// Team roles [{title, description}] (already handled by renderTitleDescList)

// Lifecycle stages [{stage, teamResponsibility, keyActivities}]
function renderLifecycleStages(doc, stages = []) {
  if (!stages || stages.length === 0) return;
  checkPageBreak(doc, 80);
  sectionSubHead(doc, 'Lifecycle Stages');

  stages.forEach(s => {
    checkPageBreak(doc, 50);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT);
    doc.text(s.stage || '', ML, doc.y, { width: CW });
    doc.moveDown(0.2);
    if (s.teamResponsibility) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED)
        .text('Team:  ', ML + 10, doc.y, { continued: true });
      doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(s.teamResponsibility);
    }
    if (s.keyActivities) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED)
        .text('Activities:  ', ML + 10, doc.y, { continued: true });
      doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(s.keyActivities);
    }
    doc.moveDown(0.6);
  });
  doc.moveDown(0.4);
}

// Waterfall items [{category, value, type, description}]
function renderWaterfallItems(doc, items = []) {
  if (!items || items.length === 0) return;
  checkPageBreak(doc, 80);
  sectionSubHead(doc, 'Value Breakdown');

  items.forEach(item => {
    checkPageBreak(doc, 36);
    const valueColor = item.type === 'gain' ? '#065F46' : '#991B1B';
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT);
    doc.text(`${item.category || ''}`, ML, doc.y, { continued: true });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(valueColor)
      .text(`  ${item.value || ''}`, { continued: false });
    if (item.description) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED)
        .text(item.description, ML + 10, doc.y, { width: CW - 10, lineGap: 1 });
    }
    doc.moveDown(0.5);
  });
  doc.moveDown(0.4);
}

// Named pillars [{name, points[]}] — shared by governance sections
function renderNamedPillars(doc, pillars = [], label = '') {
  if (!pillars || pillars.length === 0) return;
  checkPageBreak(doc, 60);
  if (label) sectionSubHead(doc, label);

  pillars.forEach(p => {
    checkPageBreak(doc, 50);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY);
    doc.text(p.name || p.title || '', ML, doc.y, { width: CW });
    doc.moveDown(0.2);
    (p.points || []).forEach(pt => bulletItem(doc, pt, 10));
    doc.moveDown(0.7);
  });
  doc.moveDown(0.4);
}

// ── Appendix ──────────────────────────────────────────────────────────────────

function renderAppendix(doc, blueprint) {
  doc.font('Helvetica-Bold').fontSize(22).fillColor(NAVY);
  doc.text('Appendix', ML, doc.y);
  doc.moveDown(0.3);
  hLine(doc, doc.y, NAVY, 1.5);
  doc.moveDown(1.2);

  // Blueprint Metadata
  sectionSubHead(doc, 'Blueprint Metadata');
  const meta = [
    ['Company',       blueprint.companyName || '—'],
    ['Industry',      blueprint.industry || '—'],
    ['Version',       blueprint.version || '1.0'],
    ['Generated',     fmtDate(blueprint.generatedAt)],
    ['Last Updated',  fmtDate(blueprint.updatedAt)],
    ['Status',        cap(blueprint.status || '—')],
  ];
  meta.forEach(([k, v]) => {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(MUTED)
      .text(`${k}:  `, ML, doc.y, { continued: true, width: 120 });
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(v);
  });
  doc.moveDown(1.2);

  // Capability Completion Status
  sectionSubHead(doc, 'Capability Completion Status');

  const headerY = doc.y;
  filledRect(doc, ML, headerY, CW, 20, '#F1F5F9');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
  doc.text('CAPABILITY', ML + 8, headerY + 6, { width: CW * 0.7 - 8, lineBreak: false });
  doc.text('STATUS', ML, headerY + 6, { width: CW - 8, align: 'right', lineBreak: false });
  doc.y = headerY + 22;

  (blueprint.capabilities || []).forEach((cap, i) => {
    checkPageBreak(doc, 20);
    if (i % 2 === 0) filledRect(doc, ML, doc.y, CW, 18, CARD_BG);
    const statusColor = cap.status === 'completed' ? '#065F46' : MUTED;
    doc.font('Helvetica').fontSize(9).fillColor(TEXT);
    doc.text(cap.capabilityName || '', ML + 8, doc.y + 4, { width: CW * 0.7 - 8, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor);
    doc.text(cap.status === 'completed' ? 'Complete' : cap.status || '—',
      ML, doc.y, { width: CW - 8, align: 'right', lineBreak: false });
    doc.y += 18;
  });
}

// ── Date formatter ────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ── Main export function ──────────────────────────────────────────────────────

export async function generateBlueprintPDF(blueprint) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MT, bottom: MB, left: ML, right: MR },
      bufferPages: true,
      info: {
        Title:    `AI Strategy Blueprint — ${blueprint.companyName || 'Company'}`,
        Author:   blueprint.companyName || '',
        Subject:  'AI Strategy Blueprint',
        Keywords: 'AI Strategy, Blueprint, Transformation',
      },
    });

    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let headerActive = false;
    let pageCounter  = 0; // 0 = cover (no page number), 1+ = numbered

    // Running header on every page except the cover
    doc.on('pageAdded', () => {
      if (!headerActive) return;
      renderRunningHeader(doc, blueprint.companyName || '');
    });

    // ── Cover ───────────────────────────────────────────────────────────────
    renderCoverPage(doc, blueprint);

    // ── TOC placeholder ─────────────────────────────────────────────────────
    headerActive = true;
    doc.addPage();
    const tocPageIdx = doc.bufferedPageRange().count - 1; // save index for later

    // ── Executive Summary ───────────────────────────────────────────────────
    const toc = [];
    doc.addPage();
    toc.push({ title: 'Executive Summary', page: doc.bufferedPageRange().count - 1, level: 1 });
    renderExecutiveSummary(doc, blueprint);

    // ── Capabilities ─────────────────────────────────────────────────────────
    const completed = (blueprint.capabilities || []).filter(c => c.status === 'completed');
    for (const cap of completed) {
      doc.addPage();
      toc.push({ title: cap.capabilityName, page: doc.bufferedPageRange().count - 1, level: 1 });
      renderCapabilityHeader(doc, cap);

      for (const section of (cap.sections || [])) {
        if (!section.brief?.strategicPosition) continue;
        toc.push({ title: section.title, page: doc.bufferedPageRange().count - 1, level: 2 });
        renderSection(doc, section);
      }
    }

    // ── Appendix ─────────────────────────────────────────────────────────────
    doc.addPage();
    toc.push({ title: 'Appendix', page: doc.bufferedPageRange().count - 1, level: 1 });
    renderAppendix(doc, blueprint);

    // ── Page numbers (all pages except cover) ────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      renderPageNumber(doc, i);
    }

    // ── Fill in TOC ──────────────────────────────────────────────────────────
    doc.switchToPage(range.start + tocPageIdx);
    renderTOC(doc, toc);

    doc.end();
  });
}
