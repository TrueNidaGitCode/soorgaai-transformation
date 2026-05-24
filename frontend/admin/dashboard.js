/**
 * ============================================
 * ADMIN DASHBOARD
 * ============================================
 */

// Global state for editing
let currentEditingSignalId = null;

// Auth check on page load
document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ Admin dashboard loading...");

    // Verify admin access
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (!token || role !== 'admin') {
        console.error('❌ Unauthorized access to admin dashboard');
        localStorage.setItem('redirectAfterLogin', '/admin/dashboard.html');
        window.location.href = '/admin/login.html';
        return;
    }

    console.log('✅ Admin access verified');

    // Setup form handler
    const signalForm = document.getElementById('signal-form');
    signalForm.addEventListener('submit', handleSignalSubmit);

    // Load existing signals
    loadSignals();

    console.log('✅ Admin dashboard initialized');
});

/**
 * Handle signal creation or update
 */
async function handleSignalSubmit(event) {
    event.preventDefault();

    // Get form data
    const signalType = document.getElementById('signalType').value;
    const formData = {
        signalId: document.getElementById('signalId').value.trim(),
        title: document.getElementById('title').value.trim(),
        category: document.getElementById('category').value,
        timeHorizon: document.getElementById('timeHorizon').value,
        institutionalEvidence: document.getElementById('institutionalEvidence').value.trim(),
        interpretation: document.getElementById('interpretation').value.trim(),
        cityImpact: document.getElementById('cityImpact').value.trim(),
        narrativeSeed: document.getElementById('narrativeSeed').value.trim(),
        status: document.querySelector('input[name="status"]:checked').value,
        signalType: signalType
    };

    // Add trending fields
    if (signalType === 'trending') {
        formData.trendingScore = parseInt(document.getElementById('trendingScore').value) || 75;
        formData.discussionIntensity = document.getElementById('discussionIntensity').value.trim();
        formData.whyTrending = document.getElementById('whyTrending').value.trim();
    }

    // Add early fields
    if (signalType === 'early') {
        formData.earlyScore = parseInt(document.getElementById('earlyScore').value) || 75;
        formData.coverageLevel = document.getElementById('coverageLevel').value;
        formData.timingAdvantage = document.getElementById('timingAdvantage').value.trim();
        formData.whatHappened = document.getElementById('whatHappened').value.trim();
    }

    // Add common featured fields
    if (signalType === 'trending' || signalType === 'early') {
        formData.postReadyHeadline = document.getElementById('postReadyHeadline').value.trim();
        formData.statusBadge = document.getElementById('statusBadge').value.trim();
    }

    // Validate
    if (!validateForm(formData)) {
        return;
    }

    // Show loading state
    setSubmitLoading(true);
    hideMessage();

    try {
        const token = localStorage.getItem('token');
        const isEditing = currentEditingSignalId !== null;

        let endpoint, method, successMessage;

        if (isEditing) {
            endpoint = window.CONFIG?.ADMIN?.UPDATE_SIGNAL?.(currentEditingSignalId);
            method = 'PUT';
            successMessage = 'Signal updated successfully!';
            console.log(`📡 Updating signal: ${currentEditingSignalId}`);
        } else {
            endpoint = window.CONFIG?.ADMIN?.CREATE_SIGNAL;
            method = 'POST';
            successMessage = 'Signal created successfully!';
            console.log(`📡 Creating signal: ${formData.signalId}`);
        }

        console.log(`🔗 Endpoint: ${endpoint}`);

        const response = await fetch(endpoint, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'create'} signal`);
        }

        console.log(`✅ Signal ${isEditing ? 'updated' : 'created'} successfully:`, data);
        showSuccess(successMessage);

        // Reset form and reload signals after delay
        setTimeout(() => {
            resetForm();
            loadSignals();
        }, 2000);

    } catch (error) {
        console.error(`❌ Error ${currentEditingSignalId ? 'updating' : 'creating'} signal:`, error);
        showError(error.message || `Failed to ${currentEditingSignalId ? 'update' : 'create'} signal. Please try again.`);
    } finally {
        setSubmitLoading(false);
    }
}

/**
 * Form validation
 */
function validateForm(data) {
    const requiredFields = [
        'signalId', 'title', 'category', 'timeHorizon',
        'institutionalEvidence', 'interpretation', 'cityImpact', 'narrativeSeed'
    ];

    for (const field of requiredFields) {
        if (!data[field] || data[field].trim() === '') {
            showError(`Please fill in: ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
            return false;
        }
    }

    // Validate signalId format (lowercase, numbers, hyphens only)
    const signalIdPattern = /^[a-z0-9-]+$/;
    if (!signalIdPattern.test(data.signalId)) {
        showError('Signal ID must contain only lowercase letters, numbers, and hyphens');
        return false;
    }

    return true;
}

