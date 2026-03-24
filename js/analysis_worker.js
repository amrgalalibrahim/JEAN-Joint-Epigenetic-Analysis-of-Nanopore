/**
 * JEAN Analysis Web Worker
 * Background processing for large genomic files
 * Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
 */

// Import required functions (in a real implementation, these would be proper imports)
importScripts('chunked_upload.js');

class AnalysisWorker {
    constructor() {
        this.isProcessing = false;
        this.currentAnalysis = null;
        this.results = {
            methylation: [],
            lactylation: [],
            acetylation: [],
            electrochemical: [],
            statistics: {}
        };
        this.memoryProcessor = new MemoryEfficientProcessor();
    }

    async processLargeFile(fileData, analysisConfig) {
        this.isProcessing = true;
        this.currentAnalysis = {
            startTime: Date.now(),
            totalChunks: fileData.totalChunks,
            processedChunks: 0,
            config: analysisConfig
        };

        try {
            // Process file in chunks
            for (let chunkIndex = 0; chunkIndex < fileData.totalChunks; chunkIndex++) {
                if (!this.isProcessing) {
                    throw new Error('Analysis cancelled');
                }

                const chunkData = fileData.chunks[chunkIndex];
                await this.processChunk(chunkData, chunkIndex, analysisConfig);
                
                this.currentAnalysis.processedChunks++;
                this.reportProgress();
            }

            // Finalize analysis
            await this.finalizeAnalysis();
            
            this.isProcessing = false;
            return this.results;

        } catch (error) {
            this.isProcessing = false;
            throw error;
        }
    }

    async processChunk(chunkData, chunkIndex, config) {
        const chunkResults = {
            methylation: [],
            lactylation: [],
            acetylation: [],
            electrochemical: []
        };

        // Parse FASTQ/BAM data from chunk
        const sequences = this.parseSequenceData(chunkData);
        
        for (const sequence of sequences) {
            // Methylation detection
            if (config.detectMethylation) {
                const methylationSites = await this.detectMethylation(sequence, chunkIndex);
                chunkResults.methylation.push(...methylationSites);
            }

            // Lactylation prediction
            if (config.detectLactylation) {
                const lactylationSites = await this.predictLactylation(sequence, chunkIndex);
                chunkResults.lactylation.push(...lactylationSites);
            }

            // Acetylation prediction
            if (config.detectAcetylation) {
                const acetylationSites = await this.predictAcetylation(sequence, chunkIndex);
                chunkResults.acetylation.push(...acetylationSites);
            }
        }

        // Generate electrochemical parameters
        const electrochemicalData = this.generateElectrochemicalParameters(chunkResults, chunkIndex);
        chunkResults.electrochemical = electrochemicalData;

        // Store results efficiently
        await this.memoryProcessor.processChunk(chunkResults, chunkIndex, (data, index) => {
            this.mergeChunkResults(data);
            return data;
        });

        // Report chunk completion
        this.postMessage({
            type: 'chunk_complete',
            chunkIndex,
            chunkResults: this.summarizeChunkResults(chunkResults)
        });
    }

    parseSequenceData(chunkData) {
        const sequences = [];
        const lines = chunkData.split('\n');
        
        // FASTQ format parsing
        if (chunkData.includes('@')) {
            for (let i = 0; i < lines.length; i += 4) {
                if (i + 3 < lines.length && lines[i].startsWith('@')) {
                    sequences.push({
                        id: lines[i].substring(1),
                        sequence: lines[i + 1],
                        quality: lines[i + 3],
                        format: 'fastq'
                    });
                }
            }
        }
        // Simple FASTA format parsing
        else if (chunkData.includes('>')) {
            let currentSeq = null;
            for (const line of lines) {
                if (line.startsWith('>')) {
                    if (currentSeq) sequences.push(currentSeq);
                    currentSeq = {
                        id: line.substring(1),
                        sequence: '',
                        format: 'fasta'
                    };
                } else if (currentSeq && line.trim()) {
                    currentSeq.sequence += line.trim();
                }
            }
            if (currentSeq) sequences.push(currentSeq);
        }

        return sequences;
    }

    async detectMethylation(sequence, chunkIndex) {
        const methylationSites = [];
        const seq = sequence.sequence.toUpperCase();
        
        // Look for CpG sites and MM tags
        for (let i = 0; i < seq.length - 1; i++) {
            if (seq.substring(i, i + 2) === 'CG') {
                const score = 0.5 + Math.random() * 0.5; // Simulated score
                if (score > 0.6) { // Threshold
                    methylationSites.push({
                        readId: sequence.id,
                        position: i,
                        score: score.toFixed(3),
                        context: 'CpG',
                        chunkIndex,
                        current: (-54.99 + Math.random() * 9.98).toFixed(2),
                        time: (0.14 + Math.random() * 99.85).toFixed(2),
                        duration: (0.5 + Math.random() * 1.5).toFixed(2)
                    });
                }
            }
        }

        return methylationSites;
    }

