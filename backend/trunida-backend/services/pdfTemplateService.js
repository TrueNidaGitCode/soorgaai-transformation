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

function buildKpiHighlights(highlights) {
  const wrap = document.createElement('div');
  wrap.className = 'kpi-highlights-wrap';
  const heading = document.createElement('p');
  heading.className = 'brief-label';
  heading.textContent = 'Success Metrics';
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
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'solution-centric-layout';

  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text'; stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  if (b.solutionPortfolio && b.solutionPortfolio.length) {
    const mapSection = document.createElement('div');
    mapSection.className = 'solution-portfolio-section';
    const mapLbl = document.createElement('p');
    mapLbl.className = 'brief-label'; mapLbl.textContent = 'Solution Portfolio Map';
    mapSection.appendChild(mapLbl);
    const treeWrap = document.createElement('div');
    treeWrap.className = 'solution-portfolio-tree-wrap';
    treeWrap.appendChild(buildSolutionPortfolioTree(b.solutionPortfolio));
    mapSection.appendChild(treeWrap);
    wrap.appendChild(mapSection);

    const detailSection = document.createElement('div');
    detailSection.className = 'solution-portfolio-section';
    const detailLbl = document.createElement('p');
    detailLbl.className = 'brief-label'; detailLbl.textContent = 'Solution Details';
    detailSection.appendChild(detailLbl);
    const grid = document.createElement('div');
    grid.className = 'solution-portfolio-grid';
    b.solutionPortfolio.forEach(function(sol) {
      const card = document.createElement('div');
      card.className = 'solution-portfolio-card';
      const name = document.createElement('p');
      name.className = 'solution-portfolio-card__name'; name.textContent = sol.name;
      card.appendChild(name);
      [['Business Owner', sol.businessOwner], ['Delivery Team', sol.deliveryTeam]].forEach(function(pair) {
        if (!pair[1]) return;
        const row = document.createElement('div');
        row.className = 'solution-portfolio-card__row';
        const rl = document.createElement('span');
        rl.className = 'solution-portfolio-card__row-label'; rl.textContent = pair[0];
        const rv = document.createElement('span');
        rv.className = 'solution-portfolio-card__row-value'; rv.textContent = pair[1];
        row.appendChild(rl); row.appendChild(rv); card.appendChild(row);
      });
      if (sol.kpis && sol.kpis.length) {
        const kpisRow = document.createElement('div');
        kpisRow.className = 'solution-portfolio-card__kpis';
        const kl = document.createElement('span');
        kl.className = 'solution-portfolio-card__row-label'; kl.textContent = 'KPIs';
        const kv = document.createElement('p');
        kv.className = 'solution-portfolio-card__kpis-list'; kv.textContent = sol.kpis.join(' · ');
        kpisRow.appendChild(kl); kpisRow.appendChild(kv); card.appendChild(kpisRow);
      }
      grid.appendChild(card);
    });
    detailSection.appendChild(grid);
    wrap.appendChild(detailSection);
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
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'cross-functional-layout';

  const stmt = document.createElement('div');
  stmt.className = 'vision-statement';
  const stmtLbl = document.createElement('p');
  stmtLbl.className = 'brief-label'; stmtLbl.textContent = 'Strategic Position';
  const stmtTxt = document.createElement('p');
  stmtTxt.className = 'vision-statement__text'; stmtTxt.textContent = b.strategicPosition || '—';
  stmt.appendChild(stmtLbl); stmt.appendChild(stmtTxt);
  wrap.appendChild(stmt);

  const compSection = document.createElement('div');
  compSection.className = 'team-composition-section';
  const compLbl = document.createElement('p');
  compLbl.className = 'brief-label'; compLbl.textContent = 'Team Composition Model';
  compSection.appendChild(compLbl);
  const svgWrap = document.createElement('div');
  svgWrap.className = 'team-hierarchy-wrap';
  svgWrap.appendChild(buildTeamHierarchySvg());
  compSection.appendChild(svgWrap);
  wrap.appendChild(compSection);

  if (b.teamRoles && b.teamRoles.length) {
    const detailSection = document.createElement('div');
    detailSection.className = 'team-structure-section';
    const detailLbl = document.createElement('p');
    detailLbl.className = 'brief-label'; detailLbl.textContent = 'Team Structure Details';
    detailSection.appendChild(detailLbl);
    const roleList = document.createElement('div');
    roleList.className = 'team-role-list';
    b.teamRoles.forEach(function(role) {
      const item = document.createElement('div');
      item.className = 'team-role-item';
      const title = document.createElement('p');
      title.className = 'team-role-item__title'; title.textContent = role.title;
      item.appendChild(title);
      if (role.description) {
        const desc = document.createElement('p');
        desc.className = 'team-role-item__desc'; desc.textContent = role.description;
        item.appendChild(desc);
      }
      roleList.appendChild(item);
    });
    detailSection.appendChild(roleList);
    wrap.appendChild(detailSection);
  }

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
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'financial-performance-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.waterfallItems && b.waterfallItems.length) {
    wrap.appendChild(buildDiagramSection('Value Waterfall Visualization', buildWaterfallSvg(b.waterfallItems)));
    const list = document.createElement('div');
    list.className = 'detail-bullet-list';
    b.waterfallItems.filter(function(it) { return it.description; }).forEach(function(it) {
      const card = document.createElement('div');
      card.className = 'detail-bullet-card';
      const t = document.createElement('p');
      t.className = 'detail-bullet-card__title'; t.textContent = it.category;
      card.appendChild(t);
      const d = document.createElement('p');
      d.className = 'detail-bullet-card__desc'; d.textContent = it.description;
      card.appendChild(d);
      list.appendChild(card);
    });
    wrap.appendChild(buildDetailSection('Financial Breakdown', list));
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildOperationalExcellenceLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'operational-excellence-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.sdlcStages && b.sdlcStages.length) {
    wrap.appendChild(buildDiagramSection('SDLC Performance Dashboard', buildSdlcPipeline(b.sdlcStages)));
    const list = document.createElement('div');
    list.className = 'detail-bullet-list';
    b.sdlcStages.forEach(function(stage) {
      const card = document.createElement('div');
      card.className = 'detail-bullet-card';
      const t = document.createElement('p');
      t.className = 'detail-bullet-card__title'; t.textContent = stage.stage;
      card.appendChild(t);
      if (stage.description) {
        const d = document.createElement('p');
        d.className = 'detail-bullet-card__desc'; d.textContent = stage.description;
        card.appendChild(d);
      }
      list.appendChild(card);
    });
    wrap.appendChild(buildDetailSection('SDLC Stage Details', list));
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
  return wrap;
}

function buildCustomerValueLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'customer-value-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.flywheelStages && b.flywheelStages.length) {
    wrap.appendChild(buildDiagramSection('Customer Value Flywheel', buildPillChain(b.flywheelStages, 'name')));
    wrap.appendChild(buildDetailSection('Customer Value Details', buildPillarBulletCards(b.flywheelStages, 'name')));
  }
  if (b.kpiHighlights && b.kpiHighlights.length) wrap.appendChild(buildKpiHighlights(b.kpiHighlights));
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
    const hub = document.createElement('div'); hub.className = 'opp-pdf-hub';
    const leftCol = document.createElement('div'); leftCol.className = 'opp-pdf-hub__col';
    left.forEach(function(o) { const c = document.createElement('span'); c.className = 'opp-pdf-chip opp-pdf-chip--ai'; c.textContent = o; leftCol.appendChild(c); });
    const aiNode = document.createElement('div'); aiNode.className = 'opp-pdf-ai-node'; aiNode.textContent = 'AI';
    const rightCol = document.createElement('div'); rightCol.className = 'opp-pdf-hub__col';
    right.forEach(function(o) { const c = document.createElement('span'); c.className = 'opp-pdf-chip opp-pdf-chip--ai'; c.textContent = o; rightCol.appendChild(c); });
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
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

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
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

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

  // Prioritization Insight
  if (insight) {
    const ins = document.createElement('div'); ins.className = 'vision-statement';
    const insL = document.createElement('p'); insL.className = 'brief-label'; insL.textContent = 'Prioritization Insight';
    const insT = document.createElement('p'); insT.className = 'vision-statement__text'; insT.textContent = insight;
    ins.appendChild(insL); ins.appendChild(insT); wrap.appendChild(ins);
  }

  return wrap;
}

