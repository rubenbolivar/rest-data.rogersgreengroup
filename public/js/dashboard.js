/**
 * Rogers Green Restaurant Scraper - Dashboard JavaScript
 * Main JavaScript functionality for the dashboard
 */

// Global configuration
const CONFIG = {
    API_BASE_URL: '/api',
    REFRESH_INTERVAL: 30000, // 30 seconds
    TOAST_DURATION: 5000,
    ANIMATION_DURATION: 300
};

// Global state
const APP_STATE = {
    isLoading: false,
    activeJobs: [],
    lastUpdate: null,
    filters: {
        zone: null,
        priority: null,
        status: null
    }
};

/**
 * Initialize dashboard when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupEventListeners();
    startAutoRefresh();
});

/**
 * Initialize dashboard components
 */
function initializeDashboard() {
    console.log('Initializing Rogers Green Restaurant Scraper Dashboard');
    
    // Initialize tooltips
    initializeTooltips();
    
    // Initialize DataTables if present
    initializeDataTables();
    
    // Initialize charts if present
    initializeCharts();
    
    // Load initial data
    loadDashboardData();
    
    // Set up navigation highlighting
    highlightActiveNavigation();
}

/**
 * Set up global event listeners
 */
function setupEventListeners() {
    // Global error handler
    window.addEventListener('error', handleGlobalError);
    
    // Handle form submissions
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', handleFormSubmit);
    });
    
    // Handle AJAX buttons
    document.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', handleActionButton);
    });
    
    // Handle filter changes
    document.querySelectorAll('.filter-control').forEach(control => {
        control.addEventListener('change', handleFilterChange);
    });
    
    // Handle search inputs
    document.querySelectorAll('.search-input').forEach(input => {
        input.addEventListener('input', debounce(handleSearchInput, 500));
    });
}

/**
 * Initialize Bootstrap tooltips
 */
function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

/**
 * Initialize DataTables
 */
function initializeDataTables() {
    if (typeof $.fn.dataTable === 'undefined') return;
    
    $('.data-table').each(function() {
        const table = $(this);
        const options = {
            responsive: true,
            pageLength: 25,
            dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
                 '<"row"<"col-sm-12"tr>>' +
                 '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
            language: {
                search: "",
                searchPlaceholder: "Search...",
                lengthMenu: "Show _MENU_ entries per page",
                info: "Showing _START_ to _END_ of _TOTAL_ entries",
                paginate: {
                    first: "First",
                    last: "Last",
                    next: "Next",
                    previous: "Previous"
                }
            },
            columnDefs: [
                {
                    targets: 'no-sort',
                    orderable: false
                }
            ]
        };
        
        // Merge custom options if specified
        if (table.data('options')) {
            Object.assign(options, table.data('options'));
        }
        
        table.DataTable(options);
    });
}

/**
 * Initialize charts
 */
function initializeCharts() {
    // Initialize Chart.js charts
    document.querySelectorAll('.chart-canvas').forEach(canvas => {
        initializeChart(canvas);
    });
}

/**
 * Initialize individual chart
 */
function initializeChart(canvas) {
    const ctx = canvas.getContext('2d');
    const type = canvas.dataset.chartType || 'line';
    const dataUrl = canvas.dataset.dataUrl;
    
    if (!dataUrl) return;
    
    // Fetch chart data
    fetch(dataUrl)
        .then(response => response.json())
        .then(data => {
            new Chart(ctx, {
                type: type,
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: canvas.dataset.chartTitle || 'Chart'
                        }
                    }
                }
            });
        })
        .catch(error => {
            console.error('Error loading chart data:', error);
        });
}

/**
 * Load dashboard data
 */
