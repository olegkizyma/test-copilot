/**
 * ATLAS 3-Agent System Orchestrator - NEW WORKFLOW
 * Atlas завжди починає першим, безперервний цикл без зупинок
 */

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import WebSocket from 'ws';
import path from 'path';
import os from 'os';

// Import промптів для кожного етапу
import atlasStage1 from '../../agent_prompts/atlas/stage1_initial_processing.js';
import tetyanaStage2 from '../../agent_prompts/tetyana/stage2_execution.js';
import atlasStage3 from '../../agent_prompts/atlas/stage3_clarification.js';
import tetyanaStage4 from '../../agent_prompts/tetyana/stage4_retry.js';
import grishaStage5 from '../../agent_prompts/grisha/stage5_takeover.js';
import workflowConfig from '../../agent_prompts/workflow_config.js';

const app = express();
const PORT = process.env.ORCH_PORT || 5101;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Secret-Key']
}));
app.use(express.json({ limit: '10mb' }));

// Конфігурація агентів з новою логікою
const AGENTS = {
    atlas: {
        role: 'strategist_first', // Atlas завжди першим
        signature: '[ATLAS]',
        color: '#00ff00',
        voice: 'dmytro',
        priority: 1,
        description: 'Завжди починає першим, перефразовує запити користувача'
    },
    tetyana: {
        role: 'executor', 
        signature: '[ТЕТЯНА]',
        color: '#00ffff',
        voice: 'tetiana',
        priority: 2,
        description: 'Виконує завдання від Atlas, озвучує конкретні уточнення'
    },
    grisha: {
        role: 'finalizer',
        signature: '[ГРИША]', 
        color: '#ffff00',
        voice: 'mykyta',
        priority: 3,
        description: 'Фінальний виконавець, доводить до кінця'
    }
};

// Session management
const sessions = new Map();
let messageCounter = 0;

// Helper functions
const generateMessageId = () => `msg_${Date.now()}_${++messageCounter}`;

const logMessage = (level, message) => {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
};

// Перевірка чи потребує Тетяна уточнень
function checkIfNeedsClarification(response) {
    const text = (response.content || '').toLowerCase();
    return workflowConfig.WORKFLOW_CONDITIONS.tetyana_needs_clarification({ content: text });
}

// Перевірка чи все ще заблокована після уточнень
function checkIfStillBlocked(responses) {
    return workflowConfig.WORKFLOW_CONDITIONS.tetyana_still_blocked(responses);
}

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/agents', (req, res) => {
    res.json(AGENTS);
});

app.get('/workflow', (req, res) => {
    res.json({
        stages: workflowConfig.WORKFLOW_STAGES,
        config: workflowConfig.WORKFLOW_CONFIG
    });
});

// Основний endpoint - НОВИЙ WORKFLOW
app.post('/chat/stream', async (req, res) => {
    const { message, sessionId = 'default' } = req.body;
    
    if (!message?.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }
    
    logMessage('info', `NEW WORKFLOW: ${message.substring(0, 100)}...`);
    
    // Отримуємо або створюємо сесію
    const session = sessions.get(sessionId) || { 
        id: sessionId,
        history: [],
        currentStage: 1,
        lastInteraction: Date.now()
    };
    sessions.set(sessionId, session);
    
    try {
        const responses = await executeNewWorkflow(message, session);
        
        res.json({
            success: true,
            response: responses,
            session: {
                id: sessionId,
                currentStage: session.currentStage,
                totalStages: responses.length
            }
        });
    } catch (error) {
        logMessage('error', `Workflow failed: ${error.message}`);
        res.status(500).json({
            error: 'Workflow failed',
            details: error.message
        });
    }
});