function buildAIUseCaseClassificationLayout(section) {
  const b    = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  // Primary classification highlight
  if (b.primaryClassification) {
    const pc = document.createElement('div'); pc.className = 'clf-pdf-primary';
    const label = document.createElement('p'); label.className = 'clf-pdf-primary__label'; label.textContent = 'Primary Classification';
    const name = document.createElement('p'); name.className = 'clf-pdf-primary__name'; name.textContent = b.primaryClassification.name || '';
    const desc = document.createElement('p'); desc.className = 'clf-pdf-primary__desc'; desc.textContent = b.primaryClassification.description || '';
    pc.appendChild(label); pc.appendChild(name); pc.appendChild(desc);
    wrap.appendChild(pc);
  }

  // 3 Classification type cards
  if (b.classificationCards && b.classificationCards.length) {
    const lbl = document.createElement('p'); lbl.className = 'brief-label'; lbl.textContent = 'AI Classification Types';
    wrap.appendChild(lbl);
    const row = document.createElement('div'); row.className = 'clf-pdf-row';
    b.classificationCards.forEach(function(cc) {
      const isPrimary = b.primaryClassification && b.primaryClassification.name === cc.type;
      const card = document.createElement('div');
      card.className = 'clf-pdf-card' + (isPrimary ? ' clf-pdf-card--active' : '');
      const t = document.createElement('p'); t.className = 'clf-pdf-card__type'; t.textContent = cc.type || '';
      const p = document.createElement('p'); p.className = 'clf-pdf-card__purpose'; p.textContent = cc.purpose || '';
      card.appendChild(t); card.appendChild(p);
      if (cc.characteristics && cc.characteristics.length) {
        const chars = document.createElement('div'); chars.className = 'clf-pdf-card__chars';
        cc.characteristics.forEach(function(ch) {
          const chip = document.createElement('span'); chip.className = 'clf-pdf-chip'; chip.textContent = ch; chars.appendChild(chip);
        });
        card.appendChild(chars);
      }
      row.appendChild(card);
    });
    wrap.appendChild(row);
  }

  // Classification Insight
  if (b.classificationInsight) {
    const ci = document.createElement('div'); ci.className = 'vision-statement';
    const ciL = document.createElement('p'); ciL.className = 'brief-label'; ciL.textContent = 'Classification Insight';
    const ciT = document.createElement('p'); ciT.className = 'vision-statement__text'; ciT.textContent = b.classificationInsight;
    ci.appendChild(ciL); ci.appendChild(ciT); wrap.appendChild(ci);
  }

  return wrap;
}

function buildCriticalDataIdentificationLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.coverageSummary) {
    const cs = b.coverageSummary;
    const csSection = document.createElement('div'); csSection.className = 'cto-detail-section';
    const csL = document.createElement('p'); csL.className = 'brief-label'; csL.textContent = 'Data Coverage Summary';
    csSection.appendChild(csL);
    csSection.appendChild(buildSummaryGrid([
      { key: 'Critical Datasets', val: String(cs.criticalDatasets || 0) },
      { key: 'Missing Data', val: String(cs.missingData || 0) },
      { key: 'Confidence', val: (cs.confidence || 0) + '%' },
    ]));
    wrap.appendChild(csSection);
  }
  if (b.datasets && b.datasets.length) {
    wrap.appendChild(buildDetailSection('Critical Datasets', buildStatusTable(b.datasets, [
      { key: 'name', label: 'Dataset' },
      { key: 'category', label: 'Category' },
      { key: 'priority', label: 'Priority' },
      { key: 'availability', label: 'Availability' },
    ])));
  }
  if (b.recommendations && b.recommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.recommendations.map(function(r) {
      return { text: r.text || String(r), priority: r.priority };
    }), 'Recommendations'));
  }
  return wrap;
}

function buildAIDataPreparationLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.pipelineStages && b.pipelineStages.length) {
    wrap.appendChild(buildDetailSection('Pipeline Status', buildStatusTable(b.pipelineStages, [
      { key: 'stage', label: 'Stage' },
      { key: 'status', label: 'Status' },
    ])));
  }
  if (b.readinessSummary) {
    const rs = b.readinessSummary;
    const rsSection = document.createElement('div'); rsSection.className = 'cto-detail-section';
    const rsL = document.createElement('p'); rsL.className = 'brief-label'; rsL.textContent = 'Readiness Summary';
    rsSection.appendChild(rsL);
    rsSection.appendChild(buildSummaryGrid([
      { key: 'Quality', val: (rs.quality || 0) + '%' },
      { key: 'Standardization', val: (rs.standardization || 0) + '%' },
      { key: 'Integration', val: (rs.integration || 0) + '%' },
      { key: 'AI Readiness', val: (rs.aiReadiness || 0) + '%' },
    ]));
    wrap.appendChild(rsSection);
  }
  if (b.prepRecommendations && b.prepRecommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.prepRecommendations.map(function(r) {
      return { text: r.text, priority: r.priority, sub: r.impact };
    }), 'Preparation Recommendations'));
  }
  return wrap;
}

function buildDataArchitectureEnablementLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.archStats) {
    const as = b.archStats;
    const asSection = document.createElement('div'); asSection.className = 'cto-detail-section';
    const asL = document.createElement('p'); asL.className = 'brief-label'; asL.textContent = 'Architecture Stats';
    asSection.appendChild(asL);
    asSection.appendChild(buildSummaryGrid([
      { key: 'Architecture Readiness', val: (as.architectureReadiness || 0) + '%' },
      { key: 'Automation', val: (as.automation || 0) + '%' },
      { key: 'Connected Systems', val: String(as.connectedSystems || 0) },
      { key: 'Disconnected', val: String(as.disconnectedSystems || 0) },
    ]));
    wrap.appendChild(asSection);
  }
  if (b.healthTimeline && b.healthTimeline.length) {
    wrap.appendChild(buildDetailSection('Architecture Health', buildStatusTable(b.healthTimeline, [
      { key: 'stage', label: 'Layer' },
      { key: 'status', label: 'Status' },
      { key: 'health', label: 'Health' },
    ])));
  }
  if (b.archRecommendations && b.archRecommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.archRecommendations.map(function(r) {
      return { text: r.title || String(r), priority: r.impact };
    }), 'Architecture Recommendations'));
  }
  return wrap;
}

function buildSystemIntegrationLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.integrationReadiness !== undefined) {
    const irSection = document.createElement('div'); irSection.className = 'cto-detail-section';
    const irL = document.createElement('p'); irL.className = 'brief-label'; irL.textContent = 'Integration Overview';
    irSection.appendChild(irL);
    const summData = [{ key: 'Overall Readiness', val: b.integrationReadiness + '%' }];
    if (b.integrationSummary) {
      const s = b.integrationSummary;
      if (s.integration) summData.push({ key: 'Integration', val: s.integration });
      if (s.automation) summData.push({ key: 'Automation', val: s.automation });
      if (s.reliability) summData.push({ key: 'Reliability', val: s.reliability });
      if (s.scalability) summData.push({ key: 'Scalability', val: s.scalability });
    }
    irSection.appendChild(buildSummaryGrid(summData));
    wrap.appendChild(irSection);
  }
  if (b.connectedSystems && b.connectedSystems.length) {
    wrap.appendChild(buildDetailSection('Connected Systems', buildStatusTable(b.connectedSystems, [
      { key: 'name', label: 'System' },
      { key: 'integrationMethod', label: 'Method' },
      { key: 'status', label: 'Status' },
      { key: 'healthIndicator', label: 'Health' },
    ])));
  }
  return wrap;
}

function buildAIPlatformReadinessLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.platformReadiness !== undefined) {
    const prSection = document.createElement('div'); prSection.className = 'cto-detail-section';
    const prL = document.createElement('p'); prL.className = 'brief-label';
    prL.textContent = 'Platform Readiness: ' + b.platformReadiness + '%';
    prSection.appendChild(prL);
    if (b.platformSummary) {
      const ps = b.platformSummary;
      prSection.appendChild(buildSummaryGrid([
        { key: 'Development', val: ps.development || '—' },
        { key: 'Knowledge', val: ps.knowledge || '—' },
        { key: 'Deployment', val: ps.deployment || '—' },
        { key: 'Monitoring', val: ps.monitoring || '—' },
      ]));
    }
    wrap.appendChild(prSection);
  }
  if (b.platformStack && b.platformStack.length) {
    wrap.appendChild(buildDetailSection('Platform Stack Assessment', buildStatusTable(b.platformStack, [
      { key: 'layer', label: 'Layer' },
      { key: 'score', label: 'Score' },
      { key: 'status', label: 'Status' },
    ])));
  }
  if (b.platformRecommendations && b.platformRecommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.platformRecommendations.map(function(r) {
      return { text: r.text, priority: r.priority, sub: r.benefit };
    }), 'Platform Recommendations'));
  }
  return wrap;
}

function buildAIComputeDeploymentLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.deploymentReadiness !== undefined || b.deploymentKpis) {
    const drSection = document.createElement('div'); drSection.className = 'cto-detail-section';
    const drL = document.createElement('p'); drL.className = 'brief-label';
    drL.textContent = 'Deployment Readiness' + (b.deploymentReadiness !== undefined ? ': ' + b.deploymentReadiness + '%' : '');
    drSection.appendChild(drL);
    if (b.deploymentKpis) {
      const kpis = b.deploymentKpis;
      drSection.appendChild(buildSummaryGrid([
        { key: 'Compute', val: kpis.compute || '—' },
        { key: 'Deployment', val: kpis.deployment || '—' },
        { key: 'Latency', val: kpis.latency || '—' },
        { key: 'Scalability', val: kpis.scalability || '—' },
      ]));
    }
    wrap.appendChild(drSection);
  }
  if (b.workloadProfile && b.workloadProfile.length) {
    wrap.appendChild(buildDetailSection('Workload Profile', buildStatusTable(b.workloadProfile, [
      { key: 'workloadType', label: 'Workload' },
      { key: 'computeRequirement', label: 'Compute' },
      { key: 'performanceRequirement', label: 'Performance' },
      { key: 'priority', label: 'Priority' },
    ])));
  }
  if (b.deploymentRecommendations && b.deploymentRecommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.deploymentRecommendations.map(function(r) {
      return { text: r.text, priority: r.impact, sub: r.reason };
    }), 'Deployment Recommendations'));
  }
  return wrap;
}

function buildAIEngineeringEnablementLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.engineeringReadiness !== undefined || b.automationStats) {
    const erSection = document.createElement('div'); erSection.className = 'cto-detail-section';
    const erL = document.createElement('p'); erL.className = 'brief-label';
    erL.textContent = 'Engineering Readiness' + (b.engineeringReadiness !== undefined ? ': ' + b.engineeringReadiness + '%' : '');
    erSection.appendChild(erL);
    if (b.automationStats) {
      const as = b.automationStats;
      erSection.appendChild(buildSummaryGrid([
        { key: 'Automation', val: as.automation || '—' },
        { key: 'Testing', val: as.testing || '—' },
        { key: 'Deployment', val: as.deployment || '—' },
      ]));
    }
    wrap.appendChild(erSection);
  }
  if (b.engineeringCapabilities && b.engineeringCapabilities.length) {
    wrap.appendChild(buildDetailSection('Engineering Capabilities', buildStatusTable(b.engineeringCapabilities, [
      { key: 'name', label: 'Capability' },
      { key: 'score', label: 'Score' },
      { key: 'status', label: 'Status' },
    ])));
  }
  if (b.engineeringRecommendations && b.engineeringRecommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.engineeringRecommendations.map(function(r) {
      return { text: r.text, priority: r.priority };
    }), 'Engineering Recommendations'));
  }
  return wrap;
}

function buildAISkillsAssessmentLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.skillsReadiness !== undefined || b.skillsStats) {
    const srSection = document.createElement('div'); srSection.className = 'cto-detail-section';
    const srL = document.createElement('p'); srL.className = 'brief-label';
    srL.textContent = 'Skills Readiness' + (b.skillsReadiness !== undefined ? ': ' + b.skillsReadiness + '%' : '');
    srSection.appendChild(srL);
    if (b.skillsStats) {
      const ss = b.skillsStats;
      srSection.appendChild(buildSummaryGrid([
        { key: 'Available', val: String(ss.available || 0) },
        { key: 'Gaps', val: String(ss.gaps || 0) },
        { key: 'Critical Gaps', val: String(ss.critical || 0) },
      ]));
    }
    wrap.appendChild(srSection);
  }
  if (b.skillsMatrix && b.skillsMatrix.length) {
    wrap.appendChild(buildDetailSection('Skills Matrix', buildStatusTable(b.skillsMatrix, [
      { key: 'category', label: 'Category' },
      { key: 'readiness', label: 'Readiness' },
      { key: 'required', label: 'Required' },
      { key: 'missing', label: 'Missing' },
    ])));
  }
  if (b.skillsRecommendations && b.skillsRecommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.skillsRecommendations.map(function(r) {
      return { text: r.title, priority: r.priority, sub: r.expectedBenefit };
    }), 'Skills Recommendations'));
  }
  return wrap;
}

function buildAITeamReadinessLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.teamReadiness !== undefined || b.teamStats) {
    const trSection = document.createElement('div'); trSection.className = 'cto-detail-section';
    const trL = document.createElement('p'); trL.className = 'brief-label';
    trL.textContent = 'Team Readiness' + (b.teamReadiness !== undefined ? ': ' + b.teamReadiness + '%' : '');
    trSection.appendChild(trL);
    if (b.teamStats) {
      const ts = b.teamStats;
      trSection.appendChild(buildSummaryGrid([
        { key: 'Required Roles', val: String(ts.required || 0) },
        { key: 'Available', val: String(ts.available || 0) },
        { key: 'Missing / Partial', val: String(ts.missing || 0) },
      ]));
    }
    wrap.appendChild(trSection);
  }
  if (b.requiredRoles && b.requiredRoles.length) {
    wrap.appendChild(buildDetailSection('Required Roles', buildStatusTable(b.requiredRoles, [
      { key: 'name', label: 'Role' },
      { key: 'responsibility', label: 'Responsibility' },
      { key: 'availability', label: 'Availability' },
      { key: 'priority', label: 'Priority' },
    ])));
  }
  if (b.teamRecommendations && b.teamRecommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.teamRecommendations.map(function(r) {
      return { text: r.title, priority: r.priority, sub: r.impact };
    }), 'Team Recommendations'));
  }
  return wrap;
}

