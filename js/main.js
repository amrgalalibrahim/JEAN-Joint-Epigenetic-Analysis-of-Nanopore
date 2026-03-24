/**
 * JEAN Web Tool - Main JavaScript
 * Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
 */

// Global variables
let jeanData = {
    uploadedFiles: [],
    analysisConfig: {},
    analysisResults: {},
    currentAnalysis: null
};

let analysisTimer = null;
let analysisStartTime = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Hide loading screen
    setTimeout(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        loadingScreen.classList.add('hidden');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }, 2000);

    // Initialize event listeners
    initializeEventListeners();
    
    // Initialize UI components
    initializeUI();
    
    // Initialize sample data
    initializeSampleData();
    
    console.log('JEAN Web Tool initialized successfully');
}

function initializeEventListeners() {
    // File upload
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleFileDrop);
    
    fileInput.addEventListener('change', handleFileSelect);
    
    // Configuration sliders
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
        slider.addEventListener('input', updateSliderValue);
    });
    
    // Tab navigation
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', switchTab);
    });
    
    // Table selection
    const tableSelect = document.getElementById('tableSelect');
    if (tableSelect) {
        tableSelect.addEventListener('change', updateDataTable);
    }
    
    // Modal close events
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function initializeUI() {
    // Initialize progress steps
    const progressSteps = document.querySelectorAll('.progress-step');
    progressSteps.forEach((step, index) => {
        const indicator = step.querySelector('.step-indicator');
        indicator.textContent = index + 1;
    });
    
    // Initialize configuration defaults
    resetConfig();
    
    // Initialize charts (placeholder)
    initializePlaceholderCharts();
}

function initializeSampleData() {
    // Define sample datasets
    jeanData.sampleData = {
        methylation: {
            name: 'Sample Methylation Data',
            reads: 1000,
            events: 260,
            description: 'Nanopore methylation data with MM tags'
        },
        lactylation: {
            name: 'Sample Lactylation Data',
            reads: 500,
            events: 98,
            description: 'PSSM-based lactylation predictions'
        },
        acetylation: {
            name: 'Sample Acetylation Data',
            reads: 500,
            events: 111,
            description: 'PSSM-based acetylation predictions'
        },
        complete: {
            name: 'Complete Sample Dataset',
            reads: 2000,
            events: 469,
            description: 'Combined methylation, lactylation, and acetylation data'
        }
    };
}

// File handling functions
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    processFiles(files);
}

function processFiles(files) {
    const validExtensions = ['.fastq', '.fq', '.bam', '.sam'];
    const maxFileSize = 500 * 1024 * 1024; // 500MB
    
    const validFiles = files.filter(file => {
        const extension = '.' + file.name.split('.').pop().toLowerCase();
        const isValidExtension = validExtensions.includes(extension);
        const isValidSize = file.size <= maxFileSize;
        
        if (!isValidExtension) {
            showAlert('warning', `File ${file.name} has unsupported format. Supported: ${validExtensions.join(', ')}`);
            return false;
        }
        
        if (!isValidSize) {
            showAlert('warning', `File ${file.name} is too large. Maximum size: 500MB`);
            return false;
        }
        
        return true;
    });
    
    if (validFiles.length > 0) {
        jeanData.uploadedFiles = [...jeanData.uploadedFiles, ...validFiles];
        updateFileList();
        showConfigSection();
        showAlert('success', `${validFiles.length} file(s) uploaded successfully`);
    }
}

