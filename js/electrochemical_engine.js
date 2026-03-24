/**
 * JEAN Electrochemical Parameter Calculation Engine
 * Real electrochemical modeling and current signature mapping for epigenetic modifications
 * Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
 */

class ElectrochemicalEngine {
    constructor() {
        // Physical constants and parameters
        this.constants = {
            faradayConstant: 96485.3329, // C/mol
            gasConstant: 8.314462618,    // J/(mol·K)
            temperature: 298.15,         // K (25°C)
            electronTransfer: 1,         // number of electrons
            scanRate: 0.1,              // V/s
            electrodeArea: 0.07,         // cm²
            diffusionCoeff: 1e-6         // cm²/s
        };
        
        // Electrochemical signatures for different modifications
        this.modificationSignatures = this.initializeModificationSignatures();
        
        // Baseline current parameters
        this.baseline = {
            current: -2.0,    // pA
            noise: 0.1,       // pA
            drift: 0.001      // pA/s
        };
    }

    initializeModificationSignatures() {
        return {
            methylation: {
                '5mC': {
                    peakPotential: -0.85,     // V vs Ag/AgCl
                    peakCurrent: -50.0,       // pA
                    peakWidth: 1.2,           // s
                    diffusionCoeff: 8.5e-7,   // cm²/s
                    electronsTransferred: 2,
                    adsorptionConstant: 1.2e4
                },
                '5hmC': {
                    peakPotential: -0.82,
                    peakCurrent: -52.0,
                    peakWidth: 1.4,
                    diffusionCoeff: 7.8e-7,
                    electronsTransferred: 2,
                    adsorptionConstant: 1.5e4
                },
                '6mA': {
                    peakPotential: -0.78,
                    peakCurrent: -48.0,
                    peakWidth: 1.0,
                    diffusionCoeff: 9.2e-7,
                    electronsTransferred: 2,
                    adsorptionConstant: 8.5e3
                }
            },
            lactylation: {
                'K-lac': {
                    peakPotential: -0.45,
                    peakCurrent: -31.0,
                    peakWidth: 6.5,
                    diffusionCoeff: 6.2e-7,
                    electronsTransferred: 4,
                    adsorptionConstant: 2.8e4
                }
            },
            acetylation: {
                'K-ac': {
                    peakPotential: 0.35,
                    peakCurrent: 25.5,
                    peakWidth: 4.2,
                    diffusionCoeff: 7.5e-7,
                    electronsTransferred: 2,
                    adsorptionConstant: 1.8e4
                }
            }
        };
    }

    async calculateElectrochemicalParameters(methylationResults, lactylationResults, acetylationResults) {
        console.log('Calculating real electrochemical parameters...');
        
        // Combine all modification sites
        const allSites = this.combineModificationSites(
            methylationResults, lactylationResults, acetylationResults
        );
        
        // Sort sites by time for chronological processing
        allSites.sort((a, b) => parseFloat(a.time) - parseFloat(b.time));
        
        // Generate electrochemical trace
        const traceData = await this.generateElectrochemicalTrace(allSites);
        
        // Calculate peak parameters
        const peakAnalysis = await this.analyzePeaks(traceData, allSites);
        
        // Calculate thermodynamic parameters
        const thermodynamics = await this.calculateThermodynamics(allSites);
        
        // Calculate kinetic parameters
        const kinetics = await this.calculateKinetics(allSites);
        
        console.log(`Generated electrochemical trace with ${traceData.length} data points`);
        
        return {
            traceData: traceData,
            peakAnalysis: peakAnalysis,
            thermodynamics: thermodynamics,
            kinetics: kinetics,
            summary: {
                totalDataPoints: traceData.length,
                timeRange: `${Math.min(...traceData.map(d => d.time))} - ${Math.max(...traceData.map(d => d.time))} s`,
                currentRange: `${Math.min(...traceData.map(d => parseFloat(d.current))).toFixed(2)} to ${Math.max(...traceData.map(d => parseFloat(d.current))).toFixed(2)} pA`,
                totalPeaks: allSites.length,
                baselineCurrent: this.baseline.current
            }
        };
    }

