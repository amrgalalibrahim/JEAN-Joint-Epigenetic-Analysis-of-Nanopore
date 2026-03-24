/**
 * JEAN Chunked File Upload Handler
 * Supports files up to 16GB with streaming processing
 * Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
 */

class ChunkedFileUploader {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 64 * 1024 * 1024; // 64MB chunks
        this.maxFileSize = options.maxFileSize || 16 * 1024 * 1024 * 1024; // 16GB
        this.concurrentChunks = options.concurrentChunks || 3;
        this.retryAttempts = options.retryAttempts || 3;
        this.onProgress = options.onProgress || (() => {});
        this.onChunkComplete = options.onChunkComplete || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onError = options.onError || (() => {});
        
        this.uploadQueue = [];
        this.activeUploads = new Map();
        this.completedChunks = new Set();
        this.failedChunks = new Map();
    }

    async uploadFile(file) {
        if (file.size > this.maxFileSize) {
            throw new Error(`File size ${this.formatBytes(file.size)} exceeds maximum allowed size of ${this.formatBytes(this.maxFileSize)}`);
        }

        const fileId = this.generateFileId(file);
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        
        console.log(`Starting chunked upload for ${file.name} (${this.formatBytes(file.size)}) in ${totalChunks} chunks`);
        
        // Initialize upload tracking
        this.completedChunks.clear();
        this.failedChunks.clear();
        this.uploadQueue = [];
        
        // Create chunk upload tasks
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * this.chunkSize;
            const end = Math.min(start + this.chunkSize, file.size);
            const chunk = file.slice(start, end);
            
            this.uploadQueue.push({
                fileId,
                chunkIndex,
                chunk,
                start,
                end,
                totalChunks,
                fileName: file.name,
                fileSize: file.size
            });
        }

        // Start concurrent chunk uploads
        const uploadPromises = [];
        for (let i = 0; i < Math.min(this.concurrentChunks, this.uploadQueue.length); i++) {
            uploadPromises.push(this.processUploadQueue());
        }

        try {
            await Promise.all(uploadPromises);
            
            if (this.completedChunks.size === totalChunks) {
                console.log(`Upload completed successfully: ${file.name}`);
                this.onComplete(fileId, file);
                return fileId;
            } else {
                throw new Error(`Upload incomplete: ${this.completedChunks.size}/${totalChunks} chunks completed`);
            }
        } catch (error) {
            console.error('Upload failed:', error);
            this.onError(error, fileId);
            throw error;
        }
    }

    async processUploadQueue() {
        while (this.uploadQueue.length > 0) {
            const chunkTask = this.uploadQueue.shift();
            if (!chunkTask) break;

            try {
                await this.uploadChunk(chunkTask);
            } catch (error) {
                console.error(`Chunk ${chunkTask.chunkIndex} failed:`, error);
                this.handleChunkFailure(chunkTask, error);
            }
        }
    }

    async uploadChunk(chunkTask) {
        const { fileId, chunkIndex, chunk, totalChunks, fileName } = chunkTask;
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const chunkData = event.target.result;
                    
                    // Simulate chunk processing (in real implementation, this would be sent to server)
                    setTimeout(() => {
                        this.completedChunks.add(chunkIndex);
                        
                        const progress = (this.completedChunks.size / totalChunks) * 100;
                        this.onProgress(progress, chunkIndex, totalChunks, fileName);
                        this.onChunkComplete(chunkIndex, chunkData, chunkTask);
                        
                        resolve(chunkData);
                    }, 50 + Math.random() * 100); // Simulate network delay
                    
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error(`Failed to read chunk ${chunkIndex}`));
            reader.readAsArrayBuffer(chunk);
        });
    }

    handleChunkFailure(chunkTask, error) {
        const { chunkIndex } = chunkTask;
        const attempts = this.failedChunks.get(chunkIndex) || 0;
        
        if (attempts < this.retryAttempts) {
            this.failedChunks.set(chunkIndex, attempts + 1);
            console.log(`Retrying chunk ${chunkIndex} (attempt ${attempts + 1}/${this.retryAttempts})`);
            
            // Add back to queue for retry
            setTimeout(() => {
                this.uploadQueue.unshift(chunkTask);
            }, 1000 * Math.pow(2, attempts)); // Exponential backoff
        } else {
            console.error(`Chunk ${chunkIndex} failed after ${this.retryAttempts} attempts`);
            this.onError(error, chunkTask.fileId, chunkIndex);
        }
    }

    generateFileId(file) {
        return `${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    cancel() {
        this.uploadQueue = [];
        this.activeUploads.clear();
        console.log('Upload cancelled');
    }

    getProgress() {
        const totalChunks = this.uploadQueue.length + this.completedChunks.size;
        return totalChunks > 0 ? (this.completedChunks.size / totalChunks) * 100 : 0;
    }
}

// Streaming File Reader for large files
class StreamingFileReader {
    constructor(file, chunkSize = 64 * 1024 * 1024) {
        this.file = file;
        this.chunkSize = chunkSize;
        this.position = 0;
        this.totalChunks = Math.ceil(file.size / chunkSize);
        this.currentChunk = 0;
    }

    async *readChunks() {
        while (this.position < this.file.size) {
            const end = Math.min(this.position + this.chunkSize, this.file.size);
            const chunk = this.file.slice(this.position, end);
            
            const chunkData = await this.readChunkAsText(chunk);
            
            yield {
                data: chunkData,
                chunkIndex: this.currentChunk,
                totalChunks: this.totalChunks,
                start: this.position,
                end: end,
                size: chunk.size,
                progress: ((this.currentChunk + 1) / this.totalChunks) * 100
            };
            
            this.position = end;
            this.currentChunk++;
        }
    }

    async readChunkAsText(chunk) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read chunk'));
            reader.readAsText(chunk);
        });
    }

    async readChunkAsArrayBuffer(chunk) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read chunk'));
            reader.readAsArrayBuffer(chunk);
        });
    }

    reset() {
        this.position = 0;
        this.currentChunk = 0;
    }
}

// Memory-efficient data processor
class MemoryEfficientProcessor {
    constructor() {
        this.processedData = new Map();
        this.tempStorage = new Map();
        this.memoryThreshold = 512 * 1024 * 1024; // 512MB threshold
        this.currentMemoryUsage = 0;
    }

    async processChunk(chunkData, chunkIndex, processingFunction) {
        try {
            // Check memory usage
            if (this.currentMemoryUsage > this.memoryThreshold) {
                await this.flushTempStorage();
            }

            const result = await processingFunction(chunkData, chunkIndex);
            
            // Store result efficiently
            this.tempStorage.set(chunkIndex, result);
            this.currentMemoryUsage += this.estimateSize(result);
            
            return result;
        } catch (error) {
            console.error(`Error processing chunk ${chunkIndex}:`, error);
            throw error;
        }
    }

    async flushTempStorage() {
        console.log('Flushing temporary storage to manage memory usage');
        
        // Move data to more permanent storage or process it
        for (const [chunkIndex, data] of this.tempStorage) {
            this.processedData.set(chunkIndex, this.compressData(data));
        }
        
        this.tempStorage.clear();
        this.currentMemoryUsage = 0;
        
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
        }
    }

    compressData(data) {
        // Simple compression strategy - in real implementation, use proper compression
        if (typeof data === 'string') {
            return {
                type: 'compressed_string',
                length: data.length,
                sample: data.substring(0, 100) // Keep sample for verification
            };
        }
        return data;
    }

    estimateSize(obj) {
        // Rough estimation of object size in bytes
        const jsonString = JSON.stringify(obj);
        return new Blob([jsonString]).size;
    }

    getProcessedData() {
        return this.processedData;
    }

    clear() {
        this.processedData.clear();
        this.tempStorage.clear();
        this.currentMemoryUsage = 0;
    }
}

// Export classes for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ChunkedFileUploader,
        StreamingFileReader,
        MemoryEfficientProcessor
    };
}
