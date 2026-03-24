/**
 * JEAN Memory Management System
 * Optimized for large genomic datasets up to 16GB
 * Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
 */

class MemoryManager {
    constructor(options = {}) {
        this.maxMemoryUsage = options.maxMemoryUsage || 1024 * 1024 * 1024; // 1GB default
        this.chunkThreshold = options.chunkThreshold || 64 * 1024 * 1024; // 64MB
        this.compressionEnabled = options.compressionEnabled !== false;
        this.persistenceEnabled = options.persistenceEnabled !== false;
        
        this.memoryUsage = 0;
        this.dataCache = new Map();
        this.compressionCache = new Map();
        this.persistentStorage = new PersistentStorage();
        this.gcScheduler = new GarbageCollectionScheduler();
        
        this.initializeMemoryMonitoring();
    }

    initializeMemoryMonitoring() {
        // Monitor memory usage periodically
        setInterval(() => {
            this.checkMemoryUsage();
        }, 5000); // Check every 5 seconds

        // Listen for memory pressure events
        if ('memory' in performance) {
            this.monitorMemoryPressure();
        }
    }

    async storeData(key, data, options = {}) {
        const dataSize = this.estimateDataSize(data);
        
        // Check if we need to free memory
        if (this.memoryUsage + dataSize > this.maxMemoryUsage) {
            await this.freeMemory(dataSize);
        }

        // Determine storage strategy based on data size
        if (dataSize > this.chunkThreshold) {
            return await this.storeLargeData(key, data, options);
        } else {
            return await this.storeSmallData(key, data, options);
        }
    }

    async storeLargeData(key, data, options) {
        console.log(`Storing large data: ${key} (${this.formatBytes(this.estimateDataSize(data))})`);
        
        // Chunk large data
        const chunks = this.chunkData(data, options.chunkSize || this.chunkThreshold);
        const chunkKeys = [];
        
        for (let i = 0; i < chunks.length; i++) {
            const chunkKey = `${key}_chunk_${i}`;
            const chunk = chunks[i];
            
            // Compress chunk if enabled
            const processedChunk = this.compressionEnabled ? 
                await this.compressData(chunk) : chunk;
            
            // Store in appropriate location
            if (this.shouldPersist(processedChunk)) {
                await this.persistentStorage.store(chunkKey, processedChunk);
            } else {
                this.dataCache.set(chunkKey, {
                    data: processedChunk,
                    timestamp: Date.now(),
                    size: this.estimateDataSize(processedChunk),
                    compressed: this.compressionEnabled
                });
                this.memoryUsage += this.estimateDataSize(processedChunk);
            }
            
            chunkKeys.push(chunkKey);
        }
        
        // Store metadata
        const metadata = {
            type: 'chunked',
            chunkKeys: chunkKeys,
            originalSize: this.estimateDataSize(data),
            chunkCount: chunks.length,
            compressed: this.compressionEnabled
        };
        
        this.dataCache.set(key, {
            data: metadata,
            timestamp: Date.now(),
            size: this.estimateDataSize(metadata),
            isMetadata: true
        });
        
        return key;
    }

    async storeSmallData(key, data, options) {
        const processedData = this.compressionEnabled && this.shouldCompress(data) ? 
            await this.compressData(data) : data;
        
        this.dataCache.set(key, {
            data: processedData,
            timestamp: Date.now(),
            size: this.estimateDataSize(processedData),
            compressed: this.compressionEnabled && this.shouldCompress(data)
        });
        
        this.memoryUsage += this.estimateDataSize(processedData);
        return key;
    }

    async retrieveData(key) {
        const cacheEntry = this.dataCache.get(key);
        
        if (!cacheEntry) {
            // Try persistent storage
            const persistentData = await this.persistentStorage.retrieve(key);
            if (persistentData) {
                return this.compressionEnabled ? 
                    await this.decompressData(persistentData) : persistentData;
            }
            return null;
        }
        
        // Update access timestamp
        cacheEntry.timestamp = Date.now();
        
        // Handle chunked data
        if (cacheEntry.isMetadata && cacheEntry.data.type === 'chunked') {
            return await this.retrieveChunkedData(cacheEntry.data);
        }
        
        // Handle regular data
        const data = cacheEntry.compressed ? 
            await this.decompressData(cacheEntry.data) : cacheEntry.data;
        
        return data;
    }

    async retrieveChunkedData(metadata) {
        const chunks = [];
        
        for (const chunkKey of metadata.chunkKeys) {
            const chunk = await this.retrieveData(chunkKey);
            if (chunk) {
                chunks.push(chunk);
            }
        }
        
        return this.mergeChunks(chunks);
    }

