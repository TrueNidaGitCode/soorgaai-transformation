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
    const rationale = document.createElement('p'); rationale.className = 'clf-pdf-primary__desc'; rationale.textContent = b.primaryClassification.rationale || '';
    const outcome = document.createElement('p'); outcome.className = 'clf-pdf-primary__outcome'; outcome.textContent = b.primaryClassification.businessOutcome || '';
    pc.appendChild(label); pc.appendChild(name); pc.appendChild(rationale); pc.appendChild(outcome);
    wrap.appendChild(pc);
  }

  // Transformation Implication
  if (b.transformationImplication) {
    const ci = document.createElement('div'); ci.className = 'vision-statement';
    const ciL = document.createElement('p'); ciL.className = 'brief-label'; ciL.textContent = 'Transformation Implication';
    const ciT = document.createElement('p'); ciT.className = 'vision-statement__text'; ciT.textContent = b.transformationImplication;
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
  var b               = section.brief || {};
  var datasets        = b.datasets        || [];
  var recommendations = b.recommendations || [];
  var coverage        = b.coverageSummary  || {};
  var relMap          = b.relationshipMap  || {};

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var PBADGE = { HIGH: 'nd-pri--high', MEDIUM: 'nd-pri--medium', LOW: 'nd-pri--low' };
  var ABADGE = { AVAILABLE: 'cdi-avail--available', MISSING: 'cdi-avail--missing', PARTIAL: 'cdi-avail--partial' };

  var body = ndBody(2);

  // LEFT: dataset cards
  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('Critical Datasets'));
  datasets.forEach(function(ds) {
    var card = document.createElement('div'); card.className = 'cdi-card';
    var top = document.createElement('div'); top.className = 'cdi-card__top';
    var priK = String(ds.priority || 'MEDIUM').toUpperCase();
    var pri = document.createElement('span'); pri.className = 'cdi-badge nd-pri ' + (PBADGE[priK] || 'nd-pri--medium'); pri.textContent = ds.priority || 'MEDIUM';
    var avlK = String(ds.availability || '').toUpperCase();
    var avl = document.createElement('span'); avl.className = 'cdi-avail ' + (ABADGE[avlK] || ''); avl.textContent = ds.availability || '';
    top.appendChild(pri); top.appendChild(avl); card.appendChild(top);
    var name = document.createElement('p'); name.className = 'cdi-card__name'; name.textContent = ds.name || ''; card.appendChild(name);
    if (ds.purpose) { var purp = document.createElement('p'); purp.className = 'cdi-card__purpose'; purp.textContent = ds.purpose; card.appendChild(purp); }
    if (ds.category) { var cat = document.createElement('span'); cat.className = 'cdi-card__cat'; cat.textContent = ds.category; card.appendChild(cat); }
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // RIGHT: relationship map + recommendations + coverage
  var rightCol = ndCol();
  var hasRel = [relMap.dataSource, relMap.dependentData, relMap.relatedData, relMap.targetData].some(function(a) { return a && a.length; });
  if (hasRel) {
    rightCol.appendChild(ndLbl('Data Relationship Map'));
    var relFlow = document.createElement('div'); relFlow.className = 'cdi-relmap';
    [{ key: 'dataSource', label: 'Data Source', icon: '◉' }, { key: 'dependentData', label: 'Dependent', icon: '◈' },
     { key: 'relatedData', label: 'Related', icon: '◇' }, { key: 'targetData', label: 'Target', icon: '◆' }].forEach(function(node, i) {
      var items = relMap[node.key] || [];
      var nodeEl = document.createElement('div'); nodeEl.className = 'cdi-relnode';
      var hdr = document.createElement('div'); hdr.className = 'cdi-relnode__hdr'; hdr.textContent = node.icon + ' ' + node.label; nodeEl.appendChild(hdr);
      if (items.length) {
        var ul = document.createElement('ul'); ul.className = 'cdi-relnode__list';
        items.slice(0, 3).forEach(function(t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
        nodeEl.appendChild(ul);
      }
      relFlow.appendChild(nodeEl);
      if (i < 3) { var arr = document.createElement('div'); arr.className = 'cdi-relmap__arr'; arr.textContent = '→'; relFlow.appendChild(arr); }
    });
    rightCol.appendChild(relFlow);
  }
  if (recommendations.length) {
    rightCol.appendChild(ndLbl('Data Collection Recommendations'));
    recommendations.forEach(function(rec, i) {
      var row = document.createElement('div'); row.className = 'cdi-rec-row';
      var num = document.createElement('span'); num.className = 'cdi-rec-row__num'; num.textContent = i + 1;
      var txt = document.createElement('p'); txt.className = 'cdi-rec-row__text'; txt.textContent = rec.text || '';
      var priK2 = String(rec.priority || 'MEDIUM').toUpperCase();
      var pri2 = document.createElement('span'); pri2.className = 'cdi-badge nd-pri ' + (PBADGE[priK2] || 'nd-pri--medium'); pri2.textContent = rec.priority || 'MEDIUM';
      row.appendChild(num); row.appendChild(txt); row.appendChild(pri2); rightCol.appendChild(row);
    });
  }
  if (coverage.criticalDatasets !== undefined || coverage.confidence) {
    rightCol.appendChild(ndLbl('Coverage Summary'));
    rightCol.appendChild(ndScoresBar([
      { value: String(coverage.criticalDatasets || 0), label: 'Datasets Identified' },
      { value: String(coverage.missingData || 0),       label: 'Missing or Partial' },
      { value: (coverage.confidence || 0) + '%',        label: 'Data Confidence' },
    ]));
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);
  return wrap;
}

// ── Data Readiness: AI Data Preparation ───────────────────────────────────────

function buildAIDataPreparationLayout(section) {
  var b             = section.brief || {};
  var inputDatasets = b.inputDatasets      || [];
  var pipelineStages = b.pipelineStages    || [];
  var prepRecs      = b.prepRecommendations || [];
  var dataStats     = b.dataStats          || {};
  var readiness     = b.readinessSummary   || {};

  var SICON  = { AVAILABLE: '◉', MISSING: '◎', 'IN PROGRESS': '◷' };
  var SCLS   = { AVAILABLE: 'adp-status--available', MISSING: 'adp-status--missing', 'IN PROGRESS': 'adp-status--progress' };
  var PSTCLS = { Completed: 'adp-circle--completed', 'Needs Attention': 'adp-circle--attention', 'In Progress': 'adp-circle--progress', Pending: 'adp-circle--pending' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  if (readiness.aiReadiness) { wrap.appendChild(ndBadge('AI READINESS: ' + readiness.aiReadiness + '%')); }
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = ndBody(3);

  // LEFT: input dataset cards
  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('Input Datasets'));
  inputDatasets.forEach(function(ds) {
    var card = document.createElement('div'); card.className = 'adp-ds-card';
    var icon = document.createElement('div'); icon.className = 'adp-ds-card__icon'; icon.textContent = SICON[ds.status] || '◉'; card.appendChild(icon);
    var name = document.createElement('p'); name.className = 'adp-ds-card__name'; name.textContent = ds.name; card.appendChild(name);
    var badge = document.createElement('span'); badge.className = 'adp-ds-status ' + (SCLS[ds.status] || 'adp-status--available'); badge.textContent = ds.status; card.appendChild(badge);
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // CENTER: pipeline circles
  var centerCol = ndCol();
  centerCol.appendChild(ndLbl('AI Data Preparation Pipeline'));
  var pGrid = document.createElement('div'); pGrid.className = 'adp-pipeline-grid';
  pipelineStages.forEach(function(stage) {
    var cell = document.createElement('div'); cell.className = 'adp-pipeline-cell';
    var circle = document.createElement('div'); circle.className = 'adp-circle ' + (PSTCLS[stage.status] || 'adp-circle--pending');
    var sn = document.createElement('p'); sn.className = 'adp-circle__name'; sn.textContent = stage.stage; circle.appendChild(sn);
    var ss = document.createElement('p'); ss.className = 'adp-circle__status'; ss.textContent = stage.status; circle.appendChild(ss);
    cell.appendChild(circle); pGrid.appendChild(cell);
  });
  centerCol.appendChild(pGrid);
  body.appendChild(centerCol);

  // RIGHT: recommendations + data stats
  var rightCol = ndCol();
  if (prepRecs.length) {
    rightCol.appendChild(ndLbl('AI Recommendations'));
    prepRecs.forEach(function(rec) {
      var card = document.createElement('div'); card.className = 'adp-rec-card';
      var txt = document.createElement('p'); txt.className = 'adp-rec-card__text'; txt.textContent = rec.text; card.appendChild(txt);
      var meta = document.createElement('p'); meta.className = 'adp-rec-card__meta'; meta.textContent = 'Priority: ' + rec.priority + (rec.effort ? '  ·  Effort: ' + rec.effort : ''); card.appendChild(meta);
      if (rec.impact) { var imp = document.createElement('p'); imp.className = 'adp-rec-card__impact'; imp.textContent = rec.impact; card.appendChild(imp); }
      rightCol.appendChild(card);
    });
  }
  var dsEntries = [{ label: 'Missing Data', value: dataStats.missingData }, { label: 'Data Quality', value: dataStats.dataQuality }, { label: 'Traceability', value: dataStats.traceability }].filter(function(e) { return e.value !== undefined; }).map(function(e) { return { label: e.label, value: String(e.value) }; });
  if (dsEntries.length) { rightCol.appendChild(ndStatBlock(dsEntries)); }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Readiness 4-cell grid
  if (readiness.quality || readiness.standardization || readiness.integration || readiness.aiReadiness) {
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
  var projectSystems = b.projectSystems      || [];
  var archRecs       = b.archRecommendations || [];
  var archStats      = b.archStats           || {};
  var healthTimeline = b.healthTimeline      || [];

  var CCLS = { Connected: 'dae-conn--connected', Partial: 'dae-conn--partial', Disconnected: 'dae-conn--disconnected' };
  var HCLS = { Healthy: 'dae-health--healthy', 'Needs Attention': 'dae-health--attention', Pending: 'dae-health--pending', Critical: 'dae-health--critical' };
  var HICON = { Healthy: '◉', 'Needs Attention': '◈', Pending: '◷', Critical: '◎' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  if (archStats.architectureReadiness) { wrap.appendChild(ndBadge('ARCHITECTURE HEALTH: ' + archStats.architectureReadiness + '% HEALTHY')); }
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = ndBody(2);

  // LEFT: project system cards
  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('Project Systems'));
  projectSystems.forEach(function(sys) {
    var card = document.createElement('div'); card.className = 'dae-sys-card ' + (CCLS[sys.connectionStatus] || 'dae-conn--disconnected');
    var name = document.createElement('p'); name.className = 'dae-sys-card__name'; name.textContent = sys.name; card.appendChild(name);
    var conn = document.createElement('p'); conn.className = 'dae-sys-card__conn'; conn.textContent = 'Connection: ' + (sys.connectionStatus || 'Unknown'); card.appendChild(conn);
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // RIGHT: network hub diagram + recs
  var rightCol = ndCol();
  if (projectSystems.length) {
    rightCol.appendChild(ndLbl('Data Architecture Network'));
    var netDiag = document.createElement('div'); netDiag.className = 'dae-net-diagram';
    var topRow = document.createElement('div'); topRow.className = 'dae-net-row';
    projectSystems.slice(0, 4).forEach(function(sys) {
      var node = document.createElement('div'); node.className = 'dae-net-node ' + (CCLS[sys.connectionStatus] || 'dae-conn--disconnected');
      node.textContent = sys.name; topRow.appendChild(node);
    });
    netDiag.appendChild(topRow);
    var arrows = document.createElement('div'); arrows.className = 'dae-net-arrows';
    projectSystems.slice(0, 4).forEach(function() {
      var a = document.createElement('div'); a.className = 'dae-net-arrow'; a.textContent = '↓'; arrows.appendChild(a);
    });
    netDiag.appendChild(arrows);
    var hub = document.createElement('div'); hub.className = 'dae-net-hub'; hub.textContent = '⬡  AI Data Hub'; netDiag.appendChild(hub);
    var legend = document.createElement('div'); legend.className = 'dae-net-legend';
    [{ cls: 'dae-conn--connected', label: 'Healthy' }, { cls: 'dae-conn--partial', label: 'Limited' }, { cls: 'dae-conn--disconnected', label: 'Missing' }].forEach(function(leg) {
      var dot = document.createElement('span'); dot.className = 'dae-net-legend__dot ' + leg.cls;
      var lbl = document.createElement('span'); lbl.className = 'dae-net-legend__lbl'; lbl.textContent = leg.label;
      legend.appendChild(dot); legend.appendChild(lbl);
    });
    netDiag.appendChild(legend);
    rightCol.appendChild(netDiag);
  }
  if (archRecs.length) {
    rightCol.appendChild(ndLbl('AI Recommendations'));
    var ICLS = { High: 'nd-pri--high', Medium: 'nd-pri--medium', Low: 'nd-pri--low' };
    archRecs.forEach(function(rec) {
      var card = document.createElement('div'); card.className = 'dae-rec-card';
      var title = document.createElement('p'); title.className = 'dae-rec-card__title'; title.textContent = rec.title || ''; card.appendChild(title);
      var meta = document.createElement('p'); meta.className = 'dae-rec-card__meta'; meta.innerHTML = 'Impact: <span class="nd-pri ' + (ICLS[rec.impact] || 'nd-pri--medium') + '">' + (rec.impact || '') + '</span>' + (rec.effort ? '  ·  Effort: <strong>' + rec.effort + '</strong>' : ''); card.appendChild(meta);
      rightCol.appendChild(card);
    });
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Stats bar
  if (archStats.architectureReadiness || archStats.automation || archStats.connectedSystems || archStats.disconnectedSystems) {
    wrap.appendChild(ndScoresBar([
      { value: (archStats.architectureReadiness || 0) + '%', label: 'Architecture Readiness' },
      { value: (archStats.automation || 0) + '%',            label: 'Automation' },
      { value: String(archStats.connectedSystems || 0),      label: 'Connected Systems' },
      { value: String(archStats.disconnectedSystems || 0),   label: 'Disconnected' },
    ]));
  }

  // Health timeline
  if (healthTimeline.length) {
    wrap.appendChild(ndLbl('Architecture Health Timeline'));
    var timelineWrap = document.createElement('div'); timelineWrap.className = 'dae-timeline';
    healthTimeline.forEach(function(item) {
      var row = document.createElement('div'); row.className = 'dae-timeline-row';
      var icon = document.createElement('div'); icon.className = 'dae-timeline-row__icon ' + (HCLS[item.health] || 'dae-health--pending'); icon.textContent = HICON[item.health] || '◷'; row.appendChild(icon);
      var txt = document.createElement('div'); txt.className = 'dae-timeline-row__text';
      var stage = document.createElement('p'); stage.className = 'dae-timeline-row__stage'; stage.textContent = item.stage; txt.appendChild(stage);
      if (item.status) { var st = document.createElement('p'); st.className = 'dae-timeline-row__status'; st.textContent = item.status; txt.appendChild(st); }
      row.appendChild(txt);
      var pill = document.createElement('span'); pill.className = 'dae-health-pill ' + (HCLS[item.health] || 'dae-health--pending'); pill.textContent = item.health; row.appendChild(pill);
      timelineWrap.appendChild(row);
    });
    wrap.appendChild(timelineWrap);
  }
  return wrap;
}

// ── Technology Infrastructure: System Integration & Architecture ───────────────

function buildSystemIntegrationLayout(section) {
  var b                  = section.brief || {};
  var connectedSystems   = b.connectedSystems   || [];
  var integrationSummary = b.integrationSummary || {};

  var SCLS = { CONNECTED: 'sia-card--connected', PARTIAL: 'sia-card--partial', MISSING: 'sia-card--missing' };
  var SBADGE = { CONNECTED: 'nd-pri--low', PARTIAL: 'nd-pri--medium', MISSING: 'nd-pri--high' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  if (b.integrationReadiness) { wrap.appendChild(ndBadge('INTEGRATION READINESS: ' + b.integrationReadiness + '%')); }
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = ndBody(2);

  // LEFT: connected system cards (2-per-row grid)
  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('Connected Systems'));
  var sysGrid = document.createElement('div'); sysGrid.className = 'sia-sys-grid';
  connectedSystems.forEach(function(sys) {
    var status = String(sys.status || 'MISSING').toUpperCase();
    var card = document.createElement('div'); card.className = 'sia-sys-card ' + (SCLS[status] || 'sia-card--missing');
    var name = document.createElement('p'); name.className = 'sia-sys-card__name'; name.textContent = sys.name; card.appendChild(name);
    if (sys.integrationMethod) { var method = document.createElement('p'); method.className = 'sia-sys-card__method'; method.textContent = sys.integrationMethod; card.appendChild(method); }
    var badge = document.createElement('span'); badge.className = 'sia-status nd-pri ' + (SBADGE[status] || 'nd-pri--medium'); badge.textContent = status; card.appendChild(badge);
    if (sys.healthIndicator) { var health = document.createElement('span'); health.className = 'sia-health'; health.textContent = sys.healthIndicator; card.appendChild(health); }
    sysGrid.appendChild(card);
  });
  leftCol.appendChild(sysGrid);
  body.appendChild(leftCol);

  // RIGHT: integration architecture visual (hub+spoke DOM)
  var rightCol = ndCol();
  rightCol.appendChild(ndLbl('AI Integration Architecture'));
  var archPanel = document.createElement('div'); archPanel.className = 'sia-arch-panel';
  var spokeRow = document.createElement('div'); spokeRow.className = 'sia-spoke-row';
  connectedSystems.slice(0, 4).forEach(function(sys) {
    var status = String(sys.status || 'MISSING').toUpperCase();
    var node = document.createElement('div'); node.className = 'sia-spoke-node sia-spoke-node--' + status.toLowerCase();
    var icon = document.createElement('span'); icon.className = 'sia-spoke-node__icon'; icon.textContent = '▣';
    var lbl = document.createElement('span'); lbl.className = 'sia-spoke-node__name'; lbl.textContent = sys.name;
    node.appendChild(icon); node.appendChild(lbl); spokeRow.appendChild(node);
  });
  archPanel.appendChild(spokeRow);
  var connectors = document.createElement('div'); connectors.className = 'sia-connectors';
  connectedSystems.slice(0, 4).forEach(function() { var c = document.createElement('div'); c.className = 'sia-connector-line'; connectors.appendChild(c); });
  archPanel.appendChild(connectors);
  var hub = document.createElement('div'); hub.className = 'sia-hub'; hub.textContent = 'AI Integration Hub'; archPanel.appendChild(hub);
  rightCol.appendChild(archPanel);
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Integration summary 4-cell grid
  var hasSummary = integrationSummary.integration || integrationSummary.automation || integrationSummary.reliability || integrationSummary.scalability;
  if (hasSummary) {
    wrap.appendChild(ndSummaryGrid([
      { label: 'Integration', value: integrationSummary.integration },
      { label: 'Automation',  value: integrationSummary.automation },
      { label: 'Reliability', value: integrationSummary.reliability },
      { label: 'Scalability', value: integrationSummary.scalability },
    ]));
  }
  return wrap;
}

// ── Technology Infrastructure: AI Platform Readiness ──────────────────────────

function buildAIPlatformReadinessLayout(section) {
  var b                    = section.brief || {};
  var capabilityAssessment = b.capabilityAssessment    || [];
  var platformStack        = b.platformStack           || [];
  var platformRecs         = b.platformRecommendations || [];
  var platformSummary      = b.platformSummary         || {};

  var SICON = { 'AI Applications': '⊞', 'AI Model & Prompt Management': '⚙', 'Knowledge & Retrieval Services': '◻', 'AI Deployment & Automation': '▷', 'AI Monitoring & Evaluation': '△', 'AI Development Environment': '⌨' };
  var SCLS = { READY: 'apr-status--ready', PARTIAL: 'apr-status--partial', MISSING: 'apr-status--missing' };
  var SBADGE = { READY: 'nd-pri--low', PARTIAL: 'nd-pri--medium', MISSING: 'nd-pri--high' };
  var PCLS = { HIGH: 'nd-pri--high', MEDIUM: 'nd-pri--medium', LOW: 'nd-pri--low' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  if (b.platformReadiness) { wrap.appendChild(ndBadge('PLATFORM READINESS: ' + b.platformReadiness + '%')); }
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = ndBody(3);

  // LEFT: capability assessment cards
  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('Platform Capability Assessment'));
  capabilityAssessment.forEach(function(cap) {
    var status = String(cap.status || 'PARTIAL').toUpperCase();
    var card = document.createElement('div'); card.className = 'apr-cap-card apr-cap-card--' + status.toLowerCase();
    var name = document.createElement('p'); name.className = 'apr-cap-card__name'; name.textContent = cap.name; card.appendChild(name);
    var score = document.createElement('p'); score.className = 'apr-cap-card__score'; score.textContent = (cap.score || 0) + '%'; card.appendChild(score);
    var badge = document.createElement('span'); badge.className = 'apr-status nd-pri ' + (SBADGE[status] || 'nd-pri--medium'); badge.textContent = status; card.appendChild(badge);
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // CENTER: platform stack rows
  var centerCol = ndCol();
  centerCol.appendChild(ndLbl('AI Platform Stack'));
  var stackList = document.createElement('div'); stackList.className = 'apr-stack-list';
  platformStack.forEach(function(layer) {
    var status = String(layer.status || 'MISSING').toUpperCase();
    var row = document.createElement('div'); row.className = 'apr-stack-row apr-stack-row--' + status.toLowerCase();
    var icon = document.createElement('div'); icon.className = 'apr-stack-row__icon'; icon.textContent = SICON[layer.layer] || '●'; row.appendChild(icon);
    var info = document.createElement('div'); info.className = 'apr-stack-row__info';
    var lname = document.createElement('p'); lname.className = 'apr-stack-row__name'; lname.textContent = layer.layer; info.appendChild(lname);
    var lscore = document.createElement('p'); lscore.className = 'apr-stack-row__score'; lscore.textContent = (layer.score || 0) + '%'; info.appendChild(lscore);
    row.appendChild(info);
    var badge = document.createElement('span'); badge.className = 'apr-status nd-pri ' + (SCLS[status] || 'apr-status--missing'); badge.textContent = status; row.appendChild(badge);
    stackList.appendChild(row);
  });
  centerCol.appendChild(stackList);
  body.appendChild(centerCol);

  // RIGHT: recommendations
  var rightCol = ndCol();
  if (platformRecs.length) {
    rightCol.appendChild(ndLbl('AI Recommendations'));
    rightCol.appendChild(ndRecList(platformRecs, function(r) { return { text: r.text, priority: r.priority, sub: r.benefit ? 'Benefit: ' + r.benefit : '' }; }));
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Platform summary 4-cell grid
  if (platformSummary.development || platformSummary.knowledge || platformSummary.deployment || platformSummary.monitoring) {
    wrap.appendChild(ndSummaryGrid([
      { label: 'Development', value: platformSummary.development },
      { label: 'Knowledge',   value: platformSummary.knowledge },
      { label: 'Deployment',  value: platformSummary.deployment },
      { label: 'Monitoring',  value: platformSummary.monitoring },
    ]));
  }
  return wrap;
}

// ── Technology Infrastructure: AI Compute & Deployment Strategy ───────────────

function buildAIComputeDeploymentLayout(section) {
  var b                  = section.brief || {};
  var workloadProfile    = b.workloadProfile          || [];
  var deploymentRecs     = b.deploymentRecommendations || [];
  var deploymentScores   = b.deploymentScores         || {};
  var deploymentKpis     = b.deploymentKpis           || {};

  var PCLS  = { CRITICAL: 'nd-pri--high', HIGH: 'nd-pri--high', MEDIUM: 'nd-pri--medium', LOW: 'nd-pri--low' };
  var ICLS  = { High: 'nd-pri--high', Medium: 'nd-pri--medium', Low: 'nd-pri--low' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  if (b.deploymentReadiness) { wrap.appendChild(ndBadge('DEPLOYMENT READINESS: ' + b.deploymentReadiness + '%')); }
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = ndBody(2);

  // LEFT: workload profile cards
  var leftCol = ndCol();
  leftCol.appendChild(ndLbl('AI Workload Profile'));
  workloadProfile.forEach(function(wl) {
    var card = document.createElement('div'); card.className = 'cds-wl-card';
    var name = document.createElement('p'); name.className = 'cds-wl-card__name'; name.textContent = wl.workloadType; card.appendChild(name);
    [['Compute', wl.computeRequirement], ['Performance', wl.performanceRequirement], ['Scalability', wl.scalabilityRequirement]].forEach(function(pair) {
      if (!pair[1]) return;
      var spec = document.createElement('p'); spec.className = 'cds-wl-card__spec'; spec.innerHTML = '<span class="cds-wl-card__spec-label">' + pair[0] + ':</span> ' + pair[1]; card.appendChild(spec);
    });
    var priK = String(wl.priority || 'MEDIUM').toUpperCase();
    var badge = document.createElement('span'); badge.className = 'nd-pri ' + (PCLS[priK] || 'nd-pri--medium'); badge.textContent = 'PRIORITY: ' + (wl.priority || 'MEDIUM'); card.appendChild(badge);
    leftCol.appendChild(card);
  });
  body.appendChild(leftCol);

  // RIGHT: deployment canvas (4-node hub) + rec cards
  var rightCol = ndCol();
  rightCol.appendChild(ndLbl('Deployment Decision Canvas'));
  var canvas = document.createElement('div'); canvas.className = 'cds-canvas';
  var canvasNodes = document.createElement('div'); canvasNodes.className = 'cds-canvas__nodes';
  [{ label: 'Public Cloud', sub: 'Cloud Native' }, { label: 'Private Cloud', sub: 'On-Premise' }, { label: 'Hybrid Cloud', sub: 'Mixed' }, { label: 'Edge Deployment', sub: 'Distributed' }].forEach(function(n) {
    var node = document.createElement('div'); node.className = 'cds-canvas__node';
    var nl = document.createElement('p'); nl.className = 'cds-canvas__node-label'; nl.textContent = n.label; node.appendChild(nl);
    var ns = document.createElement('p'); ns.className = 'cds-canvas__node-sub'; ns.textContent = n.sub; node.appendChild(ns);
    canvasNodes.appendChild(node);
  });
  var canvasHub = document.createElement('div'); canvasHub.className = 'cds-canvas__hub';
  canvasHub.innerHTML = '<p class="cds-canvas__hub-label">AI Decision</p><p class="cds-canvas__hub-sub">Engine</p>';
  if (deploymentScores.deploymentConfidence) { canvasHub.innerHTML += '<p class="cds-canvas__hub-conf">Confidence: ' + deploymentScores.deploymentConfidence + '%</p>'; }
  canvas.appendChild(canvasHub); canvas.appendChild(canvasNodes); rightCol.appendChild(canvas);
  if (deploymentRecs.length) {
    rightCol.appendChild(ndLbl('AI Recommendations'));
    var recGrid = document.createElement('div'); recGrid.className = 'cds-rec-grid';
    deploymentRecs.forEach(function(rec) {
      var card = document.createElement('div'); card.className = 'cds-rec-card';
      var txt = document.createElement('p'); txt.className = 'cds-rec-card__text'; txt.textContent = rec.text; card.appendChild(txt);
      var impact = document.createElement('div'); impact.className = 'cds-rec-card__impact-row';
      impact.innerHTML = 'Impact: <span class="nd-pri ' + (ICLS[rec.impact] || 'nd-pri--medium') + '">' + (rec.impact || 'Medium') + '</span>'; card.appendChild(impact);
      if (rec.reason) { var reason = document.createElement('p'); reason.className = 'cds-rec-card__reason'; reason.textContent = rec.reason; card.appendChild(reason); }
      recGrid.appendChild(card);
    });
    rightCol.appendChild(recGrid);
  }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Scores bar
  if (deploymentScores.computeFit || deploymentScores.deploymentConfidence || deploymentScores.estimatedScalability) {
    wrap.appendChild(ndScoresBar([
      { value: (deploymentScores.computeFit || 0) + '%',             label: 'Compute Fit' },
      { value: deploymentScores.estimatedScalability || '—',         label: 'Est. Scalability' },
      { value: (deploymentScores.deploymentConfidence || 0) + '%',   label: 'Deployment Confidence' },
    ]));
  }

  // KPI bar
  var kpiItems = [{ label: 'Compute', value: deploymentKpis.compute }, { label: 'Deployment', value: deploymentKpis.deployment }, { label: 'Latency', value: deploymentKpis.latency }, { label: 'Scalability', value: deploymentKpis.scalability }].filter(function(k) { return k.value; });
  if (kpiItems.length) {
    var kpiLbl = document.createElement('p'); kpiLbl.className = 'brief-label'; kpiLbl.textContent = 'Deployment Summary KPIs'; wrap.appendChild(kpiLbl);
    wrap.appendChild(ndSummaryGrid(kpiItems.map(function(k) { return { label: k.label, value: k.value }; })));
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

  if (b.arcpConsultantGuidance) { wrap.appendChild(buildConsultantGuidanceBlock(b.arcpConsultantGuidance)); }
  if (b.arcpAIRecommendation)   { wrap.appendChild(buildAIRecommendationBlock(b.arcpAIRecommendation)); }
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
  var b               = section.brief || {};
  var learningPillars = b.learningPillars          || [];
  var adoptionLifecycle = b.adoptionLifecycle       || [];
  var adoptionRecs    = b.adoptionRecommendations   || [];
  var adoptionStats   = b.adoptionStats             || {};
  var adoptionSummary = b.adoptionReadinessSummary  || [];

  var PILLAR_CLS = { Ready: 'ala-pillar--ready', 'In Progress': 'ala-pillar--progress', 'Not Started': 'ala-pillar--notstarted' };
  var PCLS       = { High: 'nd-pri--high', Medium: 'nd-pri--medium', Low: 'nd-pri--low' };
  var SUMCLS     = { Ready: 'ala-sum--ready', 'In Progress': 'ala-sum--progress', Emerging: 'ala-sum--emerging', Developing: 'ala-sum--developing' };

  var wrap = document.createElement('div'); wrap.className = 'new-domain-layout';
  if (b.adoptionReadiness) { wrap.appendChild(ndBadge('ADOPTION READINESS: ' + b.adoptionReadiness + '%')); }
  wrap.appendChild(buildStrategicPositionBlock(b.strategicPosition));

  var body = ndBody(3);

  // LEFT: learning pillar cards
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

  // CENTER: adoption lifecycle stages with readiness bars
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

  // RIGHT: recommendations + stats
  var rightCol = ndCol();
  if (adoptionRecs.length) {
    rightCol.appendChild(ndLbl('AI Recommendations'));
    rightCol.appendChild(ndRecList(adoptionRecs, function(r) { return { text: r.title, priority: r.priority, sub: r.expectedOutcome }; }));
  }
  var statsEntries = [{ label: 'Teams Trained', value: adoptionStats.teamsTrained }, { label: 'Tools Adopted', value: adoptionStats.toolsAdopted }, { label: 'Adoption Rate', value: adoptionStats.adoptionRate }].filter(function(e) { return e.value !== undefined && e.value !== null && e.value !== ''; }).map(function(e) { return { label: e.label, value: String(e.value) }; });
  if (statsEntries.length) { rightCol.appendChild(ndStatBlock(statsEntries)); }
  body.appendChild(rightCol);
  wrap.appendChild(body);

  // Adoption readiness summary grid
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
