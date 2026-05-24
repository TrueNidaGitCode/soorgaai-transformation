/**
 * ============================================
 * SIGNAL DASHBOARD - MAIN CONTROLLER
 * ============================================
 * Orchestrates the dashboard page:
 * - Authentication verification
 * - Loading user's generated signals
 * - Displaying appropriate states (empty, loading, loaded, error)
 * - Handling modal interactions
 * ============================================
 */

// Configuration
// ✅ REMOVED: const API_BASE_URL declaration (unused, conflicts with loadsignal.js)

// DOM Elements - cached for performance
let domElements = {};

/**
 * ============================================
 * INITIALIZATION
 * ============================================
 */
document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ Signal Dashboard loaded");
    
    // Initialize DOM element references
    initializeDOMElements();
    
    // Check authentication first
    checkAuthentication();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load empty state content
    loadEmptyStateContent();
    
    // Load user's signals
    initializeDashboard();
});

/**
 * ============================================
 * CACHE DOM ELEMENTS
 * Store references to frequently accessed elements
 * ============================================
 */
function initializeDOMElements() {
    domElements = {
        root: document.getElementById('root'),
        emptyState: document.getElementById('empty-state'),
        loading: document.getElementById('loading'),
        signalsGrid: document.getElementById('signals-grid'),
        errorState: document.getElementById('error-state'),
        quickStats: document.getElementById('quick-stats'),
        totalPosts: document.getElementById('total-posts'),
        totalImpressions: document.getElementById('total-impressions'),
        totalReactions: document.getElementById('total-reactions'),
        totalComments: document.getElementById('total-comments'),
        signalDetailModal: document.getElementById('signal-detail-modal'),
        signalDetailBody: document.getElementById('signal-detail-body'),
        closeDetailModal: document.getElementById('close-detail-modal')
    };
    
    console.log('✅ DOM elements cached');
}

/**
 * ============================================
 * CHECK AUTHENTICATION
 * Verify user is logged in, redirect if not
 * ============================================
 */
function checkAuthentication() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        console.log('🔒 User not authenticated. Redirecting to login...');
        
        // Save current page for redirect after login
        localStorage.setItem('redirectAfterLogin', window.location.pathname);
        
        // Redirect to login
        window.location.href = '/login/login.html';
        return false;
    }
    
    console.log('✅ User authenticated');
    return true;
}

/**
 * ============================================
 * SETUP EVENT LISTENERS
 * ============================================
 */
function setupEventListeners() {
    // Close modal when clicking X button
    if (domElements.closeDetailModal) {
        domElements.closeDetailModal.addEventListener('click', closeSignalDetailModal);
    }
    
    // Close modal when clicking outside
    if (domElements.signalDetailModal) {
        domElements.signalDetailModal.addEventListener('click', function(event) {
            if (event.target === domElements.signalDetailModal) {
                closeSignalDetailModal();
            }
        });
    }
    
    // Close modal on ESC key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeSignalDetailModal();
        }
    });
    
    console.log('✅ Event listeners setup complete');
}

/**
 * ============================================
 * LOAD EMPTY STATE CONTENT
 * Load empty-state.html content into container
 * ============================================
 */
async function loadEmptyStateContent() {
    try {
        const response = await fetch('components/empty-state.html');
        if (response.ok) {
            const html = await response.text();
            if (domElements.emptyState) {
                domElements.emptyState.innerHTML = html;
                console.log('✅ Empty state content loaded');
            }
        }
    } catch (error) {
        console.error('❌ Error loading empty state content:', error);
    }
}

/**
 * ============================================
 * INITIALIZE DASHBOARD
 * Main entry point - loads user's signals
 * ============================================
 */
async function initializeDashboard() {
    console.log('🔄 Initializing dashboard...');
    
    // Show loading state
    showLoadingState();
    
    try {
        // Load signals from backend (function from load-signals.js)
        if (typeof loadUserSignals === 'function') {
            await loadUserSignals();
            console.log('✅ Dashboard initialization complete');
        } else {
            console.error('❌ loadUserSignals function not found');
            showErrorState();
        }
    } catch (error) {
        console.error('❌ Error initializing dashboard:', error);
        showErrorState();
    }
}

/**
 * ============================================
 * DASHBOARD STATE MANAGEMENT
 * Functions to show different dashboard states
 * ============================================
 */

/**
 * Show loading state
 */