    chunkData(data, chunkSize) {
        const chunks = [];
        
        if (typeof data === 'string') {
            // String chunking
            for (let i = 0; i < data.length; i += chunkSize) {
                chunks.push(data.slice(i, i + chunkSize));
            }
        } else if (Array.isArray(data)) {
            // Array chunking
            const itemsPerChunk = Math.ceil(chunkSize / this.estimateDataSize(data[0] || {}));
            for (let i = 0; i < data.length; i += itemsPerChunk) {
                chunks.push(data.slice(i, i + itemsPerChunk));
            }
        } else if (data instanceof ArrayBuffer) {
            // Binary data chunking
            for (let i = 0; i < data.byteLength; i += chunkSize) {
                chunks.push(data.slice(i, i + chunkSize));
            }
        } else {
            // Object chunking (convert to JSON and chunk)
            const jsonString = JSON.stringify(data);
            return this.chunkData(jsonString, chunkSize);
        }
        
        return chunks;
    }

    mergeChunks(chunks) {
        if (chunks.length === 0) return null;
        
        const firstChunk = chunks[0];
        
        if (typeof firstChunk === 'string') {
            return chunks.join('');
        } else if (Array.isArray(firstChunk)) {
            return chunks.flat();
        } else if (firstChunk instanceof ArrayBuffer) {
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
            const merged = new ArrayBuffer(totalLength);
            const view = new Uint8Array(merged);
            let offset = 0;
            
            for (const chunk of chunks) {
                view.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }
            
            return merged;
        }
        
        return chunks;
    }

    async compressData(data) {
        if (!this.compressionEnabled) return data;
        
        try {
            // Use CompressionStream if available (modern browsers)
            if (typeof CompressionStream !== 'undefined') {
                return await this.compressWithStream(data);
            } else {
                // Fallback to simple compression
                return await this.compressSimple(data);
            }
        } catch (error) {
            console.warn('Compression failed, storing uncompressed:', error);
            return data;
        }
    }

