/**
 * Svarg — Results Dashboard
 *
 * Behaviour:
 *  1. Read ?id= from URL → fetch /api/assessment/results/:id
 *  2. Render score hero, domain bars
 *  3. If report exists → load and render it
 *  4. "Generate Report" button → POST /api/assessment/report/:id → render
 *  5. "Book Consultation" → open mailto / Calendly
 */

// ── Maturity stage colours ────────────────────────────────
const STAGE_COLORS = {
    'AI Scramble':          { bg: 'rgba(231,76,60,0.15)',  text: '#E74C3C', bar: '#E74C3C' },
    'AI Pivot':             { bg: 'rgba(230,126,34,0.15)', text: '#E67E22', bar: '#E67E22' },
    'AI Alignment':         { bg: 'rgba(241,196,15,0.15)', text: '#F1C40F', bar: '#F1C40F' },
    'AI Transform':         { bg: 'rgba(46,204,113,0.15)', text: '#2ECC71', bar: '#2ECC71' },
    'AI-Fueled Enterprise': { bg: 'rgba(52,152,219,0.15)', text: '#3498DB', bar: '#3498DB' },
};

const DOMAIN_ICONS = {
    'AI Strategy':              `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#5CC5A7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
    'Leadership':               `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 21V7l9-5 9 5v14"/><path d="M9 21v-5h6v5"/></svg>`,
    'AI Use Cases':             `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
    'Data Readiness':           `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
    'Technology Infrastructure':`<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M9 2v2M9 20v2M2 15h2M2 9h2M20 15h2M20 9h2"/></svg>`,
    'Skills & Workforce':       `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    'Governance & Security':    `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
};

// ── Auth guard ────────────────────────────────────────────
if (!window.CONFIG?.isLoggedIn()) {
    localStorage.setItem('redirectAfterLogin', window.location.href);
    window.location.href = '/login/login.html';
}

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const id     = params.get('id');

    if (id) {
        loadResults(id);
    } else {
        loadLatestAssessment();
    }
});

// ── Load results by ID ────────────────────────────────────
async function loadResults(id) {
    try {
        const res = await fetch(window.CONFIG.ASSESSMENT.RESULTS(id), {
            headers: window.CONFIG.getHeader(),
        });

        if (!res.ok) throw new Error('Results not found.');
        const data = await res.json();

        renderResults(data, id);

        // If report already generated, load it too
        if (data.reportGenerated && data.reportId) {
            loadExistingReport(id);
        }

    } catch (err) {
        renderError(err.message);
    }
}

// ── Load latest assessment (no ?id) ───────────────────────
async function loadLatestAssessment() {
    try {
        const res = await fetch(window.CONFIG.ASSESSMENT.MY_ASSESSMENTS, {
            headers: window.CONFIG.getHeader(),
        });

        if (!res.ok) throw new Error('No assessments found.');
        const data = await res.json();

        if (!data.assessments?.length) {
            renderNoAssessments();
            return;
        }

        const latest = data.assessments[0];
        window.history.replaceState(null, '', `?id=${latest._id}`);
        loadResults(latest._id);

    } catch (err) {
        renderError(err.message);
    }
}