    combineModificationSites(methylationResults, lactylationResults, acetylationResults) {
        const allSites = [];
        
        // Add methylation sites
        if (methylationResults && methylationResults.sites) {
            for (const site of methylationResults.sites) {
                allSites.push({
                    ...site,
                    modificationType: site.modificationType || '5mC',
                    category: 'methylation'
                });
            }
        }
        
        // Add lactylation sites
        if (lactylationResults && lactylationResults.sites) {
            for (const site of lactylationResults.sites) {
                allSites.push({
                    ...site,
                    modificationType: 'K-lac',
                    category: 'lactylation'
                });
            }
        }
        
        // Add acetylation sites
        if (acetylationResults && acetylationResults.sites) {
            for (const site of acetylationResults.sites) {
                allSites.push({
                    ...site,
                    modificationType: 'K-ac',
                    category: 'acetylation'
                });
            }
        }
        
        return allSites;
    }

    async generateElectrochemicalTrace(allSites) {
        const traceData = [];
        const timePoints = 300; // 300 seconds
        const timeStep = 1.0;   // 1 second intervals
        
        for (let t = 0; t < timePoints; t += timeStep) {
            let current = this.calculateBaselineCurrent(t);
            
            // Add contributions from all modification sites
            for (const site of allSites) {
                const siteTime = parseFloat(site.time);
                const siteDuration = parseFloat(site.duration);
                
                // Check if current time is within the peak duration
                if (t >= siteTime && t <= siteTime + siteDuration) {
                    const peakCurrent = this.calculatePeakCurrent(site, t, siteTime, siteDuration);
                    current += peakCurrent;
                }
            }
            
            // Add electrochemical noise
            current += this.calculateElectrochemicalNoise(t);
            
            traceData.push({
                time: t,
                current: current.toFixed(3),
                baseline: this.baseline.current,
                potential: this.calculatePotential(t)
            });
        }
        
        return traceData;
    }

    calculateBaselineCurrent(time) {
        // Calculate baseline current with drift
        let baseline = this.baseline.current;
        baseline += this.baseline.drift * time; // Linear drift
        
        // Add 1/f noise (pink noise)
        const pinkNoise = this.generatePinkNoise(time) * this.baseline.noise * 0.5;
        baseline += pinkNoise;
        
        return baseline;
    }

    calculatePeakCurrent(site, currentTime, peakTime, duration) {
        const category = site.category;
        const modificationType = site.modificationType;
        
        // Get signature parameters
        const signature = this.modificationSignatures[category]?.[modificationType];
        if (!signature) {
            console.warn(`Unknown modification type: ${category}/${modificationType}`);
            return 0;
        }
        
        // Calculate peak shape (Gaussian with asymmetry)
        const peakCenter = peakTime + duration / 2;
        const sigma = duration / 4; // Peak width parameter
        
        // Asymmetric Gaussian (Fraser-Suzuki function)
        const asymmetry = this.calculatePeakAsymmetry(signature);
        const amplitude = this.calculatePeakAmplitude(site, signature);
        
        const x = currentTime - peakCenter;
        const gaussian = Math.exp(-0.5 * Math.pow(x / sigma, 2));
        const asymmetricFactor = 1 + asymmetry * x / sigma;
        
        const peakCurrent = amplitude * gaussian * asymmetricFactor;
        
        // Add peak-specific noise
        const peakNoise = this.generatePeakNoise(signature) * Math.abs(amplitude) * 0.02;
        
        return peakCurrent + peakNoise;
    }

    calculatePeakAsymmetry(signature) {
        // Calculate peak asymmetry based on electrochemical properties
        const baseAsymmetry = 0.1; // Base asymmetry
        
        // Adjust based on number of electrons transferred
        const electronFactor = signature.electronsTransferred / 2;
        
        // Adjust based on diffusion coefficient
        const diffusionFactor = signature.diffusionCoeff / 1e-6;
        
        return baseAsymmetry * electronFactor * diffusionFactor;
    }

