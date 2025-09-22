/**
 * ATLAS ORCHESTRATOR SERVER
 * Модульна архітектура з розділенням відповідальності
 */

import express from 'express';
import cors from 'cors';

// Імпорти модулів
import { AGENTS } from './config/agents.js';
import { WORKFLOW_STAGES, WORKFLOW_CONFIG } from './workflow/stages.js';
import { executeStepByStepWorkflow } from './workflow/executor.js';
import { chatCompletion, getAvailableModels } from './ai/fallback-llm.js';
import { logMessage } from './utils/helpers.js';

// Нові централізовані модулі
import logger from './utils/logger.js';
import errorHandler from './errors/error-handler.js';
import telemetry from './utils/telemetry.js';
import healthMonitor from './monitoring/health-monitor.js';

const app = express();
const PORT = process.env.ORCH_PORT || 5101;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Secret-Key']
}));
app.use(express.json({ limit: '10mb' }));

// Додання middleware для логування запитів
app.use((req, res, next) => {
  const start = Date.now();
  
  // Логування вхідного запиту
  logger.info(`${req.method} ${req.url}`, {
    headers: req.headers,
    query: req.query,
    ip: req.ip
  });
  
  // Перехоплюємо завершення відповіді
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    
    // Логуємо інформацію про запит
    logger.info(`${req.method} ${req.url} ${status}`, {
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || 0
    });
    
    // Записуємо метрику
    telemetry.recordExecution('http_request', duration, status < 400, {
      method: req.method,
      path: req.url,
      status
    });
  });
  
  next();
});

// Session management
const sessions = new Map();

// Очищення старих сесій (кожні 10 хвилин)
setInterval(() => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 хвилин
    
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.lastInteraction > maxAge) {
            sessions.delete(sessionId);
            logMessage('info', `Cleaned up old session: ${sessionId}`);
        }
    }
}, 5 * 60 * 1000); // Перевірка кожні 5 хвилин

// Health check з інтеграцією health monitor
app.get('/health', (req, res) => {
    res.json(healthMonitor.getHealthStatus());
});

// Додання ендпоінту для метрик
app.get('/metrics', (req, res) => {
  // Тільки для авторизованих запитів
  // ...authorization check...
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

// Agents configuration
app.get('/agents', (req, res) => {
    res.json(AGENTS);
});

// Workflow configuration
app.get('/workflow', (req, res) => {
    res.json({
        stages: WORKFLOW_STAGES,
        config: WORKFLOW_CONFIG
    });
});

// Fallback LLM models endpoint
app.get('/v1/models', (req, res) => {
    res.json({ 
        object: 'list', 
        data: getAvailableModels() 
    });
});

// Fallback LLM chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const result = await chatCompletion(req.body.messages, {
            model: req.body.model,
            max_tokens: req.body.max_tokens,
            temperature: req.body.temperature,
            stream: req.body.stream
        });
        
        if (req.body.stream) {
            // Handle streaming response
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // Forward streaming data
            result.data.on('data', chunk => {
                res.write(chunk);
            });
            
            result.data.on('end', () => {
                res.end();
            });
        } else {
            res.json(result);
        }
    } catch (error) {
        logMessage('error', `Fallback LLM error: ${error.message}`);
        res.status(500).json({
            error: {
                message: error.message,
                type: 'internal_error'
            }
        });
    }
});