/**
 * Reset form
 */
function resetForm() {
    document.getElementById('signal-form').reset();
    currentEditingSignalId = null;
    updateFormMode();
    hideMessage();
    console.log('✅ Form reset');
}

/**
 * Update form mode (Create vs Edit)
 */
function updateFormMode() {
    const submitBtn = document.getElementById('submit-btn');
    const buttonText = submitBtn.querySelector('.button-text');
    const panelHeader = document.querySelector('.admin-panel .panel-header h2');

    if (currentEditingSignalId) {
        buttonText.textContent = 'Update Signal';
        panelHeader.textContent = 'Edit Signal';
        document.getElementById('signalId').disabled = true;
    } else {
        buttonText.textContent = 'Create Signal';
        panelHeader.textContent = 'Create New Signal';
        document.getElementById('signalId').disabled = false;
    }
}

/**
 * Set submit button loading state
 */
function setSubmitLoading(isLoading) {
    const submitBtn = document.getElementById('submit-btn');
    const buttonText = submitBtn.querySelector('.button-text');
    const buttonLoader = submitBtn.querySelector('.button-loader');

    if (isLoading) {
        submitBtn.disabled = true;
        buttonText.style.display = 'none';
        buttonLoader.style.display = 'flex';
    } else {
        submitBtn.disabled = false;
        buttonText.style.display = 'flex';
        buttonLoader.style.display = 'none';
    }
}

/**
 * Show success message
 */
function showSuccess(message) {
    const messageEl = document.getElementById('form-message');
    messageEl.textContent = message;
    messageEl.className = 'form-message success';
    messageEl.style.display = 'block';

    // Auto-hide after 4 seconds with fade-out animation
    setTimeout(() => {
        messageEl.classList.add('fade-out');
        setTimeout(hideMessage, 300); // Wait for animation to complete
    }, 4000);
}

/**
 * Show error message
 */
function showError(message) {
    const messageEl = document.getElementById('form-message');
    messageEl.textContent = message;
    messageEl.className = 'form-message error';
    messageEl.style.display = 'block';

    // Auto-hide error after 6 seconds (longer than success for user to read)
    setTimeout(() => {
        messageEl.classList.add('fade-out');
        setTimeout(hideMessage, 300);
    }, 6000);
}

/**
 * Hide message
 */
function hideMessage() {
    const messageEl = document.getElementById('form-message');
    if (messageEl) {
        messageEl.style.display = 'none';
        messageEl.className = 'form-message'; // Reset classes
    }
}

/**
 * Load all signals
 */
async function loadSignals() {
    const loadingEl = document.getElementById('signals-loading');
    const emptyEl = document.getElementById('signals-empty');
    const listEl = document.getElementById('signals-list');

    // Show loading state
    loadingEl.style.display = 'flex';
    emptyEl.style.display = 'none';
    listEl.innerHTML = '';

    try {
        const token = localStorage.getItem('token');
        const endpoint = window.CONFIG?.ADMIN?.GET_ALL_SIGNALS;

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load signals');
        }

        const signals = data.signals || [];

        console.log(`✅ Loaded ${signals.length} signals`);

        if (signals.length === 0) {
            loadingEl.style.display = 'none';
            emptyEl.style.display = 'block';
        } else {
            loadingEl.style.display = 'none';
            displaySignals(signals);
        }

    } catch (error) {
        console.error('❌ Error loading signals:', error);
        loadingEl.style.display = 'none';
        listEl.innerHTML = `<p style="color: #ff6b6b; text-align: center; padding: 20px;">Error loading signals: ${error.message}</p>`;
    }
}