function showLoadingState() {
    console.log('🔄 Showing loading state');
    hideAllStates();
    if (domElements.loading) {
        domElements.loading.style.display = 'flex';
    }
}

/**
 * Show empty state (no signals)
 */
function showEmptyState() {
    console.log('📭 Showing empty state');
    hideAllStates();
    if (domElements.emptyState) {
        domElements.emptyState.style.display = 'block';
    }
    // Hide quick stats in empty state
    if (domElements.quickStats) {
        domElements.quickStats.style.display = 'none';
    }
}

/**
 * Show signals grid (has signals)
 */
function showSignalsGrid() {
    console.log('📊 Showing signals grid');
    hideAllStates();
    if (domElements.signalsGrid) {
        domElements.signalsGrid.style.display = 'grid';
    }
    // Show quick stats
    if (domElements.quickStats) {
        domElements.quickStats.style.display = 'grid';
    }
}

/**
 * Show error state
 */
function showErrorState() {
    console.log('⚠️ Showing error state');
    hideAllStates();
    if (domElements.errorState) {
        domElements.errorState.style.display = 'flex';
    }
}

/**
 * Hide all dashboard states
 */
function hideAllStates() {
    if (domElements.emptyState) domElements.emptyState.style.display = 'none';
    if (domElements.loading) domElements.loading.style.display = 'none';
    if (domElements.signalsGrid) domElements.signalsGrid.style.display = 'none';
    if (domElements.errorState) domElements.errorState.style.display = 'none';
}

/**
 * ============================================
 * UPDATE QUICK STATS
 * Update the summary statistics at the top
 * ============================================
 */
function updateQuickStats(stats) {
    console.log('📊 Updating quick stats:', stats);
    
    if (domElements.totalPosts) {
        domElements.totalPosts.textContent = stats.totalPosts || 0;
    }
    if (domElements.totalImpressions) {
        domElements.totalImpressions.textContent = formatNumber(stats.totalImpressions || 0);
    }
    if (domElements.totalReactions) {
        domElements.totalReactions.textContent = formatNumber(stats.totalReactions || 0);
    }
    if (domElements.totalComments) {
        domElements.totalComments.textContent = formatNumber(stats.totalComments || 0);
    }
}

/**
 * ============================================
 * RENDER SIGNALS
 * Display signal cards in the grid
 * ============================================
 */
function renderSignals(signals) {
    console.log(`📝 Rendering ${signals.length} signals`);
    
    if (!domElements.signalsGrid) {
        console.error('❌ Signals grid element not found');
        return;
    }
    
    // Clear existing content
    domElements.signalsGrid.innerHTML = '';
    
    if (!signals || signals.length === 0) {
        showEmptyState();
        return;
    }
    
    // Create signal cards
    signals.forEach(signal => {
        const card = createSignalCard(signal);
        domElements.signalsGrid.appendChild(card);
    });
    
    // Calculate and update quick stats
    const stats = calculateQuickStats(signals);
    updateQuickStats(stats);
    
    // Show the grid
    showSignalsGrid();
}

/**
 * ============================================
 * CREATE SIGNAL CARD
 * Generate HTML for a single signal card
 * ============================================
 */
function createSignalCard(signal) {
    const card = document.createElement('div');
    card.className = 'signal-card';
    card.setAttribute('data-signal-id', signal.id);
    
    // Format date
    const date = new Date(signal.created_at || signal.timestamp);
    const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
    
    // Create preview (first 150 characters of post)
    const preview = signal.generated_text 
        ? signal.generated_text.substring(0, 150) + '...'
        : 'No content available';
    
    // Build image HTML if available
    const imageHTML = signal.generated_image_url ? `
        <div class="signal-card-image">
            <img src="${signal.generated_image_url}" alt="Generated visual for ${signal.signal_title}" loading="lazy" />
            <div class="image-badge">🎨 AI Visual</div>
        </div>
    ` : '';

    // Build card HTML
    card.innerHTML = `
        <div class="signal-card-header">
            <span class="signal-card-date">${formattedDate}</span>
            <span class="signal-badge">${signal.signal_title || 'Signal'}</span>
        </div>

        <h3 class="signal-card-title">${signal.signal_title || 'Untitled Signal'}</h3>

        ${imageHTML}

        <p class="signal-card-preview">${preview}</p>

        <div class="signal-card-analytics">
            <div class="analytics-item">
                <span class="analytics-item-icon">👁️</span>
                <span class="analytics-item-value">${formatNumber(signal.impressions || 0)}</span>
                <span>impressions</span>
            </div>
            <div class="analytics-item">
                <span class="analytics-item-icon">❤️</span>
                <span class="analytics-item-value">${formatNumber(signal.reactions || 0)}</span>
                <span>reactions</span>
            </div>
            <div class="analytics-item">
                <span class="analytics-item-icon">💬</span>
                <span class="analytics-item-value">${formatNumber(signal.comments || 0)}</span>
                <span>comments</span>
            </div>
        </div>
    `;
    
    // Add click event to open detail modal
    card.addEventListener('click', () => openSignalDetailModal(signal));
    
    return card;
}

