import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/audio', express.static(path.join(__dirname, 'audio')));

if (!fs.existsSync('./audio')) fs.mkdirSync('./audio');

// === VOICES ===

// Realistic: 8 premium voices
const REALISTIC_VOICES = [
  {name: 'en-US-JennyNeural', label: 'Jenny US'},
  {name: 'en-US-AriaNeural', label: 'Aria US'},
  {name: 'en-US-MichelleNeural', label: 'Michelle US'},
  {name: 'en-US-SaraNeural', label: 'Sara US'},
  {name: 'en-US-AshleyNeural', label: 'Ashley US'},
  {name: 'en-US-GuyNeural', label: 'Guy US'},
  {name: 'en-US-BrandonNeural', label: 'Brandon US'},
  {name: 'en-US-ChristopherNeural', label: 'Christopher US'}
];

// FAIR: 70 GLOBAL ACCENTS - ALL CONTINENTS
const FAIR_VOICES = [
  // === NORTH AMERICA - 16 voices ===
  {name: 'en-US-JennyNeural', label: 'Jenny US'},
  {name: 'en-US-AriaNeural', label: 'Aria US'},
  {name: 'en-US-MichelleNeural', label: 'Michelle US'},
  {name: 'en-US-SaraNeural', label: 'Sara US'},
  {name: 'en-US-AshleyNeural', label: 'Ashley US'},
  {name: 'en-US-AnaNeural', label: 'Ana US'},
  {name: 'en-US-GuyNeural', label: 'Guy US'},
  {name: 'en-US-BrandonNeural', label: 'Brandon US'},
  {name: 'en-US-ChristopherNeural', label: 'Christopher US'},
  {name: 'en-US-EricNeural', label: 'Eric US'},
  {name: 'en-US-SteffanNeural', label: 'Steffan US'},
  {name: 'en-US-RogerNeural', label: 'Roger US'},
  {name: 'en-CA-ClaraNeural', label: 'Clara CA'},
  {name: 'en-CA-LiamNeural', label: 'Liam CA'},
  {name: 'en-CA-EmmaNeural', label: 'Emma CA'},
  {name: 'en-CA-BrentNeural', label: 'Brent CA'},

  // === EUROPE - 20 voices ===
  {name: 'en-GB-SoniaNeural', label: 'Sonia UK'},
  {name: 'en-GB-RyanNeural', label: 'Ryan UK'},
  {name: 'en-GB-LibbyNeural', label: 'Libby UK'},
  {name: 'en-GB-MaisieNeural', label: 'Maisie UK'},
  {name: 'en-GB-AbbiNeural', label: 'Abbi UK'},
  {name: 'en-GB-AlfieNeural', label: 'Alfie UK'},
  {name: 'en-GB-ElliotNeural', label: 'Elliot UK'},
  {name: 'en-GB-EthanNeural', label: 'Ethan UK'},
  {name: 'en-IE-EmilyNeural', label: 'Emily IE'},
  {name: 'en-IE-ConorNeural', label: 'Conor IE'},
  {name: 'fr-FR-DeniseNeural', label: 'Denise FR'},
  {name: 'fr-FR-HenriNeural', label: 'Henri FR'},
  {name: 'de-DE-KatjaNeural', label: 'Katja DE'},
  {name: 'de-DE-ConradNeural', label: 'Conrad DE'},
  {name: 'es-ES-ElviraNeural', label: 'Elvira ES'},
  {name: 'es-ES-AlvaroNeural', label: 'Alvaro ES'},
  {name: 'it-IT-ElsaNeural', label: 'Elsa IT'},
  {name: 'it-IT-DiegoNeural', label: 'Diego IT'},
  {name: 'pt-PT-RaquelNeural', label: 'Raquel PT'},
  {name: 'ru-RU-SvetlanaNeural', label: 'Svetlana RU'},

  // === ASIA - 16 voices ===
  {name: 'en-IN-NeerjaNeural', label: 'Neerja IN'},
  {name: 'en-IN-PrabhatNeural', label: 'Prabhat IN'},
  {name: 'en-IN-AnanyaNeural', label: 'Ananya IN'},
  {name: 'en-IN-ManishNeural', label: 'Manish IN'},
  {name: 'en-SG-LunaNeural', label: 'Luna SG'},
  {name: 'en-SG-WayneNeural', label: 'Wayne SG'},
  {name: 'en-PH-RosaNeural', label: 'Rosa PH'},
  {name: 'en-PH-JamesNeural', label: 'James PH'},
  {name: 'en-HK-SamNeural', label: 'Sam HK'},
  {name: 'en-HK-YanNeural', label: 'Yan HK'},
  {name: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao CN'},
  {name: 'zh-CN-YunxiNeural', label: 'Yunxi CN'},
  {name: 'ja-JP-NanamiNeural', label: 'Nanami JP'},
  {name: 'ja-JP-KeitaNeural', label: 'Keita JP'},
  {name: 'ko-KR-SunHiNeural', label: 'SunHi KR'},
  {name: 'ar-SA-ZariyahNeural', label: 'Zariyah SA'},

  // === AFRICA - 8 voices ===
  {name: 'en-NG-AbeoNeural', label: 'Abeo NG'},
  {name: 'en-NG-EzinneNeural', label: 'Ezinne NG'},
  {name: 'en-KE-AsiliaNeural', label: 'Asilia KE'},
  {name: 'en-KE-ChilembaNeural', label: 'Chilemba KE'},
  {name: 'en-ZA-LeahNeural', label: 'Leah ZA'},
  {name: 'en-ZA-LukeNeural', label: 'Luke ZA'},
  {name: 'en-TZ-ElimuNeural', label: 'Elimu TZ'},
  {name: 'ar-EG-ShakirNeural', label: 'Shakir EG'},

  // === OCEANIA - 6 voices ===
  {name: 'en-AU-NatashaNeural', label: 'Natasha AU'},
  {name: 'en-AU-WilliamNeural', label: 'William AU'},
  {name: 'en-AU-AnnetteNeural', label: 'Annette AU'},
  {name: 'en-AU-KenNeural', label: 'Ken AU'},
  {name: 'en-NZ-MitchellNeural', label: 'Mitchell NZ'},
  {name: 'en-NZ-MollyNeural', label: 'Molly NZ'},

  // === SOUTH AMERICA - 4 voices ===
  {name: 'pt-BR-FranciscaNeural', label: 'Francisca BR'},
  {name: 'pt-BR-AntonioNeural', label: 'Antonio BR'},
  {name: 'es-MX-DaliaNeural', label: 'Dalia MX'},
  {name: 'es-AR-ElenaNeural', label: 'Elena AR'}
];

// XTTS: Male + Female different voices
const XTTS_VOICES = [
  {name: 'en-US-AriaNeural', label: 'XTTS Female'},
  {name: 'en-US-GuyNeural', label: 'XTTS Male'}
];

// Robotic browser voices
const ROBOTIC_VOICES = [
  {name: 'male', label: 'Male Robotic'},
  {name: 'female', label: 'Female Robotic'}
];

app.get('/api/voices/:type', (req, res) => {
  const type = req.params.type;
  if (type === 'realistic') return res.json(REALISTIC_VOICES);
  if (type === 'fair') return res.json(FAIR_VOICES); // Now 70 voices
  if (type === 'xtts') return res.json(XTTS_VOICES);
  if (type === 'robotic') return res.json(ROBOTIC_VOICES);
  res.json([]);
});

app.post('/api/elevenlabs/clone', async (req, res) => {
  try {
    const { audioBase64, name } = req.body;
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('name', name || `Voice_${Date.now()}`);
    form.append('files', audioBuffer, {filename: 'sample.mp3'});

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {'xi-api-key': process.env.ELEVENLABS_API_KEY,...form.getHeaders()},
      body: form
    });

    const data = await response.json();
    res.json({success: true, voice_id: data.voice_id});
  } catch (e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/elevenlabs/tts', async (req, res) => {
  try {
    const { text, voice_id } = req.body;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({text, model_id: 'eleven_multilingual_v2'})
    });

    const buffer = await response.buffer();
    const filename = `eleven_${uuidv4()}.mp3`;
    fs.writeFileSync(path.join(__dirname, 'audio', filename), buffer);
    res.json({success: true, url: `/audio/${filename}`});
  } catch (e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = 'en-US-JennyNeural', type = 'realistic' } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });

    const filename = `${type}_${uuidv4()}.mp3`;
    const filepath = path.join(__dirname, 'audio', filename);

    if (type === 'robotic') {
      return res.json({success: true, robotic: true, text, voice});
    }

    const cmd = `edge-tts --voice "${voice}" --text "${text}" --write-media "${filepath}"`;
    exec(cmd, (error) => {
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true, url: `/audio/${filename}` });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 HYEZEN TTS v6 running on port ${PORT}`);
  console.log(`✅ Fair Voices: ${FAIR_VOICES.length} loaded - 6 Continents Covered`);
  console.log('✅ XTTS Male/Female Fixed');
});
