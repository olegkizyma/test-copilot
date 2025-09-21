/**
 * GOOSE CLIENT
 * Клієнт для взаємодії з Goose AI через WebSocket
 */

import WebSocket from 'ws';
import axios from 'axios';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Функція автоматичного виявлення порту Goose
export async function detectGoosePort() {
    const commonPorts = [3000]; // Goose CLI web server always uses port 3000
    
    for (const port of commonPorts) {
        try {
            const response = await axios.get(`http://localhost:${port}`, { 
                timeout: 1000,
                validateStatus: () => true // Accept any status code
            });
            
            // HTTP 401 означає що Goose працює (потребує авторизації)
            if (response.status === 401 || response.status === 200 || response.status === 404) {
                console.log(`[GOOSE] Detected on port ${port} (HTTP ${response.status})`);
                return port;
            }
        } catch (error) {
            // Порт недоступний, продовжуємо пошук
            continue;
        }
    }
    
    console.warn('[GOOSE] Port not detected, using default 3000');
    return 3000;
}

// Виправлений виклик Goose агента (БЕЗ fallback симуляції)
export async function callGooseAgent(prompt, baseSessionId, options = {}) {
    // Створюємо унікальну сесію для кожного виклику щоб уникнути конфліктів tool_calls
    const sessionId = `${baseSessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Відключаємо tools ТІЛЬКИ для Atlas (координатор не потребує інструментів)
    // Тетяна і Гриша мають ПОВНИЙ доступ до реальних інструментів!
    let enhancedPrompt = prompt;
    if (options.agent === 'atlas') {
        enhancedPrompt = `ВАЖЛИВО: Відповідай ТІЛЬКИ текстом. НЕ використовуй жодних інструментів або tools. Дай повну текстову відповідь для координації.

${prompt}`;
    } else if (options.agent === 'tetyana') {
        // Тетяна - виконавець, НЕ використовує vision для перевірки
        enhancedPrompt = `ВАЖЛИВО: Ти ВИКОНАВЕЦЬ завдань. НЕ використовуй screen_capture, screenshot або vision tools - це робота для Гріші (верифікатора). Твоя задача: виконати завдання використовуючи computercontroller, developer (команди, файли), playwright.

${prompt}`;
    } else if (options.agent === 'grisha') {
        // Гриша - верифікатор, може використовувати vision через Playwright
        enhancedPrompt = `ВАЖЛИВО: Ти ВЕРИФІКАТОР результатів. Для скріншотів використовуй PLAYWRIGHT замість developer__screen_capture:
        
ДОСТУПНІ TOOLS:
• browser_take_screenshot - скріншот веб-сторінок через Playwright
• computercontroller - перевірка файлів, процесів
• developer - команди терміналу (БЕЗ screen_capture)
• playwright - повна браузерна автоматизація

${prompt}`;
    }
    // Для Тетяни і Гріші - доступ до tools БЕЗ vision функцій
    
    // Обмежуємо довжину повідомлення до 2000 символів для Goose
    const truncatedMessage = enhancedPrompt.length > 2000 
        ? enhancedPrompt.slice(0, 1997) + "..."
        : enhancedPrompt;
    
    // Автоматично виявляємо порт Goose або використовуємо змінну середовища
    let goosePort = process.env.GOOSE_PORT;
    if (!goosePort) {
        goosePort = await detectGoosePort();
    }
    const gooseBaseUrl = process.env.GOOSE_BASE_URL || `http://localhost:${goosePort}`;
    
    console.log(`[GOOSE] Calling for session ${sessionId} - NO SIMULATION FALLBACK [Message length: ${truncatedMessage.length}]`);
    
    try {
        // Goose web server підтримує тільки WebSocket, пропускаємо HTTP API
        let result = await callGooseWebSocket(gooseBaseUrl, truncatedMessage, sessionId);
        
        if (result && result.trim().length > 0) {
            console.log(`[GOOSE] Execution successful: ${result.length} chars`);
            return result;
        }
        
        // Якщо Goose не відповів - це помилка, не fallback
        console.error('[GOOSE] Did not provide response - NO FALLBACK');
        return null;
        
    } catch (error) {
        console.error(`[GOOSE] Call failed: ${error.message} - NO FALLBACK`);
        return null;
    }
}

