/**
 * Конфігурація системи голосового управління ATLAS
 * Налаштування для розпізнавання ключового слова та відповідей
 */

export const VOICE_CONFIG = {
    // Ключове слово для активації
    ACTIVATION_KEYWORD: 'атлас',
    
    // 20 варіантів відповідей при розпізнаванні ключового слова
    ACTIVATION_RESPONSES: [
        'я уважно Вас слухаю Олег Миколайович',
        'так творець, ви мене звали',
        'весь в увазі',
        'слухаю',
        'так, Олег Миколайович',
        'я тут, що потрібно?',
        'готовий до роботи',
        'на зв\'язку',
        'слухаю уважно',
        'так, творець',
        'що бажаєте?',
        'я готовий допомогти',
        'у вашому розпорядженні',
        'слухаю команди',
        'готовий до виконання',
        'так, шефе',
        'активований та готовий',
        'всі системи в нормі, слухаю',
        'підключений, очікую інструкцій',
        'готовий працювати, Олег Миколайович'
    ],
    
    // Налаштування розпізнавання мови
    SPEECH_RECOGNITION: {
        language: 'uk-UA', // Українська мова
        continuous: true,
        interimResults: true,
        maxAlternatives: 3
    },
    
    // Налаштування кнопки мікрофону
    MICROPHONE_BUTTON: {
        holdDuration: 2000, // 2 секунди для активації режиму ключового слова
        clickTimeout: 300,  // Час для визначення короткого кліку
    },
    
    // Налаштування Whisper
    WHISPER_CONFIG: {
        model: 'whisper-1', // або 'large-v3' коли буде доступний
        language: 'uk',
        response_format: 'json',
        temperature: 0.2
    },
    
    // Статуси кнопки мікрофону
    BUTTON_STATES: {
        IDLE: 'idle',
        LISTENING: 'listening', 
        KEYWORD_MODE: 'keyword_mode',
        PROCESSING: 'processing'
    },
    
    // Іконки для різних станів
    BUTTON_ICONS: {
        IDLE: '🎤',
        LISTENING: '🔴',
        KEYWORD_MODE: '👂',
        PROCESSING: '⏳'
    }
};

export default VOICE_CONFIG;