// НОВИЙ WORKFLOW - Atlas завжди першим
async function executeNewWorkflow(userMessage, session) {
    const responses = [];
    
    // Додаємо повідомлення користувача
    session.history.push({
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
    });
    
    // ЕТАП 1: Atlas завжди починає першим (перефразування)
    logMessage('info', 'STAGE 1: Atlas initial processing');
    session.currentStage = 1;
    
    const atlasResponse1 = await executeAgentStage(
        'atlas',
        'stage1_initial_processing',
        atlasStage1.ATLAS_STAGE1_SYSTEM_PROMPT,
        atlasStage1.ATLAS_STAGE1_USER_PROMPT(userMessage),
        session
    );
    responses.push(atlasResponse1);
    session.history.push(atlasResponse1);
    
    // ЕТАП 2: Тетяна виконує завдання від Atlas
    logMessage('info', 'STAGE 2: Tetyana execution');
    session.currentStage = 2;
    
    const tetyanaResponse1 = await executeAgentStage(
        'tetyana',
        'stage2_execution',
        tetyanaStage2.TETYANA_STAGE2_SYSTEM_PROMPT,
        tetyanaStage2.TETYANA_STAGE2_USER_PROMPT(atlasResponse1.content, userMessage),
        session,
        { enableTools: true }
    );
    responses.push(tetyanaResponse1);
    session.history.push(tetyanaResponse1);
    
    // Перевіряємо чи потребує Тетяна уточнень
    if (checkIfNeedsClarification(tetyanaResponse1)) {
        // ЕТАП 3: Atlas надає уточнення
        logMessage('info', 'STAGE 3: Atlas clarification');
        session.currentStage = 3;
        
        const atlasResponse2 = await executeAgentStage(
            'atlas',
            'stage3_clarification',
            atlasStage3.ATLAS_STAGE3_SYSTEM_PROMPT,
            atlasStage3.ATLAS_STAGE3_USER_PROMPT(tetyanaResponse1.content, atlasResponse1.content, userMessage),
            session
        );
        responses.push(atlasResponse2);
        session.history.push(atlasResponse2);
        
        // ЕТАП 4: Тетяна повторює з уточненнями
        logMessage('info', 'STAGE 4: Tetyana retry with clarifications');
        session.currentStage = 4;
        
        const tetyanaResponse2 = await executeAgentStage(
            'tetyana',
            'stage4_retry',
            tetyanaStage4.TETYANA_STAGE4_SYSTEM_PROMPT,
            tetyanaStage4.TETYANA_STAGE4_USER_PROMPT(atlasResponse2.content, atlasResponse1.content, tetyanaResponse1.content),
            session,
            { enableTools: true }
        );
        responses.push(tetyanaResponse2);
        session.history.push(tetyanaResponse2);
        
        // Якщо все ще заблокована - Гриша бере на себе
        if (checkIfStillBlocked([tetyanaResponse2])) {
            // ЕТАП 5: Гриша фінальне виконання
            logMessage('info', 'STAGE 5: Grisha final takeover');
            session.currentStage = 5;
            
            const grishaResponse = await executeAgentStage(
                'grisha',
                'stage5_takeover',
                grishaStage5.GRISHA_STAGE5_SYSTEM_PROMPT,
                grishaStage5.GRISHA_STAGE5_USER_PROMPT(
                    userMessage,
                    `${atlasResponse1.content}\n${atlasResponse2.content}`,
                    `${tetyanaResponse1.content}\n${tetyanaResponse2.content}`
                ),
                session,
                { enableTools: true }
            );
            responses.push(grishaResponse);
            session.history.push(grishaResponse);
        }
    }
    
    return responses;
}

// Виконання етапу агента з конкретним промптом
async function executeAgentStage(agentName, stageName, systemPrompt, userPrompt, session, options = {}) {
    const agent = AGENTS[agentName];
    const messageId = generateMessageId();
    
    logMessage('info', `Executing ${agentName} - ${stageName}`);
    
    let content;
    let provider = 'simulation';
    let model = undefined;
    
    try {
        // Спроба через Goose
        const gooseText = await callGooseAgent(userPrompt, session.id, {
            enableTools: options.enableTools === true,
            systemInstruction: systemPrompt
        });
        
        if (gooseText) {
            content = gooseText;
            provider = 'goose';
            model = 'github_copilot';
        } else {
            // Fallback симуляція
            content = await simulateAgentResponse(agentName, stageName, userPrompt);
        }
    } catch (error) {
        logMessage('error', `Agent ${agentName} stage ${stageName} error: ${error.message}`);
        content = await simulateAgentResponse(agentName, stageName, userPrompt);
    }
    
    // Додаємо підпис агента
    if (!content.includes(agent.signature)) {
        content = `${agent.signature} ${content}`;
    }
    
    return {
        role: 'assistant',
        content,
        agent: agentName,
        stage: stageName,
        messageId,
        timestamp: Date.now(),
        voice: agent.voice,
        color: agent.color,
        provider,
        model
    };
}

