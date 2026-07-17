import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://hyezen.onrender.com';

export default function App() {
  const [backendReady, setBackendReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Starting HYEZEN...');

  const [activeTab, setActiveTab] = useState('realistic');
  const [text, setText] = useState('');
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState('');
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [voiceId, setVoiceId] = useState('');
  const [recording, setRecording] = useState(false);
  const [synthVoices, setSynthVoices] = useState([]);

  // --- New states for v10 features ---
  const [modes, setModes] = useState([]);
  const [selectedMode, setSelectedMode] = useState('story');
  const [characters, setCharacters] = useState('{}'); // JSON string for character mapping

  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const chatEndRef = useRef(null);

  const themes = {
    elevenlabs: {bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', name: 'ULTRA VOICE CLONE', sub: 'Clone your voice with AI'},
    xtts: {bg: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', name: 'BEST-XTTS', sub: 'Male & Female voices'},
    realistic: {bg: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', name: 'GOOD-REALISTIC TTS', sub: '150+ Premium voices'},
    fair: {bg: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', name: 'FAIR-FULL TTS', sub: '78 Global voices'},
    robotic: {bg: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)', name: 'BASIC-ROBOTIC', sub: 'Male & Female robotic'}
  };

  const tabs = [
    {id: 'elevenlabs', name: 'Ultra Voice Clone'},
    {id: 'xtts', name: 'Best-XTTS'},
    {id: 'realistic', name: 'Good-Realistic TTS'},
    {id: 'fair', name: 'Fair-Full TTS'},
    {id: 'robotic', name: 'Basic-Robotic'}
  ];

  useEffect(() => {
    wakeBackend();
  }, []);

  async function wakeBackend() {
    setLoadingStatus('Waking up servers...');
    const maxRetries = 20;
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        const res = await fetch(`${API_URL}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          setLoadingStatus('Servers ready!');
          setTimeout(() => setBackendReady(true), 500);
          return;
        }
      } catch (err) {
        console.log('Backend sleeping, attempt:', attempts + 1);
      }
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
    setChat([{type: 'bot', text: `Welcome to ${themes[activeTab].name} 👋 Tap a voice card below to preview`}]);
    setVoiceId('');
  }, [activeTab, backendReady]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [chat]);

  useEffect(() => {
    const loadVoices = () => setSynthVoices(speechSynthesis.getVoices());
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  async function fetchVoices(type) {
    try {
      const res = await fetch(`${API_URL}/api/voices/${type}`);
      const data = await res.json();
      setVoices(data);
      if (data.length > 0) setVoice(data[0].name);
    } catch (err) {
      console.error('Fetch voices error:', err);
    }
  }

  async function fetchModes() {
    try {
      const res = await fetch(`${API_URL}/api/modes`);
      const data = await res.json();
      setModes(data);
      if (data.length > 0) setSelectedMode(data[0]);
    } catch (err) {
      console.error('Fetch modes error:', err);
    }
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
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            text: 'Voice preview',
            voice: v,
            type: activeTab,
            speed: 1.0,
            mode: selectedMode
          })
        });
        const data = await res.json();
        if(data.url) {
          const audio = new Audio(`${API_URL}${data.url}`);
          audio.play().catch(e => console.log('Audio play failed:', e));
        }
      } catch (err) {
        console.error('Preview error:', err);
      }
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
    if(!text.trim()) return;
    setChat(prev => [...prev, {type: 'user', text}]);
    setLoading(true);
    const currentText = text;
    setText('');

    // Parse characters JSON if valid, else use empty object
    let charMap = {};
    try {
      charMap = JSON.parse(characters);
    } catch (e) {
      // invalid JSON, ignore
    }

    try {
      if (activeTab === 'elevenlabs') {
        if(!voiceId) {
          setChat(prev => [...prev, {type: 'bot', text: 'Please record your voice first!'}]);
          setLoading(false);
          return;
        }
        const res = await fetch(`${API_URL}/api/elevenlabs/tts`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({text: currentText, voice_id: voiceId})
        });
        const data = await res.json();
        if(data.success) {
          setChat(prev => [...prev, {type: 'bot', audio: `${API_URL}${data.url}`, tier: 'elevenlabs', filename: `elevenlabs_${Date.now()}.mp3`}]);
        } else {
          setChat(prev => [...prev, {type: 'bot', text: 'Error: ' + data.error}]);
        }
      } else {
        const payload = {
          text: currentText,
          voice,
          type: activeTab,
          speed: 1.0,
          mode: selectedMode,
          characters: charMap
        };
        const res = await fetch(`${API_URL}/api/tts`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.robotic) {
          speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(currentText);
          const selectedVoice = getRoboticVoice(voice);
          if (selectedVoice) utterance.voice = selectedVoice;
          utterance.rate = 1.1;
          utterance.pitch = voice === 'female' ? 1.3 : 0.8;
          speechSynthesis.speak(utterance);
          setChat(prev => [...prev, {type: 'bot', text: `🔊 ${voice === 'female'? 'Female' : 'Male'} robotic voice played`}]);
        } else if(data.url) {
          setChat(prev => [...prev, {type: 'bot', audio: `${API_URL}${data.url}`, tier: activeTab, filename: `${activeTab}_${Date.now()}.mp3`}]);
        } else {
          setChat(prev => [...prev, {type: 'bot', text: 'Error: ' + data.error}]);
        }
      }
    } catch (err) {
      setChat(prev => [...prev, {type: 'bot', text: 'Error: ' + err.message}]);
    }
    setLoading(false);
  }

  async function startRecording(e) {
    e.preventDefault();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      mediaRecorder.current = new MediaRecorder(stream);
      chunks.current = [];
      mediaRecorder.current.ondataavailable = e => {
        if(e.data.size > 0) chunks.current.push(e.data);
      };
      mediaRecorder.current.onstop = async () => {
        setRecording(false);
        const blob = new Blob(chunks.current, {type: 'audio/webm'});
        const base64 = await blobToBase64(blob);
        setChat(prev => [...prev, {type: 'user', text: '🎤 Voice sample recorded'}]);
        setLoading(true);

        try {
          const res = await fetch(`${API_URL}/api/elevenlabs/clone`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({audioBase64: base64.split(',')[1], name: 'MyVoice'})
          });
          const data = await res.json();
          setLoading(false);
          if(data.success) {
            setVoiceId(data.voice_id);
            setChat(prev => [...prev, {type: 'bot', text: '✓ Voice cloned! Now type text below to speak in your voice'}]);
          } else {
            setChat(prev => [...prev, {type: 'bot', text: 'Clone failed: ' + data.error}]);
          }
        } catch (err) {
          setLoading(false);
          setChat(prev => [...prev, {type: 'bot', text: 'Clone error: ' + err.message}]);
        }
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.current.start();
      setRecording(true);

      setTimeout(() => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          stopRecording();
        }
      }, 10000);

    } catch (err) {
      alert('Mic permission denied! Click lock icon in address bar → Site settings → Microphone → Allow → Refresh');
      setRecording(false);
    }
  }

  function stopRecording(e) {
    if (e) e.preventDefault();
    if (mediaRecorder.current && mediaRecorder.current.state!== 'inactive') {
      mediaRecorder.current.stop();
    }
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

  // --- Loading screen (unchanged but fullscreen) ---
  if (!backendReady) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto',
        color: '#fff'
      }}>
        {/* ... same as before ... */}
        <div style={{
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '48px',
          fontWeight: '800',
          letterSpacing: '6px',
          marginBottom: '24px'
        }}>
          HYEZEN
        </div>
        <div style={{
          width: '60px',
          height: '60px',
          border: '4px solid rgba(255,255,255,0.1)',
          borderTop: '4px solid #667eea',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }}></div>
        <div style={{fontSize: '14px', opacity: 0.7, textAlign: 'center'}}>
          {loadingStatus}
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // --- Main app (full screen) ---
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#0a0a0f',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto',
      overflow: 'hidden'
    }}>
      {/* Header (same but full width) */}
      <div style={{
        background: themes[activeTab].bg,
        padding: '24px 20px 20px',
        backdropFilter: 'blur(20px)',
        borderBottomLeftRadius: '0',
        borderBottomRightRadius: '0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
          <div style={{fontSize: '22px', fontWeight: '800', letterSpacing: '3px'}}>H Y E Z E N</div>
          <div style={{position: 'relative'}}>
            <button onClick={() => setShowMenu(!showMenu)} style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '12px',
              width: '44px',
              height: '44px',
              color: '#fff',
              fontSize: '20px',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)'
            }}>⋯</button>
            {showMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '52px',
                background: 'rgba(20,20,30,0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '16px',
                padding: '8px',
                zIndex: 20,
                minWidth: '220px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                {tabs.map(t => (
                  <div key={t.id} onClick={() => {setActiveTab(t.id); setShowMenu(false)}}
                    style={{
                      padding: '14px 18px',
                      cursor: 'pointer',
                      fontSize: '15px',
                      borderRadius: '10px',
                      background: activeTab===t.id? 'rgba(255,255,255,0.15)' : 'transparent',
                      transition: '0.2s',
                      fontWeight: activeTab===t.id? '600' : '400'
                    }}>
                    {t.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{fontSize: '28px', fontWeight: '800', marginBottom: '4px', letterSpacing: '-1px'}}>{themes[activeTab].name}</div>
        <div style={{fontSize: '14px', opacity: 0.85, marginBottom: '12px'}}>{themes[activeTab].sub}</div>

        {/* --- MODE SELECTION (chips) --- */}
        {modes.length > 0 && (
          <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px'}}>
            {modes.map(m => (
              <button
                key={m}
                onClick={() => setSelectedMode(m)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: 'none',
                  background: selectedMode === m ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: selectedMode === m ? '700' : '400',
                  cursor: 'pointer',
                  backdropFilter: 'blur(10px)',
                  transition: '0.2s'
                }}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --- Chat area (flex:1) --- */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 20px',
        background: '#0a0a0f'
      }}>
        {chat.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.type==='user' ? 'flex-end' : 'flex-start',
            marginBottom: '12px'
          }}>
            <div style={{
              maxWidth: '75%',
              padding: msg.audio ? '8px' : '12px 16px',
              borderRadius: '18px',
              background: msg.type==='user' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
              fontSize: '15px',
              lineHeight: '20px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              border: msg.type==='bot' ? '1px solid rgba(255,255,255,0.05)' : 'none'
            }}>
              {msg.audio ? (
                <div>
                  <audio controls src={msg.audio} style={{width: '220px', borderRadius: '12px', marginBottom: '8px'}}></audio>
                  <div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
                    <button onClick={() => downloadAudio(msg.audio, msg.filename)} style={{
                      padding: '6px 12px',
                      background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}>
                      Download
                    </button>
                  </div>
                </div>
              ) : msg.text}
            </div>
          </div>
        ))}
        {loading && <div style={{textAlign: 'center', color: '#888', fontSize: '13px', marginTop: '10px'}}>Generating neural voice...</div>}
        <div ref={chatEndRef} />
      </div>

      {/* --- Voice cards (if not ElevenLabs) --- */}
      {activeTab !== 'elevenlabs' && voices.length > 0 && (
        <div style={{
          padding: '0 20px 8px',
          display: 'flex',
          gap: '10px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}>
          {voices.map(v => (
            <div key={v.name} onClick={() => previewVoice(v.name)}
              style={{
                minWidth: '120px',
                padding: '10px 12px',
                background: voice===v.name ? 'rgba(102,126,234,0.3)' : 'rgba(255,255,255,0.05)',
                borderRadius: '14px',
                cursor: 'pointer',
                border: voice===v.name ? '2px solid #667eea' : '2px solid transparent',
                transition: '0.2s',
                backdropFilter: 'blur(10px)'
              }}>
              <div style={{fontSize: '13px', fontWeight: '600'}}>{v.label}</div>
              <div style={{fontSize: '11px', opacity: 0.6, marginTop: '4px'}}>Tap to preview</div>
            </div>
          ))}
        </div>
      )}

      {/* --- Input area --- */}
      <div style={{
        background: 'rgba(20,20,30,0.8)',
        backdropFilter: 'blur(20px)',
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }}>
        {activeTab === 'elevenlabs' && !voiceId ? (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            onTouchCancel={stopRecording}
            style={{
              width: '100%',
              padding: '18px',
              background: recording ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '16px',
              color: '#fff',
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: recording ? '0 0 40px rgba(245,87,108,0.8), inset 0 0 20px rgba(0,0,0,0.3)' : '0 6px 20px rgba(102,126,234,0.5)',
              transition: 'all 0.15s',
              transform: recording ? 'scale(0.95)' : 'scale(1)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none'
            }}>
            {recording ? '🔴 Recording... Release to stop' : '🎤 Hold to Record 10s'}
          </button>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
            {activeTab === 'elevenlabs' && voiceId && (
              <div style={{fontSize: '12px', color: '#0f0', paddingLeft: '4px'}}>✓ Voice Ready – Type below to speak</div>
            )}

            {/* --- Character voices input (optional) --- */}
            {activeTab !== 'elevenlabs' && activeTab !== 'robotic' && (
              <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                <span style={{fontSize: '12px', opacity: 0.7, whiteSpace: 'nowrap'}}>Characters:</span>
                <input
                  value={characters}
                  onChange={e => setCharacters(e.target.value)}
                  placeholder='{"hero":"Jenny", "villain":"Guy"}'
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: '#ccc',
                    fontSize: '13px',
                    outline: 'none',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
            )}

            <div style={{display: 'flex', gap: '10px'}}>
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendText()}
                placeholder={activeTab === 'elevenlabs' && voiceId ? "Type text to speak in YOUR voice..." : "Type text to generate voice..."}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '14px',
                  color: '#fff',
                  fontSize: '15px',
                  outline: 'none',
                  backdropFilter: 'blur(10px)'
                }}
              />
              <button onClick={sendText}
                style={{
                  padding: '14px 18px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: '14px',
                  color: '#fff',
                  fontSize: '18px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(102,126,234,0.4)',
                  fontWeight: '700'
                }}>➤</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
