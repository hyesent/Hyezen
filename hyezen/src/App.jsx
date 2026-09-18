import { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';

const API_URL = import.meta.env.VITE_API_URL || 'https://hyezen.onrender.com';

// ═══════════════════════════════════════════════════════════
//  METADATA
// ═══════════════════════════════════════════════════════════
const LANG_META = {
  es: { label: 'Spanish',    continent: 'Europe'   },
  fr: { label: 'French',     continent: 'Europe'   },
  de: { label: 'German',     continent: 'Europe'   },
  it: { label: 'Italian',    continent: 'Europe'   },
  pt: { label: 'Portuguese', continent: 'Europe'   },
  ru: { label: 'Russian',    continent: 'Europe'   },
  nl: { label: 'Dutch',      continent: 'Europe'   },
  pl: { label: 'Polish',     continent: 'Europe'   },
  sv: { label: 'Swedish',    continent: 'Europe'   },
  da: { label: 'Danish',     continent: 'Europe'   },
  nb: { label: 'Norwegian',  continent: 'Europe'   },
  fi: { label: 'Finnish',    continent: 'Europe'   },
  cs: { label: 'Czech',      continent: 'Europe'   },
  hu: { label: 'Hungarian',  continent: 'Europe'   },
  el: { label: 'Greek',      continent: 'Europe'   },
  ro: { label: 'Romanian',   continent: 'Europe'   },
  sk: { label: 'Slovak',     continent: 'Europe'   },
  sl: { label: 'Slovenian',  continent: 'Europe'   },
  hr: { label: 'Croatian',   continent: 'Europe'   },
  tr: { label: 'Turkish',    continent: 'Asia'     },
  ar: { label: 'Arabic',     continent: 'Asia'     },
  he: { label: 'Hebrew',     continent: 'Asia'     },
  hi: { label: 'Hindi',      continent: 'Asia'     },
  ja: { label: 'Japanese',   continent: 'Asia'     },
  ko: { label: 'Korean',     continent: 'Asia'     },
  zh: { label: 'Chinese',    continent: 'Asia'     },
  id: { label: 'Indonesian', continent: 'Asia'     },
  ms: { label: 'Malay',      continent: 'Asia'     },
  vi: { label: 'Vietnamese', continent: 'Asia'     },
  th: { label: 'Thai',       continent: 'Asia'     },
  af: { label: 'Afrikaans',  continent: 'Africa'   },
  sw: { label: 'Swahili',    continent: 'Africa'   },
  yo: { label: 'Yoruba',     continent: 'Africa'   },
  ig: { label: 'Igbo',       continent: 'Africa'   },
  ha: { label: 'Hausa',      continent: 'Africa'   },
  zu: { label: 'Zulu',       continent: 'Africa'   },
  am: { label: 'Amharic',    continent: 'Africa'   },
};

const CONTINENT_ORDER = ['Africa', 'Asia', 'Europe', 'Americas', 'Oceania'];

const REGION_TO_CONTINENT = {
  NG: 'Africa', KE: 'Africa', ZA: 'Africa', TZ: 'Africa', EG: 'Africa',
  CN: 'Asia', JP: 'Asia', KR: 'Asia', SA: 'Asia', IN: 'Asia', SG: 'Asia',
  PH: 'Asia', HK: 'Asia', IL: 'Asia', ID: 'Asia', MY: 'Asia', VN: 'Asia',
  TH: 'Asia',
  US: 'Americas', CA: 'Americas', MX: 'Americas', BR: 'Americas', AR: 'Americas',
  GB: 'Europe', IE: 'Europe', FR: 'Europe', DE: 'Europe', ES: 'Europe',
  IT: 'Europe', PT: 'Europe', RU: 'Europe', NL: 'Europe', PL: 'Europe',
  DK: 'Europe', SE: 'Europe', NO: 'Europe', FI: 'Europe', CZ: 'Europe',
  HU: 'Europe', GR: 'Europe', RO: 'Europe', SK: 'Europe', SI: 'Europe',
  HR: 'Europe',
  AU: 'Oceania', NZ: 'Oceania',
};

// ═══════════════════════════════════════════════════════════
//  TRANSLATION ENGINE
// ═══════════════════════════════════════════════════════════
const TR_CACHE = new Map();

async function fetchWithTimeout(url, opts = {}, ms = 4500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function translateWithGoogle(text, target, source = 'auto') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error('google ' + r.status);
  const p = await r.json();
  const out = p?.[0]?.map(x => x[0]).join('');
  if (!out) throw new Error('google empty');
  return out;
}

async function translateWithMyMemory(text, target, source = 'en') {
  const src = source === 'auto' ? 'en' : source;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${target}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error('mymemory ' + r.status);
  const d = await r.json();
  if (d.responseStatus === 200 && d.responseData?.translatedText) return d.responseData.translatedText;
  throw new Error('mymemory fail');
}

async function translateWithLibre(text, target, source = 'auto') {
  const r = await fetchWithTimeout('https://libretranslate.com/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source, target, format: 'text' }),
  });
  if (!r.ok) throw new Error('libre ' + r.status);
  const d = await r.json();
  if (d.translatedText) return d.translatedText;
  throw new Error('libre fail');
}

async function translateText(text, target, source = 'auto') {
  if (!text || !target || target === 'en' || text.trim().length < 2) return text;
  const key = `${source}::${target}::${text}`;
  if (TR_CACHE.has(key)) return TR_CACHE.get(key);
  const engines = [
    () => translateWithGoogle(text, target, source),
    () => translateWithMyMemory(text, target, source),
    () => translateWithLibre(text, target, source),
  ];
  for (const engine of engines) {
    try {
      const out = await engine();
      if (out && out !== text) { TR_CACHE.set(key, out); return out; }
    } catch (e) { console.warn('[translate]', e.message); }
  }
  TR_CACHE.set(key, text);
  return text;
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function voiceLocale(voiceName) {
  if (!voiceName) return null;
  const m = voiceName.match(/^([a-z]{2})-/);
  return m ? m[1] : null;
}
function voiceRegion(voiceName) {
  if (!voiceName) return null;
  const m = voiceName.match(/^[a-z]{2}-([A-Z]{2})/);
  return m ? m[1] : null;
}
function voiceLabel(voices, voiceName) {
  const v = voices.find(x => x.name === voiceName);
  return v ? v.label : (voiceName || 'NONE');
}
function pickVoiceForLang(voices, langCode) {
  if (!voices || voices.length === 0) return null;
  const match = voices.find(v => voiceLocale(v.name) === langCode);
  return match ? match.name : null;
}
function prettyMode(m) { return (m || 'story').replace(/_/g, ' ').toUpperCase(); }

function groupByContinent(items, getContinent) {
  const groups = {};
  for (const item of items) {
    const c = getContinent(item) || 'Other';
    if (!groups[c]) groups[c] = [];
    groups[c].push(item);
  }
  const ordered = [];
  for (const c of CONTINENT_ORDER) {
    if (groups[c]) ordered.push({ continent: c, items: groups[c] });
  }
  if (groups.Other) ordered.push({ continent: 'Other', items: groups.Other });
  const known = new Set([...CONTINENT_ORDER, 'Other']);
  for (const c of Object.keys(groups)) {
    if (!known.has(c)) ordered.push({ continent: c, items: groups[c] });
  }
  return ordered;
}

function sanitizeFilename(s) {
  return (s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || `clip_${Date.now()}`;
}

function defaultFilename(voiceLabel, mode, langCode) {
  const v = (voiceLabel || 'voice').replace(/\s+/g, '_').toLowerCase();
  const m = (mode || 'story').toLowerCase();
  const ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 14);
  const lang = langCode && langCode !== 'en' ? `_${langCode}` : '';
  return `${v}_${m}${lang}_${ts}.mp3`;
}

// ═══════════════════════════════════════════════════════════
//  INDEXEDDB — audio library
// ═══════════════════════════════════════════════════════════
const DB_NAME = 'hyezen';
const DB_VERSION = 1;
const STORE = 'library';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAdd(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}
async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function dbGet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ═══════════════════════════════════════════════════════════
//  LOCALSTORAGE — favorites, presets, settings
// ═══════════════════════════════════════════════════════════
const LS = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('hx_' + key);
      return v ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('hx_' + key, JSON.stringify(value)); } catch {}
  },
};