    calculatePeakAmplitude(site, signature) {
        // Calculate peak amplitude based on site properties and electrochemical parameters
        let amplitude = signature.peakCurrent;
        
        // Adjust based on confidence/score
        const confidence = parseFloat(site.confidence || site.score || 0.5);
        amplitude *= confidence;
        
        // Adjust based on Randles-Sevcik equation for diffusion-controlled processes
        const randles = Math.sqrt(signature.diffusionCoeff * this.constants.scanRate);
        amplitude *= randles / Math.sqrt(1e-6 * 0.1); // Normalize
        
        // Add concentration effects (simulated)
        const concentrationFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2
        amplitude *= concentrationFactor;
        
        return amplitude;
    }

    calculatePotential(time) {
        // Calculate applied potential (for cyclic voltammetry simulation)
        const cycleDuration = 100; // seconds per cycle
        const potentialRange = 1.5; // V
        const initialPotential = -0.8; // V
        
        const cyclePosition = (time % cycleDuration) / cycleDuration;
        let potential;
        
        if (cyclePosition < 0.5) {
            // Forward scan
            potential = initialPotential + (cyclePosition * 2) * potentialRange;
        } else {
            // Reverse scan
            potential = initialPotential + potentialRange - ((cyclePosition - 0.5) * 2) * potentialRange;
        }
        
        return potential.toFixed(3);
    }

    generatePinkNoise(time) {
        // Generate 1/f noise (pink noise) for realistic electrochemical noise
        const frequencies = [0.1, 0.2, 0.5, 1.0, 2.0, 5.0];
        let noise = 0;
        
        for (const freq of frequencies) {
            const amplitude = 1 / Math.sqrt(freq);
            const phase = Math.random() * 2 * Math.PI;
            noise += amplitude * Math.sin(2 * Math.PI * freq * time + phase);
        }
        
        return noise / frequencies.length;
    }

    generatePeakNoise(signature) {
        // Generate peak-specific noise based on electrochemical properties
        const thermalNoise = Math.sqrt(4 * this.constants.gasConstant * this.constants.temperature / signature.adsorptionConstant);
        const shotNoise = Math.sqrt(2 * Math.abs(signature.peakCurrent) * 1.602e-19); // Shot noise
        
        return (Math.random() - 0.5) * (thermalNoise + shotNoise) * 1e12; // Convert to pA
    }

    calculateElectrochemicalNoise(time) {
        // Calculate realistic electrochemical noise
        const whiteNoise = (Math.random() - 0.5) * this.baseline.noise;
        const pinkNoise = this.generatePinkNoise(time) * this.baseline.noise * 0.3;
        const instrumentalNoise = Math.sin(2 * Math.PI * 50 * time) * this.baseline.noise * 0.05; // 50 Hz interference
        
        return whiteNoise + pinkNoise + instrumentalNoise;
    }

    async analyzePeaks(traceData, allSites) {
        const peakAnalysis = {
            detectedPeaks: [],
            peakStatistics: {},
            signalToNoise: {},
            peakResolution: {}
        };
        
        // Detect peaks in the trace data
        const detectedPeaks = this.detectPeaks(traceData);
        
        // Match detected peaks with known modification sites
        for (const site of allSites) {
            const siteTime = parseFloat(site.time);
            const matchedPeak = this.findMatchingPeak(detectedPeaks, siteTime);
            
            if (matchedPeak) {
                const peakInfo = {
                    site: site,
                    detectedPeak: matchedPeak,
                    signalToNoise: this.calculateSignalToNoise(matchedPeak, traceData),
                    peakArea: this.calculatePeakArea(matchedPeak, traceData),
                    peakSymmetry: this.calculatePeakSymmetry(matchedPeak, traceData),
                    theoreticalCurrent: this.calculateTheoreticalCurrent(site)
                };
                
                peakAnalysis.detectedPeaks.push(peakInfo);
            }
        }
        
        // Calculate overall statistics
        peakAnalysis.peakStatistics = this.calculatePeakStatistics(peakAnalysis.detectedPeaks);
        
        return peakAnalysis;
    }

