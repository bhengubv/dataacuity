// Market Dashboard with Loading States
const API_BASE = '/api';
let currentExchange = 'NYSE'; // Symbols: SPY, AAPL, MSFT, etc.
let currentCategory = 'metals';
let currentSymbol = 'SPY';
let currentLanguage = 'en';
let translations = {};
let chartInstance = null;

// Loading utilities
const LoadingManager = {
    progressBar: document.getElementById('progress-bar'),
    loadingStatus: document.getElementById('loading-status'),
    loadingScreen: document.getElementById('loading-screen'),
    topBar: document.getElementById('top-loading-bar'),
    dashboard: document.getElementById('dashboard'),

    setProgress(percent, status) {
        if (this.progressBar) this.progressBar.style.width = percent + '%';
        if (this.loadingStatus) this.loadingStatus.textContent = status;
        const percentageEl = document.getElementById('progress-percentage');
        if (percentageEl) {
            percentageEl.textContent = Math.round(percent) + '%';
        }
    },

    showTopBar() {
        if (!this.topBar) return;
        this.topBar.classList.add('active');
        this.topBar.style.width = '30%';
    },

    updateTopBar(percent) {
        if (!this.topBar) return;
        this.topBar.style.width = percent + '%';
    },

    hideTopBar() {
        if (!this.topBar) return;
        this.topBar.style.width = '100%';
        setTimeout(() => {
            this.topBar.classList.remove('active');
            this.topBar.style.width = '0%';
        }, 300);
    },

    hideLoadingScreen() {
        this.loadingScreen.classList.add('hidden');
        this.dashboard.classList.add('loaded');
        setTimeout(() => {
            this.loadingScreen.style.display = 'none';
        }, 500);
    },

    showPanelLoading(panelSelector) {
        const panel = document.querySelector(panelSelector);
        if (panel) {
            const loading = panel.querySelector('.panel-loading');
            if (loading) loading.classList.add('active');
        }
    },

    hidePanelLoading(panelSelector) {
        const panel = document.querySelector(panelSelector);
        if (panel) {
            const loading = panel.querySelector('.panel-loading');
            if (loading) loading.classList.remove('active');
        }
    }
};

// Initialize with loading sequence
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        const statsPanel = document.getElementById('stats-content');
        if (!statsPanel) return;
        statsPanel.innerHTML = `<div style="display: grid; gap: 1rem;"><div style="display: flex; justify-content: space-between; padding: 0.75rem; background: rgba(59, 130, 246, 0.1); border-radius: 0.5rem;"><span style="opacity: 0.8;">Total Symbols</span><span style="font-weight: bold; color: #22d3ee;">${data.total_symbols}</span></div><div style="display: flex; justify-content: space-between; padding: 0.75rem; background: rgba(59, 130, 246, 0.1); border-radius: 0.5rem;"><span style="opacity: 0.8;">Total Records</span><span style="font-weight: bold; color: #22d3ee;">${data.total_records.toLocaleString()}</span></div></div>`;
    } catch (error) { console.error('Stats error:', error); }
}

async function loadPredictions() {
    try {
        const response = await fetch(`${API_BASE}/predictions/${currentSymbol}`);
        const data = await response.json();
        const predPanel = document.getElementById('ai-content');
        if (!predPanel) return;
        const color = data.prediction.prediction === 'bullish' ? '#10b981' : '#ef4444';
        const arrow = data.prediction.prediction === 'bullish' ? '↗' : '↘';
        predPanel.innerHTML = `<div style="text-align: center; padding: 1rem;"><div style="font-size: 3rem;">${arrow}</div><div style="font-size: 1.5rem; font-weight: bold; color: ${color}; text-transform: uppercase;">${data.prediction.prediction}</div><div style="padding: 0.75rem; font-size: 0.875rem;">${data.prediction.reasoning}</div></div>`;
    } catch (error) { console.error('Prediction error:', error); }
}

