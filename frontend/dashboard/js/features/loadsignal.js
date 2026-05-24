/**
 * ============================================
 * LOAD SIGNALS - FETCH USER'S GENERATED POSTS
 * ============================================
 * Handles:
 * - Fetching user's signals from backend
 * - Error handling and retry logic
 * - Data transformation and validation
 * - Communication with dashboard controller
 * ============================================
 */

// ✅ REMOVED: Global API_BASE_URL declaration (conflicts with other modules)
// Use window.CONFIG?.API_BASE directly instead
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * ============================================
 * MAIN FUNCTION - LOAD USER SIGNALS
 * Called by signaldashboard.js on page load
 * ============================================
 */
async function loadUserSignals(retryCount = 0) {
    console.log('🔄 Loading user signals...');

    try {
        // Get authentication token
        const token = localStorage.getItem('token');

        if (!token) {
            console.error('❌ No authentication token found');
            window.dashboardAPI.showEmptyState();
            return;
        }

        // Get API base URL
        const API_BASE = window.CONFIG?.API_BASE || 'http://localhost:3000/api';

        // Get endpoint from CONFIG or use fallback
        const userSignalsEndpoint = window.CONFIG?.SIGNALS?.USER_SIGNALS || `${API_BASE}/user/signals`;
        console.log('🔗 User signals endpoint:', userSignalsEndpoint);
        
        // Fetch signals from backend
        const response = await fetch(userSignalsEndpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
            console.error('❌ Authentication failed. Token invalid or expired.');
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            localStorage.setItem('redirectAfterLogin', window.location.pathname);
            window.location.href = '/login/login.html';
            return;
        }
        
        // Handle other HTTP errors
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Parse response data
        const data = await response.json();
        console.log(`✅ Fetched ${data.signals?.length || 0} signals`);
        
        // Process and display signals
        processSignals(data.signals);
        
    } catch (error) {
        console.error('❌ Error loading signals:', error);
        
        // Retry logic
        if (retryCount < MAX_RETRIES) {
            console.log(`🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            setTimeout(() => {
                loadUserSignals(retryCount + 1);
            }, RETRY_DELAY * (retryCount + 1)); // Exponential backoff
        } else {
            console.error('❌ Max retries reached. Showing error state.');
            window.dashboardAPI.showErrorState();
        }
    }
}

/**
 * ============================================
 * PROCESS SIGNALS
 * Validate, transform, and render signals
 * ============================================
 */
function processSignals(signals) {
    console.log('🔧 Processing signals...');
    
    // Check if signals exist and is array
    if (!signals || !Array.isArray(signals)) {
        console.warn('⚠️ Invalid signals data received');
        window.dashboardAPI.showEmptyState();
        return;
    }
    
    // Check if empty
    if (signals.length === 0) {
        console.log('📭 No signals found. Showing empty state.');
        window.dashboardAPI.showEmptyState();
        return;
    }
    
    // Validate and transform each signal
    const validSignals = signals
        .map(signal => validateAndTransformSignal(signal))
        .filter(signal => signal !== null); // Remove invalid signals
    
    if (validSignals.length === 0) {
        console.warn('⚠️ All signals failed validation');
        window.dashboardAPI.showEmptyState();
        return;
    }
    
    console.log(`✅ Processed ${validSignals.length} valid signals`);
    
    // Sort by date (newest first)
    validSignals.sort((a, b) => {
        const dateA = new Date(a.created_at || a.timestamp);
        const dateB = new Date(b.created_at || b.timestamp);
        return dateB - dateA;
    });
    
    // Render signals on dashboard
    window.dashboardAPI.renderSignals(validSignals);
}

/**
 * ============================================
 * VALIDATE AND TRANSFORM SIGNAL
 * Ensure signal has required fields and correct format
 * ============================================
 */
function validateAndTransformSignal(signal) {
    try {
        // Check if signal exists
        if (!signal || typeof signal !== 'object') {
            console.warn('⚠️ Invalid signal object:', signal);
            return null;
        }
        
        // Ensure required fields exist
        const transformedSignal = {
            id: signal.id || signal.generation_id || generateTempId(),
            signal_id: signal.signal_id || 'unknown',
            signal_title: signal.signal_title || signal.title || 'Untitled Signal',
            generated_text: signal.generated_text || signal.post_content || '',
            generated_image_url: signal.generated_image_url || null,
            created_at: signal.created_at || signal.timestamp || new Date().toISOString(),

            // Analytics data (use 0 as default for missing data)
            impressions: parseAnalyticsValue(signal.impressions),
            reactions: parseAnalyticsValue(signal.reactions),
            comments: parseAnalyticsValue(signal.comments),

            // Additional metadata
            category: signal.category || 'General',
            source_signal: signal.source_signal || null
        };
        
        return transformedSignal;
        
    } catch (error) {
        console.error('❌ Error validating signal:', error, signal);
        return null;
    }
}

/**
 * ============================================
 * PARSE ANALYTICS VALUE
 * Convert analytics value to number, handle various formats
 * ============================================
 */
function parseAnalyticsValue(value) {
    // If already a number, return it
    if (typeof value === 'number') {
        return Math.max(0, Math.floor(value)); // Ensure non-negative integer
    }
    
    // If string, try to parse
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }
    
    // Default to 0 for null, undefined, or invalid values
    return 0;
}

/**
 * ============================================
 * GENERATE TEMPORARY ID
 * Create a unique ID for signals without one
 * ============================================
 */
function generateTempId() {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * ============================================
 * REFRESH SIGNALS
 * Reload signals from backend (for manual refresh)
 * ============================================
 */
async function refreshSignals() {
    console.log('🔄 Manually refreshing signals...');
    
    // Show loading state
    window.dashboardAPI.showLoadingState();
    
    // Reload signals
    await loadUserSignals();
}

/**
 * ============================================
 * UPDATE SINGLE SIGNAL ANALYTICS
 * Update analytics for a specific signal (when user updates LinkedIn)
 * ============================================
 */
async function updateSignalAnalytics(signalId, analyticsData) {
    console.log(`📊 Updating analytics for signal ${signalId}`);

    try {
        const token = localStorage.getItem('token');

        if (!token) {
            console.error('❌ No authentication token found');
            return false;
        }

        // Get API base URL
        const API_BASE = window.CONFIG?.API_BASE || 'http://localhost:3000/api';

        // Get endpoint from CONFIG or use fallback
        const updateEndpoint = window.CONFIG?.SIGNALS?.UPDATE_ANALYTICS
            ? window.CONFIG.SIGNALS.UPDATE_ANALYTICS(signalId)
            : `${API_BASE}/user/signals/${signalId}/analytics`;

        console.log('🔗 Update analytics endpoint:', updateEndpoint);
        
        const response = await fetch(updateEndpoint, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                impressions: analyticsData.impressions || 0,
                reactions: analyticsData.reactions || 0,
                comments: analyticsData.comments || 0
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Analytics updated successfully');
        
        // Refresh the dashboard to show updated data
        await refreshSignals();
        
        return true;
        
    } catch (error) {
        console.error('❌ Error updating analytics:', error);
        return false;
    }
}

/**
 * ============================================
 * DELETE SIGNAL
 * Remove a signal from user's dashboard
 * ============================================
 */
async function deleteSignal(signalId) {
    console.log(`🗑️ Deleting signal ${signalId}`);

    // Confirm with user
    if (!confirm('Are you sure you want to delete this signal? This action cannot be undone.')) {
        return false;
    }

    try {
        const token = localStorage.getItem('token');

        if (!token) {
            console.error('❌ No authentication token found');
            return false;
        }

        // Get API base URL
        const API_BASE = window.CONFIG?.API_BASE || 'http://localhost:3000/api';

        // Get endpoint from CONFIG or use fallback
        const deleteEndpoint = window.CONFIG?.SIGNALS?.DELETE
            ? window.CONFIG.SIGNALS.DELETE(signalId)
            : `${API_BASE}/user/signals/${signalId}`;

        console.log('🔗 Delete endpoint:', deleteEndpoint);
        
        const response = await fetch(deleteEndpoint, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        console.log('✅ Signal deleted successfully');
        
        // Refresh the dashboard
        await refreshSignals();
        
        return true;
        
    } catch (error) {
        console.error('❌ Error deleting signal:', error);
        alert('Failed to delete signal. Please try again.');
        return false;
    }
}

/**
 * ============================================
 * GET SIGNAL BY ID
 * Fetch details of a specific signal
 * ============================================
 */
async function getSignalById(signalId) {
    console.log(`🔍 Fetching signal ${signalId}`);

    try {
        const token = localStorage.getItem('token');

        if (!token) {
            console.error('❌ No authentication token found');
            return null;
        }

        // Get API base URL
        const API_BASE = window.CONFIG?.API_BASE || 'http://localhost:3000/api';

        // Get endpoint from CONFIG or use fallback
        const signalEndpoint = window.CONFIG?.SIGNALS?.USER_SIGNAL_DETAIL
            ? window.CONFIG.SIGNALS.USER_SIGNAL_DETAIL(signalId)
            : `${API_BASE}/user/signals/${signalId}`;

        console.log('🔗 Signal detail endpoint:', signalEndpoint);
        
        const response = await fetch(signalEndpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Signal fetched successfully');
        
        return validateAndTransformSignal(data.signal);
        
    } catch (error) {
        console.error('❌ Error fetching signal:', error);
        return null;
    }
}

/**
 * ============================================
 * EXPORT/DOWNLOAD SIGNAL
 * Download signal as text file
 * ============================================
 */
function exportSignal(signal) {
    console.log('💾 Exporting signal:', signal.id);
    
    try {
        // Create text content
        const content = `
SIGNAL: ${signal.signal_title}
DATE: ${new Date(signal.created_at).toLocaleDateString()}

GENERATED POST:
${signal.generated_text}

ANALYTICS:
Impressions: ${signal.impressions}
Reactions: ${signal.reactions}
Comments: ${signal.comments}

Generated by SOORGA - ${window.location.origin}
        `.trim();
        
        // Create blob and download
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `signal_${signal.id}_${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('✅ Signal exported successfully');
        
    } catch (error) {
        console.error('❌ Error exporting signal:', error);
        alert('Failed to export signal. Please try again.');
    }
}

/**
 * ============================================
 * EXPOSE FUNCTIONS TO GLOBAL SCOPE
 * Allow other modules to access these functions
 * ============================================
 */
window.loadUserSignals = loadUserSignals;
window.refreshSignals = refreshSignals;
window.updateSignalAnalytics = updateSignalAnalytics;
window.deleteSignal = deleteSignal;
window.getSignalById = getSignalById;
window.exportSignal = exportSignal;

console.log('✅ Load signals module initialized');