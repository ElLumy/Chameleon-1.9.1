// background/service-worker.js

// Estado global del service worker
let sessionData = {
  seed: null,
  profile: null,
  initialized: false,
  sessionStartTime: null,
  profileTimestamp: null
};

// Cache para datos precargados
let cachedProfilesData = null;

// Cache para esperar el perfil
let profileWaiters = [];

// Lock para evitar condiciones de carrera
let initializationLock = false;

// Precargar datos de perfiles al iniciar
async function preloadProfilesData() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/profiles.json'));
    if (response.ok) {
      cachedProfilesData = await response.json();
      console.log('[Chameleon] Profiles data preloaded successfully');
      
      // Guardar en storage para acceso rápido
      await chrome.storage.session.set({ profilesData: cachedProfilesData });
    }
  } catch (error) {
    console.error('[Chameleon] Failed to preload profiles data:', error);
  }
}

// Inicialización cuando se instala la extensión
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Chameleon] Extension installed/updated:', details.reason);
  
  // Precargar datos
  await preloadProfilesData();
  
  if (details.reason === 'install') {
    await initializeSession();
  } else if (details.reason === 'update') {
    await restoreSession();
  }
});

// Inicialización cuando se inicia el navegador
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Chameleon] Browser started');
  await preloadProfilesData();
  await restoreSession();
});

// Inicialización cuando el service worker se activa
self.addEventListener('activate', async (event) => {
  console.log('[Chameleon] Service worker activated');
  event.waitUntil(
    (async () => {
      await preloadProfilesData();
      await restoreSession();
    })()
  );
});

// Restaurar sesión existente o crear nueva con reintentos
async function restoreSession(retries = 3) {
  // Evitar múltiples inicializaciones concurrentes
  if (initializationLock) {
    console.log('[Chameleon] Initialization already in progress');
    return;
  }
  
  initializationLock = true;
  
  try {
    for (let i = 0; i < retries; i++) {
      try {
        // Esperar a que storage esté listo
        await chrome.storage.session.get(null);
        
        const stored = await chrome.storage.session.get(['sessionSeed', 'sessionStartTime', 'profile', 'timestamp', 'profilesData']);
        
        // Restaurar profiles data si está en cache
        if (stored.profilesData && !cachedProfilesData) {
          cachedProfilesData = stored.profilesData;
        }
        
        if (stored.sessionSeed) {
          sessionData.seed = stored.sessionSeed;
          sessionData.sessionStartTime = stored.sessionStartTime;
          sessionData.profile = stored.profile;
          sessionData.profileTimestamp = stored.timestamp;
          sessionData.initialized = true;
          console.log('[Chameleon] Session restored:', sessionData.seed.substring(0, 8) + '...');
          
          // Si tenemos perfil, notificar a los waiters
          if (sessionData.profile) {
            notifyProfileWaiters();
          }
          
          return;
        } else {
          console.log('[Chameleon] No existing session found, creating new one');
          await initializeSession();
          return;
        }
      } catch (error) {
        console.error(`[Chameleon] Error restoring session (attempt ${i + 1}/${retries}):`, error);
        
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
        } else {
          await initializeSession();
        }
      }
    }
  } finally {
    initializationLock = false;
  }
}

// Inicializa una nueva sesión con reintentos
async function initializeSession(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const seed = generateSessionSeed();
      const startTime = Date.now();
      
      await chrome.storage.session.get(null);
      
      // Guardar también los profiles data si los tenemos
      const dataToStore = { 
        sessionSeed: seed,
        sessionStartTime: startTime,
        profile: null,
        timestamp: startTime
      };
      
      if (cachedProfilesData) {
        dataToStore.profilesData = cachedProfilesData;
      }
      
      await chrome.storage.session.set(dataToStore);
      
      sessionData.seed = seed;
      sessionData.sessionStartTime = startTime;
      sessionData.initialized = true;
      sessionData.profile = null;
      sessionData.profileTimestamp = null;
      
      console.log('[Chameleon] New session initialized with seed:', seed.substring(0, 8) + '...');
      
      await clearTargetSiteData();
      return;
      
    } catch (error) {
      console.error(`[Chameleon] Error initializing session (attempt ${i + 1}/${retries}):`, error);
      
      if (i === retries - 1) {
        sessionData.seed = generateSessionSeed();
        sessionData.sessionStartTime = Date.now();
        sessionData.initialized = true;
        console.warn('[Chameleon] Using local session data as fallback');
      } else {
        await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      }
    }
  }
}

