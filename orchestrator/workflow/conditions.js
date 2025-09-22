/**
 * WORKFLOW CONDITIONS
 * Умови переходу між етапами workflow
 */

import { analyzeAgentResponse } from '../ai/state-analyzer.js';

export const WORKFLOW_CONDITIONS = {
    async system_selected_chat(data) {
        // Очікуємо результат класифікації у session.modeSelection
        const session = data?.session;
        const lastSystem = session?.history?.filter(r => r.agent === 'system').pop();
        let mode = session?.modeSelection?.mode;
        if (!mode && lastSystem?.meta?.modeSelection) {
            mode = lastSystem.meta.modeSelection.mode;
        }
        return mode === 'chat';
    },

    async system_selected_task(data) {
        const session = data?.session;
        const lastSystem = session?.history?.filter(r => r.agent === 'system').pop();
        let mode = session?.modeSelection?.mode;
        if (!mode && lastSystem?.meta?.modeSelection) {
            mode = lastSystem.meta.modeSelection.mode;
        }
        return mode === 'task';
    },
    async tetyana_needs_clarification(data) {
        if (!data?.response?.content || data.response.agent !== 'tetyana') return false;
        const aiAnalysis = await analyzeAgentResponse('tetyana', data.response.content, 'execution');
        console.log(`[WORKFLOW] Tetyana clarification check: ${aiAnalysis.predicted_state} (confidence: ${aiAnalysis.confidence})`);
        return aiAnalysis.predicted_state === 'needs_clarification' && aiAnalysis.confidence > 0.6;
    },

    async atlas_provided_clarification(data) {
        if (!data?.response?.content || data.response.agent !== 'atlas') return false;

        // Проверяем, действительно ли Atlas предоставил уточнения
        const content = data.response.content.toLowerCase();
        const hasClarificationKeywords = content.includes('уточнення') ||
                                       content.includes('пояснення') ||
                                       content.includes('виправлення') ||
                                       content.includes('зміни') ||
                                       content.includes('correction') ||
                                       content.includes('clarification');

        if (!hasClarificationKeywords) {
            console.log(`[WORKFLOW] Atlas response doesn't contain clarification keywords: ${content.substring(0, 100)}...`);
            return false;
        }

        const aiAnalysis = await analyzeAgentResponse('atlas', data.response.content, 'clarification');
        const result = aiAnalysis.predicted_state === 'clarified' && aiAnalysis.confidence > 0.7;
        console.log(`[WORKFLOW] Atlas clarification check: ${result} (confidence: ${aiAnalysis.confidence})`);
        return result;
    },

    async tetyana_still_blocked(data) {
        if (!data?.response?.content || data.response.agent !== 'tetyana') return false;
        const aiAnalysis = await analyzeAgentResponse('tetyana', data.response.content, 'block_detection');
        return aiAnalysis.predicted_state === 'blocked' && aiAnalysis.confidence > 0.7;
    },

    async grisha_provided_diagnosis(data) {
        if (!data?.response?.content || data.response.agent !== 'grisha') return false;
        // Гриша завжди надає діагностику якщо його викликали
        return data.response.content.length > 50; // Мінімальна довжина відповіді
    },

    async tetyana_completed_task(data) {
        if (!data?.response?.content || data.response.agent !== 'tetyana') return false;
        const aiAnalysis = await analyzeAgentResponse('tetyana', data.response.content, 'task_completion');
        console.log(`[WORKFLOW] Tetyana completion check: ${aiAnalysis.predicted_state} (confidence: ${aiAnalysis.confidence})`);
        return aiAnalysis.predicted_state === 'completed' && aiAnalysis.confidence > 0.7;
    },

    async verification_failed(data) {
        if (!data?.response?.content || data.response.agent !== 'grisha') return false;
        const aiAnalysis = await analyzeAgentResponse('grisha', data.response.content, 'verification_check');
        console.log(`[WORKFLOW] Grisha verification check: ${aiAnalysis.predicted_state} (confidence: ${aiAnalysis.confidence})`);
        return aiAnalysis.predicted_state === 'verification_failed' && aiAnalysis.confidence > 0.6;
    },

    async should_complete_workflow(data) {
        // Завершуємо workflow якщо верифікація пройшла або досягнуто ліміт циклів
        const session = data?.session;
        if (!session) return false;
        
        const lastGrishaResponse = session.history?.filter(r => r.agent === 'grisha').pop();
        if (lastGrishaResponse) {
            const verificationFailed = await this.verification_failed({ response: lastGrishaResponse, session });
            if (!verificationFailed) return true; // Верифікація пройшла
        }
        
        // Або досягнуто максимум циклів
        return (session.retryCycle || 0) >= 3;
    },

    async should_retry_cycle(data) {
        const session = data?.session;
        if (!session) return false;
        
        // Перевіряємо чи не досягнуто ліміт циклів
        const currentCycle = session.retryCycle || 0;
        if (currentCycle >= 2) return false; // Максимум 3 цикли (0, 1, 2)
        
        // Перевіряємо чи верифікація не пройшла - прямий аналіз відповіді Гріши
        const lastGrishaResponse = session.history?.filter(r => r.agent === 'grisha').pop();
        if (lastGrishaResponse && lastGrishaResponse.content) {
            const content = lastGrishaResponse.content.toLowerCase();
            
            // Прямі індикатори того, що потрібен новий круг
            const retryIndicators = [
                'завдання не виконано',
                'потрібен новий круг',
                'завдання виконано частково',
                'потрібно доробити',
                'не підтверджую',
                'відхилено',
                'знайдено помилки',
                'є проблеми'
            ];
            
            const needsRetry = retryIndicators.some(indicator => content.includes(indicator));
            
            if (needsRetry) {
                console.log(`[WORKFLOW] Grisha indicated retry needed: ${lastGrishaResponse.content.substring(0, 100)}...`);
                return true;
            }
        }
        
        // Fallback до AI аналізу якщо прямий аналіз не спрацював
        if (lastGrishaResponse) {
            return await this.verification_failed({ response: lastGrishaResponse, session });
        }
        
        return false;
    }
};