/**
 * Display signals in the list
 */
function displaySignals(signals) {
    const listEl = document.getElementById('signals-list');
    listEl.innerHTML = '';

    // Sort by creation date (newest first)
    signals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    signals.forEach(signal => {
        const card = createSignalCard(signal);
        listEl.appendChild(card);
    });
}

/**
 * Create signal card element
 */
function createSignalCard(signal) {
    const card = document.createElement('div');
    card.className = 'signal-card';
    card.innerHTML = `
        <div class="signal-card-header">
            <div class="signal-card-info">
                <h3 class="signal-card-title">${signal.title}</h3>
                <div class="signal-card-meta">
                    <span><strong>ID:</strong> ${signal.signalId}</span>
                    <span><strong>Category:</strong> ${signal.category}</span>
                    <span><strong>Horizon:</strong> ${signal.timeHorizon}</span>
                    <span class="signal-badge ${signal.status}">${signal.status.toUpperCase()}</span>
                    ${signal.signalType && signal.signalType !== 'standard' ? `<span class="signal-badge signal-type-${signal.signalType}">${signal.signalType === 'trending' ? '🔥 TRENDING' : '🚀 EARLY'}</span>` : ''}
                </div>
            </div>
            <div class="signal-card-actions">
                <button class="btn-icon edit" onclick="editSignal('${signal._id}')">
                    ✏️ Edit
                </button>
                <button class="btn-icon delete" onclick="confirmDeleteSignal('${signal._id}', '${signal.signalId}')">
                    🗑️ Delete
                </button>
            </div>
        </div>
        <div class="signal-card-content">
            <strong>Narrative:</strong> ${signal.narrativeSeed}
        </div>
        <div class="signal-card-details">
            <div class="signal-detail-item">
                <div class="signal-detail-label">Institutional Evidence</div>
                <div class="signal-detail-value">${truncateText(signal.institutionalEvidence, 100)}</div>
            </div>
            <div class="signal-detail-item">
                <div class="signal-detail-label">Interpretation</div>
                <div class="signal-detail-value">${truncateText(signal.interpretation, 100)}</div>
            </div>
            <div class="signal-detail-item">
                <div class="signal-detail-label">City Impact</div>
                <div class="signal-detail-value">${truncateText(signal.cityImpact, 100)}</div>
            </div>
        </div>
    `;
    return card;
}

/**
 * Truncate text for preview
 */
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Edit signal - populate form with signal data
 */