// Genera una semilla criptográficamente segura
function generateSessionSeed() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Limpia datos de sitios específicos
async function clearTargetSiteData() {
  const targetDomains = [
    'twitch.tv',
    'youtube.com',
    'facebook.com',
    'meta.com',
    'tiktok.com'
  ];
  
  try {
    // Limpiar cookies
    for (const domain of targetDomains) {
      try {
        const cookies = await chrome.cookies.getAll({ domain: `.${domain}` });
        
        for (const cookie of cookies) {
          const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`;
          await chrome.cookies.remove({
            url: url,
            name: cookie.name
          });
        }
        
        const cookiesNoDot = await chrome.cookies.getAll({ domain: domain });
        for (const cookie of cookiesNoDot) {
          const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
          await chrome.cookies.remove({
            url: url,
            name: cookie.name
          });
        }
      } catch (error) {
        console.warn(`[Chameleon] Error clearing cookies for ${domain}:`, error);
      }
    }
    
    // Limpiar otros datos del navegador
    const origins = targetDomains.flatMap(domain => [
      `https://${domain}`,
      `https://www.${domain}`,
      `http://${domain}`,
      `http://www.${domain}`
    ]);
    
    try {
      await chrome.browsingData.remove({
        origins: origins
      }, {
        cache: true,
        localStorage: true,
        indexedDB: true,
        serviceWorkers: true,
        webSQL: true
      });
      
      console.log('[Chameleon] Cleared browsing data for target sites');
    } catch (error) {
      console.warn('[Chameleon] Error clearing browsing data:', error);
      
      try {
        await chrome.browsingData.removeLocalStorage({});
        await chrome.browsingData.removeIndexedDB({});
      } catch (fallbackError) {
        console.error('[Chameleon] Fallback clearing also failed:', fallbackError);
      }
    }
    
  } catch (error) {
    console.error('[Chameleon] Error clearing site data:', error);
  }
}

// Manejo de mensajes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Chameleon] Received message:', request.action, 'from:', sender.tab?.id || 'extension');
  
  // Manejar mensajes asíncronos
  (async () => {
    try {
      let response = {};
      
      switch (request.action) {
        case 'getSessionSeed':
          response = await handleGetSessionSeed();
          break;
          
        case 'regenerateIdentity':
          response = await handleRegenerateIdentity();
          break;
          
        case 'getSessionInfo':
          response = await getSessionInfo();
          break;
          
        case 'checkVPN':
          response = await checkVPNStatus();
          break;
          
        case 'profileReady':
          response = await handleProfileReady(request.profile);
          break;
          
        case 'getProfilesData':
          response = await handleGetProfilesData();
          break;
          
        default:
          console.warn('[Chameleon] Unknown message action:', request.action);
          response = { error: 'Unknown action' };
      }
      
      console.log('[Chameleon] Sending response:', response);
      sendResponse(response);
    } catch (error) {
      console.error('[Chameleon] Message handler error:', error);
      sendResponse({ error: error.message });
    }
  })();
  
  return true; // Indica respuesta asíncrona
});

// Manejar solicitud de profiles data
async function handleGetProfilesData() {
  if (cachedProfilesData) {
    return { profilesData: cachedProfilesData };
  }
  
  // Intentar cargar si no está en cache
  await preloadProfilesData();
  
  if (cachedProfilesData) {
    return { profilesData: cachedProfilesData };
  }
  
  return { error: 'Profiles data not available' };
}

// Manejar notificación de perfil listo
async function handleProfileReady(profile) {
  try {
    console.log('[Chameleon] Profile ready notification received');
    
    // Actualizar estado local
    sessionData.profile = profile;
    sessionData.profileTimestamp = Date.now();
    
    // Guardar en storage también
    try {
      await chrome.storage.session.set({
        profile: profile,
        timestamp: sessionData.profileTimestamp
      });
    } catch (e) {
      console.warn('[Chameleon] Could not save profile to storage:', e);
    }
    
    // Notificar a los waiters
    notifyProfileWaiters();
    
    // Notificar a todas las extensiones activas (popup, debug page, etc.)
    try {
      const views = chrome.extension.getViews();
      views.forEach(view => {
        if (view !== window && view.postMessage) {
          view.postMessage({ type: 'profileReady', profile: profile }, '*');
        }
      });
    } catch (e) {
      console.warn('[Chameleon] Could not notify extension views:', e);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Chameleon] Error handling profile ready:', error);
    return { error: error.message };
  }
}

// Notificar a los que esperan el perfil
function notifyProfileWaiters() {
  const waiters = profileWaiters;
  profileWaiters = [];
  
  waiters.forEach(waiter => {
    waiter.resolve(sessionData.profile);
  });
}

