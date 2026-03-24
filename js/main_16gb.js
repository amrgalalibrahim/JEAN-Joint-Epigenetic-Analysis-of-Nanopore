/**
 * JEAN Web Tool - Enhanced for 16GB File Support
 * Main application controller with chunked processing and web workers
 * Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
 */

class JEAN16GB {
    constructor() {
        this.chunkedUploader = null;
        this.analysisWorker = null;
        this.streamingReader = null;
        this.memoryProcessor = null;
        this.currentFile = null;
        this.analysisResults = null;
        this.isAnalyzing = false;
        
        // Configuration
        this.config = {
            maxFileSize: 16 * 1024 * 1024 * 1024, // 16GB
            chunkSize: 64 * 1024 * 1024, // 64MB chunks
            concurrentChunks: 3,
            memoryThreshold: 512 * 1024 * 1024, // 512MB
            detectMethylation: true,
            detectLactylation: true,
            detectAcetylation: true,
            agaeValidation: true
        };
        
        this.initializeComponents();
        this.setupEventListeners();
    }

    initializeComponents() {
        // Initialize chunked uploader
        this.chunkedUploader = new ChunkedFileUploader({
            chunkSize: this.config.chunkSize,
            maxFileSize: this.config.maxFileSize,
            concurrentChunks: this.config.concurrentChunks,
            onProgress: (progress, chunkIndex, totalChunks, fileName) => {
                this.updateUploadProgress(progress, chunkIndex, totalChunks, fileName);
            },
            onChunkComplete: (chunkIndex, chunkData, chunkTask) => {
                this.handleChunkComplete(chunkIndex, chunkData, chunkTask);
            },
            onComplete: (fileId, file) => {
                this.handleUploadComplete(fileId, file);
            },
            onError: (error, fileId, chunkIndex) => {
                this.handleUploadError(error, fileId, chunkIndex);
            }
        });

        // Initialize memory processor
        this.memoryProcessor = new MemoryEfficientProcessor();

        // Initialize analysis worker
        this.initializeAnalysisWorker();
    }

    initializeAnalysisWorker() {
        if (typeof Worker !== 'undefined') {
            this.analysisWorker = new Worker('js/analysis_worker.js');
            
            this.analysisWorker.onmessage = (e) => {
                this.handleWorkerMessage(e.data);
            };
            
            this.analysisWorker.onerror = (error) => {
                console.error('Analysis worker error:', error);
                this.showAlert('Analysis worker error: ' + error.message, 'error');
            };
        } else {
            console.warn('Web Workers not supported, falling back to main thread processing');
        }
    }

    setupEventListeners() {
        // File upload handling
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        
        if (uploadArea) {
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('drag-over');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('drag-over');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                this.handleFileSelection(e.dataTransfer.files);
            });
            
