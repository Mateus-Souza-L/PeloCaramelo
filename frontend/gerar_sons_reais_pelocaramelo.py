import os, requests, wave, zipfile

# ================================
# 🐾 Configurações gerais
# ================================
os.makedirs("public/sounds", exist_ok=True)

# 🎧 Fontes de áudio (livres e públicas)
SOUNDS = {
    "success": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_2ef2ccf4ae.mp3?filename=dog-bark-1-116847.mp3",
    "error": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_1dbeeb448f.mp3?filename=cat-meow-14536.mp3",
    "notify": "https://cdn.pixabay.com/download/audio/2022/03/15/audio_3a8f2f5a02.mp3?filename=whistle-6307.mp3",
}

# ================================
# 🎵 Função para baixar o som
# ================================
def baixar_arquivo(url, destino):
    print(f"⬇️  Baixando: {destino}")
    r = requests.get(url, allow_redirects=True)
    if r.status_code == 200:
        with open(destino, "wb") as f:
            f.write(r.content)
        print(f"✅ {destino} salvo.")
    else:
        print(f"❌ Falha ao baixar {destino}")

# ================================
# 🎚️ Aplicar fade-in e fade-out
# ================================
def aplicar_fade(wav_path):
    import tempfile
    import pydub

    audio = pydub.AudioSegment.from_file(wav_path)
    faded = audio.fade_in(80).fade_out(80).apply_gain(-5)
    faded.export(wav_path, format="wav")

# ================================
# ⚙️ Processo principal
# ================================
for nome, url in SOUNDS.items():
    caminho_mp3 = f"public/sounds/{nome}.mp3"
    caminho_wav = f"public/sounds/{nome}.wav"
    baixar_arquivo(url, caminho_mp3)

    # Converter MP3 → WAV
    try:
        from pydub import AudioSegment
        AudioSegment.from_mp3(caminho_mp3).export(caminho_wav, format="wav")
        aplicar_fade(caminho_wav)
        os.remove(caminho_mp3)
        print(f"✨ {nome}.wav pronto!")
    except Exception as e:
        print(f"Erro ao converter {nome}: {e}")

# Compactar tudo
zip_path = "PeloCaramelo-sounds.zip"
with zipfile.ZipFile(zip_path, "w") as zipf:
    for nome in ["success", "error", "notify"]:
        zipf.write(f"public/sounds/{nome}.wav", arcname=f"sounds/{nome}.wav")

print("\n🎉 Todos os sons foram criados e compactados com sucesso!")
print(f"📦 Arquivo: {zip_path}")

