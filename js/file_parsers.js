/**
 * JEAN File Parsers - Real Bioinformatics File Format Support
 * Supports FASTQ, FASTA, SAM, BAM, and other sequencing formats
 * Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
 */

class SequenceFileParser {
    constructor() {
        this.supportedFormats = ['fastq', 'fq', 'fasta', 'fa', 'sam', 'bam'];
        this.parseProgress = null;
    }

    async parseFile(file, progressCallback) {
        this.parseProgress = progressCallback;
        
        const fileExtension = this.getFileExtension(file.name);
        const fileType = this.detectFileType(file.name, fileExtension);
        
        console.log(`Parsing ${fileType} file: ${file.name}`);
        
        try {
            switch (fileType) {
                case 'fastq':
                    return await this.parseFASTQ(file);
                case 'fasta':
                    return await this.parseFASTA(file);
                case 'sam':
                    return await this.parseSAM(file);
                case 'bam':
                    return await this.parseBAM(file);
                default:
                    throw new Error(`Unsupported file format: ${fileType}`);
            }
        } catch (error) {
            console.error('File parsing error:', error);
            throw error;
        }
    }

    getFileExtension(filename) {
        return filename.toLowerCase().split('.').pop();
    }

    detectFileType(filename, extension) {
        const lowerName = filename.toLowerCase();
        
        if (lowerName.includes('.fastq') || extension === 'fq') return 'fastq';
        if (lowerName.includes('.fasta') || extension === 'fa') return 'fasta';
        if (extension === 'sam') return 'sam';
        if (extension === 'bam') return 'bam';
        
        // Try to auto-detect from content if extension is unclear
        return 'fastq'; // Default assumption
    }

    async parseFASTQ(file) {
        const content = await this.readFileAsText(file);
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        
        const sequences = [];
        const qualityScores = [];
        const headers = [];
        const mmTags = [];
        
        let totalReads = 0;
        let validReads = 0;
        
        for (let i = 0; i < lines.length; i += 4) {
            if (i + 3 >= lines.length) break;
            
            const header = lines[i];
            const sequence = lines[i + 1];
            const plus = lines[i + 2];
            const quality = lines[i + 3];
            
            // Validate FASTQ format
            if (!header.startsWith('@') || !plus.startsWith('+')) {
                console.warn(`Invalid FASTQ entry at line ${i + 1}`);
                continue;
            }
            
            if (sequence.length !== quality.length) {
                console.warn(`Sequence and quality length mismatch at line ${i + 1}`);
                continue;
            }
            
            // Extract sequence information
            const cleanSequence = this.validateAndCleanSequence(sequence);
            const avgQuality = this.calculateAverageQuality(quality);
            
            if (cleanSequence && avgQuality >= 5) { // Minimum quality threshold
                sequences.push(cleanSequence);
                qualityScores.push(avgQuality);
                headers.push(header);
                
                // Extract MM tags for methylation
                const mmTag = this.extractMMTag(header);
                mmTags.push(mmTag);
                
                validReads++;
            }
            
            totalReads++;
            
            // Progress update
            if (totalReads % 1000 === 0 && this.parseProgress) {
                const progress = Math.min(95, (i / lines.length) * 100);
                this.parseProgress('parsing', `Parsed ${validReads} valid reads...`, progress);
            }
        }
        
        return {
            fileType: 'FASTQ',
            totalReads: totalReads,
            validReads: validReads,
            sequences: sequences,
            qualityScores: qualityScores,
            headers: headers,
            mmTags: mmTags,
            averageLength: this.calculateAverageLength(sequences),
            averageQuality: this.calculateAverageValue(qualityScores)
        };
    }

    async parseFASTA(file) {
        const content = await this.readFileAsText(file);
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        
        const sequences = [];
        const headers = [];
        
        let currentHeader = '';
        let currentSequence = '';
        let totalSequences = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('>')) {
                // Save previous sequence if exists
                if (currentHeader && currentSequence) {
                    const cleanSequence = this.validateAndCleanSequence(currentSequence);
                    if (cleanSequence) {
                        sequences.push(cleanSequence);
                        headers.push(currentHeader);
                        totalSequences++;
                    }
                }
                
                currentHeader = line;
                currentSequence = '';
            } else {
                currentSequence += line.toUpperCase();
            }
            
