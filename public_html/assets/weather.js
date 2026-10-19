// Qeshm weather and marine data are served together by the local PHP endpoint.
const $ = id => document.getElementById(id);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const { t, number } = window.lifeOsI18n;
const degrees = value => t('{value}°C', { value: number(Math.round(value)) });
let lastAttempt = 0;
let inFlight = null;

function description(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return ['Clear sky', 'Mostly clear', 'Partly cloudy', 'Overcast'][code];
  if ([45, 48].includes(code)) return 'Foggy';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain showers';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return 'Weather forecast';
}

let illustrationId = 0;
function symbol(code, isDay = true) {
  // Each illustration owns its paint definitions, including the forecast miniatures.
  const id = `weather-art-${++illustrationId}`;
  const paint = name => `url(#${id}-${name})`;
  const sun = `<g><g stroke="#d9a64c" stroke-width="5" stroke-linecap="round"><path d="M80 9v5m0 76v5M37 52h5m76 0h5M49 21l4 4m54 54 4 4m0-62-4 4M53 79l-4 4"/></g><circle cx="80" cy="52" r="31" fill="${paint('sun')}"/><circle cx="80" cy="52" r="30" fill="none" stroke="#ffe4a4" stroke-opacity=".55"/><ellipse cx="69" cy="39" rx="17" ry="10" transform="rotate(-34 69 39)" fill="${paint('shine')}"/><path d="M64 78c14 8 30 0 38-12" fill="none" stroke="#9c6a24" stroke-opacity=".24" stroke-width="3" stroke-linecap="round"/></g>`;
  const moon = `<g><path d="M94 18c-14 1-27 12-29 28-3 20 11 37 31 39 13 1 24-4 31-14-19 5-38-6-42-25-2-11 1-20 9-28Z" fill="${paint('moon')}"/><path d="M86 24c-18 9-25 31-14 47" fill="none" stroke="#fffaf0" stroke-opacity=".65" stroke-width="2" stroke-linecap="round"/><g fill="#d7c79d"><path d="m48 29 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/><circle cx="122" cy="29" r="2"/><circle cx="45" cy="64" r="1.5"/></g></g>`;
  const cloud = `<g><path d="M42 107c-15 0-25-10-25-23 0-11 8-21 20-23 3-19 17-32 35-32 17 0 31 10 36 25 3-1 6-2 9-2 16 0 28 12 28 27 0 16-12 28-28 28Z" fill="${paint('cloud')}"/><path d="M26 90c5 9 12 12 23 12h65c12 0 21-4 26-13" fill="none" stroke="#344856" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/><path d="M43 61c4-15 15-25 29-25 14 0 24 7 30 19" fill="none" stroke="#fffef6" stroke-opacity=".78" stroke-width="3" stroke-linecap="round"/><ellipse cx="39" cy="75" rx="12" ry="8" transform="rotate(-32 39 75)" fill="${paint('shine')}"/><path d="M107 59c4-2 7-2 11-2 11 0 20 7 23 16" fill="none" stroke="#fffef6" stroke-opacity=".48" stroke-width="2" stroke-linecap="round"/></g>`;
  let scene;
  if (code === 0) scene = isDay ? sun : `<g transform="translate(-9 0)">${moon}</g>`;
  else if (code === 1 || code === 2) scene = `<g transform="translate(-20 -6) scale(.83)">${isDay ? sun : moon}</g><g transform="translate(5 20) scale(.9)">${cloud}</g>`;
  else if ([95, 96, 99].includes(code)) scene = `<g transform="translate(0 -13)">${cloud}</g><path d="m84 88-19 27h14l-7 20 26-30H83l9-17Z" fill="${paint('sun')}" stroke="#ffdd8e" stroke-width="1"/>`;
  else if ([71, 73, 75, 77, 85, 86].includes(code)) scene = `<g transform="translate(0 -16)">${cloud}</g><g stroke="#a9d9cd" stroke-width="2.5" stroke-linecap="round"><path d="M48 105v16m-7-12 14 8m-14 0 14-8M82 111v16m-7-12 14 8m-14 0 14-8M115 104v16m-7-12 14 8m-14 0 14-8"/></g>`;
  else if ([45, 48].includes(code)) scene = `<g transform="translate(0 -13)">${cloud}</g><g stroke="#8fa9aa" stroke-width="4" stroke-linecap="round"><path d="M40 110h81M52 121h57"/></g>`;
  else if (code <= 3 || !finite(code)) scene = cloud;
  else scene = `<g transform="translate(0 -16)">${cloud}</g><g fill="${paint('rain')}"><path d="M46 100c0 0-10 13-10 18a6 6 0 0 0 12 0c0-5-2-18-2-18Z"/><path d="M82 105c0 0-10 13-10 18a6 6 0 0 0 12 0c0-5-2-18-2-18Z"/><path d="M118 98c0 0-10 13-10 18a6 6 0 0 0 12 0c0-5-2-18-2-18Z"/></g>`;
  return `<svg class="weather-illustration" viewBox="0 0 160 145" fill="none" aria-hidden="true"><defs>
    <radialGradient id="${id}-sun" cx=".3" cy=".23" r=".8"><stop stop-color="#fff1bd"/><stop offset=".4" stop-color="#f3c969"/><stop offset=".8" stop-color="#dca641"/><stop offset="1" stop-color="#b17b2d"/></radialGradient>
    <linearGradient id="${id}-cloud" x1="55" y1="33" x2="98" y2="114" gradientUnits="userSpaceOnUse"><stop stop-color="#fffdf5"/><stop offset=".38" stop-color="#e6ece5"/><stop offset=".72" stop-color="#b8ccc7"/><stop offset="1" stop-color="#75988f"/></linearGradient>
    <linearGradient id="${id}-moon" x1="76" y1="24" x2="111" y2="84" gradientUnits="userSpaceOnUse"><stop stop-color="#fff6d7"/><stop offset=".5" stop-color="#e0d6b6"/><stop offset="1" stop-color="#8c9f98"/></linearGradient>
    <linearGradient id="${id}-shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}-rain" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b3f4de"/><stop offset=".55" stop-color="#39e6ad"/><stop offset="1" stop-color="#137d65"/></linearGradient>
    <radialGradient id="${id}-shadow"><stop stop-color="#020c0b" stop-opacity=".32"/><stop offset="1" stop-color="#020c0b" stop-opacity="0"/></radialGradient>
  </defs><ellipse cx="82" cy="133" rx="54" ry="10" fill="${paint('shadow')}"/>${scene}</svg>`;
}

