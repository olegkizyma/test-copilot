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

// TTS синхронізація через РЕАЛЬНІ ПОДІЇ (не таймери)
const ttsCompletionEvents = new Map(); // Зберігаємо Promise для кожного voice

export async function sendToTTSAndWait(text, voice = 'dmytro') {
    const ttsUrl = process.env.TTS_URL || 'http://localhost:3001';
    
    try {
        logMessage('info', `Sending to TTS (${voice}): ${text.substring(0, 50)}...`);
        
        // 1. Створюємо Promise для очікування події завершення
        const completionPromise = new Promise((resolve) => {
            ttsCompletionEvents.set(voice, resolve);
        });
        
        // 2. Відправляємо на TTS генерацію (тільки генеруємо, не повертаємо аудіо)
        const response = await axios.post(`${ttsUrl}/tts`, {
            text: text,
            voice: voice,
            return_audio: false
        }, {
            timeout: 30000
        });
        
        if (response.data.status === 'success') {
            logMessage('info', `TTS generated for ${voice}, waiting for playback completion event...`);
            
            // 3. Повідомляємо frontend про необхідність відтворення
            await notifyFrontendToPlayTTS(text, voice);
            
            // 4. Чекаємо РЕАЛЬНУ подію завершення озвучення
            await completionPromise;
            
            logMessage('info', `TTS playback completed for ${voice} (received completion event)`);
            return true;
        }
    } catch (error) {
        logMessage('warn', `TTS failed: ${error.message}`);
        // Очищаємо Promise при помилці
        ttsCompletionEvents.delete(voice);
        
        // Fallback - мінімальна пауза
        await new Promise(resolve => setTimeout(resolve, 2000));
        logMessage('info', `TTS fallback completed for ${voice}`);
    }
    
    return false;
}

// Функція для повідомлення frontend про необхідність відтворення TTS
async function notifyFrontendToPlayTTS(text, voice) {
    try {
        // Можна використати WebSocket або HTTP запит до frontend
        // Поки що використаємо простий підхід - frontend сам буде запитувати TTS
        logMessage('info', `Frontend should play TTS for voice: ${voice}, text: ${text.substring(0, 50)}...`);
        
        // TODO: Реалізувати WebSocket повідомлення або інший механізм
        // Поки що frontend має сам відтворювати TTS коли отримує повідомлення від агента
        
    } catch (error) {
        logMessage('warn', `Failed to notify frontend about TTS: ${error.message}`);
    }
}

// Функція для отримання події завершення TTS (викликається фронтендом)
export function notifyTTSCompleted(voice) {
    const resolver = ttsCompletionEvents.get(voice);
    if (resolver) {
        resolver();
        ttsCompletionEvents.delete(voice);
        logMessage('info', `[TTS] Audio playback completed for ${voice}`);
    }
}

// Функція очікування завершення TTS
export async function waitForTTSCompletion(text, voice) {
    try {
        const ttsResponse = await axios.post('http://localhost:3001/tts', {
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
