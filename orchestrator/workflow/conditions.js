/**
 * WORKFLOW CONDITIONS
 * Умови переходу між етапами workflow
 */

import { analyzeAgentResponse } from '../ai/state-analyzer.js';

export const WORKFLOW_CONDITIONS = {
    async tetyana_needs_clarification(data) {
        if (!data?.response?.content || data.response.agent !== 'tetyana') return false;
        const aiAnalysis = await analyzeAgentResponse('tetyana', data.response.content, 'execution');
        console.log(`[WORKFLOW] Tetyana clarification check: ${aiAnalysis.predicted_state} (confidence: ${aiAnalysis.confidence})`);
        return aiAnalysis.predicted_state === 'needs_clarification' && aiAnalysis.confidence > 0.6;
    },

    async atlas_provided_clarification(data) {
        if (!data?.response?.content || data.response.agent !== 'atlas') return false;
        const aiAnalysis = await analyzeAgentResponse('atlas', data.response.content, 'clarification');
        return aiAnalysis.predicted_state === 'clarified' && aiAnalysis.confidence > 0.6;
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
        
        // Перевіряємо чи верифікація не пройшла
        const lastGrishaResponse = session.history?.filter(r => r.agent === 'grisha').pop();
        if (lastGrishaResponse) {
            return await this.verification_failed({ response: lastGrishaResponse, session });
        }
        
        return false;
    }
};
