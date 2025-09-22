/**
 * Тестовый скрипт для проверки работы голосового управления ATLAS
 */

// Функция для проверки состояния системы
function checkSystemStatus() {
    console.log('🔍 Checking ATLAS system status...');
    
    // Проверяем основные элементы DOM
    const micButton = document.getElementById('microphone-btn');
    const whisperTable = document.getElementById('whisper-results-table');
    const messageInput = document.getElementById('message-input');
    
    console.log('📋 DOM Elements Status:');
    console.log('  • Microphone button:', micButton ? '✅ Found' : '❌ Missing');
    console.log('  • Whisper table:', whisperTable ? '✅ Found' : '❌ Missing');
    console.log('  • Message input:', messageInput ? '✅ Found' : '❌ Missing');
    
    // Проверяем глобальные объекты
    console.log('🌐 Global Objects Status:');
    console.log('  • atlasApp:', window.atlasApp ? '✅ Available' : '❌ Missing');
    console.log('  • atlasChat:', window.atlasChat ? '✅ Available' : '❌ Missing');
    console.log('  • whisperResultsManager:', window.whisperResultsManager ? '✅ Available' : '❌ Missing');
    
    // Проверяем состояние приложения
    if (window.atlasApp) {
        const status = window.atlasApp.getStatus();
        console.log('📊 App Status:', status);
        
        if (window.atlasApp.managers.voiceControl) {
            console.log('🎤 Voice Control Manager:', window.atlasApp.managers.voiceControl.isReady() ? '✅ Ready' : '❌ Not Ready');
        }
    }
    
    return {
        micButton,
        whisperTable,
        messageInput,
        atlasApp: window.atlasApp,
        atlasChat: window.atlasChat,
        whisperResultsManager: window.whisperResultsManager
    };
}

// Функция для тестирования Whisper сервиса
async function testWhisperService() {
    console.log('🧪 Testing Whisper service...');
    
    try {
        const response = await fetch('http://localhost:3002/health');
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Whisper service available:', data);
            return true;
        } else {
            console.error('❌ Whisper service error:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ Whisper service connection failed:', error);
        return false;
    }
}

// Функция для добавления тестового результата в таблицу
function testWhisperResults() {
    console.log('🧪 Testing Whisper results table...');
    
    if (window.whisperResultsManager) {
        // Добавляем тестовый результат
        window.whisperResultsManager.addWhisperTranscription(
            'Тестове повідомлення для перевірки системи',
            'short',
            'uk'
        );
        
        console.log('✅ Test result added to table');
        return true;
    } else {
        console.error('❌ Whisper Results Manager not available');
        return false;
    }
}

// Функция для симуляции клика на кнопку микрофона
function testMicrophoneButton() {
    console.log('🧪 Testing microphone button...');
    
    const micButton = document.getElementById('microphone-btn');
    if (!micButton) {
        console.error('❌ Microphone button not found');
        return false;
    }
    
    console.log('🎤 Microphone button found, simulating click...');
    
    // Симулируем mousedown
    const mouseDownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
    });
    micButton.dispatchEvent(mouseDownEvent);
    
    // Через 100мс симулируем mouseup (короткий клик)
    setTimeout(() => {
        const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        micButton.dispatchEvent(mouseUpEvent);
        console.log('✅ Short click simulated');
    }, 100);
    
    return true;
}

// Функция для проверки медиа разрешений
async function testMediaPermissions() {
    console.log('🧪 Testing media permissions...');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('✅ Microphone access granted');
        
        // Останавливаем поток
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('❌ Microphone access denied:', error);
        return false;
    }
}

// Основная функция диагностики
async function runDiagnostics() {
    console.log('🚀 Starting ATLAS Voice Control Diagnostics...');
    console.log('=' .repeat(50));
    
    // Проверяем статус системы
    const systemStatus = checkSystemStatus();
    
    // Проверяем Whisper сервис
    const whisperStatus = await testWhisperService();
    
    // Проверяем медиа разрешения
    const mediaStatus = await testMediaPermissions();
    
    // Тестируем таблицу результатов
    const tableStatus = testWhisperResults();
    
    // Тестируем кнопку микрофона
    const buttonStatus = testMicrophoneButton();
    
    console.log('=' .repeat(50));
    console.log('📋 Diagnostics Summary:');
    console.log('  • System Status:', systemStatus.atlasApp ? '✅' : '❌');
    console.log('  • Whisper Service:', whisperStatus ? '✅' : '❌');
    console.log('  • Media Permissions:', mediaStatus ? '✅' : '❌');
    console.log('  • Results Table:', tableStatus ? '✅' : '❌');
    console.log('  • Microphone Button:', buttonStatus ? '✅' : '❌');
    console.log('=' .repeat(50));
    
    return {
        system: systemStatus,
        whisper: whisperStatus,
        media: mediaStatus,
        table: tableStatus,
        button: buttonStatus
    };
}

// Экспортируем функции для использования в консоли
window.atlasDiagnostics = {
    checkSystemStatus,
    testWhisperService,
    testWhisperResults,
    testMicrophoneButton,
    testMediaPermissions,
    runDiagnostics
};

// Автоматически запускаем диагностику через 2 секунды после загрузки
setTimeout(() => {
    if (document.readyState === 'complete') {
        runDiagnostics();
    }
}, 2000);

console.log('🔧 ATLAS Diagnostics loaded. Use window.atlasDiagnostics.runDiagnostics() to run tests manually.');