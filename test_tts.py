#!/usr/bin/env python3
"""
Простий тест TTS сервера
"""

import requests
import json

def test_tts():
    print("🔊 Тестування TTS сервера...")
    
    # 1. Перевіряємо health
    try:
        response = requests.get('http://localhost:3001/health', timeout=5)
        print(f"✅ Health check: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False
    
    # 2. Тестуємо генерацію TTS
    try:
        print("\n🎵 Генеруємо тестове аудіо...")
        tts_data = {
            "text": "Привіт! Це тест українського TTS.",
            "voice": "dmytro",
            "return_audio": True
        }
        
        response = requests.post('http://localhost:3001/tts', 
                               json=tts_data, 
                               timeout=30)
        
        if response.status_code == 200:
            # Перевіряємо чи це аудіо файл
            content_type = response.headers.get('content-type', '')
            if 'audio' in content_type:
                print(f"✅ TTS генерація успішна!")
                print(f"   Content-Type: {content_type}")
                print(f"   Розмір файлу: {len(response.content)} байт")
                
                # Зберігаємо файл для тесту
                with open('/tmp/test_tts.wav', 'wb') as f:
                    f.write(response.content)
                print(f"   Файл збережено: /tmp/test_tts.wav")
                
                return True
            else:
                print(f"❌ Неправильний content-type: {content_type}")
                print(f"   Response: {response.text[:200]}...")
                return False
        else:
            print(f"❌ TTS помилка: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ TTS генерація failed: {e}")
        return False

if __name__ == "__main__":
    success = test_tts()
    if success:
        print("\n🎉 TTS тест пройшов успішно!")
        print("💡 Спробуйте відтворити файл: /tmp/test_tts.wav")
    else:
        print("\n💥 TTS тест провалився!")
