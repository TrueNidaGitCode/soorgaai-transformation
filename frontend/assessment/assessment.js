/**
 * SoorgaAI — Assessment Form Logic
 *
 * Steps:
 *   0       → Organisation context (name, industry, size)
 *   1–7     → One domain per step (5 questions each)
 *   8       → Review + Submit
 */

// ── State ─────────────────────────────────────────────────
let domains    = [];          // loaded from API
let answers    = {};          // { questionId: value }
let orgContext = { orgName: '', orgSize: '', industry: '' };
let currentStep = 0;
const TOTAL_DOMAIN_STEPS = 7;
const TOTAL_STEPS = TOTAL_DOMAIN_STEPS + 2; // 0 = context, 1-7 = domains, 8 = review

// ── Auth guard ────────────────────────────────────────────
(function guardAuth() {
    if (!window.CONFIG?.isLoggedIn()) {
        localStorage.setItem('redirectAfterLogin', window.location.href);
        window.location.href = '/login/login.html';
    }
})();

// ── Restore progress from localStorage ───────────────────
function saveProgress() {
    localStorage.setItem('soorga_assessment_progress', JSON.stringify({ answers, orgContext, currentStep }));
}

function loadProgress() {
    try {
        const saved = localStorage.getItem('soorga_assessment_progress');
        if (saved) {
            const data = JSON.parse(saved);
            answers     = data.answers     || {};
            orgContext  = data.orgContext  || orgContext;
            currentStep = data.currentStep || 0;
        }
    } catch { /* ignore */ }
}

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    loadProgress();
    await loadQuestions();
});

async function loadQuestions() {
    try {
        const res = await fetch(window.CONFIG.ASSESSMENT.QUESTIONS);
        if (!res.ok) throw new Error('Failed to load questions');
        const data = await res.json();
        domains = data.domains;

        hideLoading();
        renderStep(currentStep);
        buildStepDots();
    } catch (err) {
        console.error('❌ Failed to load questions:', err);
        showError('Failed to load assessment. Please refresh the page.');
        hideLoading();
    }
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('visible');
    document.getElementById('assessmentMain').style.display = 'block';
}

