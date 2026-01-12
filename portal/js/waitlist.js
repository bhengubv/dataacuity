// DataAcuity Portal - Waitlist Management
// Controls early access to the platform

const Waitlist = {
    // Allowed email addresses (early access)
    allowedEmails: [
        'tbengu@thegeek.co.za',
        'tbengu@gmail.com',
        'kfbengu1@gmail.com',
        'dustindinojacobs@gmail.com',
        'gugubengu@gmail.com',
        'velondlela@gmail.com'
    ],

    // n8n webhook for waitlist signups
    webhookUrl: 'https://n8n.dataacuity.co.za/webhook/autobiz/waitlist-signup',

    // Check if email is in allowed list
    isAllowed(email) {
        if (!email) return false;
        return this.allowedEmails.includes(email.toLowerCase());
    },

    // Check if user is on waitlist
    isOnWaitlist(email) {
        const waitlist = this.getWaitlist();
        return waitlist.some(entry => entry.email.toLowerCase() === email.toLowerCase());
    },

    // Get local waitlist storage
    getWaitlist() {
        try {
            return JSON.parse(localStorage.getItem('dataacuity_waitlist') || '[]');
        } catch {
            return [];
        }
    },

    // Add to local waitlist
    addToLocalWaitlist(userData) {
        const waitlist = this.getWaitlist();
        const existing = waitlist.find(e => e.email.toLowerCase() === userData.email.toLowerCase());

        if (!existing) {
            waitlist.push({
                ...userData,
                joinedAt: new Date().toISOString(),
                notified: false
            });
            localStorage.setItem('dataacuity_waitlist', JSON.stringify(waitlist));
        }
        return !existing;
    },

    // Add user to waitlist and send notification
    async addToWaitlist(user) {
        const userData = {
            email: user.email,
            name: user.name || user.email.split('@')[0],
            firstName: user.firstName || user.name?.split(' ')[0] || '',
            lastName: user.lastName || '',
            source: 'portal-login'
        };

        // Add to local storage
        const isNew = this.addToLocalWaitlist(userData);

        // Send to n8n webhook for email notification
        if (isNew) {
            try {
                await fetch(this.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...userData,
                        timestamp: new Date().toISOString(),
                        action: 'new_signup'
                    })
                });
                console.log('Waitlist signup sent to webhook');
            } catch (error) {
                console.error('Failed to send waitlist signup:', error);
            }
        }

        return isNew;
    },

    // Get waitlist position (approximate)
    getPosition(email) {
        const waitlist = this.getWaitlist();
        const index = waitlist.findIndex(e => e.email.toLowerCase() === email.toLowerCase());
        return index >= 0 ? index + 1 : waitlist.length + 1;
    },

    // Check access and redirect if needed
    async checkAccess() {
        // Only check if user is authenticated
        if (!Auth.isAuthenticated()) {
            return true; // Let them proceed to login
        }

        const user = Auth.getUser();
        if (!user?.email) {
            return true;
        }

        // Check if email is allowed
        if (this.isAllowed(user.email)) {
            return true; // Full access granted
        }

        // Add to waitlist if not already
        await this.addToWaitlist(user);

        // Redirect to waitlist page
        return false;
    },

    // Render the waitlist page
    renderPage() {
        const user = Auth.getUser();
        const position = user?.email ? this.getPosition(user.email) : '...';
        const joinDate = this.getWaitlist().find(e => e.email?.toLowerCase() === user?.email?.toLowerCase())?.joinedAt;
        const formattedDate = joinDate ? new Date(joinDate).toLocaleDateString('en-ZA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'Just now';

        return `
            <div class="waitlist-page">
                <div class="waitlist-container">
                    <!-- Header -->
                    <div class="waitlist-header">
                        <div class="waitlist-badge">Early Access</div>
                        <h1>You're on the List!</h1>
                        <p class="waitlist-subtitle">
                            Thanks for your interest in DataAcuity, <strong>${user?.firstName || user?.name?.split(' ')[0] || 'there'}</strong>!
                            We're rolling out access gradually to ensure the best experience.
                        </p>
                    </div>

                    <!-- Position Card -->
                    <div class="waitlist-position-card">
                        <div class="position-info">
                            <span class="position-label">Your Position</span>
                            <span class="position-number">#${position}</span>
                        </div>
                        <div class="position-meta">
                            <span>Joined ${formattedDate}</span>
                            <span class="email-badge">${user?.email || 'Not signed in'}</span>
                        </div>
                    </div>

                    <!-- What's Coming -->
                    <div class="waitlist-features">
                        <h2>What You'll Get Access To</h2>

                        <div class="feature-categories">
                            <!-- Business Automation -->
                            <div class="feature-category">
                                <div class="category-icon">⚡</div>
                                <h3>AutoBiz - Business Automation</h3>
                                <p>27 pre-built workflows to automate your entire business</p>
                                <ul class="feature-list">
                                    <li>Sales & Lead Management</li>
                                    <li>Invoice & Payment Tracking</li>
                                    <li>Customer Service Automation</li>
                                    <li>Marketing Campaigns</li>
                                    <li>Operations & Scheduling</li>
                                </ul>
                            </div>

                            <!-- Analytics -->
                            <div class="feature-category">
                                <div class="category-icon">📊</div>
                                <h3>Analytics & Insights</h3>
                                <p>Powerful dashboards and business intelligence</p>
                                <ul class="feature-list">
                                    <li>Real-time Dashboards</li>
                                    <li>Custom Reports</li>
                                    <li>Market Data</li>
                                    <li>Performance Metrics</li>
                                    <li>Trend Analysis</li>
                                </ul>
                            </div>

                            <!-- AI -->
                            <div class="feature-category">
                                <div class="category-icon">🧠</div>
                                <h3>AI Assistant</h3>
                                <p>Your intelligent business companion</p>
                                <ul class="feature-list">
                                    <li>Chat with AI Models</li>
                                    <li>Document Analysis</li>
                                    <li>Content Generation</li>
                                    <li>Data Extraction</li>
                                    <li>Smart Recommendations</li>
                                </ul>
                            </div>

                            <!-- Integration -->
                            <div class="feature-category">
                                <div class="category-icon">🔗</div>
                                <h3>Integrations</h3>
                                <p>Connect everything in one place</p>
                                <ul class="feature-list">
                                    <li>CRM Integration</li>
                                    <li>400+ App Connectors</li>
                                    <li>Data Sync</li>
                                    <li>Custom Webhooks</li>
                                    <li>API Access</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- How it Works -->
                    <div class="waitlist-timeline">
                        <h2>What Happens Next</h2>
                        <div class="timeline-steps">
                            <div class="timeline-step completed">
                                <div class="step-icon">✓</div>
                                <div class="step-content">
                                    <h4>You're Signed Up</h4>
                                    <p>We've added you to our early access list</p>
                                </div>
                            </div>
                            <div class="timeline-step">
                                <div class="step-icon">📧</div>
                                <div class="step-content">
                                    <h4>Check Your Email</h4>
                                    <p>We've sent you a welcome email with more details</p>
                                </div>
                            </div>
                            <div class="timeline-step">
                                <div class="step-icon">🔔</div>
                                <div class="step-content">
                                    <h4>Get Notified</h4>
                                    <p>We'll email you when your access is ready</p>
                                </div>
                            </div>
                            <div class="timeline-step">
                                <div class="step-icon">🚀</div>
                                <div class="step-content">
                                    <h4>Start Using DataAcuity</h4>
                                    <p>Full access to all features</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Contact -->
                    <div class="waitlist-contact">
                        <p>Have questions? Email us at <a href="mailto:hello@dataacuity.co.za">hello@dataacuity.co.za</a></p>
                        <div class="social-links">
                            <a href="https://twitter.com/dataacuity" target="_blank" class="social-link">Twitter</a>
                            <a href="https://linkedin.com/company/dataacuity" target="_blank" class="social-link">LinkedIn</a>
                        </div>
                    </div>

                    <!-- Sign Out -->
                    <div class="waitlist-actions">
                        <button class="btn btn-secondary" onclick="Auth.logout()">
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
};

// Make globally available
window.Waitlist = Waitlist;
