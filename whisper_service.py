#!/usr/bin/env python3
"""
ATLAS Whisper Speech Recognition Service
Сервіс для розпізнавання мови з використанням faster-whisper Large v3
"""

import os
import io
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger('atlas.whisper')

# Конфігурація
WHISPER_PORT = int(os.environ.get('WHISPER_PORT', 3002))
WHISPER_MODEL = 'medium'  # Змінюємо на більш стабільну модель
DEVICE = "auto"  # faster-whisper автоматично обере найкращий пристрій
COMPUTE_TYPE = "float32"  # Для стабільності на Apple Silicon

# Створення Flask app
app = Flask(__name__)
CORS(app)

# Глобальні змінні для моделі
whisper_model = None

def is_valid_transcription(text: str, duration: float) -> bool:
    """Проста валідація результату транскрипції.
    Відсіюємо порожні, занадто короткі або підозрілі результати.
    """
    try:
        if text is None:
            return False
        t = text.strip()
        if not t:
            return False
        # Якщо запис був відносно довгим, а текст занадто короткий — відфільтровуємо
        if duration is not None:
            try:
                d = float(duration)
            except Exception:
                d = 0.0
        else:
            d = 0.0
        if d >= 1.0 and len(t) < 3:
            return False
        # Відфільтрувати суцільне повторення одного символу
        if len(set(t)) <= 1:
            return False
        # Якщо текст довгий, але складається майже не з літер — підозріло
        if len(t) >= 10:
            letters = sum(1 for ch in t if ch.isalpha())
            if letters / max(1, len(t)) < 0.3:
                return False
        return True
    except Exception:
        # У випадку помилки в валідації — краще пропустити текст
        return True

def load_whisper_model():
    """Завантаження моделі faster-whisper Large v3"""
    global whisper_model
    
    if whisper_model is not None:
        return whisper_model
    
    logger.info(f"🤖 Завантаження faster-whisper {WHISPER_MODEL} моделі...")
    logger.info(f"Device: {DEVICE}, Compute type: {COMPUTE_TYPE}")
    start_time = datetime.now()
    
    try:
        # Завантажуємо Large v3 модель
        whisper_model = WhisperModel(
            WHISPER_MODEL,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=None,  # Використовуємо стандартну директорію
            local_files_only=False
        )
        
        load_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"✅ faster-whisper {WHISPER_MODEL} модель завантажена успішно за {load_time:.2f} секунд!")
        
        return whisper_model
        
    except Exception as e:
        logger.error(f"❌ Помилка завантаження моделі: {e}")
        
        # Fallback до CPU якщо не вдалося
        try:
            logger.info("Спроба fallback на CPU...")
            whisper_model = WhisperModel(
                WHISPER_MODEL,
                device="cpu",
                compute_type="float32"
            )
            load_time = (datetime.now() - start_time).total_seconds()
            logger.info(f"✅ Модель завантажена на CPU за {load_time:.2f} секунд")
            return whisper_model
            
        except Exception as cpu_e:
            logger.error(f"❌ CPU fallback також не вдався: {cpu_e}")
            return None

