// Diagnostic wrapper for init function
async function initWithDiagnostics() {
    console.log('[DIAG] Starting initialization...');

    try {
        console.log('[DIAG] Step 1: LoadingProgress.init()');
        LoadingProgress.init();

        console.log('[DIAG] Step 2: update(0, Initializing...)');
        LoadingProgress.update(0, 'Initializing...');

        console.log('[DIAG] Step 3: Loading language preferences');
        LoadingManager.setProgress(10, 'Loading language preferences...');
        currentLanguage = localStorage.getItem('language') || navigator.language.split('-')[0] || 'en';
        console.log('[DIAG] Language:', currentLanguage);

        console.log('[DIAG] Step 4: Loading translations');
        LoadingManager.setProgress(20, 'Loading translations...');
        await loadTranslations(currentLanguage);
        console.log('[DIAG] Translations loaded');

        console.log('[DIAG] Step 5: Loading language selector');
        LoadingManager.setProgress(40, 'Loading language selector...');
        loadLanguageSelector();

        console.log('[DIAG] Step 6: Loading exchanges');
        LoadingManager.setProgress(50, 'Loading exchanges...');
        await loadExchanges();
        console.log('[DIAG] Exchanges loaded');

        console.log('[DIAG] Step 7: Loading market data');
        LoadingManager.setProgress(70, 'Loading market data...');
        await Promise.all([loadTopMovers(), loadSymbols()]);
        console.log('[DIAG] Market data loaded');

        console.log('[DIAG] Step 8: Loading chart');
        LoadingManager.setProgress(90, 'Loading chart...');
        await loadChart(currentSymbol);
        console.log('[DIAG] Chart loaded');

        console.log('[DIAG] Step 9: Loading analytics');
        await Promise.all([loadStats(), loadPredictions()]);
        console.log('[DIAG] Analytics loaded');

        console.log('[DIAG] Step 10: Hiding loading screen');
        LoadingManager.setProgress(100, 'Ready!');

        setTimeout(() => {
            console.log('[DIAG] Calling hideLoadingScreen()');
            LoadingManager.hideLoadingScreen();
            console.log('[DIAG] ✓ Initialization complete!');
        }, 500);

    } catch (error) {
        console.error('[DIAG] ✗ Initialization failed:', error);
        console.error('[DIAG] Stack:', error.stack);
        LoadingManager.setProgress(100, 'Error loading - retrying...');
        setTimeout(initWithDiagnostics, 2000);
    }
}

// Test this by running: initWithDiagnostics()
console.log('[DIAG] Diagnostic script loaded. Run initWithDiagnostics() to test.');