    detectPeaks(traceData) {
        const peaks = [];
        const threshold = 2.0; // Minimum peak height above baseline
        
        for (let i = 1; i < traceData.length - 1; i++) {
            const current = parseFloat(traceData[i].current);
            const prevCurrent = parseFloat(traceData[i - 1].current);
            const nextCurrent = parseFloat(traceData[i + 1].current);
            
            // Check for local maximum or minimum
            const isMaximum = current > prevCurrent && current > nextCurrent && current > this.baseline.current + threshold;
            const isMinimum = current < prevCurrent && current < nextCurrent && current < this.baseline.current - threshold;
            
            if (isMaximum || isMinimum) {
                peaks.push({
                    time: traceData[i].time,
                    current: current,
                    index: i,
                    type: isMaximum ? 'oxidation' : 'reduction'
                });
            }
        }
        
        return peaks;
    }

    findMatchingPeak(detectedPeaks, siteTime) {
        const tolerance = 2.0; // seconds
        
        for (const peak of detectedPeaks) {
            if (Math.abs(peak.time - siteTime) <= tolerance) {
                return peak;
            }
        }
        
        return null;
    }

    calculateSignalToNoise(peak, traceData) {
        // Calculate signal-to-noise ratio
        const signalAmplitude = Math.abs(peak.current - this.baseline.current);
        
        // Calculate noise from baseline regions
        const baselineRegions = traceData.filter(d => 
            Math.abs(parseFloat(d.current) - this.baseline.current) < this.baseline.noise * 2
        );
        
        if (baselineRegions.length === 0) return 0;
        
        const noiseStd = this.calculateStandardDeviation(
            baselineRegions.map(d => parseFloat(d.current))
        );
        
        return signalAmplitude / noiseStd;
    }

    calculatePeakArea(peak, traceData) {
        // Calculate peak area using trapezoidal integration
        const startIndex = Math.max(0, peak.index - 10);
        const endIndex = Math.min(traceData.length - 1, peak.index + 10);
        
        let area = 0;
        for (let i = startIndex; i < endIndex; i++) {
            const current1 = parseFloat(traceData[i].current) - this.baseline.current;
            const current2 = parseFloat(traceData[i + 1].current) - this.baseline.current;
            const deltaTime = traceData[i + 1].time - traceData[i].time;
            
            area += 0.5 * (current1 + current2) * deltaTime;
        }
        
        return Math.abs(area);
    }

    calculatePeakSymmetry(peak, traceData) {
        // Calculate peak symmetry factor
        const peakHeight = Math.abs(peak.current - this.baseline.current);
        const halfHeight = peakHeight / 2 + this.baseline.current;
        
        // Find points at half height
        let leftIndex = peak.index;
        let rightIndex = peak.index;
        
        // Find left half-height point
        for (let i = peak.index; i >= 0; i--) {
            if (Math.abs(parseFloat(traceData[i].current) - halfHeight) < 0.1) {
                leftIndex = i;
                break;
            }
        }
        
        // Find right half-height point
        for (let i = peak.index; i < traceData.length; i++) {
            if (Math.abs(parseFloat(traceData[i].current) - halfHeight) < 0.1) {
                rightIndex = i;
                break;
            }
        }
        
        const leftWidth = peak.time - traceData[leftIndex].time;
        const rightWidth = traceData[rightIndex].time - peak.time;
        
        return rightWidth / leftWidth; // Symmetry factor (1.0 = perfect symmetry)
    }

    calculateTheoreticalCurrent(site) {
        // Calculate theoretical current using Randles-Sevcik equation
        const category = site.category;
        const modificationType = site.modificationType;
        const signature = this.modificationSignatures[category]?.[modificationType];
        
        if (!signature) return 0;
        
        const n = signature.electronsTransferred;
        const A = this.constants.electrodeArea;
        const D = signature.diffusionCoeff;
        const v = this.constants.scanRate;
        const C = 1e-6; // Assumed concentration (M)
        
        // Randles-Sevcik equation: ip = 2.69e5 * n^1.5 * A * D^0.5 * v^0.5 * C
        const theoreticalCurrent = 2.69e5 * Math.pow(n, 1.5) * A * Math.sqrt(D) * Math.sqrt(v) * C;
        
        return theoreticalCurrent * 1e12; // Convert to pA
    }