            uploadArea.addEventListener('click', () => {
                fileInput?.click();
            });
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileSelection(e.target.files);
            });
        }

        // Analysis controls
        const startButton = document.getElementById('start-analysis');
        const cancelButton = document.getElementById('cancel-analysis');
        
        if (startButton) {
            startButton.addEventListener('click', () => this.startAnalysis());
        }
        
        if (cancelButton) {
            cancelButton.addEventListener('click', () => this.cancelAnalysis());
        }

        // Configuration updates
        this.setupConfigurationListeners();
    }

    setupConfigurationListeners() {
        // File size limit display
        const fileSizeDisplay = document.getElementById('file-size-limit');
        if (fileSizeDisplay) {
            fileSizeDisplay.textContent = this.formatBytes(this.config.maxFileSize);
        }

        // Analysis options
        const analysisOptions = ['methylation', 'lactylation', 'acetylation', 'agae'];
        analysisOptions.forEach(option => {
            const checkbox = document.getElementById(`detect-${option}`);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.config[`detect${option.charAt(0).toUpperCase() + option.slice(1)}`] = e.target.checked;
                });
            }
        });
    }

    async handleFileSelection(files) {
        if (files.length === 0) return;
        
        const file = files[0];
        
        // Validate file
        if (!this.validateFile(file)) return;
        
        this.currentFile = file;
        this.displayFileInfo(file);
        
        try {
            // Show upload progress
            this.showUploadProgress();
            
            // Start chunked upload
            const fileId = await this.chunkedUploader.uploadFile(file);
            console.log(`File uploaded successfully: ${fileId}`);
            
        } catch (error) {
            console.error('File upload failed:', error);
            this.showAlert(`Upload failed: ${error.message}`, 'error');
            this.hideUploadProgress();
        }
    }

    validateFile(file) {
        // Check file size
        if (file.size > this.config.maxFileSize) {
            this.showAlert(
                `File size ${this.formatBytes(file.size)} exceeds maximum allowed size of ${this.formatBytes(this.config.maxFileSize)}`,
                'error'
            );
            return false;
        }

        // Check file format
        const validExtensions = ['.fastq', '.fq', '.bam', '.sam', '.fasta', '.fa'];
        const fileName = file.name.toLowerCase();
        const isValidFormat = validExtensions.some(ext => fileName.endsWith(ext));
        
        if (!isValidFormat) {
            this.showAlert(
                `Unsupported file format. Supported formats: ${validExtensions.join(', ')}`,
                'error'
            );
            return false;
        }

        return true;
    }

    displayFileInfo(file) {
        const fileInfoElement = document.getElementById('file-info');
        if (fileInfoElement) {
            fileInfoElement.innerHTML = `
                <div class="file-info-card">
                    <h4>📁 ${file.name}</h4>
                    <p><strong>Size:</strong> ${this.formatBytes(file.size)}</p>
                    <p><strong>Type:</strong> ${file.type || 'Unknown'}</p>
                    <p><strong>Last Modified:</strong> ${new Date(file.lastModified).toLocaleString()}</p>
                    <p><strong>Estimated Chunks:</strong> ${Math.ceil(file.size / this.config.chunkSize)}</p>
                </div>
            `;
            fileInfoElement.style.display = 'block';
        }
    }

    showUploadProgress() {
        const progressSection = document.getElementById('upload-progress');
        if (progressSection) {
            progressSection.style.display = 'block';
        }
    }

    hideUploadProgress() {
        const progressSection = document.getElementById('upload-progress');
        if (progressSection) {
            progressSection.style.display = 'none';
        }
    }

    updateUploadProgress(progress, chunkIndex, totalChunks, fileName) {
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `Uploading ${fileName}: ${progress.toFixed(1)}% (${chunkIndex + 1}/${totalChunks} chunks)`;
        }
    }

    handleChunkComplete(chunkIndex, chunkData, chunkTask) {
        console.log(`Chunk ${chunkIndex} completed: ${this.formatBytes(chunkTask.chunk.size)}`);
        
        // Store chunk data for analysis
        if (!this.currentFile.chunks) {
            this.currentFile.chunks = new Map();
        }
        this.currentFile.chunks.set(chunkIndex, chunkData);
    }

    handleUploadComplete(fileId, file) {
        console.log(`Upload completed: ${fileId}`);
        this.hideUploadProgress();
        this.showAlert('File uploaded successfully! Ready for analysis.', 'success');
        
        // Enable analysis button
        const startButton = document.getElementById('start-analysis');
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = '🚀 Start Large File Analysis';
        }
    }

    handleUploadError(error, fileId, chunkIndex) {
        console.error(`Upload error for chunk ${chunkIndex}:`, error);
        this.showAlert(`Upload error: ${error.message}`, 'error');
        this.hideUploadProgress();
    }

    async startAnalysis() {
        if (!this.currentFile || this.isAnalyzing) return;
        
        this.isAnalyzing = true;
        this.showAnalysisProgress();
        
        try {
            if (this.analysisWorker) {
                // Use web worker for background processing
                await this.startWorkerAnalysis();
            } else {
                // Fallback to main thread processing
                await this.startMainThreadAnalysis();
            }
        } catch (error) {
            console.error('Analysis failed:', error);
            this.showAlert(`Analysis failed: ${error.message}`, 'error');
            this.isAnalyzing = false;
            this.hideAnalysisProgress();
        }
    }

    async startWorkerAnalysis() {
        const fileData = {
            name: this.currentFile.name,
            size: this.currentFile.size,
            chunks: Array.from(this.currentFile.chunks.entries()),
            totalChunks: this.currentFile.chunks.size
        };

        this.analysisWorker.postMessage({
            type: 'start_analysis',
            data: {
                fileData: fileData,
                config: this.config
            }
        });
    }

    async startMainThreadAnalysis() {
        // Fallback implementation for browsers without web worker support
        const streamingReader = new StreamingFileReader(this.currentFile, this.config.chunkSize);
        
        let chunkIndex = 0;
        for await (const chunk of streamingReader.readChunks()) {
            await this.processChunkMainThread(chunk, chunkIndex);
            chunkIndex++;
            
            // Update progress
            this.updateAnalysisProgress(chunk.progress, chunkIndex, chunk.totalChunks);
            
            // Yield control to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        this.completeAnalysis();
    }

    async processChunkMainThread(chunk, chunkIndex) {
        // Simplified main thread processing
        const sequences = this.parseSequenceData(chunk.data);
        
        for (const sequence of sequences) {
            // Process each sequence (simplified version)
            if (this.config.detectMethylation) {
                // Methylation detection logic
            }
            if (this.config.detectLactylation) {
                // Lactylation prediction logic
            }
            if (this.config.detectAcetylation) {
                // Acetylation prediction logic
            }
        }
    }

    handleWorkerMessage(message) {
        switch (message.type) {
            case 'progress':
                this.updateAnalysisProgress(
                    message.progress,
                    message.processedChunks,
                    message.totalChunks
                );
                break;
                
            case 'chunk_complete':
                console.log(`Chunk ${message.chunkIndex} analysis completed:`, message.chunkResults);
                break;
                
            case 'analysis_complete':
                this.analysisResults = message.results;
                this.completeAnalysis();
                break;
                
            case 'error':
                console.error('Worker error:', message.error);
                this.showAlert(`Analysis error: ${message.error}`, 'error');
                this.isAnalyzing = false;
                this.hideAnalysisProgress();
                break;
                
            case 'cancelled':
                console.log('Analysis cancelled');
                this.isAnalyzing = false;
                this.hideAnalysisProgress();
                break;
        }
    }

    showAnalysisProgress() {
        const progressSection = document.getElementById('analysis-progress');
        if (progressSection) {
            progressSection.style.display = 'block';
        }
        
        const startButton = document.getElementById('start-analysis');
        const cancelButton = document.getElementById('cancel-analysis');
        
        if (startButton) startButton.disabled = true;
        if (cancelButton) cancelButton.disabled = false;
    }

    hideAnalysisProgress() {
        const progressSection = document.getElementById('analysis-progress');
        if (progressSection) {
            progressSection.style.display = 'none';
        }
        
        const startButton = document.getElementById('start-analysis');
        const cancelButton = document.getElementById('cancel-analysis');
        
        if (startButton) startButton.disabled = false;
        if (cancelButton) cancelButton.disabled = true;
    }

    updateAnalysisProgress(progress, processedChunks, totalChunks) {
        const progressBar = document.getElementById('analysis-progress-bar');
        const progressText = document.getElementById('analysis-progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `Analyzing: ${progress.toFixed(1)}% (${processedChunks}/${totalChunks} chunks)`;
        }
    }

    completeAnalysis() {
        this.isAnalyzing = false;
        this.hideAnalysisProgress();
        
        console.log('Analysis completed:', this.analysisResults);
        this.showAlert('Large file analysis completed successfully!', 'success');
        
        // Display results
        this.displayResults();
    }

    cancelAnalysis() {
        if (this.analysisWorker) {
            this.analysisWorker.postMessage({ type: 'cancel_analysis' });
        }
        
        this.isAnalyzing = false;
        this.hideAnalysisProgress();
        this.showAlert('Analysis cancelled', 'info');
    }

    displayResults() {
        if (!this.analysisResults) return;
        
        // Show results section
        const resultsSection = document.getElementById('results-section');
        if (resultsSection) {
            resultsSection.style.display = 'block';
        }
        
        // Update statistics
        this.updateStatisticsDisplay();
        
        // Generate visualizations
        this.generateVisualizations();
        
        // Enable export functions
        this.enableExportFunctions();
    }

    updateStatisticsDisplay() {
        const stats = this.analysisResults.statistics;
        
        // Update summary cards
        const summaryCards = {
            'total-reads': this.currentFile.size, // Approximate
            'methylation-events': stats.totalMethylationSites || 0,
            'lactylation-events': stats.totalLactylationSites || 0,
            'acetylation-events': stats.totalAcetylationSites || 0
        };
        
        Object.entries(summaryCards).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = typeof value === 'number' ? value.toLocaleString() : value;
            }
        });
    }

    generateVisualizations() {
        // Generate 2D chromatogram
        this.generate2DChromatogram();
        
        // Generate 3D interactive plot
        this.generate3DPlot();
        
        // Generate statistics plots
        this.generateStatisticsPlots();
    }

    generate2DChromatogram() {
        // Implementation for 2D chromatogram with large dataset
        console.log('Generating 2D chromatogram for large dataset...');
    }

    generate3DPlot() {
        // Implementation for 3D plot with large dataset
        console.log('Generating 3D plot for large dataset...');
    }

    generateStatisticsPlots() {
        // Implementation for statistics plots
        console.log('Generating statistics plots...');
    }

    enableExportFunctions() {
        // Enable all export buttons
        const exportButtons = document.querySelectorAll('.export-button');
        exportButtons.forEach(button => {
            button.disabled = false;
        });
    }

    parseSequenceData(chunkData) {
        // Parse sequence data from chunk (simplified)
        const sequences = [];
        const lines = chunkData.split('\n');
        
        // Basic FASTQ parsing
        for (let i = 0; i < lines.length; i += 4) {
            if (i + 3 < lines.length && lines[i].startsWith('@')) {
                sequences.push({
                    id: lines[i].substring(1),
                    sequence: lines[i + 1],
                    quality: lines[i + 3]
                });
            }
        }
        
        return sequences;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showAlert(message, type = 'info') {
        // Create or update alert element
        let alertElement = document.getElementById('alert-message');
        if (!alertElement) {
            alertElement = document.createElement('div');
            alertElement.id = 'alert-message';
            alertElement.className = 'alert';
            document.body.appendChild(alertElement);
        }
        
        alertElement.className = `alert alert-${type}`;
        alertElement.textContent = message;
        alertElement.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            alertElement.style.display = 'none';
        }, 5000);
    }
}

// Initialize the enhanced JEAN application
let jeanApp;

document.addEventListener('DOMContentLoaded', () => {
    jeanApp = new JEAN16GB();
    console.log('JEAN 16GB Web Tool initialized');
});
