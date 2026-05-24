/**
 * ============================================
 * ANALYTICS MODULE
 * ============================================
 * Handles:
 * - Analytics data visualization
 * - Performance trends calculation
 * - Engagement rate calculations
 * - Analytics charts and graphs
 * - Export analytics reports
 * ============================================
 */

// Configuration
const ENGAGEMENT_THRESHOLDS = {
    low: 0.02,      // 2% engagement rate
    medium: 0.05,   // 5% engagement rate
    high: 0.10      // 10% engagement rate
};

/**
 * ============================================
 * CALCULATE ENGAGEMENT RATE
 * (reactions + comments) / impressions
 * ============================================
 */
function calculateEngagementRate(signal) {
    if (!signal || !signal.impressions || signal.impressions === 0) {
        return 0;
    }
    
    const totalEngagement = (signal.reactions || 0) + (signal.comments || 0);
    const engagementRate = totalEngagement / signal.impressions;
    
    return Math.round(engagementRate * 10000) / 100; // Return as percentage with 2 decimals
}

/**
 * ============================================
 * GET ENGAGEMENT LEVEL
 * Categorize engagement as low, medium, high
 * ============================================
 */
function getEngagementLevel(engagementRate) {
    const rate = engagementRate / 100; // Convert percentage to decimal
    
    if (rate >= ENGAGEMENT_THRESHOLDS.high) {
        return {
            level: 'high',
            label: 'High Engagement',
            color: '#5CC5A7',
            emoji: '🔥'
        };
    } else if (rate >= ENGAGEMENT_THRESHOLDS.medium) {
        return {
            level: 'medium',
            label: 'Good Engagement',
            color: '#FFA500',
            emoji: '👍'
        };
    } else if (rate >= ENGAGEMENT_THRESHOLDS.low) {
        return {
            level: 'low',
            label: 'Low Engagement',
            color: '#FFD700',
            emoji: '📊'
        };
    } else {
        return {
            level: 'very-low',
            label: 'Very Low Engagement',
            color: '#888888',
            emoji: '📉'
        };
    }
}

/**
 * ============================================
 * CALCULATE AGGREGATE ANALYTICS
 * Total and average metrics across all signals
 * ============================================
 */
function calculateAggregateAnalytics(signals) {
    if (!signals || signals.length === 0) {
        return {
            total: {
                posts: 0,
                impressions: 0,
                reactions: 0,
                comments: 0,
                engagement: 0
            },
            average: {
                impressions: 0,
                reactions: 0,
                comments: 0,
                engagementRate: 0
            },
            best: null,
            worst: null
        };
    }
    
    // Calculate totals
    const totals = signals.reduce((acc, signal) => {
        acc.impressions += signal.impressions || 0;
        acc.reactions += signal.reactions || 0;
        acc.comments += signal.comments || 0;
        return acc;
    }, {
        impressions: 0,
        reactions: 0,
        comments: 0
    });
    
    // Calculate averages
    const count = signals.length;
    const averages = {
        impressions: Math.round(totals.impressions / count),
        reactions: Math.round(totals.reactions / count),
        comments: Math.round(totals.comments / count),
        engagementRate: 0
    };
    
    // Calculate average engagement rate
    const signalsWithImpressions = signals.filter(s => s.impressions > 0);
    if (signalsWithImpressions.length > 0) {
        const totalEngagementRate = signalsWithImpressions.reduce((sum, signal) => {
            return sum + calculateEngagementRate(signal);
        }, 0);
        averages.engagementRate = Math.round((totalEngagementRate / signalsWithImpressions.length) * 100) / 100;
    }
    
    // Find best and worst performing signals
    const signalsWithEngagement = signals
        .map(signal => ({
            ...signal,
            engagementRate: calculateEngagementRate(signal)
        }))
        .filter(s => s.impressions > 0)
        .sort((a, b) => b.engagementRate - a.engagementRate);
    
    return {
        total: {
            posts: count,
            impressions: totals.impressions,
            reactions: totals.reactions,
            comments: totals.comments,
            engagement: totals.reactions + totals.comments
        },
        average: averages,
        best: signalsWithEngagement[0] || null,
        worst: signalsWithEngagement[signalsWithEngagement.length - 1] || null,
        allSignalsRanked: signalsWithEngagement
    };
}