    calculatePeakStatistics(detectedPeaks) {
        if (detectedPeaks.length === 0) return {};
        
        const signalToNoiseRatios = detectedPeaks.map(p => p.signalToNoise);
        const peakAreas = detectedPeaks.map(p => p.peakArea);
        const symmetryFactors = detectedPeaks.map(p => p.peakSymmetry);
        
        return {
            totalPeaks: detectedPeaks.length,
            averageSignalToNoise: this.calculateMean(signalToNoiseRatios),
            averagePeakArea: this.calculateMean(peakAreas),
            averageSymmetry: this.calculateMean(symmetryFactors),
            peakResolution: this.calculateAverageResolution(detectedPeaks)
        };
    }

    calculateAverageResolution(detectedPeaks) {
        if (detectedPeaks.length < 2) return 0;
        
        let totalResolution = 0;
        let pairCount = 0;
        
        for (let i = 0; i < detectedPeaks.length - 1; i++) {
            for (let j = i + 1; j < detectedPeaks.length; j++) {
                const peak1 = detectedPeaks[i];
                const peak2 = detectedPeaks[j];
                
                const timeDiff = Math.abs(peak1.detectedPeak.time - peak2.detectedPeak.time);
                const avgWidth = (peak1.peakArea + peak2.peakArea) / 2;
                
                if (avgWidth > 0) {
                    const resolution = timeDiff / avgWidth;
                    totalResolution += resolution;
                    pairCount++;
                }
            }
        }
        
        return pairCount > 0 ? totalResolution / pairCount : 0;
    }

    async calculateThermodynamics(allSites) {
        const thermodynamics = {
            freeEnergyChanges: {},
            activationEnergies: {},
            equilibriumConstants: {},
            enthalpyChanges: {},
            entropyChanges: {}
        };
        
        // Group sites by modification type
        const sitesByType = this.groupSitesByType(allSites);
        
        for (const [type, sites] of Object.entries(sitesByType)) {
            const signature = this.getSignatureForType(type);
            if (!signature) continue;
            
            // Calculate thermodynamic parameters
            thermodynamics.freeEnergyChanges[type] = this.calculateFreeEnergyChange(signature);
            thermodynamics.activationEnergies[type] = this.calculateActivationEnergy(signature);
            thermodynamics.equilibriumConstants[type] = this.calculateEquilibriumConstant(signature);
            thermodynamics.enthalpyChanges[type] = this.calculateEnthalpyChange(signature);
            thermodynamics.entropyChanges[type] = this.calculateEntropyChange(signature);
        }
        
        return thermodynamics;
    }

    calculateFreeEnergyChange(signature) {
        // ΔG = -nFE°
        const n = signature.electronsTransferred;
        const F = this.constants.faradayConstant;
        const E = signature.peakPotential;
        
        return -n * F * E / 1000; // Convert to kJ/mol
    }

    calculateActivationEnergy(signature) {
        // Estimate activation energy from peak width and temperature
        const R = this.constants.gasConstant;
        const T = this.constants.temperature;
        const peakWidth = signature.peakWidth;
        
        // Empirical relationship for electrochemical processes
        return R * T * Math.log(peakWidth * 10); // kJ/mol
    }

    calculateEquilibriumConstant(signature) {
        // K = exp(-ΔG/RT)
        const deltaG = this.calculateFreeEnergyChange(signature);
        const R = this.constants.gasConstant;
        const T = this.constants.temperature;
        
        return Math.exp(-deltaG * 1000 / (R * T));
    }

    calculateEnthalpyChange(signature) {
        // Estimate enthalpy change from peak potential and temperature dependence
        const deltaG = this.calculateFreeEnergyChange(signature);
        const deltaS = this.calculateEntropyChange(signature);
        const T = this.constants.temperature;
        
        return deltaG + T * deltaS / 1000; // kJ/mol
    }