async function loadDashboardData() {
    try {
        setLoadingState(true);
        
        const response = await fetch(`${CONFIG.API_BASE_URL}/dashboard/stats`);
        const data = await response.json();
        
        if (data.success) {
            updateDashboardStats(data.stats);
            updateLastRefreshTime();
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showToast('Error loading dashboard data', 'error');
    } finally {
        setLoadingState(false);
    }
}

/**
 * Update dashboard statistics
 */
function updateDashboardStats(stats) {
    // Update stat cards
    updateStatCard('total-zones', stats.totalZones);
    updateStatCard('total-restaurants', stats.totalRestaurants);
    updateStatCard('restaurants-with-email', stats.restaurantsWithEmail);
    updateStatCard('active-jobs', stats.activeJobs);
    
    // Update progress bars
    if (stats.totalRestaurants > 0) {
        const emailPercentage = (stats.restaurantsWithEmail / stats.totalRestaurants * 100).toFixed(1);
        updateProgressBar('email-coverage', emailPercentage);
    }
    
    // Update priority breakdown
    updatePriorityBreakdown(stats.priorityStats);
}

/**
 * Update individual stat card
 */
function updateStatCard(cardId, value) {
    const card = document.getElementById(cardId);
    if (card) {
        const valueElement = card.querySelector('.stat-value');
        if (valueElement) {
            animateNumber(valueElement, parseInt(valueElement.textContent.replace(/,/g, '')) || 0, value);
        }
    }
}

/**
 * Update progress bar
 */
function updateProgressBar(barId, percentage) {
    const progressBar = document.getElementById(barId);
    if (progressBar) {
        progressBar.style.width = percentage + '%';
        progressBar.textContent = percentage + '%';
        
        // Update color based on percentage
        progressBar.className = progressBar.className.replace(/bg-(success|warning|danger)/, '');
        if (percentage >= 70) {
            progressBar.classList.add('bg-success');
        } else if (percentage >= 40) {
            progressBar.classList.add('bg-warning');
        } else {
            progressBar.classList.add('bg-danger');
        }
    }
}

/**
 * Animate number change
 */
function animateNumber(element, start, end) {
    const duration = 1000;
    const startTime = performance.now();
    
    function updateNumber(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.floor(start + (end - start) * progress);
        
        element.textContent = formatNumber(current);
        
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        }
    }
    
    requestAnimationFrame(updateNumber);
}

/**
 * Update priority breakdown
 */