/**
 * ============================================
 * CALCULATE PERFORMANCE TRENDS
 * Compare recent vs older signals
 * ============================================
 */
function calculatePerformanceTrends(signals) {
    if (!signals || signals.length < 2) {
        return {
            trending: 'stable',
            change: 0,
            message: 'Not enough data for trends'
        };
    }
    
    // Sort by date (newest first)
    const sortedSignals = [...signals].sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return dateB - dateA;
    });
    
    // Split into recent and older (50/50 split)
    const midpoint = Math.floor(sortedSignals.length / 2);
    const recentSignals = sortedSignals.slice(0, midpoint);
    const olderSignals = sortedSignals.slice(midpoint);
    
    // Calculate average engagement rates
    const recentAvgEngagement = calculateAverageEngagementRate(recentSignals);
    const olderAvgEngagement = calculateAverageEngagementRate(olderSignals);
    
    // Calculate percentage change
    let percentageChange = 0;
    if (olderAvgEngagement > 0) {
        percentageChange = ((recentAvgEngagement - olderAvgEngagement) / olderAvgEngagement) * 100;
    }
    
    // Determine trend
    let trending = 'stable';
    let message = 'Performance is stable';
    
    if (percentageChange > 10) {
        trending = 'up';
        message = `Performance improving by ${Math.round(percentageChange)}%`;
    } else if (percentageChange < -10) {
        trending = 'down';
        message = `Performance declining by ${Math.abs(Math.round(percentageChange))}%`;
    }
    
    return {
        trending,
        change: Math.round(percentageChange * 10) / 10,
        message,
        recentAvg: Math.round(recentAvgEngagement * 100) / 100,
        olderAvg: Math.round(olderAvgEngagement * 100) / 100
    };
}

/**
 * ============================================
 * CALCULATE AVERAGE ENGAGEMENT RATE
 * Helper function for trend calculation
 * ============================================
 */
function calculateAverageEngagementRate(signals) {
    const signalsWithImpressions = signals.filter(s => s.impressions > 0);
    
    if (signalsWithImpressions.length === 0) {
        return 0;
    }
    
    const totalEngagementRate = signalsWithImpressions.reduce((sum, signal) => {
        return sum + calculateEngagementRate(signal);
    }, 0);
    
    return totalEngagementRate / signalsWithImpressions.length;
}

/**
 * ============================================
 * GET TIME PERIOD ANALYTICS
 * Analytics for specific time period (last 7 days, 30 days, etc.)
 * ============================================
 */
function getTimePeriodAnalytics(signals, days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const periodSignals = signals.filter(signal => {
        const signalDate = new Date(signal.created_at);
        return signalDate >= cutoffDate;
    });
    
    return {
        period: `Last ${days} days`,
        count: periodSignals.length,
        analytics: calculateAggregateAnalytics(periodSignals),
        signals: periodSignals
    };
}

/**
 * ============================================
 * GENERATE ANALYTICS INSIGHTS
 * AI-like insights based on data patterns
 * ============================================
 */
