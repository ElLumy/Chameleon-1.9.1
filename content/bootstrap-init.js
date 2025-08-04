// content/bootstrap-init.js
// Este script se ejecuta en el mundo de la página para establecer datos de inicialización
(function() {
    'use strict';
    
    // Obtener datos del atributo data-init del script actual
    const currentScript = document.currentScript;
    if (!currentScript || !currentScript.dataset.init) {
        console.error('[Chameleon Bootstrap] No initialization data found');
        return;
    }
    
    try {
        // Parsear los datos de inicialización
        const initData = JSON.parse(currentScript.dataset.init);
        
        // Establecer los datos en el objeto window para que el loader pueda accederlos
        window.__chameleonInitData = {
            sessionSeed: initData.sessionSeed,
            extensionId: initData.extensionId,
            timestamp: Date.now()
        };
        
        console.log('[Chameleon Bootstrap] Initialization data set successfully');
        
    } catch (error) {
        console.error('[Chameleon Bootstrap] Failed to parse initialization data:', error);
    }
})();