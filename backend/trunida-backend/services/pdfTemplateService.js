/**
 * SoorgaAI — Blueprint PDF Template Service
 *
 * Generates a self-contained HTML string for Puppeteer to render as an
 * executive-ready Company AI Strategy Blueprint PDF.
 *
 * All SVG section builders from blueprintWorkspace.js are embedded via
 * Function.prototype.toString() so they run in Puppeteer's browser context.
 * All component CSS from domain.css is inlined so the PDF looks identical to the UI.
 */

// ── Date formatter ────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return '—'; }
}

// ── Builder functions (mirror of blueprintWorkspace.js — embedded in browser ctx) ─

function buildPillarsGrid(pillars) {
  const grid = document.createElement('div');
  grid.className = 'pillars-grid';
  pillars.forEach(function(p) {
    const card = document.createElement('div');
    card.className = 'pillar-card';
    const title = document.createElement('p');
    title.className = 'pillar-card__title';
    title.textContent = p.title;
    card.appendChild(title);
    const desc = document.createElement('p');
    desc.className = 'pillar-card__description';
    desc.textContent = p.description;
    card.appendChild(desc);
    if (p.businessImpactTag) {
      const tag = document.createElement('span');
      tag.className = 'pillar-card__tag';
      tag.textContent = p.businessImpactTag;
      card.appendChild(tag);
    }
    grid.appendChild(card);
  });
  return grid;
}

function buildKpiHighlights(highlights, label) {
  const wrap = document.createElement('div');
  wrap.className = 'kpi-highlights-wrap';
  const heading = document.createElement('p');
  heading.className = 'brief-label';
  heading.textContent = label || 'Success Metrics';
  wrap.appendChild(heading);
  const block = document.createElement('div');
  block.className = 'kpi-highlights';
  highlights.forEach(function(k) {
    const item = document.createElement('div');
    item.className = 'kpi-item';
    const value = document.createElement('p');
    value.className = 'kpi-item__value';
    value.textContent = k.value;
    const label = document.createElement('p');
    label.className = 'kpi-item__label';
    label.textContent = k.label;
    const desc = document.createElement('p');
    desc.className = 'kpi-item__description';
    desc.textContent = k.description;
    item.appendChild(value);
    item.appendChild(label);
    item.appendChild(desc);
    block.appendChild(item);
  });
  wrap.appendChild(block);
  return wrap;
}

function buildHorizontalTimeline(steps) {
  const block = document.createElement('div');
  block.className = 'h-timeline';
  const label = document.createElement('p');
  label.className = 'brief-label';
  label.textContent = 'Priority Timeline (90 Days)';
  block.appendChild(label);
  const track = document.createElement('div');
  track.className = 'h-timeline__track';
  steps.forEach(function(step, i) {
    const item = document.createElement('div');
    item.className = 'h-timeline__step';
    const num = document.createElement('span');
    num.className = 'h-timeline__step-num';
    num.textContent = String(i + 1);
    const stepLabel = document.createElement('span');
    stepLabel.className = 'h-timeline__step-label';
    stepLabel.textContent = step;
    item.appendChild(num);
    item.appendChild(stepLabel);
    track.appendChild(item);
  });
  block.appendChild(track);
  return block;
}

function buildSpokeWheel(nodes, centerLabel) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 300, H = 300, cx = 150, cy = 150;
  const spokeR = 105, centerR = 44, nodeR = 36;
  const n = nodes.length;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.classList.add('spoke-wheel');

  function wrapWords(text, maxPer) {
    const words = text.split(' ');
    const lines = [];
    for (let i = 0; i < words.length; i += maxPer) lines.push(words.slice(i, i + maxPer).join(' '));
    return lines;
  }

  function addText(parent, lines, x, y, fontSize, fill, lineH) {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('fill', fill);
    el.setAttribute('font-size', fontSize);
    el.setAttribute('font-weight', '600');
    el.setAttribute('font-family', 'inherit');
    const totalH = (lines.length - 1) * lineH;
    lines.forEach(function(line, i) {
      const ts = document.createElementNS(NS, 'tspan');
      ts.setAttribute('x', x);
      ts.setAttribute('y', y - totalH / 2 + i * lineH);
      ts.textContent = line;
      el.appendChild(ts);
    });
    parent.appendChild(el);
  }

  nodes.forEach(function(_, i) {
    const a = (2 * Math.PI / n) * i - Math.PI / 2;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', cx); line.setAttribute('y1', cy);
    line.setAttribute('x2', cx + spokeR * Math.cos(a));
    line.setAttribute('y2', cy + spokeR * Math.sin(a));
    line.setAttribute('stroke', 'rgba(99,102,241,0.3)');
    line.setAttribute('stroke-width', '1.5');
    svg.appendChild(line);
  });

  const cc = document.createElementNS(NS, 'circle');
  cc.setAttribute('cx', cx); cc.setAttribute('cy', cy); cc.setAttribute('r', centerR);
  cc.setAttribute('fill', 'rgba(99,102,241,0.18)');
  cc.setAttribute('stroke', 'rgba(99,102,241,0.55)');
  cc.setAttribute('stroke-width', '1.5');
  svg.appendChild(cc);
  addText(svg, wrapWords(centerLabel, 2), cx, cy, 6.5, 'rgba(255,255,255,0.92)', 8.5);

  nodes.forEach(function(label, i) {
    const a = (2 * Math.PI / n) * i - Math.PI / 2;
    const nx = cx + spokeR * Math.cos(a);
    const ny = cy + spokeR * Math.sin(a);
    const oc = document.createElementNS(NS, 'circle');
    oc.setAttribute('cx', nx); oc.setAttribute('cy', ny); oc.setAttribute('r', nodeR);
    oc.setAttribute('fill', 'rgba(255,255,255,0.04)');
    oc.setAttribute('stroke', 'rgba(99,102,241,0.28)');
    oc.setAttribute('stroke-width', '1');
    svg.appendChild(oc);
    addText(svg, wrapWords(label, 2), nx, ny, 6, 'rgba(255,255,255,0.72)', 8);
  });

  return svg;
}

function buildInitiativeCard(init, wide) {
  const card = document.createElement('div');
  card.className = 'initiative-card' + (wide ? ' initiative-card--wide' : '');
  const title = document.createElement('p');
  title.className = 'initiative-card__title';
  title.textContent = init.title;
  const desc = document.createElement('p');
  desc.className = 'initiative-card__description';
  desc.textContent = init.description;
  card.appendChild(title);
  card.appendChild(desc);
  return card;
}

function buildAlignmentLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'alignment-layout';

  const stmtBlock = document.createElement('div');
  stmtBlock.className = 'vision-statement';
  const stmtLabel = document.createElement('p');
  stmtLabel.className = 'brief-label';
  stmtLabel.textContent = 'Strategic Position';
  const stmtText = document.createElement('p');
  stmtText.className = 'vision-statement__text';
  stmtText.textContent = b.strategicPosition || '—';
  stmtBlock.appendChild(stmtLabel);
  stmtBlock.appendChild(stmtText);
  wrap.appendChild(stmtBlock);

  const body = document.createElement('div');
  body.className = 'alignment-body';

  const leftCol = document.createElement('div');
  leftCol.className = 'alignment-left';
  if (b.spokeNodes && b.spokeNodes.length) {
    leftCol.appendChild(buildSpokeWheel(b.spokeNodes, 'AI Transformation Agenda'));
  }
  body.appendChild(leftCol);

  if (b.alignmentInitiatives && b.alignmentInitiatives.length) {
    const col = document.createElement('div');
    col.className = 'alignment-initiatives';
    const gridItems = b.alignmentInitiatives.slice(0, 3);
    if (gridItems.length) {
      const grid = document.createElement('div');
      grid.className = 'initiative-grid';
      gridItems.forEach(function(init) { grid.appendChild(buildInitiativeCard(init)); });
      col.appendChild(grid);
    }
    const wideItem = b.alignmentInitiatives[3];
    if (wideItem) col.appendChild(buildInitiativeCard(wideItem, true));
    body.appendChild(col);
  }

  if (body.children.length) wrap.appendChild(body);
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildFunnelChart(stages) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 400, stageH = 65, gap = 8;
  const n = stages.length;
  const totalH = n * stageH + (n - 1) * gap;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + totalH);
  svg.classList.add('funnel-chart');

  const accentColors = ['rgba(129,140,248,0.85)', 'rgba(129,140,248,0.75)', 'rgba(167,139,250,0.75)', 'rgba(244,114,182,0.7)'];

  stages.forEach(function(stage, i) {
    const inset = i * 38;
    const nextInset = (i + 1) * 38;
    const topY = i * (stageH + gap);
    const botY = topY + stageH;
    const lxTop = 20 + inset, rxTop = W - 20 - inset;
    const lxBot = i < n - 1 ? 20 + nextInset : lxTop + 18;
    const rxBot = i < n - 1 ? W - 20 - nextInset : rxTop - 18;

    const poly = document.createElementNS(NS, 'polygon');
    poly.setAttribute('points', lxTop + ',' + topY + ' ' + rxTop + ',' + topY + ' ' + rxBot + ',' + botY + ' ' + lxBot + ',' + botY);
    poly.setAttribute('fill', 'rgba(99,102,241,' + (0.72 - i * 0.08) + ')');
    poly.setAttribute('stroke', 'rgba(129,140,248,0.2)');
    poly.setAttribute('stroke-width', '1');
    svg.appendChild(poly);

    const aw = Math.max(14, (rxTop - lxTop) * 0.06);
    const accentPoly = document.createElementNS(NS, 'polygon');
    accentPoly.setAttribute('points', (rxTop - aw) + ',' + topY + ' ' + rxTop + ',' + topY + ' ' + rxBot + ',' + botY + ' ' + (rxBot - aw) + ',' + botY);
    accentPoly.setAttribute('fill', accentColors[i] || accentColors[accentColors.length - 1]);
    svg.appendChild(accentPoly);

    const midX = (lxTop + rxTop) / 2;
    const midY = topY + stageH * 0.38;
    const countEl = document.createElementNS(NS, 'text');
    countEl.setAttribute('x', midX); countEl.setAttribute('y', midY);
    countEl.setAttribute('text-anchor', 'middle'); countEl.setAttribute('dominant-baseline', 'middle');
    countEl.setAttribute('font-size', '26'); countEl.setAttribute('font-weight', '700');
    countEl.setAttribute('fill', 'rgba(255,255,255,0.95)');
    countEl.textContent = stage.count;
    svg.appendChild(countEl);

    const labelEl = document.createElementNS(NS, 'text');
    labelEl.setAttribute('x', midX); labelEl.setAttribute('y', midY + 21);
    labelEl.setAttribute('text-anchor', 'middle'); labelEl.setAttribute('dominant-baseline', 'middle');
    labelEl.setAttribute('font-size', '11.5'); labelEl.setAttribute('fill', 'rgba(255,255,255,0.7)');
    labelEl.textContent = stage.label;
    svg.appendChild(labelEl);

    if (i < n - 1) {
      const connY = botY + gap / 2;
      const circ = document.createElementNS(NS, 'circle');
      circ.setAttribute('cx', W / 2); circ.setAttribute('cy', connY);
      circ.setAttribute('r', '3.5');
      circ.setAttribute('fill', 'rgba(129,140,248,0.85)');
      svg.appendChild(circ);
    }
  });

  return svg;
}

function buildPrioritizationMatrix(quadrants) {
  const wrap = document.createElement('div');
  wrap.className = 'priority-matrix';
  const yAxis = document.createElement('div');
  yAxis.className = 'matrix-y-axis';
  ['High', 'Business Impact', 'Low'].forEach(function(t, i) {
    const el = document.createElement('span');
    el.className = i === 1 ? 'matrix-axis-label' : 'matrix-axis-tick';
    el.textContent = t;
    yAxis.appendChild(el);
  });
  wrap.appendChild(yAxis);
  const content = document.createElement('div');
  content.className = 'matrix-content';
  const grid = document.createElement('div');
  grid.className = 'matrix-grid';
  quadrants.slice(0, 4).forEach(function(q) {
    const cell = document.createElement('div');
    cell.className = 'matrix-quadrant';
    const title = document.createElement('p');
    title.className = 'matrix-quadrant__title';
    title.textContent = q.title;
    cell.appendChild(title);
    if (q.initiatives && q.initiatives.length) {
      const items = document.createElement('p');
      items.className = 'matrix-quadrant__items';
      items.textContent = q.initiatives.join(', ');
      cell.appendChild(items);
    }
    grid.appendChild(cell);
  });
  content.appendChild(grid);
  const xAxis = document.createElement('div');
  xAxis.className = 'matrix-x-axis';
  ['Low', 'Readiness', 'High'].forEach(function(t, i) {
    const el = document.createElement('span');
    el.className = i === 1 ? 'matrix-axis-label' : 'matrix-axis-tick';
    el.textContent = t;
    xAxis.appendChild(el);
  });
  content.appendChild(xAxis);
  wrap.appendChild(content);
  return wrap;
}

function buildQuarterlyTimeline(plan) {
  const wrap = document.createElement('div');
  wrap.className = 'quarterly-timeline';
  plan.forEach(function(item, i) {
    const step = document.createElement('div');
    step.className = 'quarterly-timeline__step';
    const num = document.createElement('div');
    num.className = 'quarterly-timeline__num';
    num.textContent = String(i + 1);
    const quarter = document.createElement('div');
    quarter.className = 'quarterly-timeline__quarter';
    quarter.textContent = item.quarter;
    const inits = document.createElement('div');
    inits.className = 'quarterly-timeline__initiatives';
    (item.initiatives || []).forEach(function(init) {
      const p = document.createElement('p');
      p.className = 'quarterly-timeline__initiative';
      p.textContent = init;
      inits.appendChild(p);
    });
    step.appendChild(num);
    step.appendChild(quarter);
    step.appendChild(inits);
    wrap.appendChild(step);
  });
  return wrap;
}

function buildBusinessRoadmapLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'business-roadmap-layout';
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text';
  stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  if (b.funnelStages && b.funnelStages.length) {
    const funnelSection = document.createElement('div');
    funnelSection.className = 'roadmap-funnel-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'AI Opportunity Funnel';
    funnelSection.appendChild(lbl);
    const funnelWrap = document.createElement('div');
    funnelWrap.className = 'funnel-chart-wrap';
    funnelWrap.appendChild(buildFunnelChart(b.funnelStages));
    funnelSection.appendChild(funnelWrap);
    wrap.appendChild(funnelSection);
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildStrategicRoadmapLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'strategic-roadmap-layout';
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text';
  stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  if (b.matrixQuadrants && b.matrixQuadrants.length) {
    const matSection = document.createElement('div');
    matSection.className = 'roadmap-matrix-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Prioritization Matrix';
    matSection.appendChild(lbl);
    matSection.appendChild(buildPrioritizationMatrix(b.matrixQuadrants));
    wrap.appendChild(matSection);
  }
  if (b.quarterlyPlan && b.quarterlyPlan.length) {
    const qtSection = document.createElement('div');
    qtSection.className = 'roadmap-quarterly-section';
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = 'Quarterly Execution Timeline';
    qtSection.appendChild(lbl);
    qtSection.appendChild(buildQuarterlyTimeline(b.quarterlyPlan));
    wrap.appendChild(qtSection);
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildGovernanceTemple() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 230');
  svg.setAttribute('role', 'img');
  svg.classList.add('governance-temple');

  function mkRect(x, y, w, h, fill, rx) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('fill', fill);
    if (rx) r.setAttribute('rx', rx);
    return r;
  }
  function mkPoly(points, fill) {
    const p = document.createElementNS(NS, 'polygon');
    p.setAttribute('points', points); p.setAttribute('fill', fill);
    return p;
  }

  const dark = 'rgba(67,56,202,0.92)', mid = 'rgba(99,102,241,0.82)', light = 'rgba(129,140,248,0.45)';

  svg.appendChild(mkPoly('100,8 15,56 185,56', dark));
  svg.appendChild(mkRect(13, 56, 174, 14, mid, 2));
  [23, 62, 101, 140].forEach(function(x, i) {
    const fill = i % 2 === 0 ? 'rgba(99,102,241,0.68)' : 'rgba(99,102,241,0.55)';
    svg.appendChild(mkRect(x, 70, 27, 112, fill, 1));
    svg.appendChild(mkRect(x + 3, 70, 8, 112, light, 1));
  });
  svg.appendChild(mkRect(13, 182, 174, 11, mid, 2));
  svg.appendChild(mkRect(7, 193, 186, 15, dark, 3));

  return svg;
}

function buildGovernanceNode(node) {
  const div = document.createElement('div');
  div.className = 'commitment-governance-node';
  const title = document.createElement('p');
  title.className = 'commitment-governance-node__title';
  title.textContent = node.title;
  const desc = document.createElement('p');
  desc.className = 'commitment-governance-node__desc';
  desc.textContent = node.description;
  div.appendChild(title);
  div.appendChild(desc);
  return div;
}

function buildCommitmentLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'commitment-layout';

  const stmtBlock = document.createElement('div');
  stmtBlock.className = 'vision-statement';
  const stmtLabel = document.createElement('p');
  stmtLabel.className = 'brief-label'; stmtLabel.textContent = 'Strategic Position';
  const stmtText = document.createElement('p');
  stmtText.className = 'vision-statement__text'; stmtText.textContent = b.strategicPosition || '—';
  stmtBlock.appendChild(stmtLabel); stmtBlock.appendChild(stmtText);
  wrap.appendChild(stmtBlock);

  if (b.commitmentPillars && b.commitmentPillars.length) {
    const pillarsSection = document.createElement('div');
    pillarsSection.className = 'commitment-pillars-section';
    const pillarsHeading = document.createElement('p');
    pillarsHeading.className = 'brief-label'; pillarsHeading.textContent = 'Executive Commitment Pillars';
    const pillarsGrid = document.createElement('div');
    pillarsGrid.className = 'commitment-pillars';
    b.commitmentPillars.forEach(function(p) {
      const card = document.createElement('div');
      card.className = 'commitment-pillar-card';
      const title = document.createElement('p');
      title.className = 'commitment-pillar-card__title'; title.textContent = p.title;
      card.appendChild(title);
      if (p.actions && p.actions.length) {
        const ul = document.createElement('ul');
        ul.className = 'commitment-pillar-card__list';
        p.actions.forEach(function(a) {
          const li = document.createElement('li'); li.textContent = a; ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      pillarsGrid.appendChild(card);
    });
    pillarsSection.appendChild(pillarsHeading); pillarsSection.appendChild(pillarsGrid);
    wrap.appendChild(pillarsSection);
  }

  if (b.governanceNodes && b.governanceNodes.length) {
    const govSection = document.createElement('div');
    govSection.className = 'commitment-governance-section';
    const govHeading = document.createElement('p');
    govHeading.className = 'brief-label'; govHeading.textContent = 'Governance Structure';
    govSection.appendChild(govHeading);

    const templeWrap = document.createElement('div');
    templeWrap.className = 'commitment-governance-temple';

    const leftCol = document.createElement('div');
    leftCol.className = 'commitment-governance-nodes';
    [0, 2].forEach(function(i) { if (b.governanceNodes[i]) leftCol.appendChild(buildGovernanceNode(b.governanceNodes[i])); });

    const center = document.createElement('div');
    center.className = 'commitment-governance-center';
    center.appendChild(buildGovernanceTemple());

    const rightCol = document.createElement('div');
    rightCol.className = 'commitment-governance-nodes';
    [1, 3].forEach(function(i) { if (b.governanceNodes[i]) rightCol.appendChild(buildGovernanceNode(b.governanceNodes[i])); });

    templeWrap.appendChild(leftCol); templeWrap.appendChild(center); templeWrap.appendChild(rightCol);
    govSection.appendChild(templeWrap);
    wrap.appendChild(govSection);
  }

  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildSolutionPortfolioTree(solutions) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 460, H = 240;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('role', 'img');
  svg.classList.add('solution-portfolio-tree');

  var trunc = function(s, n) { return (s && s.length > n) ? s.slice(0, n) + '…' : (s || ''); };

  function mkRect(x, y, w, h, rx, fill, stroke) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', rx); r.setAttribute('fill', fill);
    if (stroke) { r.setAttribute('stroke', stroke); r.setAttribute('stroke-width', '1.5'); }
    return r;
  }
  function mkText(x, y, text, size, fill, weight) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-size', size); t.setAttribute('fill', fill);
    if (weight) t.setAttribute('font-weight', weight);
    t.textContent = text;
    return t;
  }
  function mkLine(x1, y1, x2, y2) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', 'rgba(99,102,241,0.4)');
    l.setAttribute('stroke-width', '1.5');
    return l;
  }
  function mkDot(cx, cy) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', '3'); c.setAttribute('fill', 'rgba(129,140,248,0.85)');
    return c;
  }

  const rootCx = W / 2, rootY = 8, rootW = 160, rootH = 36;
  svg.appendChild(mkRect(rootCx - rootW / 2, rootY, rootW, rootH, '18', 'rgba(99,102,241,0.12)', 'rgba(99,102,241,0.5)'));
  svg.appendChild(mkText(rootCx, rootY + rootH / 2, 'Solution Portfolio', '11', 'rgba(255,255,255,0.9)', '600'));

  const rootBot = rootY + rootH;
  const childCxs = [78, W / 2, W - 78];
  const childW = 124, childH = 30, childY = 78;
  const juncY = (rootBot + childY) / 2;

  svg.appendChild(mkLine(rootCx, rootBot, rootCx, juncY));
  svg.appendChild(mkLine(childCxs[0], juncY, childCxs[2], juncY));
  childCxs.forEach(function(cx) {
    svg.appendChild(mkLine(cx, juncY, cx, childY));
    svg.appendChild(mkDot(cx, juncY));
  });

  const subW = 124, subH = 34;
  const subYs = [118, 158, 198];

  childCxs.forEach(function(cx, i) {
    const sol = solutions[i] || {};
    const subEntries = [
      { label: 'Owner', value: sol.businessOwner || '—' },
      { label: 'Team',  value: sol.deliveryTeam  || '—' },
      { label: 'KPI',   value: (sol.kpis || []).join(' · ') || '—' },
    ];
    svg.appendChild(mkRect(cx - childW / 2, childY, childW, childH, '15', 'rgba(99,102,241,0.1)', 'rgba(99,102,241,0.4)'));
    svg.appendChild(mkText(cx, childY + childH / 2, trunc(sol.name || ('Solution ' + (i + 1)), 17), '9.5', 'rgba(255,255,255,0.88)', '600'));
    svg.appendChild(mkLine(cx, childY + childH, cx, subYs[0]));
    svg.appendChild(mkDot(cx, childY + childH));

    subEntries.forEach(function(e, j) {
      const sy = subYs[j];
      if (j > 0) svg.appendChild(mkLine(cx, subYs[j - 1] + subH, cx, sy));
      svg.appendChild(mkRect(cx - subW / 2, sy, subW, subH, '10', 'rgba(99,102,241,0.07)', 'rgba(99,102,241,0.28)'));
      svg.appendChild(mkText(cx, sy + 11, e.label, '7', 'rgba(255,255,255,0.42)'));
      svg.appendChild(mkText(cx, sy + 24, trunc(e.value, 18), '8', 'rgba(255,255,255,0.85)', '500'));
    });
  });

  return svg;
}

function buildSolutionCentricLayout(section) {
  var b = section.brief || {};
  var wrap = document.createElement('div');
  wrap.className = 'solution-centric-layout';

  var stmt = document.createElement('div'); stmt.className = 'vision-statement';
  var stmtLbl = document.createElement('p'); stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  var stmtTxt = document.createElement('p'); stmtTxt.className = 'vision-statement__text'; stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt); wrap.appendChild(stmt);

  // New format: single solution main card
  var sol = Array.isArray(b.solutionPortfolio) ? b.solutionPortfolio[0] : null;
  if (sol) {
    var portSec = document.createElement('div'); portSec.className = 'solution-portfolio-section';
    var portLbl = document.createElement('p'); portLbl.className = 'brief-label'; portLbl.textContent = 'Solution Portfolio';
    portSec.appendChild(portLbl);
    var mainCard = document.createElement('div'); mainCard.className = 'sol-main-card';
    var solName = document.createElement('p'); solName.className = 'sol-main-card__name'; solName.textContent = sol.name || '—';
    mainCard.appendChild(solName);
    var meta = document.createElement('div'); meta.className = 'sol-main-card__meta';
    if (sol.businessOwner) {
      var ownerRow = document.createElement('div'); ownerRow.className = 'sol-meta-row';
      ownerRow.innerHTML = '<span class="sol-meta-label">Owner</span><span class="sol-meta-value">' + sol.businessOwner + '</span>';
      meta.appendChild(ownerRow);
    }
    var teams = Array.isArray(sol.deliveryTeam) ? sol.deliveryTeam : String(sol.deliveryTeam || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    if (teams.length) {
      var teamRow = document.createElement('div'); teamRow.className = 'sol-meta-row sol-meta-row--chips';
      var teamLabel = document.createElement('span'); teamLabel.className = 'sol-meta-label'; teamLabel.textContent = 'Delivery Team';
      var chips = document.createElement('div'); chips.className = 'sol-chips';
      teams.forEach(function(t) { var chip = document.createElement('span'); chip.className = 'sol-team-chip'; chip.textContent = t; chips.appendChild(chip); });
      teamRow.appendChild(teamLabel); teamRow.appendChild(chips); meta.appendChild(teamRow);
    }
    var kpis = Array.isArray(sol.kpis) ? sol.kpis : [];
    if (kpis.length) {
      var kpiRow = document.createElement('div'); kpiRow.className = 'sol-meta-row sol-meta-row--chips';
      var kpiLabel = document.createElement('span'); kpiLabel.className = 'sol-meta-label'; kpiLabel.textContent = 'KPIs';
      var kpiChips = document.createElement('div'); kpiChips.className = 'sol-chips';
      kpis.forEach(function(k) { var chip = document.createElement('span'); chip.className = 'sol-kpi-chip'; chip.textContent = k; kpiChips.appendChild(chip); });
      kpiRow.appendChild(kpiLabel); kpiRow.appendChild(kpiChips); meta.appendChild(kpiRow);
    }
    mainCard.appendChild(meta); portSec.appendChild(mainCard); wrap.appendChild(portSec);
  }

  // Solution Components grid
  var components = Array.isArray(b.solutionComponents) ? b.solutionComponents : [];
  if (!components.length && Array.isArray(b.solutionPortfolio) && b.solutionPortfolio.length > 1) {
    components = b.solutionPortfolio.slice(1).map(function(p) { return { name: p.name || '—', purpose: p.businessOwner ? 'Owner: ' + p.businessOwner : '' }; });
  }
  if (components.length) {
    var compSec = document.createElement('div'); compSec.className = 'solution-portfolio-section';
    var compLbl = document.createElement('p'); compLbl.className = 'brief-label'; compLbl.textContent = 'Solution Components';
    compSec.appendChild(compLbl);
    var compGrid = document.createElement('div'); compGrid.className = 'sol-components-grid';
    components.forEach(function(comp) {
      var card = document.createElement('div'); card.className = 'sol-component-card';
      card.innerHTML = '<span class="sol-component-card__type">Capability</span>' +
        '<p class="sol-component-card__name">' + (comp.name || '—') + '</p>' +
        '<span class="sol-component-card__purpose-label">Purpose</span>' +
        '<p class="sol-component-card__purpose">' + (comp.purpose || '—') + '</p>';
      compGrid.appendChild(card);
    });
    compSec.appendChild(compGrid); wrap.appendChild(compSec);
  }

  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildTeamHierarchySvg() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 210');
  svg.setAttribute('role', 'img');
  svg.classList.add('team-hierarchy-svg');

  function mkNode(cx, y, w, h, label) {
    const g = document.createElementNS(NS, 'g');
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', cx - w / 2); rect.setAttribute('y', y);
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('rx', '10');
    rect.setAttribute('fill', 'rgba(99,102,241,0.14)');
    rect.setAttribute('stroke', 'rgba(99,102,241,0.4)');
    rect.setAttribute('stroke-width', '1.5');
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', cx); text.setAttribute('y', y + h / 2 + 1);
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '10'); text.setAttribute('fill', 'rgba(255,255,255,0.85)');
    text.setAttribute('font-weight', '500');
    text.textContent = label;
    g.appendChild(rect); g.appendChild(text);
    return g;
  }
  function mkLine(x1, y1, x2, y2) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', 'rgba(99,102,241,0.45)');
    line.setAttribute('stroke-width', '1.5');
    return line;
  }
  function mkDot(cx, cy) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', '3'); c.setAttribute('fill', 'rgba(129,140,248,0.8)');
    return c;
  }

  const y1 = 10, h1 = 34, cx1 = 160;
  const y2 = 82, h2 = 30;
  const y3 = 152, h3 = 28;
  const midXs = [65, 160, 255];
  const midLabels = ['Business Lead', 'Data/AI Specialist', 'Engineering Lead'];
  const botLabels = ['Domain Expert', 'Architect', 'QA / Test'];
  const midY = (y1 + h1 + y2) / 2;

  svg.appendChild(mkLine(cx1, y1 + h1, cx1, midY));
  svg.appendChild(mkLine(midXs[0], midY, midXs[2], midY));
  midXs.forEach(function(x) { svg.appendChild(mkLine(x, midY, x, y2)); svg.appendChild(mkDot(x, midY)); });
  midXs.forEach(function(x) { svg.appendChild(mkLine(x, y2 + h2, x, y3)); svg.appendChild(mkDot(x, y2 + h2)); });
  svg.appendChild(mkNode(cx1, y1, 115, h1, 'Product Owner'));
  midXs.forEach(function(x, i) { svg.appendChild(mkNode(x, y2, 96, h2, midLabels[i])); });
  midXs.forEach(function(x, i) { svg.appendChild(mkNode(x, y3, 96, h3, botLabels[i])); });

  return svg;
}

function buildCrossFunctionalLayout(section) {
  var b = section.brief || {};
  var wrap = document.createElement('div');
  wrap.className = 'cross-functional-layout';

  var stmt = document.createElement('div'); stmt.className = 'vision-statement';
  var stmtLbl = document.createElement('p'); stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  var stmtTxt = document.createElement('p'); stmtTxt.className = 'vision-statement__text'; stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt); wrap.appendChild(stmt);

  var teamSec = document.createElement('div'); teamSec.className = 'team-structure-section';
  var teamLbl = document.createElement('p'); teamLbl.className = 'brief-label'; teamLbl.textContent = 'Delivery Team';
  teamSec.appendChild(teamLbl);

  var groups = (Array.isArray(b.teamGroups) && b.teamGroups.length) ? b.teamGroups : null;
  var legacyRoles = Array.isArray(b.teamRoles) ? b.teamRoles : [];

  if (groups) {
    // New format: teamGroups grid
    var grid = document.createElement('div'); grid.className = 'team-groups-grid';
    groups.forEach(function(g) {
      var card = document.createElement('div'); card.className = 'team-group-card';
      var glbl = document.createElement('p'); glbl.className = 'team-group-card__label'; glbl.textContent = g.group || '—';
      card.appendChild(glbl);
      var roleList = document.createElement('ul'); roleList.className = 'team-group-card__roles';
      (g.roles || []).forEach(function(r) { var li = document.createElement('li'); li.textContent = r; roleList.appendChild(li); });
      card.appendChild(roleList); grid.appendChild(card);
    });
    teamSec.appendChild(grid);
  } else if (legacyRoles.length) {
    // Legacy: flat teamRoles as group cards
    var roleGrid = document.createElement('div'); roleGrid.className = 'team-groups-grid';
    legacyRoles.forEach(function(role) {
      var roleObj = typeof role === 'object' ? role : { title: String(role), description: '' };
      var card = document.createElement('div'); card.className = 'team-group-card';
      var rName = document.createElement('p'); rName.className = 'team-group-card__label'; rName.textContent = roleObj.title || roleObj.role || roleObj.name || String(role);
      card.appendChild(rName);
      if (roleObj.description || roleObj.responsibility) {
        var ul = document.createElement('ul'); ul.className = 'team-group-card__roles';
        var li = document.createElement('li'); li.textContent = roleObj.description || roleObj.responsibility;
        ul.appendChild(li); card.appendChild(ul);
      }
      roleGrid.appendChild(card);
    });
    teamSec.appendChild(roleGrid);
  } else {
    // Oldest legacy: SVG hierarchy + no teamRoles
    var compSec = document.createElement('div'); compSec.className = 'team-composition-section';
    var svgWrap = document.createElement('div'); svgWrap.className = 'team-hierarchy-wrap';
    svgWrap.appendChild(buildTeamHierarchySvg());
    compSec.appendChild(svgWrap); teamSec.appendChild(compSec);
  }

  wrap.appendChild(teamSec);
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildLifecycleLoop(stages) {
  const wrap = document.createElement('div');
  wrap.className = 'lifecycle-loop';
  stages.forEach(function(stage, i) {
    const node = document.createElement('div');
    node.className = 'lifecycle-loop__node';
    node.textContent = stage.stage;
    wrap.appendChild(node);
    if (i < stages.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'lifecycle-loop__arrow';
      wrap.appendChild(arrow);
    }
  });
  return wrap;
}

function buildEndToEndOwnershipLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'end-to-end-layout';

  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text'; stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  if (b.lifecycleStages && b.lifecycleStages.length) {
    const loopSection = document.createElement('div');
    loopSection.className = 'lifecycle-section';
    const loopLbl = document.createElement('p');
    loopLbl.className = 'brief-label'; loopLbl.textContent = 'Lifecycle Ownership Loop';
    loopSection.appendChild(loopLbl);
    loopSection.appendChild(buildLifecycleLoop(b.lifecycleStages));
    wrap.appendChild(loopSection);

    const detailSection = document.createElement('div');
    detailSection.className = 'lifecycle-details-section';
    const detailLbl = document.createElement('p');
    detailLbl.className = 'brief-label'; detailLbl.textContent = 'Ownership Model Details';
    detailSection.appendChild(detailLbl);
    const details = document.createElement('div');
    details.className = 'lifecycle-details';
    b.lifecycleStages.forEach(function(stage) {
      const card = document.createElement('div');
      card.className = 'lifecycle-detail-card';
      const stageName = document.createElement('p');
      stageName.className = 'lifecycle-detail-card__stage'; stageName.textContent = stage.stage;
      card.appendChild(stageName);
      if (stage.teamResponsibility) {
        const resp = document.createElement('p');
        resp.className = 'lifecycle-detail-card__resp'; resp.textContent = stage.teamResponsibility;
        card.appendChild(resp);
      }
      if (stage.keyActivities) {
        const act = document.createElement('p');
        act.className = 'lifecycle-detail-card__activities'; act.textContent = stage.keyActivities;
        card.appendChild(act);
      }
      details.appendChild(card);
    });
    detailSection.appendChild(details);
    wrap.appendChild(detailSection);
  }

  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildPillChain(items, labelKey) {
  const wrap = document.createElement('div');
  wrap.className = 'lifecycle-loop';
  items.forEach(function(item, i) {
    const node = document.createElement('div');
    node.className = 'lifecycle-loop__node';
    node.textContent = (typeof item === 'string' ? item : item[labelKey]) || '';
    wrap.appendChild(node);
    if (i < items.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'lifecycle-loop__arrow';
      wrap.appendChild(arrow);
    }
  });
  return wrap;
}

function buildSdlcPipeline(stages) {
  const wrap = document.createElement('div');
  wrap.className = 'sdlc-pipeline';
  stages.forEach(function(stage, i) {
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'sdlc-pipeline__arrow'; arrow.textContent = '→';
      wrap.appendChild(arrow);
    }
    const pill = document.createElement('div');
    pill.className = 'sdlc-pipeline__stage';
    const name = document.createElement('span');
    name.className = 'sdlc-pipeline__stage-name'; name.textContent = stage.stage;
    const tool = document.createElement('span');
    tool.className = 'sdlc-pipeline__stage-tool';
    tool.textContent = stage.aiTool ? 'with ' + stage.aiTool : '';
    pill.appendChild(name); pill.appendChild(tool);
    wrap.appendChild(pill);
  });
  return wrap;
}