function windDirection(degrees) {
  if (!finite(degrees)) return '';
  return t(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((degrees % 360) + 360) % 360 / 45) % 8]);
}

function renderWeather(data) {
  const current = data?.current;
  const daily = data?.daily;
  if (!current || !finite(current.temperature_2m) || !Array.isArray(daily?.time) || daily.time.length < 8) throw new Error('Incomplete weather data');
  $('kish-weather-temperature').innerHTML = `${number(Math.round(current.temperature_2m))}<small>°C</small>`;
  $('kish-weather-condition').textContent = t(description(current.weather_code));
  $('kish-weather-icon').innerHTML = symbol(current.weather_code, Boolean(current.is_day));
  $('kish-weather-feels').textContent = finite(current.apparent_temperature) ? degrees(current.apparent_temperature) : '—';
  $('kish-weather-wind').textContent = finite(current.wind_speed_10m) ? `${t('{speed} km/h', { speed: number(Math.round(current.wind_speed_10m)) })} ${windDirection(current.wind_direction_10m)}`.trim() : '—';
  $('kish-weather-humidity').textContent = finite(current.relative_humidity_2m) ? t('{value}%', { value: number(Math.round(current.relative_humidity_2m)) }) : '—';
  $('kish-weather-updated').textContent = t('Updated {time} · local time', { time: window.lifeOsI18n.digits(current.time?.slice(11, 16) || '—') });
  const dayNames = new Intl.DateTimeFormat(window.lifeOsI18n.locale(), { weekday: 'short', timeZone: 'UTC' });
  const days = daily.time.slice(1, 8).map((date, index) => {
    const i = index + 1;
    const name = dayNames.format(new Date(`${date}T12:00:00Z`));
    const dateLabel = window.lifeOsI18n.date(new Date(`${date}T12:00:00Z`), { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const high = finite(daily.temperature_2m_max?.[i]) ? `${number(Math.round(daily.temperature_2m_max[i]))}°` : '—';
    const low = finite(daily.temperature_2m_min?.[i]) ? `${number(Math.round(daily.temperature_2m_min[i]))}°` : '—';
    return `<div class="kish-forecast-day" aria-label="${t('{day}, {date}: {condition}, high {high}, low {low}', { day: name, date: dateLabel, condition: t(description(daily.weather_code?.[i])), high, low })}"><span>${name}<small class="kish-forecast-date">${dateLabel}</small></span>${symbol(daily.weather_code?.[i])}<strong>${high} <small>${low}</small></strong></div>`;
  });
  $('kish-weather-forecast').querySelector('.kish-forecast-days').innerHTML = days.join('');
  $('kish-weather-status').innerHTML = '<i></i> ';
  $('kish-weather-status').append(t('Live forecast'));
}

function renderMarine(data) {
  const current = data?.current;
  const times = data?.hourly?.time;
  const heights = data?.hourly?.sea_level_height_msl;
  if (!finite(current?.sea_level_height_msl) || !Array.isArray(times) || !Array.isArray(heights)) throw new Error('Incomplete marine data');
  const now = current.time;
  const nextIndex = times.findIndex(time => time > now);
  const future = nextIndex >= 0 ? heights[nextIndex] : null;
  const delta = finite(future) ? future - current.sea_level_height_msl : 0;
  const phase = delta > 0.015 ? 'Rising tide' : delta < -0.015 ? 'Falling tide' : 'Near a turn';
  let nextTurn = null;
  for (let i = Math.max(nextIndex, 1); i < heights.length - 1; i++) {
    if (!finite(heights[i - 1]) || !finite(heights[i]) || !finite(heights[i + 1])) continue;
    if (heights[i] >= heights[i - 1] && heights[i] > heights[i + 1]) { nextTurn = { type: 'high', time: times[i] }; break; }
    if (heights[i] <= heights[i - 1] && heights[i] < heights[i + 1]) { nextTurn = { type: 'low', time: times[i] }; break; }
  }
  $('kish-tide-state').textContent = t(phase);
  const level = t('{height} m vs mean sea level', { height: window.lifeOsI18n.digits(`${current.sea_level_height_msl >= 0 ? '+' : ''}${current.sea_level_height_msl.toFixed(2)}`) });
  const sameDay = nextTurn && nextTurn.time.slice(0, 10) === now.slice(0, 10);
  const turnKey = !nextTurn ? '' : nextTurn.type === 'high' ? (sameDay ? 'Next high {time}' : 'Next high tomorrow {time}') : (sameDay ? 'Next low {time}' : 'Next low tomorrow {time}');
  const turn = nextTurn ? `${t(turnKey, { time: window.lifeOsI18n.digits(nextTurn.time.slice(11, 16)) })} · ` : '';
  $('kish-tide-detail').textContent = `${turn}${level}`;
}

async function getJson() {
  const response = await fetch('weather.php', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(16000) });
  if (!response.ok) throw new Error(`Forecast service ${response.status}`);
  return response.json();
}

export function refreshWeatherCard() {
  const card = $('kish-weather');
  if (!card || inFlight || Date.now() - lastAttempt < 15 * 60 * 1000) return inFlight;
  lastAttempt = Date.now();
  card.setAttribute('aria-busy', 'true');
  inFlight = getJson().then(data => {
    const label = $('kish-weather-title');
    if (label && typeof data.location === 'string') label.textContent = data.location;
    try { renderWeather(data.weather); }
    catch { showWeatherUnavailable(); }
    try { renderMarine(data.marine); }
    catch { showMarineUnavailable(); }
  }).catch(() => {
    showWeatherUnavailable();
    showMarineUnavailable();
  }).finally(() => { card.setAttribute('aria-busy', 'false'); inFlight = null; });
  return inFlight;
}

function showWeatherUnavailable() {
  $('kish-weather-status').textContent = t('Weather unavailable');
  $('kish-weather-temperature').innerHTML = '—<small>°C</small>';
  $('kish-weather-condition').textContent = t('Forecast temporarily unavailable');
  $('kish-weather-icon').innerHTML = '';
  $('kish-weather-feels').textContent = '—';
  $('kish-weather-wind').textContent = '—';
  $('kish-weather-humidity').textContent = '—';
  $('kish-weather-forecast').querySelector('.kish-forecast-days').textContent = t('7-day forecast unavailable');
  $('kish-weather-updated').textContent = t('Local forecast unavailable');
}

function showMarineUnavailable() {
  $('kish-tide-state').textContent = t('Tide estimate unavailable');
  $('kish-tide-detail').textContent = t('Try again shortly');
}
