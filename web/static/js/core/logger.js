/**
 * UNIFIED LOGGING SYSTEM
 * Спільна система логування для всього фронтенду
 */

export class Logger {
    constructor(component = 'ATLAS') {
        this.component = component;
        this.logs = [];
        this.maxLogs = 1000;
    }

    log(message, level = 'info', data = null) {
        const timestamp = new Date().toISOString();
        const timeString = new Date().toTimeString().split(' ')[0];
        
        const logEntry = {
            timestamp,
            timeString,
            level: level.toUpperCase(),
            component: this.component,
            message,
            data
        };

        // Console output
        const consoleMessage = `[${timeString}] [${this.component}] ${message}`;
        switch (level.toLowerCase()) {
            case 'error':
                console.error(consoleMessage, data || '');
                break;
            case 'warn':
                console.warn(consoleMessage, data || '');
                break;
            case 'debug':
                console.debug(consoleMessage, data || '');
                break;
            default:
                console.log(consoleMessage, data || '');
        }

        // Store log
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Dispatch event for logger UI
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('atlas-log', {
                detail: logEntry
            }));
        }
    }

    error(message, data = null) {
        this.log(message, 'error', data);
    }

    warn(message, data = null) {
        this.log(message, 'warn', data);
    }

    debug(message, data = null) {
        this.log(message, 'debug', data);
    }

    info(message, data = null) {
        this.log(message, 'info', data);
    }

    getLogs(level = null, limit = null) {
        let filteredLogs = this.logs;
        
        if (level) {
            filteredLogs = this.logs.filter(log => 
                log.level.toLowerCase() === level.toLowerCase()
            );
        }
        
        if (limit) {
            filteredLogs = filteredLogs.slice(-limit);
        }
        
        return filteredLogs;
    }

    clear() {
        this.logs = [];
    }
}

// Global logger instance
export const logger = new Logger();

// Utility functions for backward compatibility
export const logMessage = (level, message, data = null) => {
    logger.log(message, level, data);
};

export const generateMessageId = () => 
    `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