function generateAnalyticsInsights(signals) {
    const insights = [];
    
    if (!signals || signals.length === 0) {
        return [{
            type: 'info',
            title: 'No Data Yet',
            message: 'Start creating signals to see analytics insights.',
            icon: '📊'
        }];
    }
    
    const analytics = calculateAggregateAnalytics(signals);
    const trends = calculatePerformanceTrends(signals);
    
    // Insight 1: Overall performance
    if (analytics.average.engagementRate > ENGAGEMENT_THRESHOLDS.high * 100) {
        insights.push({
            type: 'success',
            title: 'Excellent Performance',
            message: `Your posts have an average ${analytics.average.engagementRate.toFixed(2)}% engagement rate. Keep up the great work!`,
            icon: '🎉'
        });
    } else if (analytics.average.engagementRate < ENGAGEMENT_THRESHOLDS.low * 100) {
        insights.push({
            type: 'warning',
            title: 'Room for Improvement',
            message: `Your average engagement rate is ${analytics.average.engagementRate.toFixed(2)}%. Try posting at different times or experimenting with content style.`,
            icon: '💡'
        });
    }
    
    // Insight 2: Performance trends
    if (trends.trending === 'up') {
        insights.push({
            type: 'success',
            title: 'Upward Trend',
            message: trends.message,
            icon: '📈'
        });
    } else if (trends.trending === 'down') {
        insights.push({
            type: 'warning',
            title: 'Declining Performance',
            message: trends.message,
            icon: '📉'
        });
    }
    
    // Insight 3: Best performing signal
    if (analytics.best) {
        const engagementRate = calculateEngagementRate(analytics.best);
        insights.push({
            type: 'info',
            title: 'Top Performer',
            message: `"${analytics.best.signal_title}" had ${engagementRate.toFixed(2)}% engagement with ${analytics.best.impressions} impressions.`,
            icon: '⭐'
        });
    }
    
    // Insight 4: Consistency check
    if (signals.length >= 5) {
        const last7Days = getTimePeriodAnalytics(signals, 7);
        if (last7Days.count === 0) {
            insights.push({
                type: 'info',
                title: 'Stay Consistent',
                message: `You haven't posted in the last 7 days. Regular posting helps maintain audience engagement.`,
                icon: '📅'
            });
        }
    }
    
    return insights;
}

/**
 * ============================================
 * FORMAT ANALYTICS REPORT
 * Generate text report for export
 * ============================================
 */
function formatAnalyticsReport(signals) {
    const analytics = calculateAggregateAnalytics(signals);
    const trends = calculatePerformanceTrends(signals);
    const insights = generateAnalyticsInsights(signals);
    
    const report = `
═══════════════════════════════════════════════════
    SOORGA ANALYTICS REPORT
    Generated: ${new Date().toLocaleDateString()}
═══════════════════════════════════════════════════

OVERVIEW
───────────────────────────────────────────────────
Total Posts:         ${analytics.total.posts}
Total Impressions:   ${analytics.total.impressions.toLocaleString()}
Total Reactions:     ${analytics.total.reactions.toLocaleString()}
Total Comments:      ${analytics.total.comments.toLocaleString()}
Total Engagement:    ${analytics.total.engagement.toLocaleString()}

AVERAGES
───────────────────────────────────────────────────
Avg Impressions:     ${analytics.average.impressions.toLocaleString()}
Avg Reactions:       ${analytics.average.reactions.toLocaleString()}
Avg Comments:        ${analytics.average.comments.toLocaleString()}
Avg Engagement Rate: ${analytics.average.engagementRate.toFixed(2)}%

PERFORMANCE TRENDS
───────────────────────────────────────────────────
Trend:               ${trends.trending.toUpperCase()}
Change:              ${trends.change > 0 ? '+' : ''}${trends.change.toFixed(1)}%
Status:              ${trends.message}

${analytics.best ? `
TOP PERFORMER
───────────────────────────────────────────────────
Signal:              ${analytics.best.signal_title}
Impressions:         ${analytics.best.impressions.toLocaleString()}
Engagement Rate:     ${calculateEngagementRate(analytics.best).toFixed(2)}%
` : ''}

INSIGHTS
───────────────────────────────────────────────────
${insights.map((insight, i) => `${i + 1}. ${insight.title}\n   ${insight.message}`).join('\n\n')}

═══════════════════════════════════════════════════
Report generated by SOORGA Analytics
${window.location.origin}
═══════════════════════════════════════════════════
    `.trim();
    
    return report;
}

