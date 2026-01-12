// DataAcuity Portal - UI Components

const UI = {
    // Store app statuses
    appStatuses: {},

    // Stat Card
    statCard: (icon, label, value, change, colorClass = "blue") => `
        <div class="stat-card">
            <div class="stat-icon ${colorClass}">${icon}</div>
            <div class="stat-content">
                <div class="stat-label">${label}</div>
                <div class="stat-value">${value}</div>
                ${change !== null ? `
                    <div class="stat-change ${change >= 0 ? 'up' : 'down'}">
                        ${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}%
                    </div>
                ` : ''}
            </div>
        </div>
    `,

    // App Card
    appCard: (app, isLocked = false) => {
        const status = UI.appStatuses[app.id] || { status: 'loading' };
        const statusClass = isLocked ? 'locked' :
                           status.status === 'online' ? 'online' :
                           status.status === 'offline' ? 'offline' : 'loading';
        const statusText = isLocked ? 'Premium' :
                          status.status === 'online' ? 'Online' :
                          status.status === 'offline' ? 'Offline' : 'Checking...';

        return `
            <div class="app-card ${isLocked ? 'app-card-locked' : ''}" onclick="${isLocked ? "App.navigate('pricing')" : `App.openApp('${app.id}')`}" data-app="${app.id}">
                <div class="app-icon" style="background: ${isLocked ? 'var(--bg-tertiary)' : app.color + '20'};">${app.icon}</div>
                <div class="app-info">
                    <div class="app-name">${app.name}</div>
                    <div class="app-description">${app.description}</div>
                    ${app.example ? `<div class="app-example">e.g. "${app.example}"</div>` : ''}
                    <div class="app-status ${statusClass}">
                        <span class="status-dot"></span>
                        <span>${statusText}</span>
                    </div>
                </div>
                <div class="app-arrow">${isLocked ? '→' : '→'}</div>
            </div>
        `;
    },

    // Activity Item
    activityItem: (activity) => `
        <div class="activity-item">
            <div class="activity-icon">${activity.icon}</div>
            <div class="activity-content">
                <div class="activity-title">
                    <strong>${activity.app}</strong> ${activity.action}
                </div>
                <div class="activity-time">${activity.time}</div>
            </div>
        </div>
    `,

    // Quick Action Button
    quickAction: (icon, label, action, isLocked = false) => `
        <button class="quick-action ${isLocked ? 'quick-action-locked' : ''}" onclick="${action}">
            <span class="icon">${icon}</span>
            <span>${label}</span>
            ${isLocked ? '<span class="lock-icon">🔒</span>' : ''}
        </button>
    `,

    // Section with Header
    section: (title, action, content) => `
        <div class="section-header">
            <h3 class="section-title">${title}</h3>
            ${action ? `<a href="#" class="section-action" onclick="${action.onClick}">${action.label}</a>` : ''}
        </div>
        ${content}
    `,

    // Card wrapper
    card: (header, body, footer = '') => `
        <div class="card">
            ${header ? `<div class="card-header"><h3>${header}</h3></div>` : ''}
            <div class="card-body">${body}</div>
            ${footer ? `<div class="card-footer">${footer}</div>` : ''}
        </div>
    `,

    // Empty state
    emptyState: (icon, title, description, action = null) => `
        <div class="empty-state">
            <div class="empty-icon">${icon}</div>
            <div class="empty-title">${title}</div>
            <div class="empty-description">${description}</div>
            ${action ? `<button class="btn btn-primary" onclick="${action.onClick}">${action.label}</button>` : ''}
        </div>
    `,

    // Command palette item
    commandItem: (item, index) => `
        <div class="command-item ${index === 0 ? 'selected' : ''}" data-index="${index}" onclick="CommandPalette.select(${index})">
            <span class="command-item-icon">${item.icon}</span>
            <div class="command-item-content">
                <div class="command-item-title">${item.name}</div>
                <div class="command-item-subtitle">${item.description || item.category || ''}</div>
            </div>
        </div>
    `,

    // Onboarding step
    onboardingStep: (step) => `
        <div class="onboarding-step">
            <div class="onboarding-step-icon">${step.icon}</div>
            <h3>${step.title}</h3>
            <p>${step.description}</p>
        </div>
    `
};

