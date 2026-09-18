import { useState, useEffect } from 'react';

export default function Lab({
  API_URL,
  voices,
  modes,
  triggerDownload,
  labResults,
  setLabResults,
}) {
  const [text, setText] = useState("I DON'T like that. Soo Soo Beautiful! Uhmmm... what is your name?");
  const [voice, setVoice] = useState('');
  const [mode, setMode] = useState('conversation');
  const [pitch, setPitch] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [capsAwareness, setCapsAwareness] = useState(true);
  const [fillersOn, setFillersOn] = useState(true);
  const [elongationOn, setElongationOn] = useState(true);
  const [v2Engine, setV2Engine] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!voice && voices.length > 0) setVoice(voices[0].name);
  }, [voices, voice]);

  function applyPreset(name) {
    if (name === 'reset') {
      setPitch(0); setSpeed(1.0); setMode('conversation');
      setCapsAwareness(true); setFillersOn(true); setElongationOn(true);
      setV2Engine(false);
    } else if (name === 'conversation') {
      setPitch(1); setSpeed(0.95); setMode('conversation');
    } else if (name === 'dramatic') {
      setPitch(-5); setSpeed(0.75); setMode('dramatic');
    } else if (name === 'fast') {
      setPitch(0); setSpeed(1.4); setMode('fast_talker');
    }
  }

  async function generate() {
    if (!text.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          voice,
          type: 'realistic',
          speed,
          pitch,
          mode,
          capsAwareness,
          fillersOn,
          elongationOn,
          v2Engine,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Generation failed.');
        return;
      }
      const entry = {
        id: `lab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url: `${API_URL}${data.url}`,
        fullText: text.trim(),
        textPreview: text.trim().slice(0, 90),
        duration: data.duration,
        voice: data.voice,
        language: data.language,
        emotion: data.emotion,
        rate: data.rate,
        pitch: data.pitch,
        capsEmphasis: !!data.capsEmphasis,
        capsWords: data.capsWords || [],
        fillerCount: data.fillerCount || 0,
        elongationCount: data.elongationCount || 0,
        questionMark: !!data.questionMark,
        cached: !!data.cached,
        settings: { mode, speed, pitch, capsAwareness, fillersOn, elongationOn, v2Engine },
        createdAt: Date.now(),
      };
      setLabResults(prev => [entry, ...prev]);
    } catch (e) {
      setError(e.message || 'Network error.');
    } finally {
      setGenerating(false);
    }
  }

  function removeResult(id) {
    setLabResults(prev => prev.filter(r => r.id !== id));
  }

  function clearSession() {
    setLabResults([]);
  }

  function downloadClip(entry) {
    triggerDownload(entry.url, `hyezen_lab_${entry.id}.mp3`);
  }

  return (
    <div className="lab-root">
      <LabStyles />

      <div className="lab-topstrip">
        <div className="lab-title">LAB</div>
        <div className="lab-presets">
          <button className="lab-preset-btn" onClick={() => applyPreset('reset')}>Reset</button>
          <button className="lab-preset-btn" onClick={() => applyPreset('conversation')}>Conversation</button>
          <button className="lab-preset-btn" onClick={() => applyPreset('dramatic')}>Dramatic</button>
          <button className="lab-preset-btn" onClick={() => applyPreset('fast')}>Fast</button>
        </div>
      </div>

      <div className="lab-main">
        {/* LEFT — input + session feed */}
        <div className="lab-panel lab-panel-left">

          <div className="lab-input-section">
            <div className="lab-panel-title">Text</div>
            <textarea
              className="lab-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type something with Uhmmm..., CAPS words, Soo Soo Beautiful, and questions?"
              spellCheck={false}
            />
            <div className="lab-row">
              <button
                className="lab-btn primary"
                onClick={generate}
                disabled={generating || !text.trim() || !voice}
              >
                {generating ? 'Generating…' : 'Generate'}
              </button>
              <button className="lab-btn" onClick={() => setText('')}>Clear text</button>
            </div>

            {error && <div className="lab-error">{error}</div>}
          </div>

          {/* Session feed */}
          <div className="lab-session-section">
            <div className="lab-session-head">
              <div className="lab-session-title">
                Session
                {labResults.length > 0 && <span className="lab-count">{labResults.length}</span>}
              </div>
              {labResults.length > 0 && (
                <button className="lab-mini-btn" onClick={clearSession}>Clear all</button>
              )}
            </div>

            {labResults.length === 0 ? (
              <div className="lab-session-empty">
                Generated clips will appear here.<br />
                They stay for this session only — not saved to your library.
              </div>
            ) : (
              <div className="lab-session-list">
                {labResults.map((entry, idx) => {
                  const clipNumber = labResults.length - idx;
                  return (
                    <div key={entry.id} className="lab-clip">
                      <div className="lab-clip-head">
                        <div className="lab-clip-index">#{clipNumber}</div>
                        <div className="lab-clip-preview" title={entry.fullText}>
                          {entry.textPreview}{entry.fullText.length > 90 ? '…' : ''}
                        </div>
                      </div>

                      <audio controls src={entry.url} className="lab-clip-audio" />

                      <div className="lab-clip-actions">
                        <button className="lab-mini-btn" onClick={() => downloadClip(entry)}>Download</button>
                        <button className="lab-mini-btn danger" onClick={() => removeResult(entry.id)}>Remove</button>
                      </div>

                      <div className="lab-signal-grid">
                        <div className="lab-signal">
                          <span className="lab-signal-label">Rate</span>
                          <span className="lab-signal-value">{entry.rate}</span>
                        </div>
                        <div className="lab-signal">
                          <span className="lab-signal-label">Pitch</span>
                          <span className="lab-signal-value">{entry.pitch}</span>
                        </div>
                        <div className="lab-signal">
                          <span className="lab-signal-label">Duration</span>
                          <span className="lab-signal-value">{entry.duration ? entry.duration.toFixed(2) + 's' : '—'}</span>
                        </div>
                        <div className="lab-signal">
                          <span className="lab-signal-label">Emotion</span>
                          <span className="lab-signal-value">{entry.emotion}</span>
                        </div>
                        <div className="lab-signal">
                          <span className="lab-signal-label">Question</span>
                          <span className={`lab-signal-value ${entry.questionMark ? 'on' : ''}`}>
                            {entry.questionMark ? 'YES' : 'no'}
                          </span>
                        </div>
                        <div className="lab-signal">
                          <span className="lab-signal-label">Caps</span>
                          <span className={`lab-signal-value ${entry.capsEmphasis ? 'on' : ''}`}>
                            {entry.capsEmphasis ? entry.capsWords.join(', ') : 'no'}
                          </span>
                        </div>
                        <div className="lab-signal">
                          <span className="lab-signal-label">Fillers</span>
                          <span className={`lab-signal-value ${entry.fillerCount > 0 ? 'on' : ''}`}>
                            {entry.fillerCount}
                          </span>
                        </div>
                        <div className="lab-signal">
                          <span className="lab-signal-label">Elong.</span>
                          <span className={`lab-signal-value ${entry.elongationCount > 0 ? 'on' : ''}`}>
                            {entry.elongationCount}
                          </span>
                        </div>
                        <div className="lab-signal">
                          <span className="lab-signal-label">Cache</span>
                          <span className={`lab-signal-value ${entry.cached ? 'hit' : ''}`}>
                            {entry.cached ? 'HIT' : 'MISS'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — controls */}
        <div className="lab-panel lab-panel-right">
          <div className="lab-panel-title">Controls</div>

          <div className="lab-field">
            <label className="lab-label">Voice</label>
            <select className="lab-select" value={voice} onChange={e => setVoice(e.target.value)}>
              {voices.length === 0 && <option value="">No voices</option>}
              {voices.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
            </select>
          </div>

          <div className="lab-field">
            <label className="lab-label">Mode</label>
            <select className="lab-select" value={mode} onChange={e => setMode(e.target.value)}>
              {modes.length === 0 && <option value="conversation">conversation</option>}
              {modes.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div className="lab-field">
            <label className="lab-label">
              Pitch <span className="lab-value">{pitch > 0 ? '+' : ''}{pitch}</span>
            </label>
            <input
              type="range" min="-50" max="50" step="1"
              value={pitch}
              onChange={e => setPitch(parseInt(e.target.value, 10))}
              className="lab-range"
            />
          </div>

          <div className="lab-field">
            <label className="lab-label">
              Speed <span className="lab-value">{speed.toFixed(2)}x</span>
            </label>
            <input
              type="range" min="0.5" max="2.5" step="0.05"
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
              className="lab-range"
            />
          </div>

          <div className="lab-divider" />

          <div className="lab-toggle-row">
            <span className="lab-label">Caps awareness</span>
            <button className={`lab-toggle ${capsAwareness ? 'on' : ''}`} onClick={() => setCapsAwareness(!capsAwareness)}>
              {capsAwareness ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="lab-toggle-row">
            <span className="lab-label">Fillers</span>
            <button className={`lab-toggle ${fillersOn ? 'on' : ''}`} onClick={() => setFillersOn(!fillersOn)}>
              {fillersOn ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="lab-toggle-row">
            <span className="lab-label">Elongation</span>
            <button className={`lab-toggle ${elongationOn ? 'on' : ''}`} onClick={() => setElongationOn(!elongationOn)}>
              {elongationOn ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="lab-divider" />

          <div className="lab-toggle-row">
            <span className="lab-label">V2 engine <span className="lab-tag">beta</span></span>
            <button className={`lab-toggle ${v2Engine ? 'on' : ''}`} onClick={() => setV2Engine(!v2Engine)}>
              {v2Engine ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="lab-hint">
            V2 stubs to V1 for now. Segment splitter + ffmpeg concat coming next.
          </div>
        </div>
      </div>
    </div>
  );
}

function LabStyles() {
  return (
    <style>{`
      .lab-root { flex: 1; overflow: hidden; display: flex; flex-direction: column; background: #0a0a0f; min-height: 0; }

      .lab-topstrip {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 16px; gap: 12px; flex-wrap: wrap;
        background: rgba(17,27,33,0.85);
        border-bottom: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
      }
      .lab-title { font-size: 13px; font-weight: 800; letter-spacing: 0.25em; color: #f9a8d4; }
      .lab-presets { display: flex; gap: 6px; flex-wrap: wrap; }
      .lab-preset-btn {
        padding: 6px 12px; border-radius: 999px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        color: #8696a0; font-size: 10.5px; font-weight: 700;
        letter-spacing: 0.08em; cursor: pointer; transition: all 0.18s;
        text-transform: uppercase;
      }
      .lab-preset-btn:hover { color: #e9edef; border-color: rgba(249,168,212,0.4); }

      .lab-main {
        flex: 1; min-height: 0;
        display: grid; grid-template-columns: minmax(0,1fr) 340px;
        gap: 14px; padding: 14px 16px; overflow: hidden;
      }

      .lab-panel {
        background: rgba(17,27,33,0.7);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 16px; padding: 14px;
        display: flex; flex-direction: column;
        min-height: 0;
      }
      .lab-panel-left {
        overflow: hidden;
      }
      .lab-panel-right {
        overflow-y: auto;
      }

      .lab-input-section { flex-shrink: 0; }

      .lab-panel-title {
        font-size: 10px; letter-spacing: 0.2em; font-weight: 700;
        color: #8696a0; text-transform: uppercase; margin-bottom: 10px; flex-shrink: 0;
      }

      .lab-textarea {
        width: 100%; min-height: 110px;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 12px;
        color: #e9edef; font-size: 14px; line-height: 1.6;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        outline: none; resize: vertical; box-sizing: border-box;
      }
      .lab-textarea:focus { border-color: rgba(249,168,212,0.5); }

      .lab-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
      .lab-btn {
        padding: 10px 16px; border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.04);
        color: #e9edef; font-size: 11.5px; font-weight: 700;
        letter-spacing: 0.08em; cursor: pointer; transition: all 0.18s;
        text-transform: uppercase;
      }
      .lab-btn:hover { background: rgba(255,255,255,0.08); }
      .lab-btn.primary {
        background: rgba(249,168,212,0.15); border-color: #f9a8d4; color: #f9a8d4;
      }
      .lab-btn.primary:hover { background: rgba(249,168,212,0.25); }
      .lab-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .lab-error {
        margin-top: 10px; padding: 10px 12px;
        background: rgba(255,59,48,0.1);
        border: 1px solid rgba(255,59,48,0.3);
        color: #ff6b6b; border-radius: 10px;
        font-size: 12px; letter-spacing: 0.02em;
      }

      /* ─── Session feed ─────────────────────── */
      .lab-session-section {
        flex: 1; min-height: 0;
        display: flex; flex-direction: column;
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .lab-session-head {
        display: flex; justify-content: space-between; align-items: center;
        gap: 10px; flex-shrink: 0; margin-bottom: 10px;
      }
      .lab-session-title {
        font-size: 10px; letter-spacing: 0.2em; font-weight: 700;
        color: #8696a0; text-transform: uppercase;
        display: flex; align-items: center; gap: 8px;
      }
      .lab-count {
        padding: 1px 8px; border-radius: 999px;
        background: rgba(249,168,212,0.15); color: #f9a8d4;
        font-size: 9.5px; font-weight: 700; letter-spacing: 0;
      }
      .lab-session-empty {
        flex: 1; display: flex; align-items: center; justify-content: center;
        font-size: 12px; color: #4b5563;
        line-height: 1.6; text-align: center;
        padding: 20px 10px;
      }
      .lab-session-list {
        flex: 1; min-height: 0;
        overflow-y: auto;
        display: flex; flex-direction: column; gap: 10px;
        padding-right: 4px;
      }
      .lab-session-list::-webkit-scrollbar { width: 6px; }
      .lab-session-list::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.08); border-radius: 3px;
      }

      .lab-clip {
        background: rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 10px;
        display: flex; flex-direction: column; gap: 8px;
        flex-shrink: 0;
      }
      .lab-clip-head {
        display: flex; gap: 8px; align-items: flex-start;
      }
      .lab-clip-index {
        font-size: 10px; font-weight: 700; color: #f9a8d4;
        letter-spacing: 0.08em; padding-top: 1px; flex-shrink: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .lab-clip-preview {
        font-size: 11.5px; color: #8696a0;
        line-height: 1.4; word-break: break-word; flex: 1;
      }
      .lab-clip-audio {
        width: 100%; border-radius: 10px;
      }
      .lab-clip-actions {
        display: flex; gap: 6px;
      }

      .lab-mini-btn {
        padding: 5px 10px; border-radius: 8px;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.08);
        color: #8696a0; font-size: 10.5px; font-weight: 700;
        letter-spacing: 0.06em; cursor: pointer; transition: all 0.18s;
        text-transform: uppercase;
      }
      .lab-mini-btn:hover { color: #e9edef; border-color: rgba(249,168,212,0.4); }
      .lab-mini-btn.danger:hover { color: #ff6b6b; border-color: rgba(255,59,48,0.4); }

      /* ─── Signal grid inside clip ─────────── */
      .lab-signal-grid {
        display: grid; grid-template-columns: repeat(3, minmax(0,1fr));
        gap: 6px;
        padding-top: 6px;
        border-top: 1px solid rgba(255,255,255,0.04);
      }
      .lab-signal {
        display: flex; flex-direction: column; gap: 2px;
        padding: 5px 7px;
        background: rgba(255,255,255,0.02);
        border-radius: 6px;
        min-width: 0;
      }
      .lab-signal-label {
        font-size: 8.5px; letter-spacing: 0.12em; color: #8696a0;
        text-transform: uppercase; font-weight: 700;
      }
      .lab-signal-value {
        font-size: 11px; color: #e9edef; font-weight: 600;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        word-break: break-word;
      }
      .lab-signal-value.on { color: #00e6a8; }
      .lab-signal-value.hit { color: #f9a8d4; }

      /* ─── Controls ───────────────────────── */
      .lab-field { margin-bottom: 14px; }
      .lab-label {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 10px; letter-spacing: 0.15em; color: #8696a0;
        text-transform: uppercase; font-weight: 700;
        margin-bottom: 6px;
      }
      .lab-value {
        font-size: 12px; color: #e9edef; font-weight: 700;
        text-transform: none; letter-spacing: 0;
      }
      .lab-select {
        width: 100%; padding: 8px 10px;
        background: rgba(0,0,0,0.3); color: #e9edef;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px; font-size: 12.5px;
        outline: none; box-sizing: border-box;
      }
      .lab-select:focus { border-color: rgba(249,168,212,0.5); }

      .lab-range { width: 100%; accent-color: #f9a8d4; }

      .lab-divider {
        height: 1px; background: rgba(255,255,255,0.06);
        margin: 14px 0;
      }

      .lab-toggle-row {
        display: flex; justify-content: space-between; align-items: center;
        gap: 12px; margin-bottom: 12px;
      }
      .lab-toggle {
        padding: 5px 12px; border-radius: 999px;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.1);
        color: #8696a0; font-size: 10.5px; font-weight: 700;
        letter-spacing: 0.08em; cursor: pointer; transition: all 0.18s;
        min-width: 56px;
      }
      .lab-toggle.on {
        border-color: #f9a8d4; color: #f9a8d4;
        background: rgba(249,168,212,0.1);
      }
      .lab-tag {
        display: inline-block; margin-left: 6px;
        padding: 1px 6px; border-radius: 999px;
        background: rgba(168,85,247,0.15);
        color: #a855f7; font-size: 8.5px;
        letter-spacing: 0.1em;
      }
      .lab-hint {
        font-size: 10.5px; color: #4b5563;
        line-height: 1.5; letter-spacing: 0.02em;
      }

      /* ─── Mobile ─────────────────────────── */
      @media (max-width: 800px) {
        .lab-main {
          grid-template-columns: 1fr;
          grid-template-rows: auto auto;
          padding: 10px 12px; gap: 10px;
          overflow-y: auto;
        }
        .lab-panel { overflow: visible; min-height: auto; }
        .lab-panel-left { overflow: visible; }
        .lab-session-section { margin-top: 12px; }
        .lab-session-list { max-height: 400px; }
        .lab-textarea { min-height: 100px; font-size: 13px; }
        .lab-signal-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
      }
    `}</style>
  );
}
