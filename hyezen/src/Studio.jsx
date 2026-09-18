import { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';

// ═══════════════════════════════════════════════════════════
//  INDEXEDDB — studio project store
//  Bumps DB_VERSION from 1 → 2 to add the new store.
//  Existing 'library' store is untouched.
// ═══════════════════════════════════════════════════════════
const DB_NAME = 'hyezen';
const DB_VERSION = 2;
const PROJ_STORE = 'studio_projects';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('library')) {
        const store = db.createObjectStore('library', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(PROJ_STORE)) {
        const s = db.createObjectStore(PROJ_STORE, { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function projGet(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJ_STORE, 'readonly');
    const req = tx.objectStore(PROJ_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function projSave(project) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJ_STORE, 'readwrite');
    tx.objectStore(PROJ_STORE).put(project);
    tx.oncomplete = () => resolve(project);
    tx.onerror = () => reject(tx.error);
  });
}

async function projLatest() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJ_STORE, 'readonly');
    const idx = tx.objectStore(PROJ_STORE).index('updatedAt');
    const req = idx.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      resolve(cursor ? cursor.value : null);
    };
    req.onerror = () => reject(req.error);
  });
}

// ═══════════════════════════════════════════════════════════
//  SCRIPT PARSER
//  Format: "Name: text" starts a new speaker block.
//  Non-matching lines append to the current block.
//  Blank lines separate paragraphs but do not change speaker.
//  First lines with no speaker → Narrator.
// ═══════════════════════════════════════════════════════════
const SPEAKER_RE = /^([A-Za-z][A-Za-z0-9 _-]{0,30}):\s*(.+)$/;

function parseScript(raw) {
  if (!raw || !raw.trim()) return [];
  const lines = raw.split('\n');
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(SPEAKER_RE);
    if (m) {
      const speaker = m[1].trim();
      const text = m[2].trim();
      if (current) blocks.push(current);
      current = { speaker, text };
    } else if (line.trim() === '') {
      // paragraph break — keep current speaker but separate
      if (current) current.text += '\n';
    } else {
      if (!current) {
        // first content with no speaker → Narrator
        current = { speaker: 'Narrator', text: line.trim() };
      } else {
        current.text += (current.text.endsWith('\n') ? '' : ' ') + line.trim();
      }
    }
  }
  if (current) blocks.push(current);

  // Clean up trailing newlines and merge blank-paragraph splits
  return blocks
    .map(b => ({ ...b, text: b.text.replace(/\n+$/g, '').trim() }))
    .filter(b => b.text.length > 0)
    .map((b, i) => ({ ...b, index: i }));
}