            // Progress update
            if (i % 1000 === 0 && this.parseProgress) {
                const progress = Math.min(95, (i / lines.length) * 100);
                this.parseProgress('parsing', `Processing FASTA sequences...`, progress);
            }
        }
        
        // Add last sequence
        if (currentHeader && currentSequence) {
            const cleanSequence = this.validateAndCleanSequence(currentSequence);
            if (cleanSequence) {
                sequences.push(cleanSequence);
                headers.push(currentHeader);
                totalSequences++;
            }
        }
        
        // Generate default quality scores for FASTA
        const qualityScores = sequences.map(() => 30); // Default Phred score
        
        return {
            fileType: 'FASTA',
            totalReads: totalSequences,
            validReads: totalSequences,
            sequences: sequences,
            qualityScores: qualityScores,
            headers: headers,
            mmTags: sequences.map(() => null), // No MM tags in FASTA
            averageLength: this.calculateAverageLength(sequences),
            averageQuality: 30
        };
    }

    async parseSAM(file) {
        const content = await this.readFileAsText(file);
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        
        const sequences = [];
        const qualityScores = [];
        const headers = [];
        const mmTags = [];
        const alignmentInfo = [];
        
        let totalReads = 0;
        let validReads = 0;
        
        for (const line of lines) {
            if (line.startsWith('@')) {
                // Skip header lines
                continue;
            }
            
            const fields = line.split('\t');
            if (fields.length < 11) {
                console.warn('Invalid SAM line:', line.substring(0, 50));
                continue;
            }
            
            const qname = fields[0];
            const flag = parseInt(fields[1]);
            const rname = fields[2];
            const pos = parseInt(fields[3]);
            const mapq = parseInt(fields[4]);
            const cigar = fields[5];
            const seq = fields[9];
            const qual = fields[10];
            
            // Skip unmapped reads if desired
            if (flag & 4) { // Unmapped
                totalReads++;
                continue;
            }
            
            const cleanSequence = this.validateAndCleanSequence(seq);
            const avgQuality = this.calculateAverageQuality(qual);
            
            if (cleanSequence && avgQuality >= 5) {
                sequences.push(cleanSequence);
                qualityScores.push(avgQuality);
                headers.push(qname);
                
                // Extract MM tag from optional fields
                let mmTag = null;
                for (let i = 11; i < fields.length; i++) {
                    if (fields[i].startsWith('MM:Z:')) {
                        mmTag = fields[i].substring(5);
                        break;
                    }
                }
                mmTags.push(mmTag);
                
                // Store alignment information
                alignmentInfo.push({
                    chromosome: rname,
                    position: pos,
                    mappingQuality: mapq,
                    cigar: cigar
                });
                
                validReads++;
            }
            
            totalReads++;
            
            // Progress update
            if (totalReads % 1000 === 0 && this.parseProgress) {
                const progress = Math.min(95, (totalReads / lines.length) * 100);
                this.parseProgress('parsing', `Parsed ${validReads} aligned reads...`, progress);
            }
        }
        
        return {
            fileType: 'SAM',
            totalReads: totalReads,
            validReads: validReads,
            sequences: sequences,
            qualityScores: qualityScores,
            headers: headers,
            mmTags: mmTags,
            alignmentInfo: alignmentInfo,
            averageLength: this.calculateAverageLength(sequences),
            averageQuality: this.calculateAverageValue(qualityScores)
        };
    }

    async parseBAM(file) {
        // BAM files are binary and require special handling
        // For web implementation, we'll provide a simplified parser
        // In practice, you'd use a library like @gmod/bam or similar
        
        throw new Error('BAM file parsing requires binary processing. Please convert to SAM format or use FASTQ files.');
    }

    async readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    validateAndCleanSequence(sequence) {
        if (!sequence) return null;
        
        // Remove whitespace and convert to uppercase
        const cleaned = sequence.replace(/\s/g, '').toUpperCase();
        
        // Validate nucleotide sequence
        const validBases = /^[ATGCNRYSWKMBDHV]+$/;
        if (!validBases.test(cleaned)) {
            console.warn('Invalid nucleotide sequence detected');
            return null;
        }
        
        // Filter out sequences that are too short or too long
        if (cleaned.length < 50 || cleaned.length > 50000) {
            return null;
        }
        
        return cleaned;
    }

    calculateAverageQuality(qualityString) {
        if (!qualityString) return 0;
        
        let sum = 0;
        for (const char of qualityString) {
            // Phred+33 encoding
            sum += char.charCodeAt(0) - 33;
        }
        return sum / qualityString.length;
    }

    extractMMTag(header) {
        // Extract methylation modification tags from header
        const mmMatch = header.match(/MM:Z:([^;\s]+)/);
        return mmMatch ? mmMatch[1] : null;
    }

    calculateAverageLength(sequences) {
        if (sequences.length === 0) return 0;
        const sum = sequences.reduce((acc, seq) => acc + seq.length, 0);
        return Math.round(sum / sequences.length);
    }

    calculateAverageValue(values) {
        if (values.length === 0) return 0;
        const sum = values.reduce((acc, val) => acc + val, 0);
        return sum / values.length;
    }

    // Quality control methods
    performQualityControl(parsedData, config = {}) {
        const qc = {
            minReadLength: config.minReadLength || 100,
            minQualityScore: config.minQualityScore || 7,
            maxNContent: config.maxNContent || 10
        };
        
        const filteredData = {
            sequences: [],
            qualityScores: [],
            headers: [],
            mmTags: [],
            alignmentInfo: parsedData.alignmentInfo || []
        };
        
        let passedReads = 0;
        
        for (let i = 0; i < parsedData.sequences.length; i++) {
            const sequence = parsedData.sequences[i];
            const quality = parsedData.qualityScores[i];
            
            // Length filter
            if (sequence.length < qc.minReadLength) continue;
            
            // Quality filter
            if (quality < qc.minQualityScore) continue;
            
            // N content filter
            const nCount = (sequence.match(/N/g) || []).length;
            const nPercentage = (nCount / sequence.length) * 100;
            if (nPercentage > qc.maxNContent) continue;
            
            // Passed all filters
            filteredData.sequences.push(sequence);
            filteredData.qualityScores.push(quality);
            filteredData.headers.push(parsedData.headers[i]);
            filteredData.mmTags.push(parsedData.mmTags[i]);
            
            if (parsedData.alignmentInfo && parsedData.alignmentInfo[i]) {
                filteredData.alignmentInfo.push(parsedData.alignmentInfo[i]);
            }
            
            passedReads++;
        }
        
        return {
            ...parsedData,
            ...filteredData,
            validReads: passedReads,
            qcStats: {
                originalReads: parsedData.sequences.length,
                passedReads: passedReads,
                filteredReads: parsedData.sequences.length - passedReads,
                passRate: (passedReads / parsedData.sequences.length * 100).toFixed(2)
            }
        };
    }

    // Generate parsing statistics
    generateParsingStats(parsedData) {
        const stats = {
            fileInfo: {
                format: parsedData.fileType,
                totalReads: parsedData.totalReads,
                validReads: parsedData.validReads,
                averageLength: parsedData.averageLength,
                averageQuality: parsedData.averageQuality.toFixed(2)
            },
            lengthDistribution: this.calculateLengthDistribution(parsedData.sequences),
            qualityDistribution: this.calculateQualityDistribution(parsedData.qualityScores),
            baseComposition: this.calculateBaseComposition(parsedData.sequences),
            methylationInfo: this.analyzeMethylationTags(parsedData.mmTags)
        };
        
        return stats;
    }

    calculateLengthDistribution(sequences) {
        const bins = [0, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000];
        const distribution = new Array(bins.length - 1).fill(0);
        
        for (const seq of sequences) {
            for (let i = 0; i < bins.length - 1; i++) {
                if (seq.length >= bins[i] && seq.length < bins[i + 1]) {
                    distribution[i]++;
                    break;
                }
            }
        }
        
        return distribution.map((count, i) => ({
            range: `${bins[i]}-${bins[i + 1]}`,
            count: count,
            percentage: (count / sequences.length * 100).toFixed(1)
        }));
    }

    calculateQualityDistribution(qualities) {
        const bins = [0, 10, 15, 20, 25, 30, 35, 40];
        const distribution = new Array(bins.length - 1).fill(0);
        
        for (const qual of qualities) {
            for (let i = 0; i < bins.length - 1; i++) {
                if (qual >= bins[i] && qual < bins[i + 1]) {
                    distribution[i]++;
                    break;
                }
            }
        }
        
        return distribution.map((count, i) => ({
            range: `${bins[i]}-${bins[i + 1]}`,
            count: count,
            percentage: (count / qualities.length * 100).toFixed(1)
        }));
    }

    calculateBaseComposition(sequences) {
        const composition = { A: 0, T: 0, G: 0, C: 0, N: 0, other: 0 };
        let totalBases = 0;
        
        for (const seq of sequences) {
            for (const base of seq) {
                if (composition.hasOwnProperty(base)) {
                    composition[base]++;
                } else {
                    composition.other++;
                }
                totalBases++;
            }
        }
        
        // Convert to percentages
        const percentages = {};
        for (const [base, count] of Object.entries(composition)) {
            percentages[base] = (count / totalBases * 100).toFixed(2);
        }
        
        return percentages;
    }

    analyzeMethylationTags(mmTags) {
        const analysis = {
            readsWithMethylation: 0,
            totalMethylationSites: 0,
            methylationTypes: { '5mC': 0, '5hmC': 0, '6mA': 0 }
        };
        
        for (const tag of mmTags) {
            if (tag) {
                analysis.readsWithMethylation++;
                
                // Parse methylation sites
                const sites = tag.split(';');
                analysis.totalMethylationSites += sites.length;
                
                for (const site of sites) {
                    if (site.includes('+m')) analysis.methylationTypes['5mC']++;
                    if (site.includes('+h')) analysis.methylationTypes['5hmC']++;
                    if (site.includes('+a')) analysis.methylationTypes['6mA']++;
                }
            }
        }
        
        return analysis;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.SequenceFileParser = SequenceFileParser;
}
