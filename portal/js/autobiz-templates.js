// AutoBiz Workflow Templates Configuration
// This module defines all workflow templates with their configurable variables
// and provides the n8n integration for deploying them

const AutoBizTemplates = {
    // n8n API configuration
    n8nConfig: {
        baseUrl: 'https://n8n.dataacuity.co.za/api/v1',
        apiKey: null, // Set via setApiKey()
    },

    // Set API key
    setApiKey: (key) => {
        AutoBizTemplates.n8nConfig.apiKey = key;
        localStorage.setItem('autobiz_n8n_api_key', key);
    },

    // Get API key
    getApiKey: () => {
        if (!AutoBizTemplates.n8nConfig.apiKey) {
            AutoBizTemplates.n8nConfig.apiKey = localStorage.getItem('autobiz_n8n_api_key');
        }
        return AutoBizTemplates.n8nConfig.apiKey;
    },

    // Environment variables that workflows depend on
    envVariables: {
        CRM_API_URL: {
            label: 'CRM API URL',
            description: 'Your CRM system API endpoint',
            type: 'url',
            default: 'https://twenty.dataacuity.co.za/rest',
            category: 'integrations'
        },
        CRM_URL: {
            label: 'CRM Dashboard URL',
            description: 'Your CRM web interface URL',
            type: 'url',
            default: 'https://twenty.dataacuity.co.za',
            category: 'integrations'
        },
        BUSINESS_EMAIL: {
            label: 'Business Email',
            description: 'Email address for sending automated emails',
            type: 'email',
            required: true,
            category: 'business'
        },
        OWNER_EMAIL: {
            label: 'Owner Email',
            description: 'Email for receiving notifications',
            type: 'email',
            required: true,
            category: 'business'
        },
        SUPPORT_EMAIL: {
            label: 'Support Email',
            description: 'Customer support email address',
            type: 'email',
            category: 'business'
        },
        BUSINESS_NAME: {
            label: 'Business Name',
            description: 'Your company/business name',
            type: 'text',
            required: true,
            category: 'business'
        },
        BUSINESS_PHONE: {
            label: 'Business Phone',
            description: 'Primary business phone number',
            type: 'tel',
            category: 'business'
        },
        WEBSITE_URL: {
            label: 'Website URL',
            description: 'Your business website',
            type: 'url',
            category: 'business'
        },
        SMTP_HOST: {
            label: 'SMTP Host',
            description: 'Email server hostname',
            type: 'text',
            default: 'smtp.gmail.com',
            category: 'email'
        },
        SMTP_PORT: {
            label: 'SMTP Port',
            description: 'Email server port',
            type: 'number',
            default: '587',
            category: 'email'
        },
        PAYMENT_TERMS_DAYS: {
            label: 'Payment Terms (Days)',
            description: 'Default invoice payment terms',
            type: 'number',
            default: '14',
            category: 'finance'
        },
        TAX_RATE: {
            label: 'Tax Rate (%)',
            description: 'Default tax/VAT rate',
            type: 'number',
            default: '15',
            category: 'finance'
        },
        CURRENCY: {
            label: 'Currency',
            description: 'Primary currency code',
            type: 'select',
            options: ['ZAR', 'USD', 'EUR', 'GBP'],
            default: 'ZAR',
            category: 'finance'
        },
        SLA_HOURS: {
            label: 'SLA Response Hours',
            description: 'Maximum response time for support tickets',
            type: 'number',
            default: '24',
            category: 'service'
        },
        FOLLOW_UP_DAYS: {
            label: 'Follow-up Days',
            description: 'Days before automatic follow-up',
            type: 'number',
            default: '3',
            category: 'sales'
        },
        DIGEST_TIME: {
            label: 'Daily Digest Time',
            description: 'Time to send daily summary emails',
            type: 'time',
            default: '08:00',
            category: 'admin'
        },
        SLACK_WEBHOOK_URL: {
            label: 'Slack Webhook URL',
            description: 'Slack incoming webhook for notifications',
            type: 'url',
            category: 'integrations',
            optional: true
        },
        GOOGLE_CALENDAR_ID: {
            label: 'Google Calendar ID',
            description: 'Calendar ID for scheduling',
            type: 'text',
            category: 'integrations',
            optional: true
        }
    },

    // Workflow categories/units
    categories: {
        sales: {
            id: 'sales',
            name: 'Sales',
            icon: '💼',
            color: '#3b82f6',
            description: 'Lead capture, quotes, pipeline tracking, follow-ups',
            envVars: ['CRM_API_URL', 'CRM_URL', 'BUSINESS_EMAIL', 'OWNER_EMAIL', 'FOLLOW_UP_DAYS']
        },
        operations: {
            id: 'operations',
            name: 'Operations',
            icon: '⚙️',
            color: '#10b981',
            description: 'Job scheduling, inventory, vendor management, quality',
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'SLACK_WEBHOOK_URL']
        },
        finance: {
            id: 'finance',
            name: 'Finance',
            icon: '💰',
            color: '#f59e0b',
            description: 'Invoicing, payments, expenses, reports, tax prep',
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'PAYMENT_TERMS_DAYS', 'TAX_RATE', 'CURRENCY']
        },
        admin: {
            id: 'admin',
            name: 'Admin Hub',
            icon: '🔗',
            color: '#8b5cf6',
            description: 'Documents, calendar, tasks, communications, sync',
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'DIGEST_TIME', 'GOOGLE_CALENDAR_ID']
        },
        marketing: {
            id: 'marketing',
            name: 'Marketing',
            icon: '📣',
            color: '#ec4899',
            description: 'Email campaigns, content scheduling, analytics',
            envVars: ['BUSINESS_EMAIL', 'WEBSITE_URL']
        },
        'customer-service': {
            id: 'customer-service',
            name: 'Customer Service',
            icon: '🎧',
            color: '#06b6d4',
            description: 'Support tickets, auto-responses, feedback, loyalty',
            envVars: ['SUPPORT_EMAIL', 'BUSINESS_EMAIL', 'SLA_HOURS']
        }
    },

    // All workflow templates with metadata
    templates: {
        // === SALES ===
        'lead-capture': {
            id: 'lead-capture',
            name: 'Lead Capture',
            category: 'sales',
            description: 'Capture leads from web forms, validate, save to CRM, and notify owner',
            icon: '📥',
            trigger: 'Webhook (POST)',
            features: [
                'Web form integration',
                'Data validation',
                'CRM integration',
                'Auto-confirmation email',
                'Owner notification'
            ],
            envVars: ['CRM_API_URL', 'BUSINESS_EMAIL', 'OWNER_EMAIL', 'CRM_URL'],
            webhookPath: 'autobiz/lead-capture',
            difficulty: 'easy'
        },
        'quote-generator': {
            id: 'quote-generator',
            name: 'Quote Generator',
            category: 'sales',
            description: 'Generate professional quotes/proposals and send to prospects',
            icon: '📋',
            trigger: 'Webhook or Manual',
            features: [
                'PDF quote generation',
                'Custom pricing',
                'Email delivery',
                'Quote tracking',
                'Expiry reminders'
            ],
            envVars: ['BUSINESS_EMAIL', 'BUSINESS_NAME', 'TAX_RATE', 'CURRENCY'],
            webhookPath: 'autobiz/quote-generate',
            difficulty: 'medium'
        },
        'pipeline-tracker': {
            id: 'pipeline-tracker',
            name: 'Pipeline Tracker',
            category: 'sales',
            description: 'Track deals through pipeline stages with automatic updates',
            icon: '📊',
            trigger: 'Schedule (hourly)',
            features: [
                'Stage monitoring',
                'Stale deal alerts',
                'Win/loss tracking',
                'Pipeline reports',
                'CRM sync'
            ],
            envVars: ['CRM_API_URL', 'OWNER_EMAIL'],
            difficulty: 'medium'
        },
        'follow-up-automation': {
            id: 'follow-up-automation',
            name: 'Follow-up Automation',
            category: 'sales',
            description: 'Automated follow-up emails based on lead activity and time',
            icon: '📧',
            trigger: 'Schedule (daily)',
            features: [
                'Timed follow-ups',
                'Personalized emails',
                'Activity tracking',
                'Escalation rules',
                'A/B testing ready'
            ],
            envVars: ['CRM_API_URL', 'BUSINESS_EMAIL', 'FOLLOW_UP_DAYS'],
            difficulty: 'easy'
        },
        'contract-generator': {
            id: 'contract-generator',
            name: 'Contract Generator',
            category: 'sales',
            description: 'Generate contracts from templates when deals are won',
            icon: '📝',
            trigger: 'Webhook (deal won)',
            features: [
                'Template-based',
                'Variable substitution',
                'PDF generation',
                'E-signature ready',
                'Storage & tracking'
            ],
            envVars: ['BUSINESS_EMAIL', 'BUSINESS_NAME', 'CRM_API_URL'],
            webhookPath: 'autobiz/contract-generate',
            difficulty: 'medium'
        },

        // === OPERATIONS ===
        'job-scheduler': {
            id: 'job-scheduler',
            name: 'Job Scheduler',
            category: 'operations',
            description: 'Schedule jobs, assign resources, and manage calendar',
            icon: '📅',
            trigger: 'Webhook + Schedule',
            features: [
                'Calendar integration',
                'Resource allocation',
                'Conflict detection',
                'Reminder notifications',
                'Team assignments'
            ],
            envVars: ['BUSINESS_EMAIL', 'GOOGLE_CALENDAR_ID', 'SLACK_WEBHOOK_URL'],
            webhookPath: 'autobiz/job-schedule',
            difficulty: 'medium'
        },
        'inventory-monitor': {
            id: 'inventory-monitor',
            name: 'Inventory Monitor',
            category: 'operations',
            description: 'Track inventory levels and trigger reorder alerts',
            icon: '📦',
            trigger: 'Schedule (daily)',
            features: [
                'Stock level tracking',
                'Low stock alerts',
                'Reorder automation',
                'Usage reports',
                'Supplier integration'
            ],
            envVars: ['OWNER_EMAIL', 'BUSINESS_EMAIL'],
            difficulty: 'easy'
        },
        'vendor-manager': {
            id: 'vendor-manager',
            name: 'Vendor Manager',
            category: 'operations',
            description: 'Manage vendor relationships, orders, and performance',
            icon: '🤝',
            trigger: 'Webhook + Schedule',
            features: [
                'Vendor database',
                'Order tracking',
                'Performance scoring',
                'Payment reminders',
                'Contract alerts'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL'],
            webhookPath: 'autobiz/vendor-action',
            difficulty: 'medium'
        },
        'quality-checker': {
            id: 'quality-checker',
            name: 'Quality Checker',
            category: 'operations',
            description: 'Quality control workflows and inspection tracking',
            icon: '✅',
            trigger: 'Webhook (job complete)',
            features: [
                'QC checklists',
                'Photo documentation',
                'Issue tracking',
                'Approval workflows',
                'Quality reports'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'SLACK_WEBHOOK_URL'],
            webhookPath: 'autobiz/quality-check',
            difficulty: 'easy'
        },

        // === FINANCE ===
        'invoice-generator': {
            id: 'invoice-generator',
            name: 'Invoice Generator',
            category: 'finance',
            description: 'Generate and send professional invoices automatically',
            icon: '🧾',
            trigger: 'Webhook (job complete)',
            features: [
                'PDF invoices',
                'Auto-numbering',
                'Tax calculation',
                'Email delivery',
                'Payment tracking'
            ],
            envVars: ['BUSINESS_EMAIL', 'BUSINESS_NAME', 'TAX_RATE', 'CURRENCY', 'PAYMENT_TERMS_DAYS'],
            webhookPath: 'autobiz/invoice-create',
            difficulty: 'medium'
        },
        'payment-tracker': {
            id: 'payment-tracker',
            name: 'Payment Tracker',
            category: 'finance',
            description: 'Track payments, send reminders, and flag overdue invoices',
            icon: '💳',
            trigger: 'Schedule (daily)',
            features: [
                'Payment matching',
                'Overdue detection',
                'Reminder emails',
                'Payment reports',
                'Bank sync ready'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'PAYMENT_TERMS_DAYS'],
            difficulty: 'easy'
        },
        'expense-manager': {
            id: 'expense-manager',
            name: 'Expense Manager',
            category: 'finance',
            description: 'Track business expenses and categorize for tax purposes',
            icon: '💸',
            trigger: 'Webhook + Schedule',
            features: [
                'Expense logging',
                'Category tagging',
                'Receipt storage',
                'Approval workflow',
                'Monthly reports'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'CURRENCY'],
            webhookPath: 'autobiz/expense-log',
            difficulty: 'easy'
        },
        'report-generator': {
            id: 'report-generator',
            name: 'Financial Reports',
            category: 'finance',
            description: 'Generate financial reports and summaries automatically',
            icon: '📈',
            trigger: 'Schedule (weekly/monthly)',
            features: [
                'P&L summaries',
                'Cash flow reports',
                'Revenue tracking',
                'Expense breakdown',
                'Email delivery'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'CURRENCY'],
            difficulty: 'medium'
        },
        'tax-prep': {
            id: 'tax-prep',
            name: 'Tax Preparation',
            category: 'finance',
            description: 'Prepare tax-related documents and summaries',
            icon: '🏛️',
            trigger: 'Schedule (quarterly)',
            features: [
                'Transaction export',
                'Category summaries',
                'Tax calculations',
                'Document collection',
                'Accountant reports'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'TAX_RATE', 'CURRENCY'],
            difficulty: 'medium'
        },

        // === ADMIN ===
        'document-filer': {
            id: 'document-filer',
            name: 'Document Filer',
            category: 'admin',
            description: 'Automatically organize and file documents',
            icon: '📁',
            trigger: 'Webhook (file upload)',
            features: [
                'Auto-categorization',
                'Cloud storage',
                'Search indexing',
                'Retention policies',
                'Access logging'
            ],
            envVars: ['BUSINESS_EMAIL'],
            webhookPath: 'autobiz/document-file',
            difficulty: 'easy'
        },
        'calendar-manager': {
            id: 'calendar-manager',
            name: 'Calendar Manager',
            category: 'admin',
            description: 'Sync and manage calendars across team members',
            icon: '🗓️',
            trigger: 'Schedule + Webhook',
            features: [
                'Calendar sync',
                'Meeting scheduling',
                'Conflict detection',
                'Reminder system',
                'Team availability'
            ],
            envVars: ['BUSINESS_EMAIL', 'GOOGLE_CALENDAR_ID'],
            webhookPath: 'autobiz/calendar-action',
            difficulty: 'medium'
        },
        'task-dispatcher': {
            id: 'task-dispatcher',
            name: 'Task Dispatcher',
            category: 'admin',
            description: 'Assign and track tasks across team members',
            icon: '📋',
            trigger: 'Webhook + Schedule',
            features: [
                'Task creation',
                'Auto-assignment',
                'Due date tracking',
                'Status updates',
                'Team notifications'
            ],
            envVars: ['BUSINESS_EMAIL', 'SLACK_WEBHOOK_URL'],
            webhookPath: 'autobiz/task-create',
            difficulty: 'easy'
        },
        'comms-hub': {
            id: 'comms-hub',
            name: 'Communications Hub',
            category: 'admin',
            description: 'Central hub for all business communications',
            icon: '📡',
            trigger: 'Multiple webhooks',
            features: [
                'Email routing',
                'Notification dispatch',
                'Channel management',
                'Message logging',
                'Priority handling'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'SLACK_WEBHOOK_URL'],
            webhookPath: 'autobiz/comms-route',
            difficulty: 'medium'
        },
        'data-sync': {
            id: 'data-sync',
            name: 'Data Sync',
            category: 'admin',
            description: 'Keep data synchronized across all business systems',
            icon: '🔄',
            trigger: 'Schedule (every 15 min)',
            features: [
                'CRM sync',
                'Database updates',
                'Conflict resolution',
                'Audit logging',
                'Error recovery'
            ],
            envVars: ['CRM_API_URL'],
            difficulty: 'hard'
        },

        // === MARKETING ===
        'email-campaigns': {
            id: 'email-campaigns',
            name: 'Email Campaigns',
            category: 'marketing',
            description: 'Create and send email marketing campaigns',
            icon: '✉️',
            trigger: 'Schedule + Manual',
            features: [
                'Campaign builder',
                'Audience segments',
                'A/B testing',
                'Analytics tracking',
                'Unsubscribe handling'
            ],
            envVars: ['BUSINESS_EMAIL', 'BUSINESS_NAME', 'WEBSITE_URL'],
            difficulty: 'medium'
        },
        'content-scheduler': {
            id: 'content-scheduler',
            name: 'Content Scheduler',
            category: 'marketing',
            description: 'Schedule and publish content across platforms',
            icon: '📱',
            trigger: 'Schedule',
            features: [
                'Multi-platform',
                'Queue management',
                'Best time posting',
                'Content calendar',
                'Performance tracking'
            ],
            envVars: ['BUSINESS_EMAIL'],
            difficulty: 'medium'
        },
        'lead-nurture': {
            id: 'lead-nurture',
            name: 'Lead Nurture',
            category: 'marketing',
            description: 'Automated lead nurturing email sequences',
            icon: '🌱',
            trigger: 'Event-based',
            features: [
                'Drip campaigns',
                'Behavior triggers',
                'Personalization',
                'Engagement scoring',
                'Conversion tracking'
            ],
            envVars: ['BUSINESS_EMAIL', 'CRM_API_URL'],
            difficulty: 'medium'
        },
        'analytics-reporter': {
            id: 'analytics-reporter',
            name: 'Analytics Reporter',
            category: 'marketing',
            description: 'Compile and send marketing analytics reports',
            icon: '📊',
            trigger: 'Schedule (weekly)',
            features: [
                'Multi-source data',
                'KPI dashboards',
                'Trend analysis',
                'Email reports',
                'Custom metrics'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL'],
            difficulty: 'easy'
        },

        // === CUSTOMER SERVICE ===
        'ticket-router': {
            id: 'ticket-router',
            name: 'Ticket Router',
            category: 'customer-service',
            description: 'Route support tickets to the right team members',
            icon: '🎫',
            trigger: 'Webhook (new ticket)',
            features: [
                'Auto-categorization',
                'Priority detection',
                'Team assignment',
                'SLA tracking',
                'Escalation rules'
            ],
            envVars: ['SUPPORT_EMAIL', 'BUSINESS_EMAIL', 'SLA_HOURS', 'SLACK_WEBHOOK_URL'],
            webhookPath: 'autobiz/ticket-create',
            difficulty: 'easy'
        },
        'response-bot': {
            id: 'response-bot',
            name: 'Response Bot',
            category: 'customer-service',
            description: 'Automated responses for common customer inquiries',
            icon: '🤖',
            trigger: 'Webhook (message received)',
            features: [
                'FAQ matching',
                'Template responses',
                'Human handoff',
                'Language detection',
                'Learning system'
            ],
            envVars: ['SUPPORT_EMAIL', 'BUSINESS_EMAIL'],
            webhookPath: 'autobiz/support-message',
            difficulty: 'medium'
        },
        'feedback-collector': {
            id: 'feedback-collector',
            name: 'Feedback Collector',
            category: 'customer-service',
            description: 'Collect and analyze customer feedback automatically',
            icon: '⭐',
            trigger: 'Webhook + Schedule',
            features: [
                'Survey delivery',
                'Rating collection',
                'Sentiment analysis',
                'Follow-up actions',
                'Report generation'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL'],
            webhookPath: 'autobiz/feedback-submit',
            difficulty: 'easy'
        },
        'loyalty-manager': {
            id: 'loyalty-manager',
            name: 'Loyalty Manager',
            category: 'customer-service',
            description: 'Manage customer loyalty and rewards programs',
            icon: '🏆',
            trigger: 'Event-based',
            features: [
                'Points tracking',
                'Reward triggers',
                'VIP detection',
                'Anniversary emails',
                'Referral tracking'
            ],
            envVars: ['BUSINESS_EMAIL', 'OWNER_EMAIL', 'CRM_API_URL'],
            difficulty: 'medium'
        }
    },

    // Get all templates as array
    getAll: () => Object.values(AutoBizTemplates.templates),

    // Get templates by category
    getByCategory: (categoryId) => {
        return Object.values(AutoBizTemplates.templates)
            .filter(t => t.category === categoryId);
    },

    // Get template by ID
    get: (templateId) => AutoBizTemplates.templates[templateId],

    // Get category info
    getCategory: (categoryId) => AutoBizTemplates.categories[categoryId],

    // Get all categories
    getAllCategories: () => Object.values(AutoBizTemplates.categories),

    // Get required env vars for a template
    getRequiredEnvVars: (templateId) => {
        const template = AutoBizTemplates.get(templateId);
        if (!template) return [];
        return template.envVars.map(key => ({
            key,
            ...AutoBizTemplates.envVariables[key]
        }));
    },

    // Get all required env vars for multiple templates
    getEnvVarsForTemplates: (templateIds) => {
        const envVarKeys = new Set();
        templateIds.forEach(id => {
            const template = AutoBizTemplates.get(id);
            if (template) {
                template.envVars.forEach(key => envVarKeys.add(key));
            }
        });
        return Array.from(envVarKeys).map(key => ({
            key,
            ...AutoBizTemplates.envVariables[key]
        }));
    },

    // n8n API Methods
    async testConnection() {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('No API key configured');
        }

        try {
            const response = await fetch(`${this.n8nConfig.baseUrl}/workflows?limit=1`, {
                headers: { 'X-N8N-API-KEY': apiKey }
            });
            return response.ok;
        } catch (e) {
            console.error('n8n connection test failed:', e);
            return false;
        }
    },

    // Fetch workflow template from server
    async fetchTemplate(category, templateId) {
        try {
            const response = await fetch(`/autobiz/workflows/${category}/${templateId}.json`);
            if (!response.ok) throw new Error('Template not found');
            return await response.json();
        } catch (e) {
            console.error(`Failed to fetch template ${templateId}:`, e);
            throw e;
        }
    },

    // Deploy a single workflow to n8n
    async deployWorkflow(templateId, envValues = {}) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('No n8n API key configured. Go to Settings to configure.');
        }

        const template = this.get(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        // Fetch the workflow JSON
        const workflowJson = await this.fetchTemplate(template.category, templateId);

        // Customize workflow name with business name if available
        if (envValues.BUSINESS_NAME) {
            workflowJson.name = `${envValues.BUSINESS_NAME} - ${template.name}`;
        }

        // Deploy to n8n
        const response = await fetch(`${this.n8nConfig.baseUrl}/workflows`, {
            method: 'POST',
            headers: {
                'X-N8N-API-KEY': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(workflowJson)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to deploy workflow');
        }

        const result = await response.json();
        return result;
    },

    // Deploy multiple workflows
    async deployWorkflows(templateIds, envValues = {}, onProgress) {
        const results = {
            success: [],
            failed: []
        };

        for (let i = 0; i < templateIds.length; i++) {
            const templateId = templateIds[i];
            try {
                if (onProgress) {
                    onProgress({
                        current: i + 1,
                        total: templateIds.length,
                        templateId,
                        status: 'deploying'
                    });
                }

                const result = await this.deployWorkflow(templateId, envValues);
                results.success.push({ templateId, workflowId: result.id, name: result.name });
            } catch (e) {
                results.failed.push({ templateId, error: e.message });
            }
        }

        return results;
    },

    // Get existing AutoBiz workflows from n8n
    async getDeployedWorkflows() {
        const apiKey = this.getApiKey();
        if (!apiKey) return [];

        try {
            const response = await fetch(`${this.n8nConfig.baseUrl}/workflows`, {
                headers: { 'X-N8N-API-KEY': apiKey }
            });

            if (!response.ok) return [];

            const data = await response.json();
            return data.data.filter(w => w.name.includes('AutoBiz'));
        } catch (e) {
            console.error('Failed to fetch deployed workflows:', e);
            return [];
        }
    },

    // Activate/deactivate a workflow
    async setWorkflowActive(workflowId, active) {
        const apiKey = this.getApiKey();
        if (!apiKey) throw new Error('No API key');

        const endpoint = active
            ? `${this.n8nConfig.baseUrl}/workflows/${workflowId}/activate`
            : `${this.n8nConfig.baseUrl}/workflows/${workflowId}/deactivate`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'X-N8N-API-KEY': apiKey }
        });

        return response.ok;
    },

    // Delete a workflow
    async deleteWorkflow(workflowId) {
        const apiKey = this.getApiKey();
        if (!apiKey) throw new Error('No API key');

        const response = await fetch(`${this.n8nConfig.baseUrl}/workflows/${workflowId}`, {
            method: 'DELETE',
            headers: { 'X-N8N-API-KEY': apiKey }
        });

        return response.ok;
    },

    // Set n8n environment variables
    async setEnvironmentVariables(envValues) {
        // n8n environment variables are typically set in the container
        // This would require server-side implementation
        // For now, store in localStorage and use in workflow execution
        const current = JSON.parse(localStorage.getItem('autobiz_env_vars') || '{}');
        const updated = { ...current, ...envValues };
        localStorage.setItem('autobiz_env_vars', JSON.stringify(updated));
        return updated;
    },

    // Get stored environment variables
    getEnvironmentVariables() {
        return JSON.parse(localStorage.getItem('autobiz_env_vars') || '{}');
    }
};

// Make globally available
window.AutoBizTemplates = AutoBizTemplates;