// Виклик Goose агента
async function callGooseAgent(message, sessionId, opts = {}) {
    const gooseBaseUrl = process.env.GOOSE_BASE_URL || 'http://localhost:3000';
    const secretKey = process.env.GOOSE_SECRET_KEY || 'test';
    
    try {
        // Спроба через SSE якщо потрібні інструменти
        if (opts?.enableTools) {
            const result = await callGooseSSE(gooseBaseUrl, message, sessionId, secretKey, opts);
            if (result) return result;
        }
        
        // Спроба через WebSocket
        const wsResult = await callGooseWebSocket(gooseBaseUrl, message, sessionId, secretKey);
        if (wsResult) return wsResult;
        
        // Fallback to SSE
        const sseResult = await callGooseSSE(gooseBaseUrl, message, sessionId, secretKey, opts);
        if (sseResult) return sseResult;
        
        return null;
    } catch (error) {
        logMessage('error', `Goose integration error: ${error.message}`);
        return null;
    }
}

// WebSocket інтеграція з Goose
async function callGooseWebSocket(baseUrl, message, sessionId, secretKey) {
    return new Promise((resolve) => {
        const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
        let collected = '';
        let timeout;
        
        try {
            const ws = new WebSocket(wsUrl);
            
            timeout = setTimeout(() => {
                ws.close();
                resolve(null);
            }, 15000);
            
            ws.on('open', () => {
                const payload = {
                    type: 'message',
                    content: message,
                    session_id: sessionId,
                    timestamp: Date.now()
                };
                ws.send(JSON.stringify(payload));
            });
            
            ws.on('message', (data) => {
                try {
                    const obj = JSON.parse(data.toString());
                    
                    if (obj.type === 'response' && obj.content) {
                        collected += String(obj.content);
                    } else if (obj.type === 'complete' || obj.type === 'cancelled') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve(collected.trim() || null);
                    } else if (obj.type === 'error') {
                        clearTimeout(timeout);
                        ws.close();
                        resolve(null);
                    }
                } catch (e) {
                    // Ignore non-JSON
                }
            });
            
            ws.on('error', () => {
                clearTimeout(timeout);
                resolve(null);
            });
            
            ws.on('close', () => {
                clearTimeout(timeout);
                resolve(collected.trim() || null);
            });
            
        } catch (error) {
            if (timeout) clearTimeout(timeout);
            resolve(null);
        }
    });
}

// SSE інтеграція з Goose
async function callGooseSSE(baseUrl, message, sessionId, secretKey, options = {}) {
    try {
        const url = `${baseUrl}/reply`;
        const headers = {
            'Accept': 'text/event-stream',
            'Content-Type': 'application/json',
            'X-Secret-Key': secretKey
        };
        
        const messages = [];
        if (options?.systemInstruction) {
            messages.push({
                role: 'system',
                created: Math.floor(Date.now() / 1000),
                content: [{ type: 'text', text: options.systemInstruction }]
            });
        }
        messages.push({
            role: 'user',
            created: Math.floor(Date.now() / 1000),
            content: [{ type: 'text', text: message }]
        });
        
        const workingDir = process.cwd();
        
        const payload = {
            messages,
            session_id: sessionId,
            session_working_dir: workingDir,
            ...(options?.enableTools ? { tool_choice: 'auto' } : {})
        };
        
        const response = await axios.post(url, payload, {
            headers,
            timeout: 20000,
            responseType: 'stream'
        });
        
        if (response.status !== 200) {
            return null;
        }
        
        return new Promise((resolve) => {
            let collected = '';
            
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const dataStr = line.slice(5).trim();
                        try {
                            const obj = JSON.parse(dataStr);
                            if (obj.type === 'Message' && obj.message?.content) {
                                for (const content of obj.message.content) {
                                    if (content.type === 'text' && content.text) {
                                        collected += content.text;
                                    }
                                }
                            }
                        } catch (e) {
                            // Not JSON
                        }
                    }
                }
            });
            
            response.data.on('end', () => {
                resolve(collected.trim() || null);
            });
            
            response.data.on('error', () => {
                resolve(collected.trim() || null);
            });
        });
        
    } catch (error) {
        logMessage('error', `SSE error: ${error.message}`);
        return null;
    }
}