// ── Render results page ───────────────────────────────────
function renderResults(data, assessmentId) {
    const stage  = data.maturityStage;
    const colors = STAGE_COLORS[stage] || STAGE_COLORS['AI Scramble'];
    const score  = data.overallScore;

    const domainBars = (data.domainScores || []).map(d => {
        const icon  = DOMAIN_ICONS[d.domainName] || '📊';
        const color = getBarColor(d.score);
        return `
            <div class="domain-card">
                <div class="domain-card-header">
                    <div class="domain-card-name">
                        <span class="domain-card-icon">${icon}</span>
                        <span>${d.domainName}</span>
                    </div>
                    <span class="domain-card-score">${d.score}</span>
                </div>
                <div class="domain-bar-track">
                    <div class="domain-bar-fill" style="width:${d.score}%; background:${color}"></div>
                </div>
            </div>`;
    }).join('');

    const orgLabel = data.orgName
        ? `<div class="org-label">📊 Results for <strong>${data.orgName}</strong>${data.industry ? ` · ${data.industry}` : ''}</div>`
        : '';

    document.getElementById('resultsContainer').innerHTML = `
        <!-- ── Score hero ── -->
        <div class="score-hero">
            ${orgLabel}
            <div class="score-ring-container">
                <div class="score-number">${score}</div>
                <div class="score-label">out of 100</div>
            </div>
            <div>
                <div class="maturity-badge" style="background:${colors.bg}; color:${colors.text}">
                    ${stage}
                </div>
            </div>
            <p class="stage-description">${data.maturityStageDetails?.description || ''}</p>
        </div>

        <!-- ── Domain breakdown ── -->
        <div class="section-title">📊 Domain Breakdown</div>
        <div class="domains-grid" id="domainsGrid">${domainBars}</div>

        <!-- ── AI Report ── -->
        <div class="report-section" id="reportSection">
            <div class="section-title">🤖 AI Maturity Report</div>

            <div id="reportGenerateCard" class="report-generate-card" ${data.reportGenerated ? 'style="display:none"' : ''}>
                <h3>Get Your Custom AI Transformation Report</h3>
                <p>Our AI analyses your scores and generates a personalised report — including your key strengths, critical gaps, top 3 priorities, a 90-day action plan, and a 12-month roadmap.</p>
                <button class="btn-primary" id="generateReportBtn" onclick="generateReport('${assessmentId}')">
                    ✨ Generate My Report
                </button>
            </div>

            <div id="reportContent" class="report-content ${data.reportGenerated ? 'visible' : ''}">
                <div id="reportBlocks"></div>
            </div>
        </div>

        <!-- ── Consultation CTA ── -->
        <div class="consultation-cta" id="consultationCta" style="display:none">
            <h2>Ready to Accelerate Your AI Transformation?</h2>
            <p>Book a 1-on-1 advisory session with a Svarg expert to turn your roadmap into a real transformation programme.</p>
            <div class="cta-buttons">
                <button class="btn-primary" onclick="bookConsultation()">📅 Book a Consultation</button>
                <button class="btn-secondary" onclick="window.location.href='/assessment/assessment.html'">🔄 Retake Assessment</button>
            </div>
        </div>

        <!-- ── Retake ── -->
        <div class="retake-row" id="retakeRow">
            <button class="btn-secondary" onclick="window.location.href='/assessment/assessment.html'">
                ← Take a New Assessment
            </button>
        </div>
    `;
}

// ── Load existing report ──────────────────────────────────
async function loadExistingReport(assessmentId) {
    try {
        const res = await fetch(window.CONFIG.ASSESSMENT.GET_REPORT(assessmentId), {
            headers: window.CONFIG.getHeader(),
        });
        if (!res.ok) return;
        const data = await res.json();
        renderReport(data.report);
    } catch { /* silent */ }
}

// ── Generate report ───────────────────────────────────────
async function generateReport(assessmentId) {
    document.getElementById('generatingOverlay').classList.add('visible');
    const btn = document.getElementById('generateReportBtn');
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(window.CONFIG.ASSESSMENT.GEN_REPORT(assessmentId), {
            method: 'POST',
            headers: window.CONFIG.getHeader(),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Report generation failed.');
        }

        const data = await res.json();

        document.getElementById('reportGenerateCard').style.display = 'none';
        document.getElementById('reportContent').classList.add('visible');
        renderReport(data.report);

    } catch (err) {
        alert('❌ ' + (err.message || 'Report generation failed. Please try again.'));
        if (btn) btn.disabled = false;
    } finally {
        document.getElementById('generatingOverlay').classList.remove('visible');
    }
}