function buildAILearningAdoptionLayout(section) {
  const b = section.brief || {};
  const wrap = document.createElement('div');
  wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));
  if (b.adoptionReadiness !== undefined || b.adoptionStats) {
    const arSection = document.createElement('div'); arSection.className = 'cto-detail-section';
    const arL = document.createElement('p'); arL.className = 'brief-label';
    arL.textContent = 'Adoption Readiness' + (b.adoptionReadiness !== undefined ? ': ' + b.adoptionReadiness + '%' : '');
    arSection.appendChild(arL);
    if (b.adoptionStats) {
      const as = b.adoptionStats;
      arSection.appendChild(buildSummaryGrid([
        { key: 'Teams Trained', val: String(as.teamsTrained || 0) },
        { key: 'Tools Adopted', val: String(as.toolsAdopted || 0) },
        { key: 'Adoption Rate', val: as.adoptionRate || '—' },
      ]));
    }
    wrap.appendChild(arSection);
  }
  if (b.learningPillars && b.learningPillars.length) {
    wrap.appendChild(buildDetailSection('Learning Pillars', buildStatusTable(b.learningPillars, [
      { key: 'name', label: 'Pillar' },
      { key: 'description', label: 'Focus' },
      { key: 'status', label: 'Status' },
    ])));
  }
  if (b.adoptionLifecycle && b.adoptionLifecycle.length) {
    const lcSection = document.createElement('div'); lcSection.className = 'cto-detail-section';
    const lcL = document.createElement('p'); lcL.className = 'brief-label'; lcL.textContent = 'Adoption Lifecycle';
    lcSection.appendChild(lcL);
    lcSection.appendChild(buildPillChain(b.adoptionLifecycle, 'stage'));
    wrap.appendChild(lcSection);
  }
  if (b.adoptionRecommendations && b.adoptionRecommendations.length) {
    wrap.appendChild(buildPdfRecommendations(b.adoptionRecommendations.map(function(r) {
      return { text: r.title, priority: r.priority, sub: r.expectedOutcome };
    }), 'Adoption Recommendations'));
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
  if (t === 'AI Use Case Prioritization')        return buildAIUseCasePrioritizationLayout(section);
  if (t === 'AI Use Case Classification')        return buildAIUseCaseClassificationLayout(section);
  // Data Readiness
  if (t === 'Critical Data Identification')      return buildCriticalDataIdentificationLayout(section);
  if (t === 'AI Data Preparation')               return buildAIDataPreparationLayout(section);
  if (t === 'Data Architecture Enablement')      return buildDataArchitectureEnablementLayout(section);
  // Technology Infrastructure
  if (t === 'System Integration & Architecture') return buildSystemIntegrationLayout(section);
  if (t === 'AI Platform Readiness')             return buildAIPlatformReadinessLayout(section);
  if (t === 'AI Compute & Deployment Strategy')  return buildAIComputeDeploymentLayout(section);
  if (t === 'AI Engineering Enablement')         return buildAIEngineeringEnablementLayout(section);
  // Skills & Workforce
  if (t === 'AI Skills Assessment')              return buildAISkillsAssessmentLayout(section);
  if (t === 'AI Team Readiness')                 return buildAITeamReadinessLayout(section);
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

  // Executive summary
  var execContainer = document.getElementById('exec-content');
  if (execContainer) buildExecContent(bp, execContainer, tocEntries);

  // Domain → capability sections
  var capRoot = document.getElementById('capabilities-root');
  if (capRoot) {
    (bp.domains || []).forEach(function(domain) {
      var completedCaps = (domain.capabilities || []).filter(function(c) { return c.status === 'completed'; });
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

          secWrap.appendChild(buildSectionContent(section));
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
  buildCriticalDataIdentificationLayout,
  buildAIDataPreparationLayout,
  buildDataArchitectureEnablementLayout,
  buildSystemIntegrationLayout,
  buildAIPlatformReadinessLayout,
  buildAIComputeDeploymentLayout,
  buildAIEngineeringEnablementLayout,
  buildAISkillsAssessmentLayout,
  buildAITeamReadinessLayout,
  buildAILearningAdoptionLayout,
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
.opp-pdf-chip--ai      { background: rgba(52,211,153,0.12); border: 1px solid rgba(52,211,153,0.3); color: rgba(255,255,255,0.8); }
.opp-pdf-connector { text-align: center; font-size: 1rem; color: rgba(255,255,255,0.2); line-height: 1; margin: -0.2rem 0; }
.opp-pdf-workflow { display: flex; flex-direction: column; gap: 0.5rem; }
.opp-pdf-steps { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
.opp-pdf-step { font-size: 0.73rem; padding: 0.22rem 0.65rem; background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.25); border-radius: 0.4rem; color: rgba(255,255,255,0.78); }
.opp-pdf-step-arrow { font-size: 0.8rem; color: rgba(255,255,255,0.22); }
.opp-pdf-hea-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(251,191,36,0.6); margin-top: 0.2rem; }
.opp-pdf-hub { display: flex; align-items: center; gap: 0.75rem; justify-content: center; }
.opp-pdf-hub__col { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
.opp-pdf-ai-node { width: 2.5rem; height: 2.5rem; border-radius: 50%; background: rgba(52,211,153,0.15); border: 1.5px solid rgba(52,211,153,0.45); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; color: #34d399; flex-shrink: 0; }

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

/* ── AI Use Case Prioritization layout ───────────────────────────────── */
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
`;
}

// ── Static HTML helpers ───────────────────────────────────────────────────────

function buildCoverPageHTML(blueprint) {
  const company  = blueprint.companyName || 'Company';
  const industry = blueprint.industry    || '';
  const version  = blueprint.version     || '1.0';
  const gen      = fmtDate(blueprint.generatedAt);
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
    ['Generated',    fmtDate(blueprint.generatedAt)],
    ['Last Updated', fmtDate(blueprint.updatedAt)],
    ['Status',       (blueprint.status || '—').charAt(0).toUpperCase() + (blueprint.status || '—').slice(1)],
  ].map(([k, v]) => `
    <div class="appendix-meta-row">
      <span class="appendix-meta-key">${k}</span>
      <span class="appendix-meta-val">${v}</span>
    </div>`).join('');

  const capRows = (blueprint.domains || []).flatMap(domain =>
    (domain.capabilities || []).map(cap => {
      const done = cap.status === 'completed';
      return `<tr>
        <td>${domain.domainName || '—'}</td>
        <td>${cap.capabilityName || '—'}</td>
        <td class="${done ? 'status-complete' : 'status-other'}">${done ? 'Complete' : (cap.status || '—')}</td>
      </tr>`;
    })
  ).join('');

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
