import { useState, useEffect } from 'react';

export default function Lab({
  API_URL,
  voices,
  modes,
  triggerDownload,
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
  const [result, setResult] = useState(null);
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
    setResult(null);
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
      setResult({
        url: `${API_URL}${data.url}`,
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
      });
    } catch (e) {
      setError(e.message || 'Network error.');
    } finally {
      setGenerating(false);
    }
  }

  function download() {
    if (!result) return;
    triggerDownload(result.url, `hyezen_lab_${Date.now()}.mp3`);
  }

  function clear() {
    setText('');
    setResult(null);
    setError(null);
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
        {/* LEFT — input + output */}
        <div className="lab-panel lab-panel-left">
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
            <button className="lab-btn" onClick={clear}>Clear</button>
            {result && (
              <button className="lab-btn" onClick={download}>Download</button>
            )}
          </div>

          {error && (
            <div className="lab-error">{error}</div>
          )}

          {result && (
            <div className="lab-output">
              <div className="lab-panel-title" style={{ marginTop: 18 }}>Output</div>
              <audio controls src={result.url} className="lab-audio" />

              <div className="lab-signals">
                <div className="lab-signals-title">Signal readout</div>
                <div className="lab-signal-grid">
                  <div className="lab-signal">
                    <span className="lab-signal-label">Rate</span>
                    <span className="lab-signal-value">{result.rate}</span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Pitch</span>
                    <span className="lab-signal-value">{result.pitch}</span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Duration</span>
                    <span className="lab-signal-value">{result.duration ? result.duration.toFixed(2) + 's' : '—'}</span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Emotion</span>
                    <span className="lab-signal-value">{result.emotion}</span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Language</span>
                    <span className="lab-signal-value">{result.language}</span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Cache</span>
                    <span className={`lab-signal-value ${result.cached ? 'hit' : ''}`}>
                      {result.cached ? 'HIT' : 'MISS'}
                    </span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Question</span>
                    <span className={`lab-signal-value ${result.questionMark ? 'on' : ''}`}>
                      {result.questionMark ? 'YES' : 'no'}
                    </span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Caps emphasis</span>
                    <span className={`lab-signal-value ${result.capsEmphasis ? 'on' : ''}`}>
                      {result.capsEmphasis ? `YES (${result.capsWords.join(', ')})` : 'no'}
                    </span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Fillers</span>
                    <span className={`lab-signal-value ${result.fillerCount > 0 ? 'on' : ''}`}>
                      {result.fillerCount}
                    </span>
                  </div>
                  <div className="lab-signal">
                    <span className="lab-signal-label">Elongations</span>
                    <span className={`lab-signal-value ${result.elongationCount > 0 ? 'on' : ''}`}>
                      {result.elongationCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
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
            <button
              className={`lab-toggle ${capsAwareness ? 'on' : ''}`}
              onClick={() => setCapsAwareness(!capsAwareness)}
            >{capsAwareness ? 'ON' : 'OFF'}</button>
          </div>

          <div className="lab-toggle-row">
            <span className="lab-label">Fillers</span>
            <button
              className={`lab-toggle ${fillersOn ? 'on' : ''}`}
              onClick={() => setFillersOn(!fillersOn)}
            >{fillersOn ? 'ON' : 'OFF'}</button>
          </div>

          <div className="lab-toggle-row">
            <span className="lab-label">Elongation</span>
            <button
              className={`lab-toggle ${elongationOn ? 'on' : ''}`}
              onClick={() => setElongationOn(!elongationOn)}
            >{elongationOn ? 'ON' : 'OFF'}</button>
          </div>

          <div className="lab-divider" />

          <div className="lab-toggle-row">
            <span className="lab-label">V2 engine <span className="lab-tag">experimental</span></span>
            <button
              className={`lab-toggle ${v2Engine ? 'on' : ''}`}
              onClick={() => setV2Engine(!v2Engine)}
            >{v2Engine ? 'ON' : 'OFF'}</button>
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
        min-height: 0; overflow-y: auto;
      }
      .lab-panel-title {
        font-size: 10px; letter-spacing: 0.2em; font-weight: 700;
        color: #8696a0; text-transform: uppercase; margin-bottom: 10px; flex-shrink: 0;
      }

      .lab-textarea {
        width: 100%; min-height: 140px;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 12px;
        color: #e9edef; font-size: 14px; line-height: 1.6;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        outline: none; resize: vertical; box-sizing: border-box;
      }
      .lab-textarea:focus { border-color: rgba(249,168,212,0.5); }

      .lab-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
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
        margin-top: 12px; padding: 10px 12px;
        background: rgba(255,59,48,0.1);
        border: 1px solid rgba(255,59,48,0.3);
        color: #ff6b6b; border-radius: 10px;
        font-size: 12px; letter-spacing: 0.02em;
      }

      .lab-output { margin-top: 8px; }
      .lab-audio { width: 100%; margin-bottom: 12px; border-radius: 10px; }

      .lab-signals {
        background: rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 12px;
      }
      .lab-signals-title {
        font-size: 10px; letter-spacing: 0.2em; font-weight: 700;
        color: #f9a8d4; text-transform: uppercase; margin-bottom: 10px;
      }
      .lab-signal-grid {
        display: grid; grid-template-columns: repeat(2, minmax(0,1fr));
        gap: 8px;
      }
      .lab-signal {
        display: flex; flex-direction: column; gap: 3px;
        padding: 6px 8px;
        background: rgba(255,255,255,0.02);
        border-radius: 8px;
      }
      .lab-signal-label {
        font-size: 9px; letter-spacing: 0.15em; color: #8696a0;
        text-transform: uppercase; font-weight: 700;
      }
      .lab-signal-value {
        font-size: 12px; color: #e9edef; font-weight: 600;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        word-break: break-word;
      }
      .lab-signal-value.on { color: #00e6a8; }
      .lab-signal-value.hit { color: #f9a8d4; }

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

      .lab-range {
        width: 100%; accent-color: #f9a8d4;
      }

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

      @media (max-width: 800px) {
        .lab-main {
          grid-template-columns: 1fr;
          grid-template-rows: auto auto;
          padding: 10px 12px; gap: 10px;
          overflow-y: auto;
        }
        .lab-panel { overflow: visible; }
        .lab-textarea { min-height: 120px; font-size: 13px; }
        .lab-signal-grid { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
