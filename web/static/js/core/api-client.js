/**
 * UNIFIED API CLIENT
 * Спільний клієнт для всіх API викликів
 */

import { logger } from './logger.js';
import { API_ENDPOINTS } from './config.js';

export class ApiClient {
    constructor(baseUrl, serviceName = 'API') {
        this.baseUrl = baseUrl;
        this.serviceName = serviceName;
        this.logger = new logger.constructor(serviceName);
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        this.logger.debug(`${config.method} ${url}`, config.body ? JSON.parse(config.body) : null);

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            let data;

            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else if (contentType && contentType.includes('audio/')) {
                data = await response.blob();
            } else {
                data = await response.text();
            }

            this.logger.debug(`Response from ${endpoint}`, typeof data === 'object' ? data : `${typeof data} (${data.length || 0})`);
            return { data, response };

        } catch (error) {
            this.logger.error(`Request failed: ${config.method} ${url}`, error.message);
            throw error;
        }
    }

    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url);
    }

    async post(endpoint, data = null) {
        return this.request(endpoint, {
            method: 'POST',
            body: data ? JSON.stringify(data) : null
        });
    }

    async put(endpoint, data = null) {
        return this.request(endpoint, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : null
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, {
            method: 'DELETE'
        });
    }

    // Streaming request for chat
    async stream(endpoint, data, onMessage, onError, onComplete) {
        const url = `${this.baseUrl}${endpoint}`;
        
        this.logger.info(`Starting stream: ${url}`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    this.logger.info('Stream completed');
                    if (onComplete) onComplete();
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const message = JSON.parse(line);
                        if (onMessage) onMessage(message);
                    } catch (parseError) {
                        this.logger.warn('Failed to parse stream message', line);
                    }
                }
            }

        } catch (error) {
            this.logger.error('Stream failed', error.message);
            if (onError) onError(error);
            throw error;
        }
    }
}

// Pre-configured API clients
export const orchestratorClient = new ApiClient(API_ENDPOINTS.orchestrator, 'ORCHESTRATOR');
export const frontendClient = new ApiClient(API_ENDPOINTS.frontend, 'FRONTEND');
export const ttsClient = new ApiClient(API_ENDPOINTS.tts, 'TTS');
export const gooseClient = new ApiClient(API_ENDPOINTS.goose, 'GOOSE');
