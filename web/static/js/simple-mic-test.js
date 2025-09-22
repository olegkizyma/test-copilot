// Простой тест кнопки микрофона без зависимостей
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Simple microphone test loaded');
    
    const micButton = document.getElementById('microphone-btn');
    if (!micButton) {
        console.error('❌ Microphone button not found');
        return;
    }
    
    console.log('✅ Microphone button found:', micButton);
    
    // Простые обработчики событий
    micButton.addEventListener('mousedown', function(e) {
        console.log('👇 Microphone button mousedown');
        micButton.classList.add('listening');
        micButton.style.background = 'rgba(255, 0, 0, 0.3)';
        
        const buttonText = micButton.querySelector('.btn-text');
        if (buttonText) {
            buttonText.textContent = '🔴';
        }
    });
    
    micButton.addEventListener('mouseup', function(e) {
        console.log('👆 Microphone button mouseup');
        micButton.classList.remove('listening');
        micButton.style.background = '';
        
        const buttonText = micButton.querySelector('.btn-text');
        if (buttonText) {
            buttonText.textContent = '🎤';
        }
        
        // Тестируем Whisper результаты
        if (window.whisperResultsManager) {
            console.log('✅ Adding test result to table');
            window.whisperResultsManager.addWhisperTranscription(
                'Тест мікрофону працює! ' + new Date().toLocaleTimeString(),
                'short',
                'uk'
            );
        } else {
            console.warn('⚠️ Whisper Results Manager not available');
        }
    });
    
    micButton.addEventListener('mouseleave', function(e) {
        console.log('👋 Microphone button mouseleave');
        micButton.classList.remove('listening');
        micButton.style.background = '';
        
        const buttonText = micButton.querySelector('.btn-text');
        if (buttonText) {
            buttonText.textContent = '🎤';
        }
    });
    
    console.log('✅ Simple microphone handlers attached');
    
    // Добавим тестовый результат в таблицу
    setTimeout(() => {
        if (window.whisperResultsManager) {
            window.whisperResultsManager.addWhisperTranscription(
                'Система ініціалізована',
                'short',
                'uk'
            );
            console.log('✅ Test result added to table');
        }
    }, 1000);
});