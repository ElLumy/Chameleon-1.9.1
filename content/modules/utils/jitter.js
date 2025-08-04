// content/modules/utils/jitter.js
(function() {
    'use strict';
    
    class JitterManager {
        constructor() {
            this.config = {
                canvas: { mean: 4, stdDev: 1.5, min: 1, max: 10 },
                webgl: { mean: 2, stdDev: 0.5, min: 1, max: 5 },
                audio: { mean: 3, stdDev: 0.8, min: 1, max: 8 },
                navigator: { mean: 1, stdDev: 0.2, min: 1, max: 2 },
                default: { mean: 2, stdDev: 0.4, min: 1, max: 5 }
            };
            this.isProduction = !window.location.hostname.includes('localhost');
        }
        
        async applyJitter(fn, category = 'default') {
            const delay = this.generateDelay(category);
            
            if (delay > 0) {
                await this.sleep(delay);
            }
            
            return fn();
        }
        
        generateDelay(category) {
            const config = this.config[category] || this.config.default;
            const delay = this.generateGaussian(config.mean, config.stdDev);
            
            // Clamp to min/max - siempre positivo
            const clampedDelay = Math.max(config.min, Math.min(config.max, delay));
            
            // Log solo en desarrollo
            if (!this.isProduction && clampedDelay > 0) {
                console.debug(`[Jitter] ${category}: ${clampedDelay.toFixed(2)}ms`);
            }
            
            return clampedDelay;
        }
        
        generateGaussian(mean, stdDev) {
            // Box-Muller transform
            const u1 = Math.random();
            const u2 = Math.random();
            
            const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            
            // Asegurar que el resultado sea positivo
            const result = Math.abs(mean + z0 * stdDev);
            
            return result;
        }
        
        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        // Alternative implementation using requestAnimationFrame for more natural timing
        async applyNaturalJitter(fn, category = 'default') {
            const frames = Math.ceil(this.generateDelay(category) / 16.67); // Convert ms to frames
            
            for (let i = 0; i < frames; i++) {
                await this.nextFrame();
            }
            
            return fn();
        }
        
        nextFrame() {
            return new Promise(resolve => requestAnimationFrame(resolve));
        }
    }
    
    // Create singleton instance
    const jitter = new JitterManager();
    
    // Export globally for browser context
    window.JitterManager = JitterManager;
    window.jitter = jitter;
})();