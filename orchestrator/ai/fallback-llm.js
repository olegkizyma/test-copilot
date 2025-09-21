/**
 * FALLBACK LLM INTEGRATION
 * Інтеграція з локальним fallback LLM сервером
 */

import axios from 'axios';

// Імпортуємо нові модулі
const logger = require('../utils/logger');
const agentProtocol = require('../agents/agent-protocol');

// Model registry
const MODELS = [
    'mistral-ai/ministral-3b',
    'mistral-ai/mistral-small-2503', 
    'mistral-ai/mistral-nemo',
    'openai/gpt-4o-mini',
    'microsoft/phi-3.5-mini-instruct',
    'microsoft/phi-4-mini-instruct',
    'meta/meta-llama-3.1-8b-instruct'
];

// Token budget controls
const MAX_INPUT_TOKENS = parseInt(process.env.FALLBACK_MAX_INPUT_TOKENS || '8000', 10);
const TRUNCATE_STRATEGY = String(process.env.FALLBACK_TRUNCATE_STRATEGY || 'clip').toLowerCase();

// Estimate token usage (approximate: 1 token ~= 4 chars)
function estimateTokens(messages) {
    try {
        let totalChars = 0;
        for (const m of messages) {
            const c = typeof m?.content === 'string'
                ? m.content
                : Array.isArray(m?.content)
                    ? m.content.map(x => (typeof x?.text === 'string' ? x.text : '')).join(' ')
                    : '';
            totalChars += (c || '').length;
        }
        return Math.ceil(totalChars / 4);
    } catch {
        return 0;
    }
}

function truncateToBudget(messages, budgetTokens) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user') || messages[messages.length - 1];
    const str = typeof lastUser?.content === 'string'
        ? lastUser.content
        : Array.isArray(lastUser?.content)
            ? lastUser.content.map(x => (typeof x?.text === 'string' ? x.text : '')).join(' ')
            : '';
    const maxChars = Math.max(0, budgetTokens * 4);
    const clipped = str.length > maxChars ? (str.slice(0, maxChars) + '…') : str;
    return [{ role: 'user', content: clipped }];
}

// Chat completion function
export async function chatCompletion(messages, options = {}) {
    const { 
        model = MODELS[0], 
        max_tokens = 400, 
        temperature = 0.7,
        stream = false,
        baseUrl = 'http://localhost:4000'
    } = options;

    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and cannot be empty');
    }

    const promptTokens = estimateTokens(messages);
    let effectiveMessages = messages;
    let atlas_truncated = false;

    if (promptTokens > MAX_INPUT_TOKENS) {
        if (TRUNCATE_STRATEGY === 'reject') {
            throw new Error(`Token limit exceeded: ${promptTokens} > ${MAX_INPUT_TOKENS}`);
        } else {
            effectiveMessages = truncateToBudget(messages, MAX_INPUT_TOKENS);
            atlas_truncated = true;
        }
    }

    try {
        const response = await axios.post(`${baseUrl}/v1/chat/completions`, {
            model,
            messages: effectiveMessages,
            max_tokens,
            temperature,
            stream
        }, {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (stream) {
            return response; // Return raw response for streaming
        }

        return {
            id: response.data.id,
            object: response.data.object,
            created: response.data.created,
            model: response.data.model,
            choices: response.data.choices,
            usage: {
                ...response.data.usage,
                atlas_truncated
            }
        };
    } catch (error) {
        console.error('[FALLBACK-LLM] Request failed:', error.message);
        
        // Fallback to simple rule-based response
        const userMsg = effectiveMessages.slice().reverse().find(m => m.role === 'user')?.content || '';
        const reply = generateSimpleReply(userMsg, model);
        
        return {
            id: 'fallback_' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now()/1000),
            model: model,
            choices: [{
                index: 0,
                message: { role: 'assistant', content: reply },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: atlas_truncated ? MAX_INPUT_TOKENS : promptTokens,
                completion_tokens: Math.ceil(reply.length / 4),
                total_tokens: (atlas_truncated ? MAX_INPUT_TOKENS : promptTokens) + Math.ceil(reply.length / 4),
                atlas_truncated
            }
        };
    }
}

// Get available models
export function getAvailableModels() {
    return MODELS.map(m => ({ 
        id: m, 
        object: 'model', 
        created: Date.now(), 
        owned_by: 'atlas-fallback' 
    }));
}

// Process function for agent protocol compatibility
export async function process(input, options = {}) {
  try {
    logger.info('Активація запасної LLM моделі');
    
    // Форматування запиту згідно протоколу
    const query = agentProtocol.createQuery(input, {
      isFallback: true,
      options
    });
    
    // Перетворення input в формат messages для chatCompletion
    const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
    const result = await chatCompletion(messages, options);
    
    // Форматування відповіді згідно протоколу
    return agentProtocol.createResponse(result);
  } catch (error) {
    logger.error(`Помилка запасної LLM: ${error.message}`);
    return agentProtocol.createError(error.message, 'FALLBACK_LLM_ERROR');
  }
}

// Simple rule-based reply generation
function generateSimpleReply(user, model) {
    const u = String(user || '').trim();
    if (!u) return 'Я тут. Чим допомогти?';
    if (/привіт|вітаю|hello|hi/i.test(u)) return 'Привіт! Я локальний фолбек. Чим допомогти?';
    if (/як.*зват|хто ти|your name/i.test(u)) return 'Я локальний фолбек ATLAS. Можете продовжити питання.';
    
    // lightweight echo with safety cap
    const maxLen = 600;
    const echo = u.length > maxLen ? u.slice(0, maxLen) + '…' : u;
    return `Коротко по суті: ${echo}`;
}
