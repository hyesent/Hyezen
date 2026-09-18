import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://hyezen.onrender.com';

const TRANSLATE_LANGS = [
  { code: 'es', label: 'Spanish',    locale: 'es' },
  { code: 'fr', label: 'French',     locale: 'fr' },
  { code: 'de', label: 'German',     locale: 'de' },
  { code: 'it', label: 'Italian',    locale: 'it' },
  { code: 'pt', label: 'Portuguese', locale: 'pt' },
  { code: 'ru', label: 'Russian',    locale: 'ru' },
  { code: 'nl', label: 'Dutch',      locale: 'nl' },
  { code: 'pl', label: 'Polish',     locale: 'pl' },
  { code: 'tr', label: 'Turkish',    locale: 'tr' },
  { code: 'ar', label: 'Arabic',     locale: 'ar' },
  { code: 'he', label: 'Hebrew',     locale: 'he' },
  { code: 'hi', label: 'Hindi',      locale: 'hi' },
  { code: 'ja', label: 'Japanese',   locale: 'ja' },
  { code: 'ko', label: 'Korean',     locale: 'ko' },
  { code: 'zh', label: 'Chinese',    locale: 'zh' },
  { code: 'id', label: 'Indonesian', locale: 'id' },
  { code: 'ms', label: 'Malay',      locale: 'ms' },
  { code: 'vi', label: 'Vietnamese', locale: 'vi' },
  { code: 'th', label: 'Thai',       locale: 'th' },
  { code: 'sv', label: 'Swedish',    locale: 'sv' },
  { code: 'da', label: 'Danish',     locale: 'da' },
  { code: 'nb', label: 'Norwegian',  locale: 'nb' },
  { code: 'fi', label: 'Finnish',    locale: 'fi' },
  { code: 'cs', label: 'Czech',      locale: 'cs' },
  { code: 'hu', label: 'Hungarian',  locale: 'hu' },
  { code: 'el', label: 'Greek',      locale: 'el' },
  { code: 'ro', label: 'Romanian',   locale: 'ro' },
  { code: 'sk', label: 'Slovak',     locale: 'sk' },
  { code: 'sl', label: 'Slovenian',  locale: 'sl' },
  { code: 'hr', label: 'Croatian',   locale: 'hr' },
];

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
  if (!r.ok) throw new Error('google http ' + r.status);
  const p = await r.json();
  const out = p?.[0]?.map(x => x[0]).join('');
  if (!out) throw new Error('google empty');
  return out;
}

