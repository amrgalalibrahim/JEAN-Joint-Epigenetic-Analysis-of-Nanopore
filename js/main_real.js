/**
 * JEAN Real Analysis Tool - Main JavaScript Controller
 * Integrates all real bioinformatics analysis engines
 * Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
 */

class JEANRealController {
    constructor() {
        this.uploadedFiles = [];
        this.analysisResults = null;
        this.isAnalysisRunning = false;
        this.analysisStartTime = null;
        
        // Initialize analysis engines
        this.fileParser = new SequenceFileParser();
        this.methylationDetector = new MethylationDetector();
        this.pssmPredictor = new PSSMPredictor();
        this.electrochemicalEngine = new ElectrochemicalEngine();
        
        // Initialize UI
        this.initializeEventListeners();
        this.initializeConfiguration();
    }

    initializeEventListeners() {
        // File upload
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('drop', this.handleFileDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        // Sample data buttons
        document.querySelectorAll('.sample-btn').forEach(btn => {
            btn.addEventListener('click', this.loadSampleData.bind(this));
        });
        
        // Configuration controls
        document.getElementById('startAnalysisBtn').addEventListener('click', this.startRealAnalysis.bind(this));
        document.getElementById('resetConfigBtn').addEventListener('click', this.resetConfiguration.bind(this));
        
        // Threshold sliders
        this.initializeThresholdSliders();
        
        // Tab navigation
        this.initializeTabNavigation();
    }

    initializeConfiguration() {
        // Set default configuration values
        this.config = {
            modifications: {
                methylation: document.getElementById('methylationCheck').checked,
                lactylation: document.getElementById('lactylationCheck').checked,
                acetylation: document.getElementById('acetylationCheck').checked
            },
            thresholds: {
                methylation: parseFloat(document.getElementById('methylationThreshold').value),
                lactylation: parseFloat(document.getElementById('lactylationThreshold').value),
                acetylation: parseFloat(document.getElementById('acetylationThreshold').value)
            },
            options: {
                requireCpG: document.getElementById('requireCpG').checked,
                enableQC: document.getElementById('enableQC').checked,
                generateReports: document.getElementById('generateReports').checked
            }
        };
    }

    initializeThresholdSliders() {
        const sliders = ['methylation', 'lactylation', 'acetylation'];
        
        sliders.forEach(type => {
            const slider = document.getElementById(`${type}Threshold`);
            const valueDisplay = document.getElementById(`${type}ThresholdValue`);
            
            slider.addEventListener('input', (e) => {
                valueDisplay.textContent = e.target.value;
                this.config.thresholds[type] = parseFloat(e.target.value);
            });
        });
    }

    initializeTabNavigation() {
        // Visualization tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                this.switchVisualizationTab(tabId);
            });
        });
        
        // Data table tabs
        document.querySelectorAll('.table-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tableId = e.target.dataset.table;
                this.switchDataTable(tableId);
            });
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.add('drag-over');
    }

    handleFileDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        this.processFiles(files);
    }

    handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.processFiles(files);
    }

    async processFiles(files) {
        console.log('Processing uploaded files:', files);
        
        // Validate files
        const validFiles = this.validateFiles(files);
        if (validFiles.length === 0) {
            showAlert('No valid sequencing files found. Please upload FASTQ, FASTA, or SAM files.', 'error');
            return;
        }
        
        // Add to uploaded files
        this.uploadedFiles = validFiles;
        
        // Update UI
        this.displayUploadedFiles();
        this.showConfigurationSection();
        
        showAlert(`Successfully loaded ${validFiles.length} file(s)`, 'success');
    }

    validateFiles(files) {
        const validExtensions = ['.fastq', '.fq', '.fasta', '.fa', '.sam'];
        const maxSize = 16 * 1024 * 1024 * 1024; // 16GB
        
        return files.filter(file => {
            // Check extension
            const hasValidExtension = validExtensions.some(ext => 
                file.name.toLowerCase().endsWith(ext)
            );
            
            // Check size
            const isValidSize = file.size <= maxSize;
            
            if (!hasValidExtension) {
                console.warn(`Invalid file type: ${file.name}`);
                return false;
            }
            
            if (!isValidSize) {
                console.warn(`File too large: ${file.name} (${file.size} bytes)`);
                showAlert(`File ${file.name} exceeds 16GB limit`, 'error');
                return false;
            }
            
            return true;
        });
    }

    displayUploadedFiles() {
        const fileList = document.getElementById('fileList');
        const uploadedFilesSection = document.getElementById('uploadedFiles');
        
        fileList.innerHTML = '';
        
        this.uploadedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${this.formatFileSize(file.size)}</span>
                </div>
                <button class="remove-file-btn" onclick="jeanController.removeFile(${index})">×</button>
            `;
            fileList.appendChild(fileItem);
        });
        
        uploadedFilesSection.style.display = 'block';
    }

    removeFile(index) {
        this.uploadedFiles.splice(index, 1);
        this.displayUploadedFiles();
        
        if (this.uploadedFiles.length === 0) {
            document.getElementById('uploadedFiles').style.display = 'none';
            document.getElementById('configSection').style.display = 'none';
        }
    }

    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    loadSampleData(e) {
        const dataType = e.target.dataset.type;
        console.log('Loading sample data:', dataType);
        
        // Create mock file objects for sample data
        const sampleFiles = this.createSampleFiles(dataType);
        this.uploadedFiles = sampleFiles;
        
        this.displayUploadedFiles();
        this.showConfigurationSection();
        
        showAlert(`Loaded ${dataType} sample data`, 'success');
    }

    createSampleFiles(dataType) {
        const sampleData = {
            methylation: {
                name: 'methylation_sample.fastq',
                size: 1024 * 1024 * 50, // 50MB
                reads: 10000,
                type: 'methylation'
            },
            lactylation: {
                name: 'lactylation_sample.fastq',
                size: 1024 * 1024 * 75, // 75MB
                reads: 15000,
                type: 'lactylation'
            },
            acetylation: {
                name: 'acetylation_sample.fastq',
                size: 1024 * 1024 * 60, // 60MB
                reads: 12000,
                type: 'acetylation'
            },
            complete: {
                name: 'complete_sample.fastq',
                size: 1024 * 1024 * 200, // 200MB
                reads: 50000,
                type: 'complete'
            }
        };
        
        const data = sampleData[dataType];
        return [{
            name: data.name,
            size: data.size,
            isSample: true,
            data: data
        }];
    }

    showConfigurationSection() {
        document.getElementById('configSection').style.display = 'block';
        document.getElementById('configSection').scrollIntoView({ behavior: 'smooth' });
    }

    updateConfiguration() {
        this.config.modifications = {
            methylation: document.getElementById('methylationCheck').checked,
            lactylation: document.getElementById('lactylationCheck').checked,
            acetylation: document.getElementById('acetylationCheck').checked
        };
        
        this.config.options = {
            requireCpG: document.getElementById('requireCpG').checked,
            enableQC: document.getElementById('enableQC').checked,
            generateReports: document.getElementById('generateReports').checked
        };
    }

    resetConfiguration() {
        // Reset checkboxes
        document.getElementById('methylationCheck').checked = true;
        document.getElementById('lactylationCheck').checked = true;
        document.getElementById('acetylationCheck').checked = true;
        document.getElementById('requireCpG').checked = false;
        document.getElementById('enableQC').checked = true;
        document.getElementById('generateReports').checked = true;
        
        // Reset sliders
        document.getElementById('methylationThreshold').value = 0.5;
        document.getElementById('lactylationThreshold').value = 0.5;
        document.getElementById('acetylationThreshold').value = 0.5;
        document.getElementById('methylationThresholdValue').textContent = '0.5';
        document.getElementById('lactylationThresholdValue').textContent = '0.5';
        document.getElementById('acetylationThresholdValue').textContent = '0.5';
        
        this.initializeConfiguration();
        showAlert('Configuration reset to defaults', 'success');
    }

    async startRealAnalysis() {
        if (this.uploadedFiles.length === 0) {
            showAlert('Please upload files or select sample data first', 'error');
            return;
        }
        
        if (this.isAnalysisRunning) {
            showAlert('Analysis is already running', 'error');
            return;
        }
        
        console.log('Starting real bioinformatics analysis...');
        
        this.isAnalysisRunning = true;
        this.analysisStartTime = Date.now();
        this.updateConfiguration();
        
        // Show progress section
        this.showProgressSection();
        
        try {
            // Step 1: Parse files
            await this.updateProgress('parsing', 'Parsing sequencing files...', 0);
            const parsedData = await this.parseFiles();
            await this.updateProgress('parsing', 'File parsing complete', 100);
            
            // Step 2: Methylation detection
            let methylationResults = null;
            if (this.config.modifications.methylation) {
                await this.updateProgress('methylation', 'Detecting methylation sites...', 0);
                methylationResults = await this.methylationDetector.detectMethylation(parsedData, this.config);
                await this.updateProgress('methylation', `Found ${methylationResults.sites.length} methylation sites`, 100);
            }
            
            // Step 3: Lactylation prediction
            let lactylationResults = null;
            if (this.config.modifications.lactylation) {
                await this.updateProgress('lactylation', 'Predicting lactylation sites...', 0);
                lactylationResults = await this.pssmPredictor.predictLactylation(parsedData, this.config);
                await this.updateProgress('lactylation', `Predicted ${lactylationResults.sites.length} lactylation sites`, 100);
            }
            
            // Step 4: Acetylation prediction
            let acetylationResults = null;
            if (this.config.modifications.acetylation) {
                await this.updateProgress('acetylation', 'Predicting acetylation sites...', 0);
                acetylationResults = await this.pssmPredictor.predictAcetylation(parsedData, this.config);
                await this.updateProgress('acetylation', `Predicted ${acetylationResults.sites.length} acetylation sites`, 100);
            }
            
            // Step 5: Electrochemical modeling
            await this.updateProgress('electrochemical', 'Calculating electrochemical parameters...', 0);
            const electrochemicalResults = await this.electrochemicalEngine.calculateElectrochemicalParameters(
                methylationResults, lactylationResults, acetylationResults
            );
            await this.updateProgress('electrochemical', 'Electrochemical modeling complete', 100);
            
            // Step 6: Generate visualizations
            await this.updateProgress('visualization', 'Generating visualizations...', 0);
            const visualizations = await this.generateVisualizations(
                methylationResults, lactylationResults, acetylationResults, electrochemicalResults
            );
            await this.updateProgress('visualization', 'Analysis complete!', 100);
            
            // Store results
            this.analysisResults = {
                parsedData: parsedData,
                methylation: methylationResults,
                lactylation: lactylationResults,
                acetylation: acetylationResults,
                electrochemical: electrochemicalResults,
                visualizations: visualizations,
                config: this.config,
                timestamp: new Date().toISOString()
            };
            
            // Show results
            this.showResults();
            
            showAlert('Real analysis completed successfully!', 'success');
            
        } catch (error) {
            console.error('Analysis error:', error);
            showAlert(`Analysis failed: ${error.message}`, 'error');
        } finally {
            this.isAnalysisRunning = false;
        }
    }

    async parseFiles() {
        const allParsedData = {
            sequences: [],
            qualityScores: [],
            headers: [],
            mmTags: [],
            totalReads: 0,
            validReads: 0,
            fileFormat: 'Mixed'
        };
        
        for (const file of this.uploadedFiles) {
            if (file.isSample) {
                // Generate sample data
                const sampleData = await this.generateSampleSequenceData(file);
                this.mergeParsedData(allParsedData, sampleData);
            } else {
                // Parse real file
                const parsedData = await this.fileParser.parseFile(file, this.updateParsingProgress.bind(this));
                this.mergeParsedData(allParsedData, parsedData);
            }
        }
        
        // Apply quality control if enabled
        if (this.config.options.enableQC) {
            return this.fileParser.performQualityControl(allParsedData, this.config);
        }
        
        return allParsedData;
    }

    async generateSampleSequenceData(file) {
        const data = file.data;
        const sequences = [];
        const qualityScores = [];
        const headers = [];
        const mmTags = [];
        
        for (let i = 0; i < data.reads; i++) {
            const readLength = Math.floor(Math.random() * 2000) + 500; // 500-2500 bp
            const sequence = this.generateRealisticSequence(readLength, data.type);
            const quality = this.generateRealisticQuality(readLength);
            const header = `@read_${i + 1}_${data.type} length=${readLength}`;
            
            sequences.push(sequence);
            qualityScores.push(this.calculateAverageQuality(quality));
            headers.push(header);
            
            // Add MM tags for methylation samples
            if (data.type === 'methylation' || data.type === 'complete') {
                if (Math.random() < 0.3) { // 30% of reads have methylation
                    mmTags.push(this.generateMethylationTag(sequence));
                } else {
                    mmTags.push(null);
                }
            } else {
                mmTags.push(null);
            }
        }
        
        return {
            sequences: sequences,
            qualityScores: qualityScores,
            headers: headers,
            mmTags: mmTags,
            totalReads: data.reads,
            validReads: data.reads,
            fileFormat: 'FASTQ'
        };
    }

    generateRealisticSequence(length, type) {
        const bases = ['A', 'T', 'G', 'C'];
        let sequence = '';
        
        for (let i = 0; i < length; i++) {
            if (i > 0 && sequence[i-1] === 'C' && Math.random() < 0.7) {
                sequence += 'G'; // CpG dinucleotide
            } else {
                sequence += bases[Math.floor(Math.random() * 4)];
            }
        }
        
        return sequence;
    }

    generateRealisticQuality(length) {
        let quality = '';
        for (let i = 0; i < length; i++) {
            const baseQuality = Math.max(5, 35 - (i / length) * 10 + (Math.random() - 0.5) * 10);
            quality += String.fromCharCode(Math.floor(baseQuality) + 33);
        }
        return quality;
    }

    calculateAverageQuality(qualityString) {
        if (!qualityString) return 0;
        let sum = 0;
        for (const char of qualityString) {
            sum += char.charCodeAt(0) - 33;
        }
        return sum / qualityString.length;
    }

    generateMethylationTag(sequence) {
        const methylationSites = [];
        
        for (let i = 0; i < sequence.length - 1; i++) {
            if (sequence.substring(i, i + 2) === 'CG') {
                if (Math.random() < 0.8) { // 80% methylation at CpG sites
                    methylationSites.push(`C+m,${i}`);
                }
            }
        }
        
        return methylationSites.length > 0 ? methylationSites.join(';') : null;
    }

    mergeParsedData(target, source) {
        target.sequences.push(...source.sequences);
        target.qualityScores.push(...source.qualityScores);
        target.headers.push(...source.headers);
        target.mmTags.push(...source.mmTags);
        target.totalReads += source.totalReads;
        target.validReads += source.validReads;
    }

    updateParsingProgress(step, message, progress) {
        console.log(`Parsing progress: ${step} - ${message} (${progress}%)`);
    }

    showProgressSection() {
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('progressSection').scrollIntoView({ behavior: 'smooth' });
        
        // Reset all progress bars
        this.resetProgressBars();
        
        // Start elapsed time counter
        this.startElapsedTimeCounter();
    }

    resetProgressBars() {
        const steps = ['parsing', 'methylation', 'lactylation', 'acetylation', 'electrochemical', 'visualization'];
        
        steps.forEach(step => {
            const progressBar = document.getElementById(`progress-${step}`);
            const progressText = document.getElementById(`text-${step}`);
            const stepElement = document.getElementById(`step-${step}`);
            
            if (progressBar) progressBar.style.width = '0%';
            if (progressText) progressText.textContent = 'Waiting...';
            if (stepElement) {
                stepElement.classList.remove('active', 'completed');
            }
        });
        
        document.getElementById('overallProgress').style.width = '0%';
        document.getElementById('overallPercentage').textContent = '0%';
    }

    startElapsedTimeCounter() {
        this.elapsedTimeInterval = setInterval(() => {
            if (this.analysisStartTime) {
                const elapsed = Date.now() - this.analysisStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                document.getElementById('elapsedTime').textContent = 
                    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    async updateProgress(step, message, progress) {
        const progressBar = document.getElementById(`progress-${step}`);
        const progressText = document.getElementById(`text-${step}`);
        const stepElement = document.getElementById(`step-${step}`);
        
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressText) progressText.textContent = message;
        
        if (stepElement) {
            stepElement.classList.add('active');
            if (progress === 100) {
                stepElement.classList.remove('active');
                stepElement.classList.add('completed');
            }
        }
        
        // Update overall progress
        const steps = ['parsing', 'methylation', 'lactylation', 'acetylation', 'electrochemical', 'visualization'];
        const enabledSteps = steps.filter(s => {
            if (s === 'methylation') return this.config.modifications.methylation;
            if (s === 'lactylation') return this.config.modifications.lactylation;
            if (s === 'acetylation') return this.config.modifications.acetylation;
            return true; // parsing, electrochemical, visualization are always enabled
        });
        
        let totalProgress = 0;
        enabledSteps.forEach(s => {
            const bar = document.getElementById(`progress-${s}`);
            if (bar) {
                const width = parseFloat(bar.style.width) || 0;
                totalProgress += width;
            }
        });
        
        const overallProgress = totalProgress / enabledSteps.length;
        document.getElementById('overallProgress').style.width = `${overallProgress}%`;
        document.getElementById('overallPercentage').textContent = `${Math.round(overallProgress)}%`;
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    async generateVisualizations(methylationResults, lactylationResults, acetylationResults, electrochemicalResults) {
        const visualizations = {
            chromatogram2D: {
                data: electrochemicalResults.traceData,
                peaks: this.getAllModificationSites(methylationResults, lactylationResults, acetylationResults)
            },
            plot3D: {
                data: this.prepare3DData(methylationResults, lactylationResults, acetylationResults)
            },
            statistics: {
                methylation: methylationResults ? methylationResults.statistics : null,
                lactylation: lactylationResults ? lactylationResults.statistics : null,
                acetylation: acetylationResults ? acetylationResults.statistics : null,
                electrochemical: electrochemicalResults.summary
            }
        };
        
        return visualizations;
    }

    getAllModificationSites(methylationResults, lactylationResults, acetylationResults) {
        const allSites = [];
        
        if (methylationResults) {
            allSites.push(...methylationResults.sites.map(site => ({
                ...site,
                category: 'methylation'
            })));
        }
        
        if (lactylationResults) {
            allSites.push(...lactylationResults.sites.map(site => ({
                ...site,
                category: 'lactylation'
            })));
        }
        
        if (acetylationResults) {
            allSites.push(...acetylationResults.sites.map(site => ({
                ...site,
                category: 'acetylation'
            })));
        }
        
        return allSites;
    }

    prepare3DData(methylationResults, lactylationResults, acetylationResults) {
        const data3D = [];
        
        if (methylationResults) {
            methylationResults.sites.forEach(site => {
                data3D.push({
                    x: parseFloat(site.current),
                    y: parseFloat(site.position || Math.random() * 100),
                    z: parseFloat(site.duration),
                    type: 'Methylation',
                    color: '#dc3545'
                });
            });
        }
        
        if (lactylationResults) {
            lactylationResults.sites.forEach(site => {
                data3D.push({
                    x: parseFloat(site.current),
                    y: parseFloat(site.position),
                    z: parseFloat(site.duration),
                    type: 'Lactylation',
                    color: '#28a745'
                });
            });
        }
        
        if (acetylationResults) {
            acetylationResults.sites.forEach(site => {
                data3D.push({
                    x: parseFloat(site.current),
                    y: parseFloat(site.position),
                    z: parseFloat(site.duration),
                    type: 'Acetylation',
                    color: '#6f42c1'
                });
            });
        }
        
        return data3D;
    }

    showResults() {
        // Clear elapsed time counter
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
        }
        
        // Update summary cards
        this.updateSummaryCards();
        
        // Generate visualizations
        this.generateChromatogram2D();
        this.generate3DPlot();
        this.generateStatistics();
        this.generateDataTables();
        
        // Show results section
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
        
        // Store results globally for export functions
        window.analysisResults = this.analysisResults;
    }

    updateSummaryCards() {
        const results = this.analysisResults;
        
        document.getElementById('totalReads').textContent = results.parsedData.totalReads.toLocaleString();
        document.getElementById('methylationEvents').textContent = 
            results.methylation ? results.methylation.sites.length.toLocaleString() : '0';
        document.getElementById('lactylationEvents').textContent = 
            results.lactylation ? results.lactylation.sites.length.toLocaleString() : '0';
        document.getElementById('acetylationEvents').textContent = 
            results.acetylation ? results.acetylation.sites.length.toLocaleString() : '0';
    }

    generateChromatogram2D() {
        const traceData = this.analysisResults.electrochemical.traceData;
        const peaks = this.analysisResults.visualizations.chromatogram2D.peaks;
        
        const trace = {
            x: traceData.map(d => d.time),
            y: traceData.map(d => parseFloat(d.current)),
            type: 'scatter',
            mode: 'lines',
            name: 'Current',
            line: { color: '#2c3e50', width: 2 }
        };
        
        const layout = {
            title: 'JEAN Real Electrochemical Chromatogram',
            xaxis: { title: 'Time (s)' },
            yaxis: { title: 'Current (pA)' },
            showlegend: true,
            hovermode: 'closest'
        };
        
        Plotly.newPlot('chromatogram2dPlot', [trace], layout);
    }

    generate3DPlot() {
        const data3D = this.analysisResults.visualizations.plot3D.data;
        
        const traces = {};
        
        data3D.forEach(point => {
            if (!traces[point.type]) {
                traces[point.type] = {
                    x: [],
                    y: [],
                    z: [],
                    mode: 'markers',
                    type: 'scatter3d',
                    name: point.type,
                    marker: {
                        size: 5,
                        color: point.color
                    }
                };
            }
            
            traces[point.type].x.push(point.x);
            traces[point.type].y.push(point.y);
            traces[point.type].z.push(point.z);
        });
        
        const layout = {
            title: '3D Electrochemical Analysis',
            scene: {
                xaxis: { title: 'Current (pA)' },
                yaxis: { title: 'Position' },
                zaxis: { title: 'Duration (s)' }
            }
        };
        
        Plotly.newPlot('plot3dContainer', Object.values(traces), layout);
    }

    generateStatistics() {
        const results = this.analysisResults;
        
        // Methylation statistics
        if (results.methylation) {
            const methylationStats = document.getElementById('methylationStats');
            methylationStats.innerHTML = this.formatStatistics(results.methylation.summary);
        }
        
        // Lactylation statistics
        if (results.lactylation) {
            const lactylationStats = document.getElementById('lactylationStats');
            lactylationStats.innerHTML = this.formatStatistics(results.lactylation.summary);
        }
        
        // Acetylation statistics
        if (results.acetylation) {
            const acetylationStats = document.getElementById('acetylationStats');
            acetylationStats.innerHTML = this.formatStatistics(results.acetylation.summary);
        }
        
        // Electrochemical statistics
        const electrochemicalStats = document.getElementById('electrochemicalStats');
        electrochemicalStats.innerHTML = this.formatStatistics(results.electrochemical.summary);
    }

    formatStatistics(stats) {
        let html = '<div class="stats-list">';
        
        for (const [key, value] of Object.entries(stats)) {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            html += `<div class="stat-item"><span class="stat-label">${formattedKey}:</span> <span class="stat-value">${value}</span></div>`;
        }
        
        html += '</div>';
        return html;
    }

    generateDataTables() {
        const results = this.analysisResults;
        
        // Methylation table
        if (results.methylation) {
            this.generateTable('methylationTable', results.methylation.sites, [
                'readId', 'position', 'base', 'modificationType', 'context', 'confidence', 'current', 'time', 'duration'
            ]);
        }
        
        // Lactylation table
        if (results.lactylation) {
            this.generateTable('lactylationTable', results.lactylation.sites, [
                'proteinId', 'position', 'residue', 'score', 'current', 'time', 'duration'
            ]);
        }
        
        // Acetylation table
        if (results.acetylation) {
            this.generateTable('acetylationTable', results.acetylation.sites, [
                'proteinId', 'position', 'residue', 'score', 'current', 'time', 'duration'
            ]);
        }
        
        // Electrochemical table
        this.generateTable('electrochemicalTable', results.electrochemical.traceData.slice(0, 100), [
            'time', 'current', 'baseline', 'potential'
        ]);
    }

    generateTable(containerId, data, columns) {
        const container = document.getElementById(containerId);
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p>No data available</p>';
            return;
        }
        
        let html = '<table class="data-table-content"><thead><tr>';
        
        columns.forEach(col => {
            const header = col.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            html += `<th>${header}</th>`;
        });
        
        html += '</tr></thead><tbody>';
        
        data.slice(0, 50).forEach(row => { // Limit to first 50 rows for performance
            html += '<tr>';
            columns.forEach(col => {
                const value = row[col] || '';
                html += `<td>${value}</td>`;
            });
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        
        if (data.length > 50) {
            html += `<p class="table-note">Showing first 50 of ${data.length} entries. Export for complete data.</p>`;
        }
        
        container.innerHTML = html;
    }

    switchVisualizationTab(tabId) {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to selected tab and content
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');
    }

    switchDataTable(tableId) {
        // Remove active class from all table tabs and contents
        document.querySelectorAll('.table-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.data-table').forEach(table => table.classList.remove('active'));
        
        // Add active class to selected table tab and content
        document.querySelector(`[data-table="${tableId}"]`).classList.add('active');
        document.getElementById(`${tableId}Table`).classList.add('active');
    }
}

// Initialize the controller when the page loads
let jeanController;

document.addEventListener('DOMContentLoaded', function() {
    console.log('JEAN Real Analysis Tool v2.0 - Initializing...');
    jeanController = new JEANRealController();
    console.log('JEAN Real Analysis Tool initialized successfully!');
});

// Export functions for global access
function showAlert(message, type = 'info') {
    const alertClass = type === 'error' ? 'alert-error' : 'alert-success';
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${alertClass}`;
    alertDiv.textContent = message;
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px;
        border-radius: 5px;
        color: white;
        background-color: ${type === 'error' ? '#dc3545' : '#28a745'};
        z-index: 1000;
        max-width: 300px;
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (document.body.contains(alertDiv)) {
            document.body.removeChild(alertDiv);
        }
    }, 3000);
}
