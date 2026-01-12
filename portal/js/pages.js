// DataAcuity Portal - Page Definitions

const Pages = {
    // Public landing page for unauthenticated users
    landing: () => {
        return `
            <div class="landing-page">
                <div class="landing-hero">
                    <div class="hero-content">
                        <h1>${t('landing.title')}</h1>
                        <p class="hero-subtitle">${t('landing.subtitle')}</p>
                        <div class="hero-actions">
                            <button class="btn btn-primary btn-lg" onclick="Auth.login()">
                                ${t('nav.sign_in')}
                            </button>
                            <button class="btn btn-secondary btn-lg" onclick="Auth.register()">
                                ${t('landing.create_account')}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="landing-features">
                    <h2>${t('landing.features_title')}</h2>
                    <div class="features-grid">
                        <div class="feature-card">
                            <span class="feature-icon">📊</span>
                            <h3>${t('landing.feature_analytics')}</h3>
                            <p>${t('landing.feature_analytics_desc')}</p>
                        </div>
                        <div class="feature-card">
                            <span class="feature-icon">⚡</span>
                            <h3>${t('landing.feature_automation')}</h3>
                            <p>${t('landing.feature_automation_desc')}</p>
                        </div>
                        <div class="feature-card">
                            <span class="feature-icon">🔄</span>
                            <h3>${t('landing.feature_sync')}</h3>
                            <p>${t('landing.feature_sync_desc')}</p>
                        </div>
                        <div class="feature-card">
                            <span class="feature-icon">🧠</span>
                            <h3>${t('landing.feature_ai')}</h3>
                            <p>${t('landing.feature_ai_desc')}</p>
                        </div>
                    </div>
                </div>

                <div class="landing-cta">
                    <button class="btn btn-primary btn-lg" onclick="Auth.loginWithGoogle()">
                        <svg viewBox="0 0 24 24" width="18" height="18" style="margin-right: 8px;">
                            <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        ${t('landing.continue_google')}
                    </button>
                    <p style="margin-top: 1rem; color: var(--text-secondary);">
                        <a href="#" onclick="App.navigate('pricing'); return false;" style="color: var(--primary);">${t('landing.view_pricing')}</a> - ${t('landing.starting_at')}
                    </p>
                </div>
            </div>
        `;
    },

    // Free tier dashboard with limited functionality
    freeDashboard: () => {
        const user = Auth.getUser();
        const firstName = user?.firstName || user?.name?.split(' ')[0] || t('home.there');

        return `
            <div class="home-page">
                <div class="home-header">
                    <h1>${t('home.greeting_' + App.getGreeting())}, ${firstName}</h1>
                    <p class="home-subtitle">Start learning and building today</p>
                </div>

                <!-- All Free Tools in One Card -->
                <div class="section-card">
                    <h3 class="section-title">Your Free Tools</h3>
                    <div class="free-tools-grid">
                        <a href="https://dataacuity.co.za/learn/" target="_blank" class="tool-card" style="text-decoration: none;">
                            <span class="tool-icon">📚</span>
                            <span class="tool-name">Python Tutorials</span>
                            <span class="tool-limit">Interactive lessons</span>
                        </a>
                        <a href="https://dataacuity.co.za/studio/" target="_blank" class="tool-card" style="text-decoration: none;">
                            <span class="tool-icon">🎨</span>
                            <span class="tool-name">Web Builder</span>
                            <span class="tool-limit">Unlimited</span>
                        </a>
                        <a href="https://dataacuity.co.za/maps/" target="_blank" class="tool-card" style="text-decoration: none;">
                            <span class="tool-icon">🗺️</span>
                            <span class="tool-name">Maps Explorer</span>
                            <span class="tool-limit">Unlimited</span>
                        </a>
                        <button class="tool-card" onclick="App.openApp('automatisch')">
                            <span class="tool-icon">⚡</span>
                            <span class="tool-name">Quick Automate</span>
                            <span class="tool-limit">10 automations</span>
                        </button>
                        <button class="tool-card" onclick="App.openApp('markets')">
                            <span class="tool-icon">📈</span>
                            <span class="tool-name">Stock Tracker</span>
                            <span class="tool-limit">Unlimited</span>
                        </button>
                        <button class="tool-card" onclick="App.openApp('bio')">
                            <span class="tool-icon">🔗</span>
                            <span class="tool-name">Link Page</span>
                            <span class="tool-limit">1 page</span>
                        </button>
                    </div>
                </div>

                <!-- Upgrade CTA -->
                <div class="upgrade-card">
                    <div class="upgrade-text">
                        <h4>Want more power?</h4>
                        <p>Unlock AI, advanced workflows, CRM, and analytics</p>
                    </div>
                    <button class="btn-upgrade" onclick="App.navigate('pricing')">
                        View Plans
                    </button>
                </div>
            </div>
        `;
    },

    // Dashboard / Home (protected + paywall)
    home: () => {
        if (!Auth.isAuthenticated()) {
            return Pages.landing();
        }

        // Check if user has paid subscription - show limited dashboard for free tier
        if (Auth.isFreeTier()) {
            return Pages.freeDashboard();
        }

        const user = Auth.getUser();
        const firstName = user?.firstName || user?.name?.split(' ')[0] || t('home.there');

        // Core actions - ordered: Learning, AI & Dev, Automation, Productivity
        const coreActions = [
            { icon: '📚', label: 'Learn Python', desc: 'Interactive tutorials', action: "window.open('https://dataacuity.co.za/learn/', '_blank')" },
            { icon: '🧠', label: 'Ask AI', desc: 'Get AI help', action: "App.openApp('ai')" },
            { icon: '⚡', label: 'Automate', desc: 'Create workflows', action: "App.openApp('workflows')" },
            { icon: '📊', label: 'Analytics', desc: 'Charts & reports', action: "App.openApp('analytics')" },
        ];

        // Quick tools - more options
        const quickTools = [
            { icon: '🎨', label: 'Web Builder', action: "window.open('https://dataacuity.co.za/studio/', '_blank')" },
            { icon: '🗺️', label: 'Maps', action: "window.open('https://dataacuity.co.za/maps/', '_blank')" },
            { icon: '👥', label: 'Contacts', action: "App.openApp('crm')" },
            { icon: '📈', label: 'Stocks', action: "App.openApp('markets')" },
            { icon: '📁', label: 'File Tools', action: "App.openApp('converter')" },
            { icon: '🔗', label: 'Link Page', action: "App.openApp('bio')" },
        ];

        // Online apps count
        const onlineCount = Object.values(UI.appStatuses || {}).filter(s => s.status === 'online').length;
        const totalApps = Object.keys(CONFIG.apps).length;

        return `
            <div class="home-page">
                <!-- Clean Header -->
                <div class="home-header">
                    <h1>${t('home.greeting_' + App.getGreeting())}, ${firstName}</h1>
                    <p class="home-subtitle">What would you like to work on today?</p>
                </div>

                <!-- Main Actions Grid -->
                <div class="actions-grid">
                    ${coreActions.map(a => `
                        <button class="action-card" onclick="${a.action}">
                            <span class="action-icon">${a.icon}</span>
                            <div class="action-text">
                                <span class="action-label">${a.label}</span>
                                <span class="action-desc">${a.desc}</span>
                            </div>
                        </button>
                    `).join('')}
                </div>

                <!-- Quick Tools -->
                <div class="quick-tools">
                    <h3>Quick Tools</h3>
                    <div class="tools-row">
                        ${quickTools.map(t => `
                            <button class="tool-btn" onclick="${t.action}" title="${t.label}">
                                <span>${t.icon}</span>
                                <span>${t.label}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Minimal Status -->
                <div class="status-bar">
                    <span class="status-item ${onlineCount > 0 ? 'status-ok' : 'status-warn'}">
                        <span class="status-dot"></span>
                        ${onlineCount}/${totalApps} services online
                    </span>
                    <button class="status-link" onclick="App.navigate('apps')">
                        View all apps
                    </button>
                </div>
            </div>
        `;
    },

    // All Apps (protected)
    apps: () => {
        if (!Auth.isAuthenticated()) {
            return Pages.requireAuth();
        }

        const isFreeTier = Auth.isFreeTier();
        const allApps = Object.values(CONFIG.apps)
            .filter(app => Pages.canAccessApp(app));

        return `
            <div class="container">
                <div class="page-header">
                    <h1>${t('apps.title')}</h1>
                    <p>${t('apps.subtitle')}</p>
                </div>

                <div class="page-content">
                    <div class="apps-grid">
                        ${allApps.map(app => {
                            // Free tier users: lock apps that aren't marked as freeTier
                            const isLocked = isFreeTier && !app.freeTier;
                            return UI.appCard(app, isLocked);
                        }).join('')}
                    </div>
                    ${isFreeTier ? `
                    <div style="text-align: center; margin-top: 1.5rem;">
                        <a href="#" onclick="App.navigate('pricing'); return false;" style="color: var(--primary); text-decoration: none; font-size: 0.875rem;">
                            See all plans →
                        </a>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // Analytics (protected)
    analytics: () => {
        if (!Auth.isAuthenticated()) {
            return Pages.requireAuth();
        }

        const isFreeTier = Auth.isFreeTier();
        const analyticsApps = [CONFIG.apps.analytics, CONFIG.apps.markets]
            .filter(app => app && Pages.canAccessApp(app));

        if (!isFreeTier && Pages.canAccessApp(CONFIG.apps.grafana)) {
            analyticsApps.push(CONFIG.apps.grafana);
        }

        return `
            <div class="container">
                <div class="page-header">
                    <h1>${t('analytics.title')}</h1>
                    <p>${t('analytics.subtitle')}</p>
                </div>

                <div class="page-content">
                    <div class="stats-grid mb-4">
                        ${UI.statCard('📈', t('analytics.total_revenue'), isFreeTier ? '--' : '$124.5K', isFreeTier ? null : 12, isFreeTier ? 'gray' : 'green')}
                        ${UI.statCard('👥', t('analytics.new_users'), isFreeTier ? '--' : '847', isFreeTier ? null : 23, isFreeTier ? 'gray' : 'blue')}
                        ${UI.statCard('📊', t('analytics.page_views'), isFreeTier ? '--' : '45.2K', isFreeTier ? null : 8, isFreeTier ? 'gray' : 'blue')}
                        ${UI.statCard('💰', t('analytics.conversion'), isFreeTier ? '--' : '3.2%', isFreeTier ? null : -2, isFreeTier ? 'gray' : 'orange')}
                    </div>

                    <div class="mb-4">
                        <div class="card">
                            <div class="card-header">
                                <h3>${t('analytics.tools')}</h3>
                            </div>
                            <div class="card-body">
                                <div class="apps-grid">
                                    ${analyticsApps.map(app => {
                                        const isLocked = isFreeTier && !app.freeTier;
                                        return UI.appCard(app, isLocked);
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="mt-4">
                        ${UI.card(t('analytics.quick_access'), `
                            <div class="quick-actions">
                                ${UI.quickAction('📊', t('analytics.open_superset'), isFreeTier ? "App.navigate('pricing')" : "App.openApp('analytics')", isFreeTier)}
                                ${UI.quickAction('📈', t('analytics.market_data'), "App.openApp('markets')")}
                                ${!isFreeTier && Auth.isAdmin() ? UI.quickAction('📉', t('analytics.system_metrics'), "App.openApp('grafana')") : ''}
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        `;
    },

    // Workflows (protected)
    workflows: () => {
        if (!Auth.isAuthenticated()) {
            return Pages.requireAuth();
        }

        const isFreeTier = Auth.isFreeTier();
        const workflows = isFreeTier ? [
            { icon: '➕', app: 'Get started with Quick Automate', action: 'Connect your apps and automate tasks', time: '0/10 used' }
        ] : [
            { icon: '📧', app: 'Email Digest', action: 'runs daily at 9 AM', time: 'Active' },
            { icon: '🔄', app: 'Data Sync', action: 'syncs every hour', time: 'Active' },
            { icon: '📊', app: 'Weekly Report', action: 'runs Mondays at 8 AM', time: 'Active' },
            { icon: '🔔', app: 'Alert Monitor', action: 'checks every 5 minutes', time: 'Active' }
        ];

        // Automation apps: Quick Automate (free), Workflow Studio (pro), Connect Apps (pro)
        const automationApps = isFreeTier
            ? [CONFIG.apps.automatisch].filter(Boolean)
            : [CONFIG.apps.workflows, CONFIG.apps.automatisch, CONFIG.apps.etl].filter(a => a && Pages.canAccessApp(a));

        return `
            <div class="container">
                <div class="page-header">
                    <h1>${t('workflows.title')}</h1>
                    <p>${t('workflows.subtitle')}</p>
                </div>

                <div class="page-content">
                    <div class="stats-grid mb-4">
                        ${UI.statCard('⚡', 'Quick Automate', isFreeTier ? '0/10' : '5', null, 'blue')}
                        ${UI.statCard('🏗️', 'Workflow Studio', isFreeTier ? 'Pro' : '7', null, 'blue')}
                        ${UI.statCard('✓', t('workflows.runs_today'), isFreeTier ? '0' : '45', isFreeTier ? null : 12, 'blue')}
                        ${UI.statCard('🔗', t('workflows.connections'), isFreeTier ? '0' : '12', null, 'blue')}
                    </div>

                    <!-- Automation Tools - Large Clickable Buttons -->
                    <div class="mb-4">
                        ${UI.card('Choose Your Automation Tool', `
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
                                <!-- Quick Automate Card (Free) -->
                                <div class="automation-tool-card" onclick="App.openApp('automatisch')" style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 1.5rem; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;">
                                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                        <div style="width: 48px; height: 48px; background: rgba(0, 122, 255, 0.12); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">⚡</div>
                                        <div>
                                            <h4 style="margin: 0; font-size: 1.1rem;">Quick Automate</h4>
                                            <span style="color: var(--success); font-size: 0.75rem; font-weight: 500;">${isFreeTier ? 'FREE • 10 automations' : '5 active'}</span>
                                        </div>
                                    </div>
                                    <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0 0 0.75rem 0;">Set up in 5 minutes. No tech skills needed.</p>
                                    <div style="margin-bottom: 1rem;">
                                        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin: 0 0 0.5rem 0; font-weight: 500;">EXAMPLES:</p>
                                        <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.8rem; color: var(--text-secondary);">
                                            ${(CONFIG.apps.automatisch.examples || []).slice(0, 3).map(ex => '<li style="margin-bottom: 0.25rem;">' + ex + '</li>').join('')}
                                        </ul>
                                    </div>
                                    <button class="btn btn-primary" style="width: 100%;" onclick="event.stopPropagation(); App.openApp('automatisch')">Open Quick Automate →</button>
                                </div>

                                <!-- Workflow Studio Card (Pro) -->
                                <div class="automation-tool-card" onclick="${isFreeTier ? "App.navigate('pricing')" : "App.openApp('workflows')"}" style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 1.5rem; cursor: pointer; border: 2px solid transparent; transition: all 0.2s; ${isFreeTier ? 'opacity: 0.85;' : ''}">
                                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                        <div style="width: 48px; height: 48px; background: rgba(0, 122, 255, 0.12); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">🏗️</div>
                                        <div>
                                            <h4 style="margin: 0; font-size: 1.1rem;">Workflow Studio</h4>
                                            <span style="color: ${isFreeTier ? 'var(--text-tertiary)' : 'var(--primary)'}; font-size: 0.75rem; font-weight: 500;">${isFreeTier ? 'PRO PLAN' : '7 active'}</span>
                                        </div>
                                    </div>
                                    <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0 0 0.75rem 0;">Run your whole business on autopilot. AI-powered.</p>
                                    <div style="margin-bottom: 1rem;">
                                        <p style="font-size: 0.75rem; color: var(--text-tertiary); margin: 0 0 0.5rem 0; font-weight: 500;">EXAMPLES:</p>
                                        <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.8rem; color: var(--text-secondary);">
                                            ${(CONFIG.apps.workflows.examples || []).slice(0, 3).map(ex => '<li style="margin-bottom: 0.25rem;">' + ex + '</li>').join('')}
                                        </ul>
                                    </div>
                                    <button class="btn ${isFreeTier ? 'btn-secondary' : 'btn-primary'}" style="width: 100%;" onclick="event.stopPropagation(); ${isFreeTier ? "App.navigate('pricing')" : "App.openApp('workflows')"}">${isFreeTier ? 'Upgrade to Pro →' : 'Open Workflow Studio →'}</button>
                                </div>

                                ${!isFreeTier ? `
                                <!-- Connect Apps Card (Premium) -->
                                <div class="automation-tool-card" onclick="App.openApp('etl')" style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 1.5rem; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;">
                                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                                        <div style="width: 48px; height: 48px; background: rgba(0, 122, 255, 0.12); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">🔄</div>
                                        <div>
                                            <h4 style="margin: 0; font-size: 1.1rem;">Connect Apps</h4>
                                            <span style="color: var(--text-tertiary); font-size: 0.8rem;">Data sync</span>
                                        </div>
                                    </div>
                                    <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0 0 1rem 0;">Sync data between databases and apps</p>
                                    <button class="btn btn-secondary" style="width: 100%;" onclick="event.stopPropagation(); App.openApp('etl')">Open Airbyte →</button>
                                </div>
                                ` : ''}
                            </div>
                            ${isFreeTier ? `
                            <div style="background: var(--bg-tertiary); border-radius: var(--radius-sm); padding: 1rem; margin-top: 1.5rem; text-align: center;">
                                <p style="font-size: 0.875rem; color: var(--text-secondary); margin: 0;">
                                    <strong>Free tier:</strong> 10 automations with Quick Automate. Upgrade for Workflow Studio access.
                                </p>
                            </div>
                            ` : ''}
                        `)}
                    </div>

                    <!-- Recent Activity -->
                    <div class="mb-4">
                        ${UI.card('Recent Activity', `
                            <div class="activity-list">
                                ${workflows.map(w => UI.activityItem(w)).join('')}
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        `;
    },

    // AutoBiz - Automated Business Builder
    // Shared data
    autobizData: {
        businessUnits: [
            { id: 'sales', icon: '💼', name: 'Sales', desc: 'Lead capture, CRM, quotes, follow-ups, pipeline tracking', workflows: 5 },
            { id: 'operations', icon: '⚙️', name: 'Operations', desc: 'Job intake, scheduling, delivery tracking, fulfillment', workflows: 5 },
            { id: 'finance', icon: '💰', name: 'Finance', desc: 'Invoicing, payments, expenses, cash flow reports', workflows: 5 },
            { id: 'admin', icon: '🔗', name: 'Admin Hub', desc: 'Documents, coordination, compliance, connects all units', workflows: 5 },
            { id: 'marketing', icon: '📣', name: 'Marketing', desc: 'Email campaigns, bio page, basic analytics', workflows: 4 },
            { id: 'service', icon: '🎧', name: 'Customer Service', desc: 'Support logging, feedback collection, follow-ups', workflows: 4 }
        ],
        addons: [
            { id: 'social', icon: '📱', name: 'Social Media Automation', desc: 'Auto-post, schedule, cross-platform', price: 99 },
            { id: 'ai-writer', icon: '✍️', name: 'AI Content Writer', desc: 'Generate posts, emails, copy', price: 149 },
            { id: 'ai-chat', icon: '🤖', name: 'AI Auto-responder', desc: '24/7 instant customer replies', price: 199 },
            { id: 'reviews', icon: '⭐', name: 'Review Management', desc: 'Request & monitor reviews', price: 99 },
            { id: 'analytics-plus', icon: '📊', name: 'Advanced Analytics', desc: 'Deep dashboards, custom reports', price: 149 },
            { id: 'price-monitor', icon: '💹', name: 'Price Monitoring', desc: 'Track competitor pricing', price: 199 },
            { id: 'inventory', icon: '📦', name: 'Inventory Automation', desc: 'Stock alerts, reorder triggers', price: 149 },
            { id: 'multi-currency', icon: '💱', name: 'Multi-currency', desc: 'International payments', price: 99 },
            { id: 'team', icon: '👥', name: 'Team Collaboration', desc: 'Multi-user, permissions, tasks', price: 199 },
            { id: 'api', icon: '🔌', name: 'API Integrations', desc: 'Connect external tools', price: 249 },
            { id: 'whitelabel', icon: '🏷️', name: 'White-label Bio', desc: 'Custom domain, branding', price: 149 },
            { id: 'sms', icon: '📲', name: 'SMS Notifications', desc: 'Text alerts for critical events', price: 99 }
        ],
        industries: [
            { id: 'services', name: 'Professional Services', icon: '💼', examples: 'Consulting, Legal, Accounting' },
            { id: 'trades', name: 'Trades & Home Services', icon: '🔧', examples: 'Plumbing, Electrical, Cleaning' },
            { id: 'retail', name: 'Retail & E-commerce', icon: '🛒', examples: 'Online store, Local shop' },
            { id: 'health', name: 'Health & Wellness', icon: '💪', examples: 'Gym, Spa, Therapy' },
            { id: 'creative', name: 'Creative & Marketing', icon: '🎨', examples: 'Design, Photography, Agency' },
            { id: 'food', name: 'Food & Hospitality', icon: '🍽️', examples: 'Restaurant, Catering, Cafe' },
            { id: 'tech', name: 'Technology & Software', icon: '💻', examples: 'IT Services, Development' },
            { id: 'other', name: 'Other', icon: '📋', examples: 'Tell us about your business' }
        ]
    },

    // Wizard state
    autobizWizard: {
        step: 1,
        totalSteps: 5,
        data: {
            businessName: '',
            industry: '',
            employeeCount: '1',
            ownerName: '',
            ownerEmail: '',
            ownerPhone: '',
            businessEmail: '',
            selectedAddons: [],
            unitConfig: {
                sales: { followUpDays: '3', leadSources: [] },
                operations: { serviceType: 'service', avgJobDuration: '1day' },
                finance: { paymentTerms: '14', currency: 'ZAR', taxRate: '15' },
                admin: { digestTime: '08:00', notifyEmail: true, notifySms: false },
                marketing: { websiteUrl: '', socialLinks: {} },
                service: { supportEmail: '', slaHours: '24' }
            }
        }
    },

    // Landing page for unauthenticated users
    autobizLanding: () => {
        const { businessUnits, addons } = Pages.autobizData;

        return `
            <div class="autobiz-landing">
                <!-- Hero -->
                <div class="autobiz-landing-hero">
                    <div class="landing-hero-content">
                        <h1>AutoBiz</h1>
                        <p class="hero-tagline">Your Complete Business on Autopilot</p>
                        <p class="hero-desc">27 pre-built automations across 6 business units. Set up in 10 minutes, runs forever.</p>
                        <div class="hero-actions">
                            <button class="btn btn-primary btn-lg" onclick="Auth.showLoginModal()">Get Started Free</button>
                            <button class="btn btn-secondary btn-lg" onclick="document.querySelector('.autobiz-features').scrollIntoView({behavior:'smooth'})">See How It Works</button>
                        </div>
                        <p class="hero-note">No credit card required • Free tier available</p>
                    </div>
                </div>

                <!-- Stats -->
                <div class="autobiz-stats">
                    <div class="stat-item">
                        <span class="stat-number">6</span>
                        <span class="stat-label">Business Units</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">27</span>
                        <span class="stat-label">Automations</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">10</span>
                        <span class="stat-label">Min Setup</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">12</span>
                        <span class="stat-label">Add-ons</span>
                    </div>
                </div>

                <!-- Business Units -->
                <div class="autobiz-features">
                    <h2>Everything Your Business Needs</h2>
                    <p class="features-subtitle">Six integrated units working together automatically</p>

                    <div class="features-grid">
                        ${businessUnits.map(unit => `
                            <div class="feature-card">
                                <div class="feature-icon">${unit.icon}</div>
                                <h3>${unit.name}</h3>
                                <p>${unit.desc}</p>
                                <span class="feature-workflows">${unit.workflows} automations</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- How it works -->
                <div class="autobiz-how">
                    <h2>How It Works</h2>
                    <div class="how-steps">
                        <div class="how-step">
                            <div class="step-number">1</div>
                            <h3>Tell us about your business</h3>
                            <p>Industry, size, and basic details</p>
                        </div>
                        <div class="how-step">
                            <div class="step-number">2</div>
                            <h3>Configure your units</h3>
                            <p>Customize each business unit to your needs</p>
                        </div>
                        <div class="how-step">
                            <div class="step-number">3</div>
                            <h3>Select add-ons</h3>
                            <p>Enhance with optional extras</p>
                        </div>
                        <div class="how-step">
                            <div class="step-number">4</div>
                            <h3>Deploy & run</h3>
                            <p>Your automations go live instantly</p>
                        </div>
                    </div>
                </div>

                <!-- Add-ons preview -->
                <div class="autobiz-addons-preview">
                    <h2>Optional Add-ons</h2>
                    <p class="addons-subtitle">Boost specific areas when you need them</p>
                    <div class="addons-preview-grid">
                        ${addons.slice(0, 6).map(addon => `
                            <div class="addon-preview">
                                <span class="addon-preview-icon">${addon.icon}</span>
                                <span class="addon-preview-name">${addon.name}</span>
                            </div>
                        `).join('')}
                    </div>
                    <p class="addons-more">+ ${addons.length - 6} more add-ons available</p>
                </div>

                <!-- CTA -->
                <div class="autobiz-landing-cta">
                    <h2>Ready to automate your business?</h2>
                    <p>Join small businesses already running on autopilot</p>
                    <button class="btn btn-primary btn-lg" onclick="Auth.showLoginModal()">Start Free Setup</button>
                </div>
            </div>
        `;
    },

    // Main AutoBiz page (authenticated)
    autobiz: () => {
        if (!Auth.isAuthenticated()) {
            return Pages.autobizLanding();
        }

        // Use the new template marketplace UI for authenticated users
        if (typeof AutoBizUI !== 'undefined') {
            return AutoBizUI.render();
        }

        // Fallback: Check if user has an existing AutoBiz setup
        const existingSetup = localStorage.getItem('autobiz_setup');
        if (existingSetup) {
            return Pages.autobizDashboard();
        }

        const { businessUnits, addons } = Pages.autobizData;

        return `
            <div class="container">
                <div class="page-header">
                    <h1>AutoBiz</h1>
                    <p>Your complete business on autopilot</p>
                </div>

                <div class="page-content">
                    <!-- Hero Section -->
                    <div class="autobiz-hero">
                        <div class="hero-content">
                            <h2>Run your entire business automatically</h2>
                            <p>Pre-built automations for every business unit. Connect once, run forever.</p>
                        </div>
                    </div>

                    <!-- Base Package -->
                    <div class="autobiz-section">
                        <div class="section-header">
                            <h3>Base Package</h3>
                            <span class="section-badge">Complete Business System</span>
                        </div>
                        <p class="section-desc">Everything a small business needs - all 6 units working together.</p>

                        <div class="business-units-grid">
                            ${businessUnits.map(unit => `
                                <div class="business-unit-card">
                                    <div class="unit-icon">${unit.icon}</div>
                                    <div class="unit-content">
                                        <h4>${unit.name}</h4>
                                        <p>${unit.desc}</p>
                                    </div>
                                    <span class="unit-status included">Included</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Add-ons -->
                    <div class="autobiz-section">
                        <div class="section-header">
                            <h3>Add-ons</h3>
                            <span class="section-badge optional">Optional Enhancements</span>
                        </div>
                        <p class="section-desc">Boost specific areas of your business with these extras.</p>

                        <div class="addons-grid">
                            ${addons.map(addon => `
                                <div class="addon-card" data-addon="${addon.id}">
                                    <div class="addon-icon">${addon.icon}</div>
                                    <div class="addon-content">
                                        <h4>${addon.name}</h4>
                                        <p>${addon.desc}</p>
                                    </div>
                                    <button class="addon-toggle" onclick="Pages.toggleAddon('${addon.id}')">
                                        <span class="toggle-label">Add</span>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- CTA -->
                    <div class="autobiz-cta">
                        <h3>Ready to automate your business?</h3>
                        <p>Set up takes about 10 minutes. We'll guide you through everything.</p>
                        <button class="btn btn-primary btn-lg" onclick="Pages.startAutoBizSetup()">
                            Get Started
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // AutoBiz Dashboard (after setup complete)
    autobizDashboard: () => {
        const setup = JSON.parse(localStorage.getItem('autobiz_setup') || '{}');
        const { businessUnits } = Pages.autobizData;

        return `
            <div class="container">
                <div class="page-header">
                    <h1>${setup.businessName || 'Your Business'}</h1>
                    <p>AutoBiz Dashboard</p>
                </div>

                <div class="page-content">
                    <!-- Status Overview -->
                    <div class="autobiz-dashboard-stats">
                        <div class="dash-stat">
                            <span class="dash-stat-icon">✅</span>
                            <span class="dash-stat-value">27</span>
                            <span class="dash-stat-label">Active Workflows</span>
                        </div>
                        <div class="dash-stat">
                            <span class="dash-stat-icon">⚡</span>
                            <span class="dash-stat-value">142</span>
                            <span class="dash-stat-label">Runs Today</span>
                        </div>
                        <div class="dash-stat">
                            <span class="dash-stat-icon">📊</span>
                            <span class="dash-stat-value">98%</span>
                            <span class="dash-stat-label">Success Rate</span>
                        </div>
                        <div class="dash-stat">
                            <span class="dash-stat-icon">🕐</span>
                            <span class="dash-stat-value">4.2h</span>
                            <span class="dash-stat-label">Time Saved</span>
                        </div>
                    </div>

                    <!-- Business Units Status -->
                    <div class="autobiz-section">
                        <div class="section-header">
                            <h3>Business Units</h3>
                            <button class="btn btn-sm btn-secondary" onclick="Pages.openAutoBizSettings()">Settings</button>
                        </div>

                        <div class="dashboard-units-grid">
                            ${businessUnits.map(unit => `
                                <div class="dashboard-unit-card" onclick="Pages.openUnitDetail('${unit.id}')">
                                    <div class="unit-header">
                                        <span class="unit-icon">${unit.icon}</span>
                                        <span class="unit-name">${unit.name}</span>
                                        <span class="unit-status-dot active"></span>
                                    </div>
                                    <div class="unit-metrics">
                                        <div class="unit-metric">
                                            <span class="metric-value">${unit.workflows}</span>
                                            <span class="metric-label">Workflows</span>
                                        </div>
                                        <div class="unit-metric">
                                            <span class="metric-value">${Math.floor(Math.random() * 30) + 10}</span>
                                            <span class="metric-label">Runs Today</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Recent Activity -->
                    <div class="autobiz-section">
                        <div class="section-header">
                            <h3>Recent Activity</h3>
                        </div>
                        <div class="activity-feed">
                            <div class="activity-item">
                                <span class="activity-icon">💼</span>
                                <div class="activity-content">
                                    <strong>New lead captured</strong>
                                    <p>John Smith from Website Form</p>
                                </div>
                                <span class="activity-time">2 min ago</span>
                            </div>
                            <div class="activity-item">
                                <span class="activity-icon">💰</span>
                                <div class="activity-content">
                                    <strong>Invoice sent</strong>
                                    <p>INV-2024-0042 to ABC Corp</p>
                                </div>
                                <span class="activity-time">15 min ago</span>
                            </div>
                            <div class="activity-item">
                                <span class="activity-icon">📧</span>
                                <div class="activity-content">
                                    <strong>Follow-up sent</strong>
                                    <p>Day 3 reminder to Jane Doe</p>
                                </div>
                                <span class="activity-time">1 hr ago</span>
                            </div>
                            <div class="activity-item">
                                <span class="activity-icon">⭐</span>
                                <div class="activity-content">
                                    <strong>Feedback received</strong>
                                    <p>5-star rating from Mike Wilson</p>
                                </div>
                                <span class="activity-time">2 hrs ago</span>
                            </div>
                        </div>
                    </div>

                    <!-- Quick Actions -->
                    <div class="autobiz-quick-actions">
                        <button class="btn btn-secondary" onclick="App.openApp('workflows')">
                            <span>⚡</span> Open n8n
                        </button>
                        <button class="btn btn-secondary" onclick="App.openApp('crm')">
                            <span>💼</span> Open CRM
                        </button>
                        <button class="btn btn-secondary" onclick="App.openApp('analytics')">
                            <span>📊</span> Analytics
                        </button>
                        <button class="btn btn-secondary" onclick="Pages.resetAutoBiz()">
                            <span>🔄</span> Reset Setup
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // Setup Wizard
    startAutoBizSetup: () => {
        Pages.autobizWizard.step = 1;
        Pages.autobizWizard.data = {
            businessName: '',
            industry: '',
            employeeCount: '1',
            ownerName: Auth.getUser()?.name || '',
            ownerEmail: Auth.getUser()?.email || '',
            ownerPhone: '',
            businessEmail: '',
            selectedAddons: [],
            unitConfig: {
                sales: { followUpDays: '3', leadSources: ['website', 'referral'] },
                operations: { serviceType: 'service', avgJobDuration: '1day' },
                finance: { paymentTerms: '14', currency: 'ZAR', taxRate: '15' },
                admin: { digestTime: '08:00', notifyEmail: true, notifySms: false },
                marketing: { websiteUrl: '', socialLinks: {} },
                service: { supportEmail: '', slaHours: '24' }
            }
        };
        App.loadPage('autobiz-wizard');
    },

    // Wizard page renderer
    'autobiz-wizard': () => {
        const { step, totalSteps } = Pages.autobizWizard;

        return `
            <div class="wizard-container">
                <!-- Progress -->
                <div class="wizard-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${(step / totalSteps) * 100}%"></div>
                    </div>
                    <div class="progress-steps">
                        ${[1,2,3,4,5].map(s => `
                            <div class="progress-step ${s <= step ? 'active' : ''} ${s < step ? 'completed' : ''}">
                                <span class="step-dot">${s < step ? '✓' : s}</span>
                                <span class="step-label">${['Business', 'Contact', 'Units', 'Add-ons', 'Review'][s-1]}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Step Content -->
                <div class="wizard-content">
                    ${Pages.renderWizardStep(step)}
                </div>

                <!-- Navigation -->
                <div class="wizard-nav">
                    ${step > 1 ? `
                        <button class="btn btn-secondary" onclick="Pages.wizardPrev()">
                            ← Back
                        </button>
                    ` : '<div></div>'}

                    ${step < totalSteps ? `
                        <button class="btn btn-primary" onclick="Pages.wizardNext()">
                            Continue →
                        </button>
                    ` : `
                        <button class="btn btn-primary btn-lg" onclick="Pages.wizardComplete()">
                            🚀 Deploy AutoBiz
                        </button>
                    `}
                </div>
            </div>
        `;
    },

    renderWizardStep: (step) => {
        const { data } = Pages.autobizWizard;
        const { industries, businessUnits, addons } = Pages.autobizData;

        switch(step) {
            case 1: // Business Info
                return `
                    <div class="wizard-step">
                        <h2>Tell us about your business</h2>
                        <p class="step-desc">We'll customize your automations based on this</p>

                        <div class="form-group">
                            <label>Business Name</label>
                            <input type="text" class="form-input" id="wiz-business-name"
                                value="${data.businessName}"
                                placeholder="e.g. Smith Consulting"
                                onchange="Pages.updateWizardData('businessName', this.value)">
                        </div>

                        <div class="form-group">
                            <label>Industry</label>
                            <div class="industry-grid">
                                ${industries.map(ind => `
                                    <div class="industry-option ${data.industry === ind.id ? 'selected' : ''}"
                                         onclick="Pages.selectIndustry('${ind.id}')">
                                        <span class="industry-icon">${ind.icon}</span>
                                        <span class="industry-name">${ind.name}</span>
                                        <span class="industry-examples">${ind.examples}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Team Size</label>
                            <div class="size-options">
                                ${['1', '2-3', '4-5', '5+'].map(size => `
                                    <button class="size-option ${data.employeeCount === size ? 'selected' : ''}"
                                            onclick="Pages.updateWizardData('employeeCount', '${size}')">
                                        ${size} ${size === '1' ? 'person' : 'people'}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;

            case 2: // Contact Info
                return `
                    <div class="wizard-step">
                        <h2>Contact Information</h2>
                        <p class="step-desc">For notifications and system emails</p>

                        <div class="form-row">
                            <div class="form-group">
                                <label>Your Name</label>
                                <input type="text" class="form-input" id="wiz-owner-name"
                                    value="${data.ownerName}"
                                    placeholder="John Smith"
                                    onchange="Pages.updateWizardData('ownerName', this.value)">
                            </div>
                            <div class="form-group">
                                <label>Your Phone</label>
                                <input type="tel" class="form-input" id="wiz-owner-phone"
                                    value="${data.ownerPhone}"
                                    placeholder="+27 82 123 4567"
                                    onchange="Pages.updateWizardData('ownerPhone', this.value)">
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label>Your Email</label>
                                <input type="email" class="form-input" id="wiz-owner-email"
                                    value="${data.ownerEmail}"
                                    placeholder="you@example.com"
                                    onchange="Pages.updateWizardData('ownerEmail', this.value)">
                            </div>
                            <div class="form-group">
                                <label>Business Email (for sending)</label>
                                <input type="email" class="form-input" id="wiz-business-email"
                                    value="${data.businessEmail}"
                                    placeholder="hello@yourbusiness.com"
                                    onchange="Pages.updateWizardData('businessEmail', this.value)">
                            </div>
                        </div>
                    </div>
                `;

            case 3: // Unit Configuration
                return `
                    <div class="wizard-step">
                        <h2>Configure Your Business Units</h2>
                        <p class="step-desc">Customize how each unit works for you</p>

                        <div class="unit-config-list">
                            ${businessUnits.map(unit => `
                                <div class="unit-config-card">
                                    <div class="unit-config-header" onclick="Pages.toggleUnitConfig('${unit.id}')">
                                        <span class="unit-icon">${unit.icon}</span>
                                        <span class="unit-name">${unit.name}</span>
                                        <span class="unit-expand">▼</span>
                                    </div>
                                    <div class="unit-config-body" id="unit-config-${unit.id}">
                                        ${Pages.renderUnitConfig(unit.id)}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;

            case 4: // Add-ons
                return `
                    <div class="wizard-step">
                        <h2>Select Add-ons</h2>
                        <p class="step-desc">Optional enhancements - you can add these later too</p>

                        <div class="wizard-addons-grid">
                            ${addons.map(addon => `
                                <div class="wizard-addon-card ${data.selectedAddons.includes(addon.id) ? 'selected' : ''}"
                                     onclick="Pages.toggleWizardAddon('${addon.id}')">
                                    <div class="addon-check">${data.selectedAddons.includes(addon.id) ? '✓' : ''}</div>
                                    <div class="addon-icon">${addon.icon}</div>
                                    <h4>${addon.name}</h4>
                                    <p>${addon.desc}</p>
                                    <span class="addon-price">R${addon.price}/mo</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;

            case 5: // Review
                return `
                    <div class="wizard-step">
                        <h2>Review & Deploy</h2>
                        <p class="step-desc">Check your setup before we deploy</p>

                        <div class="review-section">
                            <h3>📋 Business Details</h3>
                            <div class="review-grid">
                                <div class="review-item">
                                    <span class="review-label">Business Name</span>
                                    <span class="review-value">${data.businessName || 'Not set'}</span>
                                </div>
                                <div class="review-item">
                                    <span class="review-label">Industry</span>
                                    <span class="review-value">${industries.find(i => i.id === data.industry)?.name || 'Not set'}</span>
                                </div>
                                <div class="review-item">
                                    <span class="review-label">Team Size</span>
                                    <span class="review-value">${data.employeeCount} people</span>
                                </div>
                            </div>
                        </div>

                        <div class="review-section">
                            <h3>📧 Contact</h3>
                            <div class="review-grid">
                                <div class="review-item">
                                    <span class="review-label">Owner</span>
                                    <span class="review-value">${data.ownerName}</span>
                                </div>
                                <div class="review-item">
                                    <span class="review-label">Email</span>
                                    <span class="review-value">${data.ownerEmail}</span>
                                </div>
                            </div>
                        </div>

                        <div class="review-section">
                            <h3>⚡ What We'll Deploy</h3>
                            <div class="deploy-summary">
                                <div class="deploy-item">
                                    <span class="deploy-count">6</span>
                                    <span class="deploy-label">Business Units</span>
                                </div>
                                <div class="deploy-item">
                                    <span class="deploy-count">27</span>
                                    <span class="deploy-label">Automations</span>
                                </div>
                                <div class="deploy-item">
                                    <span class="deploy-count">${data.selectedAddons.length}</span>
                                    <span class="deploy-label">Add-ons</span>
                                </div>
                            </div>
                        </div>

                        ${data.selectedAddons.length > 0 ? `
                            <div class="review-section">
                                <h3>🎁 Selected Add-ons</h3>
                                <div class="selected-addons-list">
                                    ${data.selectedAddons.map(id => {
                                        const addon = addons.find(a => a.id === id);
                                        return `<span class="selected-addon">${addon?.icon} ${addon?.name}</span>`;
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
        }
    },

    renderUnitConfig: (unitId) => {
        const config = Pages.autobizWizard.data.unitConfig[unitId];

        switch(unitId) {
            case 'sales':
                return `
                    <div class="config-field">
                        <label>Follow-up after (days)</label>
                        <select class="form-select" onchange="Pages.updateUnitConfig('sales', 'followUpDays', this.value)">
                            ${['1','2','3','5','7'].map(d => `
                                <option value="${d}" ${config.followUpDays === d ? 'selected' : ''}>${d} day${d > 1 ? 's' : ''}</option>
                            `).join('')}
                        </select>
                    </div>
                `;
            case 'operations':
                return `
                    <div class="config-field">
                        <label>Business Type</label>
                        <select class="form-select" onchange="Pages.updateUnitConfig('operations', 'serviceType', this.value)">
                            <option value="service" ${config.serviceType === 'service' ? 'selected' : ''}>Service-based</option>
                            <option value="product" ${config.serviceType === 'product' ? 'selected' : ''}>Product-based</option>
                            <option value="both" ${config.serviceType === 'both' ? 'selected' : ''}>Both</option>
                        </select>
                    </div>
                `;
            case 'finance':
                return `
                    <div class="config-field">
                        <label>Payment Terms (days)</label>
                        <select class="form-select" onchange="Pages.updateUnitConfig('finance', 'paymentTerms', this.value)">
                            ${['7','14','30','60'].map(d => `
                                <option value="${d}" ${config.paymentTerms === d ? 'selected' : ''}>${d} days</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="config-field">
                        <label>Tax Rate (%)</label>
                        <input type="number" class="form-input" value="${config.taxRate}"
                            onchange="Pages.updateUnitConfig('finance', 'taxRate', this.value)">
                    </div>
                `;
            case 'admin':
                return `
                    <div class="config-field">
                        <label>Daily Digest Time</label>
                        <input type="time" class="form-input" value="${config.digestTime}"
                            onchange="Pages.updateUnitConfig('admin', 'digestTime', this.value)">
                    </div>
                `;
            case 'marketing':
                return `
                    <div class="config-field">
                        <label>Website URL</label>
                        <input type="url" class="form-input" value="${config.websiteUrl}" placeholder="https://..."
                            onchange="Pages.updateUnitConfig('marketing', 'websiteUrl', this.value)">
                    </div>
                `;
            case 'service':
                return `
                    <div class="config-field">
                        <label>Support Email</label>
                        <input type="email" class="form-input" value="${config.supportEmail}" placeholder="support@..."
                            onchange="Pages.updateUnitConfig('service', 'supportEmail', this.value)">
                    </div>
                    <div class="config-field">
                        <label>SLA Response Time (hours)</label>
                        <select class="form-select" onchange="Pages.updateUnitConfig('service', 'slaHours', this.value)">
                            ${['4','8','24','48'].map(h => `
                                <option value="${h}" ${config.slaHours === h ? 'selected' : ''}>${h} hours</option>
                            `).join('')}
                        </select>
                    </div>
                `;
            default:
                return '<p>Configuration options coming soon</p>';
        }
    },

    // Wizard helpers
    updateWizardData: (field, value) => {
        Pages.autobizWizard.data[field] = value;
    },

    selectIndustry: (industryId) => {
        Pages.autobizWizard.data.industry = industryId;
        document.querySelectorAll('.industry-option').forEach(el => {
            el.classList.toggle('selected', el.onclick.toString().includes(industryId));
        });
        App.loadPage('autobiz-wizard');
    },

    updateUnitConfig: (unit, field, value) => {
        Pages.autobizWizard.data.unitConfig[unit][field] = value;
    },

    toggleUnitConfig: (unitId) => {
        const body = document.getElementById(`unit-config-${unitId}`);
        if (body) {
            body.classList.toggle('expanded');
        }
    },

    toggleWizardAddon: (addonId) => {
        const addons = Pages.autobizWizard.data.selectedAddons;
        const index = addons.indexOf(addonId);
        if (index > -1) {
            addons.splice(index, 1);
        } else {
            addons.push(addonId);
        }
        App.loadPage('autobiz-wizard');
    },

    wizardNext: () => {
        if (Pages.autobizWizard.step < Pages.autobizWizard.totalSteps) {
            Pages.autobizWizard.step++;
            App.loadPage('autobiz-wizard');
        }
    },

    wizardPrev: () => {
        if (Pages.autobizWizard.step > 1) {
            Pages.autobizWizard.step--;
            App.loadPage('autobiz-wizard');
        }
    },

    wizardComplete: () => {
        // Save setup to localStorage
        const setup = {
            ...Pages.autobizWizard.data,
            deployedAt: new Date().toISOString(),
            status: 'active'
        };
        localStorage.setItem('autobiz_setup', JSON.stringify(setup));

        Toast.success('AutoBiz Deployed!', 'Your 27 automations are now running');
        App.loadPage('autobiz');
    },

    // Toggle addon selection (main page)
    toggleAddon: (addonId) => {
        const card = document.querySelector(`.addon-card[data-addon="${addonId}"]`);
        if (card) {
            card.classList.toggle('selected');
            const btn = card.querySelector('.toggle-label');
            btn.textContent = card.classList.contains('selected') ? 'Added' : 'Add';
        }
    },

    // Reset AutoBiz
    resetAutoBiz: () => {
        if (confirm('Are you sure? This will reset your AutoBiz setup.')) {
            localStorage.removeItem('autobiz_setup');
            Toast.info('Reset Complete', 'You can set up AutoBiz again');
            App.loadPage('autobiz');
        }
    },

    openAutoBizSettings: () => {
        Toast.info('Settings', 'AutoBiz settings coming soon');
    },

    openUnitDetail: (unitId) => {
        Toast.info('Unit Detail', `${unitId} detail view coming soon`);
    },

    // Settings (protected)
    settings: () => {
        if (!Auth.isAuthenticated()) {
            return Pages.requireAuth();
        }
        // Settings allowed for all authenticated users (including free)

        const theme = localStorage.getItem('dataacuity_theme') || 'light';
        const user = Auth.getUser();
        const plan = Auth.getPlanId();
        const planNames = { free: 'Free', starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };

        return `
            <div class="container">
                <div class="page-header">
                    <h1>${t('settings.title')}</h1>
                    <p>${t('settings.subtitle')}</p>
                </div>

                <div class="settings-grid">
                    <!-- Row 1: Profile & Subscription -->
                    <div class="col-4">
                        ${UI.card(t('settings.profile'), `
                            <div class="settings-profile">
                                <div class="profile-avatar" style="background: var(--primary);">
                                    ${Auth.getInitials(user?.name)}
                                </div>
                                <div class="profile-info">
                                    <strong>${user?.name || 'User'}</strong>
                                    <span class="text-muted">${user?.email || ''}</span>
                                </div>
                                <button class="btn btn-secondary btn-sm" onclick="Auth.manageAccount()">
                                    ${t('settings.manage_account')}
                                </button>
                            </div>
                        `)}
                    </div>

                    <div class="col-4">
                        ${UI.card(t('settings.subscription'), `
                            <div class="settings-subscription">
                                <div class="plan-badge ${plan}">${planNames[plan] || 'Free'}</div>
                                <div class="plan-details">
                                    <div class="plan-row">
                                        <span class="text-muted">${t('settings.status')}</span>
                                        <span class="status-active">${t('settings.active')}</span>
                                    </div>
                                    <div class="plan-row">
                                        <span class="text-muted">${t('settings.billing')}</span>
                                        <span>${plan === 'free' ? t('settings.none') : t('settings.monthly')}</span>
                                    </div>
                                </div>
                                <button class="btn ${plan === 'free' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="App.navigate('pricing')">
                                    ${plan === 'free' ? t('settings.upgrade_plan') : t('settings.manage_plan')}
                                </button>
                            </div>
                        `)}
                    </div>

                    <div class="col-4">
                        ${UI.card(t('settings.appearance'), `
                            <div class="settings-appearance">
                                <div class="setting-section">
                                    <label class="setting-label">${t('settings.theme')}</label>
                                    <div class="theme-selector">
                                        <button class="theme-option ${theme === 'light' ? 'active' : ''}" onclick="App.setTheme('light')">
                                            <span class="theme-icon">☀️</span>
                                            <span>${t('theme.light')}</span>
                                        </button>
                                        <button class="theme-option ${theme === 'dark' ? 'active' : ''}" onclick="App.setTheme('dark')">
                                            <span class="theme-icon">🌙</span>
                                            <span>${t('theme.dark')}</span>
                                        </button>
                                    </div>
                                </div>
                                <div class="setting-section">
                                    <label class="setting-label">${t('settings.language')}</label>
                                    <select class="language-select" onchange="App.changeLanguage(this.value)">
                                        ${(typeof i18n !== 'undefined' ? i18n.getLanguages() : []).map(lang =>
                                            '<option value="' + lang.code + '"' + (lang.code === (typeof i18n !== 'undefined' ? i18n.getLanguage() : 'en') ? ' selected' : '') + '>' + lang.native_name + (lang.native_name !== lang.name ? ' (' + lang.name + ')' : '') + '</option>'
                                        ).join('')}
                                    </select>
                                </div>
                            </div>
                        `)}
                    </div>

                    <!-- Row 2: Social Media Connections -->
                    <div class="col-12">
                        ${UI.card(t('settings.social_connections'), `
                            <p class="card-description">${t('settings.social_desc')}</p>
                            <div class="social-grid">
                                <div class="social-card" onclick="Settings.connectSocial('linkedin')">
                                    <div class="social-icon linkedin">
                                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                                    </div>
                                    <div class="social-info">
                                        <strong>${t('social.linkedin')}</strong>
                                        <span class="text-muted">${t('social.linkedin_desc')}</span>
                                    </div>
                                    <button class="btn btn-sm btn-secondary">${t('common.connect')}</button>
                                </div>
                                <div class="social-card" onclick="Settings.connectSocial('twitter')">
                                    <div class="social-icon twitter">
                                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                    </div>
                                    <div class="social-info">
                                        <strong>${t('social.twitter')}</strong>
                                        <span class="text-muted">${t('social.twitter_desc')}</span>
                                    </div>
                                    <button class="btn btn-sm btn-secondary">${t('common.connect')}</button>
                                </div>
                                <div class="social-card" onclick="Settings.connectSocial('facebook')">
                                    <div class="social-icon facebook">
                                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                    </div>
                                    <div class="social-info">
                                        <strong>${t('social.facebook')}</strong>
                                        <span class="text-muted">${t('social.facebook_desc')}</span>
                                    </div>
                                    <button class="btn btn-sm btn-secondary">${t('common.connect')}</button>
                                </div>
                                <div class="social-card" onclick="Settings.connectSocial('instagram')">
                                    <div class="social-icon instagram">
                                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                                    </div>
                                    <div class="social-info">
                                        <strong>${t('social.instagram')}</strong>
                                        <span class="text-muted">${t('social.instagram_desc')}</span>
                                    </div>
                                    <button class="btn btn-sm btn-secondary">${t('common.connect')}</button>
                                </div>
                                <div class="social-card" onclick="Settings.connectSocial('whatsapp')">
                                    <div class="social-icon whatsapp">
                                        <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    </div>
                                    <div class="social-info">
                                        <strong>${t('social.whatsapp')}</strong>
                                        <span class="text-muted">${t('social.whatsapp_desc')}</span>
                                    </div>
                                    <button class="btn btn-sm btn-secondary">${t('common.connect')}</button>
                                </div>
                            </div>
                        `)}
                    </div>

                    <!-- Row 3: External Data APIs -->
                    <div class="col-8">
                        ${UI.card(t('settings.external_apis'), `
                            <p class="card-description">${t('settings.api_desc')}</p>
                            <div class="api-list">
                                ${Settings.renderApiItem('rest', 'REST', '#FF6B35', t('api.rest'), t('api.rest_desc'))}
                                ${Settings.renderApiItem('graphql', 'GQL', '#E535AB', t('api.graphql'), t('api.graphql_desc'))}
                                ${Settings.renderApiItem('database', 'DB', '#47A248', t('api.database'), t('api.database_desc'))}
                                ${Settings.renderApiItem('webhook', 'WH', '#0066FF', t('api.webhook'), t('api.webhook_desc'))}
                            </div>
                        `)}
                    </div>

                    <div class="col-4">
                        ${UI.card(t('settings.quick_info'), `
                            <div class="info-list">
                                <div class="info-row">
                                    <span class="text-muted">${t('common.version')}</span>
                                    <strong>DataAcuity 1.0</strong>
                                </div>
                                <div class="info-row">
                                    <span class="text-muted">${t('common.apps')}</span>
                                    <strong>${Object.keys(CONFIG.apps).length} ${t('common.available')}</strong>
                                </div>
                                <div class="info-row">
                                    <span class="text-muted">${t('settings.status')}</span>
                                    <span class="status-active">${t('common.operational')}</span>
                                </div>
                                <div class="info-row">
                                    <span class="text-muted">${t('common.region')}</span>
                                    <strong>South Africa</strong>
                                </div>
                            </div>
                            <div class="shortcuts-section">
                                <strong class="shortcuts-title">${t('settings.shortcuts')}</strong>
                                <div class="shortcut-row">
                                    <span>${t('shortcut.palette')}</span>
                                    <kbd>Cmd K</kbd>
                                </div>
                                <div class="shortcut-row">
                                    <span>${t('shortcut.close')}</span>
                                    <kbd>Esc</kbd>
                                </div>
                            </div>
                        `)}
                    </div>

                    ${Auth.isAdmin() ? `
                    <div class="col-12">
                        ${UI.card(t('settings.admin_actions'), `
                            <div class="quick-actions">
                                ${UI.quickAction('🔄', 'Refresh Status', "StatusChecker.checkAll(); Toast.success('Refreshed', 'Status updated')")}
                                ${UI.quickAction('📉', 'Open Monitoring', "App.openApp('grafana')")}
                                ${UI.quickAction('🖥️', 'System Status', "App.openApp('status')")}
                            </div>
                        `)}
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // Pricing page (public)
    pricing: () => {
        const user = Auth.getUser();
        const email = user?.email || '';
        const name = user?.name || '';

        return `
            <div class="pricing-page">
                <div class="pricing-header">
                    <h1>${t('pricing.title')}</h1>
                    <p>${t('pricing.subtitle')}</p>
                </div>

                <div class="pricing-grid">
                    <!-- Free Tier -->
                    <div class="pricing-card">
                        <div class="pricing-card-header">
                            <h3>${t('pricing.free')}</h3>
                            <div class="price">
                                <span class="currency">R</span>
                                <span class="amount">0</span>
                                <span class="period">/${t('pricing.month')}</span>
                            </div>
                        </div>
                        <div class="pricing-card-body">
                            <p class="pricing-description">${t('pricing.free_desc')}</p>
                            <ul class="pricing-features">
                                <li>${t('pricing.free_f1')}</li>
                                <li>${t('pricing.free_f2')}</li>
                                <li>${t('pricing.free_f3')}</li>
                                <li>${t('pricing.free_f4')}</li>
                                <li>${t('pricing.free_f5')}</li>
                                <li>${t('pricing.free_f6')}</li>
                            </ul>
                        </div>
                        <div class="pricing-card-footer">
                            <button class="btn btn-secondary btn-block" onclick="Pages.startCheckout('free')">
                                ${t('pricing.get_started_free')}
                            </button>
                        </div>
                    </div>

                    <!-- Starter -->
                    <div class="pricing-card featured">
                        <div class="pricing-badge">${t('pricing.most_popular')}</div>
                        <div class="pricing-card-header">
                            <h3>${t('pricing.starter')}</h3>
                            <div class="price">
                                <span class="currency">R</span>
                                <span class="amount">499</span>
                                <span class="period">/${t('pricing.month')}</span>
                            </div>
                        </div>
                        <div class="pricing-card-body">
                            <p class="pricing-description">${t('pricing.starter_desc')}</p>
                            <ul class="pricing-features">
                                <li>${t('pricing.starter_f1')}</li>
                                <li>${t('pricing.starter_f2')}</li>
                                <li>${t('pricing.starter_f3')}</li>
                                <li>${t('pricing.starter_f4')}</li>
                                <li>${t('pricing.starter_f5')}</li>
                                <li>${t('pricing.starter_f6')}</li>
                            </ul>
                        </div>
                        <div class="pricing-card-footer">
                            <button class="btn btn-primary btn-block" onclick="Pages.startCheckout('starter')">
                                ${t('pricing.start_now')}
                            </button>
                        </div>
                    </div>

                    <!-- Growth -->
                    <div class="pricing-card">
                        <div class="pricing-card-header">
                            <h3>${t('pricing.growth')}</h3>
                            <div class="price">
                                <span class="currency">R</span>
                                <span class="amount">499</span>
                                <span class="period">+ R99/${t('pricing.user')}</span>
                            </div>
                        </div>
                        <div class="pricing-card-body">
                            <p class="pricing-description">${t('pricing.growth_desc')}</p>
                            <ul class="pricing-features">
                                <li>${t('pricing.growth_f1')}</li>
                                <li>${t('pricing.growth_f2')}</li>
                                <li>${t('pricing.growth_f3')}</li>
                                <li>${t('pricing.growth_f4')}</li>
                                <li>${t('pricing.growth_f5')}</li>
                                <li>${t('pricing.growth_f6')}</li>
                            </ul>
                        </div>
                        <div class="pricing-card-footer">
                            <button class="btn btn-secondary btn-block" onclick="Pages.showGrowthModal()">
                                ${t('pricing.choose_team')}
                            </button>
                        </div>
                    </div>
                </div>

                <div class="pricing-enterprise">
                    <h3>${t('pricing.enterprise')}</h3>
                    <p>${t('pricing.enterprise_desc')}</p>
                </div>

                <div class="pricing-faq">
                    <h2>${t('pricing.faq_title')}</h2>
                    <div class="faq-grid">
                        <div class="faq-item">
                            <h4>${t('pricing.faq1_q')}</h4>
                            <p>${t('pricing.faq1_a')}</p>
                        </div>
                        <div class="faq-item">
                            <h4>${t('pricing.faq2_q')}</h4>
                            <p>${t('pricing.faq2_a')}</p>
                        </div>
                        <div class="faq-item">
                            <h4>${t('pricing.faq3_q')}</h4>
                            <p>${t('pricing.faq3_a')}</p>
                        </div>
                        <div class="faq-item">
                            <h4>${t('pricing.faq4_q')}</h4>
                            <p>${t('pricing.faq4_a')}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    // Start checkout process
    startCheckout: (plan, userCount = 1) => {
        const user = Auth.getUser();
        if (!user?.email) {
            Auth.showLoginModal();
            Toast.info('Sign in required', 'Please sign in to subscribe');
            return;
        }
        const url = '/billing/checkout.php?plan=' + plan + '&email=' + encodeURIComponent(user.email) + '&name=' + encodeURIComponent(user.name || '') + '&users=' + userCount;
        window.location.href = url;
    },

    // Show Growth team size modal
    showGrowthModal: () => {
        const user = Auth.getUser();
        if (!user?.email) {
            Auth.showLoginModal();
            Toast.info('Sign in required', 'Please sign in to subscribe');
            return;
        }

        const modalHTML = '<div id="growth-modal" class="modal">' +
            '<div class="modal-overlay" onclick="document.getElementById(\'growth-modal\').remove()"></div>' +
            '<div class="modal-content" style="max-width: 400px;">' +
            '<button class="modal-close" onclick="document.getElementById(\'growth-modal\').remove()">x</button>' +
            '<h2 style="margin-bottom: 1rem;">Choose Team Size</h2>' +
            '<p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Base: R499 + R99 per additional user</p>' +
            '<div style="margin-bottom: 1.5rem;">' +
            '<label style="display: block; margin-bottom: 0.5rem;">Number of users:</label>' +
            '<select id="growth-users" style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary);">' +
            '<option value="2">2 users - R598/month</option>' +
            '<option value="3">3 users - R697/month</option>' +
            '<option value="4">4 users - R796/month</option>' +
            '<option value="5" selected>5 users - R895/month</option>' +
            '<option value="6">6 users - R994/month</option>' +
            '<option value="7">7 users - R1,093/month</option>' +
            '<option value="8">8 users - R1,192/month</option>' +
            '<option value="9">9 users - R1,291/month</option>' +
            '<option value="10">10 users - R1,390/month</option>' +
            '</select></div>' +
            '<button class="btn btn-primary btn-block" onclick="Pages.startCheckout(\'growth\', document.getElementById(\'growth-users\').value); document.getElementById(\'growth-modal\').remove();">' +
            'Continue to Payment</button></div></div>';

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    },

    // Helper: Check if user can access an app
    canAccessApp: (app) => {
        if (!app) return false;
        // Admin category apps require admin role
        if (app.category === 'admin') {
            return Auth.isAdmin();
        }
        return true;
    },

    // Helper: Show upgrade required message for free users
    requireUpgrade: () => {
        return `
            <div class="container">
                <div class="upgrade-prompt">
                    <div class="upgrade-content">
                        <span class="upgrade-icon">🚀</span>
                        <h2>${t('upgrade.title')}</h2>
                        <p>${t('upgrade.on_free_plan')}</p>
                        <p class="upgrade-subtitle">${t('upgrade.subtitle')}</p>

                        <div class="upgrade-features">
                            <div class="upgrade-feature">
                                <span>✓</span> ${t('upgrade.feature_crm')}
                            </div>
                            <div class="upgrade-feature">
                                <span>✓</span> ${t('upgrade.feature_analytics')}
                            </div>
                            <div class="upgrade-feature">
                                <span>✓</span> ${t('upgrade.feature_workflows')}
                            </div>
                            <div class="upgrade-feature">
                                <span>✓</span> ${t('upgrade.feature_ai')}
                            </div>
                            <div class="upgrade-feature">
                                <span>✓</span> ${t('upgrade.feature_support')}
                            </div>
                        </div>

                        <div class="upgrade-actions">
                            <button class="btn btn-primary btn-lg" onclick="App.navigate('pricing')">
                                ${t('upgrade.view_plans')}
                            </button>
                        </div>

                        <p class="upgrade-free-note">
                            ${t('upgrade.or_continue')}
                            <a href="#" onclick="App.navigate('home'); return false;">${t('upgrade.limited_dashboard')}</a>
                        </p>
                    </div>
                </div>
            </div>
        `;
    },

    // Helper: Show auth required message
    requireAuth: () => {
        return `
            <div class="container">
                <div class="auth-required">
                    <div class="auth-required-content">
                        <span class="auth-icon">🔒</span>
                        <h2>${t('auth.sign_in_required')}</h2>
                        <p>${t('auth.sign_in_message')}</p>
                        <button class="btn btn-primary" onclick="Auth.login()">
                            ${t('nav.sign_in')}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
};
