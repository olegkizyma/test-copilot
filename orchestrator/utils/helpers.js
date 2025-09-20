/**
 * UTILITY HELPERS
 * Допоміжні функції для оркестратора
 */

import axios from 'axios';

// Helper functions
export const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const logMessage = (level, message) => {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
};

// TTS синхронізація
export async function sendToTTSAndWait(text, voice = 'dmytro') {
    const ttsUrl = process.env.TTS_URL || 'http://localhost:3001';
    
    try {
        logMessage('info', `Sending to TTS (${voice}): ${text.substring(0, 50)}...`);
        
        const response = await axios.post(`${ttsUrl}/synthesize`, {
            text: text,
            voice: voice,
            wait: true // Чекаємо завершення озвучення
        }, {
            timeout: 30000 // 30 секунд максимум
        });
        
        if (response.data.success) {
            // Додаткова пауза після озвучення для природності
            await new Promise(resolve => setTimeout(resolve, 1000));
            logMessage('info', `TTS completed for voice: ${voice}`);
            return true;
        }
    } catch (error) {
        logMessage('warn', `TTS failed: ${error.message}`);
        // Fallback - пауза без TTS
        const estimatedDuration = Math.min(text.length * 50, 5000); // ~50ms на символ, макс 5 сек
        await new Promise(resolve => setTimeout(resolve, estimatedDuration));
    }
    
    return false;
}

// Функція очікування завершення TTS
export async function waitForTTSCompletion(text, voice) {
    try {
        const ttsResponse = await axios.post('http://localhost:3001/synthesize', {
            text: text,
            voice: voice || 'dmytro',
            wait_for_completion: true
        }, {
            timeout: 30000 // 30 секунд максимум
        });
        
        if (ttsResponse.data && ttsResponse.data.status === 'completed') {
            return true;
        } else {
            throw new Error('TTS did not complete successfully');
        }
    } catch (error) {
        logMessage('warn', `TTS completion check failed: ${error.message}`);
        throw error;
    }
}
