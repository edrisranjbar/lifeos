// Collects every English interface string the browser code can translate:
// literals passed to t(), static markup text and accessible attributes, and the
// dynamic keys listed in EXTRA_KEYS (values chosen at runtime and passed to t()).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../public_html/', import.meta.url));
export const dictionaryPath = code => path.join(root, 'assets', 'i18n', `${code}.json`);

const ATTRIBUTE = /\b(?:placeholder|title|aria-label|alt)="([^"<>]*?)"/g;

// Strings passed to t() as variables rather than literals.
export const EXTRA_KEYS = [
  'Yearly', 'weeks', 'months', 'years', 'Recorded', 'Undid', 'Restored', 'Deleted',
  // App names used for the page title and mobile header.
  'Overview', 'Growth', 'Focus', 'Finance', 'Habittify', 'Kanban', 'Calendar', 'Goals', 'Notes', 'Notepad', 'Settings',
  // Dashboard greeting, score grade and Kanban flow groups.
  'Working late', 'Good morning', 'Good afternoon', 'Good evening', 'Winding down',
  'Exceptional', 'Strong', 'Steady', 'Building', 'Starting', 'Warming up',
  'Backlog', 'To Do', 'In Progress', 'To Review', 'Done',
  // Weather conditions, tide phases and compass points.
  'Clear sky', 'Mostly clear', 'Partly cloudy', 'Overcast', 'Foggy', 'Drizzle', 'Rain showers', 'Snow', 'Thunderstorms', 'Weather forecast',
  'Rising tide', 'Falling tide', 'Near a turn', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
  // Growth dimensions and review cadences.
  'Religion & Spirituality', 'Health', 'Relationships & Family', 'Self Growth', 'Fun & Rest',
  'Faith, meaning and a grounded inner life.', 'Care for your body, energy and wellbeing.', 'Be present for the people who matter.',
  'Build security and make intentional money decisions.', 'Learn, create and become more capable.', 'Make space for joy, recovery and curiosity.',
  'weekly', 'monthly', 'quarterly', 'Weekly', 'Monthly', 'Quarterly',
  'MY WEEKLY REVIEW', 'MY MONTHLY REVIEW', 'MY QUARTERLY REVIEW', 'Spirituality', 'Relationships',
  'Active', 'Achieved', 'Archived',
  // Goals priorities and SMART wizard steps.
  'low', 'medium', 'high', 'low priority', 'medium priority', 'high priority',
  'Specific', 'Measurable', 'Achievable', 'Relevant', 'Time-bound',
  // Currency names and the two units with local names.
  'Toman', 'Rial',
  // Habittify's Jalali months and short weekdays; Notes colors.
  'Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
  'yellow', 'pink', 'blue', 'green', 'lavender', 'peach',
];

function files(directory, pattern) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'music' || entry.name === 'i18n' ? [] : files(file, pattern);
    return pattern.test(entry.name) ? [file] : [];
  });
}

// Read a JS string literal starting at index i; returns [value, end] or null.
function literal(source, i) {
  const quote = source[i];
  if (!`'"\``.includes(quote)) return null;
  let value = '';
  for (let j = i + 1; j < source.length; j++) {
    const c = source[j];
    if (c === '\\') { value += source[j + 1] === 'n' ? '\n' : source[j + 1]; j++; continue; }
    if (quote === '`' && c === '$' && source[j + 1] === '{') return [null, skipTemplate(source, i)];
    if (c === quote) return [value, j + 1];
    value += c;
  }
  return null;
}
function skipTemplate(source, i) {
  let depth = 0;
  for (let j = i + 1; j < source.length; j++) {
    const c = source[j];
    if (c === '\\') { j++; continue; }
    if (c === '$' && source[j + 1] === '{') { depth++; j++; continue; }
    if (c === '}' && depth) { depth--; continue; }
    if (c === '`' && !depth) return j + 1;
  }
  return source.length;
}

// First argument of each t( call: every string literal inside it is a key.
function callKeys(source) {
  const keys = [];
  // Files that already use `t` for something else alias the translator as `tr`.
  const call = /(?<![\w$.])(?:tr?|__t)\(|lifeOsI18n\.t\(/g;
  for (let match; (match = call.exec(source));) {
    let depth = 0;
    for (let i = match.index + match[0].length; i < source.length; i++) {
      const c = source[i];
      if (`'"\``.includes(c)) {
        const read = literal(source, i);
        if (!read) break;
        if (read[0] !== null && depth === 0) keys.push(read[0]);
        i = read[1] - 1;
        continue;
      }
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
    }
  }
  return keys;
}

// Static text of every string and template literal (template parts split at ${}).
function literalTexts(source) {
  const texts = [];
  let previous = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2) + 1; if (i <= 0) break; continue; }
    if (c === '/' && (!previous || '(,=:[!&|?{};+'.includes(previous))) {
      // Regex literal: skip to its closing slash.
      let inClass = false;
      for (i++; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '[') inClass = true;
        else if (source[i] === ']') inClass = false;
        else if (source[i] === '/' && !inClass) break;
      }
      previous = '/';
      continue;
    }
    if (c === '`') {
      let part = '';
      for (i++; i < source.length; i++) {
        if (source[i] === '\\') { part += source[i + 1]; i++; continue; }
        if (source[i] === '$' && source[i + 1] === '{') {
          texts.push(part); part = '';
          let depth = 1;
          for (i += 2; i < source.length && depth; i++) {
            if (source[i] === '`') i = skipTemplate(source, i) - 1;
            else if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
          }
          i--;
          continue;
        }
        if (source[i] === '`') break;
        part += source[i];
      }
      texts.push(part);
      previous = '`';
      continue;
    }
    if (c === '"' || c === "'") {
      const read = literal(source, i);
      if (!read) break;
      texts.push(read[0]);
      i = read[1] - 1;
      previous = c;
      continue;
    }
    if (!/\s/.test(c)) previous = c;
  }
  return texts;
}

function markupKeys(markup) {
  const keys = [];
  const clean = markup.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<svg[\s\S]*?<\/svg>/g, ' ');
  for (const match of clean.matchAll(/>([^<>]+)</g)) keys.push(match[1]);
  for (const match of clean.matchAll(ATTRIBUTE)) keys.push(match[1]);
  return keys;
}

const decode = text => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const keep = text => /\p{L}/u.test(text) && !/\$\{|\{\{|[<>]|=\"|\[data-|\[aria-|\[role=|\[name=|\[type=|nav a\[|label\[|^[.#[]/.test(text);

export function collectKeys() {
  const found = new Map();
  const add = (text, file) => {
    const key = decode(text).replace(/\s+/g, ' ').trim();
    if (keep(key) && !found.has(key)) found.set(key, path.relative(root, file));
  };
  for (const file of files(root, /\.html$/)) for (const key of markupKeys(fs.readFileSync(file, 'utf8'))) add(key, file);
  for (const file of files(root, /\.m?js$/)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const key of callKeys(source)) add(key, file);
    // Markup inside JS strings is translated by lifeOsI18n.apply().
    for (const text of literalTexts(source)) if (/[<>]|="/.test(text)) for (const key of markupKeys(`>${text}<`)) add(key, file);
  }
  for (const key of EXTRA_KEYS) add(key, 'tests/i18n-keys.mjs');
  // Currency names are shown through t() in Settings.
  const currency = path.join(root, 'assets', 'currency.js');
  for (const match of fs.readFileSync(currency, 'utf8').matchAll(/name: '([^']+)'/g)) add(match[1], currency);
  return found;
}

export const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