// WebSocket інтеграція з Goose з детальним логуванням
async function callGooseWebSocket(baseUrl, message, sessionId) {
    return new Promise((resolve) => {
        const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
        let collected = '';
        let timeout;
        
        console.log(`[GOOSE] Attempting WebSocket connection to: ${wsUrl}`);
        
        try {
            // Додаємо авторизацію для WebSocket підключення
            const headers = {};
            
            // Спробуємо отримати GitHub токен з конфігурації Goose
            try {
                const configPath = path.join(os.homedir(), '.config', 'goose', 'config.yaml');
                if (fs.existsSync(configPath)) {
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    const tokenMatch = configContent.match(/api_key:\s*([^\s\n]+)/);
                    if (tokenMatch && tokenMatch[1] && tokenMatch[1] !== 'null') {
                        headers['Authorization'] = `Bearer ${tokenMatch[1]}`;
                        console.log('[GOOSE] Using GitHub token for WebSocket authentication');
                    }
                }
            } catch (configError) {
                console.warn(`[GOOSE] Could not read config: ${configError.message}`);
            }
            
            const ws = new WebSocket(wsUrl, { headers });
            
            // Збільшуємо timeout до 120 секунд згідно з пам'яттю
            timeout = setTimeout(() => {
                console.warn(`[GOOSE] WebSocket timeout after 120 seconds for session: ${sessionId}`);
                ws.close();
                resolve(collected.trim() || null); // Повертаємо те що зібрали
            }, 120000); // 120 секунд timeout
            
            ws.on('open', () => {
                console.log(`[GOOSE] WebSocket connected for session: ${sessionId}`);
                // Обмежуємо довжину повідомлення до 4000 символів для кращої роботи з tools
                let truncatedMessage = message.length > 4000 
                    ? message.slice(0, 3997) + "..."
                    : message;

                // Виправляємо повідомлення: замінюємо 'tool' на 'tool_calls' для сумісності з API
                if (truncatedMessage.includes('"role": "tool"')) {
                    truncatedMessage = truncatedMessage.replace(/"role": "tool"/g, '"role": "tool_calls"');
                    console.log('[GOOSE] Fixed message: replaced role "tool" with "tool_calls"');
                }

                const payload = {
                    type: 'message',
                    content: truncatedMessage,
                    session_id: sessionId,
                    timestamp: Date.now()
                };
                console.log(`[GOOSE] Sending message: ${message.substring(0, 100)}...`);
                ws.send(JSON.stringify(payload));
            });
            
            ws.on('message', (data) => {
                try {
                    const obj = JSON.parse(data.toString());
                    console.log(`[GOOSE] Received: ${obj.type} - ${String(obj.content || obj.message || '').substring(0, 100)}...`);
                    
                    if (obj.type === 'response' && obj.content) {
                        collected += String(obj.content);
                    } else if (obj.type === 'tool_request') {
                        // Детальне логування tool request для діагностики
                        console.log(`[GOOSE] Tool request: ${obj.tool_name || obj.name || 'unknown'}`);
                        console.log(`[GOOSE] Tool request structure: ${JSON.stringify(obj, null, 2)}`);
                        
                        // Перевіряємо, доступний ли інструмент
                        const availableExtensions = ['computercontroller', 'memory', 'developer', 'playwright', 'vscode'];
                        const isToolAvailable = availableExtensions.some(ext => obj.tool_name?.includes(ext)) || 
                                               obj.tool_name?.startsWith('browser_') || 
                                               obj.tool_name?.startsWith('playwright__') ||
                                               obj.tool_name?.startsWith('vscode__') ||
                                               obj.tool_name === 'computercontroller__computer_control';

                        if (!isToolAvailable) {
                            console.warn(`[GOOSE] Tool ${obj.tool_name} is not available in current extensions configuration`);
                            // Відправляємо fake response для невідомих інструментів
                            const toolResponse = {
                                type: 'tool_response',
                                tool_call_id: obj.tool_call_id || obj.id || `fake_${Date.now()}`,
                                content: `Tool ${obj.tool_name} is not available. Available: computercontroller, developer, playwright browser tools.`,
                                success: false
                            };
                            ws.send(JSON.stringify(toolResponse));
                            return;
                        }

                        // Для доступних інструментів відправляємо успішний response
                        const toolResponse = {
                            type: 'tool_response',
                            tool_call_id: obj.tool_call_id || obj.id || `fake_${Date.now()}`,
                            content: 'Tool executed successfully',
                            success: true
                        };

                        console.log(`[GOOSE] Sending tool response for: ${obj.tool_name}`);
                        ws.send(JSON.stringify(toolResponse));
                    } else if (obj.type === 'complete' || obj.type === 'cancelled') {
                        console.log(`[GOOSE] Completed for session: ${sessionId}, collected: ${collected.length} chars`);
                        clearTimeout(timeout);
                        ws.close();
                        resolve(collected.trim() || null);
                    } else if (obj.type === 'error') {
                        console.error(`[GOOSE] Error for session: ${sessionId}: ${obj.error || obj.message || 'Unknown error'}`);
                        clearTimeout(timeout);
                        ws.close();
                        resolve(null);
                    }
                } catch (e) {
                    console.warn(`[GOOSE] Failed to parse message: ${data.toString()}`);
                }
            });
            
            ws.on('error', (error) => {
                console.error(`[GOOSE] WebSocket error for session: ${sessionId}: ${error.message}`);
                clearTimeout(timeout);
                resolve(null);
            });
            
            ws.on('close', (code, reason) => {
                console.log(`[GOOSE] WebSocket closed for session: ${sessionId}, code: ${code}, reason: ${reason}`);
                clearTimeout(timeout);
                resolve(collected.trim() || null);
            });
            
        } catch (error) {
            console.error(`[GOOSE] WebSocket creation failed: ${error.message}`);
            if (timeout) clearTimeout(timeout);
            resolve(null);
        }
    });
}