function buildPillarBulletCards(items, labelKey) {
  const list = document.createElement('div');
  list.className = 'detail-bullet-list';
  items.forEach(function(item) {
    const card = document.createElement('div');
    card.className = 'detail-bullet-card';
    const title = document.createElement('p');
    title.className = 'detail-bullet-card__title'; title.textContent = item[labelKey] || '';
    card.appendChild(title);
    const points = Array.isArray(item.points) ? item.points : [];
    if (points.length) {
      const ul = document.createElement('ul');
      ul.className = 'detail-bullet-card__list';
      points.forEach(function(pt) {
        const li = document.createElement('li'); li.textContent = String(pt); ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    list.appendChild(card);
  });
  return list;
}

function buildWaterfallSvg(items) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 480, H = 240;
  const padL = 14, padR = 14, padT = 20, padB = 58;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const vals = items.map(function(it) { return parseFloat(it.value) || 0; });
  let running = 0;
  const bars = items.map(function(it, i) {
    const v = vals[i];
    let low, high;
    if (it.type === 'total') { low = 0; high = running + v; }
    else if (it.type === 'negative') { high = running; low = running + v; running += v; }
    else { low = running; high = running + v; running += v; }
    return Object.assign({}, it, { low: low, high: high });
  });

  const allVals = bars.reduce(function(a, b) { return a.concat([b.low, b.high, 0]); }, []);
  const minV = Math.min.apply(null, allVals);
  const maxV = Math.max.apply(null, allVals);
  const range = maxV - minV || 1;
  function toY(v) { return padT + chartH - ((v - minV) / range) * chartH; }

  const n = items.length;
  const slotW = chartW / n;
  const barW = slotW * 0.58;
  function barX(i) { return padL + i * slotW + (slotW - barW) / 2; }

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.classList.add('waterfall-svg');

  [0, 0.25, 0.5, 0.75, 1].forEach(function(t) {
    const gv = minV + t * range, gy = toY(gv);
    const gl = document.createElementNS(NS, 'line');
    gl.setAttribute('x1', padL); gl.setAttribute('y1', gy);
    gl.setAttribute('x2', W - padR); gl.setAttribute('y2', gy);
    gl.setAttribute('stroke', Math.abs(gv) < 0.01 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)');
    gl.setAttribute('stroke-width', '1');
    svg.appendChild(gl);
  });

  bars.forEach(function(b, i) {
    if (i >= bars.length - 1) return;
    const next = bars[i + 1];
    if (next.type === 'total') return;
    const connY = b.type === 'negative' ? toY(b.low) : toY(b.high);
    const dash = document.createElementNS(NS, 'line');
    dash.setAttribute('x1', barX(i) + barW); dash.setAttribute('y1', connY);
    dash.setAttribute('x2', barX(i + 1));     dash.setAttribute('y2', connY);
    dash.setAttribute('stroke', 'rgba(129,140,248,0.4)');
    dash.setAttribute('stroke-width', '1');
    dash.setAttribute('stroke-dasharray', '4,3');
    svg.appendChild(dash);
  });

  bars.forEach(function(b, i) {
    const x = barX(i), y1 = toY(b.high), y2 = toY(b.low);
    const bH = Math.max(y2 - y1, 3);
    const fill = b.type === 'negative' ? 'rgba(79,70,229,0.82)' : b.type === 'total' ? 'rgba(99,102,241,0.95)' : 'rgba(129,140,248,0.6)';
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y1);
    rect.setAttribute('width', barW); rect.setAttribute('height', bH);
    rect.setAttribute('fill', fill); rect.setAttribute('rx', '3');
    svg.appendChild(rect);

    const labelY = b.type === 'negative' ? toY(b.low) + 11 : toY(b.high) - 5;
    const vl = document.createElementNS(NS, 'text');
    vl.setAttribute('x', x + barW / 2); vl.setAttribute('y', labelY);
    vl.setAttribute('text-anchor', 'middle');
    vl.setAttribute('font-size', '9'); vl.setAttribute('fill', 'rgba(255,255,255,0.78)');
    vl.textContent = b.value;
    svg.appendChild(vl);
  });

  bars.forEach(function(b, i) {
    const cx = barX(i) + barW / 2;
    const words = (b.category || '').split(' ');
    const line1 = words.slice(0, 2).join(' ');
    const line2 = words.slice(2).join(' ');
    const t1 = document.createElementNS(NS, 'text');
    t1.setAttribute('x', cx); t1.setAttribute('y', H - padB + 14);
    t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('font-size', '8.5'); t1.setAttribute('fill', 'rgba(255,255,255,0.5)');
    t1.textContent = line1;
    svg.appendChild(t1);
    if (line2) {
      const t2 = document.createElementNS(NS, 'text');
      t2.setAttribute('x', cx); t2.setAttribute('y', H - padB + 26);
      t2.setAttribute('text-anchor', 'middle');
      t2.setAttribute('font-size', '8.5'); t2.setAttribute('fill', 'rgba(255,255,255,0.5)');
      t2.textContent = line2;
      svg.appendChild(t2);
    }
  });

  return svg;
}

function buildStrategicPositionBlock(position) {
  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const lbl = document.createElement('p');
  lbl.className = 'brief-label'; lbl.textContent = 'Strategic Position';
  const txt = document.createElement('p');
  txt.className = 'vision-statement__text'; txt.textContent = position || '—';
  stmt.appendChild(lbl); stmt.appendChild(txt);
  return stmt;
}

function buildDiagramSection(label, panelContent, panelClass) {
  const section = document.createElement('div');
  section.className = 'cto-diagram-section';
  const lbl = document.createElement('p');
  lbl.className = 'brief-label'; lbl.textContent = label;
  section.appendChild(lbl);
  const panel = document.createElement('div');
  panel.className = panelClass || 'cto-diagram-panel';
  panel.appendChild(panelContent);
  section.appendChild(panel);
  return section;
}

function buildDetailSection(label, listEl) {
  const section = document.createElement('div');
  section.className = 'cto-detail-section';
  const lbl = document.createElement('p');
  lbl.className = 'brief-label'; lbl.textContent = label;
  section.appendChild(lbl);
  section.appendChild(listEl);
  return section;
}

function buildFinancialPerformanceLayout(section) {
  var b = section.brief || {};
  var wrap = document.createElement('div');
  wrap.className = 'financial-performance-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // New format: ROI Summary 4-col stat row
  if (b.roiSummary) {
    var roiSec = document.createElement('div'); roiSec.className = 'roi-section';
    var roiLbl = document.createElement('p'); roiLbl.className = 'brief-label'; roiLbl.textContent = 'Executive ROI Summary';
    roiSec.appendChild(roiLbl);
    var roiRow = document.createElement('div'); roiRow.className = 'roi-summary-row';
    [
      { label: 'Investment',     value: b.roiSummary.investment },
      { label: 'Annual Value',   value: b.roiSummary.annualValue },
      { label: 'Payback',        value: b.roiSummary.payback },
      { label: 'Recommendation', value: b.roiSummary.recommendation },
    ].forEach(function(f) {
      var card = document.createElement('div');
      var r = String(f.value || '').toLowerCase();
      var mod = r === 'proceed' ? 'roi-summary-card--proceed' : r.indexOf('pilot') === 0 ? 'roi-summary-card--pilot' : r === 'reassess' ? 'roi-summary-card--reassess' : '';
      card.className = 'roi-summary-card' + (mod ? ' ' + mod : '');
      var val = document.createElement('p'); val.className = 'roi-summary-card__value'; val.textContent = f.value || '—';
      var lbl = document.createElement('p'); lbl.className = 'roi-summary-card__label'; lbl.textContent = f.label;
      card.appendChild(val); card.appendChild(lbl); roiRow.appendChild(card);
    });
    roiSec.appendChild(roiRow); wrap.appendChild(roiSec);
  }

  // Cost / Value two-column
  var costItems  = Array.isArray(b.costItems)  ? b.costItems  : [];
  var valueItems = Array.isArray(b.valueItems) ? b.valueItems : [];
  if (costItems.length || valueItems.length) {
    var cvGrid = document.createElement('div'); cvGrid.className = 'roi-cost-value-grid';
    function buildRoiCol(cls, header, items) {
      var col = document.createElement('div'); col.className = cls;
      var hdr = document.createElement('p'); hdr.className = 'roi-col-header'; hdr.textContent = header;
      col.appendChild(hdr);
      var ul = document.createElement('ul'); ul.className = 'roi-col-list';
      items.forEach(function(item) { var li = document.createElement('li'); li.textContent = item; ul.appendChild(li); });
      col.appendChild(ul); return col;
    }
    cvGrid.appendChild(buildRoiCol('roi-cost-col',  'Where the Money Goes',       costItems));
    cvGrid.appendChild(buildRoiCol('roi-value-col', 'Where the Value Comes From', valueItems));
    wrap.appendChild(cvGrid);
  }

  // Financial Impact Timeline
  var timeline = Array.isArray(b.impactTimeline) ? b.impactTimeline : [];
  if (timeline.length) {
    var tlSec = document.createElement('div'); tlSec.className = 'roi-section';
    var tlLbl = document.createElement('p'); tlLbl.className = 'brief-label'; tlLbl.textContent = 'Financial Impact Timeline';
    tlSec.appendChild(tlLbl);
    var tlFlow = document.createElement('div'); tlFlow.className = 'roi-timeline';
    timeline.forEach(function(stage, i) {
      var node = document.createElement('div'); node.className = 'roi-timeline__stage'; node.textContent = stage;
      tlFlow.appendChild(node);
      if (i < timeline.length - 1) {
        var arrow = document.createElement('span'); arrow.className = 'roi-timeline__arrow'; arrow.textContent = '→';
        tlFlow.appendChild(arrow);
      }
    });
    tlSec.appendChild(tlFlow); wrap.appendChild(tlSec);
  }

  // Fallback: old waterfall
  if (!b.roiSummary && b.waterfallItems && b.waterfallItems.length) {
    wrap.appendChild(buildDiagramSection('Value Waterfall Visualization', buildWaterfallSvg(b.waterfallItems)));
    var wfList = document.createElement('div'); wfList.className = 'detail-bullet-list';
    b.waterfallItems.filter(function(it) { return it.description; }).forEach(function(it) {
      var card = document.createElement('div'); card.className = 'detail-bullet-card';
      var t = document.createElement('p'); t.className = 'detail-bullet-card__title'; t.textContent = it.category;
      card.appendChild(t);
      var d = document.createElement('p'); d.className = 'detail-bullet-card__desc'; d.textContent = it.description;
      card.appendChild(d); wfList.appendChild(card);
    });
    wrap.appendChild(buildDetailSection('Financial Breakdown', wfList));
  }

  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildOperationalExcellenceLayout(section) {
  var b = section.brief || {};
  var wrap = document.createElement('div');
  wrap.className = 'operational-excellence-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // New format: Improvement Scorecard table
  var scorecard = Array.isArray(b.improvementScorecard) ? b.improvementScorecard : [];
  if (scorecard.length) {
    var sec = document.createElement('div'); sec.className = 'roi-section';
    var lbl = document.createElement('p'); lbl.className = 'brief-label'; lbl.textContent = 'Improvement Scorecard';
    sec.appendChild(lbl);
    var table = document.createElement('div'); table.className = 'oe-scorecard';
    var hdr = document.createElement('div'); hdr.className = 'oe-scorecard__row oe-scorecard__row--header';
    ['Area', 'Before AI', 'After AI', 'Business Benefit'].forEach(function(h) {
      var cell = document.createElement('div'); cell.className = 'oe-scorecard__cell'; cell.textContent = h;
      hdr.appendChild(cell);
    });
    table.appendChild(hdr);
    scorecard.forEach(function(row) {
      var r = document.createElement('div'); r.className = 'oe-scorecard__row';
      [
        { text: row.area,            cls: 'oe-scorecard__cell--area' },
        { text: row.beforeAI,        cls: 'oe-scorecard__cell--before' },
        { text: row.afterAI,         cls: 'oe-scorecard__cell--after' },
        { text: row.businessBenefit, cls: 'oe-scorecard__cell--benefit' },
      ].forEach(function(f) {
        var cell = document.createElement('div'); cell.className = 'oe-scorecard__cell ' + f.cls; cell.textContent = f.text || '—';
        r.appendChild(cell);
      });
      table.appendChild(r);
    });
    sec.appendChild(table); wrap.appendChild(sec);
  } else {
    // Fallback: legacy SDLC / impact areas
    var impactAreas = Array.isArray(b.impactAreas) ? b.impactAreas : [];
    if (impactAreas.length) {
      var impSec = document.createElement('div'); impSec.className = 'roi-section';
      var impLbl = document.createElement('p'); impLbl.className = 'brief-label'; impLbl.textContent = 'Operational Impact Areas';
      impSec.appendChild(impLbl);
      var impGrid = document.createElement('div'); impGrid.className = 'oe-impact-grid';
      impactAreas.forEach(function(area) {
        var card = document.createElement('div'); card.className = 'oe-impact-card';
        var title = document.createElement('p'); title.className = 'oe-impact-card__title'; title.textContent = area.name || '—';
        card.appendChild(title);
        var ul = document.createElement('ul'); ul.className = 'oe-impact-card__list';
        (area.points || []).forEach(function(pt) { var li = document.createElement('li'); li.textContent = pt; ul.appendChild(li); });
        card.appendChild(ul); impGrid.appendChild(card);
      });
      impSec.appendChild(impGrid); wrap.appendChild(impSec);
    }
    if (b.sdlcStages && b.sdlcStages.length) {
      wrap.appendChild(buildDiagramSection('SDLC Performance Dashboard', buildSdlcPipeline(b.sdlcStages)));
      var sdlcList = document.createElement('div'); sdlcList.className = 'detail-bullet-list';
      b.sdlcStages.forEach(function(stage) {
        var card = document.createElement('div'); card.className = 'detail-bullet-card';
        var t = document.createElement('p'); t.className = 'detail-bullet-card__title'; t.textContent = stage.stage;
        card.appendChild(t);
        if (stage.description) { var d = document.createElement('p'); d.className = 'detail-bullet-card__desc'; d.textContent = stage.description; card.appendChild(d); }
        sdlcList.appendChild(card);
      });
      wrap.appendChild(buildDetailSection('SDLC Stage Details', sdlcList));
    }
    if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  }
  return wrap;
}

function buildCustomerValueLayout(section) {
  var b = section.brief || {};
  var wrap = document.createElement('div');
  wrap.className = 'customer-value-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // New format: Customer Value Journey vertical flow
  var journey = Array.isArray(b.valueJourney) ? b.valueJourney : [];
  if (journey.length) {
    var jSec = document.createElement('div'); jSec.className = 'roi-section';
    var jLbl = document.createElement('p'); jLbl.className = 'brief-label'; jLbl.textContent = 'Customer Value Journey';
    jSec.appendChild(jLbl);
    var flow = document.createElement('div'); flow.className = 'cv-journey';
    journey.forEach(function(stage, i) {
      var node = document.createElement('div'); node.className = 'cv-journey__stage'; node.textContent = stage;
      flow.appendChild(node);
      if (i < journey.length - 1) {
        var arrow = document.createElement('div'); arrow.className = 'cv-journey__arrow'; arrow.textContent = '↓';
        flow.appendChild(arrow);
      }
    });
    jSec.appendChild(flow); wrap.appendChild(jSec);
  }

  // Value Dimensions grid
  var dims = Array.isArray(b.valueDimensions) ? b.valueDimensions : [];
  if (dims.length) {
    var dSec = document.createElement('div'); dSec.className = 'roi-section';
    var dLbl = document.createElement('p'); dLbl.className = 'brief-label'; dLbl.textContent = 'Customer Value Dimensions';
    dSec.appendChild(dLbl);
    var dGrid = document.createElement('div'); dGrid.className = 'cv-value-grid';
    dims.forEach(function(dim) {
      var card = document.createElement('div'); card.className = 'cv-value-card';
      var title = document.createElement('p'); title.className = 'cv-value-card__title'; title.textContent = dim.name || '—';
      card.appendChild(title);
      var ul = document.createElement('ul'); ul.className = 'cv-value-card__list';
      (dim.points || []).forEach(function(pt) { var li = document.createElement('li'); li.textContent = pt; ul.appendChild(li); });
      card.appendChild(ul); dGrid.appendChild(card);
    });
    dSec.appendChild(dGrid); wrap.appendChild(dSec);
  }

  // Customer KPIs
  var custKpis = (Array.isArray(b.customerKpis) && b.customerKpis.length) ? b.customerKpis : (b.kpiHighlights || []);
  if (custKpis.length) {
    var kSec = document.createElement('div'); kSec.className = 'roi-section';
    var kLbl = document.createElement('p'); kLbl.className = 'brief-label'; kLbl.textContent = 'Customer Success Metrics';
    kSec.appendChild(kLbl);
    var kGrid = document.createElement('div'); kGrid.className = 'cv-kpi-grid';
    custKpis.forEach(function(k) {
      var card = document.createElement('div'); card.className = 'kpi-highlight-card';
      var val = document.createElement('p'); val.className = 'kpi-highlight-card__value'; val.textContent = k.value || '—';
      var label = document.createElement('p'); label.className = 'kpi-highlight-card__label'; label.textContent = k.label || '';
      var desc = document.createElement('p'); desc.className = 'kpi-highlight-card__desc'; desc.textContent = k.description || '';
      card.appendChild(val); card.appendChild(label); card.appendChild(desc); kGrid.appendChild(card);
    });
    kSec.appendChild(kGrid); wrap.appendChild(kSec);
  }

  // Fallback: legacy flywheel
  if (!journey.length && b.flywheelStages && b.flywheelStages.length) {
    wrap.appendChild(buildDiagramSection('Customer Value Flywheel', buildPillChain(b.flywheelStages, 'name')));
    wrap.appendChild(buildDetailSection('Customer Value Details', buildPillarBulletCards(b.flywheelStages, 'name')));
  }
  return wrap;
}

function buildDataPrivacyLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'data-privacy-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.securityPillars && b.securityPillars.length) {
    wrap.appendChild(buildDiagramSection('Security-by-Design Framework', buildSpokeWheel(b.securityPillars.map(function(p) { return p.name; }), 'Secure AI Delivery'), 'cto-spoke-panel'));
    wrap.appendChild(buildDetailSection('Security Pillar Details', buildPillarBulletCards(b.securityPillars, 'name')));
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildEthicalAILayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'ethical-ai-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.ethicsPillars && b.ethicsPillars.length) {
    wrap.appendChild(buildDiagramSection('Responsible AI Framework', buildSpokeWheel(b.ethicsPillars.map(function(p) { return p.name; }), 'Responsible AI'), 'cto-spoke-panel'));
    wrap.appendChild(buildDetailSection('Responsible AI Pillar Details', buildPillarBulletCards(b.ethicsPillars, 'name')));
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildModelValidationLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'model-validation-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.modelLifecycleStages && b.modelLifecycleStages.length) {
    wrap.appendChild(buildDiagramSection('AI Lifecycle Monitoring Loop', buildPillChain(b.modelLifecycleStages, 'stage')));
    wrap.appendChild(buildDetailSection('Lifecycle Stage Details', buildPillarBulletCards(b.modelLifecycleStages, 'stage')));
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildRegulatoryComplianceLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'regulatory-compliance-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.complianceControls && b.complianceControls.length) {
    wrap.appendChild(buildDiagramSection('Compliance Control Framework', buildSpokeWheel(b.complianceControls.map(function(p) { return p.name; }), 'AI Compliance Management'), 'cto-spoke-panel'));
    wrap.appendChild(buildDetailSection('Compliance Control Details', buildPillarBulletCards(b.complianceControls, 'name')));
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildTrustAdoptionLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'trust-adoption-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.adoptionStages && b.adoptionStages.length) {
    wrap.appendChild(buildDiagramSection('Trust & Adoption Flywheel', buildPillChain(b.adoptionStages, 'name')));
    wrap.appendChild(buildDetailSection('Trust & Adoption Stage Details', buildPillarBulletCards(b.adoptionStages, 'name')));
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildVisionLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'vision-layout';

  const stmtBlock = document.createElement('div');
  stmtBlock.className = 'vision-statement';
  const stmtLabel = document.createElement('p');
  stmtLabel.className = 'brief-label'; stmtLabel.textContent = 'Vision Statement';
  const stmtText = document.createElement('p');
  stmtText.className = 'vision-statement__text'; stmtText.textContent = b.strategicPosition || '—';
  stmtBlock.appendChild(stmtLabel); stmtBlock.appendChild(stmtText);
  wrap.appendChild(stmtBlock);

  if (b.strategicPillars && b.strategicPillars.length) wrap.appendChild(buildPillarsGrid(b.strategicPillars));
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));

  const timelineSource = (b.timelineSteps && b.timelineSteps.length) ? b.timelineSteps : (b.priorityActions || []);
  if (timelineSource.length) wrap.appendChild(buildHorizontalTimeline(timelineSource));

  return wrap;
}

// ── New-domain shared helpers ─────────────────────────────────────────────────

function buildStatusTable(rows, cols) {
  const wrap = document.createElement('div');
  wrap.className = 'pdf-status-table';
  const header = document.createElement('div');
  header.className = 'pdf-status-table__header';
  cols.forEach(function(col) {
    const cell = document.createElement('span');
    cell.className = 'pdf-status-table__hcell';
    cell.textContent = col.label;
    header.appendChild(cell);
  });
  wrap.appendChild(header);
  rows.forEach(function(row) {
    const rowEl = document.createElement('div');
    rowEl.className = 'pdf-status-table__row';
    cols.forEach(function(col) {
      const cell = document.createElement('span');
      cell.className = 'pdf-status-table__cell';
      cell.textContent = row[col.key] !== undefined ? String(row[col.key]) : '—';
      rowEl.appendChild(cell);
    });
    wrap.appendChild(rowEl);
  });
  return wrap;
}

function buildTagList(items, label) {
  const wrap = document.createElement('div');
  wrap.className = 'pdf-tag-list-wrap';
  if (label) {
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = label;
    wrap.appendChild(lbl);
  }
  const tagWrap = document.createElement('div');
  tagWrap.className = 'pdf-tag-list';
  items.forEach(function(item) {
    const tag = document.createElement('span');
    tag.className = 'pdf-tag';
    tag.textContent = typeof item === 'string' ? item : (item.name || item.text || '');
    tagWrap.appendChild(tag);
  });
  wrap.appendChild(tagWrap);
  return wrap;
}

function buildPdfRecommendations(items, label) {
  const wrap = document.createElement('div');
  wrap.className = 'pdf-recommendations';
  if (label) {
    const lbl = document.createElement('p');
    lbl.className = 'brief-label'; lbl.textContent = label;
    wrap.appendChild(lbl);
  }
  const list = document.createElement('div');
  list.className = 'pdf-rec-list';
  items.forEach(function(rec, i) {
    const item = document.createElement('div');
    item.className = 'pdf-rec-item';
    const text = rec.text || rec.title || String(rec);
    const priority = rec.priority || '';
    const sub = rec.sub || rec.benefit || rec.impact || rec.reason || rec.expectedBenefit || rec.expectedOutcome || '';
    const p = document.createElement('p');
    p.className = 'pdf-rec-item__text';
    p.textContent = (i + 1) + '. ' + text + (priority ? '  [' + priority + ']' : '');
    item.appendChild(p);
    if (sub) {
      const s = document.createElement('p');
      s.className = 'pdf-rec-item__sub'; s.textContent = sub;
      item.appendChild(s);
    }
    list.appendChild(item);
  });
  wrap.appendChild(list);
  return wrap;
}

function buildSummaryGrid(entries) {
  const grid = document.createElement('div');
  grid.className = 'pdf-summary-grid';
  entries.forEach(function(entry) {
    const cell = document.createElement('div');
    cell.className = 'pdf-summary-cell';
    const key = document.createElement('span');
    key.className = 'pdf-summary-cell__key'; key.textContent = entry.key;
    const val = document.createElement('span');
    val.className = 'pdf-summary-cell__val'; val.textContent = entry.val || '—';
    cell.appendChild(key); cell.appendChild(val);
    grid.appendChild(cell);
  });
  return grid;
}

// ── New-domain layout functions ───────────────────────────────────────────────

function buildAIOpportunityDiscoveryLayout(section) {
  const b                    = section.brief || {};
  const businessProblems     = b.businessProblems     || [];
  const workflowSteps        = b.workflowSteps        || [];
  const highEffortActivities = b.highEffortActivities || [];
  const aiOpportunities      = b.aiOpportunities      || [];

  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  function makeLayer(dotCls, title, content) {
    const layer = document.createElement('div');
    layer.className = 'opp-pdf-layer';
    const hdr = document.createElement('div');
    hdr.className = 'opp-pdf-header';
    const dot = document.createElement('span');
    dot.className = 'opp-pdf-dot ' + dotCls;
    const lbl = document.createElement('span');
    lbl.className = 'opp-pdf-title'; lbl.textContent = title;
    hdr.appendChild(dot); hdr.appendChild(lbl);
    layer.appendChild(hdr);
    layer.appendChild(content);
    return layer;
  }

  function makeChips(items, cls) {
    const row = document.createElement('div'); row.className = 'opp-pdf-chips';
    items.forEach(function(t) {
      const c = document.createElement('span'); c.className = 'opp-pdf-chip ' + cls; c.textContent = t;
      row.appendChild(c);
    });
    return row;
  }

  function makeConnector() {
    const d = document.createElement('div'); d.className = 'opp-pdf-connector'; d.textContent = '↓'; return d;
  }

  // Layer 1: Business Problems
  if (businessProblems.length) {
    wrap.appendChild(makeLayer('opp-pdf-dot--problem', 'Business Problem', makeChips(businessProblems, 'opp-pdf-chip--problem')));
    wrap.appendChild(makeConnector());
  }

  // Layer 2: Current Workflow + High-Effort Activities
  const layer2body = document.createElement('div');
  layer2body.className = 'opp-pdf-workflow';
  if (workflowSteps.length) {
    const stepsRow = document.createElement('div'); stepsRow.className = 'opp-pdf-steps';
    workflowSteps.forEach(function(step, i) {
      const s = document.createElement('div'); s.className = 'opp-pdf-step'; s.textContent = step;
      stepsRow.appendChild(s);
      if (i < workflowSteps.length - 1) {
        const a = document.createElement('div'); a.className = 'opp-pdf-step-arrow'; a.textContent = '→';
        stepsRow.appendChild(a);
      }
    });
    layer2body.appendChild(stepsRow);
  }
  if (highEffortActivities.length) {
    const heaLbl = document.createElement('p'); heaLbl.className = 'opp-pdf-hea-label'; heaLbl.textContent = 'High-Effort Activities';
    const heaRow = document.createElement('div'); heaRow.className = 'opp-pdf-chips';
    highEffortActivities.forEach(function(a) {
      const c = document.createElement('span'); c.className = 'opp-pdf-chip opp-pdf-chip--hea'; c.textContent = a;
      heaRow.appendChild(c);
    });
    layer2body.appendChild(heaLbl);
    layer2body.appendChild(heaRow);
  }
  if (workflowSteps.length || highEffortActivities.length) {
    wrap.appendChild(makeLayer('opp-pdf-dot--workflow', 'Current Workflow', layer2body));
    wrap.appendChild(makeConnector());
  }

  // Layer 3: AI Opportunities — hub layout (left | AI | right)
  if (aiOpportunities.length) {
    const mid   = Math.ceil(aiOpportunities.length / 2);
    const left  = aiOpportunities.slice(0, mid);
    const right = aiOpportunities.slice(mid);
    function makeOppCard(o) {
      // Legacy blueprints store aiOpportunities as plain strings; new ones as { name, why }.
      var name = (o && typeof o === 'object') ? (o.name || '') : o;
      var why  = (o && typeof o === 'object') ? (o.why  || '') : '';
      var card = document.createElement('div'); card.className = 'opp-pdf-ai-card';
      var nameEl = document.createElement('p'); nameEl.className = 'opp-pdf-ai-card__name'; nameEl.textContent = name;
      card.appendChild(nameEl);
      if (why) {
        var whyEl = document.createElement('p'); whyEl.className = 'opp-pdf-ai-card__why'; whyEl.textContent = why;
        card.appendChild(whyEl);
      }
      return card;
    }
    const hub = document.createElement('div'); hub.className = 'opp-pdf-hub';
    const leftCol = document.createElement('div'); leftCol.className = 'opp-pdf-hub__col';
    left.forEach(function(o) { leftCol.appendChild(makeOppCard(o)); });
    const aiNode = document.createElement('div'); aiNode.className = 'opp-pdf-ai-node'; aiNode.textContent = 'AI';
    const rightCol = document.createElement('div'); rightCol.className = 'opp-pdf-hub__col';
    right.forEach(function(o) { rightCol.appendChild(makeOppCard(o)); });
    hub.appendChild(leftCol); hub.appendChild(aiNode); hub.appendChild(rightCol);
    wrap.appendChild(makeLayer('opp-pdf-dot--ai', 'AI Opportunities', hub));
  }

  return wrap;
}

