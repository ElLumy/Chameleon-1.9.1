// content/injector.js
// Este script se ejecuta en el contexto ISOLATED y actúa como puente
(async function() {
    'use strict';
    
    console.log('[Chameleon Injector] Starting initialization...');

    // Verificar que chrome.runtime esté disponible
    if (!chrome?.runtime?.id) {
        console.error('[Chameleon Injector] Extension context not available');
        return;
    }

    // Estado de la inyección
    const injectionState = {
        attempted: false,
        successful: false,
        retries: 0,
        maxRetries: 3
    };

    // Función para inyectar script en el MAIN world
    function injectScriptToMainWorld(code) {
        const script = document.createElement('script');
        script.textContent = code;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    }

    // Función para inyectar script externo en el MAIN world
    function injectExternalScriptToMainWorld(url, attributes = {}) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = false;
            
            // Añadir atributos adicionales
            Object.entries(attributes).forEach(([key, value]) => {
                script.setAttribute(key, value);
            });
            
            script.onload = () => {
                console.log(`[Chameleon Injector] Script loaded in MAIN world: ${url}`);
                resolve(script);
            };
            
            script.onerror = (error) => {
                console.error(`[Chameleon Injector] Failed to load script: ${url}`, error);
                reject(new Error(`Failed to load ${url}`));
            };
            
            // Añadir a la página
            const target = document.head || document.documentElement;
            target.appendChild(script);
        });
    }

    // Función para inyectar el loader principal
    async function injectChameleonLoader() {
        if (injectionState.attempted && injectionState.successful) {
            console.log('[Chameleon Injector] Already injected successfully');
            return;
        }
        
        injectionState.attempted = true;
        
        try {
            console.log('[Chameleon Injector] Getting session seed and profiles data...');
            
            // Obtener la semilla de sesión con reintentos
            let sessionSeed = null;
            let seedRetries = 5;
            
            while (seedRetries > 0 && !sessionSeed) {
                try {
                    const response = await chrome.runtime.sendMessage({ action: 'getSessionSeed' });
                    if (response && response.seed) {
                        sessionSeed = response.seed;
                        console.log('[Chameleon Injector] Got session seed:', sessionSeed.substring(0, 8) + '...');
                        break;
                    }
                } catch (error) {
                    console.warn('[Chameleon Injector] Seed fetch attempt failed:', error);
                }
                
                await new Promise(resolve => setTimeout(resolve, 200));
                seedRetries--;
            }
            
            // Si no hay seed, generar uno localmente como fallback
            if (!sessionSeed) {
                const array = new Uint8Array(32);
                crypto.getRandomValues(array);
                sessionSeed = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
                console.warn('[Chameleon Injector] Using locally generated seed');
            }
            
            // Obtener profiles data del service worker
            let profilesData = null;
            try {
                const response = await chrome.runtime.sendMessage({ action: 'getProfilesData' });
                if (response && response.profilesData) {
                    profilesData = response.profilesData;
                    console.log('[Chameleon Injector] Got profiles data from service worker');
                }
            } catch (error) {
                console.warn('[Chameleon Injector] Could not get profiles data from service worker:', error);
            }
            
            // Preparar los datos de inicialización
            const initData = {
                sessionSeed: sessionSeed,
                extensionId: chrome.runtime.id,
                profilesData: profilesData // Incluir profiles data si está disponible
            };
            
            console.log('[Chameleon Injector] Injecting initialization data to MAIN world...');
            
            // Inyectar los datos de inicialización directamente en el MAIN world
            injectScriptToMainWorld(`
                (function() {
                    window.__chameleonInitData = ${JSON.stringify(initData)};
                    console.log('[Chameleon] Initialization data set in MAIN world');
                })();
            `);
            
            // Esperar un momento para que los datos se establezcan
            await new Promise(resolve => setTimeout(resolve, 50));
            
            console.log('[Chameleon Injector] Injecting loader script...');
            
            // Ahora inyectar el loader en el MAIN world
            const loaderUrl = chrome.runtime.getURL('content/chameleon-loader.js');
            await injectExternalScriptToMainWorld(loaderUrl);
            
            injectionState.successful = true;
            console.log('[Chameleon Injector] Loader script injected successfully');
            
            // Establecer comunicación bidireccional
            setupCommunicationBridge();
            
        } catch (error) {
            console.error('[Chameleon Injector] Injection failed:', error);
            injectionState.successful = false;
            
            // Reintentar si es posible
            if (injectionState.retries < injectionState.maxRetries) {
                injectionState.retries++;
                console.log(`[Chameleon Injector] Retrying injection (${injectionState.retries}/${injectionState.maxRetries})...`);
                setTimeout(() => {
                    injectionState.attempted = false;
                    injectChameleonLoader();
                }, 1000 * injectionState.retries);
            }
        }
    }

    // Configurar puente de comunicación
    function setupCommunicationBridge() {
        console.log('[Chameleon Injector] Setting up communication bridge...');
        
        // Escuchar mensajes desde el contexto principal
        window.addEventListener('message', async (event) => {
            // Verificar que el mensaje sea de nuestra extensión
            if (event.source !== window || !event.data || event.data.source !== 'chameleon-main') {
                return;
            }
            
            console.log('[Chameleon Injector] Received message from page:', event.data.action);
            
            let response = null;
            
            try {
                switch (event.data.action) {
                    case 'saveProfile':
                        // Guardar el perfil en storage con reintentos
                        let saveRetries = 3;
                        while (saveRetries > 0) {
                            try {
                                await chrome.storage.session.set({
                                    profile: event.data.data.profile,
                                    timestamp: Date.now()
                                });
                                
                                // Notificar al service worker que el perfil está listo
                                try {
                                    await chrome.runtime.sendMessage({ 
                                        action: 'profileReady',
                                        profile: event.data.data.profile
                                    });
                                } catch (e) {
                                    console.warn('[Chameleon Injector] Could not notify service worker:', e);
                                }
                                
                                response = { success: true };
                                console.log('[Chameleon Injector] Profile saved to storage');
                                break;
                            } catch (error) {
                                console.warn('[Chameleon Injector] Save attempt failed:', error);
                                saveRetries--;
                                if (saveRetries > 0) {
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                } else {
                                    throw error;
                                }
                            }
                        }
                        break;
                        
                    case 'getSessionInfo':
                        response = await chrome.runtime.sendMessage({ action: 'getSessionInfo' });
                        break;
                        
                    case 'checkVPN':
                        response = await chrome.runtime.sendMessage({ action: 'checkVPN' });
                        break;
                        
                    default:
                        response = { error: 'Unknown action' };
                }
            } catch (error) {
                console.error('[Chameleon Injector] Error handling message:', error);
                response = { error: error.message };
            }
            
            // Enviar respuesta de vuelta al contexto principal
            if (event.data.id) {
                window.postMessage({
                    source: 'chameleon-isolated',
                    id: event.data.id,
                    action: event.data.action,
                    data: response
                }, '*');
            }
        });
        
        console.log('[Chameleon Injector] Communication bridge established');
    }

    // Función para verificar si el DOM está listo
    function waitForDOM() {
        return new Promise((resolve) => {
            if (document.head) {
                resolve();
            } else {
                const observer = new MutationObserver((mutations, obs) => {
                    if (document.head) {
                        obs.disconnect();
                        resolve();
                    }
                });
                observer.observe(document.documentElement, { 
                    childList: true, 
                    subtree: true 
                });
                
                // Timeout de seguridad
                setTimeout(() => {
                    observer.disconnect();
                    resolve();
                }, 5000);
            }
        });
    }

    // Iniciar inyección
    async function initialize() {
        try {
            // Esperar a que el DOM tenga al menos una cabecera
            await waitForDOM();
            
            console.log('[Chameleon Injector] DOM ready, injecting...');
            await injectChameleonLoader();
            
        } catch (error) {
            console.error('[Chameleon Injector] Initialization error:', error);
        }
    }

    // Iniciar inmediatamente
    initialize();
})();