async function translateWithMyMemory(text, target, source = 'en') {
  const src = source === 'auto' ? 'en' : source;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${target}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error('mymemory http ' + r.status);
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
  if (!r.ok) throw new Error('libre http ' + r.status);
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

function voiceLocale(voiceName) {
  if (!voiceName) return null;
  const m = voiceName.match(/^([a-z]{2})-/);
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

function prettyMode(m) {
  return (m || 'story').replace(/_/g, ' ').toUpperCase();
}

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
  const [characters] = useState('{}');

  const [translateOn, setTranslateOn] = useState(false);
  const [targetLang, setTargetLang] = useState('es');
  const [showOriginal, setShowOriginal] = useState(true);

  // Modals
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showModeModal, setShowModeModal] = useState(false);
  const [showTranslateModal, setShowTranslateModal] = useState(false);

  const [voicePrompt, setVoicePrompt] = useState(null);

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

  useEffect(() => {
    if (!backendReady) return;
    fetchVoices(activeTab);
    fetchModes();
    setChat([{ type: 'bot', text: `Welcome to ${themes[activeTab].name}. Tap the VOICE pill above to pick a voice.` }]);
    setVoiceId('');
  }, [activeTab, backendReady]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  useEffect(() => {
    const loadVoices = () => setSynthVoices(speechSynthesis.getVoices());
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => {
    setNavVisible(true);
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => setNavVisible(false), 5000);
    return () => { if (navTimer.current) clearTimeout(navTimer.current); };
  }, [activeTab]);

  function handleChatScroll() {
    setNavVisible(true);
    if (navTimer.current) clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => setNavVisible(false), 5000);
  }

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

  function downloadAudio(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `hyezen_${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

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
        } catch (e) { console.warn('translate failed, using original:', e.message); }
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
      if (activeTab === 'elevenlabs') {
        if (!voiceId) {
          setChat(prev => [...prev, { type: 'bot', text: 'Please record your voice first.' }]);
          setLoading(false);
          return;
        }
        const res = await fetch(`${API_URL}/api/elevenlabs/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: spokenText, voice_id: voiceId }),
        });
        const data = await res.json();
        if (data.success) {
          if (didTranslate && showOriginal) {
            setChat(prev => [...prev, { type: 'bot', text: `Original: ${originalText}\nTranslated: ${spokenText}` }]);
          } else if (didTranslate) {
            setChat(prev => [...prev, { type: 'bot', text: spokenText }]);
          }
          setChat(prev => [...prev, { type: 'bot', audio: `${API_URL}${data.url}`, tier: 'elevenlabs', filename: `elevenlabs_${Date.now()}.mp3` }]);
        } else {
          setChat(prev => [...prev, { type: 'bot', text: 'Error: ' + data.error }]);
        }
      } else {
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

        if (data.robotic) {
          speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(spokenText);
          const selectedVoice = getRoboticVoice(useVoice);
          if (selectedVoice) utterance.voice = selectedVoice;
          utterance.rate = 1.1;
          utterance.pitch = useVoice === 'female' ? 1.3 : 0.8;
          speechSynthesis.speak(utterance);
          setChat(prev => [...prev, { type: 'bot', text: `${useVoice === 'female' ? 'Female' : 'Male'} robotic voice played.` }]);
        } else if (data.url) {
          if (didTranslate && showOriginal) {
            setChat(prev => [...prev, { type: 'bot', text: `Original: ${originalText}\nTranslated: ${spokenText}` }]);
          } else if (didTranslate) {
            setChat(prev => [...prev, { type: 'bot', text: spokenText }]);
          }
          setChat(prev => [...prev, { type: 'bot', audio: `${API_URL}${data.url}`, tier: activeTab, filename: `${activeTab}_${Date.now()}.mp3` }]);
        } else {
          setChat(prev => [...prev, { type: 'bot', text: 'Error: ' + data.error }]);
        }
      }
    } catch (err) {
      setChat(prev => [...prev, { type: 'bot', text: 'Error: ' + err.message }]);
    }
    setLoading(false);
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
      didTranslate: true,
      useVoice,
    });
  }

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
      alert('Mic permission denied. Enable microphone in browser settings and refresh.');
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
        .hx-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .hx-logo { font-size: 14px; font-weight: 800; letter-spacing: 0.25em; background: linear-gradient(90deg, #00a884, #25d366); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
        .hx-engine-name { font-size: 11px; opacity: 0.5; letter-spacing: 0.1em; }

        .hx-labels { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 4px; }
        .hx-label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.2em; color: #8696a0; text-align: center; opacity: 0.65; }

        .hx-pills-row { position: relative; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding-top: 24px; }

        .hx-connector { position: absolute; top: 0; width: 60px; height: 24px; overflow: visible; pointer-events: none; }
        .hx-conn-voice { left: calc(16.66% - 30px); }
        .hx-conn-modes { left: calc(50% - 30px); }
        .hx-conn-translation { left: calc(83.33% - 30px); }
        .hx-wire { fill: none; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 4 6; animation: hx-pulse 1.8s linear infinite; }
        .hx-conn-voice .hx-wire { stroke: #00a884; }
        .hx-conn-modes .hx-wire { stroke: #a855f7; }
        .hx-conn-translation .hx-wire { stroke: #3b82f6; }
        .hx-conn-translation.off .hx-wire { stroke: #4b5563; opacity: 0.3; animation: none; }
        @keyframes hx-pulse { to { stroke-dashoffset: -20; } }

        .hx-chain-line { position: absolute; top: 50px; left: 16.66%; right: 16.66%; height: 1.3px; background: linear-gradient(90deg, transparent, #00a884 15%, #a855f7 50%, #3b82f6 85%, transparent); background-size: 200% 100%; animation: hx-chain-flow 3s linear infinite; opacity: 0.5; z-index: 0; }
        @keyframes hx-chain-flow { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

        .hx-pill {
          position: relative; z-index: 1;
          padding: 6px 8px;
          border-radius: 999px;
          background: #1e2830;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-align: center;
          color: #e9edef;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          border: 1.2px solid transparent;
          transition: transform 0.2s;
          line-height: 1.2;
        }
        .hx-pill-voice { border-color: #00a884; animation: hx-neon-green 2.4s ease-in-out infinite; cursor: pointer; }
        .hx-pill-modes { border-color: #a855f7; animation: hx-neon-purple 2.4s ease-in-out infinite; cursor: pointer; opacity: 0.92; }
        .hx-pill-translation { border-color: #3b82f6; animation: hx-neon-blue 2.4s ease-in-out infinite; cursor: pointer; }
        .hx-pill-translation.off { border-color: #4b5563; animation: none; box-shadow: none; opacity: 0.55; }

        @keyframes hx-neon-green { 0%,100% { box-shadow: 0 0 0 1px rgba(0,168,132,0.35), 0 0 8px rgba(0,168,132,0.3), inset 0 0 5px rgba(0,168,132,0.1); } 50% { box-shadow: 0 0 0 1px rgba(0,168,132,0.7), 0 0 14px rgba(0,168,132,0.6), inset 0 0 8px rgba(0,168,132,0.22); } }
        @keyframes hx-neon-purple { 0%,100% { box-shadow: 0 0 0 1px rgba(168,85,247,0.35), 0 0 8px rgba(168,85,247,0.3), inset 0 0 5px rgba(168,85,247,0.1); } 50% { box-shadow: 0 0 0 1px rgba(168,85,247,0.7), 0 0 14px rgba(168,85,247,0.6), inset 0 0 8px rgba(168,85,247,0.22); } }
        @keyframes hx-neon-blue { 0%,100% { box-shadow: 0 0 0 1px rgba(59,130,246,0.35), 0 0 8px rgba(59,130,246,0.3), inset 0 0 5px rgba(59,130,246,0.1); } 50% { box-shadow: 0 0 0 1px rgba(59,130,246,0.7), 0 0 14px rgba(59,130,246,0.6), inset 0 0 8px rgba(59,130,246,0.22); } }

        .hx-pill-voice:hover, .hx-pill-modes:hover, .hx-pill-translation:hover { transform: translateY(-1px); }
        .hx-pill-voice:active, .hx-pill-modes:active, .hx-pill-translation:active { transform: translateY(0) scale(0.97); }

        .hx-nav { display: flex; gap: 6px; padding: 7px 12px; margin: 10px 16px 0; border-radius: 999px; background: rgba(30,40,48,0.6); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border: 1px solid rgba(255,255,255,0.07); box-shadow: 0 4px 20px rgba(0,0,0,0.35); overflow-x: auto; scrollbar-width: none; transition: transform 0.35s ease, opacity 0.35s ease; }
        .hx-nav::-webkit-scrollbar { display: none; }
        .hx-nav.hidden { transform: translateY(-24px); opacity: 0; pointer-events: none; }
        .hx-nav-tab { padding: 7px 13px; border-radius: 999px; border: none; background: transparent; color: #8696a0; font-size: 11.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; letter-spacing: 0.03em; }
        .hx-nav-tab:hover { color: #e9edef; background: rgba(255,255,255,0.05); }
        .hx-nav-tab.active { background: rgba(0,168,132,0.18); color: #00a884; box-shadow: inset 0 0 0 1px rgba(0,168,132,0.35); }

        .hx-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; }
        .hx-modal { background: #111b21; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 22px; max-width: 520px; width: 100%; max-height: 75vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.6); box-sizing: border-box; }
        .hx-modal h3 { font-size: 11px; letter-spacing: 0.2em; font-weight: 700; color: #8696a0; margin: 0 0 14px; text-transform: uppercase; }
        .hx-modal p { font-size: 14px; line-height: 1.55; color: #e9edef; margin: 0 0 18px; }
        .hx-modal-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .hx-modal-pill { padding: 9px 16px; border-radius: 999px; background: #1e2830; border: 1.4px solid transparent; color: #e9edef; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 0.18s; white-space: nowrap; letter-spacing: 0.02em; }
        .hx-modal-pill:hover { background: #2a3942; transform: translateY(-1px); }
        .hx-modal-pill.active { border-color: #00a884; background: rgba(0,168,132,0.15); color: #00a884; box-shadow: 0 0 12px rgba(0,168,132,0.35); }
        .hx-modal-pill.blue.active { border-color: #3b82f6; background: rgba(59,130,246,0.15); color: #3b82f6; box-shadow: 0 0 12px rgba(59,130,246,0.35); }
        .hx-modal-pill.purple.active { border-color: #a855f7; background: rgba(168,85,247,0.15); color: #a855f7; box-shadow: 0 0 12px rgba(168,85,247,0.35); }
        .hx-modal-pill.off { border-color: #4b5563; color: #8696a0; }

        .hx-modal-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
        .hx-modal-btn { flex: 1; min-width: 140px; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #e9edef; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; cursor: pointer; transition: all 0.18s; text-transform: uppercase; }
        .hx-modal-btn:hover { background: rgba(255,255,255,0.08); }
        .hx-modal-btn.primary { background: rgba(0,168,132,0.15); border-color: #00a884; color: #00a884; }
        .hx-modal-btn.primary:hover { background: rgba(0,168,132,0.25); }

        .hx-toggle { padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #8696a0; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; cursor: pointer; transition: all 0.18s; }
        .hx-toggle.on { border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,0.1); }
      `}</style>

      {/* ══ HEADER ══ */}
      <div className="hx-header">
        <div className="hx-topbar">
          <div className="hx-logo">H Y E Z E N</div>
          <div className="hx-engine-name">{themes[activeTab].name}</div>
        </div>

        <div className="hx-labels">
          <span className="hx-label">VOICE</span>
          <span className="hx-label">MODES</span>
          <span className="hx-label">TRANSLATION</span>
        </div>

        <div className="hx-pills-row">
          <svg className="hx-connector hx-conn-voice" viewBox="0 0 60 40" preserveAspectRatio="none"><path d="M 30 0 L 30 15 L 40 15 L 40 40" className="hx-wire" /></svg>
          <svg className="hx-connector hx-conn-modes" viewBox="0 0 60 40" preserveAspectRatio="none"><path d="M 30 0 L 30 15 L 40 15 L 40 40" className="hx-wire" /></svg>
          <svg className={`hx-connector hx-conn-translation ${!translateOn ? 'off' : ''}`} viewBox="0 0 60 40" preserveAspectRatio="none"><path d="M 30 0 L 30 15 L 40 15 L 40 40" className="hx-wire" /></svg>

          <div className="hx-chain-line" />

          <div className="hx-pill hx-pill-voice" onClick={() => setShowVoiceModal(true)}>
            {voiceLabel(voices, voice).toUpperCase()}
          </div>

          <div className="hx-pill hx-pill-modes" onClick={() => setShowModeModal(true)}>
            {prettyMode(selectedMode)}
          </div>

          <div className={`hx-pill hx-pill-translation ${!translateOn ? 'off' : ''}`} onClick={() => setShowTranslateModal(true)}>
            {translateOn ? (TRANSLATE_LANGS.find(l => l.code === targetLang)?.label.toUpperCase() || 'OFF') : 'OFF'}
          </div>
        </div>
      </div>

      {/* ══ GLASS NAV ══ */}
      <div className={`hx-nav ${!navVisible ? 'hidden' : ''}`}>
        {tabs.map(t => (
          <button key={t.id} className={`hx-nav-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.name}
          </button>
        ))}
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
              fontSize: '15px',
              lineHeight: '1.45',
              whiteSpace: 'pre-wrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              border: msg.type === 'bot' ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}>
              {msg.audio ? (
                <div>
                  <audio controls src={msg.audio} style={{ width: '220px', borderRadius: '12px', marginBottom: '8px' }} />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => downloadAudio(msg.audio, msg.filename)} style={{
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
                    Speaking in {TRANSLATE_LANGS.find(l => l.code === targetLang)?.label}
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

      {/* ══ VOICE MODAL ══ */}
      {showVoiceModal && (
        <div className="hx-modal-backdrop" onClick={() => setShowVoiceModal(false)}>
          <div className="hx-modal" onClick={e => e.stopPropagation()}>
            <h3>Choose voice</h3>
            {activeTab === 'elevenlabs' ? (
              <p style={{ fontSize: '13px', color: '#8696a0' }}>
                {voiceId ? 'Voice cloned. Speaking in your cloned voice.' : 'Record a sample first — hold the button below.'}
              </p>
            ) : voices.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#8696a0' }}>No voices available.</p>
            ) : (
              <div className="hx-modal-grid">
                {voices.map(v => (
                  <button
                    key={v.name}
                    className={`hx-modal-pill ${voice === v.name ? 'active' : ''}`}
                    onClick={() => { previewVoice(v.name); setShowVoiceModal(false); }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MODE MODAL ══ */}
      {showModeModal && (
        <div className="hx-modal-backdrop" onClick={() => setShowModeModal(false)}>
          <div className="hx-modal" onClick={e => e.stopPropagation()}>
            <h3>Narration mode</h3>
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
            <h3>Speak in</h3>
            <div className="hx-modal-grid">
              <button
                className={`hx-modal-pill off ${!translateOn ? 'active' : ''}`}
                onClick={() => { setTranslateOn(false); setShowTranslateModal(false); }}
              >
                Off
              </button>
              {TRANSLATE_LANGS.map(l => (
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
        </div>
      )}

      {/* ══ VOICE-MATCH PROMPT ══ */}
      {voicePrompt && (
        <div className="hx-modal-backdrop" onClick={() => resolveVoicePrompt('cancel')}>
          <div className="hx-modal" onClick={e => e.stopPropagation()}>
            <h3>Voice match</h3>
            <p>
              You're about to speak <strong>{TRANSLATE_LANGS.find(l => l.code === targetLang)?.label}</strong> with
              an English voice (<strong>{voicePrompt.currentVoiceLabel}</strong>).
              <br /><br />
              Use the matching voice <strong>{voicePrompt.suggestedVoiceLabel}</strong> instead?
            </p>
            <div className="hx-modal-actions">
              <button className="hx-modal-btn primary" onClick={() => resolveVoicePrompt('suggested')}>
                Use {voicePrompt.suggestedVoiceLabel}
              </button>
              <button className="hx-modal-btn" onClick={() => resolveVoicePrompt('keep')}>
                Keep {voicePrompt.currentVoiceLabel}
              </button>
              <button className="hx-modal-btn" onClick={() => resolveVoicePrompt('cancel')}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
