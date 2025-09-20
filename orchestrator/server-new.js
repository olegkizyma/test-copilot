/**
 * ATLAS ORCHESTRATOR SERVER - REFACTORED
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

const app = express();
const PORT = process.env.ORCH_PORT || 5101;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Secret-Key']
}));
app.use(express.json({ limit: '10mb' }));

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

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '2.0-refactored'
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
    
    // Створюємо нову сесію
    const session = { 
        id: sessionId,
        history: [],
        currentStage: 1,
        retryCycle: 0,
        lastInteraction: Date.now(),
        originalMessage: message,
        waitingForConfirmation: false
    };
    sessions.set(sessionId, session);
    
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

// Start server
app.listen(PORT, () => {
    logMessage('info', `ATLAS ORCHESTRATOR (REFACTORED) running on port ${PORT}`);
    logMessage('info', 'FEATURES:');
    logMessage('info', '- Modular architecture');
    logMessage('info', '- Separated workflow logic');
    logMessage('info', '- Integrated fallback LLM');
    logMessage('info', '- Clean agent configuration');
    logMessage('info', '- Improved error handling');
});

export default app;
