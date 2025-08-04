// ui/debug.js
(() => {
    'use strict';
    
    // State
    let activeTabId = null;
    
    // Logging
    function log(message, type = 'info') {
        const logsContainer = document.getElementById('logs');
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsContainer.appendChild(entry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
        console.log(`[Debug Page] ${message}`);
    }
    
    // Clear logs
    function clearLogs() {
        document.getElementById('logs').innerHTML = '';
        log('Logs cleared', 'info');
    }
    
    // Check extension status
    async function checkExtensionStatus() {
        try {
            // Check if chrome.runtime is available
            if (!chrome?.runtime?.id) {
                throw new Error('Extension context not available');
            }
            
            const manifest = chrome.runtime.getManifest();
            const statusEl = document.getElementById('extensionStatus');
            statusEl.innerHTML = `
                <span class="status success">Extension Active</span>
                <span>ID: ${chrome.runtime.id}</span>
                <span>Version: ${manifest.version}</span>
            `;
            
            log('Extension is active', 'success');
            
        } catch (error) {
            const statusEl = document.getElementById('extensionStatus');
            statusEl.innerHTML = `<span class="status error">Extension Error: ${error.message}</span>`;
            log(`Extension error: ${error.message}`, 'error');
        }
    }
    
    // Get session info
    async function getSessionInfo() {
        try {
            log('Requesting session info...', 'info');
            
            const response = await chrome.runtime.sendMessage({ action: 'getSessionInfo' });
            
            const sessionEl = document.getElementById('sessionInfo');
            sessionEl.textContent = JSON.stringify(response, null, 2);
            
            if (response.profile) {
                document.getElementById('profileInfo').textContent = JSON.stringify(response.profile, null, 2);
                log('Session info received successfully', 'success');
            } else {
                document.getElementById('profileInfo').textContent = 'No profile found';
                log('No profile found in session', 'warning');
            }
            
        } catch (error) {
            document.getElementById('sessionInfo').textContent = `Error: ${error.message}`;
            log(`Failed to get session info: ${error.message}`, 'error');
        }
    }
    
    // Check storage status
    async function checkStorageStatus() {
        try {
            const sessionData = await chrome.storage.session.get(null);
            const localData = await chrome.storage.local.get(null);
            
            const storageEl = document.getElementById('storageStatus');
            storageEl.textContent = JSON.stringify({
                session: {
                    keys: Object.keys(sessionData),
                    hasSeed: !!sessionData.sessionSeed,
                    hasProfile: !!sessionData.profile,
                    hasProfilesData: !!sessionData.profilesData,
                    timestamp: sessionData.timestamp
                },
                local: {
                    keys: Object.keys(localData)
                }
            }, null, 2);
            
            log('Storage status checked', 'info');
        } catch (error) {
            document.getElementById('storageStatus').textContent = `Error: ${error.message}`;
            log(`Storage check error: ${error.message}`, 'error');
        }
    }
    
    // Get active tabs
    async function getActiveTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            const tabsEl = document.getElementById('activeTabs');
            
            const tabInfo = tabs.map(tab => ({
                id: tab.id,
                title: tab.title,
                url: tab.url,
                active: tab.active
            })).filter(tab => !tab.url.startsWith('chrome://'));
            
            tabsEl.innerHTML = '';
            tabInfo.forEach(tab => {
                const tabDiv = document.createElement('div');
                tabDiv.style.cssText = 'margin-bottom: 10px; padding: 10px; background: #0f172a; border-radius: 4px;';
                tabDiv.innerHTML = `
                    <strong>${tab.active ? '🟢' : '⚪'} Tab ${tab.id}</strong><br>
                    <span style="color: #94a3b8;">${tab.title}</span><br>
                    <span style="font-size: 11px; color: #64748b;">${tab.url}</span>
                `;
                
                // Create test button
                const testBtn = document.createElement('button');
                testBtn.textContent = 'Test';
                testBtn.style.cssText = 'margin-left: 10px; padding: 5px 10px; font-size: 12px;';
                testBtn.addEventListener('click', () => testTabFingerprint(tab.id));
                tabDiv.appendChild(testBtn);
                
                // Create verify button
                const verifyBtn = document.createElement('button');
                verifyBtn.textContent = 'Verify';
                verifyBtn.style.cssText = 'margin-left: 10px; padding: 5px 10px; font-size: 12px;';
                verifyBtn.addEventListener('click', () => runVerifyExtension(tab.id));
                tabDiv.appendChild(verifyBtn);
                
                tabsEl.appendChild(tabDiv);
                
                if (tab.active) activeTabId = tab.id;
            });
            
            log(`Found ${tabInfo.length} non-chrome tabs`, 'info');
        } catch (error) {
            document.getElementById('activeTabs').textContent = `Error: ${error.message}`;
            log(`Failed to get tabs: ${error.message}`, 'error');
        }
    }
    
    // Test fingerprint in specific tab
    async function testTabFingerprint(tabId) {
        try {
            log(`Testing fingerprint in tab ${tabId}...`, 'info');
            
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    const fingerprint = {
                        userAgent: navigator.userAgent,
                        platform: navigator.platform,
                        language: navigator.language,
                        languages: navigator.languages,
                        hardwareConcurrency: navigator.hardwareConcurrency,
                        deviceMemory: navigator.deviceMemory,
                        screenResolution: screen.width + 'x' + screen.height,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        plugins: Array.from(navigator.plugins).map(p => p.name)
                    };
                    
                    // Test canvas
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 200;
                        canvas.height = 50;
                        const ctx = canvas.getContext('2d');
                        ctx.textBaseline = 'alphabetic';
                        ctx.fillStyle = '#f60';
                        ctx.fillRect(125, 1, 62, 20);
                        ctx.fillStyle = '#069';
                        ctx.font = '11pt no-real-font-123';
                        ctx.fillText('Test', 2, 15);
                        fingerprint.canvas = canvas.toDataURL().substring(0, 50) + '...';
                    } catch (e) {
                        fingerprint.canvas = 'Error: ' + e.message;
                    }
                    
                    // Test WebGL
                    try {
                        const canvas = document.createElement('canvas');
                        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                        if (gl) {
                            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                            fingerprint.webgl = {
                                vendor: gl.getParameter(debugInfo ? debugInfo.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
                                renderer: gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
                            };
                        }
                    } catch (e) {
                        fingerprint.webgl = 'Error: ' + e.message;
                    }
                    
                    return fingerprint;
                }
            });
            
            if (results && results[0] && results[0].result) {
                log('Fingerprint test completed', 'success');
                alert('Fingerprint for Tab ' + tabId + ':\n\n' + JSON.stringify(results[0].result, null, 2));
            }
        } catch (error) {
            log(`Fingerprint test error: ${error.message}`, 'error');
            alert('Error testing fingerprint: ' + error.message);
        }
    }
    
    // Run verify-extension.js in specific tab
    async function runVerifyExtension(tabId) {
        try {
            log(`Running verify-extension in tab ${tabId}...`, 'info');
            
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content/verify-extension.js'],
                world: 'MAIN'
            });
            
            log('Verify extension script executed successfully', 'success');
            alert('Check the console in Tab ' + tabId + ' for verification results');
        } catch (error) {
            log(`Verify extension error: ${error.message}`, 'error');
            alert('Error running verification: ' + error.message);
        }
    }
    
    // Refresh all status
    async function refreshStatus() {
        log('Refreshing status...', 'info');
        await checkExtensionStatus();
        await getSessionInfo();
        await checkStorageStatus();
        await getActiveTabs();
    }
    
    // Test fingerprint
    function testFingerprint() {
        chrome.tabs.create({ url: 'https://fingerprint.com/demo/' });
    }
    
    // Regenerate identity
    async function regenerateIdentity() {
        if (confirm('This will regenerate your browser identity and reload all tabs. Continue?')) {
            try {
                log('Regenerating identity...', 'info');
                const response = await chrome.runtime.sendMessage({ action: 'regenerateIdentity' });
                
                if (response.success) {
                    log('Identity regenerated successfully', 'success');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    log(`Failed to regenerate identity: ${response.error}`, 'error');
                }
            } catch (error) {
                log(`Error regenerating identity: ${error.message}`, 'error');
            }
        }
    }
    
    // Clear storage
    async function clearStorage() {
        if (confirm('This will clear all extension storage. Continue?')) {
            try {
                await chrome.storage.session.clear();
                await chrome.storage.local.clear();
                log('Storage cleared successfully', 'success');
                await checkStorageStatus();
            } catch (error) {
                log(`Error clearing storage: ${error.message}`, 'error');
            }
        }
    }
    
    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        log(`Storage changed in ${namespace}: ${Object.keys(changes).join(', ')}`, 'info');
        
        // Auto-refresh storage status
        checkStorageStatus();
    });
    
    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
            log(`Tab ${tabId} loaded: ${tab.url}`, 'info');
            getActiveTabs();
        }
    });
    
    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        log('Debug page loaded', 'info');
        
        // Setup button event listeners
        document.getElementById('refreshBtn').addEventListener('click', refreshStatus);
        document.getElementById('testFingerprintBtn').addEventListener('click', testFingerprint);
        document.getElementById('regenerateBtn').addEventListener('click', regenerateIdentity);
        document.getElementById('clearStorageBtn').addEventListener('click', clearStorage);
        document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
        
        // Add new buttons for verification
        const actionsSection = document.querySelector('.section:nth-child(6)');
        
        const verifyExtensionBtn = document.createElement('button');
        verifyExtensionBtn.id = 'verifyExtensionBtn';
        verifyExtensionBtn.textContent = 'Run Self-Test';
        verifyExtensionBtn.addEventListener('click', () => {
            if (activeTabId) {
                runVerifyExtension(activeTabId);
            } else {
                alert('No active tab found. Please select a tab first.');
            }
        });
        actionsSection.appendChild(verifyExtensionBtn);
        
        // Initial load
        refreshStatus();
        
        // Auto-refresh every 10 seconds
        setInterval(() => {
            checkStorageStatus();
            getActiveTabs();
        }, 10000);
    });
    
})();