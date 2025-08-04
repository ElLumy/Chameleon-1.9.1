// ui/consistency-checker.js
class ConsistencyChecker {
    constructor() {
        this.rules = [
            {
                id: 'timezone',
                name: 'Timezone Match',
                check: async (profile, vpnInfo) => {
                    if (!profile.timezone?.name || !vpnInfo?.timezone) {
                        return { 
                            status: 'error', 
                            score: 0, 
                            message: 'Missing data' 
                        };
                    }
                    
                    if (profile.timezone.name === vpnInfo.timezone) {
                        return { 
                            status: 'success', 
                            score: 25, 
                            message: 'Perfect match' 
                        };
                    }
                    
                    // Check if same country
                    const profileCountry = profile.timezone.name.split('/')[0];
                    const vpnCountry = vpnInfo.timezone.split('/')[0];
                    
                    if (profileCountry === vpnCountry) {
                        return { 
                            status: 'warning', 
                            score: 15, 
                            message: `Same region (${vpnInfo.timezone})` 
                        };
                    }
                    
                    return { 
                        status: 'error', 
                        score: 0, 
                        message: `Mismatch: ${vpnInfo.timezone}` 
                    };
                }
            },
            {
                id: 'language',
                name: 'Language Coherence',
                check: async (profile, vpnInfo) => {
                    const lang = profile.navigator?.language;
                    if (!lang) {
                        return { 
                            status: 'error', 
                            score: 0, 
                            message: 'No language data' 
                        };
                    }
                    
                    const langCode = lang.split('-')[0];
                    const expectedLangs = this.getExpectedLanguages(vpnInfo?.countryCode || '');
                    
                    if (expectedLangs.length === 0 || expectedLangs.includes(langCode)) {
                        return { 
                            status: 'success', 
                            score: 25, 
                            message: lang 
                        };
                    }
                    
                    return { 
                        status: 'warning', 
                        score: 10, 
                        message: `${lang} (unusual for ${vpnInfo?.country || 'location'})` 
                    };
                }
            },
            {
                id: 'webgl',
                name: 'WebGL Consistency',
                check: async (profile) => {
                    if (!profile.webgl) {
                        return { 
                            status: 'error', 
                            score: 0, 
                            message: 'No WebGL data' 
                        };
                    }
                    
                    const platform = profile.navigator?.platform?.toLowerCase() || '';
                    const renderer = profile.webgl.renderer?.toLowerCase() || '';
                    
                    // Platform-specific checks
                    if (platform.includes('win') && renderer.includes('apple')) {
                        return { 
                            status: 'error', 
                            score: 0, 
                            message: 'Apple GPU on Windows!' 
                        };
                    }
                    
                    if (platform.includes('mac') && renderer.includes('direct3d')) {
                        return { 
                            status: 'error', 
                            score: 0, 
                            message: 'DirectX on Mac!' 
                        };
                    }
                    
                    return { 
                        status: 'success', 
                        score: 25, 
                        message: 'Consistent' 
                    };
                }
            },
            {
                id: 'vpn',
                name: 'VPN Detection',
                check: async (profile, vpnInfo) => {
                    if (!vpnInfo) {
                        return { 
                            status: 'error', 
                            score: 0, 
                            message: 'Check failed' 
                        };
                    }
                    
                    if (vpnInfo.error) {
                        return { 
                            status: 'error', 
                            score: 0, 
                            message: 'Detection error' 
                        };
                    }
                    
                    if (vpnInfo.isVPN) {
                        return { 
                            status: 'warning', 
                            score: 15, 
                            message: `VPN: ${vpnInfo.org || 'Unknown'}` 
                        };
                    }
                    
                    if (vpnInfo.isDatacenter) {
                        return { 
                            status: 'warning', 
                            score: 10, 
                            message: `Datacenter: ${vpnInfo.org || 'Unknown'}` 
                        };
                    }
                    
                    if (vpnInfo.isResidential || !vpnInfo.isProxy) {
                        return { 
                            status: 'success', 
                            score: 25, 
                            message: 'Residential IP' 
                        };
                    }
                    
                    return { 
                        status: 'warning', 
                        score: 20, 
                        message: vpnInfo.type || 'Unknown' 
                    };
                }
            },
            {
                id: 'hardware',
                name: 'Hardware Plausibility',
                check: async (profile) => {
                    const cores = profile.navigator?.hardwareConcurrency;
                    const memory = profile.navigator?.deviceMemory;
                    const platform = profile.navigator?.platform?.toLowerCase() || '';
                    
                    if (!cores || !memory) {
                        return { 
                            status: 'warning', 
                            score: 20, 
                            message: 'Limited data' 
                        };
                    }
                    
                    // Mobile checks
                    if (platform.includes('android') || platform.includes('iphone')) {
                        if (cores > 8 || memory > 8) {
                            return { 
                                status: 'warning', 
                                score: 15, 
                                message: 'High specs for mobile' 
                            };
                        }
                    }
                    
                    // Desktop checks
                    if (platform.includes('win') || platform.includes('mac') || platform.includes('linux')) {
                        if (cores < 2 || memory < 4) {
                            return { 
                                status: 'warning', 
                                score: 15, 
                                message: 'Low specs for desktop' 
                            };
                        }
                    }
                    
                    return { 
                        status: 'success', 
                        score: 20, 
                        message: `${cores} cores, ${memory}GB` 
                    };
                }
            },
            {
                id: 'fonts',
                name: 'Font Consistency',
                check: async (profile) => {
                    const fonts = profile.fonts?.available || [];
                    const platform = profile.navigator?.platform?.toLowerCase() || '';
                    
                    if (fonts.length === 0) {
                        return { 
                            status: 'error', 
                            score: 0, 
                            message: 'No fonts data' 
                        };
                    }
                    
                    // Platform-specific font checks
                    const requiredFonts = {
                        'win': ['Arial', 'Calibri', 'Segoe UI'],
                        'mac': ['Helvetica', 'San Francisco', 'Helvetica Neue'],
                        'linux': ['DejaVu Sans', 'Liberation Sans']
                    };
                    
                    for (const [plat, required] of Object.entries(requiredFonts)) {
                        if (platform.includes(plat)) {
                            const hasRequired = required.some(font => 
                                fonts.some(f => f.toLowerCase().includes(font.toLowerCase()))
                            );
                            
                            if (!hasRequired) {
                                return { 
                                    status: 'warning', 
                                    score: 10, 
                                    message: 'Missing system fonts' 
                                };
                            }
                        }
                    }
                    
                    return { 
                        status: 'success', 
                        score: 15, 
                        message: `${fonts.length} fonts` 
                    };
                }
            }
        ];
    }
    