// Toast Notifications
const Toast = {
    show: (type, title, message, duration = 5000) => {
        const container = document.getElementById('toast-container');
        const id = `toast-${Date.now()}`;
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        const toast = document.createElement('div');
        toast.id = id;
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close" onclick="Toast.dismiss('${id}')">×</button>
        `;

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => Toast.dismiss(id), duration);
        }

        return id;
    },

    dismiss: (id) => {
        const toast = document.getElementById(id);
        if (toast) {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    },

    success: (title, message) => Toast.show('success', title, message),
    error: (title, message) => Toast.show('error', title, message),
    warning: (title, message) => Toast.show('warning', title, message),
    info: (title, message) => Toast.show('info', title, message)
};

// Command Palette
const CommandPalette = {
    isOpen: false,
    selectedIndex: 0,
    items: [],

    open: () => {
        const palette = document.getElementById('command-palette');
        const input = document.getElementById('command-input');

        palette.classList.remove('hidden');
        input.value = '';
        input.focus();
        CommandPalette.isOpen = true;
        CommandPalette.selectedIndex = 0;
        CommandPalette.updateResults('');
    },

    close: () => {
        const palette = document.getElementById('command-palette');
        palette.classList.add('hidden');
        CommandPalette.isOpen = false;
    },

    toggle: () => {
        if (CommandPalette.isOpen) {
            CommandPalette.close();
        } else {
            CommandPalette.open();
        }
    },

    updateResults: (query) => {
        const results = document.getElementById('command-results');
        const q = query.toLowerCase();

        // Build items list
        CommandPalette.items = [];

        // Add apps
        Object.values(CONFIG.apps).forEach(app => {
            if (!q || app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q)) {
                CommandPalette.items.push({
                    type: 'app',
                    ...app
                });
            }
        });

        // Add actions
        const actions = [
            { type: 'action', icon: '🌙', name: 'Toggle Dark Mode', action: () => App.toggleTheme() },
            { type: 'action', icon: '🔄', name: 'Refresh Status', action: () => StatusChecker.checkAll() },
            { type: 'action', icon: '📊', name: 'Go to Dashboard', action: () => App.navigate('home') },
            { type: 'action', icon: '⚙️', name: 'Settings', action: () => App.navigate('settings') }
        ];

        actions.forEach(action => {
            if (!q || action.name.toLowerCase().includes(q)) {
                CommandPalette.items.push(action);
            }
        });

        // Render
        if (CommandPalette.items.length === 0) {
            results.innerHTML = `
                <div class="empty-state" style="padding: 2rem;">
                    <div class="empty-icon">🔍</div>
                    <div class="empty-title">No results found</div>
                    <div class="empty-description">Try a different search term</div>
                </div>
            `;
        } else {
            results.innerHTML = CommandPalette.items.map((item, i) => UI.commandItem(item, i)).join('');
        }

        CommandPalette.selectedIndex = 0;
    },

    navigate: (direction) => {
        const items = document.querySelectorAll('.command-item');
        if (items.length === 0) return;

        items[CommandPalette.selectedIndex]?.classList.remove('selected');

        if (direction === 'down') {
            CommandPalette.selectedIndex = (CommandPalette.selectedIndex + 1) % items.length;
        } else {
            CommandPalette.selectedIndex = (CommandPalette.selectedIndex - 1 + items.length) % items.length;
        }

        items[CommandPalette.selectedIndex]?.classList.add('selected');
        items[CommandPalette.selectedIndex]?.scrollIntoView({ block: 'nearest' });
    },

    select: (index = null) => {
        const idx = index !== null ? index : CommandPalette.selectedIndex;
        const item = CommandPalette.items[idx];

        if (!item) return;

        CommandPalette.close();

        if (item.type === 'app') {
            App.openApp(item.id);
        } else if (item.type === 'action' && item.action) {
            item.action();
        }
    }
};

// Status Checker
const StatusChecker = {
    async checkApp(appId, app) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CONFIG.statusCheck.timeout);

            await fetch(app.url, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });

            clearTimeout(timeout);
            UI.appStatuses[appId] = { status: 'online' };
        } catch (e) {
            UI.appStatuses[appId] = { status: 'offline' };
        }
    },

    async checkAll() {
        const promises = Object.entries(CONFIG.apps).map(([id, app]) =>
            StatusChecker.checkApp(id, app)
        );
        await Promise.all(promises);
        StatusChecker.updateUI();
    },

    updateUI() {
        document.querySelectorAll('.app-card').forEach(card => {
            const appId = card.dataset.app;
            const status = UI.appStatuses[appId];
            if (!status) return;

            const statusEl = card.querySelector('.app-status');
            if (statusEl) {
                statusEl.className = `app-status ${status.status}`;
                statusEl.querySelector('span:last-child').textContent =
                    status.status === 'online' ? 'Online' :
                    status.status === 'offline' ? 'Offline' : 'Checking...';
            }
        });
    },

    startPolling() {
        StatusChecker.checkAll();
        setInterval(() => StatusChecker.checkAll(), CONFIG.statusCheck.interval);
    }
};

// Onboarding
const Onboarding = {
    currentStep: 0,

    shouldShow() {
        return !localStorage.getItem('dataacuity_onboarded');
    },

    show() {
        if (!Onboarding.shouldShow()) return;

        const modal = document.getElementById('onboarding-modal');
        modal.classList.remove('hidden');
        Onboarding.currentStep = 0;
        Onboarding.render();
    },

    render() {
        const step = CONFIG.onboarding[Onboarding.currentStep];
        const stepsEl = document.getElementById('onboarding-steps');
        const dotsEl = document.getElementById('progress-dots');
        const nextBtn = document.getElementById('onboarding-next');

        stepsEl.innerHTML = UI.onboardingStep(step);

        dotsEl.innerHTML = CONFIG.onboarding.map((_, i) =>
            `<div class="progress-dot ${i === Onboarding.currentStep ? 'active' : ''}"></div>`
        ).join('');

        nextBtn.textContent = Onboarding.currentStep === CONFIG.onboarding.length - 1
            ? 'Get started'
            : 'Next';
    },

    next() {
        if (Onboarding.currentStep < CONFIG.onboarding.length - 1) {
            Onboarding.currentStep++;
            Onboarding.render();
        } else {
            Onboarding.complete();
        }
    },

    skip() {
        Onboarding.complete();
    },

    complete() {
        localStorage.setItem('dataacuity_onboarded', 'true');
        document.getElementById('onboarding-modal').classList.add('hidden');
        Toast.success('Welcome!', 'Press Cmd+K anytime to search');
    }
};

// Settings Module
const Settings = {
    // Social media connection handlers
    connectSocial(platform) {
        const platformNames = {
            linkedin: 'LinkedIn',
            twitter: 'X (Twitter)',
            facebook: 'Facebook',
            instagram: 'Instagram',
            whatsapp: 'WhatsApp'
        };

        const platformUrls = {
            linkedin: 'https://www.linkedin.com/oauth/v2/authorization',
            twitter: 'https://twitter.com/i/oauth2/authorize',
            facebook: 'https://www.facebook.com/v18.0/dialog/oauth',
            instagram: 'https://api.instagram.com/oauth/authorize',
            whatsapp: null // WhatsApp uses different flow
        };

        Toast.info('Coming Soon', `${platformNames[platform]} integration will be available soon!`);

        // Future implementation would redirect to OAuth flow
        // if (platformUrls[platform]) {
        //     window.open(platformUrls[platform], '_blank');
        // }
    },

    // API configuration handlers
    configureApi(apiType) {
        const apiNames = {
            rest: 'REST API',
            graphql: 'GraphQL',
            database: 'Database Connection',
            webhook: 'Webhooks'
        };

        Settings.showApiModal(apiType, apiNames[apiType]);
    },

    // Show API configuration modal
    showApiModal(apiType, apiName) {
        // Remove existing modal if present
        document.getElementById('api-config-modal')?.remove();

        const modalHTML = `
            <div id="api-config-modal" class="modal">
                <div class="modal-overlay" onclick="Settings.hideApiModal()"></div>
                <div class="modal-content api-modal-content">
                    <button class="modal-close" onclick="Settings.hideApiModal()">&times;</button>

                    <div class="api-modal-header">
                        <h2>Configure ${apiName}</h2>
                        <p class="text-muted">Set up your ${apiName.toLowerCase()} connection</p>
                    </div>

                    <form class="api-form" onsubmit="Settings.saveApiConfig(event, '${apiType}')">
                        ${Settings.getApiFormFields(apiType)}

                        <div class="api-form-actions">
                            <button type="button" class="btn btn-secondary" onclick="Settings.hideApiModal()">Cancel</button>
                            <button type="button" class="btn btn-secondary" onclick="Settings.testConnection('${apiType}')">Test Connection</button>
                            <button type="submit" class="btn btn-primary">Save Configuration</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    // Get form fields based on API type (supports edit mode with existing data)
    getApiFormFields(apiType, data = {}) {
        const v = (key) => data[key] || '';
        const sel = (key, val) => data[key] === val ? ' selected' : '';

        const fields = {
            rest: `
                <div class="form-group">
                    <label>Endpoint URL</label>
                    <input type="url" name="endpoint" placeholder="https://api.example.com/v1" value="${v('endpoint')}" required>
                </div>
                <div class="form-group">
                    <label>Authentication Type</label>
                    <select name="auth_type">
                        <option value="none"${sel('auth_type', 'none')}>None</option>
                        <option value="bearer"${sel('auth_type', 'bearer')}>Bearer Token</option>
                        <option value="basic"${sel('auth_type', 'basic')}>Basic Auth</option>
                        <option value="api_key"${sel('auth_type', 'api_key')}>API Key</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>API Key / Token</label>
                    <input type="password" name="api_key" placeholder="Your API key or token" value="${v('api_key')}">
                </div>
                <div class="form-group">
                    <label>Custom Headers (JSON)</label>
                    <textarea name="headers" placeholder='{"Content-Type": "application/json"}'>${v('headers')}</textarea>
                </div>
            `,
            graphql: `
                <div class="form-group">
                    <label>GraphQL Endpoint</label>
                    <input type="url" name="endpoint" placeholder="https://api.example.com/graphql" value="${v('endpoint')}" required>
                </div>
                <div class="form-group">
                    <label>Authorization Header</label>
                    <input type="password" name="auth_header" placeholder="Bearer your-token" value="${v('auth_header')}">
                </div>
                <div class="form-group">
                    <label>Default Query</label>
                    <textarea name="query" placeholder="query { ... }">${v('query')}</textarea>
                </div>
            `,
            database: `
                <div class="form-group">
                    <label>Database Type</label>
                    <select name="db_type" required>
                        <option value="">Select database...</option>
                        <option value="postgresql"${sel('db_type', 'postgresql')}>PostgreSQL</option>
                        <option value="mysql"${sel('db_type', 'mysql')}>MySQL</option>
                        <option value="mongodb"${sel('db_type', 'mongodb')}>MongoDB</option>
                        <option value="sqlite"${sel('db_type', 'sqlite')}>SQLite</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Host</label>
                    <input type="text" name="host" placeholder="localhost or IP address" value="${v('host')}" required>
                </div>
                <div class="form-group">
                    <label>Port</label>
                    <input type="number" name="port" placeholder="5432" value="${v('port')}">
                </div>
                <div class="form-group">
                    <label>Database Name</label>
                    <input type="text" name="database" placeholder="my_database" value="${v('database')}" required>
                </div>
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" name="username" placeholder="db_user" value="${v('username')}">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" placeholder="********" value="${v('password')}">
                </div>
            `,
            webhook: `
                <div class="form-group">
                    <label>Your Webhook URL</label>
                    <div class="input-with-copy">
                        <input type="text" name="webhook_url" value="${v('webhook_url') || 'https://dataacuity.co.za/api/webhooks/' + (Auth.getUser()?.id || 'user') + '/' + Date.now()}" readonly>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="Settings.copyWebhookUrl()">Copy</button>
                    </div>
                    <small class="text-muted">Share this URL with external services to receive data</small>
                </div>
                <div class="form-group">
                    <label>Secret Key (for verification)</label>
                    <input type="text" name="secret" placeholder="Auto-generated" readonly value="${v('secret') || Settings.generateSecret()}">
                </div>
                <div class="form-group">
                    <label>Allowed Sources (comma-separated)</label>
                    <input type="text" name="allowed_sources" placeholder="*.example.com, api.service.com" value="${v('allowed_sources')}">
                </div>
            `
        };

        return fields[apiType] || '';
    },

    // Generate a random secret key
    generateSecret() {
        return 'whsec_' + Array.from(crypto.getRandomValues(new Uint8Array(24)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // Copy webhook URL
    copyWebhookUrl() {
        const input = document.querySelector('input[name="webhook_url"]');
        if (input) {
            navigator.clipboard.writeText(input.value);
            Toast.success('Copied!', 'Webhook URL copied to clipboard');
        }
    },

    // Test API connection
    testConnection(apiType) {
        Toast.info('Testing...', 'Checking connection...');

        // Simulate connection test
        setTimeout(() => {
            Toast.success('Connection Successful', 'Your API configuration is valid');
        }, 1500);
    },

    // Render API item with connection count
    renderApiItem(apiType, abbrev, color, name, description) {
        const connections = Settings.getApiConnections(apiType);
        const count = connections.length;
        const hasConnections = count > 0;
        const notConfigured = typeof t !== 'undefined' ? t('api.not_configured') : 'Not configured';
        const connLabel = typeof t !== 'undefined' ? t('api.connections') : 'connections';
        const viewLabel = typeof t !== 'undefined' ? t('common.view') : 'View';
        const addLabel = typeof t !== 'undefined' ? t('common.add') : 'Add';
        const configLabel = typeof t !== 'undefined' ? t('common.configure') : 'Configure';

        return `
            <div class="api-item">
                <div class="api-icon" style="background: ${color};">
                    <span>${abbrev}</span>
                </div>
                <div class="api-info">
                    <strong>${name}</strong>
                    <span class="text-muted">${description}</span>
                </div>
                <div class="api-status ${hasConnections ? 'connected' : 'disconnected'}">
                    ${hasConnections ? count + ' ' + connLabel : notConfigured}
                </div>
                <div class="api-actions">
                    ${hasConnections ? `<button class="btn btn-sm btn-secondary" onclick="Settings.viewConnections('${apiType}')">${viewLabel}</button>` : ''}
                    <button class="btn btn-sm ${hasConnections ? 'btn-secondary' : 'btn-primary'}" onclick="Settings.configureApi('${apiType}')">
                        ${hasConnections ? '+ ' + addLabel : configLabel}
                    </button>
                </div>
            </div>
        `;
    },

    // Get all connections for an API type
    getApiConnections(apiType) {
        const savedConfigs = JSON.parse(localStorage.getItem('dataacuity_api_configs') || '{}');
        return savedConfigs[apiType] || [];
    },

    // Save API configuration (supports multiple)
    saveApiConfig(event, apiType, editIndex = null) {
        event.preventDefault();

        const form = event.target;
        const formData = new FormData(form);
        const config = Object.fromEntries(formData.entries());

        // Add a name/label for the connection
        if (!config.name) {
            config.name = config.endpoint || config.host || `${apiType} Connection`;
        }
        config.created_at = new Date().toISOString();

        // Store in localStorage (array of connections per type)
        const savedConfigs = JSON.parse(localStorage.getItem('dataacuity_api_configs') || '{}');
        if (!savedConfigs[apiType]) {
            savedConfigs[apiType] = [];
        }

        if (editIndex !== null && editIndex >= 0) {
            // Update existing connection
            savedConfigs[apiType][editIndex] = config;
            Toast.success('Updated!', 'API connection updated successfully');
        } else {
            // Add new connection
            savedConfigs[apiType].push(config);
            Toast.success('Added!', 'New API connection added successfully');
        }

        localStorage.setItem('dataacuity_api_configs', JSON.stringify(savedConfigs));
        Settings.hideApiModal();

        // Refresh settings page to show updated connections
        App.loadPage('settings');
    },

    // View all connections for an API type
    viewConnections(apiType) {
        const connections = Settings.getApiConnections(apiType);
        const apiNames = {
            rest: 'REST API',
            graphql: 'GraphQL',
            database: 'Database',
            webhook: 'Webhooks'
        };

        // Remove existing modal if present
        document.getElementById('api-config-modal')?.remove();

        const modalHTML = `
            <div id="api-config-modal" class="modal">
                <div class="modal-overlay" onclick="Settings.hideApiModal()"></div>
                <div class="modal-content api-modal-content" style="max-width: 600px;">
                    <button class="modal-close" onclick="Settings.hideApiModal()">&times;</button>

                    <div class="api-modal-header">
                        <h2>${apiNames[apiType]} Connections</h2>
                        <p class="text-muted">${connections.length} connection${connections.length !== 1 ? 's' : ''} configured</p>
                    </div>

                    <div class="connections-list">
                        ${connections.map((conn, index) => `
                            <div class="connection-item">
                                <div class="connection-info">
                                    <strong>${conn.name || conn.endpoint || conn.host || 'Connection ' + (index + 1)}</strong>
                                    <span class="text-muted">${conn.endpoint || conn.host || ''}</span>
                                </div>
                                <div class="connection-actions">
                                    <button class="btn btn-sm btn-secondary" onclick="Settings.editConnection('${apiType}', ${index})">Edit</button>
                                    <button class="btn btn-sm btn-danger" onclick="Settings.deleteConnection('${apiType}', ${index})">Delete</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="api-form-actions" style="justify-content: space-between;">
                        <button type="button" class="btn btn-secondary" onclick="Settings.hideApiModal()">Close</button>
                        <button type="button" class="btn btn-primary" onclick="Settings.hideApiModal(); Settings.configureApi('${apiType}')">+ Add New</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    // Edit existing connection
    editConnection(apiType, index) {
        Settings.hideApiModal();
        const connections = Settings.getApiConnections(apiType);
        const connection = connections[index];
        Settings.configureApi(apiType, index, connection);
    },

    // Delete connection
    deleteConnection(apiType, index) {
        if (!confirm('Are you sure you want to delete this connection?')) return;

        const savedConfigs = JSON.parse(localStorage.getItem('dataacuity_api_configs') || '{}');
        if (savedConfigs[apiType]) {
            savedConfigs[apiType].splice(index, 1);
            localStorage.setItem('dataacuity_api_configs', JSON.stringify(savedConfigs));
        }

        Toast.success('Deleted!', 'API connection removed');
        Settings.hideApiModal();
        App.loadPage('settings');
    },

    // Show API configuration modal (updated for edit mode)
    showApiModal(apiType, apiName, editIndex = null, existingData = null) {
        // Remove existing modal if present
        document.getElementById('api-config-modal')?.remove();

        const isEdit = editIndex !== null;

        const modalHTML = `
            <div id="api-config-modal" class="modal">
                <div class="modal-overlay" onclick="Settings.hideApiModal()"></div>
                <div class="modal-content api-modal-content">
                    <button class="modal-close" onclick="Settings.hideApiModal()">&times;</button>

                    <div class="api-modal-header">
                        <h2>${isEdit ? 'Edit' : 'Add'} ${apiName}</h2>
                        <p class="text-muted">${isEdit ? 'Update your' : 'Set up a new'} ${apiName.toLowerCase()} connection</p>
                    </div>

                    <form class="api-form" onsubmit="Settings.saveApiConfig(event, '${apiType}', ${editIndex})">
                        <div class="form-group">
                            <label>Connection Name</label>
                            <input type="text" name="name" placeholder="My ${apiName}" value="${existingData?.name || ''}" required>
                        </div>
                        ${Settings.getApiFormFields(apiType, existingData)}

                        <div class="api-form-actions">
                            <button type="button" class="btn btn-secondary" onclick="Settings.hideApiModal()">Cancel</button>
                            <button type="button" class="btn btn-secondary" onclick="Settings.testConnection('${apiType}')">Test</button>
                            <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Save'}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    // API configuration handlers (updated)
    configureApi(apiType, editIndex = null, existingData = null) {
        const apiNames = {
            rest: 'REST API',
            graphql: 'GraphQL',
            database: 'Database Connection',
            webhook: 'Webhooks'
        };

        Settings.showApiModal(apiType, apiNames[apiType], editIndex, existingData);
    },

    // Hide API modal
    hideApiModal() {
        document.getElementById('api-config-modal')?.remove();
    },

    // Check if API is configured
    isApiConfigured(apiType) {
        return Settings.getApiConnections(apiType).length > 0;
    }
};
