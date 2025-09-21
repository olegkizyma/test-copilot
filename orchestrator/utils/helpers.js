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
        // Використовуємо глобальну змінну для зберігання поточного TTS запиту
        // Frontend буде опитувати цей endpoint для отримання TTS запитів
        global.pendingTTSRequest = {
            text: text,
            voice: voice,
            timestamp: Date.now(),
            id: `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        logMessage('info', `TTS request queued for frontend: voice=${voice}, id=${global.pendingTTSRequest.id}`);
        return true;
    } catch (error) {
        logMessage('warn', `Failed to queue TTS request: ${error.message}`);
        return false;
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
