/* ============================================
   UMRANIGPT - Voice Module
   ============================================ */
'use strict';

window.AppVoice = (() => {
  const { emit, $, getSettings, updateSetting } = { ...window.AppUtils, ...window.AppStorage };

  let recognition = null;
  let synthesis = window.speechSynthesis;
  let isListening = false;
  let isSpeaking = false;
  let currentUtterance = null;
  let voices = [];
  let onResultCallback = null;

  /* ---- Initialise ---- */
  const init = () => {
    loadVoices();
    if (synthesis) {
      synthesis.addEventListener('voiceschanged', loadVoices);
    }
    setupRecognition();
  };

  /* ---- Speech Recognition ---- */
  const setupRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = AppStorage.getSettings().language || 'en-US';

    recognition.onstart = () => {
      isListening = true;
      updateVoiceBtn(true);
      emit('voiceStart', {});
    };

    recognition.onresult = (event) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) {
        onResultCallback?.(final.trim());
        emit('voiceResult', { transcript: final.trim(), final: true });
      } else if (interim) {
        emit('voiceResult', { transcript: interim.trim(), final: false });
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      isListening = false;
      updateVoiceBtn(false);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        AppNotifications.error('Voice Error', getRecognitionErrorMsg(event.error));
      }
    };

    recognition.onend = () => {
      isListening = false;
      updateVoiceBtn(false);
      emit('voiceEnd', {});
    };
  };

  const getRecognitionErrorMsg = (code) => {
    const msgs = {
      'network': 'Network error. Check your connection.',
      'not-allowed': 'Microphone access denied.',
      'service-not-allowed': 'Voice service not allowed.',
      'audio-capture': 'No microphone found.',
      'aborted': 'Voice input cancelled.',
    };
    return msgs[code] || `Error: ${code}`;
  };

  const startListening = (onResult) => {
    if (!recognition) {
      AppNotifications.warning('Voice unavailable', 'Your browser does not support speech recognition.');
      return;
    }
    if (isListening) {
      stopListening();
      return;
    }
    onResultCallback = onResult;
    try {
      recognition.lang = AppStorage.getSettings().language || 'en-US';
      recognition.start();
    } catch (err) {
      console.error('Recognition start error:', err);
      AppNotifications.error('Voice Error', 'Could not start microphone.');
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop();
    }
  };

  const toggleListening = (onResult) => {
    if (isListening) stopListening();
    else startListening(onResult);
  };

  const updateVoiceBtn = (active) => {
    const btn = document.getElementById('voice-btn');
    if (!btn) return;
    btn.classList.toggle('listening', active);
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = active ? 'fa-solid fa-stop' : 'fa-solid fa-microphone';
    }
    btn.title = active ? 'Stop listening' : 'Voice input';
  };

  /* ---- Text-to-Speech ---- */
  const loadVoices = () => {
    if (!synthesis) return;
    voices = synthesis.getVoices();
  };

  const speak = (text, options = {}) => {
    if (!synthesis) return;
    stopSpeaking();

    const settings = AppStorage.getSettings();
    const clean = cleanForSpeech(text);
    if (!clean) return;

    // Split long text into chunks to avoid synthesis cutoff
    const chunks = splitIntoChunks(clean, 200);
    speakChunks(chunks, 0, options, settings);
  };

  const speakChunks = (chunks, index, options, settings) => {
    if (index >= chunks.length) {
      isSpeaking = false;
      emit('speechEnd', {});
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    currentUtterance = utterance;

    utterance.rate = options.rate ?? settings.voiceSpeed ?? 1.0;
    utterance.pitch = options.pitch ?? settings.voicePitch ?? 1.0;
    utterance.volume = options.volume ?? settings.voiceVolume ?? 1.0;

    // Set voice
    const voiceName = options.voice ?? settings.voiceName;
    if (voiceName) {
      const voice = voices.find(v => v.name === voiceName);
      if (voice) utterance.voice = voice;
    }

    utterance.lang = settings.language || 'en-US';

    utterance.onstart = () => {
      isSpeaking = true;
      emit('speechStart', {});
    };

    utterance.onend = () => {
      speakChunks(chunks, index + 1, options, settings);
    };

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted') {
        console.warn('Speech error:', e.error);
      }
      isSpeaking = false;
    };

    synthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synthesis) {
      synthesis.cancel();
    }
    isSpeaking = false;
    currentUtterance = null;
    emit('speechStop', {});
  };

  const cleanForSpeech = (text) => {
    return text
      .replace(/```[\s\S]*?```/g, ' [code block] ')
      .replace(/`[^`]+`/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' [link] ')
      .replace(/\$\$[\s\S]+?\$\$/g, ' [math] ')
      .replace(/\$[^$]+\$/g, ' [math] ')
      .replace(/[_~>#\-=|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const splitIntoChunks = (text, maxWords) => {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let current = '';

    sentences.forEach(s => {
      const words = s.trim().split(' ');
      if (current.split(' ').length + words.length > maxWords) {
        if (current) chunks.push(current.trim());
        current = s;
      } else {
        current += ' ' + s;
      }
    });

    if (current.trim()) chunks.push(current.trim());
    return chunks.length > 0 ? chunks : [text];
  };

  /* ---- Voice List for Settings ---- */
  const getVoices = () => {
    if (voices.length === 0) loadVoices();
    return voices;
  };

  const getVoicesByLang = (lang = 'en') => {
    return voices.filter(v => v.lang.startsWith(lang));
  };

  const populateVoiceSelect = (selectEl) => {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Default voice</option>';
    const byLang = {};
    voices.forEach(v => {
      const lang = v.lang.split('-')[0];
      if (!byLang[lang]) byLang[lang] = [];
      byLang[lang].push(v);
    });

    // Show current language first
    const settings = AppStorage.getSettings();
    const curLang = (settings.language || 'en').split('-')[0];
    const order = [curLang, ...Object.keys(byLang).filter(l => l !== curLang)];

    order.forEach(lang => {
      if (!byLang[lang]) return;
      const group = document.createElement('optgroup');
      group.label = new Intl.DisplayNames([lang], { type: 'language' }).of(lang) || lang.toUpperCase();
      byLang[lang].forEach(voice => {
        const opt = document.createElement('option');
        opt.value = voice.name;
        opt.textContent = `${voice.name} ${voice.localService ? '(Local)' : '(Online)'}`;
        opt.selected = voice.name === settings.voiceName;
        group.appendChild(opt);
      });
      selectEl.appendChild(group);
    });
  };

  /* ---- Capabilities ---- */
  const canRecognise = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const canSynthesize = () => !!synthesis;
  const isRecognising = () => isListening;
  const isTalking = () => isSpeaking;

  return {
    init, startListening, stopListening, toggleListening,
    speak, stopSpeaking,
    getVoices, getVoicesByLang, populateVoiceSelect,
    canRecognise, canSynthesize, isRecognising, isTalking,
  };
})();