async function init() {
    try {
        LoadingManager.setProgress(10, 'Loading language preferences...');
        currentLanguage = localStorage.getItem('language') || navigator.language.split('-')[0] || 'en';

        LoadingManager.setProgress(20, 'Loading translations...');
        await loadTranslations(currentLanguage);

        LoadingManager.setProgress(40, 'Loading language selector...');
        await loadLanguageSelector();

        LoadingManager.setProgress(50, 'Loading exchanges...');
        await loadExchanges();

        LoadingManager.setProgress(70, 'Loading market data...');
        await Promise.all([
            loadTopMovers(),
            loadSymbols()
        ]);

        LoadingManager.setProgress(90, 'Loading chart...');
        await loadChart(currentSymbol);
        await Promise.all([loadStats(), loadPredictions()]);

        LoadingManager.setProgress(100, 'Ready!');
        updateUILanguage();
        
        // Initialize category tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                LoadingManager.showTopBar();
                currentCategory = tab.dataset.category;
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                await Promise.all([loadTopMovers(), loadSymbols()]);
                LoadingManager.hideTopBar();
            });
        });

        setTimeout(() => {
            LoadingManager.hideLoadingScreen();
        }, 500);

    } catch (error) {
        console.error('Initialization error:', error);
        LoadingManager.setProgress(100, 'Error loading - retrying...');
        setTimeout(init, 2000);
    }
}

async function loadTranslations(langCode) {
    try {
        const response = await fetch(`${API_BASE}/translations/${langCode}`);
        const data = await response.json();
        translations = data.translations || {};
        currentLanguage = langCode;
        localStorage.setItem('language', langCode);
    } catch (error) {
        console.error('Failed to load translations:', error);
        if (langCode !== 'en') await loadTranslations('en');
    }
}

async function loadLanguageSelector() {
    try {
        const response = await fetch(`${API_BASE}/languages`);
        const data = await response.json();

        const selector = document.getElementById('language-selector');
        if (!selector) return;

        selector.innerHTML = data.languages.map(lang =>
            `<option value="${lang.code}" ${lang.code === currentLanguage ? 'selected' : ''}>
                ${lang.native_name}
            </option>`
        ).join('');

        selector.addEventListener('change', async (e) => {
            LoadingManager.showTopBar();
            await loadTranslations(e.target.value);
            updateUILanguage();
        
        // Initialize category tabs
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                LoadingManager.showTopBar();
                currentCategory = tab.dataset.category;
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                await Promise.all([loadTopMovers(), loadSymbols()]);
                LoadingManager.hideTopBar();
            });
        });
            LoadingManager.updateTopBar(50);
            await loadTopMovers();
            LoadingManager.hideTopBar();
        });
    } catch (error) {
        console.error('Failed to load languages:', error);
    }
}

function t(key, fallback = key) {
    return translations[key] || fallback;
}

function updateUILanguage() {
    document.querySelectorAll('[data-category]').forEach(tab => {
        const category = tab.dataset.category;
        const icon = tab.textContent.split(' ')[0];
        tab.textContent = `${icon} ${t(category, category.toUpperCase())}`;
    });

    const symbolsHeader = document.querySelector('.symbols-header');
    if (symbolsHeader) symbolsHeader.textContent = t('symbols', 'SYMBOLS');

    document.querySelectorAll('.movers-title').forEach((title, idx) => {
        const icon = title.textContent.split(' ')[0];
        title.textContent = `${icon} ${t(idx === 0 ? 'top_gainers' : 'top_losers')}`;
    });

    document.querySelectorAll('.panel-title').forEach((title, idx) => {
        const icon = title.textContent.split(' ')[0];
        const key = idx === 0 ? 'ai_prediction' : 'stats';
        title.textContent = `${icon} ${t(key)}`;
    });
}

