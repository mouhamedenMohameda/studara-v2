# 🎙️ Whisper Service — État & Documentation

> Dernière mise à jour : 17 avril 2026

---

## Architecture générale

Le service est **100% OpenAI-based** (plus de Whisper local). Il s'articule en **2 grandes fonctions** :
1. **`transcribeAudio()`** — transcription audio
2. **`enhanceTranscript()`** / **`enhanceTranscriptStructured()`** — amélioration du texte

---

## Modèles utilisés

| Rôle | Modèle |
|---|---|
| Transcription (défaut) | `gpt-4o-transcribe` |
| Transcription (pas cher) | `gpt-4o-mini-transcribe` |
| Enhancement (défaut) | `gpt-4o` |
| Enhancement (pas cher) | `gpt-4o-mini` |
| Diarisation | `gpt-4o` (post-processing) |

---

## Pipeline de Transcription

```
Audio brut
  → preprocessAudio() [ffmpeg]
     ├─ Filtre complet : highpass 80Hz + afftdn denoiser + dynaudnorm
     ├─ Fallback : conversion mp3 simple (sans filtres)
     └─ Fallback ultime : fichier original
  → Chunking si > 20 MB (segments de 20min)
  → transcribeChunk() [OpenAI API]
     └─ Prompt contextuel selon la langue :
         AR: "محاضرة جامعية باللغة العربية. المحاضر يشرح المفاهيم بوضوح."
         FR: "Cours universitaire en français. Le professeur explique des concepts académiques."
         EN: "University lecture. The professor explains academic concepts clearly."
  → removeExcessiveRepetitions() [anti-hallucination]
  → [optionnel] diarizeWithGPT() si diarize=true
```

---

## Pipeline d'Enhancement

3 modes disponibles :

| Mode | Fonction | Output |
|---|---|---|
| `summary` / `rewrite` | `enhanceTranscriptStructured()` | `EnhancedTranscript` JSON structuré |
| `flashcards` | `generateFlashcards()` | 8–12 paires `{ front, back }` |

### Structure `EnhancedTranscript`
```json
{
  "clean_transcript": "...",
  "summary": "...",
  "action_items": ["..."],
  "key_topics": ["..."],
  "unclear_segments": ["..."]
}
```

---

## Protections en place

| Protection | Description |
|---|---|
| **Anti-hallucination** | `removeExcessiveRepetitions()` — supprime si une phrase se répète 3× de suite |
| **Limite de contexte** | Transcripts tronqués à 60 000 chars avant enhancement |
| **Chunking audio** | Fichiers > 20 MB découpés en segments de 20min |
| **Fallback ffmpeg** | 2 niveaux de fallback si le preprocessing échoue |
| **Diarisation gracieuse** | Si GPT-4o diarize échoue → retourne le transcript brut |
| **MIME type M4A** | Forcé à `audio/mp4` (OpenAI rejette `audio/m4a`) |

---

## Historique des modifications

| Date | Changement |
|---|---|
| Avril 2026 | Prompts AR/FR améliorés déployés en prod |
| Avril 2026 | Option `skipPreprocess` pour les chunks iOS déjà optimisés |
| Avril 2026 | Migration complète vers OpenAI API (suppression Whisper local) |
| Avril 2026 | Chunking automatique des fichiers > 20 MB |
| Avril 2026 | Anti-hallucination : `removeExcessiveRepetitions()` |

---

## Variables d'environnement requises

```env
OPENAI_API_KEY=sk-...
```

---

## Points d'attention

- La **diarisation** utilise GPT-4o en post-processing (pas une vraie API de diarisation) — fonctionnel mais moins précis que des solutions dédiées (ex: pyannote, AssemblyAI)
- Les commentaires du header mentionnent `gpt-5.4 mini/nano` — **obsolètes**, ignorer
- Le preprocessing ffmpeg est **toujours actif** pour les fichiers uploadés, et **désactivé** (`skipPreprocess: true`) pour les chunks temps-réel iOS