async function editSignal(signalId) {
    try {
        const token = localStorage.getItem('token');
        const endpoint = window.CONFIG?.ADMIN?.GET_ALL_SIGNALS;

        // Fetch all signals and find the one to edit
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        const signal = data.signals.find(s => s._id === signalId);

        if (!signal) {
            throw new Error('Signal not found');
        }

        // Populate form
        document.getElementById('signalId').value = signal.signalId;
        document.getElementById('title').value = signal.title;
        document.getElementById('category').value = signal.category;
        document.getElementById('timeHorizon').value = signal.timeHorizon;
        document.getElementById('institutionalEvidence').value = signal.institutionalEvidence;
        document.getElementById('interpretation').value = signal.interpretation;
        document.getElementById('cityImpact').value = signal.cityImpact;
        document.getElementById('narrativeSeed').value = signal.narrativeSeed;

        // Set status radio
        const statusRadio = document.querySelector(`input[name="status"][value="${signal.status}"]`);
        if (statusRadio) statusRadio.checked = true;

        // Set signal type and conditional fields
        const signalTypeEl = document.getElementById('signalType');
        signalTypeEl.value = signal.signalType || 'standard';
        toggleSignalTypeFields();

        // Populate trending fields
        if (signal.signalType === 'trending') {
            document.getElementById('trendingScore').value = signal.trendingScore || 75;
            document.getElementById('discussionIntensity').value = signal.discussionIntensity || '';
            document.getElementById('whyTrending').value = signal.whyTrending || '';
        }

        // Populate early fields
        if (signal.signalType === 'early') {
            document.getElementById('earlyScore').value = signal.earlyScore || 75;
            document.getElementById('coverageLevel').value = signal.coverageLevel || 'low';
            document.getElementById('timingAdvantage').value = signal.timingAdvantage || '';
            document.getElementById('whatHappened').value = signal.whatHappened || '';
        }

        // Populate common featured fields
        if (signal.signalType === 'trending' || signal.signalType === 'early') {
            document.getElementById('postReadyHeadline').value = signal.postReadyHeadline || '';
            document.getElementById('statusBadge').value = signal.statusBadge || '';
        }

        // Set editing mode
        currentEditingSignalId = signalId;
        updateFormMode();

        // Scroll to form
        document.getElementById('signal-form').scrollIntoView({ behavior: 'smooth', block: 'start' });

        console.log(`✅ Editing signal: ${signal.signalId}`);

    } catch (error) {
        console.error('❌ Error loading signal for edit:', error);
        showError('Failed to load signal for editing');
    }
}

/**
 * Confirm delete signal - show modal
 */
function confirmDeleteSignal(signalId, signalIdString) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Delete Signal</h3>
            </div>
            <div class="modal-content">
                <p>Are you sure you want to delete this signal?</p>
                <p><span class="signal-id-highlight">${signalIdString}</span></p>
                <p style="margin-top: 15px; color: #ff6b6b;">This action cannot be undone.</p>
            </div>
            <div class="modal-actions">
                <button class="modal-btn modal-btn-cancel" onclick="closeDeleteModal()">Cancel</button>
                <button class="modal-btn modal-btn-delete" onclick="deleteSignal('${signalId}')">Delete Signal</button>
            </div>
        </div>
    `;
    overlay.id = 'delete-modal';
    document.body.appendChild(overlay);

    // Close modal on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDeleteModal();
    });
}

/**
 * Close delete modal
 */
function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    if (modal) modal.remove();
}

/**
 * Delete signal
 */
async function deleteSignal(signalId) {
    const deleteBtn = document.querySelector('.modal-btn-delete');
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';

    try {
        const token = localStorage.getItem('token');
        const endpoint = window.CONFIG?.ADMIN?.DELETE_SIGNAL?.(signalId);

        console.log(`📡 Deleting signal: ${signalId}`);

        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete signal');
        }

        console.log('✅ Signal deleted successfully');
        showSuccess('Signal deleted successfully!');

        // Close modal and reload signals
        closeDeleteModal();
        setTimeout(() => {
            loadSignals();
        }, 1000);

    } catch (error) {
        console.error('❌ Error deleting signal:', error);
        showError(error.message || 'Failed to delete signal');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Signal';
    }
}

/**
 * Toggle signal type conditional fields
 */
function toggleSignalTypeFields() {
    const signalType = document.getElementById('signalType').value;
    const trendingFields = document.getElementById('trending-fields');
    const earlyFields = document.getElementById('early-fields');
    const featuredFields = document.getElementById('featured-fields');

    // Hide all conditional fields first
    trendingFields.style.display = 'none';
    earlyFields.style.display = 'none';
    featuredFields.style.display = 'none';

    // Show relevant fields
    if (signalType === 'trending') {
        trendingFields.style.display = 'block';
        featuredFields.style.display = 'block';
    } else if (signalType === 'early') {
        earlyFields.style.display = 'block';
        featuredFields.style.display = 'block';
    }
}

console.log('✅ Admin dashboard script loaded');