async function loadExchanges() {
    try {
        const response = await fetch(`${API_BASE}/exchanges`);
        let exchanges = await response.json();

        // Remove CRYPTO
        exchanges = exchanges.filter(ex => ex.code !== 'CRYPTO' && ex.symbols > 0);

        // Define regional groupings
        const regionGroups = {
            southAfrica: ['JSE'],
            china: ['SSE', 'SZSE', 'HKEX'],
            usa: ['NYSE', 'NASDAQ', 'AMEX'],
            japan: ['TSE', 'JPX'],
            germany: ['FWB', 'XETRA'],
            uk: ['LSE']
        };

        // Categorize and sort exchanges
        const categorized = {
            southAfrica: [],
            china: [],
            usa: [],
            japan: [],
            germany: [],
            uk: [],
            others: []
        };

        exchanges.forEach(ex => {
            let placed = false;
            for (const [region, codes] of Object.entries(regionGroups)) {
                if (codes.includes(ex.code)) {
                    categorized[region].push(ex);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                categorized.others.push(ex);
            }
        });

        // Sort each category alphabetically
        Object.keys(categorized).forEach(key => {
            categorized[key].sort((a, b) => a.code.localeCompare(b.code));
        });

        // Combine in order: SA, China, US, Japan, Germany, UK, Others
        const sortedExchanges = [
            ...categorized.southAfrica,
            ...categorized.china,
            ...categorized.usa,
            ...categorized.japan,
            ...categorized.germany,
            ...categorized.uk,
            ...categorized.others
        ];

        const sidebar = document.querySelector('.exchange-sidebar');
        if (!sidebar) return;

        sidebar.innerHTML = '';

        sortedExchanges.forEach((ex, index) => {
            const tab = document.createElement('div');
            tab.className = 'exchange-tab' + (index === 0 ? ' active' : '');
            tab.setAttribute('data-exchange', ex.code);
            tab.innerHTML = `${ex.code}<span class="exchange-count">${ex.symbols}</span>`;
            
            tab.addEventListener('click', async () => {
                LoadingManager.showTopBar();
                currentExchange = ex.code;
                document.querySelectorAll('.exchange-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const titleEl = document.querySelector('.exchange-title');
                if (titleEl) titleEl.textContent = ex.code;

                LoadingManager.updateTopBar(40);
                await loadSymbols();

                LoadingManager.updateTopBar(70);
                await loadChart(currentSymbol);

                LoadingManager.hideTopBar();
            });
            
            sidebar.appendChild(tab);
        });

        // Update title for first exchange
        const titleEl = document.querySelector('.exchange-title');
        if (titleEl && sortedExchanges.length > 0) {
            titleEl.textContent = sortedExchanges[0].code;
            currentExchange = sortedExchanges[0].code;
        }
    } catch (error) {
        console.error('Failed to load exchanges:', error);
    }
}





function displaySymbols(symbols) {
    const symbolsList = document.getElementById('symbols-list');
    if (!symbolsList) return;
    
    symbolsList.innerHTML = symbols.map(symbol => `
        <div class="symbol-item" onclick="selectSymbol('${symbol.symbol}', this)">
            ${symbol.symbol}
            <div class="symbol-arrow">$</div>
        </div>
    `).join('');
}


function getCategoryAssetType(category) {
    const categoryMap = {
        'metals': 'FUTURE',
        'crypto': 'CRYPTOCURRENCY',
        'stocks': 'EQUITY',
        'indices': 'ETF'
    };
    return categoryMap[category] || 'EQUITY';
}

async function loadSymbols() {
    LoadingManager.showPanelLoading('.symbols-panel');
    try {
        const assetType = getCategoryAssetType(currentCategory);
        const params = new URLSearchParams({
            asset_type: assetType,
            limit: 50
        });
        if (currentExchange && currentExchange !== 'All Exchanges') {
            params.append('exchange', currentExchange);
        }
        const response = await fetch(`${API_BASE}/symbols?${params}`);
        const data = await response.json();
        const symbolsList = document.getElementById('symbols-list');
        symbolsList.innerHTML = '';
        data.symbols.forEach((symbol, index) => {
            const item = document.createElement('div');
            item.className = 'symbol-item' + (index === 0 ? ' active' : '');
            item.innerHTML = `
                <span>${symbol.name || symbol.symbol}</span>
                <span class="symbol-arrow">$</span>
            `;
            item.addEventListener('click', () => selectSymbol(symbol.symbol, item));
            symbolsList.appendChild(item);
        });
        if (data.symbols.length > 0) {
            currentSymbol = data.symbols[0].symbol;
        }
    } catch (error) {
        console.error('Failed to load symbols:', error);
    } finally {
        LoadingManager.hidePanelLoading('.symbols-panel');
    }
}

async function loadTopMovers() {
    LoadingManager.showPanelLoading('.movers-section');
    try {
        const response = await fetch(`${API_BASE}/top-movers?category=${currentCategory}`);
        const data = await response.json();
        console.log('Top movers data:', data);
        console.log('Gainers:', data.gainers?.length || 0, 'Losers:', data.losers?.length || 0);
        console.log('Top movers data:', data);
        console.log('Gainers:', data.gainers?.length || 0, 'Losers:', data.losers?.length || 0);

        const gainersList = document.getElementById('gainers-list');
        gainersList.innerHTML = '';
        (data.gainers || []).slice(0, 5).forEach(mover => {
            const item = document.createElement('div');
            item.className = 'mover-item';
            item.innerHTML = `
                <span>${mover.symbol}</span>
                <span class="mover-change positive">+${mover.change.toFixed(2)}%</span>
            `;
            item.addEventListener('click', () => selectSymbol(mover.symbol));
            gainersList.appendChild(item);
        });

        const losersList = document.getElementById('losers-list');
        losersList.innerHTML = '';
        (data.losers || []).slice(0, 5).forEach(mover => {
            const item = document.createElement('div');
            item.className = 'mover-item';
            item.innerHTML = `
                <span>${mover.symbol}</span>
                <span class="mover-change negative">${mover.change.toFixed(2)}%</span>
            `;
            item.addEventListener('click', () => selectSymbol(mover.symbol));
            losersList.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load top movers:', error);
    } finally {
        LoadingManager.hidePanelLoading('.movers-section');
    }
}

async function loadChart(symbol) {
    LoadingManager.showPanelLoading('.chart-panel');
    try {
        const chartContainer = document.querySelector('.chart-container');
        if (!chartContainer) {
            console.error('Chart container not found');
            return;
        }
        chartContainer.innerHTML = '<canvas id="priceChart"></canvas>';

        const response = await fetch(`${API_BASE}/historical/${symbol}?interval=30d`);
        const data = await response.json();

        if (!data || data.length === 0) {
            chartContainer.innerHTML = '<div style="opacity: 0.5; text-align: center; padding: 2rem;">No data available</div>';
            return;
        }

        const chartData = data;
        const labels = chartData.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const prices = chartData.map(d => d.close);

        if (chartInstance) chartInstance.destroy();

        const ctx = document.getElementById('priceChart').getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${symbol} Price`,
                    data: prices,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#ffffff', maxRotation: 45, minRotation: 45 }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: {
                            color: '#ffffff',
                            callback: function(value) { return '$' + value.toFixed(2); }
                        }
                    }
                }
            }
        });

        document.querySelector('.chart-title').textContent = `${symbol} - 30 Day ${t('chart', 'Chart')}`;
    } catch (error) {
        console.error('Failed to load chart:', error, symbol);
        const chartContainer = document.querySelector('.chart-container');
        if (chartContainer) {
            chartContainer.innerHTML = '<div style="opacity: 0.5; text-align: center; padding: 2rem;">Error loading chart</div>';
        }
    } finally {
        LoadingManager.hidePanelLoading('.chart-panel');
    }
}

function selectSymbol(symbol, itemElement = null) {
    currentSymbol = symbol;
    if (itemElement) {
        document.querySelectorAll('.symbol-item').forEach(i => i.classList.remove('active'));
        itemElement.classList.add('active');
    }
    loadChart(symbol);
}



// Initialize on load
window.addEventListener('DOMContentLoaded', init);

// Auto-refresh every minute
setInterval(() => {
    loadTopMovers();
    loadSymbols();
}, 60000);