function extractSpeakers(blocks) {
  const seen = new Set();
  const out = [];
  for (const b of blocks) {
    if (!seen.has(b.speaker)) {
      seen.add(b.speaker);
      out.push(b.speaker);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════
//  STUDIO
// ═══════════════════════════════════════════════════════════
export default function Studio({
  API_URL,
  voices,
  modes,
  activeTab,
  translateOn,
  targetLang,
  onSaveToLibrary,
  onTranslate,
  triggerDownload,
  voiceLabel,
  prettyMode,
}) {
  // ── Project state ──
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState('Untitled Story');
  const [script, setScript] = useState('');
  const [cast, setCast] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // ── Derived ──
  const blocks = parseScript(script);
  const speakersInScript = extractSpeakers(blocks);
  const missingSpeakers = speakersInScript.filter(n => !cast.some(c => c.name === n));

  // ── Auto-cast prompt ──
  const [castPrompt, setCastPrompt] = useState(null); // { names: [], picked: Set }
  const lastPromptedNamesRef = useRef('');

  // ── Generation ──
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [results, setResults] = useState([]); // [{ filename, blob, speaker }]
  const cancelRef = useRef(false);

  // ── Preview cast ──
  const [previewing, setPreviewing] = useState(false);

  // ── Load last project on mount ──
  useEffect(() => {
    (async () => {
      try {
        const p = await projLatest();
        if (p) {
          setProjectId(p.id);
          setProjectName(p.name || 'Untitled Story');
          setScript(p.script || '');
          setCast(Array.isArray(p.cast) ? p.cast : []);
        } else {
          setProjectId(`proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        }
      } catch (e) {
        console.error('Studio load failed:', e);
        setProjectId(`proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      }
      setLoaded(true);
    })();
  }, []);

  // ── Auto-save (5s debounced) ──
  useEffect(() => {
    if (!loaded || !projectId) return;
    const t = setTimeout(() => {
      projSave({
        id: projectId,
        name: projectName,
        script,
        cast,
        updatedAt: Date.now(),
      }).catch(e => console.error('proj save', e));
    }, 5000);
    return () => clearTimeout(t);
  }, [loaded, projectId, projectName, script, cast]);

  // ── Auto-cast prompt ──
  useEffect(() => {
    if (!loaded) return;
    if (missingSpeakers.length === 0) return;
    const sig = missingSpeakers.join('|');
    if (lastPromptedNamesRef.current === sig) return;
    lastPromptedNamesRef.current = sig;
    setCastPrompt({
      names: missingSpeakers,
      picked: new Set(missingSpeakers),
    });
  }, [loaded, missingSpeakers.join('|')]); // eslint-disable-line

  // ── Helpers ──
  function defaultVoiceForIndex(idx) {
    if (voices.length === 0) return '';
    return voices[idx % voices.length].name;
  }
  function defaultMode() {
    return modes[0] || 'story';
  }

  function addCharacters(names) {
    setCast(prev => {
      const next = [...prev];
      for (const name of names) {
        if (next.some(c => c.name === name)) continue;
        next.push({
          name,
          voice: defaultVoiceForIndex(next.length),
          mode: defaultMode(),
          speed: 1.0,
        });
      }
      return next;
    });
  }

  function updateCast(name, field, value) {
    setCast(prev => prev.map(c => c.name === name ? { ...c, [field]: value } : c));
  }
  function removeCast(name) {
    setCast(prev => prev.filter(c => c.name !== name));
  }
  function addBlankCast() {
    let name = 'Character';
    let i = 1;
    while (cast.some(c => c.name === name)) { i++; name = `Character ${i}`; }
    setCast(prev => [...prev, { name, voice: defaultVoiceForIndex(prev.length), mode: defaultMode(), speed: 1.0 }]);
  }

  // ── Preview cast ──
  async function previewCast() {
    if (previewing || cast.length === 0) return;
    setPreviewing(true);
    for (const c of cast) {
      if (!c.voice) continue;
      try {
        const res = await fetch(`${API_URL}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `This is ${c.name}.`,
            voice: c.voice,
            type: activeTab === 'studio' ? 'realistic' : activeTab,
            speed: c.speed || 1.0,
            mode: c.mode || 'story',
          }),
        });
        const data = await res.json();
        if (data.url) {
          await new Promise(resolve => {
            const audio = new Audio(`${API_URL}${data.url}`);
            audio.onended = resolve;
            audio.onerror = resolve;
            audio.play().catch(resolve);
          });
        }
      } catch (e) { console.warn('preview voice failed:', e.message); }
    }
    setPreviewing(false);
  }

  // ── Generate all ──
  async function generateAll() {
    if (generating) return;
    if (blocks.length === 0) return;
    if (missingSpeakers.length > 0) return;

    // resolve voice from cast for each block
    const missingVoice = blocks.find(b => {
      const c = cast.find(x => x.name === b.speaker);
      return !c || !c.voice;
    });
    if (missingVoice) {
      alert(`No voice assigned for "${missingVoice.speaker}".`);
      return;
    }

    setGenerating(true);
    cancelRef.current = false;
    setProgress({ done: 0, total: blocks.length, current: '' });
    setResults([]);

    const collected = [];
    const type = activeTab === 'studio' ? 'realistic' : activeTab;
    const safeProject = (projectName || 'studio').replace(/\s+/g, '_').toLowerCase();

    for (let i = 0; i < blocks.length; i++) {
      if (cancelRef.current) break;
      const b = blocks[i];
      const c = cast.find(x => x.name === b.speaker);
      setProgress({ done: i, total: blocks.length, current: b.speaker });

      let spokenText = b.text;
      if (translateOn && targetLang !== 'en' && onTranslate) {
        try {
          const t = await onTranslate(b.text, targetLang, 'en');
          if (t && t !== b.text) spokenText = t;
        } catch {}
      }

      try {
        const res = await fetch(`${API_URL}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: spokenText,
            voice: c.voice,
            type,
            speed: c.speed || 1.0,
            mode: c.mode || 'story',
            characters: {},
          }),
        });
        const data = await res.json();
        if (!data.url) throw new Error(data.error || 'no url');
        const fullUrl = `${API_URL}${data.url}`;
        const blob = await (await fetch(fullUrl)).blob();
        const filename = `${safeProject}_${String(i + 1).padStart(3, '0')}_${b.speaker.replace(/\s+/g, '_').toLowerCase()}.mp3`;

        // save to library
        if (onSaveToLibrary) {
          try {
            await onSaveToLibrary({
              blob,
              displayName: `${projectName} — ${String(i + 1).padStart(2, '0')} ${b.speaker}`,
              filename,
              voiceName: c.voice,
              mode: c.mode,
              lang: translateOn ? targetLang : 'en',
              duration: 0,
            });
          } catch (e) { console.warn('library save failed:', e.message); }
        }

        collected.push({ filename, blob, speaker: b.speaker });
      } catch (e) {
        console.warn(`block ${i} failed:`, e.message);
        collected.push({ filename: null, blob: null, speaker: b.speaker, error: e.message });
      }
      setProgress({ done: i + 1, total: blocks.length, current: b.speaker });
    }

    setResults(collected);
    setGenerating(false);
  }

  function cancelGeneration() {
    cancelRef.current = true;
  }

  async function downloadZip() {
    const ok = results.filter(r => r.blob && r.filename);
    if (ok.length === 0) return;
    const zip = new JSZip();
    for (const r of ok) zip.file(r.filename, r.blob);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${(projectName || 'studio').replace(/\s+/g, '_')}.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  function clearResults() {
    setResults([]);
    setProgress({ done: 0, total: 0, current: '' });
  }

  // ── Render ──
  const totalChars = script.length;
  const totalLines = blocks.length;
  const busy = generating;

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#8696a0', fontSize: 13 }}>Loading studio…</div>;
  }

  return (
    <div className="st-root">
      <style>{`
        .st-root { flex: 1; overflow: hidden; display: flex; flex-direction: column; background: #0a0a0f; }
        .st-topstrip {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 16px; gap: 12px; flex-wrap: wrap;
          background: rgba(17,27,33,0.85);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .st-title-input {
          background: transparent; border: none; color: #e9edef;
          font-size: 15px; font-weight: 700; letter-spacing: 0.05em;
          outline: none; min-width: 200px; flex: 1; max-width: 320px;
        }
        .st-title-input::placeholder { color: #4b5563; }
        .st-stats {
          font-size: 10.5px; color: #8696a0; letter-spacing: 0.08em;
          display: flex; gap: 14px; flex-wrap: wrap;
        }
        .st-stats span strong { color: #e9edef; font-weight: 700; }

        .st-main {
          flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 340px;
          gap: 14px; padding: 14px 16px; overflow: hidden;
        }
        @media (max-width: 800px) {
          .st-main { grid-template-columns: 1fr; grid-template-rows: minmax(0,1fr) auto; }
        }

        .st-panel {
          background: rgba(17,27,33,0.7);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px; padding: 14px; overflow-y: auto;
          display: flex; flex-direction: column;
        }
        .st-panel-title {
          font-size: 10px; letter-spacing: 0.2em; font-weight: 700; color: #8696a0;
          text-transform: uppercase; margin-bottom: 10px;
        }

        .st-script {
          flex: 1; width: 100%; min-height: 260px;
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px; padding: 14px;
          color: #e9edef; font-size: 14px; line-height: 1.6;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          outline: none; resize: none; box-sizing: border-box;
        }
        .st-script:focus { border-color: rgba(0,168,132,0.5); }
        .st-hint {
          font-size: 10.5px; color: #4b5563; margin-top: 8px; letter-spacing: 0.03em;
        }
        .st-hint code {
          background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px;
          color: #8696a0;
        }

        .st-cast-list { display: flex; flex-direction: column; gap: 8px; }
        .st-cast-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px; padding: 10px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .st-cast-head {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .st-cast-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #00a884; flex: 0 0 auto;
          box-shadow: 0 0 8px rgba(0,168,132,0.6);
        }
        .st-cast-name {
          flex: 1; font-size: 13px; font-weight: 700; color: #e9edef;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .st-cast-remove {
          background: transparent; border: none; color: #6b7280;
          cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 6px;
        }
        .st-cast-remove:hover { color: #ff6b6b; background: rgba(255,59,48,0.1); }
        .st-cast-field {
          display: grid; grid-template-columns: 60px 1fr; gap: 8px; align-items: center;
        }
        .st-cast-label {
          font-size: 9.5px; letter-spacing: 0.15em; color: #8696a0; text-transform: uppercase;
          font-weight: 700;
        }
        .st-cast-select, .st-cast-input {
          width: 100%; background: rgba(0,0,0,0.3); color: #e9edef;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px; padding: 6px 8px;
          font-size: 12px; outline: none; box-sizing: border-box;
        }
        .st-cast-select:focus, .st-cast-input:focus { border-color: rgba(0,168,132,0.5); }
        .st-cast-speed {
          display: flex; align-items: center; gap: 8px;
        }
        .st-cast-speed input[type=range] {
          flex: 1; accent-color: #00a884;
        }
        .st-cast-speed-val {
          font-size: 11px; color: #8696a0; font-weight: 700; min-width: 34px; text-align: right;
        }

        .st-add-btn {
          margin-top: 10px; padding: 8px 12px;
          background: transparent; color: #8696a0;
          border: 1px dashed rgba(255,255,255,0.15);
          border-radius: 10px; font-size: 11.5px; font-weight: 700;
          letter-spacing: 0.08em; cursor: pointer; transition: all 0.18s;
        }
        .st-add-btn:hover { color: #e9edef; border-color: rgba(0,168,132,0.4); }

        .st-empty {
          font-size: 12.5px; color: #4b5563; text-align: center; padding: 20px 10px;
          line-height: 1.6;
        }

        .st-actions {
          display: flex; gap: 8px; flex-wrap: wrap;
          padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.05);
          background: rgba(17,27,33,0.85);
          align-items: center;
        }
        .st-btn {
          padding: 10px 16px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: #e9edef; font-size: 11.5px; font-weight: 700;
          letter-spacing: 0.08em; cursor: pointer; transition: all 0.18s;
          text-transform: uppercase;
        }
        .st-btn:hover { background: rgba(255,255,255,0.08); }
        .st-btn.primary {
          background: rgba(0,168,132,0.15); border-color: #00a884; color: #00a884;
        }
        .st-btn.primary:hover { background: rgba(0,168,132,0.25); }
        .st-btn.danger { border-color: rgba(255,59,48,0.4); color: #ff6b6b; }
        .st-btn.danger:hover { background: rgba(255,59,48,0.12); }
        .st-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .st-progress {
          flex: 1; min-width: 180px;
        }
        .st-progress-text {
          font-size: 11px; color: #8696a0; margin-bottom: 5px; letter-spacing: 0.03em;
        }
        .st-progress-bar {
          height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;
        }
        .st-progress-fill {
          height: 100%; background: linear-gradient(90deg, #00a884, #3b82f6);
          transition: width 0.3s;
        }

        .st-modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; z-index: 300; box-sizing: border-box;
        }
        .st-modal {
          background: #111b21; border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px; padding: 22px;
          max-width: 480px; width: 100%; max-height: 80vh; overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6); box-sizing: border-box;
        }
        .st-modal h3 {
          font-size: 11px; letter-spacing: 0.2em; font-weight: 700;
          color: #8696a0; margin: 0 0 12px; text-transform: uppercase;
        }
        .st-modal p {
          font-size: 13px; color: #e9edef; margin: 0 0 14px; line-height: 1.55;
        }
        .st-char-list {
          display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;
          max-height: 240px; overflow-y: auto;
        }
        .st-char-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer;
        }
        .st-char-row:hover { background: rgba(255,255,255,0.06); }
        .st-char-row input[type=checkbox] { accent-color: #00a884; }
        .st-char-row span { font-size: 13px; color: #e9edef; font-weight: 600; }
        .st-modal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .st-modal-actions .st-btn { flex: 1; min-width: 120px; }
      `}</style>

      {/* Top strip */}
      <div className="st-topstrip">
        <input
          className="st-title-input"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          placeholder="Untitled Story"
        />
        <div className="st-stats">
          <span><strong>{cast.length}</strong> cast</span>
          <span><strong>{totalLines}</strong> blocks</span>
          <span><strong>{totalChars}</strong> chars</span>
          {translateOn && (
            <span style={{ color: '#3b82f6' }}><strong>→</strong> {targetLang.toUpperCase()}</span>
          )}
        </div>
      </div>

      {/* Main panels */}
      <div className="st-main">
        {/* Script */}
        <div className="st-panel">
          <div className="st-panel-title">Script</div>
          <textarea
            className="st-script"
            value={script}
            onChange={e => setScript(e.target.value)}
            placeholder={`Rapunzel: I've been looking out a window for eighteen years.\nFlynn: You mean you've been watching the same window for eighteen years?\nNarrator: And so the two of them began the greatest adventure of their lives.`}
            spellCheck={false}
          />
          <div className="st-hint">
            Start a line with <code>Name:</code> to switch speaker. Lines without a prefix continue the current speaker.
          </div>
        </div>

        {/* Cast */}
        <div className="st-panel">
          <div className="st-panel-title">Cast ({cast.length})</div>

          {cast.length === 0 ? (
            <div className="st-empty">
              No characters yet.<br />
              Write a script with <code style={{ color: '#8696a0' }}>Name:</code> prefixes, or add one manually.
            </div>
          ) : (
            <div className="st-cast-list">
              {cast.map(c => (
                <div key={c.name} className="st-cast-card">
                  <div className="st-cast-head">
                    <div className="st-cast-dot" />
                    <div className="st-cast-name">{c.name}</div>
                    <button className="st-cast-remove" onClick={() => removeCast(c.name)} title="Remove">×</button>
                  </div>

                  <div className="st-cast-field">
                    <span className="st-cast-label">Voice</span>
                    <select
                      className="st-cast-select"
                      value={c.voice}
                      onChange={e => updateCast(c.name, 'voice', e.target.value)}
                    >
                      {voices.length === 0 && <option value="">No voices</option>}
                      {voices.map(v => (
                        <option key={v.name} value={v.name}>{v.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="st-cast-field">
                    <span className="st-cast-label">Mode</span>
                    <select
                      className="st-cast-select"
                      value={c.mode}
                      onChange={e => updateCast(c.name, 'mode', e.target.value)}
                    >
                      {modes.length === 0 && <option value="story">story</option>}
                      {modes.map(m => (
                        <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>

                  <div className="st-cast-field">
                    <span className="st-cast-label">Speed</span>
                    <div className="st-cast-speed">
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={c.speed}
                        onChange={e => updateCast(c.name, 'speed', parseFloat(e.target.value))}
                      />
                      <span className="st-cast-speed-val">{Number(c.speed).toFixed(2)}x</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="st-add-btn" onClick={addBlankCast}>+ Add character</button>
        </div>
      </div>

      {/* Actions bar */}
      <div className="st-actions">
        <button className="st-btn" onClick={previewCast} disabled={previewing || generating || cast.length === 0}>
          {previewing ? 'Previewing…' : 'Preview cast'}
        </button>

        {!generating && results.length === 0 && (
          <button
            className="st-btn primary"
            onClick={generateAll}
            disabled={blocks.length === 0 || missingSpeakers.length > 0}
          >
            Generate all
          </button>
        )}

        {generating && (
          <>
            <div className="st-progress">
              <div className="st-progress-text">
                Generating {progress.done} / {progress.total}
                {progress.current ? ` · ${progress.current}` : ''}
              </div>
              <div className="st-progress-bar">
                <div className="st-progress-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
            </div>
            <button className="st-btn danger" onClick={cancelGeneration}>Cancel</button>
          </>
        )}

        {!generating && results.length > 0 && (
          <>
            <div className="st-progress" style={{ color: '#00a884', fontSize: 11, letterSpacing: '0.05em' }}>
              {results.filter(r => r.blob).length} / {results.length} clips generated · saved to library
            </div>
            <button className="st-btn primary" onClick={downloadZip}>Download ZIP</button>
            <button className="st-btn" onClick={clearResults}>Clear</button>
          </>
        )}
      </div>

      {/* New characters prompt */}
      {castPrompt && (
        <div className="st-modal-backdrop" onClick={() => setCastPrompt(null)}>
          <div className="st-modal" onClick={e => e.stopPropagation()}>
            <h3>New characters found</h3>
            <p>
              {castPrompt.names.length} {castPrompt.names.length === 1 ? 'name' : 'names'} in your script {castPrompt.names.length === 1 ? 'is' : 'are'} not in the cast yet:
            </p>
            <div className="st-char-list">
              {castPrompt.names.map(n => {
                const checked = castPrompt.picked.has(n);
                return (
                  <label key={n} className="st-char-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setCastPrompt(prev => {
                          const picked = new Set(prev.picked);
                          if (picked.has(n)) picked.delete(n); else picked.add(n);
                          return { ...prev, picked };
                        });
                      }}
                    />
                    <span>{n}</span>
                  </label>
                );
              })}
            </div>
            <div className="st-modal-actions">
              <button
                className="st-btn primary"
                onClick={() => {
                  addCharacters([...castPrompt.picked]);
                  setCastPrompt(null);
                }}
                disabled={castPrompt.picked.size === 0}
              >
                Add {castPrompt.picked.size}
              </button>
              <button
                className="st-btn"
                onClick={() => {
                  addCharacters(castPrompt.names);
                  setCastPrompt(null);
                }}
              >
                Add all
              </button>
              <button className="st-btn" onClick={() => setCastPrompt(null)}>Ignore</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