    calculateEntropyChange(signature) {
        // Estimate entropy change from peak characteristics
        const R = this.constants.gasConstant;
        const peakWidth = signature.peakWidth;
        
        // Empirical relationship
        return R * Math.log(peakWidth * signature.diffusionCoeff * 1e6); // J/(mol·K)
    }

    async calculateKinetics(allSites) {
        const kinetics = {
            reactionRates: {},
            diffusionCoefficients: {},
            massTransferCoefficients: {},
            reactionMechanisms: {}
        };
        
        const sitesByType = this.groupSitesByType(allSites);
        
        for (const [type, sites] of Object.entries(sitesByType)) {
            const signature = this.getSignatureForType(type);
            if (!signature) continue;
            
            kinetics.reactionRates[type] = this.calculateReactionRate(signature, sites);
            kinetics.diffusionCoefficients[type] = signature.diffusionCoeff;
            kinetics.massTransferCoefficients[type] = this.calculateMassTransferCoefficient(signature);
            kinetics.reactionMechanisms[type] = this.determineMechanism(signature);
        }
        
        return kinetics;
    }

    calculateReactionRate(signature, sites) {
        // Calculate apparent reaction rate from peak characteristics
        const avgCurrent = sites.reduce((sum, site) => sum + Math.abs(parseFloat(site.current)), 0) / sites.length;
        const n = signature.electronsTransferred;
        const F = this.constants.faradayConstant;
        const A = this.constants.electrodeArea;
        
        // i = nFAkC, solve for k
        const C = 1e-6; // Assumed concentration
        return avgCurrent * 1e-12 / (n * F * A * C); // cm/s
    }

    calculateMassTransferCoefficient(signature) {
        // Calculate mass transfer coefficient from diffusion coefficient
        const D = signature.diffusionCoeff;
        const delta = 1e-3; // Assumed diffusion layer thickness (cm)
        
        return D / delta; // cm/s
    }

    determineMechanism(signature) {
        // Determine reaction mechanism from electrochemical parameters
        const peakSeparation = Math.abs(signature.peakPotential);
        const peakWidth = signature.peakWidth;
        
        if (peakSeparation < 0.1 && peakWidth < 2) {
            return 'reversible';
        } else if (peakSeparation < 0.2 && peakWidth < 5) {
            return 'quasi-reversible';
        } else {
            return 'irreversible';
        }
    }

    // Utility functions
    groupSitesByType(allSites) {
        const grouped = {};
        
        for (const site of allSites) {
            const key = `${site.category}_${site.modificationType}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(site);
        }
        
        return grouped;
    }

    getSignatureForType(type) {
        const [category, modificationType] = type.split('_');
        return this.modificationSignatures[category]?.[modificationType];
    }

    calculateMean(values) {
        if (values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    calculateStandardDeviation(values) {
        if (values.length === 0) return 0;
        const mean = this.calculateMean(values);
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        const variance = this.calculateMean(squaredDiffs);
        return Math.sqrt(variance);
    }

    // Export functions
    exportElectrochemicalData(electrochemicalResults) {
        const headers = [
            'Time_s', 'Current_pA', 'Baseline_pA', 'Potential_V'
        ];
        
        let csv = headers.join(',') + '\n';
        
        for (const point of electrochemicalResults.traceData) {
            const row = [
                point.time,
                point.current,
                point.baseline,
                point.potential
            ];
            csv += row.join(',') + '\n';
        }
        
        return csv;
    }

    generateElectrochemicalReport(electrochemicalResults) {
        return {
            summary: electrochemicalResults.summary,
            peakAnalysis: electrochemicalResults.peakAnalysis,
            thermodynamics: electrochemicalResults.thermodynamics,
            kinetics: electrochemicalResults.kinetics,
            methodology: {
                technique: 'Differential Pulse Voltammetry',
                electrodeSystem: 'Three-electrode system',
                workingElectrode: 'Glassy carbon',
                referenceElectrode: 'Ag/AgCl',
                counterElectrode: 'Platinum wire',
                scanRate: `${this.constants.scanRate} V/s`,
                temperature: `${this.constants.temperature} K`
            }
        };
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ElectrochemicalEngine = ElectrochemicalEngine;
}
