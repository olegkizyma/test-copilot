/**
 * AI STATE ANALYZER
 * Аналіз станів агентів за допомогою AI
 */

import axios from 'axios';
import { STATE_ANALYSIS_PROMPTS, FALLBACK_ANALYSIS_RULES, DEFAULT_STATES } from '../../prompts/system/state_analysis_prompts.js';

// Функція для аналізу відповіді агента за допомогою AI
export async function analyzeAgentResponse(agent, response, stage) {
    console.log(`[AI ANALYZER] Analyzing ${agent} response for stage: ${stage}`);
    
    // Перевіряємо чи response не undefined
    if (!response || response === 'undefined' || typeof response !== 'string') {
        console.warn(`[AI Analysis] Invalid response for ${agent}/${stage}:`, response);
        return {
            predicted_state: getDefaultState(stage),
            confidence: 0.1
        };
    }
    
    // Функція для отримання дефолтного стану
    function getDefaultState(stage) {
        return DEFAULT_STATES[stage] || 'needs_analysis';
    }

    // Використовуємо імпортовані промпти
    const systemPrompts = STATE_ANALYSIS_PROMPTS;

    const systemPrompt = systemPrompts[stage] || `You are analyzing Ukrainian agent responses.
Return ONLY a valid JSON object with these exact fields:
{
    "predicted_state": string,
    "confidence": number (0.0-1.0)
}
DO NOT include any additional text, markdown formatting or explanation.`;
    
    // Використовуємо GPT-4o-mini для аналізу (оптимальний баланс якості та швидкості)
    const MODEL = 'openai/gpt-4o-mini';

    // Формуємо чіткий prompt для аналізу
    const userPrompt = `
CONTEXT:
Agent: ${agent}
Current Stage: ${stage}
Response to Analyze: "${response.trim()}"

TASK:
1. Analyze the response considering:
   - Agent's role and capabilities
   - Stage requirements and expectations
   - Ukrainian language context and meaning
   - Specific indicators mentioned in the system prompt

2. Return ONLY valid JSON with predicted_state and confidence (0.0-1.0)
3. Be precise and consider context carefully
4. Higher confidence for clear indicators, lower for ambiguous cases

ANALYZE NOW:`;

    try {
        // Використовуємо локальний fallback LLM сервер
        const response_ai = await axios.post('http://localhost:4000/v1/chat/completions', {
            model: MODEL,
            temperature: 0.1,
            max_tokens: 100,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        }, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (response_ai.data?.choices?.[0]?.message?.content) {
            const content = response_ai.data.choices[0].message.content.trim();
            console.log(`[AI Analysis] Raw response: ${content}`);
            
            try {
                const result = JSON.parse(content);
                if (result.predicted_state && typeof result.confidence === 'number') {
                    console.log(`[AI Analysis] Success: ${agent}/${stage} -> ${result.predicted_state} (${result.confidence})`);
                    return result;
                }
            } catch (parseError) {
                console.warn(`[AI Analysis] JSON parse error: ${parseError.message}`);
            }
        }
        
        // Fallback до локального аналізу
        console.warn(`[AI Analysis] Invalid AI response, using fallback for ${agent}/${stage}`);
        return localFallbackAnalysis(stage, response);
        
    } catch (error) {
        console.error('AI Model Error:', error.message);
        // Fallback для локального аналізу
        return localFallbackAnalysis(stage, response);
    }
}

// Локальний fallback аналіз для української мови
function localFallbackAnalysis(stage, response) {
    const text = response.toLowerCase();
    const rules = FALLBACK_ANALYSIS_RULES[stage];
    
    if (!rules) {
        return { predicted_state: 'needs_analysis', confidence: 0.3 };
    }
    
    // Перевіряємо кожен стан в правилах
    for (const [state, config] of Object.entries(rules)) {
        if (state === 'default') continue;
        
        const patterns = config.patterns;
        let matches = 0;
        
        for (const pattern of patterns) {
            if (text.includes(pattern)) {
                matches++;
                if (!config.requiresAll) {
                    // Якщо не потрібно всі паттерни, повертаємо при першому збігу
                    return { predicted_state: state, confidence: config.confidence };
                }
            }
        }
        
        // Якщо потрібно всі паттерни і всі знайдені
        if (config.requiresAll && matches === patterns.length) {
            return { predicted_state: state, confidence: config.confidence };
        }
    }
    
    // Повертаємо дефолтний стан
    const defaultConfig = rules.default;
    return { 
        predicted_state: defaultConfig.state, 
        confidence: defaultConfig.confidence 
    };
}
