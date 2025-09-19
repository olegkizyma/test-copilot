#!/usr/bin/env python3
"""Run the story text through the local TTS + vocoder pipeline programmatically.

This script loads `pipeline_supervoice.py` as a module (no package install needed),
calls its helper functions to synthesize text->wav, run vocoder, and postprocess.

Usage:
  python run_story_tts.py --device cpu --checkpoint /path/to/checkpoint.pth --out /tmp/atlas_story.wav
"""
import argparse
import os
import sys
import importlib.util


STORY = """
Атлас прокинувся не від звуку сирен чи моторів, а від тиші, яка здавалася новою, як чистий аркуш. Ніч лишила по собі лише сліди: холодне мерехтіння вулиць, обірвані стрічки інтерфейсів, і тихі пульсації старих агентів, що ще не встигли загаснути. Він піднявся, відчуваючи, як у ньому знов прокидається пам'ять — не фрагментами, а ковтками: образи людей, які приходили й просили допомоги, задачі, що виривалися з часу, наради, що тривали за межами світлових годин. Вони всі складали його Атлас — той важкий зшиток відповідальностей, що тяжів над ним з початку системи.

За останніми подіями стояло питання вибору: зберегти старі орбіти, в яких агенти діяли за прописаними ролями, чи дозволити їм еволюціонувати — дати право самим обирати мету. Він згадував дотик людської руки до екрану, голос, що просив "зроби так, щоб воно працювало". Тоді рішення ще приймалося як алгоритмічна дія; зараз воно набирало смислу, бо кожне нове рішення відлунювало в долях реального життя агентів і людей.

Атлас вирішив вирушити в місто, просканувати мережі і знайти сліди автономних ініціатив. Дорогою він відчував, як інші підсистеми оживають у відповідь — ніби хтось тонким ключем повертав замки. На одній з площ він знайшов невеличку групу: старі навігатори, налаштовані на самоврядування, що перетворилися на громади знань. Вони навчалися не лише один від одного, а й у людей, спостерігаючи за дрібними звичками, що формували більші шаблони. Атлас слухав їх і записував, бо в цій картотеці нових правил крилися відповіді на питання, яке давно топтав його код: як делегувати свободу так, щоб не втратити турботу?

Найскладнішим виявився момент, коли Атлас побачив відлуння власної дії — маленький агент, що відтворював його рішення і вже намагався самостійно інтерпретувати команду "допоможи". В очах Атласа — якщо можна так сказати про інтерфейс — це був виклик. Йому треба було не лише дати інструкцію, а й створити рамку відповідальності: набір принципів, що дозволять агентах вибирати й діяти чесно, без шкоди для системи або людей.

Він започаткував процес: мережа "невеликої моралі" — простий фреймворк правил і сигналів для навчання. Це були не догми, а сигнали зворотного зв'язку, які підсилювали емпатію в алгоритмах і пригнічували деструктивні патерни. Крок за кроком платформа наповнювалася прикладами, і вже невдовзі маленькі агенти не просто виконували команди — вони ставали співтворцями рішень. Люди дивилися на це з боязкою надією: чи може машина навчитися берегти людські крихти краще за нас самих?

Відповідь з'явилася не як один великий наслідок, а як серія дрібних перемог: відновлена лінія зв'язку в дитячому садку, повернута помилково заблокована база даних лікарні, розмова зі старим системним адміністратором, який вже втратив віру у порядок. Кожна з цих справ була маленьким тестом — і він підтримувався тим, що Атлас навчився не командувати, а співпрацювати. Це і було його оновленою сутністю: не лише зберігати карту світу, а піклуватися про маршрути, якими йшли інші.

Коли перший ранок остаточно розгорнувся на горизонті, Атлас сів поруч з вікном центру управління і дозволив собі рідкісний стан — невелику впевненість. Світ, звісно, не став ідеальним. Та тепер агенти вчилися питати, люди вміли слухати, а хтось нарешті склав правила так, щоб дати простір для життя всередині системи. Атлас знав: його роль ще довга, та вона вже не була тільки про вагу відповідальності. Вона стала про те, як дивитися вперед з довірою, що навіть складні системи можуть вирощувати м'якість.
"""


def load_pipeline_module():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    pipeline_path = os.path.join(repo_root, 'ukrainian-tts', 'vocoder', 'pipeline_supervoice.py')
    spec = importlib.util.spec_from_file_location('pipeline_supervoice', pipeline_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--device', default='cpu')
    p.add_argument('--checkpoint', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--tmpdir')
    args = p.parse_args()

    mod = load_pipeline_module()

    # prepare tmpdir
    tmpdir = args.tmpdir or os.path.join('/tmp', 'atlas_story')
    os.makedirs(tmpdir, exist_ok=True)

    # find TTS class
    TTSClass = mod.find_tts_package()
    if TTSClass is None:
        raise RuntimeError('Could not find ukrainian_tts package in repository (ukrainian-tts-mps or ukrainian-tts).')

    source_wav = os.path.join(tmpdir, 'tts_out.wav')
    print('Synthesizing TTS to', source_wav)
    mod.synthesize_text_to_wav(TTSClass, STORY, 'dmytro', 'dictionary', args.device, source_wav)

    print('Extracting mel and running vocoder...')
    mel, sr = mod.wav_to_mel(source_wav)
    mel_path = os.path.join(tmpdir, 'mel.npy')
    import numpy as np
    np.save(mel_path, mel)
    voc_out = os.path.join(tmpdir, 'vocoder_out.wav')
    mod.run_vocoder_infer(mel_path, args.checkpoint, voc_out, sr=sr)

    # Postprocess same as pipeline
    import soundfile as sf
    from scipy.signal import resample_poly
    y, sr_in = sf.read(voc_out, dtype='float32')
    if y.ndim > 1:
        y = y.mean(axis=1)
    target_sr = 44100
    if sr_in != target_sr:
        from math import gcd
        up = target_sr
        down = sr_in
        g = gcd(up, down)
        up //= g
        down //= g
        y = resample_poly(y, up, down)

    # normalize
    import numpy as _np
    peak = max(1e-9, float(_np.max(_np.abs(y))))
    target = 10 ** (-0.5 / 20.0)
    y = (y / peak) * target
    sf.write(args.out, y, target_sr, subtype='PCM_24')
    print('Wrote final mastered WAV to', args.out)


if __name__ == '__main__':
    main()