/**
 * ============================================
 * EXPORT ANALYTICS REPORT
 * Download as text file
 * ============================================
 */
function exportAnalyticsReport(signals) {
    console.log('💾 Exporting analytics report...');
    
    try {
        const report = formatAnalyticsReport(signals);
        
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `soorga_analytics_${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('✅ Analytics report exported successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Error exporting analytics report:', error);
        alert('Failed to export report. Please try again.');
        return false;
    }
}

/**
 * ============================================
 * RENDER ANALYTICS DASHBOARD
 * Create visual analytics section in modal or page
 * ============================================
 */
function renderAnalyticsDashboard(containerId, signals) {
    const container = document.getElementById(containerId);
    
    if (!container) {
        console.error('❌ Analytics container not found:', containerId);
        return;
    }
    
    const analytics = calculateAggregateAnalytics(signals);
    const trends = calculatePerformanceTrends(signals);
    const insights = generateAnalyticsInsights(signals);
    
    container.innerHTML = `
        <div class="analytics-dashboard">
            <!-- Summary Stats -->
            <div class="analytics-summary">
                <h3>Performance Summary</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${analytics.total.posts}</div>
                        <div class="stat-label">Total Posts</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${analytics.total.impressions.toLocaleString()}</div>
                        <div class="stat-label">Impressions</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${analytics.average.engagementRate.toFixed(2)}%</div>
                        <div class="stat-label">Avg Engagement</div>
                    </div>
                    <div class="stat-item trend-${trends.trending}">
                        <div class="stat-value">${trends.change > 0 ? '+' : ''}${trends.change.toFixed(1)}%</div>
                        <div class="stat-label">Trend</div>
                    </div>
                </div>
            </div>
            
            <!-- Insights -->
            <div class="analytics-insights">
                <h3>Insights</h3>
                <div class="insights-list">
                    ${insights.map(insight => `
                        <div class="insight-card insight-${insight.type}">
                            <div class="insight-icon">${insight.icon}</div>
                            <div class="insight-content">
                                <div class="insight-title">${insight.title}</div>
                                <div class="insight-message">${insight.message}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Top Performers -->
            ${analytics.allSignalsRanked && analytics.allSignalsRanked.length > 0 ? `
                <div class="top-performers">
                    <h3>Top Performing Signals</h3>
                    <div class="performers-list">
                        ${analytics.allSignalsRanked.slice(0, 3).map((signal, index) => `
                            <div class="performer-item">
                                <div class="performer-rank">#${index + 1}</div>
                                <div class="performer-details">
                                    <div class="performer-title">${signal.signal_title}</div>
                                    <div class="performer-stats">
                                        ${signal.impressions.toLocaleString()} impressions • 
                                        ${signal.engagementRate.toFixed(2)}% engagement
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Export Button -->
            <div class="analytics-actions">
                <button class="secondary-button" onclick="exportAnalyticsReport(window.currentSignals)">
                    📊 Export Full Report
                </button>
            </div>
        </div>
    `;
    
    // Store signals globally for export function
    window.currentSignals = signals;
}

/**
 * ============================================
 * EXPOSE FUNCTIONS TO GLOBAL SCOPE
 * ============================================
 */
window.analyticsAPI = {
    calculateEngagementRate,
    getEngagementLevel,
    calculateAggregateAnalytics,
    calculatePerformanceTrends,
    getTimePeriodAnalytics,
    generateAnalyticsInsights,
    formatAnalyticsReport,
    exportAnalyticsReport,
    renderAnalyticsDashboard
};

// Also expose main functions directly
window.calculateEngagementRate = calculateEngagementRate;
window.exportAnalyticsReport = exportAnalyticsReport;

console.log('✅ Analytics module initialized');