/**
 * ============================================
 * CALCULATE QUICK STATS
 * Sum up all metrics from signals
 * ============================================
 */
function calculateQuickStats(signals) {
    return signals.reduce((stats, signal) => {
        stats.totalPosts++;
        stats.totalImpressions += signal.impressions || 0;
        stats.totalReactions += signal.reactions || 0;
        stats.totalComments += signal.comments || 0;
        return stats;
    }, {
        totalPosts: 0,
        totalImpressions: 0,
        totalReactions: 0,
        totalComments: 0
    });
}

/**
 * ============================================
 * OPEN SIGNAL DETAIL MODAL
 * Show full post content and detailed analytics
 * ============================================
 */
function openSignalDetailModal(signal) {
    console.log('📖 Opening signal detail modal:', signal.id);
    
    if (!domElements.signalDetailModal || !domElements.signalDetailBody) {
        console.error('❌ Modal elements not found');
        return;
    }
    
    // Format date
    const date = new Date(signal.created_at || signal.timestamp);
    const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
    });
    
    // Build image section HTML if available
    const modalImageHTML = signal.generated_image_url ? `
        <div class="signal-image-section">
            <h3>Generated Visual</h3>
            <div class="signal-image-container">
                <img src="${signal.generated_image_url}" alt="Generated visual for ${signal.signal_title}" />
            </div>
        </div>
    ` : '';

    // Build modal content
    domElements.signalDetailBody.innerHTML = `
        <div class="signal-detail-header">
            <h2 class="signal-detail-title">${signal.signal_title || 'Untitled Signal'}</h2>
            <div class="signal-detail-meta">
                <span class="signal-badge">${formattedDate}</span>
            </div>
        </div>

        <div class="post-content-section">
            <h3>Generated Post</h3>
            <div class="post-content-text">${signal.generated_text || 'No content available'}</div>
        </div>

        ${modalImageHTML}

        <div class="analytics-detail">
            <div class="analytics-detail-card">
                <div class="analytics-detail-value">${formatNumber(signal.impressions || 0)}</div>
                <div class="analytics-detail-label">Impressions</div>
            </div>
            <div class="analytics-detail-card">
                <div class="analytics-detail-value">${formatNumber(signal.reactions || 0)}</div>
                <div class="analytics-detail-label">Reactions</div>
            </div>
            <div class="analytics-detail-card">
                <div class="analytics-detail-value">${formatNumber(signal.comments || 0)}</div>
                <div class="analytics-detail-label">Comments</div>
            </div>
        </div>
    `;
    
    // Show modal
    domElements.signalDetailModal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

/**
 * ============================================
 * CLOSE SIGNAL DETAIL MODAL
 * ============================================
 */
function closeSignalDetailModal() {
    if (domElements.signalDetailModal) {
        domElements.signalDetailModal.style.display = 'none';
        document.body.style.overflow = 'auto'; // Re-enable scrolling
    }
}

/**
 * ============================================
 * UTILITY FUNCTIONS
 * ============================================
 */

/**
 * Format large numbers with K/M suffix
 * Example: 1500 -> 1.5K, 1000000 -> 1M
 */
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

/**
 * ============================================
 * EXPOSE FUNCTIONS TO GLOBAL SCOPE
 * Allow other modules to access these functions
 * ============================================
 */
window.dashboardAPI = {
    showLoadingState,
    showEmptyState,
    showSignalsGrid,
    showErrorState,
    renderSignals,
    updateQuickStats,
    openSignalDetailModal,
    closeSignalDetailModal
};

console.log('✅ Signal dashboard module loaded');