// Obtener semilla de sesión con reintentos mejorados
async function handleGetSessionSeed() {
  try {
    // Esperar si la inicialización está en progreso
    if (initializationLock) {
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!initializationLock) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }
    
    if (!sessionData.initialized || !sessionData.seed) {
      console.log('[Chameleon] Session not initialized, initializing now');
      await initializeSession();
    }
    
    if (sessionData.seed) {
      return { seed: sessionData.seed };
    }
    
    // Intentar obtener de storage con reintentos
    let retries = 3;
    while (retries > 0) {
      try {
        const stored = await chrome.storage.session.get('sessionSeed');
        if (stored.sessionSeed) {
          sessionData.seed = stored.sessionSeed;
          return { seed: stored.sessionSeed };
        }
      } catch (error) {
        console.warn(`[Chameleon] Storage read failed (${retries} retries left):`, error);
      }
      
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Como último recurso, generar nueva
    console.warn('[Chameleon] No seed found, generating new one');
    await initializeSession();
    return { seed: sessionData.seed };
    
  } catch (error) {
    console.error('[Chameleon] Error getting session seed:', error);
    const newSeed = generateSessionSeed();
    sessionData.seed = newSeed;
    return { seed: newSeed };
  }
}

// Regenera la identidad manualmente con mejor manejo
async function handleRegenerateIdentity() {
  try {
    // Limpiar storage de sesión
    await chrome.storage.session.clear();
    
    // Reinicializar sesión
    sessionData = {
      seed: null,
      profile: null,
      initialized: false,
      sessionStartTime: null,
      profileTimestamp: null
    };
    
    await initializeSession();
    
    // Recargar todas las pestañas después de un breve delay
    setTimeout(async () => {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.reload(tab.id);
        }
      }
    }, 500);
    
    return { success: true, message: 'Identity regenerated successfully' };
  } catch (error) {
    console.error('[Chameleon] Error regenerating identity:', error);
    return { success: false, error: error.message };
  }
}

// Obtiene información de la sesión actual con reintentos y espera de perfil mejorados
async function getSessionInfo() {
  try {
    // Asegurar que estamos inicializados
    if (!sessionData.initialized) {
      console.log('[Chameleon] Session not initialized, restoring/initializing');
      await restoreSession();
    }
    
    // Intentar obtener datos actualizados del storage
    let stored = null;
    let retries = 3;
    
    while (retries > 0) {
      try {
        stored = await chrome.storage.session.get(['sessionSeed', 'profile', 'sessionStartTime', 'timestamp']);
        break;
      } catch (error) {
        console.warn(`[Chameleon] Storage read failed (${retries} retries left):`, error);
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // Actualizar datos locales si es necesario
    if (stored && stored.profile && (!sessionData.profile || stored.timestamp > sessionData.profileTimestamp)) {
      sessionData.profile = stored.profile;
      sessionData.profileTimestamp = stored.timestamp;
    }
    
    const result = { 
      seed: (stored && stored.sessionSeed) || sessionData.seed,
      profile: (stored && stored.profile) || sessionData.profile || null,
      sessionStartTime: (stored && stored.sessionStartTime) || sessionData.sessionStartTime || Date.now(),
      timestamp: (stored && stored.timestamp) || sessionData.profileTimestamp || Date.now()
    };
    
    console.log('[Chameleon] Returning session info:', {
      hasSeed: !!result.seed,
      hasProfile: !!result.profile,
      profileAge: result.timestamp ? Date.now() - result.timestamp : 'N/A'
    });
    
    return result;
  } catch (error) {
    console.error('[Chameleon] Error getting session info:', error);
    return { 
      error: error.message,
      seed: sessionData.seed,
      profile: sessionData.profile
    };
  }
}

// Verifica el estado de VPN
async function checkVPNStatus() {
  try {
    const response = await fetch('https://ipapi.co/json/', {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch IP info');
    }
    
    const data = await response.json();
    
    // Detectar indicadores de VPN
    const vpnIndicators = [
      data.org?.toLowerCase().includes('vpn'),
      data.org?.toLowerCase().includes('proxy'),
      data.org?.toLowerCase().includes('hosting'),
      data.org?.toLowerCase().includes('cloud'),
      data.org?.toLowerCase().includes('datacenter')
    ];
    
    const isVPN = vpnIndicators.some(indicator => indicator === true);
    
    return {
      ip: data.ip,
      country: data.country_name,
      countryCode: data.country,
      city: data.city,
      region: data.region,
      timezone: data.timezone,
      org: data.org,
      isVPN,
      asn: data.asn,
      latitude: data.latitude,
      longitude: data.longitude
    };
  } catch (error) {
    console.error('[Chameleon] Error checking VPN status:', error);
    return { error: 'Failed to check VPN status' };
  }
}

// Listener para cuando se conecta una nueva pestaña
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
    try {
      // Asegurar que la sesión esté inicializada
      if (!sessionData.initialized) {
        await restoreSession();
      }
    } catch (error) {
      console.error('[Chameleon] Error on tab update:', error);
    }
  }
});

// Inicializar al cargar el service worker
(async () => {
  try {
    console.log('[Chameleon] Service worker starting...');
    await preloadProfilesData();
    await restoreSession();
  } catch (error) {
    console.error('[Chameleon] Error during startup:', error);
  }
})();