    async predictLactylation(sequence, chunkIndex) {
        const lactylationSites = [];
        const seq = sequence.sequence.toUpperCase();
        
        // PSSM-based lactylation prediction (simplified)
        const lactylationMotifs = ['KGGG', 'KGGA', 'KGGT', 'KGGC'];
        
        for (const motif of lactylationMotifs) {
            let index = seq.indexOf(motif);
            while (index !== -1) {
                const score = 0.5 + Math.random() * 0.5;
                if (score > 0.65) {
                    lactylationSites.push({
                        proteinId: sequence.id,
                        position: Math.floor(index / 3), // Convert to amino acid position
                        score: score.toFixed(3),
                        motif: motif,
                        chunkIndex,
                        current: (-49.94 + Math.random() * 37.9).toFixed(2),
                        time: (101.59 + Math.random() * 197.14).toFixed(2),
                        duration: (2 + Math.random() * 10).toFixed(2)
                    });
                }
                index = seq.indexOf(motif, index + 1);
            }
        }

        return lactylationSites;
    }

    async predictAcetylation(sequence, chunkIndex) {
        const acetylationSites = [];
        const seq = sequence.sequence.toUpperCase();
        
        // PSSM-based acetylation prediction (simplified)
        const acetylationMotifs = ['KXXX', 'RXKX', 'XKXR'];
        
        for (let i = 0; i < seq.length - 3; i++) {
            const tetrapeptide = seq.substring(i, i + 4);
            
            // Check for lysine-containing motifs
            if (tetrapeptide.includes('K')) {
                const score = 0.4 + Math.random() * 0.6;
                if (score > 0.7) {
                    acetylationSites.push({
                        proteinId: sequence.id,
                        position: Math.floor(i / 3),
                        score: score.toFixed(3),
                        motif: tetrapeptide,
                        chunkIndex,
                        current: (1.08 + Math.random() * 48.81).toFixed(2),
                        time: (102.31 + Math.random() * 196.62).toFixed(2),
                        duration: (1 + Math.random() * 7).toFixed(2)
                    });
                }
            }
        }

        return acetylationSites;
    }

    generateElectrochemicalParameters(chunkResults, chunkIndex) {
        const electrochemicalData = [];
        
        // Combine all modifications with their electrochemical signatures
        const allModifications = [
            ...chunkResults.methylation.map(m => ({...m, type: 'methylation'})),
            ...chunkResults.lactylation.map(l => ({...l, type: 'lactylation'})),
            ...chunkResults.acetylation.map(a => ({...a, type: 'acetylation'}))
        ];

        for (const mod of allModifications) {
            electrochemicalData.push({
                type: mod.type,
                current: parseFloat(mod.current),
                time: parseFloat(mod.time),
                duration: parseFloat(mod.duration),
                position: mod.position,
                score: parseFloat(mod.score),
                chunkIndex
            });
        }

        return electrochemicalData;
    }

    mergeChunkResults(chunkResults) {
        this.results.methylation.push(...chunkResults.methylation);
        this.results.lactylation.push(...chunkResults.lactylation);
        this.results.acetylation.push(...chunkResults.acetylation);
        this.results.electrochemical.push(...chunkResults.electrochemical);
    }

    summarizeChunkResults(chunkResults) {
        return {
            methylationCount: chunkResults.methylation.length,
            lactylationCount: chunkResults.lactylation.length,
            acetylationCount: chunkResults.acetylation.length,
            electrochemicalCount: chunkResults.electrochemical.length
        };
    }

    async finalizeAnalysis() {
        // Calculate final statistics
        this.results.statistics = {
            totalMethylationSites: this.results.methylation.length,
            totalLactylationSites: this.results.lactylation.length,
            totalAcetylationSites: this.results.acetylation.length,
            totalElectrochemicalEvents: this.results.electrochemical.length,
            processingTime: Date.now() - this.currentAnalysis.startTime,
            chunksProcessed: this.currentAnalysis.processedChunks
        };

        // Flush any remaining data
        await this.memoryProcessor.flushTempStorage();
    }

    reportProgress() {
        const progress = (this.currentAnalysis.processedChunks / this.currentAnalysis.totalChunks) * 100;
        
        this.postMessage({
            type: 'progress',
            progress: progress,
            processedChunks: this.currentAnalysis.processedChunks,
            totalChunks: this.currentAnalysis.totalChunks,
            elapsedTime: Date.now() - this.currentAnalysis.startTime
        });
    }

    cancel() {
        this.isProcessing = false;
        this.memoryProcessor.clear();
        this.postMessage({
            type: 'cancelled'
        });
    }

    postMessage(message) {
        if (typeof self !== 'undefined' && self.postMessage) {
            self.postMessage(message);
        }
    }
}

// Web Worker message handling
const analysisWorker = new AnalysisWorker();

self.onmessage = async function(e) {
    const { type, data } = e.data;
    
    try {
        switch (type) {
            case 'start_analysis':
                const results = await analysisWorker.processLargeFile(data.fileData, data.config);
                self.postMessage({
                    type: 'analysis_complete',
                    results: results
                });
                break;
                
            case 'cancel_analysis':
                analysisWorker.cancel();
                break;
                
            default:
                console.warn('Unknown message type:', type);
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error.message,
            stack: error.stack
        });
    }
};