// ═══════════════════════════════════════════════════════════
//  APP
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [backendReady, setBackendReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Starting HYEZEN...');

  const [activeTab, setActiveTab] = useState('realistic');
  const [text, setText] = useState('');
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState('');
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [voiceId, setVoiceId] = useState('');
  const [recording, setRecording] = useState(false);
  const [synthVoices, setSynthVoices] = useState([]);

  const [modes, setModes] = useState([]);
  const [selectedMode, setSelectedMode] = useState('story');

  const [translateOn, setTranslateOn] = useState(false);
  const [targetLang, setTargetLang] = useState('es');
  const [showOriginal, setShowOriginal] = useState(true);

  // Modals
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [menuTab, setMenuTab] = useState('library'); // library | presets | batch

  const [voiceSortMode, setVoiceSortMode] = useState('continent');
  const [translateSortMode, setTranslateSortMode] = useState('continent');

  const [voicePrompt, setVoicePrompt] = useState(null);

  // Favorites
  const [favorites, setFavorites] = useState(() => LS.get('favorites', []));
  const longPressRef = useRef(null);
  const longPressFiredRef = useRef(false);

  // Presets
  const [presets, setPresets] = useState(() => LS.get('presets', []));
  const [presetName, setPresetName] = useState('');

  // Library
  const [library, setLibrary] = useState([]);
  const [autoDownload, setAutoDownload] = useState(() => LS.get('autoDownload', false));
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState({ displayName: '', filename: '' });

  // Naming modal (after generation, before library save)
  const [namePrompt, setNamePrompt] = useState(null);
  // { blobUrl, blob, defaultDisplay, defaultFilename, voiceName, voiceLabel, mode, lang, duration, thenDownload }

  // Batch
  const [batchText, setBatchText] = useState('');
  const [batchPrefix, setBatchPrefix] = useState('clip');
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [batchPresetId, setBatchPresetId] = useState('');
  const batchCancelRef = useRef(false);

  const [navVisible, setNavVisible] = useState(true);
  const navTimer = useRef(null);

  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const chatEndRef = useRef(null);

  const themes = {
    elevenlabs: { name: 'ULTRA VOICE CLONE', sub: 'Clone your voice with AI' },
    xtts:       { name: 'BEST-XTTS',         sub: 'Male & Female voices' },
    realistic:  { name: 'GOOD-REALISTIC TTS', sub: '150+ Premium voices' },
    fair:       { name: 'FAIR-FULL TTS',     sub: '78 Global voices' },
    robotic:    { name: 'BASIC-ROBOTIC',     sub: 'Male & Female robotic' },
  };

  const tabs = [
    { id: 'elevenlabs', name: 'Ultra' },
    { id: 'xtts', name: 'XTTS' },
    { id: 'realistic', name: 'Realistic' },
    { id: 'fair', name: 'Fair' },
    { id: 'robotic', name: 'Robotic' },
  ];

  // ── Boot ─────────────────────────────────────────────
  useEffect(() => { wakeBackend(); }, []);

  async function wakeBackend() {
    setLoadingStatus('Waking up servers...');
    const maxRetries = 20;
    let attempts = 0;
    while (attempts < maxRetries) {
      try {
        const res = await fetch(`${API_URL}/api/health`, { method: 'GET', signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          setLoadingStatus('Servers ready!');
          setTimeout(() => setBackendReady(true), 500);
          return;
        }
      } catch {}
      attempts++;
      setLoadingStatus(`Waking up servers... ${attempts}/${maxRetries}`);
      await new Promise(r => setTimeout(r, 3000));
    }
    setLoadingStatus('Loading anyway...');
    setBackendReady(true);
  }

  // Load library on boot + whenever menu opens
  const refreshLibrary = useCallback(async () => {
    try {
      const items = await dbAll();
      items.sort((a, b) => b.createdAt - a.createdAt);
      setLibrary(items);
    } catch (e) { console.error('library load', e); }
  }, []);

  useEffect(() => { if (backendReady) refreshLibrary(); }, [backendReady, refreshLibrary]);

  useEffect(() => {
    if (!backendReady) return;
    fetchVoices(activeTab);
    fetchModes();
    setChat([{ type: 'bot', text: `Welcome to ${themes[activeTab].name}. Tap the VOICE pill above to pick a voice.` }]);
    setVoiceId('');
  }, [activeTab, backendReady]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  useEffect(() => {
    const loadVoices = () => setSynthVoices(speechSynthesis.getVoices());
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Nav visibility
  useEffect(() => {
    function show() {
      setNavVisible(true);
      if (navTimer.current) clearTimeout(navTimer.current);
      navTimer.current = setTimeout(() => setNavVisible(false), 5000);
    }
    show();
    window.addEventListener('mousemove', show);
    window.addEventListener('touchstart', show, { passive: true });
    window.addEventListener('keydown', show);
    return () => {
      window.removeEventListener('mousemove', show);
      window.removeEventListener('touchstart', show);
      window.removeEventListener('keydown', show);
      if (navTimer.current) clearTimeout(navTimer.current);
    };
  }, []);

  function handleChatScroll() {
    setNavVisible(true);
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => setNavVisible(false), 5000);
  }

  // Persist favorites + presets + autoDownload
  useEffect(() => { LS.set('favorites', favorites); }, [favorites]);
  useEffect(() => { LS.set('presets', presets); }, [presets]);
  useEffect(() => { LS.set('autoDownload', autoDownload); }, [autoDownload]);

  // ── Data fetch ───────────────────────────────────────
  async function fetchVoices(type) {
    try {
      const res = await fetch(`${API_URL}/api/voices/${type}`);
      const data = await res.json();
      setVoices(data);
      if (data.length > 0) setVoice(data[0].name);
    } catch (err) { console.error('Fetch voices error:', err); }
  }
  async function fetchModes() {
    try {
      const res = await fetch(`${API_URL}/api/modes`);
      const data = await res.json();
      setModes(data);
      if (data.length > 0) setSelectedMode(data[0]);
    } catch (err) { console.error('Fetch modes error:', err); }
  }

  // ── Favorites — long press (3s) ──────────────────────
  function beginLongPress(voiceName) {
    longPressFiredRef.current = false;
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setFavorites(prev => {
        const has = prev.includes(voiceName);
        return has ? prev.filter(n => n !== voiceName) : [...prev, voiceName];
      });
    }, 3000);
  }
  function endLongPress() {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }
  function handleVoiceTap(v) {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    previewVoice(v);
    setShowVoiceModal(false);
  }

  // ── Preview ──────────────────────────────────────────
  async function previewVoice(v) {
    setVoice(v);
    if (activeTab === 'robotic') {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('Voice preview testing 1 2 3');
      const selectedVoice = getRoboticVoice(v);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = 1.1;
      utterance.pitch = v === 'female' ? 1.3 : 0.8;
      speechSynthesis.speak(utterance);
    } else {
      try {
        const res = await fetch(`${API_URL}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Voice preview', voice: v, type: activeTab, speed: 1.0, mode: selectedMode }),
        });
        const data = await res.json();
        if (data.url) {
          const audio = new Audio(`${API_URL}${data.url}`);
          audio.play().catch(e => console.log('Audio play failed:', e));
        }
      } catch (err) { console.error('Preview error:', err); }
    }
  }

  function getRoboticVoice(type) {
    if (synthVoices.length === 0) return null;
    if (type === 'male') {
      return synthVoices.find(v => v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('mark') || v.name.toLowerCase().includes('male')) || synthVoices[0];
    } else {
      return synthVoices.find(v => v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('susan') || v.name.toLowerCase().includes('female')) || synthVoices[1] || synthVoices[0];
    }
  }

  // ── Download helper ──────────────────────────────────
  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `hyezen_${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Generate audio (returns { url, blob }) ────────────
  async function generateAudio({ spokenText, useVoice }) {
    if (activeTab === 'elevenlabs') {
      const res = await fetch(`${API_URL}/api/elevenlabs/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spokenText, voice_id: voiceId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'TTS failed');
      const fullUrl = `${API_URL}${data.url}`;
      const blob = await (await fetch(fullUrl)).blob();
      return { url: fullUrl, blob };
    }
    const payload = {
      text: spokenText,
      voice: useVoice,
      type: activeTab,
      speed: 1.0,
      mode: selectedMode,
      characters: {},
    };
    const res = await fetch(`${API_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.robotic) return { robotic: true, text: spokenText, voice: useVoice };
    if (!data.url) throw new Error(data.error || 'TTS failed');
    const fullUrl = `${API_URL}${data.url}`;
    const blob = await (await fetch(fullUrl)).blob();
    return { url: fullUrl, blob };
  }

  // ── Save audio to library (after naming) ──────────────
  async function saveToLibrary({ blob, displayName, filename, voiceName, mode, lang, duration }) {
    const id = (crypto.randomUUID && crypto.randomUUID()) || `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const item = {
      id,
      displayName: displayName || filename || 'Untitled',
      filename: filename || defaultFilename(voiceLabel(voices, voiceName), mode, lang),
      voice: voiceName,
      voiceLabel: voiceLabel(voices, voiceName),
      mode,
      lang,
      duration: duration || 0,
      size: blob.size,
      createdAt: Date.now(),
      blob,
    };
    await dbAdd(item);
    await refreshLibrary();
    return item;
  }

  // ── Play a library item ───────────────────────────────
  function playLibraryItem(item) {
    const url = URL.createObjectURL(item.blob);
    const audio = new Audio(url);
    audio.play().catch(e => console.log(e));
    audio.onended = () => URL.revokeObjectURL(url);
  }

  function downloadLibraryItem(item) {
    const url = URL.createObjectURL(item.blob);
    triggerDownload(url, item.filename);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ── Rename library item ───────────────────────────────
  function startRename(item) {
    setRenamingId(item.id);
    setRenameDraft({
      displayName: item.displayName || '',
      filename: item.filename || '',
    });
  }
  async function commitRename(id) {
    const item = await dbGet(id);
    if (!item) return;
    item.displayName = renameDraft.displayName || item.filename;
    item.filename = renameDraft.filename || item.filename;
    await dbAdd(item);
    setRenamingId(null);
    await refreshLibrary();
  }
  async function deleteLibraryItem(id) {
    await dbDelete(id);
    await refreshLibrary();
  }

  // ── Presets ───────────────────────────────────────────
  function savePreset() {
    const name = (presetName || '').trim();
    if (!name) return;
    const newPreset = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      voice,
      mode: selectedMode,
      targetLang,
      translateOn,
      createdAt: Date.now(),
    };
    setPresets(prev => [...prev, newPreset]);
    setPresetName('');
  }
  function applyPreset(p) {
    if (p.voice) setVoice(p.voice);
    if (p.mode) setSelectedMode(p.mode);
    if (p.targetLang) setTargetLang(p.targetLang);
    setTranslateOn(!!p.translateOn);
  }
  function deletePreset(id) {
    setPresets(prev => prev.filter(x => x.id !== id));
  }

  // ── Core send flow ────────────────────────────────────
  async function sendText() {
    if (!text.trim() || loading) return;
    const currentText = text.trim();
    setText('');
    setChat(prev => [...prev, { type: 'user', text: currentText }]);
    setLoading(true);

    try {
      let spokenText = currentText;
      let didTranslate = false;

      if (translateOn && targetLang !== 'en') {
        try {
          const translated = await translateText(currentText, targetLang, 'en');
          if (translated && translated !== currentText) {
            spokenText = translated;
            didTranslate = true;
          }
        } catch (e) { console.warn('translate failed:', e.message); }
      }

      const currentLocale = voiceLocale(voice);
      const suggested = pickVoiceForLang(voices, targetLang);
      const needsVoicePrompt =
        didTranslate &&
        activeTab !== 'elevenlabs' &&
        activeTab !== 'robotic' &&
        suggested &&
        currentLocale !== targetLang;

      if (needsVoicePrompt) {
        setLoading(false);
        setVoicePrompt({
          originalText: currentText,
          translatedText: spokenText,
          suggestedVoiceName: suggested,
          suggestedVoiceLabel: voiceLabel(voices, suggested),
          currentVoiceLabel: voiceLabel(voices, voice),
          currentVoiceName: voice,
          didTranslate,
        });
        return;
      }

      await finalizeTTS({ originalText: currentText, spokenText, didTranslate, useVoice: voice });
    } catch (err) {
      setChat(prev => [...prev, { type: 'bot', text: 'Error: ' + err.message }]);
      setLoading(false);
    }
  }

  async function finalizeTTS({ originalText, spokenText, didTranslate, useVoice }) {
    setLoading(true);
    try {
      // Show translated text in chat if applicable
      if (didTranslate && showOriginal) {
        setChat(prev => [...prev, { type: 'bot', text: `Original: ${originalText}\nTranslated: ${spokenText}` }]);
      } else if (didTranslate) {
        setChat(prev => [...prev, { type: 'bot', text: spokenText }]);
      }

      const result = await generateAudio({ spokenText, useVoice });

      if (result.robotic) {
        speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(spokenText);
        const sv = getRoboticVoice(useVoice);
        if (sv) utter.voice = sv;
        utter.rate = 1.1;
        utter.pitch = useVoice === 'female' ? 1.3 : 0.8;
        speechSynthesis.speak(utter);
        setChat(prev => [...prev, { type: 'bot', text: `${useVoice === 'female' ? 'Female' : 'Male'} robotic voice played.` }]);
        setLoading(false);
        return;
      }

      const blobUrl = URL.createObjectURL(result.blob);

      setChat(prev => [...prev, {
        type: 'bot',
        audio: blobUrl,
        tier: activeTab,
        filename: defaultFilename(voiceLabel(voices, useVoice), selectedMode, didTranslate ? targetLang : 'en'),
      }]);

      // Prompt for naming → then save + optional download
      const vLabel = voiceLabel(voices, useVoice);
      const defFilename = defaultFilename(vLabel, selectedMode, didTranslate ? targetLang : 'en');
      setNamePrompt({
        blob: result.blob,
        defaultDisplay: spokenText.slice(0, 60),
        defaultFilename: defFilename,
        voiceName: useVoice,
        voiceLabel: vLabel,
        mode: selectedMode,
        lang: didTranslate ? targetLang : 'en',
        duration: 0,
        thenDownload: autoDownload,
      });
    } catch (err) {
      setChat(prev => [...prev, { type: 'bot', text: 'Error: ' + err.message }]);
    }
    setLoading(false);
  }

  // Resolve name prompt
  async function resolveNamePrompt({ displayName, filename, skip }) {
    if (!namePrompt) return;
    const p = namePrompt;
    setNamePrompt(null);
    if (skip) return;
    try {
      await saveToLibrary({
        blob: p.blob,
        displayName: displayName || p.defaultDisplay,
        filename: filename || p.defaultFilename,
        voiceName: p.voiceName,
        mode: p.mode,
        lang: p.lang,
        duration: p.duration,
      });
      if (p.thenDownload) {
        const url = URL.createObjectURL(p.blob);
        triggerDownload(url, filename || p.defaultFilename);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (e) {
      console.error('save library failed:', e);
    }
  }

  async function resolveVoicePrompt(action) {
    if (!voicePrompt) return;
    const p = voicePrompt;
    setVoicePrompt(null);

    if (action === 'cancel') {
      setChat(prev => [...prev, { type: 'bot', text: 'Cancelled.' }]);
      return;
    }

    let useVoice = p.currentVoiceName;
    if (action === 'suggested') {
      useVoice = p.suggestedVoiceName;
      setVoice(p.suggestedVoiceName);
    }

    await finalizeTTS({
      originalText: p.originalText,
      spokenText: p.translatedText,
      didTranslate: p.didTranslate,
      useVoice,
    });
  }

  // ── Batch ─────────────────────────────────────────────
  async function runBatch() {
    const lines = batchText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    let preset = null;
    if (batchPresetId) preset = presets.find(p => p.id === batchPresetId) || null;

    const batchVoice = preset?.voice || voice;
    const batchMode = preset?.mode || selectedMode;
    const batchLang = preset?.targetLang || targetLang;
    const batchTranslate = preset ? !!preset.translateOn : translateOn;

    setBatchRunning(true);
    batchCancelRef.current = false;
    setBatchProgress({ done: 0, total: lines.length });

    const results = [];

    for (let i = 0; i < lines.length; i++) {
      if (batchCancelRef.current) break;
      const line = lines[i];
      try {
        let spokenText = line;
        let didTranslate = false;
        if (batchTranslate && batchLang !== 'en') {
          try {
            const t = await translateText(line, batchLang, 'en');
            if (t && t !== line) { spokenText = t; didTranslate = true; }
          } catch {}
        }

        const result = await generateAudio({ spokenText, useVoice: batchVoice });

        if (result.robotic) {
          results.push({ error: 'robotic not supported in batch', line });
        } else {
          const vLabel = voiceLabel(voices, batchVoice);
          const filename = sanitizeFilename(
            `${batchPrefix}_${String(i + 1).padStart(3, '0')}.mp3`
          );
          const displayName = `${batchPrefix} ${i + 1}`;
          await saveToLibrary({
            blob: result.blob,
            displayName,
            filename,
            voiceName: batchVoice,
            mode: batchMode,
            lang: didTranslate ? batchLang : 'en',
            duration: 0,
          });
          results.push({ blob: result.blob, filename, spokenText });
        }
      } catch (e) {
        results.push({ error: e.message, line });
      }
      setBatchProgress({ done: i + 1, total: lines.length });
    }

    setBatchRunning(false);

    // Offer ZIP download of successful clips
    const successful = results.filter(r => r.blob);
    if (successful.length > 0) {
      const zip = new JSZip();
      for (const r of successful) zip.file(r.filename, r.blob);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `hyezen_batch_${Date.now()}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      setChat(prev => [...prev, {
        type: 'bot',
        text: `Batch complete: ${successful.length} of ${lines.length} clips saved to library, ZIP downloaded.`,
      }]);
    }
  }
  function cancelBatch() {
    batchCancelRef.current = true;
  }

  // ── Recording (ElevenLabs clone) ──────────────────────
  async function startRecording(e) {
    e.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      chunks.current = [];
      mediaRecorder.current.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      mediaRecorder.current.onstop = async () => {
        setRecording(false);
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const base64 = await blobToBase64(blob);
        setChat(prev => [...prev, { type: 'user', text: 'Voice sample recorded.' }]);
        setLoading(true);
        try {
          const res = await fetch(`${API_URL}/api/elevenlabs/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64.split(',')[1], name: 'MyVoice' }),
          });
          const data = await res.json();
          setLoading(false);
          if (data.success) {
            setVoiceId(data.voice_id);
            setChat(prev => [...prev, { type: 'bot', text: 'Voice cloned. Type text below to speak in your voice.' }]);
          } else {
            setChat(prev => [...prev, { type: 'bot', text: 'Clone failed: ' + data.error }]);
          }
        } catch (err) {
          setLoading(false);
          setChat(prev => [...prev, { type: 'bot', text: 'Clone error: ' + err.message }]);
        }
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.current.start();
      setRecording(true);
      setTimeout(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') stopRecording();
      }, 10000);
    } catch {
      alert('Mic permission denied.');
      setRecording(false);
    }
  }
  function stopRecording(e) {
    if (e) e.preventDefault();
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') mediaRecorder.current.stop();
    setRecording(false);
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ── Group voices for modal (with favorites pin) ───────
  function buildVoiceGroups() {
    if (activeTab === 'robotic' || activeTab === 'elevenlabs') {
      return [{ continent: null, items: voices }];
    }
    const favItems = voices.filter(v => favorites.includes(v.name));

    if (voiceSortMode === 'alpha') {
      const sorted = [...voices].sort((a, b) => a.name.localeCompare(b.name));
      const groups = [];
      if (favItems.length > 0) groups.push({ continent: 'Favorites', items: favItems });
      groups.push({ continent: null, items: sorted });
      return groups;
    }
    const byCont = groupByContinent(voices, v => {
      const region = voiceRegion(v.name);
      return region ? REGION_TO_CONTINENT[region] : null;
    });
    if (favItems.length > 0) {
      return [{ continent: 'Favorites', items: favItems }, ...byCont];
    }
    return byCont;
  }

  function buildTranslateGroups() {
    const items = Object.entries(LANG_META).map(([code, meta]) => ({ code, ...meta }));
    if (translateSortMode === 'alpha') {
      return [{ continent: null, items: items.sort((a, b) => a.code.localeCompare(b.code)) }];
    }
    return groupByContinent(items, i => i.continent);
  }

  const voiceGroups = buildVoiceGroups();
  const translateGroups = buildTranslateGroups();

  // Group library by date
  function groupLibraryByDate(items) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfWeek = startOfToday - 6 * 86400000;
    const groups = { Today: [], Yesterday: [], 'This week': [], Older: [] };
    for (const it of items) {
      if (it.createdAt >= startOfToday) groups.Today.push(it);
      else if (it.createdAt >= startOfYesterday) groups.Yesterday.push(it);
      else if (it.createdAt >= startOfWeek) groups['This week'].push(it);
      else groups.Older.push(it);
    }
    return Object.entries(groups).filter(([, arr]) => arr.length > 0);
  }
  const libraryGroups = groupLibraryByDate(library);

  // ═══════════════════════════════════════════════════════
  //  LOADING SCREEN
  // ═══════════════════════════════════════════════════════
  if (!backendReady) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: '#0a0a0f', color: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px', boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: 'clamp(32px, 8vw, 48px)',
          fontWeight: '800', letterSpacing: '0.15em',
          marginBottom: '32px', textAlign: 'center',
        }}>HYEZEN</div>
        <div style={{
          width: '56px', height: '56px',
          border: '3px solid rgba(255,255,255,0.08)',
          borderTopColor: '#667eea',
          borderRadius: '50%',
          animation: 'hx-spin 0.9s linear infinite',
          marginBottom: '24px',
        }} />
        <div style={{
          fontSize: '13px', opacity: 0.65, textAlign: 'center',
          maxWidth: '320px', lineHeight: '1.5', letterSpacing: '0.03em',
        }}>{loadingStatus}</div>
        <style>{`@keyframes hx-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  //  MAIN
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{
      width: '100%', height: '100vh',
      background: '#0a0a0f', color: '#fff',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', boxSizing: 'border-box',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <style>{`
        .hx-header { background: rgba(17,27,33,0.9); padding: 12px 16px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; }
        .hx-topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .hx-dots { display: flex; flex-direction: column; gap: 3px; cursor: pointer; padding: 6px 4px; border-radius: 6px; }
        .hx-dots:hover { background: rgba(255,255,255,0.06); }
        .hx-dots span { width: 3px; height: 3px; background: #8696a0; border-radius: 50%; }
        .hx-logo { font-size: 14px; font-weight: 800; letter-spacing: 0.25em; background: linear-gradient(90deg, #00a884, #25d366); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .hx-engine-name { font-size: 11px; opacity: 0.55; letter-spacing: 0.1em; margin-left: auto; }

        .hx-labels { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 2px; }
        .hx-label { font-size: 9px; font-weight: 700; letter-spacing: 0.22em; color: #8696a0; text-align: center; opacity: 0.65; }

        .hx-pills-row { position: relative; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding-top: 20px; }
        .hx-cell { position: relative; }
        .hx-connector { position: absolute; top: -20px; left: 50%; width: 60px; height: 20px; transform: translateX(-50%); overflow: visible; pointer-events: none; }
        .hx-wire { fill: none; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 3 5; animation: hx-pulse 1.8s linear infinite; }
        .hx-conn-voice .hx-wire { stroke: #00a884; }
        .hx-conn-modes .hx-wire { stroke: #a855f7; }
        .hx-conn-translation .hx-wire { stroke: #3b82f6; }
        .hx-conn-translation.off .hx-wire { stroke: #4b5563; opacity: 0.3; animation: none; }
        @keyframes hx-pulse { to { stroke-dashoffset: -20; } }

        .hx-seg { position: absolute; top: 50%; transform: translateY(-50%); height: 1.6px; pointer-events: none; z-index: 0; border-radius: 2px; }
        .hx-seg-voice-modes { left: calc(33.333% - 4px); right: calc(66.666% - 4px); background: linear-gradient(90deg, #00a884, #a855f7); background-size: 200% 100%; animation: hx-chain-flow 2.2s linear infinite; box-shadow: 0 0 6px rgba(0,168,132,0.5), 0 0 6px rgba(168,85,247,0.5); }
        .hx-seg-modes-translation { left: calc(66.666% - 4px); right: calc(33.333% - 4px); background: linear-gradient(90deg, #a855f7, #3b82f6); background-size: 200% 100%; animation: hx-chain-flow 2.2s linear infinite; box-shadow: 0 0 6px rgba(168,85,247,0.5), 0 0 6px rgba(59,130,246,0.5); }
        @keyframes hx-chain-flow { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

        .hx-pill { position: relative; z-index: 1; padding: 4px 8px; border-radius: 999px; background: #1e2830; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-align: center; color: #e9edef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border: 1.1px solid transparent; transition: transform 0.2s; line-height: 1.2; }
        .hx-pill-voice { border-color: #00a884; animation: hx-neon-green 2.4s ease-in-out infinite; cursor: pointer; }
        .hx-pill-modes { border-color: #a855f7; animation: hx-neon-purple 2.4s ease-in-out infinite; cursor: pointer; opacity: 0.92; }
        .hx-pill-translation { border-color: #3b82f6; animation: hx-neon-blue 2.4s ease-in-out infinite; cursor: pointer; }
        .hx-pill-translation.off { border-color: #4b5563; animation: none; box-shadow: none; opacity: 0.55; }

        @keyframes hx-neon-green { 0%,100% { box-shadow: 0 0 0 1px rgba(0,168,132,0.35), 0 0 7px rgba(0,168,132,0.3), inset 0 0 4px rgba(0,168,132,0.1); } 50% { box-shadow: 0 0 0 1px rgba(0,168,132,0.7), 0 0 12px rgba(0,168,132,0.6), inset 0 0 7px rgba(0,168,132,0.22); } }
        @keyframes hx-neon-purple { 0%,100% { box-shadow: 0 0 0 1px rgba(168,85,247,0.35), 0 0 7px rgba(168,85,247,0.3), inset 0 0 4px rgba(168,85,247,0.1); } 50% { box-shadow: 0 0 0 1px rgba(168,85,247,0.7), 0 0 12px rgba(168,85,247,0.6), inset 0 0 7px rgba(168,85,247,0.22); } }
        @keyframes hx-neon-blue { 0%,100% { box-shadow: 0 0 0 1px rgba(59,130,246,0.35), 0 0 7px rgba(59,130,246,0.3), inset 0 0 4px rgba(59,130,246,0.1); } 50% { box-shadow: 0 0 0 1px rgba(59,130,246,0.7), 0 0 12px rgba(59,130,246,0.6), inset 0 0 7px rgba(59,130,246,0.22); } }

        .hx-pill-voice:hover, .hx-pill-modes:hover, .hx-pill-translation:hover { transform: translateY(-1px); }
        .hx-pill-voice:active, .hx-pill-modes:active, .hx-pill-translation:active { transform: translateY(0) scale(0.97); }

        .hx-nav-wrap { display: flex; justify-content: center; margin: 10px 16px 0; }
        .hx-nav { display: inline-flex; gap: 4px; padding: 6px 10px; border-radius: 999px; background: rgba(30,40,48,0.62); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border: 1px solid rgba(255,255,255,0.07); box-shadow: 0 4px 20px rgba(0,0,0,0.35); overflow-x: auto; scrollbar-width: none; transition: transform 0.35s ease, opacity 0.35s ease; max-width: 100%; }
        .hx-nav::-webkit-scrollbar { display: none; }
        .hx-nav.hidden { transform: translateY(-16px); opacity: 0; pointer-events: none; }
        .hx-nav-tab { padding: 6px 12px; border-radius: 999px; border: 1.2px solid transparent; background: transparent; color: #8696a0; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; letter-spacing: 0.03em; }
        .hx-nav-tab:hover { color: #e9edef; background: rgba(255,255,255,0.05); }
        .hx-nav-tab.active { color: #00e6a8; border-color: #00a884; background: rgba(0,168,132,0.12); box-shadow: 0 0 0 1px rgba(0,168,132,0.4), 0 0 10px rgba(0,168,132,0.55), inset 0 0 8px rgba(0,168,132,0.2); animation: hx-nav-neon 2.4s ease-in-out infinite; }
        @keyframes hx-nav-neon { 0%,100% { box-shadow: 0 0 0 1px rgba(0,168,132,0.4), 0 0 8px rgba(0,168,132,0.4), inset 0 0 6px rgba(0,168,132,0.15); } 50% { box-shadow: 0 0 0 1px rgba(0,168,132,0.85), 0 0 16px rgba(0,168,132,0.7), inset 0 0 10px rgba(0,168,132,0.3); } }

        .hx-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; }
        .hx-modal { background: #111b21; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 20px; max-width: 560px; width: 100%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.6); box-sizing: border-box; }
        .hx-modal-wide { max-width: 640px; }
        .hx-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; flex-wrap: wrap; }
        .hx-modal h3 { font-size: 11px; letter-spacing: 0.2em; font-weight: 700; color: #8696a0; margin: 0; text-transform: uppercase; }
        .hx-modal p { font-size: 14px; line-height: 1.55; color: #e9edef; margin: 0 0 18px; }

        .hx-menu-tabs { display: flex; gap: 4px; background: #1e2830; border-radius: 999px; padding: 3px; margin-bottom: 16px; }
        .hx-menu-tabs button { flex: 1; padding: 8px 12px; border: none; background: transparent; color: #8696a0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em; cursor: pointer; border-radius: 999px; transition: all 0.2s; text-transform: uppercase; }
        .hx-menu-tabs button.active { background: rgba(0,168,132,0.18); color: #00a884; }

        .hx-sort-toggle { display: inline-flex; background: #1e2830; border-radius: 999px; padding: 2px; }
        .hx-sort-toggle button { padding: 5px 12px; border: none; background: transparent; color: #8696a0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; border-radius: 999px; transition: all 0.2s; }
        .hx-sort-toggle button.active { background: rgba(0,168,132,0.18); color: #00a884; }

        .hx-group { margin-bottom: 16px; }
        .hx-group:last-child { margin-bottom: 0; }
        .hx-group-title { font-size: 9.5px; letter-spacing: 0.22em; font-weight: 700; color: #8696a0; margin-bottom: 8px; opacity: 0.85; text-transform: uppercase; }
        .hx-group-title.fav { color: #ffd166; opacity: 1; }

        .hx-modal-grid { display: flex; flex-wrap: wrap; gap: 7px; }
        .hx-modal-pill { padding: 7px 13px; border-radius: 999px; background: #1e2830; border: 1.3px solid transparent; color: #e9edef; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.18s; white-space: nowrap; letter-spacing: 0.02em; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .hx-modal-pill:hover { background: #2a3942; transform: translateY(-1px); }
        .hx-modal-pill.active { border-color: #00a884; background: rgba(0,168,132,0.15); color: #00a884; box-shadow: 0 0 10px rgba(0,168,132,0.35); }
        .hx-modal-pill.blue.active { border-color: #3b82f6; background: rgba(59,130,246,0.15); color: #3b82f6; box-shadow: 0 0 10px rgba(59,130,246,0.35); }
        .hx-modal-pill.purple.active { border-color: #a855f7; background: rgba(168,85,247,0.15); color: #a855f7; box-shadow: 0 0 10px rgba(168,85,247,0.35); }
        .hx-modal-pill.off { border-color: #4b5563; color: #8696a0; }
        .hx-modal-pill .star { color: #ffd166; margin-left: 6px; font-size: 10px; }

        .hx-modal-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
        .hx-modal-btn { flex: 1; min-width: 120px; padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #e9edef; font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; transition: all 0.18s; text-transform: uppercase; }
        .hx-modal-btn:hover { background: rgba(255,255,255,0.08); }
        .hx-modal-btn.primary { background: rgba(0,168,132,0.15); border-color: #00a884; color: #00a884; }
        .hx-modal-btn.primary:hover { background: rgba(0,168,132,0.25); }
        .hx-modal-btn.danger { border-color: rgba(255,59,48,0.4); color: #ff6b6b; }
        .hx-modal-btn.danger:hover { background: rgba(255,59,48,0.12); }

        .hx-toggle { padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #8696a0; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; cursor: pointer; transition: all 0.18s; }
        .hx-toggle.on { border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,0.1); }

        .hx-lib-row { display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 8px; }
        .hx-lib-info { flex: 1; min-width: 0; }
        .hx-lib-name { font-size: 13px; font-weight: 600; color: #e9edef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .hx-lib-meta { font-size: 10.5px; color: #8696a0; margin-top: 3px; letter-spacing: 0.03em; }
        .hx-icon-btn { padding: 6px 8px; border-radius: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.08); color: #e9edef; cursor: pointer; font-size: 11px; transition: all 0.18s; }
        .hx-icon-btn:hover { background: rgba(255,255,255,0.06); }
        .hx-icon-btn.danger:hover { border-color: rgba(255,59,48,0.5); color: #ff6b6b; }

        .hx-input { width: 100%; padding: 10px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #fff; font-size: 13px; outline: none; box-sizing: border-box; }
        .hx-input:focus { border-color: #00a884; }
        .hx-label-sm { font-size: 10px; letter-spacing: 0.15em; color: #8696a0; text-transform: uppercase; margin-bottom: 5px; display: block; font-weight: 700; }

        .hx-progress { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin-top: 10px; }
        .hx-progress-bar { height: 100%; background: linear-gradient(90deg, #00a884, #3b82f6); transition: width 0.3s; }

        .hx-preset-row { display: flex; align-items: center; gap: 8px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 8px; }
        .hx-preset-info { flex: 1; min-width: 0; }
        .hx-preset-name { font-size: 13px; font-weight: 600; }
        .hx-preset-meta { font-size: 10.5px; color: #8696a0; margin-top: 3px; }
      `}</style>

      {/* ══ HEADER ══ */}
      <div className="hx-header">
        <div className="hx-topbar">
          <div className="hx-dots" onClick={() => setShowMenuModal(true)} title="Menu">
            <span /><span /><span />
          </div>
          <div className="hx-logo">H Y E Z E N</div>
          <div className="hx-engine-name">{themes[activeTab].name}</div>
        </div>

        <div className="hx-labels">
          <span className="hx-label">VOICE</span>
          <span className="hx-label">MODES</span>
          <span className="hx-label">TRANSLATION</span>
        </div>

        <div className="hx-pills-row">
          <div className="hx-seg hx-seg-voice-modes" />
          {translateOn && <div className="hx-seg hx-seg-modes-translation" />}

          <div className="hx-cell">
            <svg className="hx-connector hx-conn-voice" viewBox="0 0 60 40" preserveAspectRatio="none">
              <path d="M 30 0 L 30 10 L 40 10 L 40 40" className="hx-wire" />
            </svg>
            <div className="hx-pill hx-pill-voice" onClick={() => setShowVoiceModal(true)}>
              {voiceLabel(voices, voice).toUpperCase()}
            </div>
          </div>

          <div className="hx-cell">
            <svg className="hx-connector hx-conn-modes" viewBox="0 0 60 40" preserveAspectRatio="none">
              <path d="M 30 0 L 30 10 L 40 10 L 40 40" className="hx-wire" />
            </svg>
            <div className="hx-pill hx-pill-modes" onClick={() => setShowModeModal(true)}>
              {prettyMode(selectedMode)}
            </div>
          </div>

          <div className="hx-cell">
            <svg className={`hx-connector hx-conn-translation ${!translateOn ? 'off' : ''}`} viewBox="0 0 60 40" preserveAspectRatio="none">
              <path d="M 30 0 L 30 10 L 40 10 L 40 40" className="hx-wire" />
            </svg>
            <div className={`hx-pill hx-pill-translation ${!translateOn ? 'off' : ''}`} onClick={() => setShowTranslateModal(true)}>
              {translateOn ? (LANG_META[targetLang]?.label.toUpperCase() || 'OFF') : 'OFF'}
            </div>
          </div>
        </div>
      </div>

      {/* ══ NAV ══ */}
      <div className="hx-nav-wrap">
        <div className={`hx-nav ${!navVisible ? 'hidden' : ''}`}>
          {tabs.map(t => (
            <button key={t.id} className={`hx-nav-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CHAT ══ */}
      <div onScroll={handleChatScroll} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: '#0a0a0f' }}>
        {chat.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
            <div style={{
              maxWidth: 'min(78%, 560px)',
              padding: msg.audio ? '8px' : '12px 16px',
              borderRadius: '18px',
              background: msg.type === 'user' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              fontSize: '15px', lineHeight: '1.45',
              whiteSpace: 'pre-wrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              border: msg.type === 'bot' ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}>
              {msg.audio ? (
                <div>
                  <audio controls src={msg.audio} style={{ width: '220px', borderRadius: '12px', marginBottom: '8px' }} />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => triggerDownload(msg.audio, msg.filename)} style={{
                      padding: '6px 12px', background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                      color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: '600',
                    }}>Download</button>
                  </div>
                </div>
              ) : msg.text}
            </div>
          </div>
        ))}
        {loading && <div style={{ textAlign: 'center', color: '#888', fontSize: '12.5px', marginTop: '10px', letterSpacing: '0.05em' }}>Generating voice...</div>}
        <div ref={chatEndRef} />
      </div>

      {/* ══ INPUT ══ */}
      <div style={{ background: 'rgba(20,20,30,0.85)', backdropFilter: 'blur(20px)', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {activeTab === 'elevenlabs' && !voiceId ? (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            onTouchCancel={stopRecording}
            style={{
              width: '100%', padding: '18px',
              background: recording ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none', borderRadius: '16px', color: '#fff',
              fontSize: '15px', fontWeight: '700', cursor: 'pointer',
              boxShadow: recording ? '0 0 40px rgba(245,87,108,0.8)' : '0 6px 20px rgba(102,126,234,0.5)',
              transition: 'all 0.15s',
              transform: recording ? 'scale(0.97)' : 'scale(1)',
              userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
            }}
          >
            {recording ? 'Recording — release to stop' : 'Hold to record 10s'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(activeTab === 'elevenlabs' && voiceId) || translateOn ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: '4px', gap: '10px', flexWrap: 'wrap' }}>
                {activeTab === 'elevenlabs' && voiceId && <span style={{ fontSize: '11.5px', color: '#0f0', letterSpacing: '0.03em' }}>Voice ready</span>}
                {translateOn && (
                  <span style={{ fontSize: '11.5px', color: '#3b82f6', letterSpacing: '0.03em' }}>
                    Speaking in {LANG_META[targetLang]?.label}
                  </span>
                )}
                {translateOn && (
                  <button className={`hx-toggle ${showOriginal ? 'on' : ''}`} onClick={() => setShowOriginal(!showOriginal)}>
                    {showOriginal ? 'Show original' : 'Translated only'}
                  </button>
                )}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendText()}
                placeholder={activeTab === 'elevenlabs' && voiceId ? 'Type text to speak in your voice...' : 'Type text to generate voice...'}
                style={{
                  flex: 1, padding: '14px 16px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '14px', color: '#fff', fontSize: '15px',
                  outline: 'none', backdropFilter: 'blur(10px)',
                }}
              />
              <button onClick={sendText} disabled={loading} style={{
                padding: '14px 18px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none', borderRadius: '14px', color: '#fff',
                fontSize: '18px', cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 15px rgba(102,126,234,0.4)',
                fontWeight: '700', opacity: loading ? 0.6 : 1,
              }}>➤</button>
            </div>
          </div>
        )}
      </div>

      {/* ══ THREE-DOT MENU ══ */}
      {showMenuModal && (
        <div className="hx-modal-backdrop" onClick={() => setShowMenuModal(false)}>
          <div className="hx-modal hx-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="hx-menu-tabs">
              <button className={menuTab === 'library' ? 'active' : ''} onClick={() => setMenuTab('library')}>Library</button>
              <button className={menuTab === 'presets' ? 'active' : ''} onClick={() => setMenuTab('presets')}>Presets</button>
              <button className={menuTab === 'batch' ? 'active' : ''} onClick={() => setMenuTab('batch')}>Batch</button>
            </div>

            {/* ── LIBRARY ── */}
            {menuTab === 'library' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '11px', color: '#8696a0', letterSpacing: '0.05em' }}>
                    {library.length} {library.length === 1 ? 'clip' : 'clips'}
                  </div>
                  <button className={`hx-toggle ${autoDownload ? 'on' : ''}`} onClick={() => setAutoDownload(!autoDownload)}>
                    Auto-download: {autoDownload ? 'ON' : 'OFF'}
                  </button>
                </div>

                {library.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#8696a0' }}>No saved clips yet. Generate a voice and it appears here.</p>
                ) : (
                  libraryGroups.map(([label, items]) => (
                    <div key={label} className="hx-group">
                      <div className="hx-group-title">{label}</div>
                      {items.map(item => (
                        <div key={item.id} className="hx-lib-row">
                          {renamingId === item.id ? (
                            <div className="hx-lib-info" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <input
                                className="hx-input"
                                value={renameDraft.displayName}
                                onChange={e => setRenameDraft({ ...renameDraft, displayName: e.target.value })}
                                placeholder="Display name"
                                autoFocus
                              />
                              <input
                                className="hx-input"
                                value={renameDraft.filename}
                                onChange={e => setRenameDraft({ ...renameDraft, filename: e.target.value })}
                                placeholder="filename.mp3"
                              />
                              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                <button className="hx-modal-btn primary" style={{ flex: 1, padding: '8px' }} onClick={() => commitRename(item.id)}>Save</button>
                                <button className="hx-modal-btn" style={{ flex: 1, padding: '8px' }} onClick={() => setRenamingId(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="hx-lib-info">
                                <div className="hx-lib-name">{item.displayName}</div>
                                <div className="hx-lib-meta">
                                  {item.voiceLabel} · {prettyMode(item.mode)}
                                  {item.lang && item.lang !== 'en' ? ` · ${LANG_META[item.lang]?.label || item.lang}` : ''}
                                  {' · '}{(item.size / 1024).toFixed(0)} KB
                                </div>
                              </div>
                              <button className="hx-icon-btn" onClick={() => playLibraryItem(item)} title="Play">Play</button>
                              <button className="hx-icon-btn" onClick={() => startRename(item)} title="Rename">Edit</button>
                              <button className="hx-icon-btn" onClick={() => downloadLibraryItem(item)} title="Download">Save</button>
                              <button className="hx-icon-btn danger" onClick={() => deleteLibraryItem(item.id)} title="Delete">Del</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </>
            )}

            {/* ── PRESETS ── */}
            {menuTab === 'presets' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label className="hx-label-sm">Save current setup</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      className="hx-input"
                      value={presetName}
                      onChange={e => setPresetName(e.target.value)}
                      placeholder="Preset name (e.g. Narrator FR)"
                      onKeyDown={e => e.key === 'Enter' && savePreset()}
                    />
                    <button className="hx-modal-btn primary" style={{ flex: '0 0 auto', minWidth: '80px' }} onClick={savePreset}>Save</button>
                  </div>
                  <div style={{ fontSize: '11px', color: '#8696a0', marginTop: '6px', letterSpacing: '0.03em' }}>
                    Captures: {voiceLabel(voices, voice)} · {prettyMode(selectedMode)} · {translateOn ? (LANG_META[targetLang]?.label || 'Off') : 'No translation'}
                  </div>
                </div>

                {presets.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#8696a0' }}>No presets yet.</p>
                ) : (
                  presets.map(p => (
                    <div key={p.id} className="hx-preset-row">
                      <div className="hx-preset-info">
                        <div className="hx-preset-name">{p.name}</div>
                        <div className="hx-preset-meta">
                          {voiceLabel(voices, p.voice)} · {prettyMode(p.mode)} · {p.translateOn ? (LANG_META[p.targetLang]?.label || 'Off') : 'No translation'}
                        </div>
                      </div>
                      <button className="hx-icon-btn" onClick={() => { applyPreset(p); setShowMenuModal(false); }}>Load</button>
                      <button className="hx-icon-btn danger" onClick={() => deletePreset(p.id)}>Del</button>
                    </div>
                  ))
                )}
              </>
            )}

            {/* ── BATCH ── */}
            {menuTab === 'batch' && (
              <>
                <p style={{ fontSize: '12px', color: '#8696a0', marginBottom: '14px' }}>
                  One line = one audio clip. Uses current voice/mode/translation, or a preset.
                </p>

                <div style={{ marginBottom: '12px' }}>
                  <label className="hx-label-sm">Preset (optional)</label>
                  <select
                    className="hx-input"
                    value={batchPresetId}
                    onChange={e => setBatchPresetId(e.target.value)}
                  >
                    <option value="">— Use current settings —</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="hx-label-sm">Filename prefix</label>
                  <input
                    className="hx-input"
                    value={batchPrefix}
                    onChange={e => setBatchPrefix(e.target.value)}
                    placeholder="clip"
                  />
                  <div style={{ fontSize: '10.5px', color: '#8696a0', marginTop: '5px', letterSpacing: '0.02em' }}>
                    Files: {batchPrefix || 'clip'}_001.mp3, {batchPrefix || 'clip'}_002.mp3, …
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="hx-label-sm">Lines</label>
                  <textarea
                    className="hx-input"
                    value={batchText}
                    onChange={e => setBatchText(e.target.value)}
                    placeholder={'Hello world\nSecond clip\nThird one'}
                    rows={6}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                {batchRunning ? (
                  <>
                    <div style={{ fontSize: '12px', color: '#8696a0', marginBottom: '6px', letterSpacing: '0.03em' }}>
                      Generating {batchProgress.done} / {batchProgress.total}…
                    </div>
                    <div className="hx-progress">
                      <div className="hx-progress-bar" style={{ width: `${(batchProgress.done / Math.max(1, batchProgress.total)) * 100}%` }} />
                    </div>
                    <div className="hx-modal-actions">
                      <button className="hx-modal-btn danger" onClick={cancelBatch}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className="hx-modal-actions">
                    <button
                      className="hx-modal-btn primary"
                      onClick={runBatch}
                      disabled={!batchText.trim()}
                      style={{ opacity: batchText.trim() ? 1 : 0.5 }}
                    >
                      Generate batch
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ VOICE MODAL ══ */}
      {showVoiceModal && (
        <div className="hx-modal-backdrop" onClick={() => setShowVoiceModal(false)}>
          <div className="hx-modal" onClick={e => e.stopPropagation()}>
            <div className="hx-modal-head">
              <h3>Choose voice</h3>
              {voices.length > 0 && activeTab !== 'elevenlabs' && activeTab !== 'robotic' && (
                <div className="hx-sort-toggle">
                  <button className={voiceSortMode === 'continent' ? 'active' : ''} onClick={() => setVoiceSortMode('continent')}>Continent</button>
                  <button className={voiceSortMode === 'alpha' ? 'active' : ''} onClick={() => setVoiceSortMode('alpha')}>A–Z</button>
                </div>
              )}
            </div>

            <div style={{ fontSize: '10.5px', color: '#8696a0', marginBottom: '12px', letterSpacing: '0.05em' }}>
              Tap to preview · Hold 3s to favorite
            </div>

            {activeTab === 'elevenlabs' ? (
              <p style={{ fontSize: '13px', color: '#8696a0' }}>
                {voiceId ? 'Voice cloned. Speaking in your cloned voice.' : 'Record a sample first — hold the button below.'}
              </p>
            ) : voices.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#8696a0' }}>No voices available.</p>
            ) : (
              voiceGroups.map((group, gi) => (
                <div key={gi} className="hx-group">
                  {group.continent && (
                    <div className={`hx-group-title ${group.continent === 'Favorites' ? 'fav' : ''}`}>
                      {group.continent}
                    </div>
                  )}
                  <div className="hx-modal-grid">
                    {group.items.map(v => {
                      const isFav = favorites.includes(v.name);
                      return (
                        <button
                          key={v.name + gi}
                          className={`hx-modal-pill ${voice === v.name ? 'active' : ''}`}
                          onPointerDown={() => beginLongPress(v.name)}
                          onPointerUp={endLongPress}
                          onPointerLeave={endLongPress}
                          onPointerCancel={endLongPress}
                          onClick={() => handleVoiceTap(v.name)}
                        >
                          {v.label}
                          {isFav && <span className="star">★</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ══ MODE MODAL ══ */}
      {showModeModal && (
        <div className="hx-modal-backdrop" onClick={() => setShowModeModal(false)}>
          <div className="hx-modal" onClick={e => e.stopPropagation()}>
            <div className="hx-modal-head"><h3>Narration mode</h3></div>
            {modes.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#8696a0' }}>No modes available.</p>
            ) : (
              <div className="hx-modal-grid">
                {modes.map(m => (
                  <button
                    key={m}
                    className={`hx-modal-pill purple ${selectedMode === m ? 'active' : ''}`}
                    onClick={() => { setSelectedMode(m); setShowModeModal(false); }}
                  >
                    {m.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ TRANSLATE MODAL ══ */}
      {showTranslateModal && (
        <div className="hx-modal-backdrop" onClick={() => setShowTranslateModal(false)}>
          <div className="hx-modal" onClick={e => e.stopPropagation()}>
            <div className="hx-modal-head">
              <h3>Speak in</h3>
              <div className="hx-sort-toggle">
                <button className={translateSortMode === 'continent' ? 'active' : ''} onClick={() => setTranslateSortMode('continent')}>Continent</button>
                <button className={translateSortMode === 'alpha' ? 'active' : ''} onClick={() => setTranslateSortMode('alpha')}>A–Z</button>
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <button
                className={`hx-modal-pill off ${!translateOn ? 'active' : ''}`}
                onClick={() => { setTranslateOn(false); setShowTranslateModal(false); }}
              >Off</button>
            </div>
            {translateGroups.map((group, gi) => (
              <div key={gi} className="hx-group">
                {group.continent && <div className="hx-group-title">{group.continent}</div>}
                <div className="hx-modal-grid">
                  {group.items.map(l => (
                    <button
                      key={l.code}
                      className={`hx-modal-pill blue ${translateOn && targetLang === l.code ? 'active' : ''}`}
                      onClick={() => { setTranslateOn(true); setTargetLang(l.code); setShowTranslateModal(false); }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ VOICE-MATCH PROMPT ══ */}
      {voicePrompt && (
        <div className="hx-modal-backdrop" onClick={() => resolveVoicePrompt('cancel')}>
          <div className="hx-modal" onClick={e => e.stopPropagation()}>
            <h3>Voice match</h3>
            <p>
              Speaking <strong>{LANG_META[targetLang]?.label}</strong> with an English voice
              (<strong>{voicePrompt.currentVoiceLabel}</strong>).<br /><br />
              Switch to the matching voice <strong>{voicePrompt.suggestedVoiceLabel}</strong>?
            </p>
            <div className="hx-modal-actions">
              <button className="hx-modal-btn primary" onClick={() => resolveVoicePrompt('suggested')}>
                Use {voicePrompt.suggestedVoiceLabel}
              </button>
              <button className="hx-modal-btn" onClick={() => resolveVoicePrompt('keep')}>
                Keep {voicePrompt.currentVoiceLabel}
              </button>
              <button className="hx-modal-btn" onClick={() => resolveVoicePrompt('cancel')}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ NAME PROMPT (save to library) ══ */}
      {namePrompt && (
        <NamePromptModal
          prompt={namePrompt}
          onResolve={resolveNamePrompt}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  NAME PROMPT — small internal component with local state
// ═══════════════════════════════════════════════════════════
function NamePromptModal({ prompt, onResolve }) {
  const [displayName, setDisplayName] = useState(prompt.defaultDisplay || '');
  const [filename, setFilename] = useState(prompt.defaultFilename || '');

  return (
    <div className="hx-modal-backdrop" onClick={() => onResolve({ skip: true })}>
      <div className="hx-modal" onClick={e => e.stopPropagation()}>
        <h3>Save clip</h3>
        <p style={{ fontSize: '13px', color: '#8696a0', marginBottom: '16px' }}>
          Give this clip a name, or skip to leave it unnamed.
        </p>

        <div style={{ marginBottom: '12px' }}>
          <label className="hx-label-sm">Display name</label>
          <input
            className="hx-input"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="What shows in the library"
            autoFocus
          />
        </div>

        <div style={{ marginBottom: '4px' }}>
          <label className="hx-label-sm">Filename</label>
          <input
            className="hx-input"
            value={filename}
            onChange={e => setFilename(e.target.value)}
            placeholder="filename.mp3"
          />
        </div>

        <div className="hx-modal-actions">
          <button className="hx-modal-btn primary" onClick={() => onResolve({ displayName, filename })}>
            Save
          </button>
          <button className="hx-modal-btn" onClick={() => onResolve({ skip: true })}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