// ── Render report blocks ──────────────────────────────────
function renderReport(report) {
    const container = document.getElementById('reportBlocks');
    if (!container || !report) return;

    // Executive summary
    const summaryHTML = `
        <div class="report-block">
            <h3>📋 Executive Summary</h3>
            <p>${report.executiveSummary}</p>
        </div>`;

    // Strengths
    const strengthsHTML = `
        <div class="report-block">
            <h3>💪 Key Strengths</h3>
            <ul class="report-list">
                ${(report.strengths || []).map(s => `<li>${s}</li>`).join('')}
            </ul>
        </div>`;

    // Critical gaps
    const gapsHTML = `
        <div class="report-block">
            <h3>⚠️ Critical Gaps</h3>
            <ul class="report-list">
                ${(report.criticalGaps || []).map(g => `<li>${g}</li>`).join('')}
            </ul>
        </div>`;

    // Top priorities
    const prioritiesHTML = `
        <div class="report-block">
            <h3>🎯 Top 3 Priorities</h3>
            <ul class="report-list">
                ${(report.topPriorities || []).map(p => `<li>${p}</li>`).join('')}
            </ul>
        </div>`;

    // 90-day roadmap
    const roadmap90HTML = `
        <div class="report-block">
            <h3>🗓️ 90-Day Action Plan</h3>
            <div class="roadmap-grid">
                ${(report.roadmap90Days || []).map(item => `
                    <div class="roadmap-item">
                        <span class="priority-badge priority-${item.priority?.toLowerCase()}">${item.priority}</span>
                        <h4>${item.title}</h4>
                        <p>${item.description}</p>
                        ${item.domain ? `<div class="domain-tag">📍 ${item.domain}</div>` : ''}
                    </div>`).join('')}
            </div>
        </div>`;

    // 12-month roadmap
    const roadmap12HTML = `
        <div class="report-block">
            <h3>🚀 12-Month Transformation Roadmap</h3>
            <div class="roadmap-grid">
                ${(report.roadmap12Months || []).map(item => `
                    <div class="roadmap-item">
                        <span class="priority-badge priority-${item.priority?.toLowerCase()}">${item.priority}</span>
                        <h4>${item.title}</h4>
                        <p>${item.description}</p>
                        ${item.domain ? `<div class="domain-tag">📍 ${item.domain}</div>` : ''}
                    </div>`).join('')}
            </div>
        </div>`;

    container.innerHTML = summaryHTML + strengthsHTML + gapsHTML + prioritiesHTML + roadmap90HTML + roadmap12HTML;

    // Show consultation CTA after report renders
    const cta = document.getElementById('consultationCta');
    if (cta) cta.style.display = 'block';
}

// ── No assessments state ──────────────────────────────────
function renderNoAssessments() {
    document.getElementById('resultsContainer').innerHTML = `
        <div class="error-state">
            <h2>No assessments yet</h2>
            <p>You haven't completed an AI Maturity Assessment yet. Take the assessment to see your results here.</p>
            <button class="btn-primary" onclick="window.location.href='/assessment/assessment.html'">
                → Start Assessment
            </button>
        </div>`;
}

// ── Error state ───────────────────────────────────────────
function renderError(message) {
    document.getElementById('resultsContainer').innerHTML = `
        <div class="error-state">
            <h2>Something went wrong</h2>
            <p>${message || 'Failed to load results. Please try again.'}</p>
            <button class="btn-primary" onclick="window.history.back()">← Go Back</button>
        </div>`;
}

// ── Consultation booking ──────────────────────────────────
function bookConsultation() {
    // Replace with Calendly URL or contact page when available
    const email = 'advisory@soorgaai.com';
    const subject = encodeURIComponent('Svarg Advisory Consultation Request');
    const body = encodeURIComponent(
        `Hi Svarg team,\n\nI've completed the AI Maturity Assessment and would like to book an advisory consultation.\n\nPlease let me know your available slots.\n\nThank you!`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
}

// ── Colour helper ─────────────────────────────────────────
function getBarColor(score) {
    if (score >= 80) return '#3498DB';
    if (score >= 60) return '#2ECC71';
    if (score >= 40) return '#F1C40F';
    if (score >= 20) return '#E67E22';
    return '#E74C3C';
}
