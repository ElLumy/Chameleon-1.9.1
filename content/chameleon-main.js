// content/chameleon-main.js
(function() {
  // Verificar que no se ejecute múltiples veces
  if (window.__chameleonMainInitialized) {
    console.warn('[Chameleon Main] Already initialized');
    return;
  }
  window.__chameleonMainInitialized = true;
  console.log('[Chameleon Main] Starting initialization...');
  
  // Estado global
  const ChameleonState = {
    seed: null,
    profile: null,
    initialized: false,
    interceptedFunctions: new WeakSet(),
    platform: null,
    profilesData: null,
    modules: {}
  };
  
  // Hacer el estado accesible globalmente para los módulos
  window.__ChameleonState = ChameleonState;
  
  // Función de registro global para funciones interceptadas
  window.chameleonRegisterIntercepted = function(fn) {
    if (typeof fn === 'function') {
      ChameleonState.interceptedFunctions.add(fn);
    }
  };
  
  // Generador de perfiles
  function ProfileGenerator(profilesData, seed) {
    const rng = new Math.seedrandom(seed);
    
    function selectWeighted(items) {
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
      let random = rng() * totalWeight;
      
      for (const item of items) {
        random -= item.weight;
        if (random <= 0) return item;
      }
      
      return items[items.length - 1];
    }
    
    function selectFromArray(array) {
      return array[Math.floor(rng() * array.length)];
    }
    
    function generate() {
      const archetype = selectWeighted(profilesData.deviceArchetypes);
      
      const cpu = selectWeighted(
        archetype.hardware.cpu.cores.map((c, i) => ({
          value: c,
          weight: archetype.hardware.cpu.weights[i]
        }))
      ).value;
      
      const memory = selectFromArray(archetype.hardware.memory);
      const gpu = selectFromArray(archetype.hardware.gpuVendors);
      const gpuModel = selectFromArray(gpu.models);
      const resolution = selectWeighted(archetype.display.resolutions);
      
      const language = selectWeighted(
        archetype.languages.primary.map((l, i) => ({
          value: l,
          weight: archetype.languages.weights[i]
        }))
      ).value;
      
      const regions = Object.entries(profilesData.timezoneRegions);
      const region = selectWeighted(
        regions.map(([name, zones]) => ({
          value: { name, zones },
          weight: zones.reduce((sum, z) => sum + z.weight, 0)
        }))
      );
      
      const timezoneData = selectWeighted(region.value.zones);
      const chromeVersion = selectWeighted(profilesData.chromeVersions);
      
      let userAgent = archetype.userAgentTemplate.replace('{chromeVersion}', chromeVersion.version);
      
      if (archetype.platform === 'Linux armv8l') {
        const deviceModel = selectFromArray(profilesData.androidDeviceModels);
        userAgent = userAgent
          .replace('{androidVersion}', archetype.os.version)
          .replace('{deviceModel}', deviceModel);
      }
      
      const plugins = [];
      if (archetype.platform !== 'Linux armv8l') {
        plugins.push({
          name: 'PDF Viewer',
          description: 'Portable Document Format',
          filename: 'internal-pdf-viewer',
          mimeTypes: [{
            type: 'application/pdf',
            suffixes: 'pdf',
            description: 'Portable Document Format'
          }]
        });
        
        // Evitar duplicados de plugins PDF
        if (rng() > 0.5) {
          plugins.push({
            name: 'Chrome PDF Viewer',
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            mimeTypes: [{
              type: 'application/pdf',
              suffixes: 'pdf',
              description: 'Portable Document Format'
            }]
          });
        }
      }
      
      const webglExtensions = [
        'EXT_blend_minmax',
        'EXT_color_buffer_half_float',
        'EXT_float_blend',
        'EXT_frag_depth',
        'EXT_texture_compression_bptc',
        'EXT_texture_filter_anisotropic',
        'WEBGL_compressed_texture_s3tc',
        'WEBGL_compressed_texture_s3tc_srgb',
        'WEBGL_debug_renderer_info',
        'WEBGL_depth_texture',
        'WEBGL_lose_context'
      ];
      
      if (gpu.vendor === 'NVIDIA') {
        webglExtensions.push('NV_shader_noperspective_interpolation');
      }
      
      const fontKey = archetype.os.name.toLowerCase();
      const allFonts = archetype.fonts?.[fontKey] || archetype.fonts?.windows || [];
      const basicFonts = ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana'];
      const selectedFonts = new Set(basicFonts);
      
      const additionalCount = Math.floor(rng() * 15) + 20;
      const availableFonts = allFonts.filter(f => !basicFonts.includes(f));
      
      for (let i = 0; i < additionalCount && availableFonts.length > 0; i++) {
        const index = Math.floor(rng() * availableFonts.length);
        selectedFonts.add(availableFonts.splice(index, 1)[0]);
      }
      
      return {
        seed: seed,
        archetype: archetype.id,
        summary: `${archetype.name} - ${resolution.width}x${resolution.height} - ${timezoneData.timezone}`,
        navigator: {
          userAgent: userAgent,
          platform: archetype.platform,
          language: language,
          languages: [language, language.split('-')[0], 'en-US', 'en'].filter((v, i, a) => a.indexOf(v) === i),
          hardwareConcurrency: cpu,
          deviceMemory: memory,
          maxTouchPoints: archetype.display.touchPoints,
          vendor: 'Google Inc.',
          vendorSub: '',
          productSub: '20030107',
          cookieEnabled: true,
          onLine: true,
          webdriver: false,
          pdfViewerEnabled: true,
          plugins: plugins,
          doNotTrack: null
        },
        screen: {
          width: resolution.width,
          height: resolution.height,
          availWidth: resolution.width,
          availHeight: resolution.height - 40,
          colorDepth: archetype.display.colorDepth,
          pixelDepth: archetype.display.pixelDepth,
          orientation: {
            angle: 0,
            type: resolution.width > resolution.height ? 'landscape-primary' : 'portrait-primary'
          }
        },
        webgl: {
          vendor: gpu.vendor,
          renderer: gpu.renderer.replace('{model}', gpuModel),
          version: 'WebGL 2.0',
          shadingLanguageVersion: 'WebGL GLSL ES 3.00',
          extensions: webglExtensions.sort(() => rng() - 0.5)
        },
        canvas: {
          noise: rng() * 0.0001 + 0.00005,
          offsetX: Math.floor(rng() * 3) - 1,
          offsetY: Math.floor(rng() * 3) - 1
        },
        audio: {
          sampleRate: 48000,
          channelCount: 2,
          noise: rng() * 0.00002 + 0.00001
        },
        timezone: {
          name: timezoneData.timezone,
          offset: getTimezoneOffset(timezoneData.timezone),
          locale: language
        },
        fonts: Array.from(selectedFonts).sort(),
        battery: {
          charging: rng() > 0.3,
          level: Math.round((0.2 + rng() * 0.8) * 100) / 100,
          chargingTime: rng() > 0.3 ? Math.floor(rng() * 3600) : Infinity,
          dischargingTime: Math.floor(rng() * 10800 + 3600)
        }
      };
    }
    
    function getTimezoneOffset(timezone) {
      const offsets = {
        'America/New_York': 300,
        'America/Chicago': 360,
        'America/Los_Angeles': 480,
        'America/Toronto': 300,
        'America/Mexico_City': 360,
        'Europe/London': 0,
        'Europe/Paris': -60,
        'Europe/Berlin': -60,
        'Europe/Madrid': -60,
        'Europe/Rome': -60
      };
      
      return offsets[timezone] || 0;
    }
    
    return { generate };
  }
  
  // Detectar plataforma
  function detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('twitch.tv')) return 'twitch';
    if (hostname.includes('youtube.com')) return 'youtube';
    if (hostname.includes('facebook.com') || hostname.includes('meta.com')) return 'meta';
    if (hostname.includes('tiktok.com')) return 'tiktok';
    if (hostname.includes('fingerprint.com')) return 'fingerprint';
    
    return 'other';
  }
  
  // Función para enviar mensaje al contexto aislado
  function sendToIsolated(action, data) {
    return new Promise((resolve) => {
      const messageId = Date.now() + '_' + Math.random();
      
      // Listener para la respuesta
      const listener = (event) => {
        if (event.data && event.data.source === 'chameleon-isolated' && event.data.id === messageId) {
          window.removeEventListener('message', listener);
          resolve(event.data.data);
        }
      };
      
      window.addEventListener('message', listener);
      
      // Enviar mensaje
      window.postMessage({
        source: 'chameleon-main',
        id: messageId,
        action: action,
        data: data
      }, '*');
      
      // Timeout después de 5 segundos
      setTimeout(() => {
        window.removeEventListener('message', listener);
        resolve({ error: 'Timeout' });
      }, 5000);
    });
  }
  
  // Aplicar módulo con manejo de errores robusto
  function applyModule(moduleName, moduleClass, constructorArgs = []) {
    try {
      console.log(`[Chameleon Main] Applying ${moduleName} interceptor...`);
      
      const module = new moduleClass(...constructorArgs);
      const result = module.apply();
      
      if (result === false) {
        console.warn(`[Chameleon Main] ${moduleName} interceptor returned false`);
        return null;
      }
      
      console.log(`[Chameleon Main] Applied ${moduleName} interceptor successfully`);
      return module;
      
    } catch (error) {
      console.error(`[Chameleon Main] Failed to apply ${moduleName} interceptor:`, error);
      return null;
    }
  }
  
  // Guardar perfil lo antes posible
  async function saveProfileEarly(profile) {
    try {
      console.log('[Chameleon Main] Saving profile early...');
      
      const profileData = {
        seed: profile.seed,
        summary: profile.summary,
        archetype: profile.archetype,
        navigator: {
          userAgent: profile.navigator.userAgent,
          language: profile.navigator.language,
          hardwareConcurrency: profile.navigator.hardwareConcurrency,
          deviceMemory: profile.navigator.deviceMemory,
          platform: profile.navigator.platform
        },
        screen: {
          width: profile.screen.width,
          height: profile.screen.height
        },
        timezone: profile.timezone,
        webgl: {
          vendor: profile.webgl.vendor,
          renderer: profile.webgl.renderer
        }
      };
      
      await sendToIsolated('saveProfile', { profile: profileData });
      console.log('[Chameleon Main] Profile saved early');
    } catch (error) {
      console.error('[Chameleon Main] Failed to save profile early:', error);
    }
  }
  
  // Inicialización principal
  async function initialize() {
    try {
      console.log('[Chameleon Main] Checking for initial data...');
      
      // Verificar que los datos iniciales estén disponibles
      if (!window.__chameleonInitData) {
        console.error('[Chameleon Main] No initial data found');
        // Esperar un poco y reintentar
        await new Promise(resolve => setTimeout(resolve, 100));
        if (!window.__chameleonInitData) {
          throw new Error('Initial data not available after wait');
        }
      }
      
      const { profilesData, sessionSeed } = window.__chameleonInitData;
      
      console.log('[Chameleon Main] Using injected profiles data');
      ChameleonState.profilesData = profilesData;
      
      console.log('[Chameleon Main] Using session seed:', sessionSeed.substring(0, 8) + '...');
      ChameleonState.seed = sessionSeed;
      
      console.log('[Chameleon Main] Generating profile...');
      const generator = ProfileGenerator(ChameleonState.profilesData, ChameleonState.seed);
      ChameleonState.profile = generator.generate();
      console.log('[Chameleon Main] Generated profile:', ChameleonState.profile.summary);
      
      // GUARDAR PERFIL INMEDIATAMENTE
      await saveProfileEarly(ChameleonState.profile);
      
      ChameleonState.platform = detectPlatform();
      console.log('[Chameleon Main] Detected platform:', ChameleonState.platform);
      
      // Aplicar interceptores usando los módulos con manejo de errores robusto
      console.log('[Chameleon Main] Applying interceptors...');
      
      // Meta Proxy debe ser primero y es crítico
      if (window.MetaProxyInterceptor) {
        const metaProxy = applyModule('MetaProxy', window.MetaProxyInterceptor);
        if (metaProxy) {
          ChameleonState.modules.metaProxy = metaProxy;
        } else {
          console.warn('[Chameleon Main] MetaProxy failed but continuing...');
        }
      }
      
      // Navigator
      if (window.NavigatorInterceptor) {
        const navigator = applyModule('Navigator', window.NavigatorInterceptor, [ChameleonState.profile, ChameleonState]);
        if (navigator) ChameleonState.modules.navigator = navigator;
      }
      
      // Screen
      if (window.ScreenInterceptor) {
        const screen = applyModule('Screen', window.ScreenInterceptor, [ChameleonState.profile, ChameleonState]);
        if (screen) ChameleonState.modules.screen = screen;
      }
      
      // Canvas
      if (window.CanvasInterceptor) {
        const canvas = applyModule('Canvas', window.CanvasInterceptor, [ChameleonState.profile, ChameleonState]);
        if (canvas) ChameleonState.modules.canvas = canvas;
      }
      
      // WebGL
      if (window.WebGLInterceptor) {
        const webgl = applyModule('WebGL', window.WebGLInterceptor, [ChameleonState.profile, ChameleonState]);
        if (webgl) ChameleonState.modules.webgl = webgl;
      }
      
      // Audio
      if (window.AudioInterceptor) {
        const audio = applyModule('Audio', window.AudioInterceptor, [ChameleonState.profile, ChameleonState]);
        if (audio) ChameleonState.modules.audio = audio;
      }
      
      // Timezone
      if (window.TimezoneInterceptor) {
        const timezone = applyModule('Timezone', window.TimezoneInterceptor, [ChameleonState.profile, ChameleonState]);
        if (timezone) ChameleonState.modules.timezone = timezone;
      }
      
      ChameleonState.initialized = true;
      console.log('[Chameleon Main] All interceptors processed successfully!');
      
      // Contar módulos aplicados exitosamente
      const appliedModules = Object.keys(ChameleonState.modules).length;
      console.log(`[Chameleon Main] Applied ${appliedModules} modules successfully`);
      
      // Exponer estado para debugging
      window.__chameleonState = ChameleonState;
      
      // Limpiar datos iniciales
      delete window.__chameleonInitData;
      
      console.log('[Chameleon Main] Initialization complete!');
      
      // Notificar que la inicialización está completa
      window.dispatchEvent(new CustomEvent('chameleonReady', { 
        detail: { 
          initialized: true,
          platform: ChameleonState.platform,
          profile: ChameleonState.profile.summary,
          modulesApplied: appliedModules
        }
      }));
      
    } catch (error) {
      console.error('[Chameleon Main] Initialization failed:', error);
      
      // Notificar del error
      window.dispatchEvent(new CustomEvent('chameleonError', { 
        detail: { 
          error: error.message
        }
      }));
    }
  }
  
  // Esperar a que los módulos estén cargados
  function waitForModules() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50;
      
      const check = () => {
        attempts++;
        
        // Verificar que los módulos principales estén cargados
        const modulesReady = window.Math.seedrandom && 
                           window.MetaProxyInterceptor && 
                           window.NavigatorInterceptor &&
                           window.ScreenInterceptor;
        
        if (modulesReady) {
          console.log('[Chameleon Main] All modules loaded');
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 100);
        } else {
          console.warn('[Chameleon Main] Timeout waiting for modules, proceeding anyway');
          resolve();
        }
      };
      
      check();
    });
  }
  
  // Iniciar cuando esté listo
  console.log('[Chameleon Main] Waiting for modules...');
  waitForModules().then(initialize);
})();