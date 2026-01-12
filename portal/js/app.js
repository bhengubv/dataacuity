// DataAcuity Portal - Main Application

const App = {
    currentPage: 'home',

    async init() {
        // Load saved theme
        const savedTheme = localStorage.getItem('dataacuity_theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            App.updateThemeIcon(savedTheme);
        }

        // Wait for i18n to initialize first (loads saved language)
        if (typeof i18n !== 'undefined' && !i18n.initialized) {
            await i18n.init();
        }

        // Restore sidebar state from preferences
        App.restoreSidebarState();

        // Setup navigation
        App.setupNavigation();

        // Setup keyboard shortcuts
        App.setupKeyboard();

        // Setup command palette
        App.setupCommandPalette();

        // Setup onboarding
        App.setupOnboarding();

        // Setup language selector
        App.setupLanguageSelector();

        // Load initial page (now with correct language)
        App.loadPage('home');

        // Update navbar based on auth (will be called again after Auth.init)
        App.updateNavbar();

        // Start status checking only for authenticated users
        setTimeout(() => {
            if (Auth.isAuthenticated()) {
                StatusChecker.startPolling();
            }
        }, 500);

        // Show onboarding only for authenticated new users
        setTimeout(() => {
            if (Auth.isAuthenticated()) {
                Onboarding.show();
            }
        }, 1000);
    },

    // Update navbar visibility based on auth state
    updateNavbar() {
        const navMenu = document.querySelector('.nav-menu');
        const sidebar = document.getElementById('sidebar');
        const isAuthenticated = Auth.isAuthenticated();

        // Legacy nav-menu support
        if (navMenu) {
            navMenu.style.display = isAuthenticated ? '' : 'none';
        }

        // Hide sidebar for unauthenticated users
        if (sidebar) {
            sidebar.style.display = isAuthenticated ? '' : 'none';
        }

        // Adjust main content margin when sidebar is hidden
        const mainContent = document.getElementById('main-content');
        if (mainContent && !isAuthenticated) {
            mainContent.style.marginLeft = '0';
        } else if (mainContent && isAuthenticated && window.innerWidth > 768) {
            mainContent.style.marginLeft = '';
        }

        // Update user avatar and info
        App.updateUserInfo();

        // Update body and html class for landing page styling
        const isLanding = !isAuthenticated;
        document.documentElement.classList.toggle('landing-mode', isLanding);
        document.body.classList.toggle('landing-mode', isLanding);
    },

    // Update user info in the header
    updateUserInfo() {
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('dropdown-user-name');
        const userEmail = document.getElementById('dropdown-user-email');

        if (Auth.isAuthenticated() && Auth.user) {
            const initials = Auth.user.name
                ? Auth.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                : Auth.user.email?.[0]?.toUpperCase() || '?';

            if (userAvatar) userAvatar.textContent = initials;
            if (userName) userName.textContent = Auth.user.name || 'User';
            if (userEmail) userEmail.textContent = Auth.user.email || '';
        } else {
            if (userAvatar) userAvatar.textContent = '?';
            if (userName) userName.textContent = 'Guest';
            if (userEmail) userEmail.textContent = '';
        }
    },

    // Called by Auth module when auth state changes
    async onAuthStateChange() {
        App.updateNavbar();

        // Load user preferences (language, theme) when they log in
        if (Auth.isAuthenticated() && Auth.user?.email) {
            // Check waitlist access
            if (typeof Waitlist !== 'undefined' && !Waitlist.isAllowed(Auth.user.email)) {
                // Add to waitlist and show waitlist page
                await Waitlist.addToWaitlist(Auth.user);
                App.showWaitlistPage();
                return;
            }

            try {
                const prefs = await i18n.loadUserPreferences(Auth.user.email);
                if (prefs?.language && prefs.language !== i18n.currentLanguage) {
                    i18n.currentLanguage = prefs.language;
                    i18n.translations = i18n.allTranslations[prefs.language] || i18n.allTranslations['en'];
                    localStorage.setItem('dataacuity_language', prefs.language);
                    document.documentElement.lang = prefs.language;
                    App.updateLanguageButton();
                }
                if (prefs?.theme) {
                    App.setTheme(prefs.theme);
                }
            } catch (error) {
                console.warn('Failed to load user preferences:', error);
            }
            StatusChecker.startPolling();
        }

        App.loadPage(App.currentPage);
    },

    // Show waitlist page for non-allowed users
    showWaitlistPage() {
        const main = document.getElementById('main-content');
        if (typeof Waitlist !== 'undefined') {
            main.innerHTML = Waitlist.renderPage();
        }
        // Hide navbar for waitlist users
        const navMenu = document.querySelector('.nav-menu');
        if (navMenu) {
            navMenu.style.display = 'none';
        }
    },

    // Check if current user should see waitlist
    isOnWaitlist() {
        if (!Auth.isAuthenticated() || !Auth.user?.email) return false;
        return typeof Waitlist !== 'undefined' && !Waitlist.isAllowed(Auth.user.email);
    },

    setupNavigation() {
        // Sidebar toggle
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            App.toggleSidebar();
        });

        // Sidebar navigation items (pages)
        document.querySelectorAll('.nav-item[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                App.navigate(page);
                // Close sidebar on mobile after navigation
                if (window.innerWidth <= 768) {
                    document.body.classList.remove('sidebar-open');
                }
            });
        });

        // Sidebar navigation items (apps)
        document.querySelectorAll('.nav-item[data-app]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const appId = link.dataset.app;
                App.openApp(appId);
            });
        });

        // Legacy nav-link support
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page || link.getAttribute('href')?.substring(1);
                if (page) App.navigate(page);
            });
        });

        // Theme toggle
        document.getElementById('theme-toggle')?.addEventListener('click', () => {
            App.toggleTheme();
        });

        // Search trigger opens command palette
        document.getElementById('search-trigger')?.addEventListener('click', () => {
            CommandPalette.toggle();
        });

        // User menu dropdown
        document.getElementById('user-menu-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('user-dropdown')?.classList.toggle('hidden');
        });

        // Close user dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const userMenu = document.getElementById('user-menu');
            if (userMenu && !userMenu.contains(e.target)) {
                document.getElementById('user-dropdown')?.classList.add('hidden');
            }
        });

        // User dropdown item navigation
        document.querySelectorAll('.user-dropdown .dropdown-item[data-page]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                document.getElementById('user-dropdown')?.classList.add('hidden');
                App.navigate(page);
            });
        });

        // Logout button
        document.getElementById('logout-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('user-dropdown')?.classList.add('hidden');
            Auth.logout();
        });

        // Mobile menu (legacy support)
        document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
            document.querySelector('.nav-menu')?.classList.toggle('show');
        });
    },

    toggleSidebar() {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            document.body.classList.toggle('sidebar-open');
        } else {
            document.body.classList.toggle('sidebar-collapsed');
            // Save preference
            localStorage.setItem('dataacuity_sidebar_collapsed',
                document.body.classList.contains('sidebar-collapsed'));
        }
    },

    restoreSidebarState() {
        const collapsed = localStorage.getItem('dataacuity_sidebar_collapsed') === 'true';
        if (collapsed && window.innerWidth > 768) {
            document.body.classList.add('sidebar-collapsed');
        }
    },

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Only enable shortcuts for authenticated users
            if (!Auth.isAuthenticated()) return;

            // Cmd/Ctrl + K - Open command palette
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                CommandPalette.toggle();
                return;
            }

            // Handle command palette navigation
            if (CommandPalette.isOpen) {
                if (e.key === 'Escape') {
                    CommandPalette.close();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    CommandPalette.navigate('down');
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    CommandPalette.navigate('up');
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    CommandPalette.select();
                }
            }

            // Escape for modals
            if (e.key === 'Escape') {
                document.getElementById('onboarding-modal')?.classList.add('hidden');
            }
        });
    },

    setupCommandPalette() {
        const input = document.getElementById('command-input');
        const overlay = document.querySelector('.command-overlay');

        input?.addEventListener('input', (e) => {
            CommandPalette.updateResults(e.target.value);
        });

        overlay?.addEventListener('click', () => {
            CommandPalette.close();
        });
    },

    setupOnboarding() {
        document.getElementById('onboarding-next')?.addEventListener('click', () => {
            Onboarding.next();
        });

        document.getElementById('onboarding-skip')?.addEventListener('click', () => {
            Onboarding.skip();
        });

        document.querySelector('#onboarding-modal .modal-overlay')?.addEventListener('click', () => {
            Onboarding.skip();
        });
    },

    setupLanguageSelector() {
        const langBtn = document.getElementById('language-btn');
        const langDropdown = document.getElementById('language-dropdown');

        if (!langBtn || !langDropdown) return;

        // Update button with current language
        App.updateLanguageButton();

        // Toggle dropdown on button click
        langBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            langDropdown.classList.toggle('hidden');
            App.populateLanguageDropdown();
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => {
            langDropdown.classList.add('hidden');
        });

        // Listen for language changes
        window.addEventListener('languageChange', () => {
            App.updateLanguageButton();
        });
    },

    updateLanguageButton() {
        const langCodeEl = document.querySelector('.lang-code');
        if (langCodeEl && typeof i18n !== 'undefined') {
            const currentLang = i18n.getLanguageByCode(i18n.getLanguage());
            langCodeEl.textContent = currentLang ? currentLang.native_name : i18n.getLanguage().toUpperCase();
        }
    },

    populateLanguageDropdown() {
        const dropdown = document.getElementById('language-dropdown');
        if (!dropdown || typeof i18n === 'undefined') return;

        const languages = i18n.getLanguages();
        const currentLang = i18n.getLanguage();

        dropdown.innerHTML = languages.map(lang => `
            <button class="language-option ${lang.code === currentLang ? 'active' : ''}"
                    onclick="App.changeLanguage('${lang.code}')">
                <div>
                    <span class="lang-name">${lang.native_name}</span>
                    ${lang.native_name !== lang.name ? `<span class="lang-native"> (${lang.name})</span>` : ''}
                </div>
                ${lang.code === currentLang ? '<span class="lang-check">✓</span>' : ''}
            </button>
        `).join('');
    },

    async changeLanguage(langCode) {
        document.getElementById('language-dropdown')?.classList.add('hidden');

        if (typeof i18n !== 'undefined') {
            await i18n.setLanguage(langCode);
            Toast.success(t('common.save'), `Language changed to ${i18n.getLanguageByCode(langCode)?.name || langCode}`);
        }
    },

    navigate(page) {
        // Redirect to home/landing if not authenticated (except for public pages)
        const publicPages = ['home', 'pricing'];
        if (!Auth.isAuthenticated() && !publicPages.includes(page)) {
            page = 'home';
        }

        App.currentPage = page;

        // Update sidebar nav active state
        document.querySelectorAll('.nav-item[data-page]').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // Update legacy nav-link active state
        document.querySelectorAll('.nav-link').forEach(link => {
            const linkPage = link.dataset.page || link.getAttribute('href')?.substring(1);
            link.classList.toggle('active', linkPage === page);
        });

        // Load page
        App.loadPage(page);

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Close mobile menu
        document.querySelector('.nav-menu')?.classList.remove('show');
    },

    loadPage(page) {
        const main = document.getElementById('main-content');

        // Check if user is on waitlist - always show waitlist page
        if (App.isOnWaitlist()) {
            App.showWaitlistPage();
            return;
        }

        if (Pages[page]) {
            main.innerHTML = Pages[page]();
        } else {
            main.innerHTML = Pages.home();
        }

        // Update status after render (only for authenticated)
        if (Auth.isAuthenticated()) {
            StatusChecker.updateUI();
        }
    },

    openApp(appId) {
        // Require authentication to open apps
        if (!Auth.isAuthenticated()) {
            Auth.showLoginModal();
            return;
        }

        const app = CONFIG.apps[appId];
        if (!app || !app.url) {
            Toast.error('App Not Found', 'This app is not available');
            return;
        }

        // Check if free tier user can access this app
        if (Auth.isFreeTier() && !app.freeTier) {
            Toast.info('Premium Feature', 'Upgrade to access ' + app.name);
            App.navigate('pricing');
            return;
        }

        // Check if user can access this app (role-based)
        if (!Pages.canAccessApp(app)) {
            Toast.error('Access Denied', 'You do not have permission to access this app');
            return;
        }

        window.open(app.url, '_blank');
        Toast.info(`Opening ${app.name}`, 'Opening in new tab...');
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = current === 'light' ? 'dark' : 'light';
        App.setTheme(newTheme);
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('dataacuity_theme', theme);
        App.updateThemeIcon(theme);

        // Save to user account if authenticated
        if (typeof i18n !== 'undefined') {
            i18n.saveUserPreference('theme', theme);
        }

        // Re-render if on settings page
        if (App.currentPage === 'settings') {
            App.loadPage('settings');
        }
    },

    updateThemeIcon(theme) {
        // The CSS now handles icon visibility via [data-theme] selectors
        // This function is kept for compatibility but the icons auto-switch
        const btn = document.getElementById('theme-toggle');
        if (btn) {
            // Legacy emoji support (if .icon element exists)
            const iconEl = btn.querySelector('.icon');
            if (iconEl && iconEl.textContent) {
                iconEl.textContent = theme === 'dark' ? '☀️' : '🌙';
            }
        }
    },

    getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        return 'evening';
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