    async checkProfile(profile) {
        const results = {
            checks: {},
            totalScore: 0,
            maxScore: 0
        };
        
        // Get VPN info first
        let vpnInfo = null;
        try {
            vpnInfo = await chrome.runtime.sendMessage({ action: 'checkVPN' });
        } catch (error) {
            console.error('[ConsistencyChecker] VPN check error:', error);
        }
        
        // Run all checks
        for (const rule of this.rules) {
            try {
                const result = await rule.check(profile, vpnInfo);
                results.checks[rule.id] = {
                    name: rule.name,
                    ...result
                };
                results.totalScore += result.score;
                results.maxScore += rule.id === 'fonts' ? 15 : 25; // Fonts max is 15
            } catch (error) {
                console.error(`[ConsistencyChecker] Check ${rule.id} failed:`, error);
                results.checks[rule.id] = {
                    name: rule.name,
                    status: 'error',
                    score: 0,
                    message: 'Check failed'
                };
            }
        }
        
        // Calculate percentage
        results.percentage = Math.round((results.totalScore / results.maxScore) * 100);
        
        return results;
    }
    
    getExpectedLanguages(countryCode) {
        const countryLanguages = {
            'US': ['en'],
            'GB': ['en'],
            'CA': ['en', 'fr'],
            'AU': ['en'],
            'DE': ['de'],
            'FR': ['fr'],
            'ES': ['es'],
            'IT': ['it'],
            'BR': ['pt'],
            'MX': ['es'],
            'JP': ['ja'],
            'CN': ['zh'],
            'KR': ['ko'],
            'RU': ['ru'],
            'IN': ['hi', 'en']
        };
        
        return countryLanguages[countryCode] || [];
    }
}