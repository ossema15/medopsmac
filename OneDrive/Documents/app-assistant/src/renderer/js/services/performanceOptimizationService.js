/**
 * Performance Optimization Service
 * Provides caching, lazy loading, debouncing, and other performance optimizations
 */

class PerformanceOptimizationService {
  constructor() {
    this.cache = new Map();
    this.cacheConfig = {
      maxSize: 100,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      cleanupInterval: 60 * 1000 // 1 minute
    };
    
    this.debounceTimers = new Map();
    this.throttleTimers = new Map();
    this.intersectionObservers = new Map();
    this.resourceHints = new Set();
    
    // Performance metrics
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      renderTimes: [],
      memoryUsage: []
    };

    // Start cleanup interval
    this.startCleanupInterval();
    
    // Monitor performance
    this.startPerformanceMonitoring();
  }

  /**
   * Cache management
   */
  setCache(key, value, ttl = this.cacheConfig.defaultTTL) {
    const item = {
      value,
      timestamp: Date.now(),
      ttl,
      accessCount: 0
    };

    // Remove oldest items if cache is full
    if (this.cache.size >= this.cacheConfig.maxSize) {
      this.evictOldestItems();
    }

    this.cache.set(key, item);
  }

  getCache(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.metrics.cacheMisses++;
      return null;
    }

    // Check if item has expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.metrics.cacheMisses++;
      return null;
    }

    // Update access count and timestamp
    item.accessCount++;
    item.timestamp = Date.now();
    
    this.metrics.cacheHits++;
    return item.value;
  }

  clearCache(pattern = null) {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  evictOldestItems() {
    const items = Array.from(this.cache.entries());
    items.sort((a, b) => {
      // Sort by access count first, then by timestamp
      if (a[1].accessCount !== b[1].accessCount) {
        return a[1].accessCount - b[1].accessCount;
      }
      return a[1].timestamp - b[1].timestamp;
    });

    // Remove 20% of oldest items
    const toRemove = Math.ceil(items.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(items[i][0]);
    }
  }

  /**
   * Debouncing utility
   */
  debounce(key, func, delay = 300) {
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
    }

    const timer = setTimeout(() => {
      func();
      this.debounceTimers.delete(key);
    }, delay);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Throttling utility
   */
  throttle(key, func, delay = 300) {
    if (this.throttleTimers.has(key)) {
      return;
    }

    func();
    this.throttleTimers.set(key, true);

    setTimeout(() => {
      this.throttleTimers.delete(key);
    }, delay);
  }

  /**
   * Lazy loading for images and components
   */
  setupLazyLoading(selector, options = {}) {
    const {
      rootMargin = '50px',
      threshold = 0.1,
      placeholder = null,
      onLoad = null
    } = options;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target;
          
          if (element.tagName === 'IMG') {
            this.loadImage(element, placeholder, onLoad);
          } else {
            this.loadComponent(element, onLoad);
          }
          
          observer.unobserve(element);
        }
      });
    }, { rootMargin, threshold });

    const elements = document.querySelectorAll(selector);
    elements.forEach(element => observer.observe(element));

    return observer;
  }

  loadImage(imgElement, placeholder, onLoad) {
    const src = imgElement.dataset.src;
    if (!src) return;

    // Show placeholder if provided
    if (placeholder && !imgElement.src) {
      imgElement.src = placeholder;
    }

    // Load actual image
    const image = new Image();
    image.onload = () => {
      imgElement.src = src;
      imgElement.classList.add('loaded');
      if (onLoad) onLoad(imgElement);
    };
    image.onerror = () => {
      imgElement.classList.add('error');
      console.warn(`Failed to load image: ${src}`);
    };
    image.src = src;
  }

  loadComponent(element, onLoad) {
    const componentName = element.dataset.component;
    if (!componentName) return;

    // Dynamic import of component
    import(`../components/${componentName}.js`)
      .then(module => {
        const Component = module.default;
        // Render component
        if (onLoad) onLoad(element, Component);
      })
      .catch(error => {
        console.error(`Failed to load component: ${componentName}`, error);
      });
  }

  /**
   * Virtual scrolling for large lists
   */
  setupVirtualScrolling(container, items, options = {}) {
    const {
      itemHeight = 50,
      bufferSize = 5,
      renderItem = null
    } = options;

    if (!renderItem) {
      console.error('Virtual scrolling requires a renderItem function');
      return;
    }

    const containerHeight = container.clientHeight;
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const totalHeight = items.length * itemHeight;

    // Create scroll container
    const scrollContainer = document.createElement('div');
    scrollContainer.style.height = `${totalHeight}px`;
    scrollContainer.style.position = 'relative';
    scrollContainer.style.overflow = 'hidden';

    // Create viewport
    const viewport = document.createElement('div');
    viewport.style.position = 'absolute';
    viewport.style.top = '0';
    viewport.style.left = '0';
    viewport.style.right = '0';
    viewport.style.height = `${containerHeight}px`;
    viewport.style.overflow = 'auto';

    scrollContainer.appendChild(viewport);
    container.appendChild(scrollContainer);

    let startIndex = 0;
    let endIndex = visibleCount + bufferSize;

    const renderVisibleItems = () => {
      viewport.innerHTML = '';
      
      for (let i = startIndex; i < Math.min(endIndex, items.length); i++) {
        const item = items[i];
        const itemElement = renderItem(item, i);
        
        if (itemElement) {
          itemElement.style.position = 'absolute';
          itemElement.style.top = `${i * itemHeight}px`;
          itemElement.style.height = `${itemHeight}px`;
          itemElement.style.width = '100%';
          viewport.appendChild(itemElement);
        }
      }
    };

    viewport.addEventListener('scroll', this.throttle('virtual-scroll', () => {
      const scrollTop = viewport.scrollTop;
      startIndex = Math.floor(scrollTop / itemHeight);
      endIndex = startIndex + visibleCount + bufferSize;
      renderVisibleItems();
    }, 16)); // ~60fps

    renderVisibleItems();
  }

  /**
   * Resource hints for performance
   */
  addResourceHint(url, type = 'prefetch') {
    if (this.resourceHints.has(url)) return;

    const link = document.createElement('link');
    link.rel = type;
    link.href = url;
    document.head.appendChild(link);

    this.resourceHints.add(url);
  }

  preloadCriticalResources() {
    // Preload critical CSS and JS
    this.addResourceHint('/src/renderer/styles/main.css', 'preload');
    this.addResourceHint('/src/renderer/js/bundle.js', 'preload');
    
    // Prefetch non-critical resources
    this.addResourceHint('/src/renderer/js/pages/Dashboard.js', 'prefetch');
    this.addResourceHint('/src/renderer/js/pages/Patients.js', 'prefetch');
  }

  /**
   * API call optimization
   */
  async optimizedApiCall(key, apiFunction, ttl = this.cacheConfig.defaultTTL) {
    // Check cache first
    const cached = this.getCache(key);
    if (cached) {
      return cached;
    }

    this.metrics.apiCalls++;
    
    try {
      const result = await apiFunction();
      this.setCache(key, result, ttl);
      return result;
    } catch (error) {
      console.error(`API call failed for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * Batch API calls
   */
  async batchApiCalls(calls, batchSize = 5) {
    const results = [];
    const batches = this.createBatches(calls, batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map(call => call());
      const batchResults = await Promise.allSettled(batchPromises);
      
      results.push(...batchResults.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ));
    }

    return results;
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Memory optimization
   */
  optimizeMemory() {
    // Clear unused caches
    this.clearExpiredCache();
    
    // Clear debounce timers
    for (const [key, timer] of this.debounceTimers.entries()) {
      clearTimeout(timer);
      this.debounceTimers.delete(key);
    }

    // Clear throttle timers
    this.throttleTimers.clear();

    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
  }

  clearExpiredCache() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Performance monitoring
   */
  startPerformanceMonitoring() {
    // Monitor render times
    this.observeRenderTimes();
    
    // Monitor memory usage
    this.observeMemoryUsage();
    
    // Monitor API performance
    this.observeApiPerformance();
  }

  observeRenderTimes() {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'measure') {
          this.metrics.renderTimes.push({
            name: entry.name,
            duration: entry.duration,
            timestamp: Date.now()
          });

          // Keep only last 100 measurements
          if (this.metrics.renderTimes.length > 100) {
            this.metrics.renderTimes.shift();
          }
        }
      }
    });

    observer.observe({ entryTypes: ['measure'] });
  }

  observeMemoryUsage() {
    if ('memory' in performance) {
      setInterval(() => {
        this.metrics.memoryUsage.push({
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
          timestamp: Date.now()
        });

        // Keep only last 50 measurements
        if (this.metrics.memoryUsage.length > 50) {
          this.metrics.memoryUsage.shift();
        }
      }, 30000); // Every 30 seconds
    }
  }

  observeApiPerformance() {
    // Override fetch to monitor API calls
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = performance.now();
      this.metrics.apiCalls++;
      
      try {
        const response = await originalFetch(...args);
        const duration = performance.now() - start;
        
        // Log slow API calls
        if (duration > 1000) {
          console.warn(`Slow API call: ${args[0]} took ${duration.toFixed(2)}ms`);
        }
        
        return response;
      } catch (error) {
        const duration = performance.now() - start;
        console.error(`API call failed: ${args[0]} after ${duration.toFixed(2)}ms`, error);
        throw error;
      }
    };
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    setInterval(() => {
      this.clearExpiredCache();
      this.optimizeMemory();
    }, this.cacheConfig.cleanupInterval);
  }

  /**
   * Performance measurement utilities
   */
  startMeasure(name) {
    performance.mark(`${name}-start`);
  }

  endMeasure(name) {
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);
  }

  measureAsync(name, asyncFunction) {
    return async (...args) => {
      this.startMeasure(name);
      try {
        const result = await asyncFunction(...args);
        this.endMeasure(name);
        return result;
      } catch (error) {
        this.endMeasure(name);
        throw error;
      }
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const cacheHitRate = this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0;
    
    const avgRenderTime = this.metrics.renderTimes.length > 0
      ? this.metrics.renderTimes.reduce((sum, m) => sum + m.duration, 0) / this.metrics.renderTimes.length
      : 0;

    const currentMemory = this.metrics.memoryUsage.length > 0
      ? this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]
      : null;

    return {
      cache: {
        size: this.cache.size,
        hitRate: cacheHitRate,
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses
      },
      api: {
        totalCalls: this.metrics.apiCalls
      },
      render: {
        averageTime: avgRenderTime,
        measurements: this.metrics.renderTimes.length
      },
      memory: currentMemory,
      activeTimers: {
        debounce: this.debounceTimers.size,
        throttle: this.throttleTimers.size
      }
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      apiCalls: 0,
      renderTimes: [],
      memoryUsage: []
    };
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const metrics = this.getMetrics();
    
    return {
      timestamp: new Date().toISOString(),
      summary: {
        cacheEfficiency: `${(metrics.cache.hitRate * 100).toFixed(1)}%`,
        averageRenderTime: `${metrics.render.averageTime.toFixed(2)}ms`,
        memoryUsage: metrics.memory ? `${(metrics.memory.used / 1024 / 1024).toFixed(1)}MB` : 'N/A',
        apiCalls: metrics.api.totalCalls
      },
      details: metrics,
      recommendations: this.generateRecommendations(metrics)
    };
  }

  generateRecommendations(metrics) {
    const recommendations = [];

    if (metrics.cache.hitRate < 0.5) {
      recommendations.push('Consider increasing cache TTL or cache size');
    }

    if (metrics.render.averageTime > 100) {
      recommendations.push('Consider optimizing render performance');
    }

    if (metrics.memory && metrics.memory.used > metrics.memory.limit * 0.8) {
      recommendations.push('Memory usage is high, consider cleanup');
    }

    if (metrics.api.totalCalls > 1000) {
      recommendations.push('Consider implementing API call batching');
    }

    return recommendations;
  }
}

export default new PerformanceOptimizationService(); 