    async compressWithStream(data) {
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();
        
        // Convert data to Uint8Array
        const encoder = new TextEncoder();
        const uint8Array = typeof data === 'string' ? 
            encoder.encode(data) : new Uint8Array(JSON.stringify(data));
        
        writer.write(uint8Array);
        writer.close();
        
        const chunks = [];
        let done = false;
        
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) chunks.push(value);
        }
        
        return new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []));
    }

    async compressSimple(data) {
        // Simple LZ-style compression for fallback
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        const compressed = this.lzCompress(str);
        return compressed;
    }

    lzCompress(str) {
        const dict = {};
        let data = str.split('');
        let out = [];
        let currChar;
        let phrase = data[0];
        let code = 256;
        
        for (let i = 1; i < data.length; i++) {
            currChar = data[i];
            if (dict[phrase + currChar] != null) {
                phrase += currChar;
            } else {
                out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
                dict[phrase + currChar] = code;
                code++;
                phrase = currChar;
            }
        }
        out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
        
        return out;
    }

    async decompressData(compressedData) {
        if (!this.compressionEnabled) return compressedData;
        
        try {
            if (typeof DecompressionStream !== 'undefined' && compressedData instanceof Uint8Array) {
                return await this.decompressWithStream(compressedData);
            } else if (Array.isArray(compressedData)) {
                return this.lzDecompress(compressedData);
            }
        } catch (error) {
            console.warn('Decompression failed:', error);
        }
        
        return compressedData;
    }

    async decompressWithStream(compressedData) {
        const stream = new DecompressionStream('gzip');
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();
        
        writer.write(compressedData);
        writer.close();
        
        const chunks = [];
        let done = false;
        
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) chunks.push(value);
        }
        
        const decoder = new TextDecoder();
        return decoder.decode(new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], [])));
    }

    lzDecompress(compressed) {
        const dict = {};
        let data = compressed;
        let currChar = String.fromCharCode(data[0]);
        let oldPhrase = currChar;
        let out = [currChar];
        let code = 256;
        let phrase;
        
        for (let i = 1; i < data.length; i++) {
            let currCode = data[i];
            if (currCode < 256) {
                phrase = String.fromCharCode(data[i]);
            } else {
                phrase = dict[currCode] ? dict[currCode] : (oldPhrase + currChar);
            }
            out.push(phrase);
            currChar = phrase.charAt(0);
            dict[code] = oldPhrase + currChar;
            code++;
            oldPhrase = phrase;
        }
        
        return out.join('');
    }

    shouldCompress(data) {
        const size = this.estimateDataSize(data);
        return size > 1024; // Compress data larger than 1KB
    }

    shouldPersist(data) {
        const size = this.estimateDataSize(data);
        return size > this.chunkThreshold || this.memoryUsage > this.maxMemoryUsage * 0.8;
    }

    async freeMemory(requiredSpace) {
        console.log(`Freeing memory: need ${this.formatBytes(requiredSpace)}, current usage: ${this.formatBytes(this.memoryUsage)}`);
        
        // Get entries sorted by last access time (LRU)
        const entries = Array.from(this.dataCache.entries())
            .filter(([key, entry]) => !entry.isMetadata)
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        let freedSpace = 0;
        
        for (const [key, entry] of entries) {
            if (freedSpace >= requiredSpace) break;
            
            // Move to persistent storage if possible
            if (this.persistenceEnabled && !entry.isMetadata) {
                await this.persistentStorage.store(key, entry.data);
            }
            
            // Remove from memory cache
            this.dataCache.delete(key);
            freedSpace += entry.size;
            this.memoryUsage -= entry.size;
        }
        
        // Force garbage collection if available
        this.gcScheduler.requestGC();
        
        console.log(`Freed ${this.formatBytes(freedSpace)} of memory`);
    }

    checkMemoryUsage() {
        if (this.memoryUsage > this.maxMemoryUsage * 0.9) {
            console.warn(`High memory usage: ${this.formatBytes(this.memoryUsage)} / ${this.formatBytes(this.maxMemoryUsage)}`);
            this.freeMemory(this.maxMemoryUsage * 0.2); // Free 20% of max memory
        }
    }

    monitorMemoryPressure() {
        if ('memory' in performance && 'addEventListener' in performance.memory) {
            performance.memory.addEventListener('memorypressure', () => {
                console.warn('Memory pressure detected, freeing memory');
                this.freeMemory(this.maxMemoryUsage * 0.3);
            });
        }
    }

    estimateDataSize(data) {
        if (data === null || data === undefined) return 0;
        
        if (typeof data === 'string') {
            return data.length * 2; // UTF-16 encoding
        } else if (typeof data === 'number') {
            return 8; // 64-bit number
        } else if (typeof data === 'boolean') {
            return 1;
        } else if (data instanceof ArrayBuffer) {
            return data.byteLength;
        } else if (data instanceof Uint8Array) {
            return data.byteLength;
        } else if (Array.isArray(data)) {
            return data.reduce((sum, item) => sum + this.estimateDataSize(item), 0) + (data.length * 8);
        } else if (typeof data === 'object') {
            return Object.keys(data).reduce((sum, key) => {
                return sum + this.estimateDataSize(key) + this.estimateDataSize(data[key]);
            }, 0) + 32; // Object overhead
        }
        
        return 32; // Default estimate
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getMemoryStats() {
        return {
            currentUsage: this.memoryUsage,
            maxUsage: this.maxMemoryUsage,
            utilizationPercent: (this.memoryUsage / this.maxMemoryUsage) * 100,
            cacheEntries: this.dataCache.size,
            compressionEnabled: this.compressionEnabled,
            persistenceEnabled: this.persistenceEnabled
        };
    }

    clear() {
        this.dataCache.clear();
        this.compressionCache.clear();
        this.memoryUsage = 0;
        this.persistentStorage.clear();
    }
}

class PersistentStorage {
    constructor() {
        this.dbName = 'JEAN_LargeFileStorage';
        this.dbVersion = 1;
        this.db = null;
        this.initializeDB();
    }

    async initializeDB() {
        if (!('indexedDB' in window)) {
            console.warn('IndexedDB not supported, persistent storage disabled');
            return;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('chunks')) {
                    db.createObjectStore('chunks', { keyPath: 'key' });
                }
            };
        });
    }

    async store(key, data) {
        if (!this.db) await this.initializeDB();
        if (!this.db) return false;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chunks'], 'readwrite');
            const store = transaction.objectStore('chunks');
            
            const request = store.put({
                key: key,
                data: data,
                timestamp: Date.now()
            });
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async retrieve(key) {
        if (!this.db) await this.initializeDB();
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chunks'], 'readonly');
            const store = transaction.objectStore('chunks');
            
            const request = store.get(key);
            
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.data : null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async clear() {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chunks'], 'readwrite');
            const store = transaction.objectStore('chunks');
            
            const request = store.clear();
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

class GarbageCollectionScheduler {
    constructor() {
        this.gcRequested = false;
        this.gcInterval = 30000; // 30 seconds
        this.setupGCScheduler();
    }

    setupGCScheduler() {
        setInterval(() => {
            if (this.gcRequested) {
                this.performGC();
                this.gcRequested = false;
            }
        }, this.gcInterval);
    }

    requestGC() {
        this.gcRequested = true;
    }

    performGC() {
        // Force garbage collection if available
        if (window.gc) {
            window.gc();
            console.log('Garbage collection performed');
        } else {
            // Trigger GC indirectly
            const dummy = new Array(1000000).fill(0);
            dummy.length = 0;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MemoryManager,
        PersistentStorage,
        GarbageCollectionScheduler
    };
}