@app.route('/health')
def health():
    """Перевірка стану сервісу"""
    global whisper_model
    
    try:
        model_loaded = whisper_model is not None
        return jsonify({
            'status': 'ok',
            'model_loaded': model_loaded,
            'model_name': WHISPER_MODEL if model_loaded else None,
            'model': WHISPER_MODEL if model_loaded else None,  # для фронтенд-сумісності
            'device': DEVICE,
            'compute_type': COMPUTE_TYPE,
            'timestamp': datetime.now().isoformat(),
            'service': 'atlas-whisper-large-v3'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    """
    Розпізнавання мови з аудіо файлу
    
    Expected:
    - audio file in request.files['audio']
    - optional: language (uk, en, etc.)
    
    Returns:
    - JSON with transcribed text
    """
    try:
        # Перевіряємо наявність аудіо файлу
        if 'audio' not in request.files:
            return jsonify({
                'error': 'No audio file provided',
                'status': 'error'
            }), 400
        
        audio_file = request.files['audio']
        if audio_file.filename == '':
            return jsonify({
                'error': 'Empty audio file',
                'status': 'error'
            }), 400
        
        # Отримуємо мову (за замовчуванням українська)
        language = request.form.get('language', 'uk')
        
        logger.info(f"🎤 Transcribing audio file: {audio_file.filename}, language: {language}")
        
        # Завантажуємо модель якщо необхідно
        model = load_whisper_model()
        if model is None:
            return jsonify({
                'error': 'Whisper model not available',
                'status': 'error'
            }), 500
        
        # Додаткові параметри транскрипції
        beam_size = int(request.form.get('beam_size', 5))
        word_timestamps = request.form.get('word_timestamps', 'false').lower() == 'true'
        use_vad = request.form.get('use_vad', 'true').lower() == 'true'
        
        logger.info(f"Параметри: language={language}, beam_size={beam_size}, word_timestamps={word_timestamps}, use_vad={use_vad}")
        
        # Зберігаємо аудіо у тимчасовий файл
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            audio_file.save(temp_file.name)
            temp_path = temp_file.name
        
        try:
            # Розпізнаємо мову з Large v3
            start_time = datetime.now()
            
            # Налаштовуємо VAD параметри
            transcribe_params = {
                'beam_size': beam_size,
                'language': language if language != 'auto' else None,
                'word_timestamps': word_timestamps,
                'vad_filter': use_vad
            }
            
            if use_vad:
                transcribe_params['vad_parameters'] = dict(
                    min_silence_duration_ms=2000,  # Збільшуємо мінімальну тривалість мовчання
                    threshold=0.3,  # Знижуємо поріг детекції голосу для більшої чутливості
                    min_speech_duration_ms=100  # Мінімальна тривалість мови
                )
            
            segments, info = model.transcribe(temp_path, **transcribe_params)
            
            # Збираємо текст з усіх сегментів
            transcription_segments = []
            full_text_parts = []
            
            for segment in segments:
                segment_data = {
                    'start': segment.start,
                    'end': segment.end,
                    'text': segment.text
                }
                
                if word_timestamps and hasattr(segment, 'words'):
                    segment_data['words'] = [
                        {
                            'start': word.start,
                            'end': word.end,
                            'word': word.word,
                            'probability': word.probability
                        }
                        for word in segment.words
                    ]
                
                transcription_segments.append(segment_data)
                full_text_parts.append(segment.text)
            
            full_text = ' '.join(full_text_parts).strip()
            transcription_time = (datetime.now() - start_time).total_seconds()
            
            # Перевіряємо чи результат валідний
            if not is_valid_transcription(full_text, info.duration):
                logger.info(f"🚫 Результат відфільтровано: '{full_text}'")
                return jsonify({
                    'status': 'filtered',
                    'text': '',
                    'reason': 'Suspicious or too short transcription',
                    'original_text': full_text,
                    'duration': round(info.duration, 2),
                    'transcription_time': round(transcription_time, 2),
                    'timestamp': datetime.now().isoformat()
                })
            
            logger.info(f"✅ Транскрипція завершена за {transcription_time:.2f}с: '{full_text[:100]}...'")
            
            response_data = {
                'status': 'success',
                'text': full_text,
                'language': info.language,
                'language_probability': round(info.language_probability, 4),
                'duration': round(info.duration, 2),
                'transcription_time': round(transcription_time, 2),
                'model': WHISPER_MODEL,
                'segments': transcription_segments if word_timestamps else None,
                'timestamp': datetime.now().isoformat()
            }
            
            return jsonify(response_data)
            
        finally:
            # Видаляємо тимчасовий файл
            try:
                os.unlink(temp_path)
            except Exception as cleanup_error:
                logger.warning(f"Не вдалося видалити тимчасовий файл: {cleanup_error}")
                
    except Exception as e:
        logger.error(f"❌ Transcription error: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/transcribe_blob', methods=['POST'])
def transcribe_blob():
    """
    Розпізнавання мови з бінарних даних
    
    Expected:
    - binary audio data in request.data
    - optional: language in query params
    
    Returns:
    - JSON with transcribed text
    """
    try:
        # Перевіряємо наявність даних
        if not request.data:
            return jsonify({
                'error': 'No audio data provided',
                'status': 'error'
            }), 400
        
        # Отримуємо мову та параметри
        language = request.args.get('language', 'uk')
        use_vad = request.args.get('use_vad', 'true').lower() == 'true'
        
        logger.info(f"🎤 Transcribing audio blob ({len(request.data)} bytes), language: {language}, use_vad: {use_vad}")
        
        # Завантажуємо модель якщо необхідно
        model = load_whisper_model()
        if model is None:
            return jsonify({
                'error': 'Whisper model not available',
                'status': 'error'
            }), 500
        
        # Зберігаємо дані у тимчасовий файл
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            temp_file.write(request.data)
            temp_path = temp_file.name
        
        try:
            # Розпізнаємо мову
            start_time = datetime.now()
            
            # Налаштовуємо VAD параметри
            transcribe_params = {
                'language': language if language != 'auto' else None,
                'vad_filter': use_vad
            }
            
            if use_vad:
                transcribe_params['vad_parameters'] = dict(
                    min_silence_duration_ms=2000,  # Збільшуємо мінімальну тривалість мовчання
                    threshold=0.3,  # Знижуємо поріг детекції голосу для більшої чутливості
                    min_speech_duration_ms=100  # Мінімальна тривалість мови
                )
            
            segments, info = model.transcribe(temp_path, **transcribe_params)
            
            transcription_time = (datetime.now() - start_time).total_seconds()
            
            # Збираємо текст з усіх сегментів
            full_text_parts = []
            for segment in segments:
                full_text_parts.append(segment.text)
            
            text = ' '.join(full_text_parts).strip()
            detected_language = info.language
            
            # Перевіряємо чи результат валідний
            if not is_valid_transcription(text, info.duration):
                logger.info(f"🚫 Blob результат відфільтровано: '{text}'")
                return jsonify({
                    'status': 'filtered',
                    'text': '',
                    'reason': 'Suspicious or too short transcription',
                    'original_text': text,
                    'duration': round(info.duration, 2),
                    'transcription_time': transcription_time,
                    'model': WHISPER_MODEL,
                    'device': DEVICE
                })
            
            logger.info(f"✅ Blob transcription completed in {transcription_time:.2f}s: '{text[:50]}...'")
            
            return jsonify({
                'status': 'success',
                'text': text,
                'language': detected_language,
                'transcription_time': transcription_time,
                'model': WHISPER_MODEL,
                'device': DEVICE
            })
            
        finally:
            # Видаляємо тимчасовий файл
            try:
                os.unlink(temp_path)
            except:
                pass
                
    except Exception as e:
        logger.error(f"❌ Blob transcription error: {e}")
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/models')
def list_models():
    """Список доступних моделей Whisper"""
    available_models = [
        'tiny', 'tiny.en',
        'base', 'base.en', 
        'small', 'small.en',
        'medium', 'medium.en',
        'large-v1', 'large-v2', 'large-v3'
    ]
    
    return jsonify({
        'available_models': available_models,
        'current_model': WHISPER_MODEL,
        'device': DEVICE,
        'model_loaded': whisper_model is not None
    })

def initialize_service():
    """Ініціалізація сервісу Whisper"""
    logger.info("🚀 Ініціалізація ATLAS Whisper Large v3 Service...")
    logger.info(f"Порт: {WHISPER_PORT}")
    logger.info(f"Модель: {WHISPER_MODEL}")
    logger.info(f"Пристрій: {DEVICE}")
    
    try:
        load_whisper_model()
        logger.info("✅ Сервіс ініціалізовано успішно!")
    except Exception as e:
        logger.error(f"❌ Помилка ініціалізації: {e}")
        raise

if __name__ == '__main__':
    try:
        initialize_service()
        
        logger.info(f"🌐 Запуск сервера на порту {WHISPER_PORT}...")
        app.run(
            host='0.0.0.0',
            port=WHISPER_PORT,
            debug=False,
            threaded=True
        )
        
    except KeyboardInterrupt:
        logger.info("🛑 Сервіс зупинено користувачем")
    except Exception as e:
        logger.error(f"❌ Критична помилка: {e}")
        exit(1)