// Симуляція відповіді агента (fallback)
async function simulateAgentResponse(agentName, stageName, prompt) {
    const responses = {
        atlas: {
            stage1_initial_processing: "📋 ПЕРЕФРАЗОВАНЕ ЗАВДАННЯ: Виконую аналіз та перефразування запиту користувача для кращого розуміння.\n🎯 КЛЮЧОВІ ВИМОГИ: Зрозумілість, конкретність, виконуваність\n⚙️ ПАРАМЕТРИ: Стандартні значення за замовчуванням\n🔧 ПРИПУЩЕННЯ: Використовую найбільш логічні варіанти\n➡️ ДЛЯ ТЕТЯНИ: Виконай завдання з цими параметрами",
            stage3_clarification: "🔍 АНАЛІЗ: Тетяна потребує додаткових даних\n✅ РІШЕННЯ: Надаю конкретні значення та параметри\n📝 ІНСТРУКЦІЇ: Покрокові дії для виконання\n⚙️ ПАРАМЕТРИ: Всі необхідні значення\n➡️ ПРОДОВЖУЙ: Виконуй з цими уточненнями"
        },
        tetyana: {
            stage2_execution: "🔄 СТАТУС: Виконую завдання від Atlas\n⚡ ДІЇ: Аналізую вимоги та починаю виконання\n📋 РЕЗУЛЬТАТ: Частково виконано, потребую уточнень\n🎯 УТОЧНЕННЯ: Потрібно знати конкретні параметри\n💡 ПРИПУЩЕННЯ: Використовую стандартні значення",
            stage4_retry: "✅ СТАТУС: Виконано з уточненнями Atlas\n🔧 ВИКОРИСТАНІ УТОЧНЕННЯ: Застосувала всі надані дані\n⚡ ВИКОНАНІ ДІЇ: Повний список виконаних кроків\n📊 РЕЗУЛЬТАТ: Завдання виконано успішно\n🎯 ПЕРЕВІРКА: Результат можна перевірити\n💯 ГОТОВО: Завдання завершено"
        },
        grisha: {
            stage5_takeover: "🎯 БЕРУ НА СЕБЕ: Повну відповідальність за завдання\n🔍 АНАЛІЗ ПРОБЛЕМИ: Знайшов причину невдач\n💡 МІЙ ПІДХІД: Альтернативний метод виконання\n⚡ ВИКОНАННЯ: Покрокові дії\n📊 РЕЗУЛЬТАТ: Конкретний результат\n✅ ЗАВЕРШЕНО: Завдання повністю виконано"
        }
    };
    
    return responses[agentName]?.[stageName] || `Виконую етап ${stageName} для агента ${agentName}`;
}

// Сумісність зі старим API
app.post('/chat', async (req, res) => {
    req.url = '/chat/stream';
    return app._router.handle(req, res);
});

// Direct endpoint для Тетяни (сумісність)
app.post('/agent/tetyana', async (req, res) => {
    const { message, sessionId = 'default' } = req.body;
    
    if (!message?.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }
    
    const session = sessions.get(sessionId) || {
        id: sessionId,
        history: [],
        currentStage: 2,
        lastInteraction: Date.now()
    };
    sessions.set(sessionId, session);
    
    try {
        const response = await executeAgentStage(
            'tetyana',
            'stage2_execution',
            tetyanaStage2.TETYANA_STAGE2_SYSTEM_PROMPT,
            tetyanaStage2.TETYANA_STAGE2_USER_PROMPT(message),
            session,
            { enableTools: true }
        );
        
        res.json({
            success: true,
            response: [response],
            session: {
                id: sessionId,
                currentStage: session.currentStage
            }
        });
    } catch (error) {
        res.status(500).json({
            error: 'Processing failed',
            details: error.message
        });
    }
});

// SSE endpoint для streaming
app.get('/chat/stream/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    const keepAlive = setInterval(() => {
        res.write('data: {"type":"keepalive"}\n\n');
    }, 30000);
    
    req.on('close', () => {
        clearInterval(keepAlive);
        logMessage('info', `SSE connection closed for session ${sessionId}`);
    });
    
    res.write(`data: {"type":"connected","sessionId":"${sessionId}"}\n\n`);
});

// Start server
app.listen(PORT, () => {
    logMessage('info', `ATLAS NEW WORKFLOW Orchestrator running on port ${PORT}`);
    logMessage('info', 'NEW WORKFLOW: Atlas always starts first');
    logMessage('info', '- Stage 1: Atlas initial processing');
    logMessage('info', '- Stage 2: Tetyana execution');
    logMessage('info', '- Stage 3: Atlas clarification (if needed)');
    logMessage('info', '- Stage 4: Tetyana retry (if needed)');
    logMessage('info', '- Stage 5: Grisha takeover (if needed)');
});

export default app;
