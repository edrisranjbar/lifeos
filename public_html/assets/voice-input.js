(() => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"/><path d="M19 11a7 7 0 0 1-14 0m7 7v3m-4 0h8"/></svg>';

  window.addVoiceInputButton = (textarea, className = '') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `voice-input ${className}`.trim();
    button.innerHTML = icon;
    const { t } = window.lifeOsI18n;
    button.title = t(Recognition ? 'Dictate text' : 'Voice input is not supported in this browser');
    button.setAttribute('aria-label', button.title);
    button.disabled = !Recognition;
    button.addEventListener('pointerdown', event => event.preventDefault());

    if (Recognition) {
      const recognition = new Recognition();
      recognition.lang = document.documentElement.lang || navigator.language || 'en-US';
      recognition.continuous = true;
      recognition.interimResults = false;
      let recording = false;

      const updateButton = () => {
        button.classList.toggle('recording', recording);
        button.setAttribute('aria-pressed', String(recording));
        button.title = t(recording ? 'Stop dictation' : 'Dictate text');
        button.setAttribute('aria-label', button.title);
      };

      const insertTranscript = spoken => {
        const text = spoken.trim();
        if (!text) return;
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        const prefix = before && !/\s$/.test(before) ? ' ' : '';
        const suffix = after && !/^\s/.test(after) ? ' ' : '';
        textarea.setRangeText(prefix + text + suffix, start, end, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      };

      const startRecognition = () => {
        try { recognition.start(); } catch {}
      };

      const stop = () => {
        recording = false;
        updateButton();
      };

      recognition.onresult = event => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) insertTranscript(event.results[i][0]?.transcript || '');
        }
      };
      recognition.onerror = event => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          button.title = t('Allow microphone access to dictate');
          button.setAttribute('aria-label', button.title);
          stop();
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          button.title = t('Voice input encountered an error');
          button.setAttribute('aria-label', button.title);
        }
      };
      recognition.onend = () => {
        if (recording) {
          // Browsers may end a recognition session after a pause; resume while dictation is active.
          setTimeout(() => { if (recording) startRecognition(); }, 200);
        } else {
          stop();
        }
      };

      button.addEventListener('click', () => {
        if (recording) {
          recording = false;
          updateButton();
          recognition.stop();
          return;
        }
        try {
          textarea.focus();
          recording = true;
          updateButton();
          recognition.start();
        } catch {
          stop();
        }
      });
    }

    return button;
  };
})();
