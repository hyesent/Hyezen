import { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';

// ═══════════════════════════════════════════════════════════
//  INDEXEDDB — studio project store
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

async function projAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJ_STORE, 'readonly');
    const req = tx.objectStore(PROJ_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
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
async function projDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJ_STORE, 'readwrite');
    tx.objectStore(PROJ_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ═══════════════════════════════════════════════════════════
//  PARSER
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
      if (current) current.text += '\n';
    } else {
      if (!current) {
        current = { speaker: 'Narrator', text: line.trim() };
      } else {
        current.text += (current.text.endsWith('\n') ? '' : ' ') + line.trim();
      }
    }
  }
  if (current) blocks.push(current);

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
  presets,          // ← new: App passes presets so studio can import them
  onSaveToLibrary,
  onTranslate,
  triggerDownload,
  voiceLabel,
  prettyMode,
}) {
  const [view, setView] = useState('home'); // 'home' | 'editor'
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [script, setScript] = useState('');
  const [cast, setCast] = useState([]);

  const [showNewStory, setShowNewStory] = useState(false);
  const [newStoryName, setNewStoryName] = useState('');

  const blocks = parseScript(script);
  const speakersInScript = extractSpeakers(blocks);
  const missingSpeakers = speakersInScript.filter(n => !cast.some(c => c.name === n));

  const [castPrompt, setCastPrompt] = useState(null);
  const lastPromptedNamesRef = useRef('');

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [results, setResults] = useState([]);
  const cancelRef = useRef(false);

  const [previewing, setPreviewing] = useState(false);

  // Rename-in-script prompt
  const [renamePrompt, setRenamePrompt] = useState(null); // { oldName, newName }
  // Preset picker per card
  const [presetPickerFor, setPresetPickerFor] = useState(null); // cast name

  // ── Load project list on mount ──
  const refreshProjects = useCallback(async () => {
    try {
      const all = await projAll();
      all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setProjects(all);
    } catch (e) { console.error('projects load', e); }
    setLoadingProjects(false);
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  // ── Auto-save current project (5s debounce) when in editor ──
  useEffect(() => {
    if (view !== 'editor' || !projectId) return;
    const t = setTimeout(() => {
      projSave({
        id: projectId,
        name: projectName || 'Untitled',
        script,
        cast,
        updatedAt: Date.now(),
      }).then(refreshProjects).catch(e => console.error('proj save', e));
    }, 5000);
    return () => clearTimeout(t);
  }, [view, projectId, projectName, script, cast, refreshProjects]);

  // ── Auto-cast prompt ──
  useEffect(() => {
    if (view !== 'editor') return;
    if (missingSpeakers.length === 0) return;
    const sig = missingSpeakers.join('|');
    if (lastPromptedNamesRef.current === sig) return;
    lastPromptedNamesRef.current = sig;
    setCastPrompt({
      names: missingSpeakers,
      picked: new Set(missingSpeakers),
    });
  }, [view, missingSpeakers.join('|')]); // eslint-disable-line

  // ── Helpers ──
  function defaultVoiceForIndex(idx) {
    if (voices.length === 0) return '';
    return voices[idx % voices.length].name;
  }
  function defaultMode() {
    return modes[0] || 'story';
  }

  function createProject(name) {
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const project = {
      id,
      name: name || 'Untitled Story',
      script: '',
      cast: [],
      updatedAt: Date.now(),
    };
    setProjectId(id);
    setProjectName(project.name);
    setScript('');
    setCast([]);
    setView('editor');
    projSave(project).then(refreshProjects);
  }

  function openProject(p) {
    setProjectId(p.id);
    setProjectName(p.name || 'Untitled');
    setScript(p.script || '');
    setCast(Array.isArray(p.cast) ? p.cast : []);
    setResults([]);
    setProgress({ done: 0, total: 0, current: '' });
    setView('editor');
  }

  async function deleteProject(id) {
    await projDelete(id);
    await refreshProjects();
  }

  function exitToHome() {
    // save immediately
    if (projectId) {
      projSave({
        id: projectId,
        name: projectName || 'Untitled',
        script,
        cast,
        updatedAt: Date.now(),
      }).then(refreshProjects).catch(() => {});
    }
    setView('home');
    setResults([]);
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

  function updateCast(oldName, field, value) {
    setCast(prev => prev.map(c => c.name === oldName ? { ...c, [field]: value } : c));
  }

  function renameCastMember(oldName, newName) {
    const clean = newName.trim();
    if (!clean || clean === oldName) return;
    if (cast.some(c => c.name === clean)) {
      alert(`"${clean}" already exists in the cast.`);
      return;
    }
    setCast(prev => prev.map(c => c.name === oldName ? { ...c, name: clean } : c));
    // ask to rename in script
    const usedInScript = parseScript(script).some(b => b.speaker === oldName);
    if (usedInScript) {
      setRenamePrompt({ oldName, newName: clean });
    }
  }

  function applyRenameInScript() {
    if (!renamePrompt) return;
    const { oldName, newName } = renamePrompt;
    const lines = script.split('\n').map(line => {
      const m = line.match(SPEAKER_RE);
      if (m && m[1].trim() === oldName) {
        return `${newName}: ${m[2]}`;
      }
      return line;
    });
    setScript(lines.join('\n'));
    setRenamePrompt(null);
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

  function applyPresetToCast(castName, preset) {
    setCast(prev => prev.map(c => c.name === castName ? {
      ...c,
      voice: preset.voice || c.voice,
      mode: preset.mode || c.mode,
      speed: typeof preset.speed === 'number' ? preset.speed : c.speed,
    } : c));
    setPresetPickerFor(null);
  }

  // ── Preview single voice ──
  async function previewOneVoice(castName) {
    const c = cast.find(x => x.name === castName);
    if (!c || !c.voice) return;
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
      if (data.url) new Audio(`${API_URL}${data.url}`).play().catch(() => {});
    } catch (e) { console.warn('preview failed:', e.message); }
  }

  // ── Preview whole cast (sequential) ──
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

  // ═══════════════════════════════════════════════════════════
  //  RENDER — HOME
  // ═══════════════════════════════════════════════════════════
  if (view === 'home') {
    return (
      <div className="st-root">
        <StudioStyles />
        <div className="st-home">
          <div className="st-home-head">
            <div className="st-home-title">Your Stories</div>
            <button className="st-btn primary" onClick={() => { setNewStoryName(''); setShowNewStory(true); }}>
              + New Story
            </button>
          </div>

          {loadingProjects ? (
            <div className="st-empty">Loading stories…</div>
          ) : projects.length === 0 ? (
            <div className="st-empty">
              No stories yet.<br />
              Tap <strong>+ New Story</strong> to start writing a multi-character script.
            </div>
          ) : (
            <div className="st-home-list">
              {projects.map(p => (
                <div key={p.id} className="st-home-row">
                  <div className="st-home-row-info" onClick={() => openProject(p)}>
                    <div className="st-home-row-name">{p.name || 'Untitled'}</div>
                    <div className="st-home-row-meta">
                      {(p.cast?.length || 0)} cast · {new Date(p.updatedAt || Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                  <button className="st-icon-btn" onClick={() => openProject(p)}>Open</button>
                  <button className="st-icon-btn danger" onClick={() => deleteProject(p.id)}>Del</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {showNewStory && (
          <div className="st-modal-backdrop" onClick={() => setShowNewStory(false)}>
            <div className="st-modal" onClick={e => e.stopPropagation()}>
              <h3>New story</h3>
              <p>Name your story. You can rename it later.</p>
              <input
                className="st-input"
                value={newStoryName}
                onChange={e => setNewStoryName(e.target.value)}
                placeholder="e.g. Tangled Opening"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && newStoryName.trim() && createProject(newStoryName.trim())}
              />
              <div className="st-modal-actions">
                <button
                  className="st-btn primary"
                  disabled={!newStoryName.trim()}
                  style={{ opacity: newStoryName.trim() ? 1 : 0.5 }}
                  onClick={() => createProject(newStoryName.trim())}
                >
                  Create
                </button>
                <button className="st-btn" onClick={() => setShowNewStory(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER — EDITOR
  // ═══════════════════════════════════════════════════════════
  const totalChars = script.length;
  const totalLines = blocks.length;
  const busy = generating;

  return (
    <div className="st-root">
      <StudioStyles />

      {/* Top strip */}
      <div className="st-topstrip">
        <button className="st-back-btn" onClick={exitToHome} title="Back to stories">‹</button>
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
        <div className="st-panel st-panel-script">
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
        <div className="st-panel st-panel-cast">
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
                    <input
                      className="st-cast-name-input"
                      value={c.name}
                      onChange={e => {
                        // update only locally as they type
                        setCast(prev => prev.map(x => x === c ? { ...x, name: e.target.value } : x));
                      }}
                      onBlur={e => {
                        const newName = e.target.value.trim();
                        if (newName !== c.name) {
                          renameCastMember(c.name, newName);
                        }
                      }}
                      placeholder="Character name"
                    />
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

                  <div className="st-cast-actions">
                    <button className="st-cast-mini-btn" onClick={() => previewOneVoice(c.name)}>Preview</button>
                    {presets && presets.length > 0 && (
                      <button className="st-cast-mini-btn" onClick={() => setPresetPickerFor(c.name)}>Presets</button>
                    )}
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

      {/* Rename-in-script prompt */}
      {renamePrompt && (
        <div className="st-modal-backdrop" onClick={() => setRenamePrompt(null)}>
          <div className="st-modal" onClick={e => e.stopPropagation()}>
            <h3>Rename in script?</h3>
            <p>
              You renamed <strong>{renamePrompt.oldName}</strong> to <strong>{renamePrompt.newName}</strong>.<br /><br />
              Update the script's <code>{renamePrompt.oldName}:</code> prefixes too?
            </p>
            <div className="st-modal-actions">
              <button className="st-btn primary" onClick={applyRenameInScript}>Update script</button>
              <button className="st-btn" onClick={() => setRenamePrompt(null)}>Just the cast</button>
            </div>
          </div>
        </div>
      )}

      {/* Preset picker */}
      {presetPickerFor && (
        <div className="st-modal-backdrop" onClick={() => setPresetPickerFor(null)}>
          <div className="st-modal" onClick={e => e.stopPropagation()}>
            <h3>Apply preset to {presetPickerFor}</h3>
            <div className="st-preset-list">
              {presets.map(p => (
                <button
                  key={p.id}
                  className="st-preset-item"
                  onClick={() => applyPresetToCast(presetPickerFor, p)}
                >
                  <div className="st-preset-item-name">{p.name}</div>
                  <div className="st-preset-item-meta">
                    {voiceLabel(voices, p.voice)} · {prettyMode(p.mode)} · {p.translateOn ? (p.targetLang || 'off') : 'no translation'}
                  </div>
                </button>
              ))}
            </div>
            <div className="st-modal-actions">
              <button className="st-btn" onClick={() => setPresetPickerFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════
function StudioStyles() {
  return (
    <style>{`
      .st-root { flex: 1; overflow: hidden; display: flex; flex-direction: column; background: #0a0a0f; min-height: 0; }

      /* ─── Home ────────────────────────────────── */
      .st-home {
        flex: 1; overflow-y: auto; padding: 20px 16px;
        display: flex; flex-direction: column; max-width: 640px; width: 100%;
        margin: 0 auto; box-sizing: border-box;
      }
      .st-home-head {
        display: flex; justify-content: space-between; align-items: center;
        gap: 12px; margin-bottom: 18px; flex-wrap: wrap;
      }
      .st-home-title {
        font-size: 16px; font-weight: 700; letter-spacing: 0.1em; color: #e9edef;
        text-transform: uppercase;
      }
      .st-home-list { display: flex; flex-direction: column; gap: 8px; }
      .st-home-row {
        display: flex; align-items: center; gap: 8px;
        padding: 12px; border-radius: 12px;
        background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      }
      .st-home-row-info { flex: 1; min-width: 0; cursor: pointer; }
      .st-home-row-name { font-size: 14px; font-weight: 700; color: #e9edef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .st-home-row-meta { font-size: 10.5px; color: #8696a0; margin-top: 3px; letter-spacing: 0.03em; }

      /* ─── Top strip ───────────────────────────── */
      .st-topstrip {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 16px; gap: 12px; flex-wrap: wrap;
        background: rgba(17,27,33,0.85);
        border-bottom: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
      }
      .st-back-btn {
        background: transparent; border: 1px solid rgba(255,255,255,0.08);
        color: #8696a0; font-size: 18px; cursor: pointer;
        width: 32px; height: 32px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.18s; line-height: 1; padding: 0;
      }
      .st-back-btn:hover { color: #e9edef; border-color: rgba(0,168,132,0.4); }
      .st-title-input {
        background: transparent; border: none; color: #e9edef;
        font-size: 15px; font-weight: 700; letter-spacing: 0.05em;
        outline: none; min-width: 160px; flex: 1; max-width: 320px;
      }
      .st-title-input::placeholder { color: #4b5563; }
      .st-stats {
        font-size: 10.5px; color: #8696a0; letter-spacing: 0.08em;
        display: flex; gap: 14px; flex-wrap: wrap;
      }
      .st-stats span strong { color: #e9edef; font-weight: 700; }

      /* ─── Main grid ───────────────────────────── */
      .st-main {
        flex: 1; min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: 14px; padding: 14px 16px; overflow: hidden;
      }

      /* ─── Panels ──────────────────────────────── */
      .st-panel {
        background: rgba(17,27,33,0.7);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 16px; padding: 14px;
        display: flex; flex-direction: column;
        min-height: 0; overflow: hidden;
      }
      .st-panel-script { min-height: 0; }
      .st-panel-cast {
        overflow-y: auto;
      }
      .st-panel-title {
        font-size: 10px; letter-spacing: 0.2em; font-weight: 700; color: #8696a0;
        text-transform: uppercase; margin-bottom: 10px; flex-shrink: 0;
      }

      .st-script {
        flex: 1; width: 100%; min-height: 200px;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 14px;
        color: #e9edef; font-size: 14px; line-height: 1.6;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        outline: none; resize: none; box-sizing: border-box;
      }
      .st-script:focus { border-color: rgba(0,168,132,0.5); }
      .st-hint {
        font-size: 10.5px; color: #4b5563; margin-top: 8px; letter-spacing: 0.03em; flex-shrink: 0;
      }
      .st-hint code {
        background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px;
        color: #8696a0;
      }

      /* ─── Cast cards ─────────────────────────── */
      .st-cast-list { display: flex; flex-direction: column; gap: 8px; }
      .st-cast-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 10px;
        display: flex; flex-direction: column; gap: 8px;
      }
      .st-cast-head {
        display: flex; align-items: center; gap: 8px;
      }
      .st-cast-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #00a884; flex: 0 0 auto;
        box-shadow: 0 0 8px rgba(0,168,132,0.6);
      }
      .st-cast-name-input {
        flex: 1; min-width: 0;
        background: transparent; border: 1px solid transparent;
        color: #e9edef; font-size: 13px; font-weight: 700;
        padding: 4px 6px; border-radius: 6px;
        outline: none;
      }
      .st-cast-name-input:hover { border-color: rgba(255,255,255,0.08); }
      .st-cast-name-input:focus { border-color: rgba(0,168,132,0.5); background: rgba(0,0,0,0.2); }
      .st-cast-remove {
        background: transparent; border: none; color: #6b7280;
        cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 6px;
      }
      .st-cast-remove:hover { color: #ff6b6b; background: rgba(255,59,48,0.1); }

      .st-cast-field {
        display: grid; grid-template-columns: 52px 1fr; gap: 8px; align-items: center;
      }
      .st-cast-label {
        font-size: 9.5px; letter-spacing: 0.15em; color: #8696a0; text-transform: uppercase;
        font-weight: 700;
      }
      .st-cast-select {
        width: 100%; background: rgba(0,0,0,0.3); color: #e9edef;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px; padding: 6px 8px;
        font-size: 12px; outline: none; box-sizing: border-box;
      }
      .st-cast-select:focus { border-color: rgba(0,168,132,0.5); }
      .st-cast-speed { display: flex; align-items: center; gap: 8px; }
      .st-cast-speed input[type=range] { flex: 1; accent-color: #00a884; min-width: 0; }
      .st-cast-speed-val {
        font-size: 11px; color: #8696a0; font-weight: 700; min-width: 34px; text-align: right;
      }
      .st-cast-actions {
        display: flex; gap: 6px; margin-top: 2px;
      }
      .st-cast-mini-btn {
        flex: 1; padding: 6px 8px;
        background: transparent; color: #8696a0;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px; font-size: 10.5px; font-weight: 700;
        letter-spacing: 0.08em; cursor: pointer; transition: all 0.18s;
        text-transform: uppercase;
      }
      .st-cast-mini-btn:hover { color: #e9edef; border-color: rgba(0,168,132,0.4); }

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

      /* ─── Actions bar ────────────────────────── */
      .st-actions {
        display: flex; gap: 8px; flex-wrap: wrap;
        padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.05);
        background: rgba(17,27,33,0.85); flex-shrink: 0;
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
      .st-btn.primary { background: rgba(0,168,132,0.15); border-color: #00a884; color: #00a884; }
      .st-btn.primary:hover { background: rgba(0,168,132,0.25); }
      .st-btn.danger { border-color: rgba(255,59,48,0.4); color: #ff6b6b; }
      .st-btn.danger:hover { background: rgba(255,59,48,0.12); }
      .st-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .st-icon-btn {
        padding: 6px 10px; border-radius: 8px;
        background: transparent; border: 1px solid rgba(255,255,255,0.08);
        color: #e9edef; cursor: pointer; font-size: 11px; transition: all 0.18s;
      }
      .st-icon-btn:hover { background: rgba(255,255,255,0.06); }
      .st-icon-btn.danger:hover { border-color: rgba(255,59,48,0.5); color: #ff6b6b; }

      .st-progress { flex: 1; min-width: 180px; }
      .st-progress-text { font-size: 11px; color: #8696a0; margin-bottom: 5px; letter-spacing: 0.03em; }
      .st-progress-bar { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
      .st-progress-fill { height: 100%; background: linear-gradient(90deg, #00a884, #3b82f6); transition: width 0.3s; }

      /* ─── Modal ──────────────────────────────── */
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
      .st-modal p code {
        background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px;
        color: #8696a0; font-size: 12px;
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
      .st-modal-actions .st-btn { flex: 1; min-width: 100px; }

      .st-input {
        width: 100%; padding: 10px 12px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px; color: #fff; font-size: 13px;
        outline: none; box-sizing: border-box; margin-bottom: 14px;
      }
      .st-input:focus { border-color: #00a884; }

      .st-preset-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; max-height: 320px; overflow-y: auto; }
      .st-preset-item {
        text-align: left; padding: 10px 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px; color: #e9edef; cursor: pointer;
        transition: all 0.18s;
      }
      .st-preset-item:hover { background: rgba(0,168,132,0.08); border-color: rgba(0,168,132,0.3); }
      .st-preset-item-name { font-size: 13px; font-weight: 700; }
      .st-preset-item-meta { font-size: 10.5px; color: #8696a0; margin-top: 3px; }

      /* ═══ MOBILE — stack, fixed heights, no overlap ═══ */
      @media (max-width: 800px) {
        .st-main {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
          padding: 10px 12px;
          gap: 10px;
        }
        .st-panel { padding: 10px; }
        .st-script { min-height: 140px; font-size: 13px; }
        .st-hint { font-size: 10px; }
        .st-stats { font-size: 10px; gap: 10px; }
        .st-title-input { font-size: 14px; }
        .st-actions { padding: 10px 12px; }
        .st-btn { padding: 9px 12px; font-size: 11px; }
      }
    `}</style>
  );
}
