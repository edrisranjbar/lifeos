const TRACKS = [
  ['comfortable-mystery', 'Comfortable Mystery'], ['inspired', 'Inspired'],
  ['dreamy-flashback', 'Dreamy Flashback'], ['water-lily', 'Water Lily'],
  ['winter-reflections', 'Winter Reflections'], ['carefree', 'Carefree'],
  ['friendly-day', 'Friendly Day'], ['thinking-music', 'Thinking Music'],
  ['luminous-rain', 'Luminous Rain'], ['touching-story', 'Touching Story'],
];

export function mountFocusAudio(saved, persist) {
  const $ = id => document.getElementById(id);
  const tracks = new Map(TRACKS.map(([id, name]) => [id, {name, src: `assets/music/${id}.mp3`} ]));
  const builtinIds = new Set(tracks.keys());
  let selected = Array.isArray(saved?.tracks)
    ? [...new Set(saved.tracks.filter(id => builtinIds.has(id)))] : [TRACKS[0][0]];
  let volume = Number.isFinite(saved?.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.5;
  let audio = null, currentId = null, playing = false, generation = 0, playRequest = 0;
  const failed = new Set();
  let message = '';

  function save() { persist({tracks: selected.filter(id => builtinIds.has(id)), volume}); }
  function render() {
    const { t, number } = window.lifeOsI18n;
    $('soundSelectionCount').textContent = t(selected.length === 1 ? '{count} track selected' : '{count} tracks selected', { count: number(selected.length) });
    $('soundQueueHint').textContent = t(selected.length ? 'Plays in selection order · repeats continuously' : 'Choose tracks to build your loop');
    $('soundNowPlaying').textContent = currentId ? tracks.get(currentId)?.name || '' : t('Your focus soundtrack');
    $('soundPlaybackStatus').textContent = t(message || (playing ? 'Playing' : currentId ? 'Paused' : 'Ready when you are'));
    $('play').textContent = t(playing ? 'Ⅱ Pause' : '▶ Play');
    $('play').disabled = !selected.length;
    $('play').setAttribute('aria-label', t(playing ? 'Pause soundtrack' : 'Play soundtrack'));
    $('soundNext').disabled = selected.length < 2;
    $('soundVolume').value = String(Math.round(volume * 100));
    for (const input of $('soundTracks').querySelectorAll('input')) input.checked = selected.includes(input.value);
  }
  function release() {
    generation++; playRequest++;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
    audio = null;
  }
  function fail(id, attempt) {
    if (attempt !== generation || !playing) return;
    failed.add(id);
    const next = selected.find(candidate => !failed.has(candidate));
    if (next) { message = window.lifeOsI18n.t('Unavailable track skipped'); start(next); }
    else { playing = false; message = window.lifeOsI18n.t('Audio could not play. Check your files or connection and press Play to retry.'); release(); render(); }
  }
  async function start(id) {
    release(); currentId = id;
    if (!tracks.has(id)) { playing = false; render(); return; }
    playing = true;
    const attempt = generation, request = ++playRequest, player = new Audio(tracks.get(id).src);
    audio = player; player.volume = volume; player.preload = 'auto';
    player.onended = () => {
      if (attempt !== generation || !playing) return;
      const eligible = selected.filter(candidate => !failed.has(candidate));
      if (!eligible.length) { playing = false; release(); render(); return; }
      const index = eligible.indexOf(id);
      message = ''; start(eligible[(index + 1) % eligible.length]);
    };
    player.onerror = () => fail(id, attempt);
    render();
    try { await player.play(); }
    catch (error) {
      if (attempt !== generation || request !== playRequest || !playing) return;
      if (error.name === 'NotAllowedError') {
        playing = false; message = window.lifeOsI18n.t('Press Play to allow audio playback.'); player.pause(); render();
      } else fail(id, attempt);
    }
  }
  function addChoice(id, track, local = false) {
    const label = document.createElement('label'); label.className = 'sound-track';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = id;
    const name = document.createElement('span'); name.textContent = track.name;
    label.append(input, name);
    if (local) { const badge = document.createElement('small'); badge.textContent = window.lifeOsI18n.t('Local'); label.append(badge); }
    input.addEventListener('change', () => {
      const previous = [...selected], wasPlaying = playing;
      selected = input.checked ? [...selected, id] : selected.filter(item => item !== id);
      failed.clear(); message = '';
      if (!selected.includes(currentId)) {
        const oldIndex = previous.indexOf(currentId);
        release(); currentId = null; playing = false;
        if (wasPlaying && selected.length) start(selected[Math.max(0, oldIndex) % selected.length]);
      }
      save(); render();
    });
    $('soundTracks').append(label);
  }
  for (const [id, track] of tracks) addChoice(id, track);
  $('play').addEventListener('click', async () => {
    if (playing) { playRequest++; playing = false; audio?.pause(); message = ''; render(); return; }
    failed.clear(); message = '';
    if (!selected.length) return;
    if (audio && selected.includes(currentId) && !audio.ended && !audio.error) {
      playing = true; const attempt = generation, request = ++playRequest; render();
      try { await audio.play(); }
      catch (error) {
        if (attempt !== generation || request !== playRequest || !playing) return;
        if (error.name === 'NotAllowedError') { playing = false; message = window.lifeOsI18n.t('Press Play to allow audio playback.'); render(); }
        else fail(currentId, attempt);
      }
    } else start(selected.includes(currentId) ? currentId : selected[0]);
  });
  $('soundNext').addEventListener('click', () => {
    if (selected.length < 2) return;
    const next = selected[(selected.indexOf(currentId) + 1) % selected.length];
    failed.clear(); message = '';
    if (playing) start(next);
    else { release(); currentId = next; render(); }
  });
  $('soundVolume').addEventListener('input', () => {
    volume = Number($('soundVolume').value) / 100; if (audio) audio.volume = volume;
  });
  $('soundVolume').addEventListener('change', save);
  $('musicFile').addEventListener('change', () => {
    let added = 0;
    for (const file of $('musicFile').files) {
      // MIME can be empty for valid audio files; the audio element checks decoding.
      if (file.type && !file.type.startsWith('audio/')) continue;
      const id = `local-${crypto.randomUUID()}`;
      const track = {name: file.name, src: URL.createObjectURL(file)};
      tracks.set(id, track); selected.push(id); addChoice(id, track, true); added++;
    }
    $('musicFile').value = ''; failed.clear();
    message = added ? window.lifeOsI18n.t('Local audio added for this session') : window.lifeOsI18n.t('Choose audio files to add.');
    save(); render();
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    release();
    for (const [id, track] of tracks) if (!builtinIds.has(id)) URL.revokeObjectURL(track.src);
  });
  render();
  return {
    sync(settings) {
      if (!settings || !Array.isArray(settings.tracks)) return;
      const next = [...new Set(settings.tracks.filter(id => builtinIds.has(id)))];
      const local = selected.filter(id => !builtinIds.has(id));
      if (JSON.stringify(next) !== JSON.stringify(selected.filter(id => builtinIds.has(id)))) {
        selected = [...next, ...local]; failed.clear();
        if (currentId && !selected.includes(currentId)) {
          const wasPlaying = playing; release(); currentId = null; playing = false;
          if (wasPlaying && selected.length) start(selected[0]);
        }
      }
      if (Number.isFinite(settings.volume)) volume = Math.max(0, Math.min(1, settings.volume));
      if (audio) audio.volume = volume;
      render();
    },
  };
}