// НОВИЙ STREAMING ENDPOINT - step-by-step виконання
app.post('/chat/stream', async (req, res) => {
    const { message, sessionId = 'default' } = req.body;
    
    if (!message?.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }
    
    logMessage('info', `STARTING STEP-BY-STEP WORKFLOW: ${message.substring(0, 100)}...`);
    
    // Налаштовуємо streaming response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Отримуємо існуючу або створюємо нову сесію (для безперервного чату 0)
    let session = sessions.get(sessionId);
    if (!session) {
        session = {
            id: sessionId,
            history: [],
            currentStage: 0,
            retryCycle: 0,
            lastInteraction: Date.now(),
            originalMessage: message,
            waitingForConfirmation: false,
            lastMode: undefined, // 'chat' | 'task'
            chatThread: { messages: [], lastTopic: undefined }
        };
        sessions.set(sessionId, session);
    } else {
        // Оновлюємо останню активність і оригінальне повідомлення для зручності
        session.lastInteraction = Date.now();
        session.originalMessage = message;
    }
    
    // Запускаємо step-by-step workflow
    try {
        await executeStepByStepWorkflow(message, session, res);
    } catch (error) {
        logMessage('error', `Step-by-step workflow failed: ${error.message}`);
        if (!res.headersSent) {
            res.write(JSON.stringify({
                type: 'workflow_error',
                data: {
                    error: 'Workflow failed',
                    details: error.message
                }
            }) + '\n');
        }
    } finally {
        // ЗАВЖДИ ЗАКРИВАЄМО З'ЄДНАННЯ
        if (!res.writableEnded) {
            res.end();
        }
    }
});

// Endpoint для підтвердження отримання повідомлення від фронтенду
app.post('/chat/confirm', async (req, res) => {
    const { sessionId, messageId } = req.body;
    
    const session = sessions.get(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    logMessage('info', `Message confirmed by frontend: ${messageId} for session: ${sessionId}`);
    
    // Знімаємо блокування для продовження workflow
    session.waitingForConfirmation = false;
    session.lastConfirmedMessage = messageId;
    session.lastInteraction = Date.now();
    
    res.json({ success: true, confirmed: messageId });
});

// Endpoint для отримання поточного TTS запиту
app.get('/tts/pending', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); // Відключаємо кешування
    const pendingRequest = global.pendingTTSRequest;
    
    if (pendingRequest) {
        // Очищаємо після відправки
        global.pendingTTSRequest = null;
        res.json({
            has_pending: true,
            request: pendingRequest
        });
    } else {
        res.json({
            has_pending: false
        });
    }
});

// Endpoint для отримання події завершення TTS від фронтенду
app.post('/tts/completed', async (req, res) => {
    const { voice } = req.body;
    
    if (!voice) {
        return res.status(400).json({ error: 'Voice parameter required' });
    }
    
    // Імпортуємо функцію для сповіщення про завершення TTS
    const { notifyTTSCompleted } = await import('./utils/helpers.js');
    notifyTTSCompleted(voice);
    
    logMessage('info', `[TTS] Received completion event for voice: ${voice}`);
    res.json({ success: true, voice: voice });
});

// Додання глобального обробника помилок
process.on('uncaughtException', (error) => {
  logger.error('Необроблене виключення:', error);
  errorHandler.handleError(error, { global: true })
    .catch(err => {
      logger.error('Помилка при обробці виключення:', err);
      process.exit(1);
    });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Необроблене відхилення проміса:', reason);
  errorHandler.handleError(reason, { global: true, isRejection: true })
    .catch(err => {
      logger.error('Помилка при обробці відхилення проміса:', err);
    });
});

// Інтеграція обробника помилок в API сервера
app.use((err, req, res, next) => {
  errorHandler.handleError(err, { 
    route: req.path, 
    method: req.method 
  })
    .then(result => {
      res.status(500).json({ 
        error: true, 
        message: err.message,
        recoveryAction: result.action 
      });
    })
    .catch(handlerError => {
      logger.error('Помилка обробника помилок:', handlerError);
      res.status(500).json({ 
        error: true, 
        message: 'Internal server error' 
      });
    });
});

// Start server
app.listen(PORT, () => {
    logger.info(`Orchestrator server running on port ${PORT}`);
    logger.info('FEATURES:');
    logger.info('- Centralized state management');
    logger.info('- Unified error handling');
    logger.info('- Agent manager with protocol');
    logger.info('- Standardized prompts');
    logger.info('- Telemetry and monitoring');
    logger.info('- Modular architecture');
});

export default app;
