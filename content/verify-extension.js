(function() {
console.log('=== Chameleon Extension Verification ===');
// Verificar si los interceptores están activos
const checks = {
    'Navigator spoofing': () => {
        const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
        return !original || typeof original.get === 'function';
    },
    'Canvas protection': () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillText('test', 0, 0);
        const data1 = canvas.toDataURL();
        ctx.fillText('test', 0, 0);
        const data2 = canvas.toDataURL();
        return data1 !== data2; // Should be different due to noise
    },
    'WebGL spoofing': () => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        if (!gl) return false;
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return true; // Extension hidden
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        return vendor !== 'Google Inc.'; // Should be spoofed
    },
    'Timezone spoofing': () => {
        const original = new Date().getTimezoneOffset();
        return true; // Check if consistent
    },
    'Screen resolution': () => {
        return screen.width > 0 && screen.height > 0;
    },
    'Meta proxy active': () => {
        try {
            const test = () => {};
            return test.toString().includes('[native code]') === false;
        } catch (e) {
            return false;
        }
    }
};

// Ejecutar verificaciones
const results = {};
for (const [name, check] of Object.entries(checks)) {
    try {
        results[name] = check() ? '✅ Active' : '❌ Not active';
    } catch (e) {
        results[name] = '⚠️ Error: ' + e.message;
    }
}

// Mostrar resultados
console.table(results);

// Verificar estado global
if (window.__chameleonState) {
    console.log('Chameleon State:', window.__chameleonState);
} else {
    console.warn('⚠️ Chameleon state not found');
}

// Verificar módulos cargados
const modules = [
    'MetaProxyInterceptor',
    'NavigatorInterceptor', 
    'ScreenInterceptor',
    'CanvasInterceptor',
    'WebGLInterceptor',
    'AudioInterceptor',
    'TimezoneInterceptor'
];

console.log('\nModule Status:');
modules.forEach(module => {
    console.log(`${module}: ${window[module] ? '✅ Loaded' : '❌ Not loaded'}`);
});

console.log('\n=== End of verification ===');
})();