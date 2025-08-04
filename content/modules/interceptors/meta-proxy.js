// content/modules/interceptors/meta-proxy.js
(function() {
    'use strict';
    
    class MetaProxyInterceptor {
    constructor() {
        this.interceptedFunctions = new WeakSet();
        this.originalToString = Function.prototype.toString;
        this.originalObjectToString = Object.prototype.toString;
        this.originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
        this.originalError = Error;
    }
    
    apply() {
        console.log('[Chameleon] Applying meta-proxy protection...');
        
        try {
            // Setup registration function
            this.setupRegistration();
            
            // Intercept Function.prototype.toString
            this.interceptFunctionToString();
            
            // Intercept Object.prototype.toString
            this.interceptObjectToString();
            
            // Intercept Error stack traces
            this.interceptErrorStackTraces();
            
            // Intercept property descriptor checks
            this.interceptPropertyDescriptors();
            
            // Protect against proxy detection
            this.protectProxyDetection();
            
            console.log('[Chameleon] Meta-proxy protection applied successfully');
            return true;
        } catch (error) {
            console.error('[Chameleon] Meta-proxy protection failed:', error);
            return false;
        }
    }
    
    setupRegistration() {
        const self = this;
        // Global registration function for intercepted functions
        window.chameleonRegisterIntercepted = (fn) => {
            if (typeof fn === 'function') {
                self.interceptedFunctions.add(fn);
            }
        };
    }
    
    interceptFunctionToString() {
        const self = this;
        
        Function.prototype.toString = new Proxy(this.originalToString, {
            apply(target, thisArg, args) {
                // Check if this function is intercepted
                if (self.interceptedFunctions.has(thisArg)) {
                    // Get function name
                    const fnName = thisArg.name || '';
                    
                    // Return native code string
                    if (fnName) {
                        return `function ${fnName}() { [native code] }`;
                    }
                    return 'function () { [native code] }';
                }
                
                // Fix: Use safe toString check to avoid recursion
                try {
                    // Use Object.prototype.toString to safely check type
                    const safeToString = Object.prototype.toString;
                    if (thisArg && safeToString.call(thisArg) === '[object Function]') {
                        const boundMatch = thisArg.name && thisArg.name.match(/^bound (.+)$/);
                        if (boundMatch) {
                            return `function ${boundMatch[1]}() { [native code] }`;
                        }
                    }
                } catch (e) {
                    // Silently fail and continue
                }
                
                // For non-intercepted functions, return original
                return Reflect.apply(target, thisArg, args);
            }
        });
        
        // Register the toString interceptor itself
        this.interceptedFunctions.add(Function.prototype.toString);
    }
    
    interceptObjectToString() {
        const self = this;
        
        Object.prototype.toString = new Proxy(this.originalObjectToString, {
            apply(target, thisArg, args) {
                // Check for our fake objects
                if (thisArg && thisArg._chameleonFakeObject) {
                    return thisArg._chameleonToStringTag || '[object Object]';
                }
                
                // Check for specific types that might be spoofed
                if (thisArg === navigator.plugins) {
                    return '[object PluginArray]';
                }
                if (thisArg === navigator.mimeTypes) {
                    return '[object MimeTypeArray]';
                }
                
                return Reflect.apply(target, thisArg, args);
            }
        });
        
        this.interceptedFunctions.add(Object.prototype.toString);
    }
    
    interceptErrorStackTraces() {
        const self = this;
        
        // Create safe Error proxy wrapper
        try {
            const OriginalError = this.originalError;
            
            // Create a new Error constructor that wraps the original
            const ErrorProxy = new Proxy(OriginalError, {
                construct(target, args) {
                    // Fix: Use correct spread syntax
                    const error = new target(...args);
                    
                    // Clean stack trace
                    if (error.stack) {
                        error.stack = self.cleanStackTrace(error.stack);
                    }
                    
                    return error;
                },
                
                // Ensure Error properties are accessible
                get(target, prop) {
                    return target[prop];
                },
                
                // Handle static methods
                has(target, prop) {
                    return prop in target;
                }
            });
            
            // Replace global Error with our proxy
            window.Error = ErrorProxy;
            
            // Copy all static properties from original Error
            for (const prop of Object.getOwnPropertyNames(OriginalError)) {
                if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
                    try {
                        const descriptor = Object.getOwnPropertyDescriptor(OriginalError, prop);
                        if (descriptor && descriptor.configurable) {
                            Object.defineProperty(ErrorProxy, prop, descriptor);
                        }
                    } catch (e) {
                        // Some properties may not be configurable
                    }
                }
            }
            
            // Fix: Ensure prototype chain is correctly set without creating cycles
            // Set the prototype of Error.prototype to the original Error.prototype
            if (OriginalError.prototype && ErrorProxy.prototype !== OriginalError.prototype) {
                try {
                    Object.setPrototypeOf(ErrorProxy.prototype, OriginalError.prototype);
                } catch (e) {
                    console.warn('[Chameleon] Could not set Error prototype:', e);
                }
            }
            
        } catch (e) {
            console.warn('[Chameleon] Could not override Error constructor:', e);
        }
        
        // Override captureStackTrace if available
        if (Error.captureStackTrace) {
            const originalCaptureStackTrace = Error.captureStackTrace;
            
            Error.captureStackTrace = function(targetObject, constructorOpt) {
                originalCaptureStackTrace.call(this, targetObject, constructorOpt);
                
                if (targetObject.stack) {
                    targetObject.stack = self.cleanStackTrace(targetObject.stack);
                }
            };
        }
        
        // Intercept stack getter
        try {
            const stackDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
            if (stackDescriptor && stackDescriptor.get) {
                Object.defineProperty(Error.prototype, 'stack', {
                    get: function() {
                        const stack = stackDescriptor.get.call(this);
                        return stack ? self.cleanStackTrace(stack) : stack;
                    },
                    set: stackDescriptor.set,
                    enumerable: stackDescriptor.enumerable,
                    configurable: stackDescriptor.configurable
                });
            }
        } catch (e) {
            console.warn('[Chameleon] Could not intercept Error.prototype.stack:', e);
        }
    }
    
    cleanStackTrace(stack) {
        if (!stack || typeof stack !== 'string') return stack;
        
        // Remove lines containing chameleon references
        const lines = stack.split('\n');
        const cleaned = lines.filter(line => {
            const lowerLine = line.toLowerCase();
            return !lowerLine.includes('chameleon') &&
                   !lowerLine.includes('interceptor') &&
                   !lowerLine.includes('chrome-extension://');
        });
        
        return cleaned.join('\n');
    }
    
    interceptPropertyDescriptors() {
        const self = this;
        
        Object.getOwnPropertyDescriptor = new Proxy(this.originalGetOwnPropertyDescriptor, {
            apply(target, thisArg, args) {
                const [obj, prop] = args;
                const descriptor = Reflect.apply(target, thisArg, args);
                
                // Check if this is a property we've modified
                if (descriptor && descriptor.get && self.interceptedFunctions.has(descriptor.get)) {
                    // Make it look native
                    descriptor.get = new Proxy(descriptor.get, {
                        apply(target, thisArg, args) {
                            return Reflect.apply(target, thisArg, args);
                        },
                        get(target, prop) {
                            if (prop === 'toString') {
                                return function() {
                                    return `function get ${prop}() { [native code] }`;
                                };
                            }
                            return target[prop];
                        }
                    });
                }
                
                return descriptor;
            }
        });
    }
    
    protectProxyDetection() {
        // Override Proxy.prototype if it exists (it shouldn't normally)
        if (window.Proxy && window.Proxy.prototype) {
            delete window.Proxy.prototype;
        }
        
        // Make Proxy constructor look native
        const OriginalProxy = window.Proxy;
        
        window.Proxy = new Proxy(OriginalProxy, {
            construct(target, args) {
                // Fix: Use correct spread syntax
                return new target(...args);
            },
            get(target, prop) {
                if (prop === 'toString') {
                    return function() {
                        return 'function Proxy() { [native code] }';
                    };
                }
                return target[prop];
            }
        });
        
        // Prevent detection via Proxy.toString()
        Object.defineProperty(window.Proxy, 'toString', {
            value: function() {
                return 'function Proxy() { [native code] }';
            },
            writable: false,
            enumerable: false,
            configurable: false
        });
    }
}

// Fix: Safe prototype handling for browser built-ins
try {
    // Store references to original prototypes if needed
    if (typeof PluginArray !== 'undefined' && PluginArray.prototype) {
        window.__chameleonOriginalPluginArrayProto = PluginArray.prototype;
    }
    if (typeof MimeTypeArray !== 'undefined' && MimeTypeArray.prototype) {
        window.__chameleonOriginalMimeTypeArrayProto = MimeTypeArray.prototype;
    }
    if (typeof Plugin !== 'undefined' && Plugin.prototype) {
        window.__chameleonOriginalPluginProto = Plugin.prototype;
    }
    if (typeof MimeType !== 'undefined' && MimeType.prototype) {
        window.__chameleonOriginalMimeTypeProto = MimeType.prototype;
    }
} catch (e) {
    console.warn('[Chameleon] Could not store original prototypes:', e);
}

// Expose to global scope
window.MetaProxyInterceptor = MetaProxyInterceptor;