// ── Render dispatcher ─────────────────────────────────────
function renderStep(step) {
    updateProgress(step);
    updateNavButtons(step);
    clearError();

    if (step === 0)             renderContextStep();
    else if (step <= TOTAL_DOMAIN_STEPS) renderDomainStep(step - 1);
    else                        renderReviewStep();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Step 0: Org context ───────────────────────────────────
function renderContextStep() {
    document.getElementById('stepContent').innerHTML = `
        <div class="step-card context-step">
            <h2>👋 Before we begin…</h2>
            <p>Tell us a little about your organisation. This helps us personalise your AI Maturity Report.</p>

            <div class="form-group">
                <label>Organisation Name <span style="color:#666">(optional)</span></label>
                <input type="text" id="orgName" placeholder="e.g. Acme Corp"
                    value="${orgContext.orgName}" oninput="orgContext.orgName=this.value">
            </div>

            <div class="form-group">
                <label>Industry</label>
                <select id="industry" onchange="orgContext.industry=this.value">
                    <option value="" ${!orgContext.industry?'selected':''}>Select industry…</option>
                    ${['Financial Services','Healthcare','Manufacturing','Retail & E-Commerce',
                       'Technology & Software','Professional Services','Education',
                       'Government & Public Sector','Energy & Utilities','Other']
                      .map(i => `<option value="${i}" ${orgContext.industry===i?'selected':''}>${i}</option>`).join('')}
                </select>
            </div>

            <div class="form-group">
                <label>Organisation Size</label>
                <select id="orgSize" onchange="orgContext.orgSize=this.value">
                    <option value="" ${!orgContext.orgSize?'selected':''}>Select size…</option>
                    ${['1–50','51–200','201–1,000','1,001–5,000','5,000+']
                      .map(s => `<option value="${s}" ${orgContext.orgSize===s?'selected':''}>${s} employees</option>`).join('')}
                </select>
            </div>
        </div>`;
}

// ── Steps 1–7: Domain questions ───────────────────────────
function renderDomainStep(domainIndex) {
    const domain = domains[domainIndex];
    if (!domain) return;

    const questionsHTML = domain.questions.map((q, qi) => {
        const selectedValue = answers[q.id];
        const optionsHTML = q.options.map(opt => `
            <label class="option-label">
                <input type="radio" name="${q.id}" value="${opt.value}"
                    ${selectedValue == opt.value ? 'checked' : ''}
                    onchange="recordAnswer('${q.id}', ${opt.value})">
                <div class="option-card">
                    <div class="option-value">${opt.value}</div>
                    <div>${opt.label}</div>
                </div>
            </label>`).join('');

        return `
            <div class="question-block">
                <div class="question-number">Q${domainIndex * 5 + qi + 1} of 35</div>
                <div class="question-text">${q.text}</div>
                <div class="options-grid">${optionsHTML}</div>
            </div>`;
    }).join('');

    document.getElementById('stepContent').innerHTML = `
        <div class="step-card">
            <div class="domain-header">
                <div class="domain-icon">${domain.icon}</div>
                <div class="domain-title">${domain.name}</div>
            </div>
            <div class="domain-description">${domain.description}</div>
            ${questionsHTML}
        </div>`;
}

// ── Step 8: Review ────────────────────────────────────────
function renderReviewStep() {
    const rows = domains.map(domain => {
        const answered  = domain.questions.filter(q => answers[q.id] !== undefined).length;
        const complete  = answered === domain.questions.length;
        return `
            <div class="review-domain-row">
                <span class="review-domain-name">${domain.icon} ${domain.name}</span>
                <span class="review-answered ${complete ? 'complete' : 'incomplete'}">
                    ${answered}/${domain.questions.length} answered
                </span>
            </div>`;
    }).join('');

    const totalAnswered = Object.keys(answers).length;
    const allComplete   = totalAnswered === 35;

    document.getElementById('stepContent').innerHTML = `
        <div class="step-card">
            <div class="domain-header">
                <div class="domain-icon">📋</div>
                <div class="domain-title">Review & Submit</div>
            </div>
            <div class="domain-description">
                Check your answers below. You can go back to any domain to make changes.
                ${!allComplete ? `<br><strong style="color:#E74C3C">⚠️ ${35 - totalAnswered} question(s) still unanswered.</strong>` : ''}
            </div>
            <div class="review-summary">${rows}</div>
        </div>`;

    // Change Next button to Submit on last step
    const btn = document.getElementById('btnNext');
    if (allComplete) {
        btn.textContent = '✓ Submit Assessment';
        btn.disabled    = false;
    } else {
        btn.textContent = '✓ Submit Assessment';
        btn.disabled    = true;
    }
}

// ── Record answer ─────────────────────────────────────────
function recordAnswer(questionId, value) {
    answers[questionId] = Number(value);
    saveProgress();
}

// ── Navigation ────────────────────────────────────────────
function nextStep() {
    clearError();

    if (currentStep === 0) {
        // Context step — no required fields
        saveProgress();
        currentStep = 1;
        renderStep(currentStep);
        return;
    }

    if (currentStep >= 1 && currentStep <= TOTAL_DOMAIN_STEPS) {
        // Validate all 5 questions answered in this domain
        const domain = domains[currentStep - 1];
        const unanswered = domain.questions.filter(q => answers[q.id] === undefined);
        if (unanswered.length > 0) {
            showError(`Please answer all ${unanswered.length} remaining question(s) before continuing.`);
            return;
        }
        saveProgress();
        currentStep++;
        renderStep(currentStep);
        return;
    }

    // Step 8: Submit
    if (currentStep === TOTAL_STEPS - 1) {
        submitAssessment();
    }
}

function prevStep() {
    if (currentStep <= 0) return;
    clearError();
    currentStep--;
    renderStep(currentStep);
    saveProgress();
}

// ── Submit ────────────────────────────────────────────────
async function submitAssessment() {
    // Build answers array
    const answersArray = Object.entries(answers).map(([questionId, value]) => ({ questionId, value }));

    if (answersArray.length !== 35) {
        showError(`Please complete all 35 questions before submitting. (${answersArray.length}/35 answered)`);
        return;
    }

    // Show submitting overlay
    document.getElementById('submittingOverlay').classList.add('visible');
    document.getElementById('btnNext').disabled = true;

    try {
        const res = await fetch(window.CONFIG.ASSESSMENT.SUBMIT, {
            method: 'POST',
            headers: window.CONFIG.getHeader(),
            body: JSON.stringify({
                answers:  answersArray,
                orgName:  orgContext.orgName,
                orgSize:  orgContext.orgSize,
                industry: orgContext.industry,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Submission failed. Please try again.');
        }

        // Clear saved progress
        localStorage.removeItem('soorga_assessment_progress');

        // Redirect to results page
        window.location.href = `/results/results.html?id=${data.assessmentId}`;

    } catch (err) {
        document.getElementById('submittingOverlay').classList.remove('visible');
        document.getElementById('btnNext').disabled = false;
        showError(err.message || 'Submission failed. Please try again.');
    }
}

// ── Progress UI ───────────────────────────────────────────
function updateProgress(step) {
    const pct = Math.round((step / (TOTAL_STEPS - 1)) * 100);
    document.getElementById('progressFill').style.width    = pct + '%';
    document.getElementById('progressPercent').textContent = pct + '%';
    document.getElementById('progressLabel').textContent   =
        step === 0            ? 'Organisation Context' :
        step <= TOTAL_DOMAIN_STEPS ? `Domain ${step} of ${TOTAL_DOMAIN_STEPS}: ${domains[step-1]?.name || ''}` :
                               'Review & Submit';
    document.getElementById('stepCounter').textContent     = `Step ${step + 1} of ${TOTAL_STEPS}`;

    // Update dots
    document.querySelectorAll('.step-dot').forEach((dot, i) => {
        dot.className = 'step-dot' + (i < step ? ' completed' : i === step ? ' active' : '');
    });
}

function buildStepDots() {
    const container = document.getElementById('stepDots');
    container.innerHTML = Array.from({ length: TOTAL_STEPS }, (_, i) =>
        `<div class="step-dot" title="Step ${i + 1}" onclick="jumpToStep(${i})"></div>`
    ).join('');
}

function jumpToStep(step) {
    // Only allow jumping to already-visited steps
    if (step > currentStep) return;
    currentStep = step;
    renderStep(step);
}

function updateNavButtons(step) {
    document.getElementById('btnBack').style.visibility = step === 0 ? 'hidden' : 'visible';
    const btnNext = document.getElementById('btnNext');
    btnNext.disabled  = false;
    btnNext.textContent = step === TOTAL_STEPS - 1 ? '✓ Submit Assessment' : 'Next →';
}

// ── Error helpers ─────────────────────────────────────────
function showError(msg) {
    const el = document.getElementById('errorBanner');
    el.textContent = msg;
    el.classList.add('visible');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearError() {
    document.getElementById('errorBanner').classList.remove('visible');
}
