// AutoBiz UI Components
// Template marketplace, configuration wizard, and deployment management

const AutoBizUI = {
    // Current state
    state: {
        view: 'marketplace', // marketplace, detail, configure, deploy, manage
        selectedTemplates: [],
        selectedCategory: null,
        configStep: 1,
        envValues: {},
        deploymentProgress: null
    },

    // Initialize
    init() {
        // Load saved env values
        this.state.envValues = AutoBizTemplates.getEnvironmentVariables();
        // Load saved selected templates
        const saved = localStorage.getItem('autobiz_selected_templates');
        if (saved) {
            this.state.selectedTemplates = JSON.parse(saved);
        }
    },

    // Save selected templates
    saveSelectedTemplates() {
        localStorage.setItem('autobiz_selected_templates',
            JSON.stringify(this.state.selectedTemplates));
    },

    // Toggle template selection
    toggleTemplate(templateId) {
        const idx = this.state.selectedTemplates.indexOf(templateId);
        if (idx === -1) {
            this.state.selectedTemplates.push(templateId);
        } else {
            this.state.selectedTemplates.splice(idx, 1);
        }
        this.saveSelectedTemplates();
        this.refreshView();
    },

    // Select all templates in a category
    selectCategory(categoryId) {
        const templates = AutoBizTemplates.getByCategory(categoryId);
        templates.forEach(t => {
            if (!this.state.selectedTemplates.includes(t.id)) {
                this.state.selectedTemplates.push(t.id);
            }
        });
        this.saveSelectedTemplates();
        this.refreshView();
    },

    // Deselect all templates in a category
    deselectCategory(categoryId) {
        const templates = AutoBizTemplates.getByCategory(categoryId);
        templates.forEach(t => {
            const idx = this.state.selectedTemplates.indexOf(t.id);
            if (idx !== -1) {
                this.state.selectedTemplates.splice(idx, 1);
            }
        });
        this.saveSelectedTemplates();
        this.refreshView();
    },

    // Check if template is selected
    isSelected(templateId) {
        return this.state.selectedTemplates.includes(templateId);
    },

    // Check if all templates in category are selected
    isCategoryFullySelected(categoryId) {
        const templates = AutoBizTemplates.getByCategory(categoryId);
        return templates.every(t => this.state.selectedTemplates.includes(t.id));
    },

    // Get count of selected in category
    getSelectedCountInCategory(categoryId) {
        const templates = AutoBizTemplates.getByCategory(categoryId);
        return templates.filter(t => this.state.selectedTemplates.includes(t.id)).length;
    },

    // Refresh current view
    refreshView() {
        const container = document.getElementById('autobiz-content');
        if (container) {
            container.innerHTML = this.renderCurrentView();
            this.attachEventListeners();
        }
    },

    // Render current view based on state
    renderCurrentView() {
        switch (this.state.view) {
            case 'marketplace': return this.renderMarketplace();
            case 'detail': return this.renderTemplateDetail();
            case 'configure': return this.renderConfigureWizard();
            case 'deploy': return this.renderDeployProgress();
            case 'manage': return this.renderManageDashboard();
            default: return this.renderMarketplace();
        }
    },

    // Main marketplace view
    renderMarketplace() {
        const categories = AutoBizTemplates.getAllCategories();
        const selectedCount = this.state.selectedTemplates.length;

        return `
            <div class="autobiz-marketplace">
                <!-- Header -->
                <div class="marketplace-header">
                    <div class="header-content">
                        <h1>Workflow Templates</h1>
                        <p>Select the automation workflows you need for your business</p>
                    </div>
                    <div class="header-actions">
                        ${selectedCount > 0 ? `
                            <span class="selected-count">${selectedCount} selected</span>
                            <button class="btn btn-primary" onclick="AutoBizUI.startConfigure()">
                                Configure Selected →
                            </button>
                        ` : `
                            <button class="btn btn-secondary" onclick="AutoBizUI.selectAll()">
                                Select All (27)
                            </button>
                        `}
                    </div>
                </div>

                <!-- Quick Stats -->
                <div class="marketplace-stats">
                    <div class="stat-pill">
                        <span class="stat-icon">📦</span>
                        <span>6 Categories</span>
                    </div>
                    <div class="stat-pill">
                        <span class="stat-icon">⚡</span>
                        <span>27 Workflows</span>
                    </div>
                    <div class="stat-pill selected">
                        <span class="stat-icon">✓</span>
                        <span>${selectedCount} Selected</span>
                    </div>
                </div>

                <!-- Categories Grid -->
                <div class="categories-grid">
                    ${categories.map(cat => this.renderCategoryCard(cat)).join('')}
                </div>

                <!-- Bottom Action Bar (sticky) -->
                ${selectedCount > 0 ? `
                    <div class="action-bar">
                        <div class="action-bar-content">
                            <div class="action-info">
                                <strong>${selectedCount} workflows</strong> ready to configure
                            </div>
                            <div class="action-buttons">
                                <button class="btn btn-secondary" onclick="AutoBizUI.clearSelection()">
                                    Clear
                                </button>
                                <button class="btn btn-primary btn-lg" onclick="AutoBizUI.startConfigure()">
                                    Configure & Deploy →
                                </button>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    },

    // Render a category card with its templates
    renderCategoryCard(category) {
        const templates = AutoBizTemplates.getByCategory(category.id);
        const selectedCount = this.getSelectedCountInCategory(category.id);
        const allSelected = this.isCategoryFullySelected(category.id);

        return `
            <div class="category-card" style="--category-color: ${category.color}">
                <div class="category-header">
                    <div class="category-title">
                        <span class="category-icon">${category.icon}</span>
                        <h3>${category.name}</h3>
                    </div>
                    <button class="category-toggle ${allSelected ? 'selected' : ''}"
                            onclick="AutoBizUI.${allSelected ? 'deselect' : 'select'}Category('${category.id}')">
                        ${allSelected ? '✓ All' : `Select All (${templates.length})`}
                    </button>
                </div>
                <p class="category-desc">${category.description}</p>

                <div class="template-list">
                    ${templates.map(t => this.renderTemplateItem(t)).join('')}
                </div>

                <div class="category-footer">
                    <span class="selection-count">${selectedCount}/${templates.length} selected</span>
                </div>
            </div>
        `;
    },

    // Render a template item
    renderTemplateItem(template) {
        const isSelected = this.isSelected(template.id);
        const difficultyColors = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' };

        return `
            <div class="template-item ${isSelected ? 'selected' : ''}"
                 onclick="AutoBizUI.toggleTemplate('${template.id}')">
                <div class="template-checkbox">
                    ${isSelected ? '✓' : ''}
                </div>
                <div class="template-info">
                    <div class="template-name">
                        <span class="template-icon">${template.icon}</span>
                        ${template.name}
                    </div>
                    <div class="template-meta">
                        <span class="template-trigger">${template.trigger}</span>
                        <span class="template-difficulty" style="color: ${difficultyColors[template.difficulty]}">${template.difficulty}</span>
                    </div>
                </div>
                <button class="template-info-btn" onclick="event.stopPropagation(); AutoBizUI.showDetail('${template.id}')">
                    ℹ️
                </button>
            </div>
        `;
    },

    // Template detail modal
    renderTemplateDetail() {
        const template = AutoBizTemplates.get(this.state.detailTemplateId);
        if (!template) return '';

        const category = AutoBizTemplates.getCategory(template.category);
        const envVars = AutoBizTemplates.getRequiredEnvVars(template.id);
        const isSelected = this.isSelected(template.id);

        return `
            <div class="template-detail-overlay" onclick="AutoBizUI.closeDetail()">
                <div class="template-detail-modal" onclick="event.stopPropagation()">
                    <button class="modal-close" onclick="AutoBizUI.closeDetail()">×</button>

                    <div class="detail-header" style="--category-color: ${category.color}">
                        <span class="detail-icon">${template.icon}</span>
                        <div class="detail-title">
                            <h2>${template.name}</h2>
                            <span class="detail-category">${category.icon} ${category.name}</span>
                        </div>
                    </div>

                    <div class="detail-body">
                        <p class="detail-description">${template.description}</p>

                        <div class="detail-section">
                            <h4>Features</h4>
                            <ul class="feature-list">
                                ${template.features.map(f => `<li>✓ ${f}</li>`).join('')}
                            </ul>
                        </div>

                        <div class="detail-section">
                            <h4>Trigger</h4>
                            <p class="trigger-info">${template.trigger}</p>
                            ${template.webhookPath ? `
                                <code class="webhook-path">POST /webhook/${template.webhookPath}</code>
                            ` : ''}
                        </div>

                        <div class="detail-section">
                            <h4>Required Configuration</h4>
                            <div class="env-vars-list">
                                ${envVars.map(v => `
                                    <div class="env-var-item">
                                        <span class="env-var-name">${v.label}</span>
                                        <span class="env-var-desc">${v.description}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="detail-footer">
                        <button class="btn ${isSelected ? 'btn-secondary' : 'btn-primary'}"
                                onclick="AutoBizUI.toggleTemplate('${template.id}'); AutoBizUI.closeDetail()">
                            ${isSelected ? 'Remove from Selection' : 'Add to Selection'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // Configuration wizard
    renderConfigureWizard() {
        const totalSteps = 3;
        const step = this.state.configStep;
        const selectedTemplates = this.state.selectedTemplates.map(id => AutoBizTemplates.get(id));
        const requiredEnvVars = AutoBizTemplates.getEnvVarsForTemplates(this.state.selectedTemplates);

        // Group env vars by category
        const envVarsByCategory = {};
        requiredEnvVars.forEach(v => {
            const cat = v.category || 'other';
            if (!envVarsByCategory[cat]) envVarsByCategory[cat] = [];
            envVarsByCategory[cat].push(v);
        });

        return `
            <div class="config-wizard">
                <!-- Progress -->
                <div class="wizard-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${(step / totalSteps) * 100}%"></div>
                    </div>
                    <div class="progress-steps">
                        <div class="progress-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}">
                            <span class="step-dot">${step > 1 ? '✓' : '1'}</span>
                            <span class="step-label">Review</span>
                        </div>
                        <div class="progress-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}">
                            <span class="step-dot">${step > 2 ? '✓' : '2'}</span>
                            <span class="step-label">Configure</span>
                        </div>
                        <div class="progress-step ${step >= 3 ? 'active' : ''}">
                            <span class="step-dot">3</span>
                            <span class="step-label">Deploy</span>
                        </div>
                    </div>
                </div>

                <!-- Step Content -->
                <div class="wizard-content">
                    ${step === 1 ? this.renderConfigStep1(selectedTemplates) : ''}
                    ${step === 2 ? this.renderConfigStep2(envVarsByCategory) : ''}
                    ${step === 3 ? this.renderConfigStep3() : ''}
                </div>

                <!-- Navigation -->
                <div class="wizard-nav">
                    <button class="btn btn-secondary"
                            onclick="${step === 1 ? 'AutoBizUI.backToMarketplace()' : 'AutoBizUI.prevConfigStep()'}">
                        ← ${step === 1 ? 'Back to Templates' : 'Back'}
                    </button>
                    ${step < 3 ? `
                        <button class="btn btn-primary" onclick="AutoBizUI.nextConfigStep()">
                            Continue →
                        </button>
                    ` : `
                        <button class="btn btn-primary btn-lg" onclick="AutoBizUI.startDeployment()">
                            🚀 Deploy to n8n
                        </button>
                    `}
                </div>
            </div>
        `;
    },

    // Step 1: Review selected templates
    renderConfigStep1(selectedTemplates) {
        // Group by category
        const byCategory = {};
        selectedTemplates.forEach(t => {
            if (!byCategory[t.category]) byCategory[t.category] = [];
            byCategory[t.category].push(t);
        });

        return `
            <div class="config-step">
                <h2>Review Selected Workflows</h2>
                <p>You've selected ${selectedTemplates.length} workflows to deploy</p>

                <div class="review-categories">
                    ${Object.entries(byCategory).map(([catId, templates]) => {
                        const cat = AutoBizTemplates.getCategory(catId);
                        return `
                            <div class="review-category">
                                <h4>${cat.icon} ${cat.name}</h4>
                                <div class="review-templates">
                                    ${templates.map(t => `
                                        <div class="review-template">
                                            <span>${t.icon} ${t.name}</span>
                                            <button class="remove-btn" onclick="AutoBizUI.toggleTemplate('${t.id}')">×</button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="review-summary">
                    <p>These workflows will be deployed to your n8n instance at:</p>
                    <code>${AutoBizTemplates.n8nConfig.baseUrl.replace('/api/v1', '')}</code>
                </div>
            </div>
        `;
    },

    // Step 2: Configure environment variables
    renderConfigStep2(envVarsByCategory) {
        const categoryLabels = {
            business: 'Business Information',
            email: 'Email Settings',
            finance: 'Finance Settings',
            service: 'Customer Service',
            sales: 'Sales Settings',
            admin: 'Admin Settings',
            integrations: 'Integrations',
            other: 'Other Settings'
        };

        return `
            <div class="config-step">
                <h2>Configure Your Workflows</h2>
                <p>Set up the variables your workflows will use</p>

                <div class="config-form">
                    ${Object.entries(envVarsByCategory).map(([category, vars]) => `
                        <div class="config-section">
                            <h4>${categoryLabels[category] || category}</h4>
                            <div class="config-fields">
                                ${vars.map(v => this.renderConfigField(v)).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    // Render a config field
    renderConfigField(envVar) {
        const value = this.state.envValues[envVar.key] || envVar.default || '';
        const isRequired = envVar.required && !envVar.optional;

        if (envVar.type === 'select') {
            return `
                <div class="config-field">
                    <label>${envVar.label}${isRequired ? ' *' : ''}</label>
                    <select class="form-input"
                            onchange="AutoBizUI.updateEnvValue('${envVar.key}', this.value)"
                            ${isRequired ? 'required' : ''}>
                        ${envVar.options.map(opt => `
                            <option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>
                        `).join('')}
                    </select>
                    <span class="field-desc">${envVar.description}</span>
                </div>
            `;
        }

        return `
            <div class="config-field">
                <label>${envVar.label}${isRequired ? ' *' : ''}</label>
                <input type="${envVar.type === 'email' ? 'email' : envVar.type === 'url' ? 'url' : envVar.type === 'number' ? 'number' : envVar.type === 'tel' ? 'tel' : envVar.type === 'time' ? 'time' : 'text'}"
                       class="form-input"
                       value="${value}"
                       placeholder="${envVar.default || ''}"
                       onchange="AutoBizUI.updateEnvValue('${envVar.key}', this.value)"
                       ${isRequired ? 'required' : ''}>
                <span class="field-desc">${envVar.description}</span>
            </div>
        `;
    },

    // Step 3: API key and final confirmation
    renderConfigStep3() {
        const apiKey = AutoBizTemplates.getApiKey() || '';
        const hasApiKey = !!apiKey;

        return `
            <div class="config-step">
                <h2>Ready to Deploy</h2>
                <p>Connect to n8n and deploy your workflows</p>

                <div class="deploy-setup">
                    <div class="setup-section">
                        <h4>n8n API Key</h4>
                        <p class="setup-desc">
                            Required to deploy workflows.
                            <a href="https://n8n.dataacuity.co.za/settings/api" target="_blank">Get your API key →</a>
                        </p>
                        <div class="api-key-input">
                            <input type="password"
                                   class="form-input"
                                   id="n8n-api-key"
                                   value="${apiKey}"
                                   placeholder="Enter your n8n API key"
                                   onchange="AutoBizUI.updateApiKey(this.value)">
                            <button class="btn btn-secondary" onclick="AutoBizUI.testConnection()">
                                Test Connection
                            </button>
                        </div>
                        <div id="connection-status"></div>
                    </div>

                    <div class="setup-section">
                        <h4>Deployment Summary</h4>
                        <div class="deploy-summary">
                            <div class="summary-item">
                                <span class="summary-label">Workflows</span>
                                <span class="summary-value">${this.state.selectedTemplates.length}</span>
                            </div>
                            <div class="summary-item">
                                <span class="summary-label">Target</span>
                                <span class="summary-value">n8n.dataacuity.co.za</span>
                            </div>
                            <div class="summary-item">
                                <span class="summary-label">Status</span>
                                <span class="summary-value ${hasApiKey ? 'ready' : 'pending'}">
                                    ${hasApiKey ? '✓ Ready' : '⏳ Need API Key'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Deployment progress view
    renderDeployProgress() {
        const progress = this.state.deploymentProgress || {};
        const results = progress.results || { success: [], failed: [] };

        return `
            <div class="deploy-progress">
                <div class="deploy-header">
                    ${progress.complete ? `
                        <span class="deploy-icon">${results.failed.length === 0 ? '✅' : '⚠️'}</span>
                        <h2>${results.failed.length === 0 ? 'Deployment Complete!' : 'Deployment Finished with Errors'}</h2>
                    ` : `
                        <span class="deploy-icon spinning">⚙️</span>
                        <h2>Deploying Workflows...</h2>
                    `}
                </div>

                <div class="deploy-progress-bar">
                    <div class="progress-fill" style="width: ${(progress.current / progress.total) * 100 || 0}%"></div>
                </div>
                <p class="deploy-status">${progress.current || 0} of ${progress.total || 0} workflows</p>

                <div class="deploy-results">
                    ${results.success.length > 0 ? `
                        <div class="result-section success">
                            <h4>✓ Successfully Deployed (${results.success.length})</h4>
                            <ul>
                                ${results.success.map(r => `<li>${r.name}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    ${results.failed.length > 0 ? `
                        <div class="result-section failed">
                            <h4>✗ Failed (${results.failed.length})</h4>
                            <ul>
                                ${results.failed.map(r => `<li>${r.templateId}: ${r.error}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>

                ${progress.complete ? `
                    <div class="deploy-actions">
                        <button class="btn btn-secondary" onclick="AutoBizUI.backToMarketplace()">
                            Back to Templates
                        </button>
                        <a href="https://n8n.dataacuity.co.za" target="_blank" class="btn btn-primary">
                            Open n8n →
                        </a>
                    </div>
                ` : ''}
            </div>
        `;
    },

    // Management dashboard
    renderManageDashboard() {
        return `
            <div class="manage-dashboard">
                <h2>Deployed Workflows</h2>
                <p>Manage your AutoBiz workflows</p>
                <div id="deployed-workflows-list">
                    <p class="loading">Loading workflows...</p>
                </div>
            </div>
        `;
    },

    // Navigation methods
    backToMarketplace() {
        this.state.view = 'marketplace';
        this.state.configStep = 1;
        this.refreshView();
    },

    showDetail(templateId) {
        this.state.detailTemplateId = templateId;
        this.state.view = 'detail';
        this.refreshView();
    },

    closeDetail() {
        this.state.view = 'marketplace';
        this.state.detailTemplateId = null;
        this.refreshView();
    },

    startConfigure() {
        if (this.state.selectedTemplates.length === 0) {
            App.showToast('Please select at least one workflow', 'warning');
            return;
        }
        this.state.view = 'configure';
        this.state.configStep = 1;
        this.refreshView();
    },

    nextConfigStep() {
        if (this.state.configStep < 3) {
            this.state.configStep++;
            this.refreshView();
        }
    },

    prevConfigStep() {
        if (this.state.configStep > 1) {
            this.state.configStep--;
            this.refreshView();
        }
    },

    selectAll() {
        this.state.selectedTemplates = AutoBizTemplates.getAll().map(t => t.id);
        this.saveSelectedTemplates();
        this.refreshView();
    },

    clearSelection() {
        this.state.selectedTemplates = [];
        this.saveSelectedTemplates();
        this.refreshView();
    },

    // Config methods
    updateEnvValue(key, value) {
        this.state.envValues[key] = value;
        AutoBizTemplates.setEnvironmentVariables({ [key]: value });
    },

    updateApiKey(key) {
        AutoBizTemplates.setApiKey(key);
    },

    async testConnection() {
        const statusEl = document.getElementById('connection-status');
        statusEl.innerHTML = '<span class="testing">Testing connection...</span>';

        try {
            const success = await AutoBizTemplates.testConnection();
            if (success) {
                statusEl.innerHTML = '<span class="success">✓ Connected to n8n</span>';
            } else {
                statusEl.innerHTML = '<span class="error">✗ Connection failed. Check your API key.</span>';
            }
        } catch (e) {
            statusEl.innerHTML = `<span class="error">✗ ${e.message}</span>`;
        }
    },

    // Deployment
    async startDeployment() {
        if (!AutoBizTemplates.getApiKey()) {
            App.showToast('Please enter your n8n API key', 'error');
            return;
        }

        this.state.view = 'deploy';
        this.state.deploymentProgress = {
            current: 0,
            total: this.state.selectedTemplates.length,
            complete: false,
            results: { success: [], failed: [] }
        };
        this.refreshView();

        try {
            const results = await AutoBizTemplates.deployWorkflows(
                this.state.selectedTemplates,
                this.state.envValues,
                (progress) => {
                    this.state.deploymentProgress = {
                        ...this.state.deploymentProgress,
                        current: progress.current,
                        status: progress.status
                    };
                    this.refreshView();
                }
            );

            this.state.deploymentProgress = {
                ...this.state.deploymentProgress,
                complete: true,
                results
            };

            // Clear selection on success
            if (results.failed.length === 0) {
                this.state.selectedTemplates = [];
                this.saveSelectedTemplates();
            }

            this.refreshView();
        } catch (e) {
            App.showToast('Deployment error: ' + e.message, 'error');
        }
    },

    // Attach event listeners
    attachEventListeners() {
        // Any dynamic event listeners can be attached here
    },

    // Render the main AutoBiz page
    render() {
        this.init();

        return `
            <div class="container">
                <div class="page-header autobiz-page-header">
                    <div class="header-left">
                        <h1>AutoBiz</h1>
                        <p>Business automation workflows</p>
                    </div>
                    <div class="header-right">
                        <button class="btn btn-secondary" onclick="AutoBizUI.state.view = 'manage'; AutoBizUI.refreshView();">
                            Manage Deployed
                        </button>
                    </div>
                </div>

                <div id="autobiz-content">
                    ${this.renderCurrentView()}
                </div>
            </div>
        `;
    }
};

// Make globally available
window.AutoBizUI = AutoBizUI;
