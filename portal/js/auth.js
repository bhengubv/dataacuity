// DataAcuity Portal - Authentication Module
// Uses Keycloak for SSO with Google, Microsoft, GitHub, LinkedIn, and email/password

const Auth = {
    // Configuration
    config: {
        url: 'https://auth.dataacuity.co.za',
        realm: 'dataacuity',
        clientId: 'dataacuity-portal'
    },

    // State
    keycloak: null,
    initialized: false,
    user: null,
    subscription: null, // User's subscription status

    // Initialize authentication
    async init() {
        try {
            // Load Keycloak JS adapter dynamically
            await Auth.loadKeycloakAdapter();

            // Initialize Keycloak
            Auth.keycloak = new Keycloak({
                url: Auth.config.url,
                realm: Auth.config.realm,
                clientId: Auth.config.clientId
            });

            // Try silent authentication first
            const authenticated = await Auth.keycloak.init({
                onLoad: 'check-sso',
                silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
                pkceMethod: 'S256',
                checkLoginIframe: false
            });

            Auth.initialized = true;

            if (authenticated) {
                Auth.user = Auth.parseToken();
                Auth.setupTokenRefresh();
                await Auth.fetchSubscription(); // Fetch subscription status
                console.log('User authenticated:', Auth.user.name, 'Plan:', Auth.subscription?.plan_id);
            }

            Auth.updateUI();
            // Notify app of auth state change
            if (typeof App !== 'undefined' && App.onAuthStateChange) {
                App.onAuthStateChange();
            }
            return authenticated;

        } catch (error) {
            console.error('Auth initialization failed:', error);
            Auth.initialized = true; // Mark as initialized even on error
            Auth.updateUI();
            // Notify app of auth state change
            if (typeof App !== 'undefined' && App.onAuthStateChange) {
                App.onAuthStateChange();
            }
            return false;
        }
    },

    // Load Keycloak JS adapter
    loadKeycloakAdapter() {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (window.Keycloak) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = Auth.config.url + '/js/keycloak.js';
            script.onload = resolve;
            script.onerror = () => {
                // Fallback: use local minimal adapter
                console.warn('Could not load Keycloak adapter, using fallback');
                Auth.useFallbackAuth();
                resolve();
            };
            document.head.appendChild(script);
        });
    },

    // Fallback auth for when Keycloak is unavailable
    useFallbackAuth() {
        window.Keycloak = class FallbackKeycloak {
            constructor() {
                this.authenticated = false;
                this.token = null;
                this.tokenParsed = null;
            }
            init() { return Promise.resolve(false); }
            login() { window.location.href = Auth.config.url + '/realms/' + Auth.config.realm + '/protocol/openid-connect/auth?client_id=' + Auth.config.clientId + '&redirect_uri=' + encodeURIComponent(window.location.href) + '&response_type=code&scope=openid%20profile%20email'; }
            logout() { localStorage.removeItem('dataacuity_user'); window.location.reload(); }
            updateToken() { return Promise.resolve(false); }
        };
    },

    // Parse the JWT token
    parseToken() {
        if (!Auth.keycloak?.tokenParsed) return null;

        const token = Auth.keycloak.tokenParsed;
        return {
            id: token.sub,
            email: token.email,
            name: token.name || token.preferred_username || token.email,
            firstName: token.given_name,
            lastName: token.family_name,
            picture: token.picture,
            roles: token.roles || token.realm_access?.roles || [],
            groups: token.groups || [],
            emailVerified: token.email_verified
        };
    },

    // Setup automatic token refresh
    setupTokenRefresh() {
        // Refresh token when it's about to expire (30 seconds before)
        setInterval(() => {
            Auth.keycloak?.updateToken(30).catch(() => {
                console.log('Token refresh failed, user may need to re-login');
            });
        }, 60000); // Check every minute
    },

    // Login - redirects to Keycloak login page
    login(options = {}) {
        if (!Auth.keycloak) {
            Toast.error('Auth Error', 'Authentication service unavailable');
            return;
        }

        const loginOptions = {
            redirectUri: window.location.href,
            ...options
        };

        // If specific IDP requested
        if (options.idp) {
            loginOptions.idpHint = options.idp;
        }

        Auth.keycloak.login(loginOptions);
    },

    // Login with specific provider
    loginWithGoogle() { Auth.login({ idp: 'google' }); },
    loginWithMicrosoft() { Auth.login({ idp: 'microsoft' }); },
    loginWithGitHub() { Auth.login({ idp: 'github' }); },
    loginWithLinkedIn() { Auth.login({ idp: 'linkedin-openid-connect' }); },

    // Register new account
    register() {
        if (!Auth.keycloak) {
            Toast.error('Auth Error', 'Authentication service unavailable');
            return;
        }
        Auth.keycloak.register({
            redirectUri: window.location.href
        });
    },

    // Logout
    logout() {
        if (!Auth.keycloak) {
            localStorage.removeItem('dataacuity_user');
            Auth.user = null;
            Auth.updateUI();
            return;
        }

        Auth.keycloak.logout({
            redirectUri: window.location.origin
        });
    },

    // Get current user
    getUser() {
        return Auth.user;
    },

    // Check if user is authenticated
    isAuthenticated() {
        return Auth.keycloak?.authenticated || false;
    },

    // Check if user has specific role
    hasRole(role) {
        return Auth.user?.roles?.includes(role) || false;
    },

    // Check if user is admin
    isAdmin() {
        return Auth.hasRole('admin');
    },

    // Fetch subscription status from billing API
    async fetchSubscription() {
        if (!Auth.user?.email) return null;

        try {
            const response = await fetch('/billing/api/subscriptions.php?action=status&email=' + encodeURIComponent(Auth.user.email));
            const data = await response.json();
            Auth.subscription = data.subscription || { plan_id: 'free', status: 'active' };
            Auth.planLimits = data.plan?.limits || {};
            return Auth.subscription;
        } catch (error) {
            console.error('Failed to fetch subscription:', error);
            Auth.subscription = { plan_id: 'free', status: 'active' };
            return Auth.subscription;
        }
    },

    // Check if user has a paid subscription
    hasPaidPlan() {
        const paidPlans = ['starter', 'growth', 'enterprise'];
        return paidPlans.includes(Auth.subscription?.plan_id);
    },

    // Check if user is on free tier
    isFreeTier() {
        return !Auth.subscription || Auth.subscription.plan_id === 'free';
    },

    // Get current plan ID
    getPlanId() {
        return Auth.subscription?.plan_id || 'free';
    },

    // Get access token for API calls
    getToken() {
        return Auth.keycloak?.token || null;
    },

    // Account management (opens Keycloak account page)
    manageAccount() {
        if (Auth.keycloak) {
            Auth.keycloak.accountManagement();
        }
    },

    // Update UI based on auth state
    updateUI() {
        const userBtn = document.getElementById('user-menu-btn');
        const userMenu = document.querySelector('.user-menu');

        if (Auth.isAuthenticated() && Auth.user) {
            // Show user info
            if (userBtn) {
                const initials = Auth.getInitials(Auth.user.name);
                userBtn.innerHTML = `
                    <span class="avatar" style="background: var(--primary); color: white; font-size: 0.8rem; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">${initials}</span>
                    <span class="user-name">${Auth.user.firstName || Auth.user.name.split(' ')[0]}</span>
                `;
            }

            // Add dropdown menu
            if (userMenu && !userMenu.querySelector('.user-dropdown')) {
                userMenu.insertAdjacentHTML('beforeend', `
                    <div class="user-dropdown hidden">
                        <div class="user-dropdown-header">
                            <strong>${Auth.user.name}</strong>
                            <span class="text-muted">${Auth.user.email}</span>
                        </div>
                        <div class="user-dropdown-divider"></div>
                        <button class="user-dropdown-item" onclick="Auth.manageAccount()">
                            <span class="icon">👤</span> My Account
                        </button>
                        <button class="user-dropdown-item" onclick="App.navigate('settings')">
                            <span class="icon">⚙️</span> Settings
                        </button>
                        <div class="user-dropdown-divider"></div>
                        <button class="user-dropdown-item danger" onclick="Auth.logout()">
                            <span class="icon">🚪</span> Sign Out
                        </button>
                    </div>
                `);

                // Toggle dropdown on click
                userBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    userMenu.querySelector('.user-dropdown')?.classList.toggle('hidden');
                });

                // Close on outside click
                document.addEventListener('click', () => {
                    userMenu.querySelector('.user-dropdown')?.classList.add('hidden');
                });
            }
        } else {
            // Show login button
            if (userBtn) {
                userBtn.innerHTML = `
                    <span class="avatar">👤</span>
                    <span class="user-name">Sign In</span>
                `;
                userBtn.onclick = () => Auth.showLoginModal();
            }
        }
    },

    // Get user initials
    getInitials(name) {
        if (!name) return '?';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    },

    // Show login modal
    showLoginModal() {
        const modal = document.getElementById('login-modal');
        if (modal) {
            modal.classList.remove('hidden');
        } else {
            // Create modal if it doesn't exist
            Auth.createLoginModal();
        }
    },

    // Hide login modal
    hideLoginModal() {
        document.getElementById('login-modal')?.classList.add('hidden');
    },

    // Create login modal
    createLoginModal() {
        const modalHTML = `
            <div id="login-modal" class="modal">
                <div class="modal-overlay" onclick="Auth.hideLoginModal()"></div>
                <div class="modal-content login-modal-content">
                    <button class="modal-close" onclick="Auth.hideLoginModal()">×</button>

                    <div class="login-header">
                        <span class="login-logo">📊</span>
                        <h2>Sign in to DataAcuity</h2>
                        <p>Choose your preferred sign-in method</p>
                    </div>

                    <div class="login-providers">
                        <button class="login-provider google" onclick="Auth.loginWithGoogle()">
                            <svg class="provider-icon" viewBox="0 0 24 24" width="20" height="20">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            <span>Continue with Google</span>
                        </button>

                        <button class="login-provider microsoft" onclick="Auth.loginWithMicrosoft()">
                            <svg class="provider-icon" viewBox="0 0 24 24" width="20" height="20">
                                <path fill="#F25022" d="M1 1h10v10H1z"/>
                                <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                                <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                                <path fill="#FFB900" d="M13 13h10v10H13z"/>
                            </svg>
                            <span>Continue with Microsoft</span>
                        </button>

                        <button class="login-provider github" onclick="Auth.loginWithGitHub()">
                            <svg class="provider-icon" viewBox="0 0 24 24" width="20" height="20">
                                <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                            </svg>
                            <span>Continue with GitHub</span>
                        </button>

                        <button class="login-provider linkedin" onclick="Auth.loginWithLinkedIn()">
                            <svg class="provider-icon" viewBox="0 0 24 24" width="20" height="20">
                                <path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                            <span>Continue with LinkedIn</span>
                        </button>
                    </div>

                    <div class="login-divider">
                        <span>or</span>
                    </div>

                    <button class="login-provider email" onclick="Auth.login()">
                        <span class="provider-icon">📧</span>
                        <span>Sign in with Email</span>
                    </button>

                    <div class="login-footer">
                        <p>Don't have an account? <a href="#" onclick="Auth.register(); return false;">Create one</a></p>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
};

// Initialize auth when DOM is ready (called after App.init)
document.addEventListener('DOMContentLoaded', () => {
    // Delay auth init slightly to let the UI render first
    setTimeout(() => Auth.init(), 100);
});