function buildBusinessValueDefinitionLayout(section) {
  const b          = section.brief || {};
  const categories = b.valueCategories     || [];
  const kpiPills   = b.kpiPills            || [];
  const insight    = b.businessValueInsight || '';

  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  if (b.strategicPosition) wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // Value category cards — 3-across top row + centred last card
  if (categories.length) {
    const lbl = document.createElement('p'); lbl.className = 'brief-label'; lbl.textContent = 'Value Categories';
    wrap.appendChild(lbl);
    const grid = document.createElement('div'); grid.className = 'bvd-pdf-grid';
    categories.forEach(function(cat) {
      const card = document.createElement('div'); card.className = 'bvd-pdf-card';
      const title = document.createElement('p'); title.className = 'bvd-pdf-card__title'; title.textContent = cat.title || '';
      const focus = document.createElement('p'); focus.className = 'bvd-pdf-card__focus'; focus.textContent = cat.focus || '';
      card.appendChild(title); card.appendChild(focus);
      if (cat.outcomes && cat.outcomes.length) {
        const ul = document.createElement('ul'); ul.className = 'bvd-pdf-card__outcomes';
        cat.outcomes.forEach(function(o) { const li = document.createElement('li'); li.textContent = o; ul.appendChild(li); });
        card.appendChild(ul);
      }
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
  }

  // KPI pills
  if (kpiPills.length) wrap.appendChild(buildTagList(kpiPills, 'Key Performance Indicators'));

  // Insight footer
  if (insight) {
    const footer = document.createElement('div'); footer.className = 'bvd-pdf-insight';
    const icon = document.createElement('span'); icon.className = 'bvd-pdf-insight__icon'; icon.textContent = '◆';
    const text = document.createElement('p'); text.className = 'bvd-pdf-insight__text'; text.textContent = insight;
    footer.appendChild(icon); footer.appendChild(text);
    wrap.appendChild(footer);
  }

  return wrap;
}

function buildAIUseCasePrioritizationLayout(section) {
  const b         = section.brief || {};
  const recStart  = b.recommendedStartingPoint || '';
  const quadrants = b.priorityQuadrants        || [];
  const insight   = b.prioritizationInsight    || '';

  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  if (b.strategicPosition) wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // Recommended Starting Point banner
  if (recStart) {
    const banner = document.createElement('div'); banner.className = 'pri-pdf-banner';
    const star = document.createElement('span'); star.className = 'pri-pdf-banner__star'; star.textContent = '★';
    const inner = document.createElement('div');
    const t = document.createElement('p'); t.className = 'pri-pdf-banner__title'; t.textContent = 'Recommended Starting Point';
    const tx = document.createElement('p'); tx.className = 'pri-pdf-banner__text'; tx.textContent = recStart;
    inner.appendChild(t); inner.appendChild(tx);
    banner.appendChild(star); banner.appendChild(inner);
    wrap.appendChild(banner);
  }

  // 2×2 Priority Matrix
  if (quadrants.length) {
    const matLbl = document.createElement('p'); matLbl.className = 'brief-label'; matLbl.textContent = 'Prioritization Matrix';
    wrap.appendChild(matLbl);
    const matWrap = document.createElement('div'); matWrap.className = 'pri-pdf-matrix-wrap';

    const xHdr = document.createElement('div'); xHdr.className = 'pri-pdf-x-header';
    const xEmpty = document.createElement('div'); xEmpty.className = 'pri-pdf-x-empty';
    const xLow = document.createElement('span'); xLow.textContent = 'Low Feasibility';
    const xHigh = document.createElement('span'); xHigh.textContent = 'High Feasibility';
    xHdr.appendChild(xEmpty); xHdr.appendChild(xLow); xHdr.appendChild(xHigh);
    matWrap.appendChild(xHdr);

    const Q_CLS = { 'strategic-bets': 'pri-pdf-q--bets', 'quick-wins': 'pri-pdf-q--wins', 'fill-ins': 'pri-pdf-q--fill', 'avoid': 'pri-pdf-q--avoid' };
    const grid = document.createElement('div'); grid.className = 'pri-pdf-grid';
    // Y high-value row
    const rowHigh = document.createElement('div'); rowHigh.className = 'pri-pdf-row';
    const yHigh = document.createElement('div'); yHigh.className = 'pri-pdf-y-label'; yHigh.textContent = '↑ High Value';
    rowHigh.appendChild(yHigh);
    [quadrants[0], quadrants[1]].forEach(function(q) {
      if (!q) return;
      const cell = document.createElement('div'); cell.className = 'pri-pdf-q ' + (Q_CLS[q.id] || '');
      const lbl = document.createElement('p'); lbl.className = 'pri-pdf-q__label'; lbl.textContent = q.label;
      cell.appendChild(lbl);
      if (q.initiatives && q.initiatives.length) {
        const items = document.createElement('p'); items.className = 'pri-pdf-q__items'; items.textContent = q.initiatives.join(' · ');
        cell.appendChild(items);
      }
      rowHigh.appendChild(cell);
    });
    grid.appendChild(rowHigh);
    // Y low-value row
    const rowLow = document.createElement('div'); rowLow.className = 'pri-pdf-row';
    const yLow = document.createElement('div'); yLow.className = 'pri-pdf-y-label'; yLow.textContent = '↓ Low Value';
    rowLow.appendChild(yLow);
    [quadrants[2], quadrants[3]].forEach(function(q) {
      if (!q) return;
      const cell = document.createElement('div'); cell.className = 'pri-pdf-q ' + (Q_CLS[q.id] || '');
      const lbl = document.createElement('p'); lbl.className = 'pri-pdf-q__label'; lbl.textContent = q.label;
      cell.appendChild(lbl);
      if (q.initiatives && q.initiatives.length) {
        const items = document.createElement('p'); items.className = 'pri-pdf-q__items'; items.textContent = q.initiatives.join(' · ');
        cell.appendChild(items);
      }
      rowLow.appendChild(cell);
    });
    grid.appendChild(rowLow);
    matWrap.appendChild(grid);
    wrap.appendChild(matWrap);
  }

  // Evaluation Dimension Cards
  var dimCards = b.dimensionCards || [];
  if (dimCards.length) {
    var dimLbl = document.createElement('p'); dimLbl.className = 'brief-label'; dimLbl.textContent = 'Evaluation Dimensions';
    wrap.appendChild(dimLbl);
    var dimRow = document.createElement('div'); dimRow.className = 'pri-dim-cards';
    dimCards.forEach(function(d) {
      var card = document.createElement('div'); card.className = 'pri-dim-card';
      var title = document.createElement('p'); title.className = 'pri-dim-card__title'; title.textContent = d.title;
      card.appendChild(title);
      if (d.bullets && d.bullets.length) {
        var ul = document.createElement('ul'); ul.className = 'pri-dim-card__bullets';
        d.bullets.forEach(function(b2) { var li = document.createElement('li'); li.textContent = b2; ul.appendChild(li); });
        card.appendChild(ul);
      }
      dimRow.appendChild(card);
    });
    wrap.appendChild(dimRow);
  }

  // Prioritization Insight
  if (insight) {
    var ins = document.createElement('div'); ins.className = 'vision-statement';
    var insL = document.createElement('p'); insL.className = 'brief-label'; insL.textContent = 'Prioritization Insight';
    var insT = document.createElement('p'); insT.className = 'vision-statement__text'; insT.textContent = insight;
    ins.appendChild(insL); ins.appendChild(insT); wrap.appendChild(ins);
  }

  return wrap;
}

function buildAIUseCaseClassificationLayout(section) {
  var b    = section.brief || {};
  var wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  if (b.strategicPosition) wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // Classification Banner — primary + secondary side by side
  if (b.primaryClassification) {
    var COLORS = { 'Productivity AI': 'productivity', 'Functional AI': 'functional', 'Product AI': 'product' };
    var banner = document.createElement('div'); banner.className = 'cls-banner';

    function mkCell(labelText, cls, isSec) {
      var cell = document.createElement('div');
      cell.className = 'cls-banner__cell' + (isSec ? ' cls-banner__cell--secondary' : '');
      var lbl = document.createElement('span'); lbl.className = 'cls-banner__label'; lbl.textContent = labelText;
      var nm  = document.createElement('span'); nm.className  = 'cls-banner__name cls-name--' + (COLORS[cls.name] || 'functional'); nm.textContent = cls.name || '';
      cell.appendChild(lbl); cell.appendChild(nm);
      if (cls.rationale) { var rat = document.createElement('span'); rat.className = 'cls-banner__rationale'; rat.textContent = cls.rationale; cell.appendChild(rat); }
      if (cls.businessOutcome) { var out = document.createElement('span'); out.className = 'cls-banner__outcome'; out.textContent = cls.businessOutcome; cell.appendChild(out); }
      return cell;
    }

    banner.appendChild(mkCell('Primary Classification', b.primaryClassification, false));
    if (b.secondaryClassification) banner.appendChild(mkCell('Secondary Classification', b.secondaryClassification, true));
    wrap.appendChild(banner);
  }

  // Transformation Implication
  if (b.transformationImplication) {
    var ci = document.createElement('div'); ci.className = 'vision-statement';
    var ciL = document.createElement('p'); ciL.className = 'brief-label'; ciL.textContent = 'Transformation Implication';
    var ciT = document.createElement('p'); ciT.className = 'vision-statement__text'; ciT.textContent = b.transformationImplication;
    ci.appendChild(ciL); ci.appendChild(ciT); wrap.appendChild(ci);
  }

  return wrap;
}

// ── Shared helpers used by all new-domain PDF layouts ─────────────────────────

function ndBadge(text) {
  var b = document.createElement('div'); b.className = 'nd-badge'; b.textContent = text; return b;
}
function ndBody(cols) {
  var d = document.createElement('div'); d.className = 'nd-body nd-body--' + cols + 'col'; return d;
}
function ndCol(cls) {
  var d = document.createElement('div'); d.className = 'nd-col' + (cls ? ' ' + cls : ''); return d;
}
function ndLbl(text) {
  var p = document.createElement('p'); p.className = 'brief-label'; p.textContent = text; return p;
}
function ndScoresBar(items) {
  var bar = document.createElement('div'); bar.className = 'nd-scores-bar';
  items.forEach(function(item) {
    var cell = document.createElement('div'); cell.className = 'nd-score-cell';
    var val = document.createElement('p'); val.className = 'nd-score-cell__val'; val.textContent = item.value;
    var lbl = document.createElement('p'); lbl.className = 'nd-score-cell__lbl'; lbl.textContent = item.label;
    cell.appendChild(val); cell.appendChild(lbl); bar.appendChild(cell);
  });
  return bar;
}
function ndSummaryGrid(items) {
  var grid = document.createElement('div'); grid.className = 'nd-summary-grid';
  items.forEach(function(item) {
    var cell = document.createElement('div'); cell.className = 'nd-summary-cell';
    var lbl = document.createElement('p'); lbl.className = 'nd-summary-cell__lbl'; lbl.textContent = item.label; cell.appendChild(lbl);
    if (item.value) { var val = document.createElement('p'); val.className = 'nd-summary-cell__val'; val.textContent = item.value; cell.appendChild(val); }
    grid.appendChild(cell);
  });
  return grid;
}
function ndRecList(items, mapFn) {
  var PRI = { HIGH: 'nd-pri--high', MEDIUM: 'nd-pri--medium', LOW: 'nd-pri--low', High: 'nd-pri--high', Medium: 'nd-pri--medium', Low: 'nd-pri--low' };
  var list = document.createElement('div'); list.className = 'nd-rec-list';
  items.forEach(function(r) {
    var m = mapFn(r);
    var item = document.createElement('div'); item.className = 'nd-rec-item';
    var text = document.createElement('p'); text.className = 'nd-rec-item__text'; text.textContent = m.text || ''; item.appendChild(text);
    if (m.priority) { var meta = document.createElement('p'); meta.className = 'nd-rec-item__meta'; meta.innerHTML = 'Priority: <span class="nd-pri ' + (PRI[String(m.priority).toUpperCase()] || PRI[m.priority] || 'nd-pri--medium') + '">' + m.priority + '</span>'; item.appendChild(meta); }
    if (m.sub) { var sub = document.createElement('p'); sub.className = 'nd-rec-item__sub'; sub.textContent = m.sub; item.appendChild(sub); }
    list.appendChild(item);
  });
  return list;
}
function ndStatBlock(items) {
  var block = document.createElement('div'); block.className = 'nd-stat-block';
  items.filter(function(e) { return e.value !== undefined && e.value !== null; }).forEach(function(e) {
    var row = document.createElement('div'); row.className = 'nd-stat-row';
    var lbl = document.createElement('span'); lbl.className = 'nd-stat-row__lbl'; lbl.textContent = e.label + ':';
    var val = document.createElement('span'); val.className = 'nd-stat-row__val'; val.textContent = e.value;
    row.appendChild(lbl); row.appendChild(val); block.appendChild(row);
  });
  return block;
}

// ── Data Readiness: Critical Data Identification ───────────────────────────────

function buildCriticalDataIdentificationLayout(section) {
  var b = section.brief || {};
  var datasets              = Array.isArray(b.datasets)              ? b.datasets              : [];
  var traceabilityChain     = Array.isArray(b.traceabilityChain)     ? b.traceabilityChain     : [];
  var collectionOrder       = Array.isArray(b.collectionOrder)       ? b.collectionOrder       : [];
  var implementationRoadmap = Array.isArray(b.implementationRoadmap) ? b.implementationRoadmap : [];
  var consultantGuidance    = b.consultantGuidance || '';
  var aiRecommendation      = b.aiRecommendation   || '';
  // Legacy fallbacks
  var relationshipMap   = b.relationshipMap || {};
  var recommendations   = Array.isArray(b.recommendations) ? b.recommendations : [];
  var coverage          = b.coverageSummary || {};
  var PRIORITY_CLASS    = { HIGH: 'cdi-badge--high', MEDIUM: 'cdi-badge--medium', LOW: 'cdi-badge--low' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = document.createElement('div'); body.className = 'cdi-body';

  // LEFT: dataset cards (new format with typicalSource + expectedAIOutput)
  var leftPanel = document.createElement('div'); leftPanel.className = 'cdi-left';
  if (datasets.length) {
    var dsLbl = document.createElement('p'); dsLbl.className = 'brief-label'; dsLbl.textContent = 'Critical Data Blueprint';
    leftPanel.appendChild(dsLbl);
    datasets.forEach(function(ds) {
      var card = document.createElement('div'); card.className = 'cdi-dataset-card';
      var name = document.createElement('p'); name.className = 'cdi-dataset-card__name'; name.textContent = ds.name || '—';
      card.appendChild(name);
      function addRow(label, value, isBadge, isOutput) {
        if (!value) return;
        var row = document.createElement('div');
        row.className = isOutput ? 'cdi-dataset-card__info-row cdi-dataset-card__info-row--output' : 'cdi-dataset-card__info-row';
        var lbl = document.createElement('span'); lbl.className = 'cdi-dataset-card__info-label'; lbl.textContent = label;
        row.appendChild(lbl);
        if (isBadge) {
          var badge = document.createElement('span'); badge.className = 'cdi-badge ' + (PRIORITY_CLASS[value] || 'cdi-badge--medium'); badge.textContent = value;
          row.appendChild(badge);
        } else {
          var val = document.createElement('span'); val.className = 'cdi-dataset-card__info-value'; val.textContent = value;
          row.appendChild(val);
        }
        card.appendChild(row);
      }
      addRow('Purpose',                   ds.purpose,          false, false);
      addRow('Recommended Source System', ds.typicalSource,    false, false);
      addRow('Expected AI Output',        ds.expectedAIOutput, false, true);
      addRow('Priority',                  ds.priority,         true,  false);
      leftPanel.appendChild(card);
    });
  }
  body.appendChild(leftPanel);

  // RIGHT: Traceability chain / legacy relmap + Collection Order + Roadmap
  var rightPanel = document.createElement('div'); rightPanel.className = 'cdi-right';

  if (traceabilityChain.length) {
    var tcLbl = document.createElement('p'); tcLbl.className = 'brief-label'; tcLbl.textContent = 'Engineering Traceability';
    rightPanel.appendChild(tcLbl);
    var chain = document.createElement('div'); chain.className = 'cdi-traceability';
    traceabilityChain.forEach(function(node, i) {
      var el = document.createElement('div');
      el.className = i === 0 ? 'cdi-traceability__node cdi-traceability__node--start'
                   : i === traceabilityChain.length - 1 ? 'cdi-traceability__node cdi-traceability__node--end'
                   : 'cdi-traceability__node';
      el.textContent = node; chain.appendChild(el);
      if (i < traceabilityChain.length - 1) {
        var arr = document.createElement('div'); arr.className = 'cdi-traceability__arrow'; arr.textContent = '↓'; chain.appendChild(arr);
      }
    });
    rightPanel.appendChild(chain);
  } else {
    // Legacy: relationship map
    var hasRel = [relationshipMap.dataSource, relationshipMap.dependentData, relationshipMap.relatedData, relationshipMap.targetData].some(function(a) { return a && a.length; });
    if (hasRel) {
      var relLbl = document.createElement('p'); relLbl.className = 'brief-label'; relLbl.textContent = 'Data Relationship Map';
      rightPanel.appendChild(relLbl);
      var relFlow = document.createElement('div'); relFlow.className = 'cdi-relmap';
      [{ key: 'dataSource', label: 'Data Source', icon: '◉' }, { key: 'dependentData', label: 'Dependent', icon: '◈' },
       { key: 'relatedData', label: 'Related', icon: '◇' }, { key: 'targetData', label: 'Target', icon: '◆' }].forEach(function(nd, i) {
        var items = relationshipMap[nd.key] || [];
        var nodeEl = document.createElement('div'); nodeEl.className = 'cdi-relnode';
        var hdr = document.createElement('div'); hdr.className = 'cdi-relnode__hdr'; hdr.textContent = nd.icon + ' ' + nd.label; nodeEl.appendChild(hdr);
        if (items.length) { var ul = document.createElement('ul'); ul.className = 'cdi-relnode__list'; items.slice(0,3).forEach(function(t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); nodeEl.appendChild(ul); }
        relFlow.appendChild(nodeEl);
        if (i < 3) { var ar = document.createElement('div'); ar.className = 'cdi-relmap__arr'; ar.textContent = '→'; relFlow.appendChild(ar); }
      });
      rightPanel.appendChild(relFlow);
    }
  }

  if (collectionOrder.length) {
    var coLbl = document.createElement('p'); coLbl.className = 'brief-label'; coLbl.textContent = 'Recommended Collection Order';
    rightPanel.appendChild(coLbl);
    collectionOrder.forEach(function(item, i) {
      var row = document.createElement('div'); row.className = 'cdi-collection-row';
      var num = document.createElement('span'); num.className = 'cdi-collection-row__num'; num.textContent = i + 1;
      var content = document.createElement('div'); content.className = 'cdi-collection-row__content';
      var nm = document.createElement('p'); nm.className = 'cdi-collection-row__name'; nm.textContent = item.action || item.name;
      content.appendChild(nm);
      if (item.reason) { var reason = document.createElement('p'); reason.className = 'cdi-collection-row__reason'; reason.textContent = item.reason; content.appendChild(reason); }
      row.appendChild(num); row.appendChild(content); rightPanel.appendChild(row);
    });
  } else if (recommendations.length) {
    var recLbl = document.createElement('p'); recLbl.className = 'brief-label'; recLbl.textContent = 'Data Collection Recommendations';
    rightPanel.appendChild(recLbl);
    var PBADGE = { HIGH: 'nd-pri--high', MEDIUM: 'nd-pri--medium', LOW: 'nd-pri--low' };
    recommendations.forEach(function(rec, i) {
      var row = document.createElement('div'); row.className = 'cdi-rec-row';
      var num = document.createElement('span'); num.className = 'cdi-rec-row__num'; num.textContent = i + 1;
      var txt = document.createElement('p'); txt.className = 'cdi-rec-row__text'; txt.textContent = rec.text || '';
      var priK = String(rec.priority || 'MEDIUM').toUpperCase();
      var pri = document.createElement('span'); pri.className = 'cdi-badge nd-pri ' + (PBADGE[priK] || 'nd-pri--medium'); pri.textContent = rec.priority || 'MEDIUM';
      row.appendChild(num); row.appendChild(txt); row.appendChild(pri); rightPanel.appendChild(row);
    });
  }

  if (implementationRoadmap.length) {
    var rmLbl = document.createElement('p'); rmLbl.className = 'brief-label'; rmLbl.textContent = 'Data Collection Roadmap';
    rightPanel.appendChild(rmLbl);
    var roadmap = document.createElement('div'); roadmap.className = 'cdi-roadmap';
    implementationRoadmap.forEach(function(step) {
      var row = document.createElement('div'); row.className = 'cdi-roadmap__step cdi-roadmap__step--' + (step.status === 'ready' ? 'ready' : 'pending');
      var icon = document.createElement('span'); icon.className = 'cdi-roadmap__icon'; icon.textContent = step.status === 'ready' ? '✓' : '↓';
      var label = document.createElement('p'); label.className = 'cdi-roadmap__label'; label.textContent = step.step;
      row.appendChild(icon); row.appendChild(label); roadmap.appendChild(row);
    });
    rightPanel.appendChild(roadmap);
  } else if (coverage.criticalDatasets !== undefined || coverage.confidence) {
    var covLbl = document.createElement('p'); covLbl.className = 'brief-label'; covLbl.textContent = 'Coverage Summary';
    rightPanel.appendChild(covLbl);
    rightPanel.appendChild(ndScoresBar([
      { value: String(coverage.criticalDatasets || 0), label: 'Datasets Identified' },
      { value: String(coverage.missingData || 0),       label: 'Missing or Partial' },
      { value: (coverage.confidence || 0) + '%',        label: 'Data Confidence' },
    ]));
  }

  body.appendChild(rightPanel);
  wrap.appendChild(body);

  if (consultantGuidance) {
    var cg = document.createElement('div'); cg.className = 'cdi-consultant-guidance';
    var cgHdr = document.createElement('div'); cgHdr.className = 'cdi-consultant-guidance__header';
    var cgIcon = document.createElement('span'); cgIcon.className = 'cdi-consultant-guidance__icon'; cgIcon.textContent = '◆';
    var cgTitle = document.createElement('span'); cgTitle.className = 'cdi-consultant-guidance__title'; cgTitle.textContent = 'Consultant Guidance';
    cgHdr.appendChild(cgIcon); cgHdr.appendChild(cgTitle); cg.appendChild(cgHdr);
    var cgTxt = document.createElement('p'); cgTxt.className = 'cdi-consultant-guidance__text'; cgTxt.textContent = consultantGuidance;
    cg.appendChild(cgTxt); wrap.appendChild(cg);
  }
  if (aiRecommendation) {
    var ar = document.createElement('div'); ar.className = 'cdi-ai-recommendation';
    var arHdr = document.createElement('div'); arHdr.className = 'cdi-ai-recommendation__header';
    var arIcon = document.createElement('span'); arIcon.className = 'cdi-ai-recommendation__icon'; arIcon.textContent = '⬡';
    var arTitle = document.createElement('span'); arTitle.className = 'cdi-ai-recommendation__title'; arTitle.textContent = 'AI Recommendation';
    arHdr.appendChild(arIcon); arHdr.appendChild(arTitle); ar.appendChild(arHdr);
    var arTxt = document.createElement('p'); arTxt.className = 'cdi-ai-recommendation__text'; arTxt.textContent = aiRecommendation;
    ar.appendChild(arTxt); wrap.appendChild(ar);
  }
  return wrap;
}

// ── Data Readiness: AI Data Preparation ───────────────────────────────────────

function buildAIDataPreparationLayout(section) {
  var b              = section.brief || {};
  var prepWorkPackages = Array.isArray(b.prepWorkPackages) ? b.prepWorkPackages : [];
  var firstSteps       = Array.isArray(b.firstSteps)       ? b.firstSteps       : [];
  var prepSummary      = b.prepSummary || {};
  // Legacy fallbacks
  var prepActivities   = Array.isArray(b.prepActivities)   ? b.prepActivities   : [];
  var inputDatasets    = Array.isArray(b.inputDatasets)     ? b.inputDatasets    : [];
  var prepRecs         = Array.isArray(b.prepRecommendations) ? b.prepRecommendations : [];
  var readiness        = b.readinessSummary || {};

  var PRIORITY_CLASS = { HIGH: 'cdi-badge--high', MEDIUM: 'cdi-badge--medium', LOW: 'cdi-badge--low' };
  var ADP_ROADMAP = [
    { stage: 'Identify',    outcome: 'Know which datasets are required' },
    { stage: 'Clean',       outcome: 'Remove incorrect information' },
    { stage: 'Standardize', outcome: 'Common naming and formats' },
    { stage: 'Integrate',   outcome: 'Connect related repositories' },
    { stage: 'Enrich',      outcome: 'Add business context' },
    { stage: 'Validate',    outcome: 'Verify AI readiness' },
    { stage: 'AI Ready',    outcome: 'Data prepared for implementation' },
  ];

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = document.createElement('div'); body.className = 'adp-body';

  // LEFT: Work Packages (new) or input datasets (legacy)
  var leftCol = document.createElement('div'); leftCol.className = 'adp-col adp-col--left';
  var activePackages = prepWorkPackages.length ? prepWorkPackages : prepActivities;
  var isNewFmt = prepWorkPackages.length > 0;

  if (activePackages.length) {
    var wpLbl = document.createElement('p'); wpLbl.className = 'brief-label'; wpLbl.textContent = 'Preparation Work Packages';
    leftCol.appendChild(wpLbl);
    activePackages.forEach(function(pkg) {
      var card = document.createElement('div'); card.className = 'adp-wp-card';
      var nm = document.createElement('p'); nm.className = 'adp-wp-card__name'; nm.textContent = pkg.name || '—';
      card.appendChild(nm);
      if (isNewFmt && Array.isArray(pkg.workPackage) && pkg.workPackage.length) {
        var wl = document.createElement('span'); wl.className = 'adp-wp-card__field-label'; wl.textContent = 'Work Package'; card.appendChild(wl);
        var ul = document.createElement('ul'); ul.className = 'adp-wp-card__work-list';
        pkg.workPackage.forEach(function(item) { var li = document.createElement('li'); li.className = 'adp-wp-card__work-item'; li.textContent = item; ul.appendChild(li); });
        card.appendChild(ul);
      } else if (pkg.preparationActivity) {
        var paRow = document.createElement('div'); paRow.className = 'adp-wp-card__row';
        var paLbl = document.createElement('span'); paLbl.className = 'adp-wp-card__field-label'; paLbl.textContent = 'Preparation Activity';
        var paVal = document.createElement('span'); paVal.className = 'adp-wp-card__value'; paVal.textContent = pkg.preparationActivity;
        paRow.appendChild(paLbl); paRow.appendChild(paVal); card.appendChild(paRow);
      }
      var whyText = isNewFmt ? pkg.whyAINeeds : pkg.businessPurpose;
      var whyLabel = isNewFmt ? 'Why AI Needs This' : 'Business Purpose';
      if (whyText) {
        var whyLbl = document.createElement('span'); whyLbl.className = 'adp-wp-card__field-label'; whyLbl.textContent = whyLabel; card.appendChild(whyLbl);
        var whyVal = document.createElement('p'); whyVal.className = 'adp-wp-card__why'; whyVal.textContent = whyText; card.appendChild(whyVal);
      }
      if (isNewFmt && pkg.deliverable) {
        var delRow = document.createElement('div'); delRow.className = 'adp-wp-card__row';
        var delLbl = document.createElement('span'); delLbl.className = 'adp-wp-card__field-label'; delLbl.textContent = 'Deliverable';
        var delVal = document.createElement('span'); delVal.className = 'adp-wp-card__deliverable'; delVal.textContent = pkg.deliverable;
        delRow.appendChild(delLbl); delRow.appendChild(delVal); card.appendChild(delRow);
      }
      var metaRow = document.createElement('div'); metaRow.className = 'adp-wp-card__meta-row';
      if (pkg.recommendedOwner) {
        var owRow = document.createElement('div'); owRow.className = 'adp-wp-card__row';
        var owLbl = document.createElement('span'); owLbl.className = 'adp-wp-card__field-label'; owLbl.textContent = 'Primary Owner';
        var owVal = document.createElement('span'); owVal.className = 'adp-wp-card__value'; owVal.textContent = pkg.recommendedOwner;
        owRow.appendChild(owLbl); owRow.appendChild(owVal); metaRow.appendChild(owRow);
      }
      if (pkg.priority) {
        var badge = document.createElement('span'); badge.className = 'cdi-badge ' + (PRIORITY_CLASS[pkg.priority] || 'cdi-badge--medium'); badge.textContent = pkg.priority;
        metaRow.appendChild(badge);
      }
      if (metaRow.children.length) card.appendChild(metaRow);
      leftCol.appendChild(card);
    });
  } else {
    // Fallback: input datasets
    var dsLbl = document.createElement('p'); dsLbl.className = 'brief-label'; dsLbl.textContent = 'Input Datasets'; leftCol.appendChild(dsLbl);
    var SICON = { AVAILABLE: '◉', MISSING: '◎', 'IN PROGRESS': '◷' };
    var SCLS  = { AVAILABLE: 'adp-status--available', MISSING: 'adp-status--missing', 'IN PROGRESS': 'adp-status--progress' };
    inputDatasets.forEach(function(ds) {
      var card = document.createElement('div'); card.className = 'adp-ds-card';
      var ico = document.createElement('div'); ico.className = 'adp-ds-card__icon'; ico.textContent = SICON[ds.status] || '◉';
      var dnm = document.createElement('p');   dnm.className = 'adp-ds-card__name'; dnm.textContent = ds.name;
      var bdg = document.createElement('span'); bdg.className = 'adp-ds-status ' + (SCLS[ds.status] || 'adp-status--available'); bdg.textContent = ds.status;
      card.appendChild(ico); card.appendChild(dnm); card.appendChild(bdg); leftCol.appendChild(card);
    });
  }
  body.appendChild(leftCol);

  // CENTER: Preparation Roadmap (static)
  var centerCol = document.createElement('div'); centerCol.className = 'adp-col adp-col--center';
  var roadmapLbl = document.createElement('p'); roadmapLbl.className = 'brief-label'; roadmapLbl.textContent = 'Preparation Roadmap';
  centerCol.appendChild(roadmapLbl);
  var roadmap = document.createElement('div'); roadmap.className = 'adp-roadmap';
  ADP_ROADMAP.forEach(function(item, i) {
    var node = document.createElement('div');
    node.className = i === 0 ? 'adp-roadmap__node adp-roadmap__node--start' : i === ADP_ROADMAP.length - 1 ? 'adp-roadmap__node adp-roadmap__node--end' : 'adp-roadmap__node';
    var stg = document.createElement('span'); stg.className = 'adp-roadmap__stage'; stg.textContent = item.stage; node.appendChild(stg);
    var out = document.createElement('span'); out.className = 'adp-roadmap__outcome'; out.textContent = item.outcome; node.appendChild(out);
    roadmap.appendChild(node);
    if (i < ADP_ROADMAP.length - 1) { var arrow = document.createElement('div'); arrow.className = 'adp-roadmap__arrow'; arrow.textContent = '↓'; roadmap.appendChild(arrow); }
  });
  centerCol.appendChild(roadmap);
  body.appendChild(centerCol);

  // RIGHT: First Steps (new) or recommendations (legacy)
  var rightCol = document.createElement('div'); rightCol.className = 'adp-col adp-col--right';
  if (firstSteps.length) {
    var fsLbl = document.createElement('p'); fsLbl.className = 'brief-label'; fsLbl.textContent = 'Recommended First Steps'; rightCol.appendChild(fsLbl);
    firstSteps.forEach(function(step, i) {
      var row = document.createElement('div'); row.className = 'adp-step-row';
      var num = document.createElement('span'); num.className = 'adp-step-row__num'; num.textContent = i + 1;
      var content = document.createElement('div'); content.className = 'adp-step-row__content';
      var action = document.createElement('p'); action.className = 'adp-step-row__action'; action.textContent = step.action; content.appendChild(action);
      if (step.why) { var why = document.createElement('p'); why.className = 'adp-step-row__why'; why.textContent = step.why; content.appendChild(why); }
      function addMeta(labelText, value, cls) {
        if (!value) return;
        var mRow = document.createElement('div'); mRow.className = 'adp-step-row__meta-row';
        var ml = document.createElement('span'); ml.className = 'adp-step-row__owner-label'; ml.textContent = labelText;
        var mv = document.createElement('span'); mv.className = cls; mv.textContent = value;
        mRow.appendChild(ml); mRow.appendChild(mv); content.appendChild(mRow);
      }
      addMeta('Owner', step.owner, 'adp-step-row__owner');
      addMeta('Expected Output', step.expectedOutput, 'adp-step-row__output');
      row.appendChild(num); row.appendChild(content); rightCol.appendChild(row);
      if (i < firstSteps.length - 1) { var div = document.createElement('div'); div.className = 'adp-step-divider'; rightCol.appendChild(div); }
    });
  } else if (prepRecs.length) {
    var recLbl = document.createElement('p'); recLbl.className = 'brief-label'; recLbl.textContent = 'AI Recommendations'; rightCol.appendChild(recLbl);
    prepRecs.forEach(function(rec) {
      var card = document.createElement('div'); card.className = 'adp-rec-card';
      var txt = document.createElement('p'); txt.className = 'adp-rec-card__text'; txt.textContent = rec.text; card.appendChild(txt);
      var meta = document.createElement('p'); meta.className = 'adp-rec-card__meta'; meta.textContent = 'Priority: ' + rec.priority + (rec.effort ? '  ·  Effort: ' + rec.effort : ''); card.appendChild(meta);
      if (rec.impact) { var imp = document.createElement('p'); imp.className = 'adp-rec-card__impact'; imp.textContent = rec.impact; card.appendChild(imp); }
      rightCol.appendChild(card);
    });
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Preparation Summary strip (new) or readiness grid (legacy)
  var hasNewSummary = prepSummary.workPackages || prepSummary.repositories;
  var hasLegacySummary = prepSummary.preparationActivities || prepSummary.engineeringRepositories;
  if (hasNewSummary || hasLegacySummary) {
    var strip = document.createElement('div'); strip.className = 'adp-prep-summary';
    var stripLbl = document.createElement('p'); stripLbl.className = 'brief-label'; stripLbl.textContent = 'Preparation Summary'; strip.appendChild(stripLbl);
    var stats = hasNewSummary ? [
      { value: prepSummary.workPackages,             label: 'Work Packages' },
      { value: prepSummary.repositories,             label: 'Engineering Repositories' },
      { value: prepSummary.deliverables,             label: 'AI-ready Deliverables' },
      { value: prepSummary.estimatedDuration || '—', label: 'Estimated Duration', isText: true },
    ] : [
      { value: prepSummary.preparationActivities,         label: 'Preparation Activities' },
      { value: prepSummary.engineeringRepositories,        label: 'Engineering Repositories' },
      { value: prepSummary.recommendedOwners,              label: 'Recommended Owners' },
      { value: prepSummary.implementationPriority || '—',  label: 'Implementation Priority', isText: true },
    ];
    var cells = document.createElement('div'); cells.className = 'adp-prep-summary__cells';
    stats.forEach(function(stat) {
      var cell = document.createElement('div'); cell.className = 'adp-prep-summary__cell';
      var val = document.createElement('p'); val.className = stat.isText ? 'adp-prep-summary__value adp-prep-summary__value--text' : 'adp-prep-summary__value'; val.textContent = stat.value != null ? stat.value : '—';
      var slbl = document.createElement('p'); slbl.className = 'adp-prep-summary__label'; slbl.textContent = stat.label;
      cell.appendChild(val); cell.appendChild(slbl); cells.appendChild(cell);
    });
    strip.appendChild(cells); wrap.appendChild(strip);
  } else if (readiness.quality || readiness.standardization || readiness.integration || readiness.aiReadiness) {
    wrap.appendChild(ndLbl('Readiness Summary'));
    wrap.appendChild(ndSummaryGrid([
      { label: 'Quality', value: (readiness.quality || 0) + '%' },
      { label: 'Standardization', value: (readiness.standardization || 0) + '%' },
      { label: 'Integration', value: (readiness.integration || 0) + '%' },
      { label: 'AI Readiness', value: (readiness.aiReadiness || 0) + '%' },
    ]));
  }
  return wrap;
}

// ── Data Readiness: Data Architecture Enablement ──────────────────────────────

function buildDataArchitectureEnablementLayout(section) {
  var b              = section.brief || {};
  var archLayers     = Array.isArray(b.archLayers)    ? b.archLayers    : [];
  var archDecisions  = Array.isArray(b.archDecisions) ? b.archDecisions : [];
  var techStack      = Array.isArray(b.techStack)     ? b.techStack     : [];
  var archSummary    = b.archSummary || {};
  var archPattern    = Array.isArray(b.archPattern)   ? b.archPattern   : [];
  var archConsultantGuidance = b.archConsultantGuidance || '';
  // Legacy fallbacks
  var projectSystems = Array.isArray(b.projectSystems)      ? b.projectSystems      : [];
  var archRecs       = Array.isArray(b.archRecommendations)  ? b.archRecommendations : [];
  var archStats      = b.archStats || {};
  var healthTimeline = Array.isArray(b.healthTimeline)       ? b.healthTimeline       : [];

  var PRIORITY_PIP = { High: 'dae-pip--high', Medium: 'dae-pip--medium', Low: 'dae-pip--low' };
  var DAE_IMPL_SEQ = ['Connect Project Systems', 'Build Integration Layer', 'Create AI Data Store', 'Deploy AI Assistant', 'Scale Across Projects'];
  var isNewFormat  = archLayers.length > 0;

  var wrap = document.createElement('div'); wrap.className = 'dae-view';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // ── Upper: Blueprint (left) | Flow (right) ────────────────────────────────
  var upperBody = document.createElement('div'); upperBody.className = 'dae-upper';

  // LEFT: Architecture layers (new) or project systems (legacy)
  var blueprintCol = document.createElement('div'); blueprintCol.className = 'dae-blueprint-col';
  if (isNewFormat) {
    var bpLbl = document.createElement('p'); bpLbl.className = 'brief-label'; bpLbl.textContent = 'Recommended AI Architecture'; blueprintCol.appendChild(bpLbl);
    var grid = document.createElement('div'); grid.className = 'dae-layer-grid';
    archLayers.forEach(function(layer, i) {
      var card = document.createElement('div'); card.className = 'dae-layer-card dae-layer-card--' + i;
      var nm = document.createElement('p'); nm.className = 'dae-layer-card__name'; nm.textContent = layer.name; card.appendChild(nm);
      if (layer.purpose) {
        var pLbl = document.createElement('span'); pLbl.className = 'dae-layer-card__field-label'; pLbl.textContent = 'Purpose'; card.appendChild(pLbl);
        var pTxt = document.createElement('p'); pTxt.className = 'dae-layer-card__purpose'; pTxt.textContent = layer.purpose; card.appendChild(pTxt);
      }
      if (Array.isArray(layer.recommended) && layer.recommended.length) {
        var rLbl = document.createElement('span'); rLbl.className = 'dae-layer-card__field-label'; rLbl.textContent = i === 0 ? 'Recommended Systems' : 'Recommended Technologies'; card.appendChild(rLbl);
        var tags = document.createElement('div'); tags.className = 'dae-layer-card__tags';
        layer.recommended.forEach(function(t) { var tag = document.createElement('span'); tag.className = 'dae-layer-card__tag'; tag.textContent = t; tags.appendChild(tag); });
        card.appendChild(tags);
      }
      if (layer.whyNeeded) {
        var wLbl = document.createElement('span'); wLbl.className = 'dae-layer-card__field-label'; wLbl.textContent = 'Why Needed'; card.appendChild(wLbl);
        var wTxt = document.createElement('p'); wTxt.className = 'dae-layer-card__why'; wTxt.textContent = layer.whyNeeded; card.appendChild(wTxt);
      }
      grid.appendChild(card);
    });
    blueprintCol.appendChild(grid);
  } else {
    var sysLbl = document.createElement('p'); sysLbl.className = 'brief-label'; sysLbl.textContent = 'Project Systems'; blueprintCol.appendChild(sysLbl);
    var CCLS = { Connected: 'dae-conn--connected', Partial: 'dae-conn--partial', Disconnected: 'dae-conn--disconnected' };
    projectSystems.forEach(function(sys) {
      var card = document.createElement('div'); card.className = 'dae-sys-card ' + (CCLS[sys.connectionStatus] || 'dae-conn--disconnected');
      var snm = document.createElement('p'); snm.className = 'dae-sys-card__name'; snm.textContent = sys.name;
      var sconn = document.createElement('p'); sconn.className = 'dae-sys-card__conn'; sconn.textContent = 'Connection Status: ' + sys.connectionStatus;
      card.appendChild(snm); card.appendChild(sconn); blueprintCol.appendChild(card);
    });
  }
  upperBody.appendChild(blueprintCol);

  // RIGHT: Architecture Flow vertical chain
  var flowCol = document.createElement('div'); flowCol.className = 'dae-flow-col';
  var flowLbl = document.createElement('p'); flowLbl.className = 'brief-label'; flowLbl.textContent = 'Architecture Flow'; flowCol.appendChild(flowLbl);
  var flow = document.createElement('div'); flow.className = 'dae-flow';
  if (isNewFormat && archLayers.length) {
    archLayers.forEach(function(layer, i) {
      var node = document.createElement('div'); node.className = 'dae-flow__node dae-flow__node--' + i;
      var nName = document.createElement('p'); nName.className = 'dae-flow__node-name'; nName.textContent = layer.name; node.appendChild(nName);
      if (Array.isArray(layer.recommended) && layer.recommended.length) {
        var nSubs = document.createElement('p'); nSubs.className = 'dae-flow__node-subs'; nSubs.textContent = layer.recommended.slice(0, 3).join(' · '); node.appendChild(nSubs);
      }
      flow.appendChild(node);
      if (i < archLayers.length - 1) { var arr = document.createElement('div'); arr.className = 'dae-flow__arrow'; arr.textContent = '↓'; flow.appendChild(arr); }
    });
  } else {
    ['Source Systems', 'Integration Layer', 'AI Data Hub', 'AI Applications'].forEach(function(name, i, list) {
      var node = document.createElement('div'); node.className = 'dae-flow__node';
      var nName = document.createElement('p'); nName.className = 'dae-flow__node-name'; nName.textContent = name; node.appendChild(nName); flow.appendChild(node);
      if (i < list.length - 1) { var arrow = document.createElement('div'); arrow.className = 'dae-flow__arrow'; arrow.textContent = '↓'; flow.appendChild(arrow); }
    });
  }
  flowCol.appendChild(flow); upperBody.appendChild(flowCol);
  wrap.appendChild(upperBody);

  // ── Middle: Decisions (left) | Tech Stack (right) ───────────────────────
  var middleBody = document.createElement('div'); middleBody.className = 'dae-middle';

  var decisionsCol = document.createElement('div'); decisionsCol.className = 'dae-decisions-col';
  var isNewDecisions = archDecisions.length && archDecisions[0].decisionArea;
  if (archDecisions.length) {
    var dLbl = document.createElement('p'); dLbl.className = 'brief-label'; dLbl.textContent = 'Recommended Architecture Decisions'; decisionsCol.appendChild(dLbl);
    if (isNewDecisions) {
      var table = document.createElement('div'); table.className = 'dae-dec-table';
      var hrow = document.createElement('div'); hrow.className = 'dae-dec-table__row dae-dec-table__row--header';
      ['Decision Area', 'Recommendation', 'Why'].forEach(function(h) { var cell = document.createElement('span'); cell.className = 'dae-dec-table__cell'; cell.textContent = h; hrow.appendChild(cell); });
      table.appendChild(hrow);
      archDecisions.forEach(function(dec) {
        var row = document.createElement('div'); row.className = 'dae-dec-table__row';
        var area = document.createElement('span'); area.className = 'dae-dec-table__cell dae-dec-table__cell--area'; area.textContent = dec.decisionArea;
        var rec  = document.createElement('span'); rec.className  = 'dae-dec-table__cell dae-dec-table__cell--rec';  rec.textContent  = dec.recommendation;
        var why  = document.createElement('span'); why.className  = 'dae-dec-table__cell dae-dec-table__cell--why';  why.textContent  = dec.why;
        row.appendChild(area); row.appendChild(rec); row.appendChild(why); table.appendChild(row);
      });
      decisionsCol.appendChild(table);
    } else {
      archDecisions.forEach(function(dec) {
        var card = document.createElement('div'); card.className = 'dae-decision-card';
        var decLbl = document.createElement('span'); decLbl.className = 'dae-decision-card__field-label'; decLbl.textContent = 'Decision';
        var decTxt = document.createElement('p');    decTxt.className  = 'dae-decision-card__decision';   decTxt.textContent  = dec.decision;
        var benLbl = document.createElement('span'); benLbl.className = 'dae-decision-card__field-label'; benLbl.textContent = 'Benefit';
        var benTxt = document.createElement('p');    benTxt.className  = 'dae-decision-card__benefit';    benTxt.textContent  = dec.benefit;
        card.appendChild(decLbl); card.appendChild(decTxt); card.appendChild(benLbl); card.appendChild(benTxt);
        if (dec.priority) { var pip = document.createElement('span'); pip.className = 'dae-pip ' + (PRIORITY_PIP[dec.priority] || 'dae-pip--medium'); pip.textContent = dec.priority; card.appendChild(pip); }
        decisionsCol.appendChild(card);
      });
    }
  } else if (archRecs.length) {
    var recLbl = document.createElement('p'); recLbl.className = 'brief-label'; recLbl.textContent = 'AI Recommendations'; decisionsCol.appendChild(recLbl);
    archRecs.forEach(function(rec) {
      var card = document.createElement('div'); card.className = 'dae-rec-card';
      var title = document.createElement('p'); title.className = 'dae-rec-card__title'; title.textContent = rec.title; card.appendChild(title);
      var meta = document.createElement('p'); meta.className = 'dae-rec-card__meta'; meta.textContent = 'Impact: ' + rec.impact + (rec.effort ? '  ·  Effort: ' + rec.effort : ''); card.appendChild(meta);
      decisionsCol.appendChild(card);
    });
  }
  middleBody.appendChild(decisionsCol);

  var techCol = document.createElement('div'); techCol.className = 'dae-tech-col';
  if (techStack.length) {
    var tLbl = document.createElement('p'); tLbl.className = 'brief-label'; tLbl.textContent = 'AI Technology Recommendation'; techCol.appendChild(tLbl);
    var tTable = document.createElement('div'); tTable.className = 'dae-tech-table';
    var tHrow = document.createElement('div'); tHrow.className = 'dae-tech-table__row dae-tech-table__row--header';
    ['Architecture Layer', 'Recommendation'].forEach(function(h) { var cell = document.createElement('span'); cell.className = 'dae-tech-table__cell'; cell.textContent = h; tHrow.appendChild(cell); });
    tTable.appendChild(tHrow);
    techStack.forEach(function(item) {
      var row = document.createElement('div'); row.className = 'dae-tech-table__row';
      var lCell = document.createElement('span'); lCell.className = 'dae-tech-table__cell dae-tech-table__cell--layer'; lCell.textContent = item.layer;
      var rCell = document.createElement('span'); rCell.className = 'dae-tech-table__cell dae-tech-table__cell--rec';   rCell.textContent = item.recommendation;
      row.appendChild(lCell); row.appendChild(rCell); tTable.appendChild(row);
    });
    techCol.appendChild(tTable);
  }
  middleBody.appendChild(techCol);
  wrap.appendChild(middleBody);

  // ── Architecture Pattern ──────────────────────────────────────────────────
  var patternNodes = archPattern.length ? archPattern : (isNewFormat ? archLayers.map(function(l) { return l.name; }) : []);
  if (patternNodes.length) {
    var patternSection = document.createElement('div'); patternSection.className = 'dae-pattern-section';
    var patternLbl = document.createElement('p'); patternLbl.className = 'brief-label'; patternLbl.textContent = 'Architecture Pattern'; patternSection.appendChild(patternLbl);
    var patternRow = document.createElement('div'); patternRow.className = 'dae-pattern-row';
    patternNodes.forEach(function(node, i) {
      var nodeEl = document.createElement('div'); nodeEl.className = 'dae-pattern-node dae-pattern-node--' + i;
      var nodeLabel = document.createElement('p'); nodeLabel.className = 'dae-pattern-node__label'; nodeLabel.textContent = node; nodeEl.appendChild(nodeLabel); patternRow.appendChild(nodeEl);
      if (i < patternNodes.length - 1) { var arr = document.createElement('span'); arr.className = 'dae-pattern-row__arrow'; arr.textContent = '↓'; patternRow.appendChild(arr); }
    });
    patternSection.appendChild(patternRow); wrap.appendChild(patternSection);
  }

  // ── Consultant Guidance ───────────────────────────────────────────────────
  if (archConsultantGuidance) {
    var cg = document.createElement('div'); cg.className = 'dae-consultant-guidance';
    var cgHeader = document.createElement('div'); cgHeader.className = 'dae-consultant-guidance__header';
    var cgIcon   = document.createElement('span'); cgIcon.className   = 'dae-consultant-guidance__icon';  cgIcon.textContent  = '◆';
    var cgTitle  = document.createElement('span'); cgTitle.className  = 'dae-consultant-guidance__title'; cgTitle.textContent = 'Consultant Guidance';
    cgHeader.appendChild(cgIcon); cgHeader.appendChild(cgTitle); cg.appendChild(cgHeader);
    var cgText = document.createElement('p'); cgText.className = 'dae-consultant-guidance__text'; cgText.textContent = archConsultantGuidance; cg.appendChild(cgText);
    wrap.appendChild(cg);
  }

  // ── Implementation Sequence (static) ─────────────────────────────────────
  var implSection = document.createElement('div'); implSection.className = 'dae-impl-section';
  var implLbl = document.createElement('p'); implLbl.className = 'brief-label'; implLbl.textContent = 'Recommended Implementation Sequence'; implSection.appendChild(implLbl);
  var implRow = document.createElement('div'); implRow.className = 'dae-impl-row';
  DAE_IMPL_SEQ.forEach(function(step, i) {
    var stepEl = document.createElement('div'); stepEl.className = 'dae-impl-step';
    var num = document.createElement('span'); num.className = 'dae-impl-step__num'; num.textContent = i + 1;
    var label = document.createElement('p'); label.className = 'dae-impl-step__label'; label.textContent = step;
    stepEl.appendChild(num); stepEl.appendChild(label); implRow.appendChild(stepEl);
    if (i < DAE_IMPL_SEQ.length - 1) { var arr = document.createElement('span'); arr.className = 'dae-impl-row__arrow'; arr.textContent = '→'; implRow.appendChild(arr); }
  });
  implSection.appendChild(implRow); wrap.appendChild(implSection);

  // ── Architecture Summary strip (new) or stats bar (legacy) ───────────────
  var hasSummary = archSummary.sourceSystems || archSummary.integrationPoints;
  if (hasSummary) {
    var strip = document.createElement('div'); strip.className = 'dae-arch-summary';
    var stripLbl = document.createElement('p'); stripLbl.className = 'brief-label'; stripLbl.textContent = 'Architecture Summary'; strip.appendChild(stripLbl);
    var cells = document.createElement('div'); cells.className = 'dae-arch-summary__cells';
    [
      { value: archSummary.sourceSystems,      label: 'Source Systems' },
      { value: archSummary.integrationPoints,  label: 'Integration Points' },
      { value: archSummary.aiStorage  || '—',  label: 'AI Storage',   isText: true },
      { value: archSummary.aiConsumers || '—', label: 'AI Consumers', isText: true },
    ].forEach(function(stat) {
      var cell = document.createElement('div'); cell.className = 'dae-arch-summary__cell';
      var val  = document.createElement('p'); val.className = stat.isText ? 'dae-arch-summary__value dae-arch-summary__value--text' : 'dae-arch-summary__value'; val.textContent = stat.value != null ? stat.value : '—';
      var slbl = document.createElement('p'); slbl.className = 'dae-arch-summary__label'; slbl.textContent = stat.label;
      cell.appendChild(val); cell.appendChild(slbl); cells.appendChild(cell);
    });
    strip.appendChild(cells); wrap.appendChild(strip);
  } else if (archStats.architectureReadiness || archStats.connectedSystems) {
    wrap.appendChild(ndScoresBar([
      { value: (archStats.architectureReadiness || 0) + '%', label: 'Architecture Readiness' },
      { value: (archStats.automation || 0) + '%',            label: 'Automation' },
      { value: String(archStats.connectedSystems || 0),      label: 'Connected Systems' },
      { value: String(archStats.disconnectedSystems || 0),   label: 'Disconnected' },
    ]));
  }
  return wrap;
}

// ── Technology Infrastructure: System Integration & Architecture ───────────────

function buildSystemIntegrationLayout(section) {
  var b = section.brief || {};

  // New fields
  var siaEngineeringSystems  = Array.isArray(b.siaEngineeringSystems)  ? b.siaEngineeringSystems  : [];
  var siaWorkflowSteps       = Array.isArray(b.siaWorkflowSteps)       ? b.siaWorkflowSteps       : [];
  var siaIntegrationPriorities = Array.isArray(b.siaIntegrationPriorities) ? b.siaIntegrationPriorities : [];
  var siaArchLayers          = Array.isArray(b.siaArchLayers)          ? b.siaArchLayers          : [];
  var siaImplSequence        = Array.isArray(b.siaImplSequence)        ? b.siaImplSequence        : [];
  var siaIntegrationPrinciples = Array.isArray(b.siaIntegrationPrinciples) ? b.siaIntegrationPrinciples : [];
  var siaConsultantGuidance  = b.siaConsultantGuidance || '';
  var siaAIRecommendation    = b.siaAIRecommendation   || '';
  // Legacy
  var connectedSystems   = Array.isArray(b.connectedSystems)   ? b.connectedSystems   : [];
  var integrationSummary = b.integrationSummary || {};

  var isNewFormat = siaEngineeringSystems.length > 0 || !!siaConsultantGuidance;

  var SIA_IMPL_STEPS = [
    'Connect Engineering Systems', 'Standardize Data Exchange',
    'Embed AI into Existing Workflows', 'Enable Secure Monitoring', 'Scale Across Engineering Programs',
  ];
  var PRIORITY_COLOR = { HIGH: '#f87171', MEDIUM: '#fbbf24', LOW: '#5CC5A7' };
  var ARCH_ACCENT    = ['#5CC5A7', '#818cf8', '#fbbf24', '#c084fc', '#fb923c'];

  var wrap = document.createElement('div'); wrap.className = 'sia-view';

  if (b.strategicPosition) {
    var posLabel = document.createElement('p'); posLabel.className = 'brief-label'; posLabel.textContent = 'Strategic Position'; wrap.appendChild(posLabel);
    var pos = document.createElement('p'); pos.className = 'sia-view__position'; pos.textContent = b.strategicPosition; wrap.appendChild(pos);
  }

  if (isNewFormat) {
    // ── Two-column body ──────────────────────────────────────────────────────
    var body = document.createElement('div'); body.className = 'sia-main-body';

    var leftCol = document.createElement('div'); leftCol.className = 'sia-blueprint-col';
    var bpLbl = document.createElement('p'); bpLbl.className = 'brief-label'; bpLbl.textContent = 'Integration Blueprint'; leftCol.appendChild(bpLbl);
    var sysGrid = document.createElement('div'); sysGrid.className = 'sia-blueprint-grid';
    siaEngineeringSystems.forEach(function(sys) {
      var card = document.createElement('div'); card.className = 'sia-system-card';
      var nm = document.createElement('p'); nm.className = 'sia-system-card__name'; nm.textContent = sys.name; card.appendChild(nm);
      [
        { label: 'Purpose',             value: sys.purpose },
        { label: 'Integration Pattern', value: sys.integrationPattern },
        { label: 'AI Interaction',      value: sys.aiInteraction },
        { label: 'Expected Outcome',    value: sys.expectedOutcome },
      ].forEach(function(field) {
        if (!field.value) return;
        var fl = document.createElement('p'); fl.className = 'sia-system-card__field-label'; fl.textContent = field.label; card.appendChild(fl);
        var vt = document.createElement('p'); vt.className = 'sia-system-card__value'; vt.textContent = field.value; card.appendChild(vt);
      });
      sysGrid.appendChild(card);
    });
    leftCol.appendChild(sysGrid);
    body.appendChild(leftCol);

    var rightCol = document.createElement('div'); rightCol.className = 'sia-right-col';
    var wfLbl = document.createElement('p'); wfLbl.className = 'brief-label'; wfLbl.textContent = 'Embedded AI Workflow'; rightCol.appendChild(wfLbl);
    var wfChain = document.createElement('div'); wfChain.className = 'sia-workflow-chain';
    var wfSteps = siaWorkflowSteps.length ? siaWorkflowSteps : ['Engineer', 'Engineering Tool', 'AI Service', 'Recommendation', 'Engineer Decision'];
    wfSteps.forEach(function(step, i) {
      var node = document.createElement('div'); node.className = 'sia-workflow-node'; node.textContent = step; wfChain.appendChild(node);
      if (i < wfSteps.length - 1) { var arrow = document.createElement('div'); arrow.className = 'sia-workflow-arrow'; arrow.textContent = '↓'; wfChain.appendChild(arrow); }
    });
    rightCol.appendChild(wfChain);

    if (siaIntegrationPriorities.length) {
      var prioLbl = document.createElement('p'); prioLbl.className = 'brief-label'; prioLbl.style.marginTop = '1.25rem'; prioLbl.textContent = 'Recommended Integration Priorities'; rightCol.appendChild(prioLbl);
      var prioList = document.createElement('div'); prioList.className = 'sia-priorities';
      siaIntegrationPriorities.forEach(function(p) {
        var item = document.createElement('div'); item.className = 'sia-priority-item';
        var header = document.createElement('div'); header.className = 'sia-priority-item__header';
        var num = document.createElement('span'); num.className = 'sia-priority-item__num'; num.textContent = p.order; header.appendChild(num);
        var iName = document.createElement('span'); iName.className = 'sia-priority-item__name'; iName.textContent = p.name; header.appendChild(iName);
        var pColor = PRIORITY_COLOR[p.priority] || '#fbbf24';
        var badge = document.createElement('span'); badge.className = 'sia-priority-badge'; badge.style.color = pColor; badge.style.borderColor = pColor + '55'; badge.textContent = p.priority; header.appendChild(badge);
        item.appendChild(header);
        if (p.businessBenefit) { var benefit = document.createElement('p'); benefit.className = 'sia-priority-item__benefit'; benefit.textContent = p.businessBenefit; item.appendChild(benefit); }
        prioList.appendChild(item);
      });
      rightCol.appendChild(prioList);
    }
    body.appendChild(rightCol);
    wrap.appendChild(body);

    // ── Architecture Blueprint (full-width) ─────────────────────────────────
    var hasArchTech = siaArchLayers.some(function(l) { return l.technologies && l.technologies.length; });
    if (hasArchTech) {
      var archLbl = document.createElement('p'); archLbl.className = 'brief-label'; archLbl.textContent = 'Integration Architecture Blueprint'; wrap.appendChild(archLbl);
      var archChain = document.createElement('div'); archChain.className = 'sia-arch-chain';
      siaArchLayers.forEach(function(layer, i) {
        var layerEl = document.createElement('div'); layerEl.className = 'sia-arch-layer'; layerEl.style.borderTop = '2px solid ' + (ARCH_ACCENT[i] || '#5CC5A7');
        var lName = document.createElement('p'); lName.className = 'sia-arch-layer__name'; lName.style.color = ARCH_ACCENT[i] || '#5CC5A7'; lName.textContent = layer.name; layerEl.appendChild(lName);
        if (Array.isArray(layer.technologies) && layer.technologies.length) {
          var techRow = document.createElement('div'); techRow.className = 'sia-arch-techs';
          layer.technologies.forEach(function(tech) { var pill = document.createElement('span'); pill.className = 'sia-tech-pill'; pill.textContent = tech; techRow.appendChild(pill); });
          layerEl.appendChild(techRow);
        }
        archChain.appendChild(layerEl);
        if (i < siaArchLayers.length - 1) { var arr = document.createElement('div'); arr.className = 'sia-arch-arrow'; arr.textContent = '↓'; archChain.appendChild(arr); }
      });
      wrap.appendChild(archChain);
    }

    // ── Integration Principles ──────────────────────────────────────────────
    if (siaIntegrationPrinciples.length) {
      var princLbl = document.createElement('p'); princLbl.className = 'brief-label'; princLbl.textContent = 'Integration Principles'; wrap.appendChild(princLbl);
      var princGrid = document.createElement('div'); princGrid.className = 'sia-principles';
      siaIntegrationPrinciples.forEach(function(principle) { var item = document.createElement('div'); item.className = 'sia-principle-item'; item.textContent = principle; princGrid.appendChild(item); });
      wrap.appendChild(princGrid);
    }

    // ── Implementation Sequence ─────────────────────────────────────────────
    var seqLbl = document.createElement('p'); seqLbl.className = 'brief-label'; seqLbl.textContent = 'Recommended Implementation Sequence'; wrap.appendChild(seqLbl);
    var seqSteps = siaImplSequence.length ? siaImplSequence : SIA_IMPL_STEPS;
    var seq = document.createElement('div'); seq.className = 'sia-impl-seq';
    seqSteps.forEach(function(step, i) {
      var item = document.createElement('div'); item.className = 'sia-impl-step';
      var num = document.createElement('span'); num.className = 'sia-impl-step__num'; num.textContent = i + 1; item.appendChild(num);
      var lbl = document.createElement('span'); lbl.className = 'sia-impl-step__label'; lbl.textContent = step; item.appendChild(lbl);
      seq.appendChild(item);
    });
    wrap.appendChild(seq);

    // ── Consultant Guidance ─────────────────────────────────────────────────
    if (siaConsultantGuidance) {
      var cg = document.createElement('div'); cg.className = 'sia-consultant-guidance';
      var cgTitle = document.createElement('p'); cgTitle.className = 'sia-consultant-guidance__title'; cgTitle.textContent = 'Consultant Guidance'; cg.appendChild(cgTitle);
      var cgText = document.createElement('p'); cgText.className = 'sia-consultant-guidance__text'; cgText.textContent = siaConsultantGuidance; cg.appendChild(cgText);
      wrap.appendChild(cg);
    }

    // ── AI Recommendation ───────────────────────────────────────────────────
    if (siaAIRecommendation) {
      var ar = document.createElement('div'); ar.className = 'sia-ai-recommendation';
      var arTitle = document.createElement('p'); arTitle.className = 'sia-ai-recommendation__title'; arTitle.textContent = 'AI Recommendation'; ar.appendChild(arTitle);
      var arText = document.createElement('p'); arText.className = 'sia-ai-recommendation__text'; arText.textContent = siaAIRecommendation; ar.appendChild(arText);
      wrap.appendChild(ar);
    }

  } else {
    // ── Legacy layout ────────────────────────────────────────────────────────
    if (b.integrationReadiness) {
      var rdBadge = document.createElement('div'); rdBadge.className = 'sia-readiness-badge'; rdBadge.textContent = 'INTEGRATION READINESS: ' + b.integrationReadiness + '%'; wrap.appendChild(rdBadge);
    }
    var legBody = document.createElement('div'); legBody.className = 'sia-body';
    var legLeft = document.createElement('div'); legLeft.className = 'sia-systems-col';
    var legSysLbl = document.createElement('p'); legSysLbl.className = 'brief-label'; legSysLbl.textContent = 'Connected Systems'; legLeft.appendChild(legSysLbl);
    var legGrid = document.createElement('div'); legGrid.className = 'sia-sys-grid';
    connectedSystems.forEach(function(sys) {
      var status = (sys.status || 'MISSING').toUpperCase();
      var card = document.createElement('div'); card.className = 'sia-sys-card sia-sys-card--' + status.toLowerCase();
      var nm = document.createElement('p'); nm.className = 'sia-sys-card__name'; nm.textContent = sys.name; card.appendChild(nm);
      if (sys.integrationMethod) { var method = document.createElement('p'); method.className = 'sia-sys-card__method'; method.textContent = 'Integration Method: ' + sys.integrationMethod; card.appendChild(method); }
      legGrid.appendChild(card);
    });
    legLeft.appendChild(legGrid); legBody.appendChild(legLeft);
    var legRight = document.createElement('div'); legRight.className = 'sia-arch-col';
    var legArchLbl = document.createElement('p'); legArchLbl.className = 'brief-label'; legArchLbl.textContent = 'AI Integration Architecture'; legRight.appendChild(legArchLbl);
    legBody.appendChild(legRight); wrap.appendChild(legBody);

    var hasSummary = integrationSummary.integration || integrationSummary.automation || integrationSummary.reliability || integrationSummary.scalability;
    if (hasSummary) {
      wrap.appendChild(ndSummaryGrid([
        { label: 'Integration', value: integrationSummary.integration },
        { label: 'Automation',  value: integrationSummary.automation },
        { label: 'Reliability', value: integrationSummary.reliability },
        { label: 'Scalability', value: integrationSummary.scalability },
      ]));
    }
  }
  return wrap;
}

// ── Technology Infrastructure: AI Platform Readiness ──────────────────────────

function buildAIPlatformReadinessLayout(section) {
  var b = section.brief || {};

  // New fields
  var platformCapabilities    = Array.isArray(b.platformCapabilities)    ? b.platformCapabilities    : [];
  var platformBlueprintLayers = Array.isArray(b.platformBlueprintLayers) ? b.platformBlueprintLayers : [];
  var platformRecs            = Array.isArray(b.platformRecs)            ? b.platformRecs            : [];
  var aprImplRoadmap          = Array.isArray(b.aprImplRoadmap)          ? b.aprImplRoadmap          : [];
  var aprStackLayers          = Array.isArray(b.aprStackLayers)          ? b.aprStackLayers          : [];
  var aprConsultantGuidance   = b.aprConsultantGuidance || '';
  var aprAIRecommendation     = b.aprAIRecommendation   || '';
  // Legacy fields
  var capabilityAssessment    = Array.isArray(b.capabilityAssessment)    ? b.capabilityAssessment    : [];
  var platformStack           = Array.isArray(b.platformStack)           ? b.platformStack           : [];
  var platformRecommendations = Array.isArray(b.platformRecommendations) ? b.platformRecommendations : [];
  var platformSummary         = b.platformSummary || {};

  var isNewFormat = platformCapabilities.some(function(c) { return c.purpose; }) ||
                    platformBlueprintLayers.some(function(l) { return l.recommendation; }) ||
                    platformRecs.length > 0 || !!aprConsultantGuidance;

  var APR_IMPL_STEPS = [
    'Establish Development Workspace', 'Build Knowledge Platform', 'Configure Prompt Management',
    'Deploy AI Services', 'Enable Monitoring', 'Scale Across Projects',
  ];
  var APR_BLUEPRINT_LAYERS = [
    'Engineering Users', 'AI Applications', 'Prompt & Model Services',
    'Knowledge Platform', 'Deployment Services', 'Monitoring & Governance', 'Development Workspace',
  ];
  var LAYER_ACCENT    = ['#c084fc', '#5CC5A7', '#818cf8', '#fbbf24', '#34d399', '#f87171', '#94a3b8'];
  var PRIORITY_COLOR  = { HIGH: '#f87171', MEDIUM: '#fbbf24', LOW: '#5CC5A7' };
  var STATUS_CLASS    = { READY: 'apr-status--ready', PARTIAL: 'apr-status--partial', MISSING: 'apr-status--missing' };
  var PRIORITY_CLASS  = { HIGH: 'apr-priority--high', MEDIUM: 'apr-priority--medium', LOW: 'apr-priority--low' };
  var STACK_ICONS     = { 'AI Applications': '⊞', 'AI Model & Prompt Management': '⚙', 'Knowledge & Retrieval Services': '◻', 'AI Deployment & Automation': '▷', 'AI Monitoring & Evaluation': '△', 'AI Development Environment': '⌨' };

  var wrap = document.createElement('div'); wrap.className = 'apr-view';

  if (b.strategicPosition) {
    var posLabel = document.createElement('p'); posLabel.className = 'brief-label'; posLabel.textContent = 'Strategic Position'; wrap.appendChild(posLabel);
    var pos = document.createElement('p'); pos.className = 'apr-view__position'; pos.textContent = b.strategicPosition; wrap.appendChild(pos);
  }

  if (isNewFormat) {
    // ── Main Body: LEFT capabilities | RIGHT blueprint chain ──────────────────
    var body = document.createElement('div'); body.className = 'apr-main-body';

    var leftCol = document.createElement('div'); leftCol.className = 'apr-cap-list-col';
    var capLbl = document.createElement('p'); capLbl.className = 'brief-label'; capLbl.textContent = 'Recommended AI Platform'; leftCol.appendChild(capLbl);
    var capList = document.createElement('div'); capList.className = 'apr-cap-list';
    platformCapabilities.forEach(function(cap) {
      var card = document.createElement('div'); card.className = 'apr-cap2-card';
      var nm = document.createElement('p'); nm.className = 'apr-cap2-card__name'; nm.textContent = cap.name; card.appendChild(nm);
      if (cap.purpose) {
        var pfl = document.createElement('p'); pfl.className = 'apr-cap2-card__field-label'; pfl.textContent = 'Purpose'; card.appendChild(pfl);
        var ptx = document.createElement('p'); ptx.className = 'apr-cap2-card__purpose'; ptx.textContent = cap.purpose; card.appendChild(ptx);
      }
      if (Array.isArray(cap.capabilities) && cap.capabilities.length) {
        var cfl = document.createElement('p'); cfl.className = 'apr-cap2-card__field-label'; cfl.textContent = 'Recommended Capabilities'; card.appendChild(cfl);
        var ul = document.createElement('ul'); ul.className = 'apr-cap2-card__caps';
        cap.capabilities.forEach(function(c) { var li = document.createElement('li'); li.textContent = c; ul.appendChild(li); });
        card.appendChild(ul);
      }
      if (cap.businessValue) {
        var vfl = document.createElement('p'); vfl.className = 'apr-cap2-card__field-label'; vfl.textContent = 'Business Value'; card.appendChild(vfl);
        var vtx = document.createElement('p'); vtx.className = 'apr-cap2-card__value'; vtx.textContent = cap.businessValue; card.appendChild(vtx);
      }
      capList.appendChild(card);
    });
    leftCol.appendChild(capList); body.appendChild(leftCol);

    var rightCol = document.createElement('div'); rightCol.className = 'apr-blueprint-col';
    var bpLbl = document.createElement('p'); bpLbl.className = 'brief-label'; bpLbl.textContent = 'AI Platform Blueprint'; rightCol.appendChild(bpLbl);
    var bpChain = document.createElement('div'); bpChain.className = 'apr-blueprint-chain';
    var bpLayers = platformBlueprintLayers.length ? platformBlueprintLayers : APR_BLUEPRINT_LAYERS.map(function(layer) { return { layer: layer, recommendation: '' }; });
    bpLayers.forEach(function(layerObj, i) {
      var node = document.createElement('div'); node.className = 'apr-blueprint-node'; node.style.borderLeft = '3px solid ' + (LAYER_ACCENT[i] || '#5CC5A7');
      var lName = document.createElement('p'); lName.className = 'apr-blueprint-node__layer'; lName.textContent = layerObj.layer; node.appendChild(lName);
      if (layerObj.recommendation) { var rec = document.createElement('p'); rec.className = 'apr-blueprint-node__rec'; rec.textContent = layerObj.recommendation; node.appendChild(rec); }
      bpChain.appendChild(node);
      if (i < bpLayers.length - 1) { var arrow = document.createElement('div'); arrow.className = 'apr-blueprint-arrow'; arrow.textContent = '↓'; bpChain.appendChild(arrow); }
    });
    rightCol.appendChild(bpChain); body.appendChild(rightCol);
    wrap.appendChild(body);

    // ── Platform Recommendations ──────────────────────────────────────────────
    if (platformRecs.length) {
      var recsLbl = document.createElement('p'); recsLbl.className = 'brief-label'; recsLbl.textContent = 'AI Platform Recommendations'; wrap.appendChild(recsLbl);
      var recsGrid = document.createElement('div'); recsGrid.className = 'apr-recs2-grid';
      platformRecs.forEach(function(rec) {
        var card = document.createElement('div'); card.className = 'apr-rec2-card';
        var title = document.createElement('p'); title.className = 'apr-rec2-card__title'; title.textContent = rec.recommendation; card.appendChild(title);
        if (rec.why) {
          var wl = document.createElement('p'); wl.className = 'apr-rec2-card__field-label'; wl.textContent = 'Why'; card.appendChild(wl);
          var wtx = document.createElement('p'); wtx.className = 'apr-rec2-card__why'; wtx.textContent = rec.why; card.appendChild(wtx);
        }
        var footer = document.createElement('div'); footer.className = 'apr-rec2-card__footer';
        var pColor = PRIORITY_COLOR[rec.priority] || '#fbbf24';
        var pBadge = document.createElement('span'); pBadge.className = 'apr-rec2-priority'; pBadge.style.color = pColor; pBadge.style.borderColor = pColor + '55'; pBadge.textContent = rec.priority || 'MEDIUM'; footer.appendChild(pBadge);
        if (rec.implementationPhase) { var phase = document.createElement('span'); phase.className = 'apr-rec2-phase'; phase.textContent = rec.implementationPhase; footer.appendChild(phase); }
        card.appendChild(footer); recsGrid.appendChild(card);
      });
      wrap.appendChild(recsGrid);
    }

    // ── Platform Implementation Roadmap ──────────────────────────────────────
    var roadmapLbl = document.createElement('p'); roadmapLbl.className = 'brief-label'; roadmapLbl.textContent = 'Platform Implementation Roadmap'; wrap.appendChild(roadmapLbl);
    var roadmapSteps = aprImplRoadmap.length ? aprImplRoadmap : APR_IMPL_STEPS;
    var roadmapSeq = document.createElement('div'); roadmapSeq.className = 'apr-impl-seq';
    roadmapSteps.forEach(function(step, i) {
      var item = document.createElement('div'); item.className = 'apr-impl-step';
      var num = document.createElement('span'); num.className = 'apr-impl-step__num'; num.textContent = i + 1; item.appendChild(num);
      var lbl = document.createElement('span'); lbl.className = 'apr-impl-step__label'; lbl.textContent = step; item.appendChild(lbl);
      roadmapSeq.appendChild(item);
    });
    wrap.appendChild(roadmapSeq);

    // ── Recommended AI Stack table ────────────────────────────────────────────
    var hasStackRec = aprStackLayers.some(function(l) { return l.recommendation; });
    if (hasStackRec) {
      var stackLbl = document.createElement('p'); stackLbl.className = 'brief-label'; stackLbl.textContent = 'Recommended AI Stack'; wrap.appendChild(stackLbl);
      var stackTable = document.createElement('table'); stackTable.className = 'apr-stack2-table';
      var thead = document.createElement('thead'); thead.innerHTML = '<tr><th>Layer</th><th>Recommendation</th></tr>'; stackTable.appendChild(thead);
      var tbody = document.createElement('tbody');
      aprStackLayers.forEach(function(layer) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td'); td1.textContent = layer.layer;
        var td2 = document.createElement('td'); td2.textContent = layer.recommendation || '—';
        tr.appendChild(td1); tr.appendChild(td2); tbody.appendChild(tr);
      });
      stackTable.appendChild(tbody); wrap.appendChild(stackTable);
    }

    // ── Consultant Guidance ───────────────────────────────────────────────────
    if (aprConsultantGuidance) {
      var cg = document.createElement('div'); cg.className = 'apr-consultant-guidance';
      var cgTitle = document.createElement('p'); cgTitle.className = 'apr-consultant-guidance__title'; cgTitle.textContent = 'Consultant Guidance'; cg.appendChild(cgTitle);
      var cgText = document.createElement('p'); cgText.className = 'apr-consultant-guidance__text'; cgText.textContent = aprConsultantGuidance; cg.appendChild(cgText);
      wrap.appendChild(cg);
    }

    // ── AI Recommendation ─────────────────────────────────────────────────────
    if (aprAIRecommendation) {
      var ar = document.createElement('div'); ar.className = 'apr-ai-recommendation';
      var arTitle = document.createElement('p'); arTitle.className = 'apr-ai-recommendation__title'; arTitle.textContent = 'AI Recommendation'; ar.appendChild(arTitle);
      var arText = document.createElement('p'); arText.className = 'apr-ai-recommendation__text'; arText.textContent = aprAIRecommendation; ar.appendChild(arText);
      wrap.appendChild(ar);
    }

  } else {
    // ── Legacy layout ─────────────────────────────────────────────────────────
    if (b.platformReadiness) {
      var rdBadge = document.createElement('div'); rdBadge.className = 'apr-readiness-badge'; rdBadge.textContent = 'PLATFORM READINESS: ' + b.platformReadiness + '%'; wrap.appendChild(rdBadge);
    }
    var legBody = document.createElement('div'); legBody.className = 'apr-body';
    var legLeft = document.createElement('div'); legLeft.className = 'apr-capability-col';
    var legCapLbl = document.createElement('p'); legCapLbl.className = 'brief-label'; legCapLbl.textContent = 'Platform Capability Assessment'; legLeft.appendChild(legCapLbl);
    capabilityAssessment.forEach(function(cap) {
      var status = (cap.status || 'PARTIAL').toUpperCase();
      var card = document.createElement('div'); card.className = 'apr-cap-card apr-cap-card--' + status.toLowerCase();
      var nm = document.createElement('p'); nm.className = 'apr-cap-card__name'; nm.textContent = cap.name; card.appendChild(nm);
      var sc = document.createElement('p'); sc.className = 'apr-cap-card__score'; sc.textContent = (cap.score || 0) + '%'; card.appendChild(sc);
      var bdg = document.createElement('span'); bdg.className = 'apr-status ' + (STATUS_CLASS[status] || 'apr-status--partial'); bdg.textContent = status; card.appendChild(bdg);
      legLeft.appendChild(card);
    });
    legBody.appendChild(legLeft);
    var legCenter = document.createElement('div'); legCenter.className = 'apr-stack-col';
    var legStackLbl = document.createElement('p'); legStackLbl.className = 'brief-label'; legStackLbl.textContent = 'AI Platform Stack'; legCenter.appendChild(legStackLbl);
    var legStackList = document.createElement('div'); legStackList.className = 'apr-stack-list';
    platformStack.forEach(function(layer) {
      var status = (layer.status || 'MISSING').toUpperCase();
      var row = document.createElement('div'); row.className = 'apr-stack-row apr-stack-row--' + status.toLowerCase();
      var icon = document.createElement('div'); icon.className = 'apr-stack-row__icon'; icon.textContent = STACK_ICONS[layer.layer] || '●'; row.appendChild(icon);
      var info = document.createElement('div'); info.className = 'apr-stack-row__info';
      var lname = document.createElement('p'); lname.className = 'apr-stack-row__name'; lname.textContent = layer.layer; info.appendChild(lname);
      var lscore = document.createElement('p'); lscore.className = 'apr-stack-row__score'; lscore.textContent = (layer.score || 0) + '%'; info.appendChild(lscore);
      row.appendChild(info);
      var bdg = document.createElement('span'); bdg.className = 'apr-status ' + (STATUS_CLASS[status] || 'apr-status--missing'); bdg.textContent = status; row.appendChild(bdg);
      legStackList.appendChild(row);
    });
    legCenter.appendChild(legStackList); legBody.appendChild(legCenter);
    var legRight = document.createElement('div'); legRight.className = 'apr-recs-col';
    var legRecsLbl = document.createElement('p'); legRecsLbl.className = 'brief-label'; legRecsLbl.textContent = 'AI Recommendations'; legRight.appendChild(legRecsLbl);
    var legRecsList = document.createElement('div'); legRecsList.className = 'apr-recs-list';
    platformRecommendations.forEach(function(rec) {
      var item = document.createElement('div'); item.className = 'apr-rec-item';
      var text = document.createElement('p'); text.className = 'apr-rec-item__text'; text.textContent = rec.text; item.appendChild(text);
      var priority = document.createElement('p'); priority.className = 'apr-rec-item__meta';
      var pk = (rec.priority || 'MEDIUM').toUpperCase();
      priority.textContent = 'Priority: ' + (rec.priority || 'MEDIUM'); item.appendChild(priority);
      if (rec.benefit) { var benefit = document.createElement('p'); benefit.className = 'apr-rec-item__benefit'; benefit.textContent = 'Expected Benefit: ' + rec.benefit; item.appendChild(benefit); }
      legRecsList.appendChild(item);
    });
    legRight.appendChild(legRecsList); legBody.appendChild(legRight); wrap.appendChild(legBody);

    if (platformSummary.development || platformSummary.knowledge || platformSummary.deployment || platformSummary.monitoring) {
      wrap.appendChild(ndSummaryGrid([
        { label: 'Development', value: platformSummary.development },
        { label: 'Knowledge',   value: platformSummary.knowledge },
        { label: 'Deployment',  value: platformSummary.deployment },
        { label: 'Monitoring',  value: platformSummary.monitoring },
      ]));
    }
  }
  return wrap;
}

// ── Technology Infrastructure: AI Compute & Deployment Strategy ───────────────

function buildAIComputeDeploymentLayout(section) {
  var b = section.brief || {};

  // New fields
  var deploymentBlocks      = Array.isArray(b.deploymentBlocks)      ? b.deploymentBlocks      : [];
  var cdsDeploymentFlow     = Array.isArray(b.cdsDeploymentFlow)     ? b.cdsDeploymentFlow     : [];
  var techRecommendations   = Array.isArray(b.techRecommendations)   ? b.techRecommendations   : [];
  var cdsArchRationale      = Array.isArray(b.cdsArchRationale)      ? b.cdsArchRationale      : [];
  var deploymentDecisions   = Array.isArray(b.deploymentDecisions)   ? b.deploymentDecisions   : [];
  var cdsImplSequence       = Array.isArray(b.cdsImplSequence)       ? b.cdsImplSequence       : [];
  var infraItems            = Array.isArray(b.infraItems)            ? b.infraItems            : [];
  var cdsInvestmentEstimate = Array.isArray(b.cdsInvestmentEstimate) ? b.cdsInvestmentEstimate : [];
  var cdsConsultantGuidance = b.cdsConsultantGuidance || '';
  var cdsAIRecommendation   = b.cdsAIRecommendation   || '';
  // Legacy fields
  var workloadProfile           = Array.isArray(b.workloadProfile)           ? b.workloadProfile           : [];
  var deploymentRecommendations = Array.isArray(b.deploymentRecommendations) ? b.deploymentRecommendations : [];
  var deploymentScores          = b.deploymentScores || {};

  var isNewFormat = deploymentBlocks.length > 0 || techRecommendations.length > 0;

  var CDS_FLOW_NODES = ['Engineering Repositories', 'Integration Layer', 'AI Data Store', 'LLM Inference', 'AI Application', 'Engineering Users'];
  var CDS_IMPL_STEPS = ['Prepare AI Data', 'Provision Infrastructure', 'Deploy AI Platform', 'Deploy AI Assistant', 'Pilot with Engineering Team', 'Scale to Organisation'];
  var BLOCK_ACCENT = { 'AI Workload': '#5CC5A7', 'Deployment Model': '#818cf8', 'Compute Strategy': '#fbbf24', 'Scaling Strategy': '#f87171' };

  var wrap = document.createElement('div'); wrap.className = 'cds-view';

  if (b.strategicPosition) {
    var posLabel = document.createElement('p'); posLabel.className = 'brief-label'; posLabel.textContent = 'Strategic Position'; wrap.appendChild(posLabel);
    var pos = document.createElement('p'); pos.className = 'cds-view__position'; pos.textContent = b.strategicPosition; wrap.appendChild(pos);
  }

  if (isNewFormat) {
    // ── Recommended Deployment Architecture ──────────────────────────────────
    if (deploymentBlocks.length) {
      var archLbl = document.createElement('p'); archLbl.className = 'brief-label'; archLbl.textContent = 'Recommended Deployment Architecture'; wrap.appendChild(archLbl);
      var archGrid = document.createElement('div'); archGrid.className = 'cds-arch-grid';
      deploymentBlocks.forEach(function(block) {
        var card = document.createElement('div'); card.className = 'cds-arch-block';
        var accent = BLOCK_ACCENT[block.blockType] || '#5CC5A7';
        card.style.borderTop = '3px solid ' + accent;
        var type = document.createElement('p'); type.className = 'cds-arch-block__type'; type.style.color = accent; type.textContent = block.blockType; card.appendChild(type);
        var recLabel = document.createElement('p'); recLabel.className = 'cds-arch-block__field-label'; recLabel.textContent = 'Recommendation'; card.appendChild(recLabel);
        var nm = document.createElement('p'); nm.className = 'cds-arch-block__name'; nm.textContent = block.name; card.appendChild(nm);
        if (block.why) {
          var whyLabel = document.createElement('p'); whyLabel.className = 'cds-arch-block__field-label'; whyLabel.textContent = 'Why Recommended'; card.appendChild(whyLabel);
          var why = document.createElement('p'); why.className = 'cds-arch-block__why'; why.textContent = block.why; card.appendChild(why);
        }
        archGrid.appendChild(card);
      });
      wrap.appendChild(archGrid);
    }

    // ── Middle: Deployment Flow (left) + Tech Recommendations table (right) ──
    var midRow = document.createElement('div'); midRow.className = 'cds-mid-row';

    var flowCol = document.createElement('div'); flowCol.className = 'cds-flow-col';
    var flowLbl = document.createElement('p'); flowLbl.className = 'brief-label'; flowLbl.textContent = 'Recommended Deployment Flow'; flowCol.appendChild(flowLbl);
    var flowNodes = cdsDeploymentFlow.length ? cdsDeploymentFlow : CDS_FLOW_NODES;
    var flowChain = document.createElement('div'); flowChain.className = 'cds-flow-chain';
    flowNodes.forEach(function(node, i) {
      var nodeEl = document.createElement('div'); nodeEl.className = 'cds-flow-node cds-flow-node--' + i; nodeEl.textContent = node; flowChain.appendChild(nodeEl);
      if (i < flowNodes.length - 1) { var arrow = document.createElement('div'); arrow.className = 'cds-flow-arrow'; arrow.textContent = '↓'; flowChain.appendChild(arrow); }
    });
    flowCol.appendChild(flowChain); midRow.appendChild(flowCol);

    if (techRecommendations.length) {
      var techCol = document.createElement('div'); techCol.className = 'cds-tech-col';
      var techLbl = document.createElement('p'); techLbl.className = 'brief-label'; techLbl.textContent = 'Technology Recommendations'; techCol.appendChild(techLbl);
      var techTable = document.createElement('table'); techTable.className = 'cds-tech-table';
      var tHead = document.createElement('thead'); tHead.innerHTML = '<tr><th>Layer</th><th>Recommended Technology</th><th>Selection Rationale</th></tr>'; techTable.appendChild(tHead);
      var tBody = document.createElement('tbody');
      techRecommendations.forEach(function(r) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td'); td1.textContent = r.layer || '';
        var td2 = document.createElement('td'); td2.textContent = r.recommendation || '';
        var td3 = document.createElement('td'); td3.textContent = r.selectionRationale || '';
        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tBody.appendChild(tr);
      });
      techTable.appendChild(tBody); techCol.appendChild(techTable); midRow.appendChild(techCol);
    }
    wrap.appendChild(midRow);

    // ── Why this Architecture? ────────────────────────────────────────────────
    if (cdsArchRationale.length) {
      var ratLbl = document.createElement('p'); ratLbl.className = 'brief-label'; ratLbl.textContent = 'Why this Architecture?'; wrap.appendChild(ratLbl);
      var ratList = document.createElement('ul'); ratList.className = 'cds-arch-rationale';
      cdsArchRationale.forEach(function(point) { var li = document.createElement('li'); li.className = 'cds-arch-rationale__item'; li.textContent = point; ratList.appendChild(li); });
      wrap.appendChild(ratList);
    }

    // ── Deployment Decisions ──────────────────────────────────────────────────
    if (deploymentDecisions.length) {
      var decLbl = document.createElement('p'); decLbl.className = 'brief-label'; decLbl.textContent = 'Deployment Decisions'; wrap.appendChild(decLbl);
      var decGrid = document.createElement('div'); decGrid.className = 'cds-dec-grid';
      deploymentDecisions.forEach(function(d) {
        var card = document.createElement('div'); card.className = 'cds-dec-card';
        var dtype = document.createElement('p'); dtype.className = 'cds-dec-card__type'; dtype.textContent = d.decisionType; card.appendChild(dtype);
        var choice = document.createElement('p'); choice.className = 'cds-dec-card__choice'; choice.textContent = d.choice; card.appendChild(choice);
        if (d.reason) { var reason = document.createElement('p'); reason.className = 'cds-dec-card__reason'; reason.textContent = d.reason; card.appendChild(reason); }
        decGrid.appendChild(card);
      });
      wrap.appendChild(decGrid);
    }

    // ── Implementation Sequence ───────────────────────────────────────────────
    var implLbl = document.createElement('p'); implLbl.className = 'brief-label'; implLbl.textContent = 'Implementation Sequence'; wrap.appendChild(implLbl);
    var implSteps = cdsImplSequence.length ? cdsImplSequence : CDS_IMPL_STEPS;
    var implSeq = document.createElement('div'); implSeq.className = 'cds-impl-seq';
    implSteps.forEach(function(step, i) {
      var item = document.createElement('div'); item.className = 'cds-impl-step';
      var num = document.createElement('span'); num.className = 'cds-impl-step__num'; num.textContent = i + 1; item.appendChild(num);
      var lbl = document.createElement('span'); lbl.className = 'cds-impl-step__label'; lbl.textContent = step; item.appendChild(lbl);
      implSeq.appendChild(item);
    });
    wrap.appendChild(implSeq);

    // ── Expected Infrastructure table ─────────────────────────────────────────
    if (infraItems.length) {
      var infraLbl = document.createElement('p'); infraLbl.className = 'brief-label'; infraLbl.textContent = 'Expected Infrastructure'; wrap.appendChild(infraLbl);
      var infraTable = document.createElement('table'); infraTable.className = 'cds-infra-table';
      var iHead = document.createElement('thead'); iHead.innerHTML = '<tr><th>Component</th><th>Recommendation</th></tr>'; infraTable.appendChild(iHead);
      var iBody = document.createElement('tbody');
      infraItems.forEach(function(item) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td'); td1.textContent = item.item || '';
        var td2 = document.createElement('td'); td2.textContent = item.recommendation || '';
        tr.appendChild(td1); tr.appendChild(td2); iBody.appendChild(tr);
      });
      infraTable.appendChild(iBody); wrap.appendChild(infraTable);
    }

    // ── Estimated Infrastructure Investment ───────────────────────────────────
    if (cdsInvestmentEstimate.length) {
      var investLbl = document.createElement('p'); investLbl.className = 'brief-label'; investLbl.textContent = 'Estimated Infrastructure Investment'; wrap.appendChild(investLbl);
      var investTable = document.createElement('table'); investTable.className = 'cds-investment-table';
      var vHead = document.createElement('thead'); vHead.innerHTML = '<tr><th>Area</th><th>Estimate</th></tr>'; investTable.appendChild(vHead);
      var vBody = document.createElement('tbody');
      cdsInvestmentEstimate.forEach(function(row) {
        var tr = document.createElement('tr');
        var levelClass = row.estimate === 'High' ? 'cds-invest--high' : row.estimate === 'Low' ? 'cds-invest--low' : 'cds-invest--medium';
        var td1 = document.createElement('td'); td1.textContent = row.area || '';
        var td2 = document.createElement('td'); var bdg = document.createElement('span'); bdg.className = 'cds-invest-badge ' + levelClass; bdg.textContent = row.estimate || 'Medium'; td2.appendChild(bdg);
        tr.appendChild(td1); tr.appendChild(td2); vBody.appendChild(tr);
      });
      investTable.appendChild(vBody); wrap.appendChild(investTable);
    }

    // ── Consultant Guidance ───────────────────────────────────────────────────
    if (cdsConsultantGuidance) {
      var cg = document.createElement('div'); cg.className = 'cds-consultant-guidance';
      var cgTitle = document.createElement('p'); cgTitle.className = 'cds-consultant-guidance__title'; cgTitle.textContent = 'Consultant Guidance'; cg.appendChild(cgTitle);
      var cgText = document.createElement('p'); cgText.className = 'cds-consultant-guidance__text'; cgText.textContent = cdsConsultantGuidance; cg.appendChild(cgText);
      wrap.appendChild(cg);
    }

    // ── AI Recommendation ─────────────────────────────────────────────────────
    if (cdsAIRecommendation) {
      var ar = document.createElement('div'); ar.className = 'cds-ai-recommendation';
      var arTitle = document.createElement('p'); arTitle.className = 'cds-ai-recommendation__title'; arTitle.textContent = 'AI Recommendation'; ar.appendChild(arTitle);
      var arText = document.createElement('p'); arText.className = 'cds-ai-recommendation__text'; arText.textContent = cdsAIRecommendation; ar.appendChild(arText);
      wrap.appendChild(ar);
    }

  } else {
    // ── Legacy layout ─────────────────────────────────────────────────────────
    if (b.deploymentReadiness) {
      var rdBadge = document.createElement('div'); rdBadge.className = 'cds-readiness-badge'; rdBadge.textContent = 'DEPLOYMENT READINESS: ' + b.deploymentReadiness + '%'; wrap.appendChild(rdBadge);
    }
    var legBody = document.createElement('div'); legBody.className = 'cds-body';
    var workloadCol = document.createElement('div'); workloadCol.className = 'cds-workload-col';
    var workloadLbl = document.createElement('p'); workloadLbl.className = 'brief-label'; workloadLbl.textContent = 'AI Workload Profile'; workloadCol.appendChild(workloadLbl);
    var PCLS = { CRITICAL: 'cds-priority--critical', HIGH: 'cds-priority--high', MEDIUM: 'cds-priority--medium', LOW: 'cds-priority--low' };
    workloadProfile.forEach(function(wl) {
      var card = document.createElement('div'); card.className = 'cds-workload-card';
      var wlName = document.createElement('p'); wlName.className = 'cds-workload-card__name'; wlName.textContent = wl.workloadType; card.appendChild(wlName);
      [['Compute Requirement', wl.computeRequirement], ['Performance Requirement', wl.performanceRequirement], ['Scalability Requirement', wl.scalabilityRequirement]].forEach(function(pair) {
        if (!pair[1]) return;
        var row = document.createElement('p'); row.className = 'cds-workload-card__spec'; row.innerHTML = '<span class="cds-workload-card__spec-label">' + pair[0] + ':</span> ' + pair[1]; card.appendChild(row);
      });
      var badge = document.createElement('span'); badge.className = 'cds-priority ' + (PCLS[String(wl.priority || 'MEDIUM').toUpperCase()] || 'cds-priority--medium'); badge.textContent = 'PRIORITY: ' + (wl.priority || 'MEDIUM'); card.appendChild(badge);
      workloadCol.appendChild(card);
    });
    legBody.appendChild(workloadCol);
    var legRight = document.createElement('div'); legRight.className = 'cds-right-col';
    if (deploymentRecommendations.length) {
      var recsSection = document.createElement('div'); recsSection.className = 'cds-recs-section';
      var recsLbl = document.createElement('p'); recsLbl.className = 'brief-label'; recsLbl.textContent = 'AI Recommendations'; recsSection.appendChild(recsLbl);
      var recsGrid = document.createElement('div'); recsGrid.className = 'cds-recs-grid';
      var ICLS = { High: 'cds-impact--high', Medium: 'cds-impact--medium', Low: 'cds-impact--low' };
      deploymentRecommendations.forEach(function(rec) {
        var card = document.createElement('div'); card.className = 'cds-rec-card';
        var text = document.createElement('p'); text.className = 'cds-rec-card__text'; text.textContent = rec.text; card.appendChild(text);
        var impactRow = document.createElement('div'); impactRow.className = 'cds-rec-card__impact-row'; impactRow.innerHTML = 'Impact: <span class="cds-impact ' + (ICLS[rec.impact] || 'cds-impact--medium') + '">' + (rec.impact || 'Medium') + '</span>'; card.appendChild(impactRow);
        if (rec.reason) { var reason = document.createElement('p'); reason.className = 'cds-rec-card__reason'; reason.textContent = 'Reason: ' + rec.reason; card.appendChild(reason); }
        recsGrid.appendChild(card);
      });
      recsSection.appendChild(recsGrid); legRight.appendChild(recsSection);
    }
    legBody.appendChild(legRight); wrap.appendChild(legBody);
    if (deploymentScores.computeFit || deploymentScores.deploymentConfidence) {
      var scoresBar = document.createElement('div'); scoresBar.className = 'cds-scores-bar';
      [{ value: (deploymentScores.computeFit || 0) + '%', label: 'Compute Fit' }, { value: deploymentScores.estimatedScalability || '—', label: 'Estimated Scalability' }, { value: (deploymentScores.deploymentConfidence || 0) + '%', label: 'Deployment Confidence' }].forEach(function(stat) {
        var cell = document.createElement('div'); cell.className = 'cds-score-cell';
        var val = document.createElement('p'); val.className = 'cds-score-cell__value'; val.textContent = stat.value;
        var lbl = document.createElement('p'); lbl.className = 'cds-score-cell__label'; lbl.textContent = stat.label;
        cell.appendChild(val); cell.appendChild(lbl); scoresBar.appendChild(cell);
      });
      wrap.appendChild(scoresBar);
    }
  }
  return wrap;
}


// ── Skills & Workforce: AI Roles & Capability Planning ────────────────────────

function buildAISkillsAssessmentLayout(section) {
  var b = section.brief || {};
  var isNewFormat = !!(b.arcpConsultantGuidance || (b.projectRoles && b.projectRoles.length));
  return isNewFormat ? buildARCPNewPDFLayout(b) : buildARCPLegacyPDFLayout(b);
}

function buildARCPNewPDFLayout(b) {
  var projectRoles          = b.projectRoles          || [];
  var responsibilityJourney = b.responsibilityJourney || [];
  var capabilityPriorities  = b.capabilityPriorities  || [];
  var workforceStats        = b.workforceStats        || {};

  var PCLS = { High: 'nd-pri--high', Medium: 'nd-pri--medium', Low: 'nd-pri--low' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = document.createElement('div'); body.className = 'nd-body nd-body--3col arcp-body-pdf';
  body.style.gridTemplateColumns = '45fr 25fr 30fr';

  // LEFT: role cards
  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('Required Project Roles'));
  projectRoles.forEach(function(role) {
    var card = document.createElement('div'); card.className = 'arcp-role-card-pdf';
    var header = document.createElement('div'); header.className = 'arcp-role-card-pdf__header';
    var name = document.createElement('p'); name.className = 'arcp-role-card-pdf__name'; name.textContent = role.name; header.appendChild(name);
    var pri = document.createElement('span'); pri.className = 'nd-pri ' + (PCLS[role.priority] || 'nd-pri--medium'); pri.textContent = (role.priority || 'Medium').toUpperCase(); header.appendChild(pri);
    card.appendChild(header);
    if (role.primaryResponsibility) {
      var rl = document.createElement('p'); rl.className = 'arcp-role-card-pdf__sub-lbl'; rl.textContent = 'Primary Responsibility'; card.appendChild(rl);
      var rv = document.createElement('p'); rv.className = 'arcp-role-card-pdf__sub-val'; rv.textContent = role.primaryResponsibility; card.appendChild(rv);
    }
    if (role.aiCapabilities && role.aiCapabilities.length) {
      var cl = document.createElement('p'); cl.className = 'arcp-role-card-pdf__sub-lbl'; cl.textContent = 'AI Capability'; card.appendChild(cl);
      var caps = document.createElement('div'); caps.className = 'arcp-role-card-pdf__caps';
      role.aiCapabilities.forEach(function(cap) {
        var pill = document.createElement('span'); pill.className = 'arcp-cap-pill-pdf'; pill.textContent = cap; caps.appendChild(pill);
      });
      card.appendChild(caps);
    }
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // CENTER: responsibility journey chain
  var centerCol = ndCol();
  centerCol.appendChild(ndLbl('AI Responsibility Journey'));
  if (responsibilityJourney.length) {
    var chain = document.createElement('div'); chain.className = 'arcp-journey-chain-pdf';
    responsibilityJourney.forEach(function(role, i) {
      var node = document.createElement('div'); node.className = 'arcp-journey-node-pdf'; node.textContent = role; chain.appendChild(node);
      if (i < responsibilityJourney.length - 1) {
        var arrow = document.createElement('div'); arrow.className = 'arcp-journey-arrow-pdf'; arrow.textContent = '↓'; chain.appendChild(arrow);
      }
    });
    centerCol.appendChild(chain);
  }
  body.appendChild(centerCol);

  // RIGHT: capability priorities
  var rightCol = ndCol();
  rightCol.appendChild(ndLbl('Capability Development Priorities'));
  capabilityPriorities.forEach(function(item) {
    var priItem = document.createElement('div'); priItem.className = 'arcp-pri-item-pdf';
    var hdr = document.createElement('div'); hdr.className = 'arcp-pri-item-pdf__header';
    var num = document.createElement('span'); num.className = 'arcp-pri-item-pdf__num'; num.textContent = 'Priority ' + item.priority; hdr.appendChild(num);
    priItem.appendChild(hdr);
    var addPdfRow = function(label, value, cls) {
      if (!value) return;
      var row = document.createElement('div'); row.className = 'arcp-pri-item-pdf__row';
      var lbl = document.createElement('span'); lbl.className = 'arcp-pri-item-pdf__field-lbl'; lbl.textContent = label;
      var val = document.createElement('span'); val.className = cls; val.textContent = value;
      row.appendChild(lbl); row.appendChild(val); priItem.appendChild(row);
    };
    addPdfRow('Role', item.role, 'arcp-pri-item-pdf__role');
    addPdfRow('Capability', item.capability, 'arcp-pri-item-pdf__cap');
    addPdfRow('Business Outcome', item.businessOutcome, 'arcp-pri-item-pdf__outcome');
    rightCol.appendChild(priItem);
  });
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Stats strip
  var statsEntries = [
    { label: 'Required Roles',      value: workforceStats.requiredRoles },
    { label: 'Critical Roles',      value: workforceStats.criticalRoles },
    { label: 'AI Capabilities',     value: workforceStats.aiCapabilities },
    { label: 'Implementation Priority', value: workforceStats.implementationPriority },
  ].filter(function(s) { return s.value !== undefined && s.value !== null && s.value !== 0 && s.value !== ''; })
   .map(function(s) { return { label: s.label, value: String(s.value) }; });
  if (statsEntries.length) { wrap.appendChild(ndStatBlock(statsEntries)); }

  if (b.arcpConsultantGuidance) {
    var cg = document.createElement('div'); cg.className = 'alan-consultant-guidance';
    var cgIcon = document.createElement('span'); cgIcon.className = 'alan-cg__icon'; cgIcon.textContent = '◆'; cg.appendChild(cgIcon);
    var cgText = document.createElement('p'); cgText.className = 'alan-cg__text'; cgText.textContent = b.arcpConsultantGuidance; cg.appendChild(cgText);
    wrap.appendChild(cg);
  }
  if (b.arcpAIRecommendation) {
    var ar = document.createElement('div'); ar.className = 'alan-ai-recommendation';
    var arIcon = document.createElement('span'); arIcon.className = 'alan-ar__icon'; arIcon.textContent = '⬡'; ar.appendChild(arIcon);
    var arText = document.createElement('p'); arText.className = 'alan-ar__text'; arText.textContent = b.arcpAIRecommendation; ar.appendChild(arText);
    wrap.appendChild(ar);
  }
  return wrap;
}

function buildARCPLegacyPDFLayout(b) {
  var requiredSkills = b.requiredSkills         || [];
  var skillsMatrix   = b.skillsMatrix           || [];
  var skillsRecs     = b.skillsRecommendations  || [];
  var skillsStats    = b.skillsStats            || {};
  var skillsCatSum   = b.skillsCategorySummary  || [];

  var PCLS  = { High: 'nd-pri--high', Medium: 'nd-pri--medium', Low: 'nd-pri--low' };
  var CATCLS = { Ready: 'asa-cat--ready', Strong: 'asa-cat--strong', Partial: 'asa-cat--partial', 'Needs Improvement': 'asa-cat--needs' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  if (b.skillsReadiness) { wrap.appendChild(ndBadge('SKILLS READINESS: ' + b.skillsReadiness + '%')); }
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = ndBody(3);

  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('Required Skills'));
  requiredSkills.forEach(function(sk) {
    var card = document.createElement('div'); card.className = 'asa-skill-card';
    var name = document.createElement('p'); name.className = 'asa-skill-card__name'; name.textContent = sk.name; card.appendChild(name);
    var meta = document.createElement('p'); meta.className = 'asa-skill-card__meta'; meta.textContent = (sk.category || '') + (sk.availability ? ' · ' + sk.availability : ''); card.appendChild(meta);
    var pri = document.createElement('span'); pri.className = 'nd-pri ' + (PCLS[sk.priority] || 'nd-pri--medium'); pri.textContent = sk.priority; card.appendChild(pri);
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  var centerCol = ndCol();
  centerCol.appendChild(ndLbl('Skills Matrix'));
  if (skillsMatrix.length) {
    var matrixWrap = document.createElement('div'); matrixWrap.className = 'asa-matrix-wrap';
    skillsMatrix.forEach(function(row) {
      var rowEl = document.createElement('div'); rowEl.className = 'asa-matrix-row';
      var cat = document.createElement('p'); cat.className = 'asa-matrix-row__cat'; cat.textContent = row.category; rowEl.appendChild(cat);
      var track = document.createElement('div'); track.className = 'asa-matrix-bar-track';
      var fill = document.createElement('div'); fill.className = 'asa-matrix-bar-fill'; fill.style.width = (row.readiness || 0) + '%'; track.appendChild(fill); rowEl.appendChild(track);
      var counts = document.createElement('p'); counts.className = 'asa-matrix-row__counts'; counts.textContent = 'Required: ' + (row.required || 0) + '  ·  Missing: ' + (row.missing || 0); rowEl.appendChild(counts);
      matrixWrap.appendChild(rowEl);
    });
    centerCol.appendChild(matrixWrap);
  }
  body.appendChild(centerCol);

  var rightCol = ndCol();
  if (skillsRecs.length) {
    rightCol.appendChild(ndLbl('AI Recommendations'));
    rightCol.appendChild(ndRecList(skillsRecs, function(r) { return { text: r.title, priority: r.priority, sub: r.expectedBenefit }; }));
  }
  var statsEntries = [{ label: 'Available', value: skillsStats.available }, { label: 'Gaps', value: skillsStats.gaps }, { label: 'Critical', value: skillsStats.critical }].filter(function(e) { return e.value !== undefined && e.value !== null; }).map(function(e) { return { label: e.label, value: String(e.value) }; });
  if (statsEntries.length) { rightCol.appendChild(ndStatBlock(statsEntries)); }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  if (skillsCatSum.some(function(c) { return c.status; })) {
    wrap.appendChild(ndLbl('Skills Category Summary'));
    var grid = document.createElement('div'); grid.className = 'asa-summary-grid';
    skillsCatSum.forEach(function(c) {
      var cell = document.createElement('div'); cell.className = 'asa-summary-cell ' + (CATCLS[c.status] || '');
      var lbl = document.createElement('p'); lbl.className = 'asa-summary-cell__lbl'; lbl.textContent = c.category; cell.appendChild(lbl);
      if (c.status) { var val = document.createElement('p'); val.className = 'asa-summary-cell__val'; val.textContent = c.status; cell.appendChild(val); }
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
  }
  return wrap;
}

// ── Skills & Workforce: AI Learning & Adoption ────────────────────────────────

function buildAILearningAdoptionLayout(section) {
  var b = section.brief || {};
  var isNewFormat = !!(b.alaConsultantGuidance || (b.roleLearningJourney && b.roleLearningJourney.length));
  return isNewFormat ? buildALANewLayoutPdf(section) : buildALALegacyLayoutPdf(section);
}

function buildALANewLayoutPdf(section) {
  var b                 = section.brief || {};
  var roleLearning      = b.roleLearningJourney || [];
  var adoptionRoadmap   = b.adoptionRoadmap     || [];
  var enablementActions = b.enablementActions   || [];
  var enablementSummary = b.enablementSummary   || {};
  var learningResources = b.learningResources   || [];

  var IMPACT_CLS = { High: 'alan-impact--high', Medium: 'alan-impact--medium', Low: 'alan-impact--low' };
  var PRI_CLS    = { High: 'alan-pri--high', Medium: 'alan-pri--medium', Low: 'alan-pri--low' };

  var wrap = document.createElement('div'); wrap.className = 'alan-view';

  var badge = document.createElement('div'); badge.className = 'alan-badge'; badge.textContent = 'AI ENABLEMENT PLAN'; wrap.appendChild(badge);
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = document.createElement('div'); body.className = 'alan-body';

  // LEFT: Role-Based Learning Journey
  var leftCol = document.createElement('div'); leftCol.className = 'alan-roles-col';
  leftCol.appendChild(ndLbl('Role-Based Learning Journey'));
  roleLearning.forEach(function(r) {
    var card = document.createElement('div'); card.className = 'alan-role-card';
    var roleName = document.createElement('p'); roleName.className = 'alan-role-card__name'; roleName.textContent = r.role; card.appendChild(roleName);
    if (r.learningPath && r.learningPath.length) {
      var pathLbl = document.createElement('p'); pathLbl.className = 'alan-role-card__path-label'; pathLbl.textContent = 'Learning Path'; card.appendChild(pathLbl);
      var pills = document.createElement('div'); pills.className = 'alan-role-card__pills';
      r.learningPath.forEach(function(topic) { var pill = document.createElement('span'); pill.className = 'alan-role-card__pill'; pill.textContent = topic; pills.appendChild(pill); });
      card.appendChild(pills);
    }
    if (r.businessOutcome) {
      var outLbl = document.createElement('p'); outLbl.className = 'alan-role-card__outcome-label'; outLbl.textContent = 'Business Outcome'; card.appendChild(outLbl);
      var outText = document.createElement('p'); outText.className = 'alan-role-card__outcome'; outText.textContent = r.businessOutcome; card.appendChild(outText);
    }
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // CENTER: AI Adoption Roadmap
  var centerCol = document.createElement('div'); centerCol.className = 'alan-roadmap-col';
  centerCol.appendChild(ndLbl('AI Adoption Roadmap'));
  adoptionRoadmap.forEach(function(st, idx) {
    var stageEl = document.createElement('div'); stageEl.className = 'alan-roadmap-stage';
    var stageName = document.createElement('p'); stageName.className = 'alan-roadmap-stage__name'; stageName.textContent = st.stage; stageEl.appendChild(stageName);
    if (st.goal) {
      var goalRow = document.createElement('div'); goalRow.className = 'alan-roadmap-stage__row';
      var goalLbl = document.createElement('span'); goalLbl.className = 'alan-roadmap-stage__field-label'; goalLbl.textContent = 'Goal';
      var goalVal = document.createElement('span'); goalVal.className = 'alan-roadmap-stage__value'; goalVal.textContent = st.goal;
      goalRow.appendChild(goalLbl); goalRow.appendChild(goalVal); stageEl.appendChild(goalRow);
    }
    if (st.expectedOutput) {
      var outRow = document.createElement('div'); outRow.className = 'alan-roadmap-stage__row';
      var outLbl = document.createElement('span'); outLbl.className = 'alan-roadmap-stage__field-label'; outLbl.textContent = 'Output';
      var outVal = document.createElement('span'); outVal.className = 'alan-roadmap-stage__value'; outVal.textContent = st.expectedOutput;
      outRow.appendChild(outLbl); outRow.appendChild(outVal); stageEl.appendChild(outRow);
    }
    centerCol.appendChild(stageEl);
    if (idx < adoptionRoadmap.length - 1) { var arr = document.createElement('div'); arr.className = 'alan-roadmap-arrow'; arr.textContent = '↓'; centerCol.appendChild(arr); }
  });
  body.appendChild(centerCol);

  // RIGHT: AI Enablement Actions
  var rightCol = document.createElement('div'); rightCol.className = 'alan-actions-col';
  rightCol.appendChild(ndLbl('AI Enablement Actions'));
  enablementActions.forEach(function(a) {
    var card = document.createElement('div'); card.className = 'alan-action-card';
    var actionTitle = document.createElement('p'); actionTitle.className = 'alan-action-card__action'; actionTitle.textContent = a.action; card.appendChild(actionTitle);
    [{ label: 'Owner', value: a.owner }, { label: 'Business Impact', value: a.businessImpact, cls: IMPACT_CLS[a.businessImpact] }, { label: 'Timeline', value: a.timeline }].forEach(function(item) {
      if (!item.value) return;
      var row = document.createElement('div'); row.className = 'alan-action-card__row';
      var lbl = document.createElement('span'); lbl.className = 'alan-action-card__field-label'; lbl.textContent = item.label + ':';
      var val = document.createElement('span'); val.className = item.cls ? 'alan-action-card__value ' + item.cls : 'alan-action-card__value'; val.textContent = item.value;
      row.appendChild(lbl); row.appendChild(val); card.appendChild(row);
    });
    rightCol.appendChild(card);
  });
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Bottom strip: Capability Development Summary
  var summaryStats = [{ label: 'Project Roles', value: enablementSummary.projectRoles }, { label: 'Learning Paths', value: enablementSummary.learningPaths }, { label: 'AI Tools', value: enablementSummary.aiTools }, { label: 'Adoption Activities', value: enablementSummary.adoptionActivities }].filter(function(e) { return e.value !== undefined && e.value !== null; });
  if (summaryStats.length) {
    wrap.appendChild(ndLbl('Capability Development Summary'));
    var strip = document.createElement('div'); strip.className = 'alan-summary-strip';
    summaryStats.forEach(function(e) {
      var cell = document.createElement('div'); cell.className = 'alan-summary-cell';
      var val = document.createElement('p'); val.className = 'alan-summary-cell__value'; val.textContent = e.value;
      var lbl = document.createElement('p'); lbl.className = 'alan-summary-cell__label'; lbl.textContent = e.label;
      cell.appendChild(val); cell.appendChild(lbl); strip.appendChild(cell);
    });
    wrap.appendChild(strip);
  }

  // Learning Resources
  if (learningResources.length) {
    wrap.appendChild(ndLbl('Recommended Learning Resources'));
    var resList = document.createElement('div'); resList.className = 'alan-resources';
    learningResources.forEach(function(r) {
      var item = document.createElement('div'); item.className = 'alan-resource-item';
      var name = document.createElement('p'); name.className = 'alan-resource-item__name'; name.textContent = r.name; item.appendChild(name);
      var meta = document.createElement('div'); meta.className = 'alan-resource-item__meta';
      if (r.audience) { var aud = document.createElement('span'); aud.className = 'alan-resource-item__audience'; aud.textContent = r.audience; meta.appendChild(aud); }
      if (r.priority) { var pri = document.createElement('span'); pri.className = 'alan-resource-item__priority ' + (PRI_CLS[r.priority] || 'alan-pri--medium'); pri.textContent = r.priority; meta.appendChild(pri); }
      item.appendChild(meta); resList.appendChild(item);
    });
    wrap.appendChild(resList);
  }

  // Consultant Guidance
  if (b.alaConsultantGuidance) {
    var cg = document.createElement('div'); cg.className = 'alan-consultant-guidance';
    cg.innerHTML = '<span class="alan-cg__icon">◆</span><p class="alan-cg__text">' + b.alaConsultantGuidance + '</p>';
    wrap.appendChild(cg);
  }

  // AI Recommendation
  if (b.alaAIRecommendation) {
    var ar = document.createElement('div'); ar.className = 'alan-ai-recommendation';
    ar.innerHTML = '<span class="alan-ar__icon">⬡</span><p class="alan-ar__text">' + b.alaAIRecommendation + '</p>';
    wrap.appendChild(ar);
  }

  return wrap;
}

function buildALALegacyLayoutPdf(section) {
  var b               = section.brief || {};
  var learningPillars = b.learningPillars          || [];
  var adoptionLifecycle = b.adoptionLifecycle       || [];
  var adoptionRecs    = b.adoptionRecommendations   || [];
  var adoptionStats   = b.adoptionStats             || {};
  var adoptionSummary = b.adoptionReadinessSummary  || [];

  var PILLAR_CLS = { Ready: 'ala-pillar--ready', 'In Progress': 'ala-pillar--progress', 'Not Started': 'ala-pillar--notstarted' };
  var SUMCLS     = { Ready: 'ala-sum--ready', 'In Progress': 'ala-sum--progress', Emerging: 'ala-sum--emerging', Developing: 'ala-sum--developing' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  if (b.adoptionReadiness) { wrap.appendChild(ndBadge('ADOPTION READINESS: ' + b.adoptionReadiness + '%')); }
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = ndBody(3);

  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('Learning Pillars'));
  learningPillars.forEach(function(pillar) {
    var card = document.createElement('div'); card.className = 'ala-pillar-card ' + (PILLAR_CLS[pillar.status] || 'ala-pillar--notstarted');
    var name = document.createElement('p'); name.className = 'ala-pillar-card__name'; name.textContent = pillar.name; card.appendChild(name);
    if (pillar.description) { var desc = document.createElement('p'); desc.className = 'ala-pillar-card__desc'; desc.textContent = pillar.description; card.appendChild(desc); }
    var status = document.createElement('span'); status.className = 'ala-pillar-card__status'; status.textContent = pillar.status || 'Not Started'; card.appendChild(status);
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  var centerCol = ndCol();
  centerCol.appendChild(ndLbl('Adoption Lifecycle'));
  if (adoptionLifecycle.length) {
    var lcWrap = document.createElement('div'); lcWrap.className = 'ala-lifecycle-wrap';
    adoptionLifecycle.forEach(function(stage, i) {
      var stageEl = document.createElement('div'); stageEl.className = 'ala-lifecycle-stage';
      var hdr = document.createElement('div'); hdr.className = 'ala-lifecycle-stage__hdr';
      var num = document.createElement('span'); num.className = 'ala-lifecycle-stage__num'; num.textContent = i + 1;
      var sname = document.createElement('span'); sname.className = 'ala-lifecycle-stage__name'; sname.textContent = stage.stage;
      hdr.appendChild(num); hdr.appendChild(sname); stageEl.appendChild(hdr);
      if (stage.currentStatus) { var st = document.createElement('p'); st.className = 'ala-lifecycle-stage__status'; st.textContent = stage.currentStatus; stageEl.appendChild(st); }
      var barTrack = document.createElement('div'); barTrack.className = 'ala-lifecycle-bar-track';
      var barFill = document.createElement('div'); barFill.className = 'ala-lifecycle-bar-fill'; barFill.style.width = (stage.readiness || 0) + '%'; barTrack.appendChild(barFill);
      var pct = document.createElement('span'); pct.className = 'ala-lifecycle-stage__pct'; pct.textContent = (stage.readiness || 0) + '%';
      stageEl.appendChild(barTrack); stageEl.appendChild(pct);
      if (stage.keyActivities && stage.keyActivities.length) {
        var ul = document.createElement('ul'); ul.className = 'ala-lifecycle-stage__acts';
        stage.keyActivities.slice(0, 2).forEach(function(act) { var li = document.createElement('li'); li.textContent = act; ul.appendChild(li); });
        stageEl.appendChild(ul);
      }
      lcWrap.appendChild(stageEl);
      if (i < adoptionLifecycle.length - 1) { var arr = document.createElement('div'); arr.className = 'ala-lifecycle-arr'; arr.textContent = '›'; lcWrap.appendChild(arr); }
    });
    centerCol.appendChild(lcWrap);
  }
  body.appendChild(centerCol);

  var rightCol = ndCol();
  if (adoptionRecs.length) {
    rightCol.appendChild(ndLbl('AI Recommendations'));
    rightCol.appendChild(ndRecList(adoptionRecs, function(r) { return { text: r.title, priority: r.priority, sub: r.expectedOutcome }; }));
  }
  var statsEntries = [{ label: 'Teams Trained', value: adoptionStats.teamsTrained }, { label: 'Tools Adopted', value: adoptionStats.toolsAdopted }, { label: 'Adoption Rate', value: adoptionStats.adoptionRate }].filter(function(e) { return e.value !== undefined && e.value !== null && e.value !== ''; }).map(function(e) { return { label: e.label, value: String(e.value) }; });
  if (statsEntries.length) { rightCol.appendChild(ndStatBlock(statsEntries)); }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  if (adoptionSummary.some(function(c) { return c.status; })) {
    wrap.appendChild(ndLbl('Adoption Readiness Summary'));
    var grid = document.createElement('div'); grid.className = 'ala-summary-grid';
    adoptionSummary.forEach(function(c) {
      var cell = document.createElement('div'); cell.className = 'ala-summary-cell ' + (SUMCLS[c.status] || '');
      var lbl = document.createElement('p'); lbl.className = 'ala-summary-cell__lbl'; lbl.textContent = c.category; cell.appendChild(lbl);
      if (c.status) { var val = document.createElement('p'); val.className = 'ala-summary-cell__val'; val.textContent = c.status; cell.appendChild(val); }
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
  }
  return wrap;
}

// ── PDF-specific render functions ─────────────────────────────────────────────

function buildSectionContent(section) {
  var t = section.title;
  if (t === 'Vision')                           return buildVisionLayout(section);
  if (t === 'Alignment')                        return buildAlignmentLayout(section);
  if (t === 'Commitment')                       return buildCommitmentLayout(section);
  if (t === 'Business-Led Roadmap')             return buildBusinessRoadmapLayout(section);
  if (t === 'Strategic Roadmap Design' || t === 'Strategic Roadmap') return buildStrategicRoadmapLayout(section);
  if (t === 'Solution-Centric Organization')    return buildSolutionCentricLayout(section);
  if (t === 'Cross-Functional Delivery Teams')  return buildCrossFunctionalLayout(section);
  if (t === 'End-to-End Ownership')             return buildEndToEndOwnershipLayout(section);
  if (t === 'Financial Performance')            return buildFinancialPerformanceLayout(section);
  if (t === 'Operational Excellence')           return buildOperationalExcellenceLayout(section);
  if (t === 'Customer Value')                   return buildCustomerValueLayout(section);
  if (t === 'Data Privacy & Security')          return buildDataPrivacyLayout(section);
  if (t === 'Ethical AI Guidelines')            return buildEthicalAILayout(section);
  if (t === 'Model Validation & Monitoring')    return buildModelValidationLayout(section);
  if (t === 'Regulatory Compliance')            return buildRegulatoryComplianceLayout(section);
  if (t === 'Trust & Adoption')                 return buildTrustAdoptionLayout(section);
  // AI Use Cases
  if (t === 'AI Opportunity Discovery')          return buildAIOpportunityDiscoveryLayout(section);
  if (t === 'Business Value Definition')         return buildBusinessValueDefinitionLayout(section);
  if (t === 'AI Implementation Prioritization')        return buildAIUseCasePrioritizationLayout(section);
  if (t === 'AI Use Case Classification')        return buildAIUseCaseClassificationLayout(section);
  // Data Readiness
  if (t === 'Critical Data Identification')      return buildCriticalDataIdentificationLayout(section);
  if (t === 'AI Data Preparation')               return buildAIDataPreparationLayout(section);
  if (t === 'Data Architecture Enablement')      return buildDataArchitectureEnablementLayout(section);
  // Technology Infrastructure
  if (t === 'System Integration & Architecture') return buildSystemIntegrationLayout(section);
  if (t === 'AI Platform Readiness')             return buildAIPlatformReadinessLayout(section);
  if (t === 'AI Compute & Deployment Strategy')  return buildAIComputeDeploymentLayout(section);
  // Skills & Workforce
  if (t === 'AI Roles & Capability Planning' || t === 'AI Skills Assessment') return buildAISkillsAssessmentLayout(section);
  if (t === 'AI Learning & Adoption')            return buildAILearningAdoptionLayout(section);
  // Default: strategic position only
  var div = document.createElement('div');
  div.className = 'vision-statement';
  var p = document.createElement('p');
  p.className = 'vision-statement__text';
  p.textContent = (section.brief || {}).strategicPosition || '';
  div.appendChild(p);
  return div;
}

function buildExecContent(bp, container, tocEntries) {
  tocEntries.push({ title: 'Executive Summary', level: 1 });
  var allCaps = [];
  (bp.domains || []).forEach(function(domain) {
    (domain.capabilities || []).forEach(function(cap) { allCaps.push(cap); });
  });
  var completed = allCaps.filter(function(c) { return c.status === 'completed'; });

  function makeSection(labelText, bodyEl, accent) {
    var sec = document.createElement('div');
    sec.className = 'exec-section' + (accent ? ' exec-section--accent' : '');
    var lbl = document.createElement('p');
    lbl.className = 'exec-label' + (accent ? ' exec-label--accent' : '');
    lbl.textContent = labelText;
    sec.appendChild(lbl);
    sec.appendChild(bodyEl);
    return sec;
  }

  if (bp.businessObjective) {
    var p = document.createElement('p');
    p.className = 'exec-objective-text'; p.textContent = bp.businessObjective;
    container.appendChild(makeSection('BUSINESS OBJECTIVE', p));
  }

  var narrative = '';
  for (var ci = 0; ci < completed.length && !narrative; ci++) {
    var secs = completed[ci].sections || [];
    for (var si = 0; si < secs.length && !narrative; si++) {
      if (secs[si].brief && secs[si].brief.strategicPosition) narrative = secs[si].brief.strategicPosition;
    }
  }
  if (narrative) {
    var np = document.createElement('p');
    np.className = 'exec-narrative'; np.textContent = narrative;
    container.appendChild(makeSection('STRATEGIC FOUNDATION', np));
  }

  if (completed.length) {
    var ul = document.createElement('ul');
    ul.className = 'exec-list';
    completed.forEach(function(cap, i) {
      var li = document.createElement('li'); li.textContent = (i + 1) + '.  ' + cap.capabilityName;
      ul.appendChild(li);
    });
    container.appendChild(makeSection('CAPABILITY DOMAINS', ul));
  }

  var outcomes = [];
  for (var ci2 = 0; ci2 < completed.length && outcomes.length < 6; ci2++) {
    var secs2 = completed[ci2].sections || [];
    for (var si2 = 0; si2 < secs2.length; si2++) {
      var metrics = (secs2[si2].brief || {}).successMetrics || [];
      if (metrics.length) { outcomes.push(metrics[0]); break; }
    }
  }
  if (outcomes.length) {
    var outUl = document.createElement('ul');
    outUl.className = 'exec-list exec-list--bullets';
    outcomes.forEach(function(o) { var li = document.createElement('li'); li.textContent = o; outUl.appendChild(li); });
    container.appendChild(makeSection('EXPECTED OUTCOMES', outUl, true));
  }
}

function renderBlueprint(bp) {
  var tocEntries = [];

  // Sort domains to match UI order
  var PDF_DOMAIN_ORDER = ['ai-use-cases','ai-strategy','data-readiness','technology-infrastructure','skills-workforce','governance-security'];
  (bp.domains || []).sort(function(a, b) {
    var ai = PDF_DOMAIN_ORDER.indexOf(a.domainId);
    var bi = PDF_DOMAIN_ORDER.indexOf(b.domainId);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // Retired capabilities — same set as the UI
  var RETIRED_CAPABILITY_IDS = { 'business-strategy-alignment': true };

  // Executive summary
  var execContainer = document.getElementById('exec-content');
  if (execContainer) buildExecContent(bp, execContainer, tocEntries);

  // Domain → capability sections
  var capRoot = document.getElementById('capabilities-root');
  if (capRoot) {
    (bp.domains || []).forEach(function(domain) {
      var completedCaps = (domain.capabilities || []).filter(function(c) { return c.status === 'completed' && !RETIRED_CAPABILITY_IDS[c.capabilityId]; });
      if (!completedCaps.length) return;

      tocEntries.push({ title: domain.domainName, level: 0 });

      completedCaps.forEach(function(cap) {
        tocEntries.push({ title: cap.capabilityName, level: 1 });

        var capPage = document.createElement('div');
        capPage.className = 'pdf-cap';

        var domainLbl = document.createElement('p');
        domainLbl.className = 'pdf-domain-label';
        domainLbl.textContent = (domain.domainName || '').toUpperCase();
        capPage.appendChild(domainLbl);

        var capTitle = document.createElement('h2');
        capTitle.className = 'pdf-cap-title'; capTitle.textContent = cap.capabilityName;
        capPage.appendChild(capTitle);

        var hr = document.createElement('hr');
        hr.className = 'pdf-cap-rule';
        capPage.appendChild(hr);

        (cap.sections || []).forEach(function(section) {
          if (!section.brief || !section.brief.strategicPosition) return;
          tocEntries.push({ title: section.title, level: 2 });

          var secWrap = document.createElement('div');
          secWrap.className = 'pdf-section';

          var secTitle = document.createElement('h3');
          secTitle.className = 'pdf-section-h3'; secTitle.textContent = section.title;
          secWrap.appendChild(secTitle);

          try {
            secWrap.appendChild(buildSectionContent(section));
          } catch (renderErr) {
            var errP = document.createElement('p');
            errP.style.cssText = 'color:rgba(255,80,80,0.65);font-size:0.7rem;margin:0.5rem 0;';
            errP.textContent = '[Layout render error: ' + (renderErr.message || renderErr) + ']';
            secWrap.appendChild(errP);
          }
          capPage.appendChild(secWrap);
        });

        capRoot.appendChild(capPage);
      });
    });
  }

  // Table of contents
  var tocContainer = document.getElementById('toc-content');
  if (tocContainer) {
    var tocList = document.createElement('div');
    tocList.className = 'toc-list';
    tocEntries.forEach(function(entry) {
      var row = document.createElement('div');
      row.className = entry.level === 0 ? 'toc-row toc-row--domain'
                    : entry.level === 1 ? 'toc-row toc-row--cap'
                    : 'toc-row toc-row--section';
      row.textContent = entry.title;
      tocList.appendChild(row);
    });
    tocContainer.appendChild(tocList);
  }
}

// ── Collect all browser-side functions for embedding ─────────────────────────

const BROWSER_FUNCTIONS = [
  buildPillarsGrid,
  buildKpiHighlights,
  buildHorizontalTimeline,
  buildSpokeWheel,
  buildInitiativeCard,
  buildAlignmentLayout,
  buildFunnelChart,
  buildPrioritizationMatrix,
  buildQuarterlyTimeline,
  buildBusinessRoadmapLayout,
  buildStrategicRoadmapLayout,
  buildGovernanceTemple,
  buildGovernanceNode,
  buildCommitmentLayout,
  buildSolutionPortfolioTree,
  buildSolutionCentricLayout,
  buildTeamHierarchySvg,
  buildCrossFunctionalLayout,
  buildLifecycleLoop,
  buildEndToEndOwnershipLayout,
  buildPillChain,
  buildSdlcPipeline,
  buildPillarBulletCards,
  buildWaterfallSvg,
  buildStrategicPositionBlock,
  buildDiagramSection,
  buildDetailSection,
  buildFinancialPerformanceLayout,
  buildOperationalExcellenceLayout,
  buildCustomerValueLayout,
  buildDataPrivacyLayout,
  buildEthicalAILayout,
  buildModelValidationLayout,
  buildRegulatoryComplianceLayout,
  buildTrustAdoptionLayout,
  buildVisionLayout,
  buildStatusTable,
  buildTagList,
  buildPdfRecommendations,
  buildSummaryGrid,
  buildAIOpportunityDiscoveryLayout,
  buildBusinessValueDefinitionLayout,
  buildAIUseCasePrioritizationLayout,
  buildAIUseCaseClassificationLayout,
  ndBadge,
  ndBody,
  ndCol,
  ndLbl,
  ndScoresBar,
  ndSummaryGrid,
  ndRecList,
  ndStatBlock,
  buildCriticalDataIdentificationLayout,
  buildAIDataPreparationLayout,
  buildDataArchitectureEnablementLayout,
  buildSystemIntegrationLayout,
  buildAIPlatformReadinessLayout,
  buildAIComputeDeploymentLayout,
  buildAISkillsAssessmentLayout,
  buildARCPNewPDFLayout,
  buildARCPLegacyPDFLayout,
  buildAILearningAdoptionLayout,
  buildALANewLayoutPdf,
  buildALALegacyLayoutPdf,
  buildSectionContent,
  buildExecContent,
  renderBlueprint,
].map(fn => fn.toString()).join('\n\n');

// ── CSS ───────────────────────────────────────────────────────────────────────

function getCSS() {
  return `
@page { size: A4; margin: 0; }

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0; padding: 0;
  background: #0d0f1a;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: rgba(255,255,255,0.88);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Cover page ── */
.pdf-cover {
  width: 210mm; height: 297mm;
  page-break-after: always;
  background: #0B1F4B;
  display: flex; flex-direction: column;
  position: relative; overflow: hidden;
}
.cover-accent-bar { height: 6px; background: #1A56DB; flex-shrink: 0; }
.cover-body {
  flex: 1; display: flex; flex-direction: column;
  justify-content: center; padding: 4rem 3.5rem 3rem;
}
.cover-company { font-size: 1.8rem; font-weight: 800; color: rgba(255,255,255,0.96); margin-bottom: 0.4rem; }
.cover-industry { font-size: 0.88rem; color: rgba(255,255,255,0.48); margin-bottom: 2.5rem; }
.cover-blueprint-title { font-size: 2.4rem; font-weight: 800; color: white; line-height: 1.2; margin-bottom: 1.8rem; }
.cover-divider { width: 60px; height: 2px; background: #1A56DB; margin-bottom: 2rem; }
.cover-meta { display: flex; flex-direction: column; gap: 0.75rem; }
.cover-meta-row { display: flex; align-items: center; gap: 1.5rem; }
.cover-meta-label { font-size: 0.78rem; color: rgba(255,255,255,0.38); width: 110px; }
.cover-meta-value { font-size: 0.88rem; font-weight: 600; color: rgba(255,255,255,0.85); }
.cover-footer { padding: 1.25rem 3.5rem; border-top: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; }
.cover-footer-text { font-size: 0.72rem; color: rgba(255,255,255,0.28); text-align: center; letter-spacing: 0.05em; }

/* ── Content pages ── */
.pdf-page {
  padding: 18mm 20mm 0;
  page-break-before: always;
  background: #0d0f1a;
}
.pdf-cap {
  padding: 18mm 20mm 0;
  page-break-before: always;
  background: #0d0f1a;
}
.pdf-section {
  margin-bottom: 2rem;
}

/* ── Headings ── */
.pdf-h1 {
  font-size: 1.6rem; font-weight: 800;
  color: rgba(255,255,255,0.95);
  margin: 0 0 1.5rem;
  padding-bottom: 0.65rem;
  border-bottom: 2px solid rgba(99,102,241,0.4);
}
.pdf-cap-title {
  font-size: 1.35rem; font-weight: 800;
  color: rgba(255,255,255,0.95);
  margin: 0 0 0.5rem;
}
.pdf-cap-rule {
  border: none; border-top: 1.5px solid rgba(99,102,241,0.35);
  margin: 0 0 1.5rem;
}
.pdf-section-h3 {
  font-size: 1rem; font-weight: 700;
  color: rgba(160,163,255,0.95);
  margin: 0 0 0.75rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgba(99,102,241,0.2);
}

/* ── TOC ── */
.toc-list { display: flex; flex-direction: column; gap: 0.3rem; }
.toc-row { font-size: 0.9rem; color: rgba(255,255,255,0.72); padding: 0.28rem 0; }
.toc-row--domain { font-weight: 800; color: rgba(92,197,167,0.9); font-size: 1.05rem; margin-top: 1rem; padding-bottom: 0.2rem; border-bottom: 1px solid rgba(92,197,167,0.2); }
.toc-row--cap { font-weight: 700; color: rgba(255,255,255,0.92); font-size: 0.95rem; margin-top: 0.4rem; padding-left: 1rem; }
.toc-row--section { padding-left: 2rem; font-size: 0.82rem; color: rgba(255,255,255,0.48); }

/* ── Domain label above capability heading ── */
.pdf-domain-label {
  font-size: 0.65rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: rgba(92,197,167,0.72); margin: 0 0 0.3rem;
}

/* ── Executive summary ── */
.exec-section { margin-bottom: 1.25rem; }
.exec-section--accent {
  background: rgba(92,197,167,0.05);
  border: 1px solid rgba(92,197,167,0.15);
  border-radius: 0.65rem;
  padding: 1rem 1.25rem;
}
.exec-label {
  font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: rgba(255,255,255,0.3); margin: 0 0 0.45rem;
}
.exec-label--accent { color: rgba(92,197,167,0.7); }
.exec-objective-text { font-size: 0.95rem; color: rgba(255,255,255,0.82); line-height: 1.7; margin: 0; }
.exec-narrative { font-size: 0.88rem; color: rgba(255,255,255,0.68); line-height: 1.75; margin: 0; }
.exec-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.exec-list li {
  font-size: 0.88rem; color: rgba(255,255,255,0.72);
  padding-left: 1rem; position: relative; line-height: 1.5;
}
.exec-list li::before { content: '→'; position: absolute; left: 0; color: rgba(99,102,241,0.7); }
.exec-list--bullets li::before { content: '•'; color: rgba(92,197,167,0.8); }

/* ── Appendix ── */
.appendix-meta { display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 1.5rem; }
.appendix-meta-row { display: flex; align-items: baseline; gap: 1rem; }
.appendix-meta-key { font-size: 0.78rem; font-weight: 700; color: rgba(255,255,255,0.38); width: 120px; flex-shrink: 0; }
.appendix-meta-val { font-size: 0.88rem; color: rgba(255,255,255,0.75); }
.appendix-cap-table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
.appendix-cap-table th {
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: rgba(255,255,255,0.38); padding: 0.6rem 0.75rem; text-align: left;
  background: rgba(255,255,255,0.04);
}
.appendix-cap-table td {
  font-size: 0.85rem; color: rgba(255,255,255,0.72);
  padding: 0.55rem 0.75rem; border-top: 1px solid rgba(255,255,255,0.05);
}
.appendix-cap-table tr:nth-child(even) td { background: rgba(255,255,255,0.025); }
.status-complete { color: rgba(92,197,167,0.9); font-weight: 600; }
.status-other { color: rgba(255,255,255,0.38); }

/* ── Vision layout ── */
.vision-layout { display: flex; flex-direction: column; gap: 1rem; }

/* ── Shared card / statement wrappers ── */
.vision-statement {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 0.65rem;
  padding: 1.1rem 1.25rem;
}
.vision-statement__text {
  font-size: 1.05rem; font-weight: 500;
  color: rgba(255,255,255,0.88); line-height: 1.75; margin: 0;
}

/* ── KPI Highlights ── */
.kpi-highlights-wrap { display: flex; flex-direction: column; gap: 0.5rem; }
.kpi-highlights {
  display: grid; grid-template-columns: repeat(3,1fr);
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 0.65rem; overflow: hidden;
}
.kpi-item {
  text-align: center; padding: 1.4rem 1rem 1.2rem;
  border-right: 1px solid rgba(255,255,255,0.06);
}
.kpi-item:last-child { border-right: none; }
.kpi-item__value { font-size: 2.4rem; font-weight: 800; color: rgba(255,255,255,0.95); line-height:1; margin:0 0 0.4rem; letter-spacing:-0.02em; }
.kpi-item__label { font-size: 0.82rem; font-weight: 700; color: rgba(255,255,255,0.78); margin: 0 0 0.25rem; }
.kpi-item__description { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin: 0; line-height: 1.5; }

/* ── Horizontal Timeline ── */
.h-timeline { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.65rem; padding: 1.1rem 1.4rem 1.3rem; }
.h-timeline__track { display: flex; align-items: flex-start; margin-top: 0.75rem; }
.h-timeline__step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
.h-timeline__step-num {
  width: 1.75rem; height: 1.75rem; border-radius: 50%;
  background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.4);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.68rem; font-weight: 700; color: rgba(160,163,255,0.9);
}
.h-timeline__step-label { font-size: 0.8rem; color: rgba(255,255,255,0.65); text-align: center; line-height: 1.45; max-width: 8rem; }

/* ── Pillars Grid ── */
.pillars-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.85rem; margin-bottom: 1rem; }
.pillar-card { background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.18); border-radius: 0.65rem; padding: 1rem 1.1rem 0.9rem; display: flex; flex-direction: column; gap: 0.35rem; }
.pillar-card__title { font-size: 0.9rem; font-weight: 700; color: rgba(255,255,255,0.9); margin: 0; line-height: 1.35; }
.pillar-card__description { font-size: 0.82rem; color: rgba(255,255,255,0.58); margin: 0; line-height: 1.6; flex: 1; }
.pillar-card__tag { display: inline-block; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; padding: 0.18rem 0.5rem; background: rgba(99,102,241,0.18); color: rgba(160,163,255,0.9); border-radius: 4px; margin-top: 0.2rem; align-self: flex-start; }

/* ── Brief label ── */
.brief-label { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin: 0 0 0.55rem; }

/* ── Alignment layout ── */
.alignment-layout { display: flex; flex-direction: column; gap: 1rem; }
.alignment-body { display: grid; grid-template-columns: 1fr 2fr; gap: 1.25rem; align-items: start; }
.alignment-left { display: flex; flex-direction: column; gap: 1rem; }
.spoke-wheel { display: block; width: 100%; height: auto; }
.alignment-initiatives { display: flex; flex-direction: column; gap: 0.85rem; }
.initiative-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.85rem; }
.initiative-card, .initiative-card--wide { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.65rem; padding: 1rem 1.15rem; }
.initiative-card__title { font-size: 0.9rem; font-weight: 700; color: rgba(255,255,255,0.9); margin: 0 0 0.5rem; line-height: 1.35; }
.initiative-card__description { font-size: 0.8rem; color: rgba(255,255,255,0.55); line-height: 1.65; margin: 0; }

/* ── Business-Led Roadmap / Strategic Roadmap ── */
.business-roadmap-layout, .strategic-roadmap-layout { display: flex; flex-direction: column; gap: 1.25rem; }
.roadmap-funnel-section { display: flex; flex-direction: column; gap: 0.5rem; }
.funnel-chart-wrap { display: flex; justify-content: center; padding: 0.5rem 0; }
.funnel-chart { width: 100%; max-width: 420px; height: auto; display: block; }
.roadmap-matrix-section { display: flex; flex-direction: column; gap: 0.5rem; }
.roadmap-quarterly-section { display: flex; flex-direction: column; gap: 0.5rem; }
.priority-matrix { display: flex; gap: 0.5rem; align-items: stretch; }
.matrix-y-axis { display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 0.25rem 0; gap: 0.35rem; }
.matrix-axis-label { font-size: 0.72rem; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg); }
.matrix-axis-tick { font-size: 0.7rem; color: rgba(255,255,255,0.38); }
.matrix-content { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; }
.matrix-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.matrix-quadrant { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); border-radius: 0.55rem; padding: 0.9rem 1rem; min-height: 80px; }
.matrix-quadrant__title { font-size: 0.88rem; font-weight: 600; color: rgba(255,255,255,0.88); margin: 0 0 0.35rem 0; }
.matrix-quadrant__items { font-size: 0.77rem; color: rgba(255,255,255,0.52); margin: 0; line-height: 1.55; }
.matrix-x-axis { display: flex; justify-content: space-between; align-items: center; padding: 0 0.25rem; }
.quarterly-timeline { display: grid; grid-template-columns: repeat(4,1fr); gap: 0; position: relative; }
.quarterly-timeline__step { display: flex; flex-direction: column; align-items: center; gap: 0.45rem; }
.quarterly-timeline__num { width: 28px; height: 28px; border-radius: 50%; background: rgba(99,102,241,0.85); color: rgba(255,255,255,0.95); font-size: 0.82rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.quarterly-timeline__quarter { font-size: 0.82rem; font-weight: 600; color: rgba(255,255,255,0.75); }
.quarterly-timeline__initiatives { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; text-align: center; }
.quarterly-timeline__initiative { font-size: 0.74rem; color: rgba(255,255,255,0.52); margin: 0; line-height: 1.4; }

/* ── Commitment ── */
.commitment-layout { display: flex; flex-direction: column; gap: 1rem; }
.commitment-pillars-section { display: flex; flex-direction: column; gap: 0.5rem; }
.commitment-pillars { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.85rem; }
.commitment-pillar-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); border-radius: 0.65rem; padding: 1.1rem 1.2rem; }
.commitment-pillar-card__title { font-size: 0.9rem; font-weight: 600; color: rgba(255,255,255,0.9); margin: 0 0 0.65rem 0; }
.commitment-pillar-card__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.commitment-pillar-card__list li { font-size: 0.8rem; color: rgba(255,255,255,0.62); padding-left: 1rem; position: relative; line-height: 1.5; }
.commitment-pillar-card__list li::before { content: '•'; position: absolute; left: 0; color: rgba(99,102,241,0.7); }
.commitment-governance-section { display: flex; flex-direction: column; gap: 0.75rem; }
.commitment-governance-temple { display: grid; grid-template-columns: 1fr auto 1fr; gap: 2rem; align-items: center; }
.commitment-governance-nodes { display: flex; flex-direction: column; justify-content: space-around; gap: 2rem; align-self: stretch; }
.commitment-governance-node { padding-top: 0.65rem; border-top: 2px solid rgba(99,102,241,0.55); }
.commitment-governance-node__title { font-size: 0.9rem; font-weight: 600; color: rgba(255,255,255,0.9); margin: 0 0 0.3rem 0; }
.commitment-governance-node__desc { font-size: 0.8rem; color: rgba(255,255,255,0.55); margin: 0; line-height: 1.5; }
.commitment-governance-center { display: flex; align-items: center; justify-content: center; }
.governance-temple { width: 190px; height: auto; display: block; }

/* ── Solution-Centric Org ── */
.solution-centric-layout { display: flex; flex-direction: column; gap: 1rem; }
.solution-portfolio-section { display: flex; flex-direction: column; gap: 0.5rem; }
.solution-portfolio-tree-wrap { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.65rem; padding: 1.25rem 1rem; display: flex; justify-content: center; }
.solution-portfolio-tree { width: 100%; max-width: 460px; height: auto; display: block; }
.solution-portfolio-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.85rem; }
.solution-portfolio-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); border-radius: 0.65rem; padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.6rem; }
.solution-portfolio-card__name { font-size: 0.92rem; font-weight: 700; color: rgba(255,255,255,0.92); margin: 0; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(99,102,241,0.2); }
.solution-portfolio-card__row { display: flex; flex-direction: column; gap: 0.15rem; }
.solution-portfolio-card__row-label { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(129,140,248,0.8); }
.solution-portfolio-card__row-value { font-size: 0.82rem; color: rgba(255,255,255,0.68); line-height: 1.5; }
.solution-portfolio-card__kpis { display: flex; flex-direction: column; gap: 0.15rem; margin-top: auto; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.06); }
.solution-portfolio-card__kpis-list { font-size: 0.78rem; color: rgba(255,255,255,0.55); margin: 0; line-height: 1.5; }

/* ── Cross-Functional Teams ── */
.cross-functional-layout { display: flex; flex-direction: column; gap: 1rem; }
.team-composition-section { display: flex; flex-direction: column; gap: 0.75rem; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.65rem; padding: 1.25rem 1.5rem; }
.team-hierarchy-wrap { display: flex; align-items: center; justify-content: center; }
.team-hierarchy-svg { width: 100%; max-width: 320px; height: auto; display: block; }
.team-structure-section { display: flex; flex-direction: column; gap: 0.65rem; }
.team-role-list { display: flex; flex-direction: column; gap: 0.5rem; }
.team-role-item { display: flex; align-items: flex-start; gap: 0.85rem; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.55rem; }
.team-role-item::before { content: ''; flex-shrink: 0; width: 3px; min-height: 32px; background: rgba(99,102,241,0.5); border-radius: 2px; align-self: stretch; }
.team-role-item__title { font-size: 0.88rem; font-weight: 600; color: rgba(255,255,255,0.88); margin: 0 0 0.2rem 0; }
.team-role-item__desc { font-size: 0.78rem; color: rgba(255,255,255,0.52); margin: 0; line-height: 1.5; }

/* ── End-to-End Ownership ── */
.end-to-end-layout { display: flex; flex-direction: column; gap: 1rem; }
.lifecycle-section { display: flex; flex-direction: column; gap: 0.75rem; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.65rem; padding: 1.25rem 1.5rem; }
.lifecycle-details-section { display: flex; flex-direction: column; gap: 0.65rem; }
.lifecycle-loop { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.5rem; }
.lifecycle-loop__node { background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.4); border-radius: 2rem; padding: 0.4rem 1rem; font-size: 0.82rem; font-weight: 600; color: rgba(255,255,255,0.88); white-space: nowrap; }
.lifecycle-loop__arrow { width: 20px; height: 2px; background: rgba(99,102,241,0.45); position: relative; flex-shrink: 0; }
.lifecycle-loop__arrow::after { content: ''; position: absolute; right: -1px; top: 50%; transform: translateY(-50%); border-left: 6px solid rgba(99,102,241,0.55); border-top: 4px solid transparent; border-bottom: 4px solid transparent; }
.lifecycle-details { display: grid; grid-template-columns: repeat(3,1fr); gap: 0.7rem; }
.lifecycle-detail-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.55rem; padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
.lifecycle-detail-card__stage { font-size: 0.85rem; font-weight: 700; color: rgba(160,163,255,0.9); margin: 0; }
.lifecycle-detail-card__resp { font-size: 0.76rem; font-weight: 600; color: rgba(255,255,255,0.6); margin: 0; }
.lifecycle-detail-card__activities { font-size: 0.76rem; color: rgba(255,255,255,0.45); margin: 0; line-height: 1.5; }

/* ── Shared CTO template components (ROI + Governance) ── */
.cto-diagram-section { display: flex; flex-direction: column; gap: 0.6rem; }
.cto-diagram-panel { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.65rem; padding: 1.25rem 1rem; display: flex; justify-content: center; align-items: center; overflow-x: auto; }
.cto-spoke-panel { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.65rem; padding: 1.25rem; display: flex; justify-content: center; align-items: center; }
.cto-spoke-panel .spoke-wheel { max-width: 280px; }
.cto-detail-section { display: flex; flex-direction: column; gap: 0.6rem; }
.detail-bullet-list { display: flex; flex-direction: column; gap: 0.45rem; }
.detail-bullet-card { padding: 0.75rem 1rem 0.75rem 1.2rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-left: 3px solid rgba(99,102,241,0.5); border-radius: 0 0.55rem 0.55rem 0; display: flex; flex-direction: column; gap: 0.3rem; }
.detail-bullet-card__title { font-size: 0.85rem; font-weight: 600; color: rgba(160,163,255,0.92); margin: 0; }
.detail-bullet-card__desc { font-size: 0.78rem; color: rgba(255,255,255,0.52); margin: 0; line-height: 1.55; }
.detail-bullet-card__list { list-style: disc; margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.18rem; }
.detail-bullet-card__list li { font-size: 0.77rem; color: rgba(255,255,255,0.54); line-height: 1.5; }
.sdlc-pipeline { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.35rem; }
.sdlc-pipeline__stage { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.35); border-radius: 0.55rem; padding: 0.75rem 1.1rem; min-width: 88px; }
.sdlc-pipeline__stage-name { font-size: 0.88rem; font-weight: 700; color: rgba(255,255,255,0.9); text-align: center; }
.sdlc-pipeline__stage-tool { font-size: 0.7rem; color: rgba(129,140,248,0.82); text-align: center; line-height: 1.35; }
.sdlc-pipeline__arrow { font-size: 1.1rem; color: rgba(99,102,241,0.5); flex-shrink: 0; line-height: 1; }
.waterfall-svg { width: 100%; max-width: 480px; height: auto; display: block; }
.financial-performance-layout,
.operational-excellence-layout,
.customer-value-layout,
.data-privacy-layout,
.ethical-ai-layout,
.model-validation-layout,
.regulatory-compliance-layout,
.trust-adoption-layout { display: flex; flex-direction: column; gap: 1rem; }

/* ── New-domain shared components ── */
.new-domain-layout { display: flex; flex-direction: column; gap: 1rem; }

.pdf-status-table { display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,0.08); border-radius: 0.55rem; overflow: hidden; }
.pdf-status-table__header { display: flex; background: rgba(99,102,241,0.1); padding: 0.5rem 0.85rem; }
.pdf-status-table__hcell { flex: 1; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: rgba(160,163,255,0.82); }
.pdf-status-table__row { display: flex; padding: 0.55rem 0.85rem; border-top: 1px solid rgba(255,255,255,0.05); }
.pdf-status-table__row:nth-child(even) { background: rgba(255,255,255,0.015); }
.pdf-status-table__cell { flex: 1; font-size: 0.79rem; color: rgba(255,255,255,0.72); line-height: 1.45; }

.pdf-tag-list-wrap { display: flex; flex-direction: column; gap: 0.5rem; }
.pdf-tag-list { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.pdf-tag { display: inline-block; font-size: 0.74rem; font-weight: 500; padding: 0.25rem 0.7rem; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.28); border-radius: 1rem; color: rgba(255,255,255,0.78); white-space: nowrap; }

.pdf-recommendations { display: flex; flex-direction: column; gap: 0.5rem; }
.pdf-rec-list { display: flex; flex-direction: column; gap: 0.4rem; }
.pdf-rec-item { padding: 0.6rem 1rem 0.6rem 1.1rem; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-left: 2px solid rgba(99,102,241,0.45); border-radius: 0 0.45rem 0.45rem 0; display: flex; flex-direction: column; gap: 0.15rem; }
.pdf-rec-item__text { font-size: 0.82rem; font-weight: 500; color: rgba(255,255,255,0.84); margin: 0; line-height: 1.5; }
.pdf-rec-item__sub { font-size: 0.75rem; color: rgba(255,255,255,0.45); margin: 0; line-height: 1.4; }

.pdf-summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.6rem; }
.pdf-summary-cell { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.5rem; padding: 0.6rem 0.85rem; display: flex; flex-direction: column; gap: 0.2rem; }
.pdf-summary-cell__key { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255,255,255,0.36); }
.pdf-summary-cell__val { font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.9); line-height: 1.2; }

/* ── Shared new-domain components (nd-*) ─────────────────────────────── */
.nd-badge { display: inline-block; font-size: 0.58rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 1rem; padding: 0.2rem 0.65rem; color: rgba(255,255,255,0.55); margin-bottom: 0.5rem; }
.nd-body { display: flex; gap: 0.85rem; align-items: flex-start; }
.nd-body--2col > .nd-col { flex: 1; min-width: 0; }
.nd-body--3col > .nd-col { flex: 1; min-width: 0; }
.nd-col { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; }
.nd-scores-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.3rem; }
.nd-score-cell { flex: 1; min-width: 60px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.5rem 0.7rem; display: flex; flex-direction: column; gap: 0.12rem; }
.nd-score-cell__val { font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.9); margin: 0; }
.nd-score-cell__lbl { font-size: 0.6rem; color: rgba(255,255,255,0.38); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
.nd-rec-list { display: flex; flex-direction: column; gap: 0.38rem; }
.nd-rec-item { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-left: 2px solid rgba(99,102,241,0.45); border-radius: 0 0.4rem 0.4rem 0; padding: 0.45rem 0.7rem; display: flex; flex-direction: column; gap: 0.12rem; }
.nd-rec-item__text { font-size: 0.77rem; font-weight: 500; color: rgba(255,255,255,0.84); margin: 0; line-height: 1.45; }
.nd-rec-item__meta { font-size: 0.68rem; color: rgba(255,255,255,0.42); margin: 0; }
.nd-rec-item__sub { font-size: 0.67rem; color: rgba(255,255,255,0.38); margin: 0; font-style: italic; line-height: 1.4; }
.nd-pri { font-weight: 700; }
.nd-pri--high { color: #f87171; }
.nd-pri--medium { color: #fbbf24; }
.nd-pri--low { color: #34d399; }
.nd-stat-block { display: flex; flex-direction: column; gap: 0.25rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.4rem; padding: 0.5rem 0.7rem; margin-top: 0.35rem; }
.nd-stat-row { display: flex; justify-content: space-between; align-items: center; }
.nd-stat-row__lbl { font-size: 0.67rem; color: rgba(255,255,255,0.4); }
.nd-stat-row__val { font-size: 0.77rem; font-weight: 700; color: rgba(255,255,255,0.82); }
.nd-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.45rem; margin-top: 0.4rem; }
.nd-summary-cell { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.5rem 0.7rem; display: flex; flex-direction: column; gap: 0.18rem; }
.nd-summary-cell__lbl { font-size: 0.6rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.35); margin: 0; }
.nd-summary-cell__val { font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.82); margin: 0; line-height: 1.4; }

/* ── CDI: Critical Data Identification ───────────────────────── */
.cdi-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.5rem; padding: 0.55rem 0.75rem; display: flex; flex-direction: column; gap: 0.22rem; }
.cdi-card__top { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.cdi-badge { display: inline-block; font-size: 0.59rem; font-weight: 700; padding: 0.13rem 0.48rem; border-radius: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; }
.cdi-avail { display: inline-block; font-size: 0.59rem; font-weight: 600; padding: 0.13rem 0.48rem; border-radius: 0.7rem; }
.cdi-avail--available { background: rgba(52,211,153,0.1); color: #34d399; }
.cdi-avail--missing { background: rgba(248,113,113,0.1); color: #f87171; }
.cdi-avail--partial { background: rgba(251,191,36,0.1); color: #fbbf24; }
.cdi-card__name { font-size: 0.79rem; font-weight: 600; color: rgba(255,255,255,0.88); margin: 0; }
.cdi-card__purpose { font-size: 0.69rem; color: rgba(255,255,255,0.52); margin: 0; line-height: 1.4; }
.cdi-card__cat { display: inline-block; font-size: 0.59rem; color: rgba(129,140,248,0.8); background: rgba(129,140,248,0.08); border: 1px solid rgba(129,140,248,0.2); border-radius: 0.5rem; padding: 0.08rem 0.4rem; }
.cdi-relmap { display: flex; align-items: flex-start; gap: 0.2rem; flex-wrap: nowrap; overflow: hidden; }
.cdi-relnode { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.4rem; padding: 0.38rem 0.5rem; flex: 1; min-width: 0; }
.cdi-relnode__hdr { font-size: 0.62rem; font-weight: 700; color: rgba(255,255,255,0.52); margin-bottom: 0.2rem; white-space: nowrap; }
.cdi-relnode__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.12rem; }
.cdi-relnode__list li { font-size: 0.64rem; color: rgba(255,255,255,0.58); line-height: 1.35; }
.cdi-relmap__arr { font-size: 0.8rem; color: rgba(255,255,255,0.18); align-self: center; flex-shrink: 0; }
.cdi-rec-row { display: flex; align-items: flex-start; gap: 0.45rem; padding: 0.38rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.cdi-rec-row__num { font-size: 0.7rem; font-weight: 700; color: rgba(99,102,241,0.7); flex-shrink: 0; min-width: 14px; }
.cdi-rec-row__text { font-size: 0.71rem; color: rgba(255,255,255,0.72); flex: 1; margin: 0; line-height: 1.4; }

/* ── ADP: AI Data Preparation ────────────────────────────────── */
.adp-ds-card { display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
.adp-ds-card__icon { font-size: 0.9rem; flex-shrink: 0; }
.adp-ds-card__name { font-size: 0.76rem; font-weight: 600; color: rgba(255,255,255,0.85); flex: 1; margin: 0; }
.adp-ds-status { font-size: 0.6rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 0.7rem; white-space: nowrap; }
.adp-status--available { background: rgba(52,211,153,0.1); color: #34d399; }
.adp-status--missing   { background: rgba(248,113,113,0.1); color: #f87171; }
.adp-status--progress  { background: rgba(251,191,36,0.1); color: #fbbf24; }
.adp-pipeline-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
.adp-pipeline-cell { display: flex; justify-content: center; }
.adp-circle { border-radius: 50%; width: 68px; height: 68px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.12rem; border: 1.5px solid; }
.adp-circle--completed  { background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.45); }
.adp-circle--attention  { background: rgba(248,113,113,0.1); border-color: rgba(248,113,113,0.45); }
.adp-circle--progress   { background: rgba(251,191,36,0.1); border-color: rgba(251,191,36,0.45); }
.adp-circle--pending    { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.12); }
.adp-circle__name   { font-size: 0.62rem; font-weight: 700; color: rgba(255,255,255,0.82); margin: 0; text-align: center; line-height: 1.2; }
.adp-circle__status { font-size: 0.56rem; color: rgba(255,255,255,0.42); margin: 0; text-align: center; }
.adp-rec-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.5rem 0.7rem; display: flex; flex-direction: column; gap: 0.18rem; }
.adp-rec-card__text   { font-size: 0.75rem; font-weight: 500; color: rgba(255,255,255,0.82); margin: 0; line-height: 1.4; }
.adp-rec-card__meta   { font-size: 0.67rem; color: rgba(255,255,255,0.42); margin: 0; }
.adp-rec-card__impact { font-size: 0.67rem; color: rgba(255,255,255,0.38); margin: 0; font-style: italic; }

/* ── DAE: Data Architecture Enablement ───────────────────────── */
.dae-sys-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.5rem 0.7rem; display: flex; flex-direction: column; gap: 0.18rem; border-left: 2px solid transparent; }
.dae-conn--connected    { border-left-color: #34d399; }
.dae-conn--partial      { border-left-color: #fbbf24; }
.dae-conn--disconnected { border-left-color: #f87171; }
.dae-sys-card__name { font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.88); margin: 0; }
.dae-sys-card__conn { font-size: 0.68rem; color: rgba(255,255,255,0.45); margin: 0; }
.dae-net-diagram { display: flex; flex-direction: column; align-items: center; gap: 0; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.5rem; padding: 0.6rem; }
.dae-net-row { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: center; }
.dae-net-node { font-size: 0.65rem; font-weight: 600; padding: 0.28rem 0.55rem; border-radius: 0.35rem; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.7); }
.dae-net-node.dae-conn--connected    { border-color: rgba(52,211,153,0.4); color: #34d399; }
.dae-net-node.dae-conn--partial      { border-color: rgba(251,191,36,0.4); color: #fbbf24; }
.dae-net-node.dae-conn--disconnected { border-color: rgba(248,113,113,0.35); color: #f87171; }
.dae-net-arrows { display: flex; gap: 0.4rem; width: 100%; justify-content: center; padding: 0.1rem 0; }
.dae-net-arrow { flex: 1; text-align: center; font-size: 0.7rem; color: rgba(255,255,255,0.18); }
.dae-net-hub { display: flex; align-items: center; gap: 0.4rem; background: rgba(99,102,241,0.1); border: 1.5px solid rgba(99,102,241,0.35); border-radius: 1rem; padding: 0.3rem 0.9rem; font-size: 0.72rem; font-weight: 700; color: rgba(160,163,255,0.85); }
.dae-net-legend { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-top: 0.35rem; }
.dae-net-legend__dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; display: inline-block; }
.dae-net-legend__lbl { font-size: 0.6rem; color: rgba(255,255,255,0.38); }
.dae-net-legend__dot.dae-conn--connected    { background: #34d399; }
.dae-net-legend__dot.dae-conn--partial      { background: #fbbf24; }
.dae-net-legend__dot.dae-conn--disconnected { background: #f87171; }
.dae-rec-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.45rem 0.65rem; display: flex; flex-direction: column; gap: 0.15rem; }
.dae-rec-card__title { font-size: 0.76rem; font-weight: 600; color: rgba(255,255,255,0.85); margin: 0; }
.dae-rec-card__meta { font-size: 0.67rem; color: rgba(255,255,255,0.42); margin: 0; }
.dae-timeline { display: flex; flex-direction: column; gap: 0.3rem; }
.dae-timeline-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.dae-timeline-row__icon { width: 1.3rem; height: 1.3rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; flex-shrink: 0; }
.dae-health--healthy    { background: rgba(52,211,153,0.15); color: #34d399; }
.dae-health--attention  { background: rgba(251,191,36,0.15); color: #fbbf24; }
.dae-health--pending    { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.45); }
.dae-health--critical   { background: rgba(248,113,113,0.15); color: #f87171; }
.dae-timeline-row__text { flex: 1; }
.dae-timeline-row__stage  { font-size: 0.74rem; font-weight: 600; color: rgba(255,255,255,0.82); margin: 0; }
.dae-timeline-row__status { font-size: 0.65rem; color: rgba(255,255,255,0.42); margin: 0; }
.dae-health-pill { font-size: 0.6rem; font-weight: 600; padding: 0.12rem 0.45rem; border-radius: 0.6rem; }
.dae-health-pill.dae-health--healthy    { background: rgba(52,211,153,0.12); color: #34d399; }
.dae-health-pill.dae-health--attention  { background: rgba(251,191,36,0.12); color: #fbbf24; }
.dae-health-pill.dae-health--pending    { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.45); }
.dae-health-pill.dae-health--critical   { background: rgba(248,113,113,0.12); color: #f87171; }

/* ── SIA: System Integration & Architecture ──────────────────── */
.sia-sys-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; }
.sia-sys-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.5rem 0.65rem; display: flex; flex-direction: column; gap: 0.18rem; border-left: 2px solid transparent; }
.sia-card--connected { border-left-color: #34d399; }
.sia-card--partial   { border-left-color: #fbbf24; }
.sia-card--missing   { border-left-color: #f87171; }
.sia-sys-card__name   { font-size: 0.76rem; font-weight: 600; color: rgba(255,255,255,0.88); margin: 0; }
.sia-sys-card__method { font-size: 0.65rem; color: rgba(255,255,255,0.45); margin: 0; }
.sia-status { font-size: 0.59rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 0.5rem; }
.sia-health { font-size: 0.59rem; color: rgba(255,255,255,0.35); }
.sia-arch-panel { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.5rem; padding: 0.6rem; display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
.sia-spoke-row { display: flex; gap: 0.35rem; flex-wrap: wrap; justify-content: center; }
.sia-spoke-node { display: flex; align-items: center; gap: 0.3rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 0.35rem; padding: 0.28rem 0.55rem; font-size: 0.63rem; color: rgba(255,255,255,0.65); }
.sia-spoke-node--connected { border-color: rgba(52,211,153,0.35); color: rgba(52,211,153,0.85); }
.sia-spoke-node--partial   { border-color: rgba(251,191,36,0.35); color: rgba(251,191,36,0.85); }
.sia-spoke-node--missing   { border-color: rgba(248,113,113,0.3); color: rgba(248,113,113,0.8); }
.sia-spoke-node__icon { font-size: 0.7rem; }
.sia-spoke-node__name { font-size: 0.62rem; font-weight: 600; }
.sia-connectors { display: flex; gap: 0.35rem; width: 100%; justify-content: center; }
.sia-connector-line { flex: 1; height: 0.8rem; border-right: 1px dashed rgba(255,255,255,0.15); display: flex; align-items: flex-end; justify-content: center; font-size: 0.65rem; color: rgba(255,255,255,0.18); }
.sia-connector-line::after { content: '↓'; }
.sia-hub { background: rgba(99,102,241,0.1); border: 1.5px solid rgba(99,102,241,0.35); border-radius: 1rem; padding: 0.3rem 0.9rem; font-size: 0.72rem; font-weight: 700; color: rgba(160,163,255,0.85); }

/* ── APR: AI Platform Readiness ──────────────────────────────── */
.apr-cap-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.5rem 0.65rem; display: flex; flex-direction: column; gap: 0.15rem; border-left: 2px solid transparent; }
.apr-cap-card--ready   { border-left-color: #34d399; }
.apr-cap-card--partial { border-left-color: #fbbf24; }
.apr-cap-card--missing { border-left-color: #f87171; }
.apr-cap-card__name  { font-size: 0.76rem; font-weight: 600; color: rgba(255,255,255,0.88); margin: 0; }
.apr-cap-card__score { font-size: 0.7rem; color: rgba(255,255,255,0.5); margin: 0; }
.apr-status { font-size: 0.59rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 0.5rem; display: inline-block; }
.apr-status--ready   { background: rgba(52,211,153,0.1); }
.apr-status--partial { background: rgba(251,191,36,0.1); }
.apr-status--missing { background: rgba(248,113,113,0.1); }
.apr-stack-list { display: flex; flex-direction: column; gap: 0.35rem; }
.apr-stack-row { display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.4rem; padding: 0.4rem 0.6rem; border-left: 2px solid transparent; }
.apr-stack-row--ready   { border-left-color: #34d399; }
.apr-stack-row--partial { border-left-color: #fbbf24; }
.apr-stack-row--missing { border-left-color: #f87171; }
.apr-stack-row__icon  { font-size: 0.85rem; flex-shrink: 0; color: rgba(255,255,255,0.5); }
.apr-stack-row__info  { flex: 1; display: flex; flex-direction: column; gap: 0.08rem; }
.apr-stack-row__name  { font-size: 0.71rem; font-weight: 600; color: rgba(255,255,255,0.82); margin: 0; }
.apr-stack-row__score { font-size: 0.63rem; color: rgba(255,255,255,0.4); margin: 0; }

/* ── CDS: AI Compute & Deployment Strategy ───────────────────── */
.cds-wl-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.5rem 0.65rem; display: flex; flex-direction: column; gap: 0.18rem; }
.cds-wl-card__name  { font-size: 0.78rem; font-weight: 700; color: rgba(255,255,255,0.88); margin: 0; }
.cds-wl-card__spec  { font-size: 0.68rem; color: rgba(255,255,255,0.55); margin: 0; line-height: 1.35; }
.cds-wl-card__spec-label { color: rgba(255,255,255,0.38); }
.cds-canvas { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.5rem; padding: 0.65rem; }
.cds-canvas__hub { background: rgba(99,102,241,0.12); border: 1.5px solid rgba(99,102,241,0.4); border-radius: 0.6rem; padding: 0.4rem 0.8rem; text-align: center; min-width: 80px; }
.cds-canvas__hub-label { font-size: 0.7rem; font-weight: 700; color: rgba(160,163,255,0.9); margin: 0; }
.cds-canvas__hub-sub { font-size: 0.62rem; color: rgba(160,163,255,0.6); margin: 0; }
.cds-canvas__hub-conf { font-size: 0.58rem; color: rgba(197,155,52,0.75); margin: 0; margin-top: 0.15rem; }
.cds-canvas__nodes { display: flex; gap: 0.35rem; flex-wrap: wrap; justify-content: center; }
.cds-canvas__node { background: rgba(255,255,255,0.03); border: 1px solid rgba(99,102,241,0.25); border-radius: 0.4rem; padding: 0.28rem 0.55rem; text-align: center; }
.cds-canvas__node-label { font-size: 0.65rem; font-weight: 600; color: rgba(255,255,255,0.78); margin: 0; }
.cds-canvas__node-sub { font-size: 0.58rem; color: rgba(255,255,255,0.36); margin: 0; }
.cds-rec-grid { display: flex; flex-direction: column; gap: 0.35rem; }
.cds-rec-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.4rem; padding: 0.45rem 0.65rem; display: flex; flex-direction: column; gap: 0.15rem; }
.cds-rec-card__text { font-size: 0.74rem; font-weight: 500; color: rgba(255,255,255,0.82); margin: 0; line-height: 1.4; }
.cds-rec-card__impact-row { font-size: 0.67rem; color: rgba(255,255,255,0.42); }
.cds-rec-card__reason { font-size: 0.65rem; color: rgba(255,255,255,0.36); margin: 0; font-style: italic; }

/* ── ALA: AI Learning & Adoption (new format, alan-*) ───────── */
.alan-view { position: relative; display: flex; flex-direction: column; gap: 1rem; }
.alan-badge { display: inline-block; background: rgba(139,92,246,0.18); border: 1px solid rgba(139,92,246,0.45); color: #a78bfa; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; padding: 0.2rem 0.6rem; border-radius: 2rem; align-self: flex-start; }
.alan-body { display: grid; grid-template-columns: 45fr 20fr 35fr; gap: 0.9rem; align-items: start; }
.alan-roles-col { display: flex; flex-direction: column; gap: 0.5rem; }
.alan-role-card { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; }
.alan-role-card__name { font-size: 0.72rem; font-weight: 700; color: #5eead4; margin: 0; text-transform: uppercase; letter-spacing: 0.04em; }
.alan-role-card__path-label, .alan-role-card__outcome-label { font-size: 0.58rem; font-weight: 700; color: rgba(255,255,255,0.32); text-transform: uppercase; letter-spacing: 0.07em; margin: 0.15rem 0 0; }
.alan-role-card__pills { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.alan-role-card__pill { background: rgba(94,234,212,0.12); border: 1px solid rgba(94,234,212,0.25); color: #5eead4; font-size: 0.6rem; font-weight: 600; padding: 0.12rem 0.4rem; border-radius: 2rem; }
.alan-role-card__outcome { font-size: 0.68rem; color: rgba(255,255,255,0.58); margin: 0; font-style: italic; }
.alan-roadmap-col { display: flex; flex-direction: column; gap: 0; }
.alan-roadmap-stage { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.4rem; padding: 0.5rem 0.6rem; display: flex; flex-direction: column; gap: 0.2rem; }
.alan-roadmap-stage__name { font-size: 0.68rem; font-weight: 700; color: rgba(255,255,255,0.88); margin: 0; }
.alan-roadmap-stage__row { display: flex; flex-direction: column; gap: 0.06rem; }
.alan-roadmap-stage__field-label { font-size: 0.55rem; font-weight: 700; color: rgba(255,255,255,0.28); text-transform: uppercase; letter-spacing: 0.07em; }
.alan-roadmap-stage__value { font-size: 0.62rem; color: rgba(255,255,255,0.58); }
.alan-roadmap-arrow { text-align: center; font-size: 0.75rem; color: rgba(255,255,255,0.2); padding: 0.1rem 0; line-height: 1; }
.alan-actions-col { display: flex; flex-direction: column; gap: 0.5rem; }
.alan-action-card { background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.3rem; }
.alan-action-card__action { font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.88); margin: 0; }
.alan-action-card__row { display: flex; align-items: baseline; gap: 0.35rem; }
.alan-action-card__field-label { font-size: 0.58rem; font-weight: 700; color: rgba(255,255,255,0.28); text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.alan-action-card__value { font-size: 0.66rem; color: rgba(255,255,255,0.62); }
.alan-impact--high  { color: #f87171; font-weight: 700; }
.alan-impact--medium { color: #fbbf24; font-weight: 700; }
.alan-impact--low   { color: #4ade80; font-weight: 700; }
.alan-summary-strip { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.5rem; overflow: hidden; margin-top: 0.5rem; }
.alan-summary-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.2rem; padding: 0.65rem 0.4rem; border-right: 1px solid rgba(255,255,255,0.07); text-align: center; }
.alan-summary-cell:last-child { border-right: none; }
.alan-summary-cell__value { font-size: 1.15rem; font-weight: 700; color: rgba(255,255,255,0.88); margin: 0; line-height: 1; }
.alan-summary-cell__label { font-size: 0.56rem; color: rgba(255,255,255,0.36); text-transform: uppercase; letter-spacing: 0.07em; margin: 0; }
.alan-resources { display: flex; flex-direction: column; gap: 0.4rem; }
.alan-resource-item { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.4rem; padding: 0.4rem 0.65rem; gap: 0.6rem; }
.alan-resource-item__name { font-size: 0.72rem; font-weight: 600; color: rgba(255,255,255,0.8); margin: 0; flex: 1; }
.alan-resource-item__meta { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.alan-resource-item__audience { font-size: 0.62rem; color: rgba(255,255,255,0.36); }
.alan-resource-item__priority { font-size: 0.6rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 2rem; text-transform: uppercase; letter-spacing: 0.06em; }
.alan-pri--high   { background: rgba(248,113,113,0.15); color: #f87171; }
.alan-pri--medium { background: rgba(251,191,36,0.15);  color: #fbbf24; }
.alan-pri--low    { background: rgba(74,222,128,0.15);  color: #4ade80; }
.alan-consultant-guidance { display: flex; gap: 0.65rem; background: rgba(20,184,166,0.08); border: 1px solid rgba(20,184,166,0.22); border-radius: 0.5rem; padding: 0.75rem 0.9rem; align-items: flex-start; }
.alan-cg__icon { color: #14b8a6; font-size: 0.85rem; flex-shrink: 0; margin-top: 0.05rem; }
.alan-cg__text { font-size: 0.72rem; color: rgba(255,255,255,0.62); margin: 0; line-height: 1.5; }
.alan-ai-recommendation { display: flex; gap: 0.65rem; background: rgba(251,191,36,0.08); border: 1px solid rgba(251,191,36,0.22); border-radius: 0.5rem; padding: 0.75rem 0.9rem; align-items: flex-start; }
.alan-ar__icon { color: #fbbf24; font-size: 0.85rem; flex-shrink: 0; margin-top: 0.05rem; }
.alan-ar__text { font-size: 0.72rem; color: rgba(255,255,255,0.62); margin: 0; line-height: 1.5; }

/* ── ARCP: AI Roles & Capability Planning (new format) ───────── */
.arcp-role-card-pdf { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-left: 2px solid #5CC5A7; border-radius: 0.45rem; padding: 0.5rem 0.65rem; display: flex; flex-direction: column; gap: 0.2rem; }
.arcp-role-card-pdf__header { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
.arcp-role-card-pdf__name { font-size: 0.76rem; font-weight: 600; color: #5CC5A7; margin: 0; }
.arcp-role-card-pdf__sub-lbl { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255,255,255,0.32); margin: 0.15rem 0 0.05rem; }
.arcp-role-card-pdf__sub-val { font-size: 0.7rem; color: rgba(255,255,255,0.68); margin: 0; }
.arcp-role-card-pdf__caps { display: flex; flex-wrap: wrap; gap: 0.2rem; }
.arcp-cap-pill-pdf { font-size: 0.6rem; color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 0.2rem; padding: 0.08rem 0.35rem; }
.arcp-journey-chain-pdf { display: flex; flex-direction: column; align-items: center; gap: 0; }
.arcp-journey-node-pdf { width: 100%; background: rgba(92,197,167,0.06); border: 1px solid rgba(92,197,167,0.22); border-radius: 0.35rem; padding: 0.35rem 0.5rem; font-size: 0.68rem; font-weight: 500; color: rgba(255,255,255,0.78); text-align: center; }
.arcp-journey-arrow-pdf { font-size: 0.7rem; color: rgba(92,197,167,0.45); padding: 0.08rem 0; text-align: center; }
.arcp-pri-item-pdf { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.4rem; padding: 0.45rem 0.6rem; display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.4rem; }
.arcp-pri-item-pdf__header { display: flex; align-items: baseline; gap: 0.35rem; }
.arcp-pri-item-pdf__num { font-size: 0.58rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #5CC5A7; }
.arcp-pri-item-pdf__row { display: flex; flex-direction: column; gap: 0.04rem; margin-top: 0.2rem; }
.arcp-pri-item-pdf__field-lbl { font-size: 0.53rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.32); }
.arcp-pri-item-pdf__role { font-size: 0.72rem; font-weight: 600; color: rgba(255,255,255,0.82); }
.arcp-pri-item-pdf__cap { font-size: 0.68rem; color: rgba(255,255,255,0.62); margin: 0; }
.arcp-pri-item-pdf__outcome { font-size: 0.62rem; color: rgba(255,255,255,0.42); margin: 0; line-height: 1.38; }
/* ── ASA: Legacy skills assessment (backwards compat) ───────── */
.asa-skill-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.45rem 0.65rem; display: flex; flex-direction: column; gap: 0.15rem; }
.asa-skill-card__name { font-size: 0.76rem; font-weight: 600; color: rgba(255,255,255,0.88); margin: 0; }
.asa-skill-card__meta { font-size: 0.65rem; color: rgba(255,255,255,0.45); margin: 0; }
.asa-matrix-wrap { display: flex; flex-direction: column; gap: 0.35rem; }
.asa-matrix-row { display: flex; flex-direction: column; gap: 0.18rem; }
.asa-matrix-row__cat { font-size: 0.7rem; font-weight: 600; color: rgba(255,255,255,0.72); margin: 0; }
.asa-matrix-bar-track { height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
.asa-matrix-bar-fill  { height: 100%; background: rgba(99,102,241,0.65); border-radius: 3px; }
.asa-matrix-row__counts { font-size: 0.62rem; color: rgba(255,255,255,0.38); margin: 0; }
.asa-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; margin-top: 0.35rem; }
.asa-summary-cell { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.4rem; padding: 0.45rem 0.6rem; }
.asa-cat--ready   { border-color: rgba(52,211,153,0.3); }
.asa-cat--strong  { border-color: rgba(52,211,153,0.25); }
.asa-cat--partial { border-color: rgba(251,191,36,0.3); }
.asa-cat--needs   { border-color: rgba(248,113,113,0.3); }
.asa-summary-cell__lbl { font-size: 0.68rem; font-weight: 600; color: rgba(255,255,255,0.7); margin: 0; }
.asa-summary-cell__val { font-size: 0.62rem; color: rgba(255,255,255,0.42); margin: 0; }

/* ── ALA: AI Learning & Adoption ─────────────────────────────── */
.ala-pillar-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.45rem; padding: 0.5rem 0.65rem; display: flex; flex-direction: column; gap: 0.15rem; border-left: 2px solid transparent; }
.ala-pillar--ready      { border-left-color: #34d399; }
.ala-pillar--progress   { border-left-color: #fbbf24; }
.ala-pillar--notstarted { border-left-color: rgba(255,255,255,0.18); }
.ala-pillar-card__name   { font-size: 0.76rem; font-weight: 600; color: rgba(255,255,255,0.88); margin: 0; }
.ala-pillar-card__desc   { font-size: 0.67rem; color: rgba(255,255,255,0.48); margin: 0; line-height: 1.4; }
.ala-pillar-card__status { font-size: 0.6rem; font-weight: 600; color: rgba(255,255,255,0.38); }
.ala-lifecycle-wrap { display: flex; flex-direction: column; gap: 0.15rem; }
.ala-lifecycle-stage { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.4rem; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; gap: 0.15rem; }
.ala-lifecycle-stage__hdr { display: flex; align-items: center; gap: 0.35rem; }
.ala-lifecycle-stage__num { display: inline-flex; align-items: center; justify-content: center; width: 1.1rem; height: 1.1rem; background: rgba(99,102,241,0.2); border-radius: 50%; font-size: 0.62rem; font-weight: 700; color: rgba(160,163,255,0.9); flex-shrink: 0; }
.ala-lifecycle-stage__name { font-size: 0.72rem; font-weight: 600; color: rgba(255,255,255,0.82); }
.ala-lifecycle-stage__status { font-size: 0.63rem; color: rgba(255,255,255,0.42); margin: 0; }
.ala-lifecycle-bar-track { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
.ala-lifecycle-bar-fill  { height: 100%; background: rgba(92,197,167,0.6); border-radius: 2px; }
.ala-lifecycle-stage__pct { font-size: 0.61rem; color: rgba(92,197,167,0.8); font-weight: 700; }
.ala-lifecycle-stage__acts { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.08rem; }
.ala-lifecycle-stage__acts li { font-size: 0.61rem; color: rgba(255,255,255,0.36); line-height: 1.35; padding-left: 0.6rem; position: relative; }
.ala-lifecycle-stage__acts li::before { content: '·'; position: absolute; left: 0; }
.ala-lifecycle-arr { text-align: center; font-size: 1rem; color: rgba(255,255,255,0.15); line-height: 1; }
.ala-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; margin-top: 0.35rem; }
.ala-summary-cell { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.4rem; padding: 0.45rem 0.6rem; }
.ala-sum--ready      { border-color: rgba(52,211,153,0.3); }
.ala-sum--progress   { border-color: rgba(251,191,36,0.3); }
.ala-sum--emerging   { border-color: rgba(96,165,250,0.3); }
.ala-sum--developing { border-color: rgba(99,102,241,0.3); }
.ala-summary-cell__lbl { font-size: 0.68rem; font-weight: 600; color: rgba(255,255,255,0.7); margin: 0; }
.ala-summary-cell__val { font-size: 0.62rem; color: rgba(255,255,255,0.42); margin: 0; }

/* ── AI Opportunity Discovery layout ─────────────────────────────────── */
.opp-pdf-layer { display: flex; flex-direction: column; gap: 0.55rem; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 0.65rem; padding: 0.85rem 1rem; }
.opp-pdf-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.15rem; }
.opp-pdf-dot { width: 0.55rem; height: 0.55rem; border-radius: 50%; flex-shrink: 0; }
.opp-pdf-dot--problem  { background: #f87171; }
.opp-pdf-dot--workflow { background: #60a5fa; }
.opp-pdf-dot--ai       { background: #34d399; }
.opp-pdf-title { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
.opp-pdf-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.opp-pdf-chip { display: inline-block; font-size: 0.73rem; padding: 0.22rem 0.65rem; border-radius: 1rem; font-weight: 500; white-space: nowrap; }
.opp-pdf-chip--problem { background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.3); color: rgba(255,255,255,0.8); }
.opp-pdf-chip--hea     { background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3); color: rgba(255,255,255,0.8); }
.opp-pdf-connector { text-align: center; font-size: 1rem; color: rgba(255,255,255,0.2); line-height: 1; margin: -0.2rem 0; }
.opp-pdf-workflow { display: flex; flex-direction: column; gap: 0.5rem; }
.opp-pdf-steps { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
.opp-pdf-step { font-size: 0.73rem; padding: 0.22rem 0.65rem; background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.25); border-radius: 0.4rem; color: rgba(255,255,255,0.78); }
.opp-pdf-step-arrow { font-size: 0.8rem; color: rgba(255,255,255,0.22); }
.opp-pdf-hea-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(251,191,36,0.6); margin-top: 0.2rem; }
.opp-pdf-hub { display: flex; align-items: center; gap: 0.75rem; justify-content: center; }
.opp-pdf-hub__col { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
.opp-pdf-ai-node { width: 2.5rem; height: 2.5rem; border-radius: 50%; background: rgba(52,211,153,0.15); border: 1.5px solid rgba(52,211,153,0.45); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; color: #34d399; flex-shrink: 0; }
.opp-pdf-ai-card { background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.25); border-radius: 0.5rem; padding: 0.45rem 0.7rem; }
.opp-pdf-ai-card__name { font-size: 0.73rem; font-weight: 700; color: #34d399; margin: 0; line-height: 1.35; }
.opp-pdf-ai-card__why { font-size: 0.66rem; font-weight: 400; color: rgba(255,255,255,0.6); margin: 0.2rem 0 0; line-height: 1.4; }

/* ── Business Value Definition layout ────────────────────────────────── */
.bvd-pdf-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin-top: 0.35rem; }
.bvd-pdf-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 0.55rem; padding: 0.75rem 0.9rem; display: flex; flex-direction: column; gap: 0.3rem; }
.bvd-pdf-card__title { font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.9); margin: 0; }
.bvd-pdf-card__focus { font-size: 0.72rem; color: rgba(255,200,60,0.85); margin: 0; line-height: 1.4; }
.bvd-pdf-card__outcomes { list-style: none; display: flex; flex-direction: column; gap: 0.2rem; margin: 0; padding: 0; }
.bvd-pdf-card__outcomes li { font-size: 0.7rem; color: rgba(255,255,255,0.55); line-height: 1.4; padding-left: 0.7rem; position: relative; }
.bvd-pdf-card__outcomes li::before { content: '·'; position: absolute; left: 0; }
.bvd-pdf-insight { display: flex; align-items: flex-start; gap: 0.6rem; background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.2); border-radius: 0.5rem; padding: 0.75rem 0.9rem; margin-top: 0.2rem; }
.bvd-pdf-insight__icon { font-size: 0.7rem; color: rgba(129,140,248,0.7); flex-shrink: 0; margin-top: 0.15rem; }
.bvd-pdf-insight__text { font-size: 0.77rem; color: rgba(255,255,255,0.72); line-height: 1.55; margin: 0; }

/* ── AI Implementation Prioritization layout ───────────────────────────────── */
.pri-pdf-banner { display: flex; align-items: flex-start; gap: 0.65rem; background: rgba(251,191,36,0.07); border: 1px solid rgba(251,191,36,0.25); border-radius: 0.5rem; padding: 0.75rem 1rem; }
.pri-pdf-banner__star { font-size: 1rem; color: #fbbf24; flex-shrink: 0; line-height: 1; }
.pri-pdf-banner__title { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(251,191,36,0.7); margin: 0 0 0.2rem; }
.pri-pdf-banner__text { font-size: 0.79rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.pri-pdf-matrix-wrap { display: flex; flex-direction: column; gap: 0; margin-top: 0.35rem; }
.pri-pdf-x-header { display: grid; grid-template-columns: 3.5rem 1fr 1fr; gap: 0.4rem; padding-bottom: 0.25rem; }
.pri-pdf-x-empty { }
.pri-pdf-x-header span { font-size: 0.62rem; font-weight: 600; text-align: center; color: rgba(255,255,255,0.38); text-transform: uppercase; letter-spacing: 0.05em; }
.pri-pdf-grid { display: flex; flex-direction: column; gap: 0.4rem; }
.pri-pdf-row { display: grid; grid-template-columns: 3.5rem 1fr 1fr; gap: 0.4rem; align-items: stretch; }
.pri-pdf-y-label { font-size: 0.6rem; font-weight: 600; color: rgba(255,255,255,0.38); text-transform: uppercase; letter-spacing: 0.04em; display: flex; align-items: center; justify-content: flex-end; padding-right: 0.4rem; line-height: 1.3; }
.pri-pdf-q { border-radius: 0.5rem; padding: 0.65rem 0.8rem; display: flex; flex-direction: column; gap: 0.3rem; }
.pri-pdf-q--wins { background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.25); }
.pri-pdf-q--bets { background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.25); }
.pri-pdf-q--fill { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
.pri-pdf-q--avoid { background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.2); }
.pri-pdf-q__label { font-size: 0.73rem; font-weight: 700; color: rgba(255,255,255,0.85); margin: 0; }
.pri-pdf-q__items { font-size: 0.68rem; color: rgba(255,255,255,0.5); margin: 0; line-height: 1.5; }

/* ── AI Use Case Classification layout ───────────────────────────────── */
.clf-pdf-primary { background: rgba(129,140,248,0.08); border: 1px solid rgba(129,140,248,0.25); border-radius: 0.55rem; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; }
.clf-pdf-primary__label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: rgba(129,140,248,0.7); margin: 0; }
.clf-pdf-primary__name { font-size: 0.92rem; font-weight: 700; color: rgba(255,255,255,0.95); margin: 0; }
.clf-pdf-primary__desc { font-size: 0.76rem; color: rgba(255,255,255,0.6); margin: 0; line-height: 1.5; }
.clf-pdf-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.55rem; margin-top: 0.35rem; }
.clf-pdf-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.55rem; padding: 0.75rem 0.9rem; display: flex; flex-direction: column; gap: 0.35rem; }
.clf-pdf-card--active { background: rgba(129,140,248,0.09); border-color: rgba(129,140,248,0.35); }
.clf-pdf-card__type { font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.9); margin: 0; }
.clf-pdf-card__purpose { font-size: 0.71rem; color: rgba(255,255,255,0.55); margin: 0; line-height: 1.45; }
.clf-pdf-card__chars { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.1rem; }
.clf-pdf-chip { display: inline-block; font-size: 0.67rem; padding: 0.15rem 0.5rem; background: rgba(129,140,248,0.1); border: 1px solid rgba(129,140,248,0.22); border-radius: 0.75rem; color: rgba(255,255,255,0.65); white-space: nowrap; }

/* ── Page-break control ─────────────────────────────────────────────── */
/* Keep section headings bound to their first content block */
.pdf-section-h3 { page-break-after: avoid; break-after: avoid; }
/* Prevent individual cards and component blocks from splitting mid-element */
.vision-statement,
.kpi-highlights,
.h-timeline,
.pillar-card,
.pillars-grid,
.initiative-card,
.initiative-card--wide,
.commitment-pillar-card,
.commitment-pillars,
.matrix-quadrant,
.solution-portfolio-card,
.solution-portfolio-tree-wrap,
.team-composition-section,
.team-role-item,
.lifecycle-section,
.lifecycle-detail-card,
.cto-diagram-panel,
.cto-spoke-panel,
.detail-bullet-card,
.sdlc-pipeline__stage,
.team-composition-section,
.kpi-item {
  page-break-inside: avoid;
  break-inside: avoid;
}

/* ── ROI / Financial Performance ─────────────────────────────────────────── */
.roi-section { margin-bottom: 1rem; }
.roi-summary-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 1rem; }
.roi-summary-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.75rem; text-align: center; border-top: 3px solid #5CC5A7; }
.roi-summary-card--proceed { border-top-color: #5CC5A7; }
.roi-summary-card--pilot   { border-top-color: #fbbf24; }
.roi-summary-card--reassess { border-top-color: #f87171; }
.roi-summary-card__label { font-size: 0.6rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.25rem; }
.roi-summary-card__value { font-size: 1.1rem; font-weight: 700; color: #fff; margin: 0; }
.roi-summary-card__sub   { font-size: 0.65rem; color: rgba(255,255,255,0.5); margin: 0.2rem 0 0; }
.roi-cost-value-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
.roi-cost-col, .roi-value-col { background: rgba(255,255,255,0.04); border-radius: 6px; padding: 0.75rem; }
.roi-col-header { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.5); margin: 0 0 0.5rem; }
.roi-col-list { list-style: none; padding: 0; margin: 0; }
.roi-col-list li { font-size: 0.72rem; color: rgba(255,255,255,0.8); padding: 0.2rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.roi-col-list li:last-child { border: none; }
.roi-timeline { display: flex; gap: 0; align-items: stretch; }
.roi-timeline__stage { flex: 1; background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem 0.5rem; text-align: center; }
.roi-timeline__stage-label { font-size: 0.6rem; font-weight: 600; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0 0 0.2rem; }
.roi-timeline__stage-value { font-size: 0.75rem; color: #fff; margin: 0 0 0.2rem; }
.roi-timeline__stage-kpi   { font-size: 0.62rem; color: #5CC5A7; margin: 0; }
.roi-timeline__arrow { display: flex; align-items: center; padding: 0 0.25rem; color: rgba(255,255,255,0.3); font-size: 1rem; }

/* ── Operational Excellence ──────────────────────────────────────────────── */
.oe-scorecard { width: 100%; border-collapse: collapse; font-size: 0.7rem; margin-bottom: 1rem; }
.oe-scorecard__row { display: grid; grid-template-columns: 2fr 1.5fr 1.5fr 2fr; border-bottom: 1px solid rgba(255,255,255,0.07); }
.oe-scorecard__row--header { background: rgba(255,255,255,0.07); font-weight: 600; }
.oe-scorecard__cell { padding: 0.4rem 0.5rem; color: rgba(255,255,255,0.8); font-size: 0.68rem; }
.oe-scorecard__cell--area   { color: rgba(255,255,255,0.9); font-weight: 600; }
.oe-scorecard__cell--before { color: #f87171; }
.oe-scorecard__cell--after  { color: #5CC5A7; }
.oe-scorecard__cell--benefit { color: rgba(255,255,255,0.7); }
.oe-impact-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 1rem; }
.oe-impact-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem; }
.oe-impact-card__title { font-size: 0.72rem; font-weight: 600; color: #fff; margin: 0 0 0.3rem; }
.oe-impact-card__list { list-style: none; padding: 0; margin: 0; }
.oe-impact-card__list li { font-size: 0.65rem; color: rgba(255,255,255,0.7); padding: 0.15rem 0; }

/* ── Customer Value ──────────────────────────────────────────────────────── */
.cv-journey { display: flex; flex-direction: column; gap: 0; margin-bottom: 1rem; }
.cv-journey__stage { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem 0.75rem; }
.cv-journey__stage-name { font-size: 0.75rem; font-weight: 600; color: #fff; margin: 0 0 0.2rem; }
.cv-journey__stage-value { font-size: 0.67rem; color: #5CC5A7; margin: 0; }
.cv-journey__arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.8rem; padding: 0.1rem 0; }
.cv-value-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 1rem; }
.cv-value-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem; }
.cv-value-card__title { font-size: 0.72rem; font-weight: 600; color: #fff; margin: 0 0 0.25rem; }
.cv-value-card__list { list-style: none; padding: 0; margin: 0; }
.cv-value-card__list li { font-size: 0.64rem; color: rgba(255,255,255,0.7); padding: 0.15rem 0; }
.cv-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
.kpi-highlight-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem; text-align: center; }
.kpi-highlight-card__value { font-size: 1.1rem; font-weight: 700; color: #5CC5A7; margin: 0 0 0.15rem; }
.kpi-highlight-card__label { font-size: 0.62rem; color: rgba(255,255,255,0.6); margin: 0 0 0.15rem; text-transform: uppercase; letter-spacing: 0.05em; }
.kpi-highlight-card__desc  { font-size: 0.62rem; color: rgba(255,255,255,0.5); margin: 0; }

/* ── Solution-Centric ────────────────────────────────────────────────────── */
.sol-main-card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
.sol-main-card__name { font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 0.5rem; }
.sol-meta-row { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.3rem; font-size: 0.7rem; }
.sol-meta-row--chips { flex-wrap: wrap; }
.sol-meta-label { color: rgba(255,255,255,0.5); font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; min-width: 6rem; }
.sol-meta-value { color: rgba(255,255,255,0.85); }
.sol-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.sol-team-chip { background: rgba(92,197,167,0.15); color: #5CC5A7; font-size: 0.62rem; padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid rgba(92,197,167,0.3); }
.sol-kpi-chip  { background: rgba(129,140,248,0.15); color: #818cf8; font-size: 0.62rem; padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid rgba(129,140,248,0.3); }
.sol-components-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.sol-component-card { background: rgba(255,255,255,0.04); border-radius: 6px; padding: 0.6rem; border: 1px solid rgba(255,255,255,0.07); }
.sol-component-card__type { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.4); margin: 0 0 0.2rem; }
.sol-component-card__name { font-size: 0.72rem; font-weight: 600; color: #fff; margin: 0 0 0.25rem; }
.sol-component-card__purpose-label { font-size: 0.6rem; color: rgba(255,255,255,0.4); margin: 0 0 0.15rem; }
.sol-component-card__purpose { font-size: 0.67rem; color: rgba(255,255,255,0.7); margin: 0; }

/* ── Cross-functional Teams ──────────────────────────────────────────────── */
.team-groups-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 1rem; }
.team-group-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.7rem; }
.team-group-card__label { font-size: 0.65rem; font-weight: 700; color: #5CC5A7; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.4rem; }
.team-group-card__roles { list-style: none; padding: 0; margin: 0; }
.team-group-card__roles li { font-size: 0.68rem; color: rgba(255,255,255,0.8); padding: 0.15rem 0; }

/* ── Prioritization dim-cards ────────────────────────────────────────────── */
.pri-dim-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 1rem; }
.pri-dim-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.65rem; }
.pri-dim-card__title { font-size: 0.7rem; font-weight: 600; color: #fff; margin: 0 0 0.35rem; }
.pri-dim-card__bullets { list-style: none; padding: 0; margin: 0; }
.pri-dim-card__bullets li { font-size: 0.64rem; color: rgba(255,255,255,0.7); padding: 0.1rem 0; }

/* ── Classification banner ───────────────────────────────────────────────── */
.cls-banner { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
.cls-banner__cell { background: rgba(255,255,255,0.05); border-radius: 8px; padding: 1rem; }
.cls-banner__cell--secondary { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
/* display:block — these are spans; without it label/name/rationale/outcome
   run together on one line in the rendered PDF */
.cls-banner__label { display: block; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.45); margin: 0 0 0.35rem; }
.cls-banner__name { display: block; font-size: 1.1rem; font-weight: 700; color: #fff; margin: 0 0 0.5rem; }
.cls-name--productivity { color: #5CC5A7; }
.cls-name--functional   { color: #818cf8; }
.cls-name--product      { color: #fbbf24; }
.cls-banner__rationale { display: block; font-size: 0.7rem; color: rgba(255,255,255,0.7); margin: 0 0 0.5rem; }
.cls-banner__outcome { display: block; font-size: 0.68rem; color: rgba(255,255,255,0.6); margin: 0; }

/* ── CDI new layout ──────────────────────────────────────────────────────── */
.cdi-body { display: grid; grid-template-columns: 70fr 30fr; gap: 1rem; margin-bottom: 1rem; }
.cdi-left, .cdi-right { display: flex; flex-direction: column; gap: 0.5rem; }
.cdi-dataset-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.7rem; }
.cdi-dataset-card__name { font-size: 0.78rem; font-weight: 700; color: #fff; margin: 0 0 0.35rem; }
.cdi-dataset-card__info-row { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.68rem; margin-bottom: 0.2rem; }
.cdi-dataset-card__info-row--output { background: rgba(92,197,167,0.08); border-radius: 4px; padding: 0.2rem 0.35rem; }
.cdi-dataset-card__info-label { font-size: 0.6rem; color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 0.05em; min-width: 5rem; }
.cdi-dataset-card__info-value { color: rgba(255,255,255,0.8); }
.cdi-badge { font-size: 0.6rem; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.cdi-badge--high   { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
.cdi-badge--medium { background: rgba(251,191,36,0.15);  color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
.cdi-badge--low    { background: rgba(92,197,167,0.15);  color: #5CC5A7; border: 1px solid rgba(92,197,167,0.3); }
.cdi-traceability { display: flex; flex-direction: column; gap: 0; }
.cdi-traceability__node { background: rgba(255,255,255,0.05); border-radius: 5px; padding: 0.4rem 0.6rem; font-size: 0.67rem; color: rgba(255,255,255,0.85); }
.cdi-traceability__node--start { border-left: 3px solid #5CC5A7; }
.cdi-traceability__node--end   { border-left: 3px solid #818cf8; }
.cdi-traceability__arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.75rem; padding: 0.05rem 0; }
.cdi-collection-row { display: flex; gap: 0.4rem; align-items: flex-start; padding: 0.35rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.cdi-collection-row:last-child { border: none; }
.cdi-collection-row__num { min-width: 1.2rem; height: 1.2rem; background: #5CC5A7; border-radius: 50%; color: #000; font-size: 0.6rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 0.1rem; }
.cdi-collection-row__content { flex: 1; }
.cdi-collection-row__name   { font-size: 0.7rem; font-weight: 600; color: #fff; margin: 0 0 0.1rem; }
.cdi-collection-row__reason { font-size: 0.64rem; color: rgba(255,255,255,0.6); margin: 0; }
.cdi-roadmap { display: flex; flex-direction: column; gap: 0.1rem; }
.cdi-roadmap__step { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem; border-radius: 4px; }
.cdi-roadmap__step--ready   { background: rgba(92,197,167,0.08); }
.cdi-roadmap__step--pending { background: rgba(255,255,255,0.03); }
.cdi-roadmap__icon  { font-size: 0.75rem; }
.cdi-roadmap__label { font-size: 0.67rem; color: rgba(255,255,255,0.8); }
.cdi-consultant-guidance { background: rgba(92,197,167,0.07); border: 1px solid rgba(92,197,167,0.2); border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem; }
.cdi-consultant-guidance__header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
.cdi-consultant-guidance__icon  { color: #5CC5A7; font-size: 0.8rem; }
.cdi-consultant-guidance__title { font-size: 0.7rem; font-weight: 700; color: #5CC5A7; text-transform: uppercase; letter-spacing: 0.05em; }
.cdi-consultant-guidance__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.cdi-ai-recommendation { background: rgba(129,140,248,0.07); border: 1px solid rgba(129,140,248,0.2); border-radius: 6px; padding: 0.75rem; }
.cdi-ai-recommendation__header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
.cdi-ai-recommendation__icon  { color: #818cf8; font-size: 0.8rem; }
.cdi-ai-recommendation__title { font-size: 0.7rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.05em; }
.cdi-ai-recommendation__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }

/* ── ADP new layout ──────────────────────────────────────────────────────── */
.adp-body { display: grid; grid-template-columns: 40fr 25fr 35fr; gap: 1rem; margin-bottom: 1rem; }
.adp-col { display: flex; flex-direction: column; gap: 0.5rem; }
.adp-wp-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.7rem; }
.adp-wp-card__name { font-size: 0.78rem; font-weight: 700; color: #fff; margin: 0 0 0.35rem; }
.adp-wp-card__field-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.45); display: block; margin-top: 0.3rem; margin-bottom: 0.1rem; }
.adp-wp-card__work-list { list-style: disc; padding-left: 1rem; margin: 0; }
.adp-wp-card__work-item { font-size: 0.67rem; color: rgba(255,255,255,0.8); padding: 0.1rem 0; }
.adp-wp-card__value { font-size: 0.68rem; color: rgba(255,255,255,0.8); }
.adp-wp-card__why { font-size: 0.67rem; color: rgba(255,255,255,0.7); margin: 0; }
.adp-wp-card__deliverable { font-size: 0.67rem; color: #5CC5A7; }
.adp-wp-card__meta-row { display: flex; align-items: center; gap: 0.5rem; justify-content: space-between; margin-top: 0.3rem; }
.adp-wp-card__row { display: flex; gap: 0.4rem; align-items: baseline; }
.adp-roadmap { display: flex; flex-direction: column; gap: 0; }
.adp-roadmap__node { background: rgba(255,255,255,0.04); border-radius: 5px; padding: 0.4rem 0.6rem; display: flex; flex-direction: column; }
.adp-roadmap__node--start { border-left: 3px solid #5CC5A7; }
.adp-roadmap__node--end   { border-left: 3px solid #818cf8; background: rgba(92,197,167,0.08); }
.adp-roadmap__stage   { font-size: 0.72rem; font-weight: 600; color: #fff; }
.adp-roadmap__outcome { font-size: 0.62rem; color: rgba(255,255,255,0.55); }
.adp-roadmap__arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.75rem; padding: 0.05rem 0; }
.adp-step-row { display: flex; gap: 0.5rem; align-items: flex-start; }
.adp-step-row__num { min-width: 1.4rem; height: 1.4rem; background: #5CC5A7; border-radius: 50%; color: #000; font-size: 0.65rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 0.1rem; }
.adp-step-row__content { flex: 1; }
.adp-step-row__action { font-size: 0.72rem; font-weight: 600; color: #fff; margin: 0 0 0.15rem; }
.adp-step-row__why    { font-size: 0.65rem; color: rgba(255,255,255,0.65); margin: 0 0 0.15rem; }
.adp-step-row__meta-row { display: flex; gap: 0.5rem; align-items: baseline; font-size: 0.62rem; }
.adp-step-row__owner-label { color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.04em; }
.adp-step-row__owner  { color: #5CC5A7; }
.adp-step-row__output { color: rgba(255,255,255,0.65); }
.adp-step-divider { height: 1px; background: rgba(255,255,255,0.07); margin: 0.35rem 0; }
.adp-prep-summary { margin-top: 0.75rem; }
.adp-prep-summary__cells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
.adp-prep-summary__cell { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.5rem; text-align: center; }
.adp-prep-summary__value { font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 0.15rem; }
.adp-prep-summary__value--text { font-size: 0.75rem; color: #5CC5A7; }
.adp-prep-summary__label { font-size: 0.6rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }

/* ── DAE new layout ──────────────────────────────────────────────────────── */
.dae-view { display: flex; flex-direction: column; gap: 0.75rem; }
.dae-view__position { font-size: 0.72rem; color: rgba(255,255,255,0.7); margin: 0 0 0.5rem; }
.dae-upper { display: grid; grid-template-columns: 60fr 40fr; gap: 1rem; }
.dae-blueprint-col, .dae-flow-col { display: flex; flex-direction: column; gap: 0.4rem; }
.dae-layer-grid { display: flex; flex-direction: column; gap: 0.4rem; }
.dae-layer-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem; border-left: 3px solid #5CC5A7; }
.dae-layer-card--0 { border-left-color: #5CC5A7; }
.dae-layer-card--1 { border-left-color: #818cf8; }
.dae-layer-card--2 { border-left-color: #fbbf24; }
.dae-layer-card--3 { border-left-color: #c084fc; }
.dae-layer-card__name { font-size: 0.75rem; font-weight: 700; color: #fff; margin: 0 0 0.25rem; }
.dae-layer-card__field-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.4); display: block; margin-top: 0.25rem; margin-bottom: 0.1rem; }
.dae-layer-card__purpose { font-size: 0.67rem; color: rgba(255,255,255,0.75); margin: 0; }
.dae-layer-card__tags { display: flex; flex-wrap: wrap; gap: 0.2rem; }
.dae-layer-card__tag { background: rgba(255,255,255,0.08); border-radius: 3px; padding: 0.1rem 0.3rem; font-size: 0.6rem; color: rgba(255,255,255,0.75); }
.dae-layer-card__why { font-size: 0.65rem; color: rgba(255,255,255,0.6); margin: 0; }
.dae-flow { display: flex; flex-direction: column; gap: 0; }
.dae-flow__node { background: rgba(255,255,255,0.05); border-radius: 5px; padding: 0.4rem 0.6rem; }
.dae-flow__node--0 { border-left: 2px solid #5CC5A7; }
.dae-flow__node--1 { border-left: 2px solid #818cf8; }
.dae-flow__node--2 { border-left: 2px solid #fbbf24; }
.dae-flow__node--3 { border-left: 2px solid #c084fc; }
.dae-flow__node-name { font-size: 0.7rem; font-weight: 600; color: #fff; margin: 0; }
.dae-flow__node-subs { font-size: 0.6rem; color: rgba(255,255,255,0.5); margin: 0.1rem 0 0; }
.dae-flow__arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.75rem; padding: 0.05rem 0; }
.dae-middle { display: grid; grid-template-columns: 55fr 45fr; gap: 1rem; }
.dae-decisions-col, .dae-tech-col { display: flex; flex-direction: column; gap: 0.4rem; }
.dae-dec-table { display: flex; flex-direction: column; gap: 0; }
.dae-dec-table__row { display: grid; grid-template-columns: 2fr 2.5fr 2.5fr; border-bottom: 1px solid rgba(255,255,255,0.07); }
.dae-dec-table__row--header { background: rgba(255,255,255,0.07); font-weight: 600; }
.dae-dec-table__cell { padding: 0.4rem 0.5rem; font-size: 0.67rem; color: rgba(255,255,255,0.8); }
.dae-dec-table__cell--area { font-weight: 600; color: rgba(255,255,255,0.95); }
.dae-dec-table__cell--rec  { color: #5CC5A7; }
.dae-dec-table__cell--why  { color: rgba(255,255,255,0.65); }
.dae-tech-table { display: flex; flex-direction: column; gap: 0; }
.dae-tech-table__row { display: grid; grid-template-columns: 1fr 2fr; border-bottom: 1px solid rgba(255,255,255,0.07); }
.dae-tech-table__row--header { background: rgba(255,255,255,0.07); font-weight: 600; }
.dae-tech-table__cell { padding: 0.4rem 0.5rem; font-size: 0.67rem; color: rgba(255,255,255,0.8); }
.dae-tech-table__cell--layer { font-weight: 600; }
.dae-tech-table__cell--rec   { color: #5CC5A7; }
.dae-pattern-section { margin-top: 0.5rem; }
.dae-pattern-row { display: flex; flex-direction: column; gap: 0; }
.dae-pattern-node { background: rgba(255,255,255,0.05); border-radius: 5px; padding: 0.35rem 0.6rem; }
.dae-pattern-node__label { font-size: 0.68rem; color: rgba(255,255,255,0.85); margin: 0; }
.dae-pattern-row__arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.75rem; padding: 0.05rem 0; display: block; }
.dae-consultant-guidance { background: rgba(92,197,167,0.07); border: 1px solid rgba(92,197,167,0.2); border-radius: 6px; padding: 0.75rem; }
.dae-consultant-guidance__header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.35rem; }
.dae-consultant-guidance__icon  { color: #5CC5A7; }
.dae-consultant-guidance__title { font-size: 0.7rem; font-weight: 700; color: #5CC5A7; text-transform: uppercase; letter-spacing: 0.05em; }
.dae-consultant-guidance__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.dae-impl-section { margin-top: 0.5rem; }
.dae-impl-row { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
.dae-impl-step { display: flex; align-items: center; gap: 0.3rem; background: rgba(255,255,255,0.05); border-radius: 5px; padding: 0.3rem 0.5rem; }
.dae-impl-step__num { min-width: 1.1rem; height: 1.1rem; background: #5CC5A7; border-radius: 50%; color: #000; font-size: 0.55rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.dae-impl-step__label { font-size: 0.62rem; color: rgba(255,255,255,0.8); }
.dae-impl-row__arrow { color: rgba(255,255,255,0.3); font-size: 0.75rem; }
.dae-arch-summary { margin-top: 0.5rem; }
.dae-arch-summary__cells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
.dae-arch-summary__cell { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.5rem; text-align: center; }
.dae-arch-summary__value { font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 0.15rem; }
.dae-arch-summary__value--text { font-size: 0.72rem; color: #5CC5A7; }
.dae-arch-summary__label { font-size: 0.6rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
.dae-pip { font-size: 0.6rem; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 600; }
.dae-pip--high   { background: rgba(248,113,113,0.15); color: #f87171; }
.dae-pip--medium { background: rgba(251,191,36,0.15);  color: #fbbf24; }
.dae-pip--low    { background: rgba(92,197,167,0.15);  color: #5CC5A7; }
.dae-decision-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem; margin-bottom: 0.4rem; }
.dae-decision-card__field-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.4); display: block; margin-bottom: 0.1rem; }
.dae-decision-card__decision { font-size: 0.7rem; color: #fff; margin: 0 0 0.3rem; font-weight: 600; }
.dae-decision-card__benefit  { font-size: 0.67rem; color: rgba(255,255,255,0.7); margin: 0; }

/* ── SIA new layout ──────────────────────────────────────────────────────── */
.sia-view { display: flex; flex-direction: column; gap: 0.75rem; }
.sia-view__position { font-size: 0.72rem; color: rgba(255,255,255,0.7); margin: 0 0 0.5rem; }
.sia-main-body { display: grid; grid-template-columns: 65fr 35fr; gap: 1rem; }
.sia-blueprint-col, .sia-right-col { display: flex; flex-direction: column; gap: 0.4rem; }
.sia-blueprint-grid { display: flex; flex-direction: column; gap: 0.5rem; }
.sia-system-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.7rem; }
.sia-system-card__name { font-size: 0.78rem; font-weight: 700; color: #fff; margin: 0 0 0.35rem; }
.sia-system-card__field-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.4); margin: 0.25rem 0 0.1rem; display: block; }
.sia-system-card__value { font-size: 0.67rem; color: rgba(255,255,255,0.75); margin: 0; }
.sia-workflow-chain { display: flex; flex-direction: column; gap: 0; }
.sia-workflow-node { background: rgba(255,255,255,0.05); border-radius: 5px; padding: 0.35rem 0.6rem; font-size: 0.68rem; color: rgba(255,255,255,0.85); text-align: center; }
.sia-workflow-arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.75rem; }
.sia-priorities { display: flex; flex-direction: column; gap: 0.35rem; }
.sia-priority-item { background: rgba(255,255,255,0.04); border-radius: 5px; padding: 0.45rem; }
.sia-priority-item__header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem; }
.sia-priority-item__num  { min-width: 1.2rem; height: 1.2rem; background: rgba(92,197,167,0.2); border-radius: 50%; color: #5CC5A7; font-size: 0.6rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.sia-priority-item__name { font-size: 0.7rem; font-weight: 600; color: #fff; flex: 1; }
.sia-priority-badge { font-size: 0.58rem; padding: 0.1rem 0.3rem; border-radius: 3px; border: 1px solid; font-weight: 600; }
.sia-priority-item__benefit { font-size: 0.63rem; color: rgba(255,255,255,0.6); margin: 0; }
.sia-arch-chain { display: flex; flex-direction: column; gap: 0.1rem; }
.sia-arch-layer { background: rgba(255,255,255,0.04); border-radius: 5px; padding: 0.5rem; }
.sia-arch-layer__name { font-size: 0.68rem; font-weight: 700; margin: 0 0 0.25rem; }
.sia-arch-techs { display: flex; flex-wrap: wrap; gap: 0.2rem; }
.sia-tech-pill { background: rgba(255,255,255,0.08); border-radius: 3px; padding: 0.1rem 0.3rem; font-size: 0.6rem; color: rgba(255,255,255,0.75); }
.sia-arch-arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.75rem; }
.sia-principles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
.sia-principle-item { background: rgba(255,255,255,0.05); border-radius: 5px; padding: 0.45rem; font-size: 0.65rem; color: rgba(255,255,255,0.8); }
.sia-impl-seq { display: flex; flex-direction: column; gap: 0.2rem; }
.sia-impl-step { display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.04); border-radius: 5px; padding: 0.3rem 0.5rem; }
.sia-impl-step__num { min-width: 1.1rem; height: 1.1rem; background: #5CC5A7; border-radius: 50%; color: #000; font-size: 0.55rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.sia-impl-step__label { font-size: 0.65rem; color: rgba(255,255,255,0.8); }
.sia-consultant-guidance { background: rgba(92,197,167,0.07); border: 1px solid rgba(92,197,167,0.2); border-radius: 6px; padding: 0.75rem; }
.sia-consultant-guidance__title { font-size: 0.7rem; font-weight: 700; color: #5CC5A7; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.35rem; }
.sia-consultant-guidance__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.sia-ai-recommendation { background: rgba(129,140,248,0.07); border: 1px solid rgba(129,140,248,0.2); border-radius: 6px; padding: 0.75rem; }
.sia-ai-recommendation__title { font-size: 0.7rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.35rem; }
.sia-ai-recommendation__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.sia-readiness-badge { background: rgba(92,197,167,0.15); color: #5CC5A7; border-radius: 5px; padding: 0.3rem 0.6rem; font-size: 0.65rem; font-weight: 700; display: inline-block; margin-bottom: 0.5rem; }

/* ── APR new layout ──────────────────────────────────────────────────────── */
.apr-view { display: flex; flex-direction: column; gap: 0.75rem; }
.apr-view__position { font-size: 0.72rem; color: rgba(255,255,255,0.7); margin: 0 0 0.5rem; }
.apr-main-body { display: grid; grid-template-columns: 55fr 45fr; gap: 1rem; }
.apr-cap-list-col, .apr-blueprint-col { display: flex; flex-direction: column; gap: 0.4rem; }
.apr-cap-list { display: flex; flex-direction: column; gap: 0.4rem; }
.apr-cap2-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.7rem; }
.apr-cap2-card__name { font-size: 0.78rem; font-weight: 700; color: #fff; margin: 0 0 0.25rem; }
.apr-cap2-card__field-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.4); display: block; margin-top: 0.25rem; margin-bottom: 0.1rem; }
.apr-cap2-card__purpose { font-size: 0.67rem; color: rgba(255,255,255,0.75); margin: 0; }
.apr-cap2-card__caps { list-style: disc; padding-left: 1rem; margin: 0; }
.apr-cap2-card__caps li { font-size: 0.64rem; color: rgba(255,255,255,0.7); padding: 0.1rem 0; }
.apr-cap2-card__value { font-size: 0.67rem; color: #5CC5A7; margin: 0; }
.apr-blueprint-chain { display: flex; flex-direction: column; gap: 0.1rem; }
.apr-blueprint-node { background: rgba(255,255,255,0.04); border-radius: 5px; padding: 0.4rem 0.6rem; }
.apr-blueprint-node__layer { font-size: 0.7rem; font-weight: 600; color: #fff; margin: 0; }
.apr-blueprint-node__rec   { font-size: 0.63rem; color: rgba(255,255,255,0.6); margin: 0.15rem 0 0; }
.apr-blueprint-arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.75rem; }
.apr-recs2-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.apr-rec2-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.65rem; }
.apr-rec2-card__title { font-size: 0.72rem; font-weight: 600; color: #fff; margin: 0 0 0.25rem; }
.apr-rec2-card__field-label { font-size: 0.6rem; text-transform: uppercase; color: rgba(255,255,255,0.4); display: block; margin: 0.2rem 0 0.1rem; }
.apr-rec2-card__why { font-size: 0.65rem; color: rgba(255,255,255,0.7); margin: 0; }
.apr-rec2-card__footer { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.5rem; }
.apr-rec2-priority { font-size: 0.6rem; padding: 0.1rem 0.35rem; border-radius: 3px; border: 1px solid; font-weight: 600; }
.apr-rec2-phase { font-size: 0.6rem; color: rgba(255,255,255,0.5); }
.apr-impl-seq { display: flex; flex-direction: column; gap: 0.2rem; }
.apr-impl-step { display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.04); border-radius: 5px; padding: 0.3rem 0.5rem; }
.apr-impl-step__num { min-width: 1.1rem; height: 1.1rem; background: #5CC5A7; border-radius: 50%; color: #000; font-size: 0.55rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.apr-impl-step__label { font-size: 0.65rem; color: rgba(255,255,255,0.8); }
.apr-stack2-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
.apr-stack2-table th, .apr-stack2-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.07); text-align: left; }
.apr-stack2-table th { background: rgba(255,255,255,0.07); font-weight: 600; color: rgba(255,255,255,0.9); }
.apr-stack2-table td { color: rgba(255,255,255,0.75); }
.apr-consultant-guidance { background: rgba(92,197,167,0.07); border: 1px solid rgba(92,197,167,0.2); border-radius: 6px; padding: 0.75rem; }
.apr-consultant-guidance__title { font-size: 0.7rem; font-weight: 700; color: #5CC5A7; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.35rem; }
.apr-consultant-guidance__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.apr-ai-recommendation { background: rgba(129,140,248,0.07); border: 1px solid rgba(129,140,248,0.2); border-radius: 6px; padding: 0.75rem; }
.apr-ai-recommendation__title { font-size: 0.7rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.35rem; }
.apr-ai-recommendation__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.apr-readiness-badge { background: rgba(92,197,167,0.15); color: #5CC5A7; border-radius: 5px; padding: 0.3rem 0.6rem; font-size: 0.65rem; font-weight: 700; display: inline-block; margin-bottom: 0.5rem; }

/* ── CDS new layout ──────────────────────────────────────────────────────── */
.cds-view { display: flex; flex-direction: column; gap: 0.75rem; }
.cds-view__position { font-size: 0.72rem; color: rgba(255,255,255,0.7); margin: 0 0 0.5rem; }
.cds-arch-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 0.5rem; }
.cds-arch-block { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.65rem; }
.cds-arch-block__type { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 0.35rem; }
.cds-arch-block__field-label { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.4); margin: 0.2rem 0 0.1rem; display: block; }
.cds-arch-block__name { font-size: 0.75rem; font-weight: 600; color: #fff; margin: 0 0 0.25rem; }
.cds-arch-block__why { font-size: 0.65rem; color: rgba(255,255,255,0.65); margin: 0; }
.cds-mid-row { display: grid; grid-template-columns: 30fr 70fr; gap: 1rem; margin-bottom: 0.5rem; }
.cds-flow-col, .cds-tech-col { display: flex; flex-direction: column; gap: 0.4rem; }
.cds-flow-chain { display: flex; flex-direction: column; gap: 0.1rem; }
.cds-flow-node { background: rgba(255,255,255,0.05); border-radius: 5px; padding: 0.35rem 0.6rem; font-size: 0.68rem; color: rgba(255,255,255,0.85); text-align: center; }
.cds-flow-arrow { text-align: center; color: rgba(255,255,255,0.3); font-size: 0.75rem; }
.cds-tech-table { width: 100%; border-collapse: collapse; font-size: 0.67rem; }
.cds-tech-table th, .cds-tech-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.07); text-align: left; }
.cds-tech-table th { background: rgba(255,255,255,0.07); font-weight: 600; color: rgba(255,255,255,0.9); }
.cds-tech-table td { color: rgba(255,255,255,0.75); }
.cds-arch-rationale { padding-left: 1.2rem; margin: 0 0 0.5rem; }
.cds-arch-rationale__item { font-size: 0.68rem; color: rgba(255,255,255,0.75); padding: 0.15rem 0; }
.cds-dec-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.5rem; }
.cds-dec-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem; }
.cds-dec-card__type   { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.45); margin: 0 0 0.2rem; }
.cds-dec-card__choice { font-size: 0.75rem; font-weight: 700; color: #fff; margin: 0 0 0.2rem; }
.cds-dec-card__reason { font-size: 0.65rem; color: rgba(255,255,255,0.65); margin: 0; }
.cds-impl-seq { display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.5rem; }
.cds-impl-step { display: flex; align-items: center; gap: 0.4rem; background: rgba(255,255,255,0.04); border-radius: 5px; padding: 0.3rem 0.5rem; }
.cds-impl-step__num { min-width: 1.1rem; height: 1.1rem; background: #5CC5A7; border-radius: 50%; color: #000; font-size: 0.55rem; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.cds-impl-step__label { font-size: 0.65rem; color: rgba(255,255,255,0.8); }
.cds-infra-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; margin-bottom: 0.5rem; }
.cds-infra-table th, .cds-infra-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.07); text-align: left; }
.cds-infra-table th { background: rgba(255,255,255,0.07); font-weight: 600; color: rgba(255,255,255,0.9); }
.cds-infra-table td { color: rgba(255,255,255,0.75); }
.cds-investment-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; margin-bottom: 0.5rem; }
.cds-investment-table th, .cds-investment-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.07); text-align: left; }
.cds-investment-table th { background: rgba(255,255,255,0.07); font-weight: 600; color: rgba(255,255,255,0.9); }
.cds-invest-badge { font-size: 0.62rem; padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 600; }
.cds-invest--high   { background: rgba(248,113,113,0.15); color: #f87171; }
.cds-invest--medium { background: rgba(251,191,36,0.15);  color: #fbbf24; }
.cds-invest--low    { background: rgba(92,197,167,0.15);  color: #5CC5A7; }
.cds-consultant-guidance { background: rgba(92,197,167,0.07); border: 1px solid rgba(92,197,167,0.2); border-radius: 6px; padding: 0.75rem; }
.cds-consultant-guidance__title { font-size: 0.7rem; font-weight: 700; color: #5CC5A7; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.35rem; }
.cds-consultant-guidance__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.cds-ai-recommendation { background: rgba(129,140,248,0.07); border: 1px solid rgba(129,140,248,0.2); border-radius: 6px; padding: 0.75rem; }
.cds-ai-recommendation__title { font-size: 0.7rem; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 0.35rem; }
.cds-ai-recommendation__text  { font-size: 0.68rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.5; }
.cds-readiness-badge { background: rgba(92,197,167,0.15); color: #5CC5A7; border-radius: 5px; padding: 0.3rem 0.6rem; font-size: 0.65rem; font-weight: 700; display: inline-block; margin-bottom: 0.5rem; }
.cds-scores-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 0.5rem; }
.cds-score-cell { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.5rem; text-align: center; }
.cds-score-cell__value { font-size: 1rem; font-weight: 700; color: #fff; margin: 0 0 0.15rem; }
.cds-score-cell__label { font-size: 0.6rem; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
.cds-workload-col, .cds-right-col { display: flex; flex-direction: column; gap: 0.4rem; }
.cds-workload-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.7rem; }
.cds-workload-card__name { font-size: 0.75rem; font-weight: 700; color: #fff; margin: 0 0 0.3rem; }
.cds-workload-card__spec { font-size: 0.67rem; color: rgba(255,255,255,0.75); margin: 0.1rem 0; }
.cds-workload-card__spec-label { color: rgba(255,255,255,0.45); }
.cds-priority { font-size: 0.6rem; padding: 0.15rem 0.4rem; border-radius: 3px; font-weight: 600; margin-top: 0.3rem; display: inline-block; }
.cds-priority--critical, .cds-priority--high   { background: rgba(248,113,113,0.15); color: #f87171; }
.cds-priority--medium { background: rgba(251,191,36,0.15);  color: #fbbf24; }
.cds-priority--low    { background: rgba(92,197,167,0.15);  color: #5CC5A7; }
.cds-body { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.cds-recs-section { display: flex; flex-direction: column; gap: 0.4rem; }
.cds-recs-grid { display: flex; flex-direction: column; gap: 0.4rem; }
.cds-rec-card { background: rgba(255,255,255,0.05); border-radius: 6px; padding: 0.6rem; }
.cds-rec-card__text { font-size: 0.7rem; color: rgba(255,255,255,0.85); margin: 0 0 0.25rem; }
.cds-rec-card__impact-row { font-size: 0.65rem; color: rgba(255,255,255,0.6); margin-bottom: 0.2rem; }
.cds-rec-card__reason { font-size: 0.63rem; color: rgba(255,255,255,0.55); margin: 0; }
.cds-impact--high   { color: #f87171; font-weight: 600; }
.cds-impact--medium { color: #fbbf24; font-weight: 600; }
.cds-impact--low    { color: #5CC5A7; font-weight: 600; }
`;
}

// ── Static HTML helpers ───────────────────────────────────────────────────────

function buildCoverPageHTML(blueprint) {
  const company  = blueprint.companyName || 'Company';
  const industry = blueprint.industry    || '';
  const version  = blueprint.version     || '1.0';
  // TransformationBlueprint has no generatedAt field — createdAt is the generation time
  const gen      = fmtDate(blueprint.generatedAt || blueprint.createdAt);
  const upd      = fmtDate(blueprint.updatedAt);

  const rows = [
    ['Version',      version],
    ['Generated',    gen],
    ['Last Updated', upd],
  ].map(([k, v]) => `
    <div class="cover-meta-row">
      <span class="cover-meta-label">${k}</span>
      <span class="cover-meta-value">${v}</span>
    </div>`).join('');

  return `
<div class="pdf-cover">
  <div class="cover-accent-bar"></div>
  <div class="cover-body">
    <div class="cover-company">${company}</div>
    <div class="cover-industry">${industry}</div>
    <div class="cover-blueprint-title">AI Transformation Blueprint</div>
    <div class="cover-divider"></div>
    <div class="cover-meta">${rows}</div>
  </div>
  <div class="cover-footer">
    <div class="cover-footer-text">CONFIDENTIAL — FOR AUTHORISED RECIPIENTS ONLY</div>
  </div>
</div>`;
}

function buildAppendixPageHTML(blueprint) {
  const meta = [
    ['Company',      blueprint.companyName || '—'],
    ['Industry',     blueprint.industry    || '—'],
    ['Version',      blueprint.version     || '1.0'],
    ['Generated',    fmtDate(blueprint.generatedAt || blueprint.createdAt)],
    ['Last Updated', fmtDate(blueprint.updatedAt)],
    ['Status',       (blueprint.status || '—').charAt(0).toUpperCase() + (blueprint.status || '—').slice(1)],
  ].map(([k, v]) => `
    <div class="appendix-meta-row">
      <span class="appendix-meta-key">${k}</span>
      <span class="appendix-meta-val">${v}</span>
    </div>`).join('');

  const APPENDIX_DOMAIN_ORDER = ['ai-use-cases','ai-strategy','data-readiness','technology-infrastructure','skills-workforce','governance-security'];
  const APPENDIX_DOMAIN_NAMES = { 'governance-security': 'Governance & Ethics' };
  const APPENDIX_RETIRED_CAPS = new Set(['business-strategy-alignment']);
  const appendixDomains = (blueprint.domains || []).slice().sort((a, b) => {
    const ai = APPENDIX_DOMAIN_ORDER.indexOf(a.domainId);
    const bi = APPENDIX_DOMAIN_ORDER.indexOf(b.domainId);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  const capRows = appendixDomains.flatMap(domain => {
    const displayName = APPENDIX_DOMAIN_NAMES[domain.domainId] || domain.domainName || '—';
    return (domain.capabilities || []).filter(cap => !APPENDIX_RETIRED_CAPS.has(cap.capabilityId)).map(cap => {
      const done = cap.status === 'completed';
      return `<tr>
        <td>${displayName}</td>
        <td>${cap.capabilityName || '—'}</td>
        <td class="${done ? 'status-complete' : 'status-other'}">${done ? 'Complete' : (cap.status || '—')}</td>
      </tr>`;
    });
  }).join('');

  return `
<div class="pdf-page">
  <h1 class="pdf-h1">Appendix</h1>
  <div class="appendix-meta">${meta}</div>
  <p class="brief-label" style="margin-bottom:0.75rem">CAPABILITY COMPLETION STATUS</p>
  <table class="appendix-cap-table">
    <thead><tr><th>Domain</th><th>Capability</th><th>Status</th></tr></thead>
    <tbody>${capRows}</tbody>
  </table>
</div>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildBlueprintHTML(blueprint) {
  const data = JSON.stringify(blueprint);

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<style>' + getCSS() + '</style>',
    '</head>',
    '<body>',
    buildCoverPageHTML(blueprint),
    '<div class="pdf-page" id="pdf-toc">',
    '  <h1 class="pdf-h1">Table of Contents</h1>',
    '  <div id="toc-content"></div>',
    '</div>',
    '<div class="pdf-page" id="pdf-exec">',
    '  <h1 class="pdf-h1">Executive Summary</h1>',
    '  <div id="exec-content"></div>',
    '</div>',
    '<div id="capabilities-root"></div>',
    buildAppendixPageHTML(blueprint),
    '<script>',
    'var BLUEPRINT = ' + data + ';',
    BROWSER_FUNCTIONS,
    'renderBlueprint(BLUEPRINT);',
    '<\/script>',
    '</body>',
    '</html>',
  ].join('\n');
}
