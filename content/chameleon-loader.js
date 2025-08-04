// content/chameleon-loader.js
// Este script carga todos los módulos de Chameleon en orden
(function() {
  'use strict';
  
  console.log('[Chameleon Loader] Starting module loading...');
  
  // Verificar que los datos de inicialización estén disponibles
  if (!window.__chameleonInitData) {
    console.error('[Chameleon Loader] No initialization data found. Bootstrap may have failed.');
    return;
  }
  
  // Obtener datos de inicialización
  const { sessionSeed, extensionId, profilesData } = window.__chameleonInitData;
  
  console.log('[Chameleon Loader] Using session seed:', sessionSeed.substring(0, 8) + '...');
  console.log('[Chameleon Loader] Extension ID:', extensionId);
  console.log('[Chameleon Loader] Profiles data:', profilesData ? 'Preloaded' : 'Will fetch');
  
  // Lista de módulos a cargar en orden
  const modules = [
    'lib/seedrandom.min.js',
    'content/modules/utils/jitter.js',
    'content/modules/interceptors/meta-proxy.js',
    'content/modules/interceptors/navigator.js',
    'content/modules/interceptors/screen.js',
    'content/modules/interceptors/canvas.js',
    'content/modules/interceptors/webgl.js',
    'content/modules/interceptors/audio.js',
    'content/modules/interceptors/timezone.js'
  ];
  
  let loadedModules = 0;
  
  // Función para cargar un módulo
  function loadModule(modulePath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `chrome-extension://${extensionId}/${modulePath}`;
      script.async = false;
      
      script.onload = () => {
        loadedModules++;
        console.log(`[Chameleon Loader] Loaded module ${loadedModules}/${modules.length}: ${modulePath}`);
        resolve();
      };
      
      script.onerror = (error) => {
        console.error(`[Chameleon Loader] Failed to load module: ${modulePath}`, error);
        reject(new Error(`Failed to load ${modulePath}`));
      };
      
      (document.head || document.documentElement).appendChild(script);
    });
  }
  
  // Función para cargar profiles.json
  async function loadProfilesData() {
    // Si ya tenemos los datos precargados, usarlos
    if (profilesData) {
      console.log('[Chameleon Loader] Using preloaded profiles data');
      return profilesData;
    }
    
    try {
      const response = await fetch(`chrome-extension://${extensionId}/data/profiles.json`);
      if (!response.ok) {
        throw new Error('Failed to load profiles data: ' + response.status);
      }
      const data = await response.json();
      console.log('[Chameleon Loader] Profiles data loaded successfully');
      return data;
    } catch (error) {
      console.error('[Chameleon Loader] Failed to load profiles data:', error);
      return null;
    }
  }
  
  // Cargar módulos secuencialmente
  async function loadModulesSequentially() {
    for (const module of modules) {
      try {
        await loadModule(module);
      } catch (error) {
        console.error('[Chameleon Loader] Module loading stopped due to error:', error);
        return false;
      }
    }
    return true;
  }
  
  // Inicializar Chameleon principal
  async function initializeChameleon() {
    console.log('[Chameleon Loader] All modules loaded, initializing main...');
    
    try {
      // Cargar datos de perfiles (usar precargados si están disponibles)
      const profilesDataToUse = profilesData || await loadProfilesData();
      if (!profilesDataToUse) {
        throw new Error('Profiles data not available');
      }
      
      // Actualizar datos globales para chameleon-main
      window.__chameleonInitData.profilesData = profilesDataToUse;
      window.__chameleonInitData.sessionSeed = sessionSeed;
      
      // Cargar y ejecutar chameleon-main.js
      await loadModule('content/chameleon-main.js');
      
      console.log('[Chameleon Loader] Chameleon fully loaded and initialized');
      
      // Disparar evento de inicialización completa
      window.dispatchEvent(new CustomEvent('chameleonLoaded', {
        detail: {
          success: true,
          timestamp: Date.now()
        }
      }));
      
      // Limpiar datos de inicialización después de un tiempo
      setTimeout(() => {
        // No eliminar __chameleonInitData ya que chameleon-main lo necesita
        console.log('[Chameleon Loader] Initialization complete');
      }, 1000);
      
    } catch (error) {
      console.error('[Chameleon Loader] Initialization error:', error);
      
      // Disparar evento de error
      window.dispatchEvent(new CustomEvent('chameleonError', {
        detail: {
          error: error.message,
          timestamp: Date.now()
        }
      }));
    }
  }
  
  // Verificar dependencias críticas
  function checkCriticalDependencies() {
    // Verificar que tengamos acceso a chrome-extension://
    const testUrl = `chrome-extension://${extensionId}/data/profiles.json`;
    return fetch(testUrl, { method: 'HEAD' })
      .then(() => true)
      .catch(() => false);
  }
  
  // Función principal de inicialización
  async function main() {
    try {
      // Verificar dependencias
      const depsOk = await checkCriticalDependencies();
      if (!depsOk) {
        throw new Error('Cannot access extension resources. Extension may be disabled or permissions missing.');
      }
      
      // Cargar todos los módulos
      const modulesLoaded = await loadModulesSequentially();
      if (!modulesLoaded) {
        throw new Error('Failed to load required modules');
      }
      
      // Inicializar Chameleon
      await initializeChameleon();
      
    } catch (error) {
      console.error('[Chameleon Loader] Fatal error:', error);
      
      // Notificar del error
      window.dispatchEvent(new CustomEvent('chameleonError', {
        detail: {
          error: error.message,
          fatal: true,
          timestamp: Date.now()
        }
      }));
    }
  }
  
  // Iniciar carga
  main();
  
})();