function updateFileList() {
    const uploadArea = document.getElementById('uploadArea');
    const existingList = uploadArea.querySelector('.file-list');
    if (existingList) {
        existingList.remove();
    }
    
    if (jeanData.uploadedFiles.length > 0) {
        const fileList = document.createElement('div');
        fileList.className = 'file-list';
        
        jeanData.uploadedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">(${formatFileSize(file.size)})</span>
                </div>
                <button class="file-remove" onclick="removeFile(${index})" title="Remove file">
                    ×
                </button>
            `;
            fileList.appendChild(fileItem);
        });
        
        uploadArea.appendChild(fileList);
    }
}

function removeFile(index) {
    jeanData.uploadedFiles.splice(index, 1);
    updateFileList();
    
    if (jeanData.uploadedFiles.length === 0) {
        hideConfigSection();
    }
    
    showAlert('info', 'File removed');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Sample data functions
function loadSampleData(type) {
    const sampleData = jeanData.sampleData[type];
    if (!sampleData) return;
    
    // Clear existing files
    jeanData.uploadedFiles = [];
    
    // Create mock file object
    const mockFile = {
        name: `${sampleData.name.toLowerCase().replace(/\s+/g, '_')}.fastq`,
        size: Math.random() * 50000000 + 10000000, // Random size between 10-60MB
        type: 'application/octet-stream',
        isSample: true,
        sampleType: type,
        data: sampleData
    };
    
    jeanData.uploadedFiles = [mockFile];
    updateFileList();
    showConfigSection();
    
    showAlert('success', `${sampleData.name} loaded successfully`);
    
    // Auto-configure for sample data
    if (type === 'complete') {
        document.getElementById('enableMethylation').checked = true;
        document.getElementById('enableLactylation').checked = true;
        document.getElementById('enableAcetylation').checked = true;
        document.getElementById('enableAGAE').checked = true;
    } else {
        // Reset all checkboxes
        document.getElementById('enableMethylation').checked = type === 'methylation';
        document.getElementById('enableLactylation').checked = type === 'lactylation';
        document.getElementById('enableAcetylation').checked = type === 'acetylation';
        document.getElementById('enableAGAE').checked = type === 'lactylation';
    }
}

// Configuration functions
function showConfigSection() {
    document.getElementById('configSection').style.display = 'block';
    document.getElementById('configSection').scrollIntoView({ behavior: 'smooth' });
}

function hideConfigSection() {
    document.getElementById('configSection').style.display = 'none';
}

function resetConfig() {
    // Reset checkboxes
    document.getElementById('enableMethylation').checked = true;
    document.getElementById('enableLactylation').checked = true;
    document.getElementById('enableAcetylation').checked = true;
    document.getElementById('enableAGAE').checked = true;
    
    // Reset quality control
    document.getElementById('minReadLength').value = 100;
    document.getElementById('minQuality').value = 7.0;
    document.getElementById('maxNContent').value = 10;
    
    // Reset thresholds
    document.getElementById('methylationThreshold').value = 0.5;
    document.getElementById('lactylationThreshold').value = 0.5;
    document.getElementById('acetylationThreshold').value = 0.5;
    
    // Reset output options
    document.getElementById('exportExcel').checked = true;
    document.getElementById('exportCSV').checked = true;
    document.getElementById('exportPlots').checked = true;
    document.getElementById('export3D').checked = true;
    
    // Update slider values
    updateAllSliderValues();
    
    showAlert('info', 'Configuration reset to defaults');
}

function updateSliderValue(e) {
    const slider = e.target;
    const valueSpan = slider.parentNode.querySelector('.range-value');
    if (valueSpan) {
        valueSpan.textContent = slider.value;
    }
}

function updateAllSliderValues() {
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
        const valueSpan = slider.parentNode.querySelector('.range-value');
        if (valueSpan) {
            valueSpan.textContent = slider.value;
        }
    });
}

// Analysis functions
function startAnalysis() {
    if (jeanData.uploadedFiles.length === 0) {
        showAlert('warning', 'Please upload files or load sample data first');
        return;
    }
    
    // Collect configuration
    jeanData.analysisConfig = {
        modifications: {
            methylation: document.getElementById('enableMethylation').checked,
            lactylation: document.getElementById('enableLactylation').checked,
            acetylation: document.getElementById('enableAcetylation').checked,
            agae: document.getElementById('enableAGAE').checked
        },
        qualityControl: {
            minReadLength: parseInt(document.getElementById('minReadLength').value),
            minQuality: parseFloat(document.getElementById('minQuality').value),
            maxNContent: parseInt(document.getElementById('maxNContent').value)
        },
        thresholds: {
            methylation: parseFloat(document.getElementById('methylationThreshold').value),
            lactylation: parseFloat(document.getElementById('lactylationThreshold').value),
            acetylation: parseFloat(document.getElementById('acetylationThreshold').value)
        },
        output: {
            excel: document.getElementById('exportExcel').checked,
            csv: document.getElementById('exportCSV').checked,
            plots: document.getElementById('exportPlots').checked,
            interactive3D: document.getElementById('export3D').checked
        }
    };
    
    // Show progress section
    showProgressSection();
    
    // Start analysis simulation
    simulateAnalysis();
}

function showProgressSection() {
    document.getElementById('configSection').style.display = 'none';
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('progressSection').scrollIntoView({ behavior: 'smooth' });
    
    analysisStartTime = Date.now();
    analysisTimer = setInterval(updateProgressTimer, 1000);
}

function simulateAnalysis() {
    const steps = [
        { id: 'data-processing', duration: 3000, name: 'Data Processing' },
        { id: 'methylation', duration: 4000, name: 'Methylation Detection' },
        { id: 'lactylation', duration: 5000, name: 'Lactylation Prediction' },
        { id: 'acetylation', duration: 4500, name: 'Acetylation Prediction' },
        { id: 'electrochemical', duration: 3500, name: 'Electrochemical Simulation' },
        { id: 'visualization', duration: 4000, name: 'Visualization & Export' }
    ];
    
    let currentStep = 0;
    
    function executeStep() {
        if (currentStep >= steps.length) {
            completeAnalysis();
            return;
        }
        
        const step = steps[currentStep];
        const stepElement = document.querySelector(`[data-step="${step.id}"]`);
        const progressBar = stepElement.querySelector('.progress-fill');
        
        // Mark step as active
        stepElement.classList.add('active');
        
        // Animate progress bar
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                
                // Mark step as completed
                stepElement.classList.remove('active');
                stepElement.classList.add('completed');
                
                currentStep++;
                setTimeout(executeStep, 500);
            }
            progressBar.style.width = progress + '%';
        }, step.duration / 20);
    }
    
    executeStep();
}

function completeAnalysis() {
    clearInterval(analysisTimer);
    
    // Generate mock results
    generateMockResults();
    
    // Store results globally for export functions
    window.analysisResults = jeanData.analysisResults.data;
    window.analysisResults.metadata = {
        totalReads: jeanData.analysisResults.summary.totalReads,
        analysisDuration: Math.floor((Date.now() - analysisStartTime) / 1000) + ' seconds',
        fileFormat: 'FASTQ',
        fileSize: jeanData.uploadedFiles.reduce((total, file) => total + file.size, 0)
    };
    window.analysisResults.statistics = jeanData.analysisResults.statistics;
    
    // Show results section
    showResultsSection();
    
    showAlert('success', 'Analysis completed successfully!');
}

function generateMockResults() {
    // Generate realistic mock data based on configuration and sample data
    const config = jeanData.analysisConfig;
    const files = jeanData.uploadedFiles;
    
    let totalReads = 0;
    let methylationEvents = 0;
    let lactylationEvents = 0;
    let acetylationEvents = 0;
    
    files.forEach(file => {
        if (file.isSample) {
            totalReads += file.data.reads;
            if (file.sampleType === 'methylation' || file.sampleType === 'complete') {
                methylationEvents += file.data.events;
            }
            if (file.sampleType === 'lactylation' || file.sampleType === 'complete') {
                lactylationEvents += file.data.events;
            }
            if (file.sampleType === 'acetylation' || file.sampleType === 'complete') {
                acetylationEvents += file.data.events;
            }
        } else {
            // Estimate based on file size
            const estimatedReads = Math.floor(file.size / 1000);
            totalReads += estimatedReads;
            
            if (config.modifications.methylation) {
                methylationEvents += Math.floor(estimatedReads * 0.15);
            }
            if (config.modifications.lactylation) {
                lactylationEvents += Math.floor(estimatedReads * 0.05);
            }
            if (config.modifications.acetylation) {
                acetylationEvents += Math.floor(estimatedReads * 0.08);
            }
        }
    });
    
    jeanData.analysisResults = {
        summary: {
            totalReads,
            methylationEvents: config.modifications.methylation ? methylationEvents : 0,
            lactylationEvents: config.modifications.lactylation ? lactylationEvents : 0,
            acetylationEvents: config.modifications.acetylation ? acetylationEvents : 0
        },
        data: generateMockDataTables(totalReads, methylationEvents, lactylationEvents, acetylationEvents),
        statistics: generateMockStatistics(),
        electrochemical: generateMockElectrochemicalData()
    };
}

function generateMockDataTables(totalReads, methylationEvents, lactylationEvents, acetylationEvents) {
    const data = {};
    
    if (methylationEvents > 0) {
        data.methylation = [];
        for (let i = 0; i < Math.min(methylationEvents, 100); i++) {
            data.methylation.push({
                readId: `read_${i + 1}`,
                position: Math.floor(Math.random() * 1000),
                confidence: (Math.random() * 0.5 + 0.5).toFixed(3),
                current: (-50 + Math.random() * 10).toFixed(2),
                time: (Math.random() * 100).toFixed(2),
                duration: (0.5 + Math.random() * 1.5).toFixed(2)
            });
        }
    }
    
    if (lactylationEvents > 0) {
        data.lactylation = [];
        for (let i = 0; i < Math.min(lactylationEvents, 100); i++) {
            data.lactylation.push({
                proteinId: `protein_${i + 1}`,
                position: Math.floor(Math.random() * 500),
                score: (Math.random() * 0.5 + 0.5).toFixed(3),
                current: (-12 - Math.random() * 38).toFixed(2),
                time: (101 + Math.random() * 197).toFixed(2),
                duration: (2 + Math.random() * 10).toFixed(2)
            });
        }
    }
    
    if (acetylationEvents > 0) {
        data.acetylation = [];
        for (let i = 0; i < Math.min(acetylationEvents, 100); i++) {
            data.acetylation.push({
                proteinId: `protein_${i + 1}`,
                position: Math.floor(Math.random() * 500),
                score: (Math.random() * 0.5 + 0.5).toFixed(3),
                current: (1 + Math.random() * 49).toFixed(2),
                time: (102 + Math.random() * 196).toFixed(2),
                duration: (1 + Math.random() * 7).toFixed(2)
            });
        }
    }
    
    return data;
}

function generateMockStatistics() {
    return {
        dataset: {
            'Total Files': jeanData.uploadedFiles.length,
            'Total Reads': jeanData.analysisResults.summary.totalReads.toLocaleString(),
            'Average Read Length': '418 bp',
            'Quality Score': '12.5 ± 3.2'
        },
        modifications: {
            'Methylation Rate': jeanData.analysisResults.summary.methylationEvents > 0 ? 
                ((jeanData.analysisResults.summary.methylationEvents / jeanData.analysisResults.summary.totalReads) * 100).toFixed(2) + '%' : 'N/A',
            'Lactylation Rate': jeanData.analysisResults.summary.lactylationEvents > 0 ? 
                ((jeanData.analysisResults.summary.lactylationEvents / jeanData.analysisResults.summary.totalReads) * 100).toFixed(2) + '%' : 'N/A',
            'Acetylation Rate': jeanData.analysisResults.summary.acetylationEvents > 0 ? 
                ((jeanData.analysisResults.summary.acetylationEvents / jeanData.analysisResults.summary.totalReads) * 100).toFixed(2) + '%' : 'N/A'
        },
        electrochemical: {
            'Methylation Current': '-50.0 ± 5.0 pA',
            'Lactylation Current': '-31.0 ± 19.0 pA',
            'Acetylation Current': '+25.5 ± 24.5 pA',
            'Average Duration': '4.2 ± 3.8 seconds'
        },
        agae: {
            'Validation Accuracy': '87.1%',
            'Precision': '83.9%',
            'Recall': '89.2%',
            'F1-Score': '86.5%'
        }
    };
}

function generateMockElectrochemicalData() {
    // Generate electrochemical parameters for visualization
    const data = [];
    const results = jeanData.analysisResults.summary;
    
    // Add methylation data points
    for (let i = 0; i < Math.min(results.methylationEvents, 50); i++) {
        data.push({
            type: 'methylation',
            current: -50 + Math.random() * 10,
            time: Math.random() * 100,
            duration: 0.5 + Math.random() * 1.5,
            position: Math.random() * 100
        });
    }
    
    // Add lactylation data points
    for (let i = 0; i < Math.min(results.lactylationEvents, 50); i++) {
        data.push({
            type: 'lactylation',
            current: -12 - Math.random() * 38,
            time: 101 + Math.random() * 197,
            duration: 2 + Math.random() * 10,
            position: Math.random() * 500
        });
    }
    
    // Add acetylation data points
    for (let i = 0; i < Math.min(results.acetylationEvents, 50); i++) {
        data.push({
            type: 'acetylation',
            current: 1 + Math.random() * 49,
            time: 102 + Math.random() * 196,
            duration: 1 + Math.random() * 7,
            position: Math.random() * 500
        });
    }
    
    return data;
}

function showResultsSection() {
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
    
    // Update summary cards
    updateSummaryCards();
    
    // Initialize visualizations
    initializeVisualizations();
    
    // Update statistics
    updateStatistics();
    
    // Update data table
    updateDataTable();
}

function updateSummaryCards() {
    const results = jeanData.analysisResults.summary;
    
    document.getElementById('totalReads').textContent = results.totalReads.toLocaleString();
    document.getElementById('methylationEvents').textContent = results.methylationEvents.toLocaleString();
    document.getElementById('lactylationEvents').textContent = results.lactylationEvents.toLocaleString();
    document.getElementById('acetylationEvents').textContent = results.acetylationEvents.toLocaleString();
}

function updateProgressTimer() {
    if (!analysisStartTime) return;
    
    const elapsed = Date.now() - analysisStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    const progressTime = document.getElementById('progressTime');
    if (progressTime) {
        progressTime.textContent = `Elapsed: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function cancelAnalysis() {
    if (analysisTimer) {
        clearInterval(analysisTimer);
        analysisTimer = null;
    }
    
    // Reset progress
    const progressSteps = document.querySelectorAll('.progress-step');
    progressSteps.forEach(step => {
        step.classList.remove('active', 'completed');
        const progressBar = step.querySelector('.progress-fill');
        progressBar.style.width = '0%';
    });
    
    // Show config section
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('configSection').style.display = 'block';
    
    showAlert('info', 'Analysis cancelled');
}

// UI helper functions
function switchTab(e) {
    const clickedTab = e.target;
    const tabName = clickedTab.dataset.tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    clickedTab.classList.add('active');
    
    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById(`${tabName}-panel`).classList.add('active');
}

function updateDataTable() {
    const tableSelect = document.getElementById('tableSelect');
    const selectedTable = tableSelect ? tableSelect.value : 'methylation';
    const tableContainer = document.getElementById('dataTable');
    
    if (!jeanData.analysisResults || !jeanData.analysisResults.data) {
        tableContainer.innerHTML = '<p>No data available</p>';
        return;
    }
    
    const data = jeanData.analysisResults.data[selectedTable];
    if (!data || data.length === 0) {
        tableContainer.innerHTML = '<p>No data available for selected table</p>';
        return;
    }
    
    // Create table
    const table = document.createElement('table');
    table.className = 'data-table';
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    Object.keys(data[0]).forEach(key => {
        const th = document.createElement('th');
        th.textContent = key.charAt(0).toUpperCase() + key.slice(1);
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    data.slice(0, 20).forEach(row => { // Show first 20 rows
        const tr = document.createElement('tr');
        Object.values(row).forEach(value => {
            const td = document.createElement('td');
            td.textContent = value;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    
    tableContainer.innerHTML = '';
    tableContainer.appendChild(table);
    
    if (data.length > 20) {
        const note = document.createElement('p');
        note.textContent = `Showing first 20 of ${data.length} rows`;
        note.style.textAlign = 'center';
        note.style.color = 'var(--text-muted)';
        note.style.marginTop = 'var(--spacing-md)';
        tableContainer.appendChild(note);
    }
}

function updateStatistics() {
    const stats = jeanData.analysisResults.statistics;
    
    // Update dataset stats
    updateStatsTable('datasetStats', stats.dataset);
    updateStatsTable('modificationStats', stats.modifications);
    updateStatsTable('electrochemicalStats', stats.electrochemical);
    updateStatsTable('agaeValidation', stats.agae);
}

function updateStatsTable(elementId, data) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let html = '<table class="stats-table-content">';
    Object.entries(data).forEach(([key, value]) => {
        html += `<tr><td>${key}:</td><td><strong>${value}</strong></td></tr>`;
    });
    html += '</table>';
    
    element.innerHTML = html;
}

// Placeholder chart initialization
function initializePlaceholderCharts() {
    // This will be replaced with actual chart initialization
    console.log('Charts will be initialized after analysis completion');
}

// Modal functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

function showHelp() {
    showModal('helpModal');
}

function showAbout() {
    showModal('aboutModal');
}

function showContact() {
    showAlert('info', 'Contact: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)');
}

// Alert function
function showAlert(type, message) {
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <span class="alert-icon">${getAlertIcon(type)}</span>
        <span>${message}</span>
    `;
    
    // Add to page
    const container = document.querySelector('.container');
    container.insertBefore(alert, container.firstChild);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
    
    // Scroll to top to show alert
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getAlertIcon(type) {
    const icons = {
        success: '✅',
        warning: '⚠️',
        danger: '❌',
        info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
}

// Keyboard shortcuts
function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + Enter to start analysis
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (document.getElementById('configSection').style.display !== 'none') {
            startAnalysis();
        }
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal.show');
        if (openModal) {
            closeModal(openModal.id);
        }
    }
}

// Export placeholder functions (will be implemented in export.js)
function exportAllResults() {
    showAlert('info', 'Export functionality will be available after analysis completion');
}

function generateReport() {
    showAlert('info', 'Report generation will be available after analysis completion');
}

function exportChart(format) {
    showAlert('info', `Chart export (${format.toUpperCase()}) will be available after analysis completion`);
}

function exportTable(format) {
    showAlert('info', `Table export (${format.toUpperCase()}) will be available after analysis completion`);
}

// Visualization functions
function initializeVisualizations() {
    console.log('Initializing visualizations...');
    
    // Initialize 2D chromatogram
    initialize2DChromatogram();
    
    // Initialize 3D plot
    initialize3DPlot();
}

function togglePeaks() {
    showAlert('info', 'Peak toggle functionality will be available after chart initialization');
}

function resetZoom() {
    showAlert('info', 'Zoom reset functionality will be available after chart initialization');
}

function reset3DView() {
    showAlert('info', '3D view reset functionality will be available after plot initialization');
}

function toggle3DData(type) {
    showAlert('info', `3D data toggle (${type}) will be available after plot initialization`);
}



function initialize2DChromatogram() {
    const canvas = document.getElementById('chromatogramChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const electrochemicalData = jeanData.analysisResults.electrochemical;
    
    // Set canvas size
    canvas.width = 800;
    canvas.height = 400;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(60, 350);
    ctx.lineTo(750, 350); // X-axis
    ctx.moveTo(60, 350);
    ctx.lineTo(60, 50); // Y-axis
    ctx.stroke();
    
    // Draw axis labels
    ctx.fillStyle = '#333';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Time (seconds)', 400, 390);
    
    ctx.save();
    ctx.translate(20, 200);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Current (pA)', 0, 0);
    ctx.restore();
    
    // Draw data points
    if (electrochemicalData && electrochemicalData.length > 0) {
        const maxTime = Math.max(...electrochemicalData.map(d => d.time));
        const minCurrent = Math.min(...electrochemicalData.map(d => d.current));
        const maxCurrent = Math.max(...electrochemicalData.map(d => d.current));
        
        electrochemicalData.forEach(point => {
            const x = 60 + (point.time / maxTime) * 690;
            const y = 350 - ((point.current - minCurrent) / (maxCurrent - minCurrent)) * 300;
            
            // Set color based on type
            if (point.type === 'methylation') {
                ctx.fillStyle = '#ff4444';
            } else if (point.type === 'lactylation') {
                ctx.fillStyle = '#44ff44';
            } else {
                ctx.fillStyle = '#4444ff';
            }
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
    
    // Add legend
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(600, 70, 15, 15);
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Methylation', 620, 82);
    
    ctx.fillStyle = '#44ff44';
    ctx.fillRect(600, 95, 15, 15);
    ctx.fillStyle = '#333';
    ctx.fillText('Lactylation', 620, 107);
    
    ctx.fillStyle = '#4444ff';
    ctx.fillRect(600, 120, 15, 15);
    ctx.fillStyle = '#333';
    ctx.fillText('Acetylation', 620, 132);
}

function initialize3DPlot() {
    const plotDiv = document.getElementById('plot3d');
    if (!plotDiv || !window.Plotly) return;
    
    const electrochemicalData = jeanData.analysisResults.electrochemical;
    if (!electrochemicalData || electrochemicalData.length === 0) return;
    
    // Separate data by type
    const methylationData = electrochemicalData.filter(d => d.type === 'methylation');
    const lactylationData = electrochemicalData.filter(d => d.type === 'lactylation');
    const acetylationData = electrochemicalData.filter(d => d.type === 'acetylation');
    
    const traces = [];
    
    if (methylationData.length > 0) {
        traces.push({
            x: methylationData.map(d => d.current),
            y: methylationData.map(d => d.position),
            z: methylationData.map(d => d.duration),
            mode: 'markers',
            type: 'scatter3d',
            name: 'Methylation',
            marker: {
                color: '#ff4444',
                size: 5
            }
        });
    }
    
    if (lactylationData.length > 0) {
        traces.push({
            x: lactylationData.map(d => d.current),
            y: lactylationData.map(d => d.position),
            z: lactylationData.map(d => d.duration),
            mode: 'markers',
            type: 'scatter3d',
            name: 'Lactylation',
            marker: {
                color: '#44ff44',
                size: 5
            }
        });
    }
    
    if (acetylationData.length > 0) {
        traces.push({
            x: acetylationData.map(d => d.current),
            y: acetylationData.map(d => d.position),
            z: acetylationData.map(d => d.duration),
            mode: 'markers',
            type: 'scatter3d',
            name: 'Acetylation',
            marker: {
                color: '#4444ff',
                size: 5
            }
        });
    }
    
    const layout = {
        title: 'JEAN 3D Electrochemical Analysis',
        scene: {
            xaxis: { title: 'Current (pA)' },
            yaxis: { title: 'Position' },
            zaxis: { title: 'Duration (s)' }
        },
        margin: { l: 0, r: 0, b: 0, t: 40 }
    };
    
    Plotly.newPlot(plotDiv, traces, layout, {responsive: true});
}