function updatePriorityBreakdown(priorityStats) {
    const container = document.getElementById('priority-breakdown');
    if (!container || !priorityStats) return;
    
    container.innerHTML = '';
    
    priorityStats.forEach(stat => {
        const priorityName = stat.priority === 1 ? 'High' : stat.priority === 2 ? 'Medium' : 'Low';
        const priorityClass = stat.priority === 1 ? 'danger' : stat.priority === 2 ? 'warning' : 'secondary';
        
        const html = `
            <div class="col-md-4">
                <div class="card border-start-${priorityClass}">
                    <div class="card-body">
                        <h6 class="card-title">${priorityName} Priority</h6>
                        <div class="d-flex justify-content-between">
                            <span>${stat.zone_count} zones</span>
                            <span>${formatNumber(stat.total_restaurants)} restaurants</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', html);
    });
}

/**
 * Handle form submissions
 */
function handleFormSubmit(event) {
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    
    if (submitButton) {
        setButtonLoading(submitButton, true);
    }
    
    // Don't prevent default - let the form submit normally
    // Loading state will be cleared on page reload or by response handler
}

/**
 * Handle action buttons (AJAX actions)
 */
async function handleActionButton(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    
    event.preventDefault();
    
    const action = button.dataset.action;
    const confirm = button.dataset.confirm;
    
    if (confirm && !window.confirm(confirm)) {
        return;
    }
    
    try {
        setButtonLoading(button, true);
        
        const result = await performAction(action, button);
        
        if (result.success) {
            showToast(result.message || 'Action completed successfully', 'success');
            
            // Handle post-action behavior
            if (button.dataset.reload) {
                location.reload();
            } else if (button.dataset.redirect) {
                location.href = button.dataset.redirect;
            }
        } else {
            showToast(result.error || 'Action failed', 'error');
        }
    } catch (error) {
        console.error('Action error:', error);
        showToast(error.message || 'An error occurred', 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

/**
 * Perform AJAX action
 */
async function performAction(action, button) {
    const url = button.dataset.url || button.href;
    const method = button.dataset.method || 'GET';
    const data = button.dataset.data ? JSON.parse(button.dataset.data) : null;
    
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };
    
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, options);
    return await response.json();
}

/**
 * Handle filter changes
 */
function handleFilterChange(event) {
    const filter = event.target;
    const filterName = filter.dataset.filter;
    const filterValue = filter.value;
    
    APP_STATE.filters[filterName] = filterValue;
    applyFilters();
}

/**
 * Handle search input
 */
function handleSearchInput(event) {
    const searchTerm = event.target.value;
    performSearch(searchTerm);
}

/**
 * Apply filters to data tables
 */
function applyFilters() {
    $('.data-table').each(function() {
        const table = $(this).DataTable();
        
        // Apply filters based on current state
        Object.keys(APP_STATE.filters).forEach(filterName => {
            const filterValue = APP_STATE.filters[filterName];
            if (filterValue) {
                const columnIndex = $(this).find(`th[data-filter="${filterName}"]`).index();
                if (columnIndex !== -1) {
                    table.column(columnIndex).search(filterValue);
                }
            }
        });
        
        table.draw();
    });
}

/**
 * Perform search
 */
function performSearch(searchTerm) {
    $('.data-table').each(function() {
        const table = $(this).DataTable();
        table.search(searchTerm).draw();
    });
}

/**
 * Set loading state
 */
function setLoadingState(loading) {
    APP_STATE.isLoading = loading;
    
    const loadingIndicators = document.querySelectorAll('.loading-indicator');
    loadingIndicators.forEach(indicator => {
        if (loading) {
            indicator.classList.remove('d-none');
        } else {
            indicator.classList.add('d-none');
        }
    });
}

/**
 * Set button loading state
 */
function setButtonLoading(button, loading) {
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const toastContainer = getOrCreateToastContainer();
    
    const toastId = 'toast-' + Date.now();
    const toastClass = type === 'success' ? 'bg-success' : 
                     type === 'error' ? 'bg-danger' : 
                     type === 'warning' ? 'bg-warning' : 'bg-info';
    
    const toastHtml = `
        <div id="${toastId}" class="toast ${toastClass} text-white" role="alert">
            <div class="toast-body">
                <i class="bi bi-${getToastIcon(type)} me-2"></i>
                ${escapeHtml(message)}
                <button type="button" class="btn-close btn-close-white float-end" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    const toast = new bootstrap.Toast(document.getElementById(toastId), {
        delay: CONFIG.TOAST_DURATION
    });
    
    toast.show();
    
    // Remove toast element after it's hidden
    document.getElementById(toastId).addEventListener('hidden.bs.toast', function() {
        this.remove();
    });
}

/**
 * Get or create toast container
 */
function getOrCreateToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1055';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Get toast icon based on type
 */
function getToastIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

/**
 * Start auto-refresh
 */
function startAutoRefresh() {
    setInterval(() => {
        if (!APP_STATE.isLoading) {
            loadDashboardData();
        }
    }, CONFIG.REFRESH_INTERVAL);
}

/**
 * Update last refresh time
 */
function updateLastRefreshTime() {
    APP_STATE.lastUpdate = new Date();
    const element = document.getElementById('last-update');
    if (element) {
        element.textContent = 'Last updated: ' + formatDate(APP_STATE.lastUpdate);
    }
}

/**
 * Highlight active navigation
 */
function highlightActiveNavigation() {
    const currentPath = window.location.pathname;
    
    // Remove existing active classes
    document.querySelectorAll('.nav-link, .dropdown-item').forEach(link => {
        link.classList.remove('active');
    });
    
    // Add active class to current page
    document.querySelectorAll('.nav-link, .dropdown-item').forEach(link => {
        if (link.href && link.getAttribute('href') === currentPath) {
            link.classList.add('active');
            
            // If it's a dropdown item, also activate the parent dropdown
            const parentDropdown = link.closest('.dropdown');
            if (parentDropdown) {
                const dropdownToggle = parentDropdown.querySelector('.dropdown-toggle');
                if (dropdownToggle) {
                    dropdownToggle.classList.add('active');
                }
            }
        }
    });
}

/**
 * Handle global errors
 */
function handleGlobalError(event) {
    console.error('Global error:', event.error);
    
    // Don't show toast for every error, only critical ones
    if (event.error && event.error.message && !event.error.message.includes('Script error')) {
        showToast('An unexpected error occurred', 'error');
    }
}

/**
 * Utility Functions
 */

/**
 * Format number with commas
 */
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format currency
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

/**
 * Format date
 */
function formatDate(date) {
    return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * API call helper
 */
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

/**
 * Confirm action helper
 */
function confirmAction(message) {
    return confirm(message || 'Are you sure you want to perform this action?');
}

// Export functions for global use
window.APP_STATE = APP_STATE;
window.showToast = showToast;
window.setButtonLoading = setButtonLoading;
window.formatNumber = formatNumber;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.apiCall = apiCall;
window.confirmAction = confirmAction;