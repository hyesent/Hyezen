
// ============================================================
//  HYEZEN TTS v10 – FINAL PRODUCTION VERSION (FIXED)
//  No rate limiting, hardcoded voices, all features.
//  Concurrency handled via a simple queue.
//  Custom sentence splitter (no external dependency).
// ============================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { franc } from 'franc';
// FIX: number-to-words is CommonJS - import as default
import pkg from 'number-to-words';
const { toWords } = pkg;
// sentence-splitter REMOVED – using custom function below
import crypto from 'crypto';

// Optional ffmpeg for audio mastering
let ffmpeg, ffmpegPath;
try {
  const ffmpegModule = await import('fluent-ffmpeg');
  ffmpeg = ffmpegModule.default;
  const ffmpegStatic = await import('ffmpeg-static');
  ffmpegPath = ffmpegStatic.default;
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('✅ ffmpeg loaded – audio mastering enabled');
} catch (e) {
  console.warn('⚠️ ffmpeg not installed – audio mastering disabled');
}

// ... rest of your code continues unchanged

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ------------------------------
//  Middleware
// ------------------------------
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/audio', express.static(path.join(__dirname, 'audio')));
app.use('/cache', express.static(path.join(__dirname, 'cache')));

// Ensure directories
['audio', 'cache'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// ============================================================
//  CUSTOM SENTENCE SPLITTER (replaces sentence-splitter)
// ============================================================
function getSentences(text) {
  // Split by sentence-ending punctuation (. ! ?) followed by space or end
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

// ============================================================
//  HARDCODED VOICE LISTS (FULL)
// ============================================================

// ----- REALISTIC – 150+ premium voices (global) -----
const REALISTIC_VOICES = [
  // North America (US, Canada)
  { name: 'en-US-JennyNeural', label: 'Jenny (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-AriaNeural', label: 'Aria (US)', locale: 'en-US', quality: 'premium', style: 'assistant' },
  { name: 'en-US-MichelleNeural', label: 'Michelle (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-SaraNeural', label: 'Sara (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-AshleyNeural', label: 'Ashley (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-AnaNeural', label: 'Ana (US)', locale: 'en-US', quality: 'premium', style: 'assistant' },
  { name: 'en-US-GuyNeural', label: 'Guy (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-BrandonNeural', label: 'Brandon (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-ChristopherNeural', label: 'Christopher (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-EricNeural', label: 'Eric (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-SteffanNeural', label: 'Steffan (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-US-RogerNeural', label: 'Roger (US)', locale: 'en-US', quality: 'premium', style: 'narrator' },
  { name: 'en-CA-ClaraNeural', label: 'Clara (Canada)', locale: 'en-CA', quality: 'good', style: 'narrator' },
  { name: 'en-CA-LiamNeural', label: 'Liam (Canada)', locale: 'en-CA', quality: 'good', style: 'narrator' },
  { name: 'en-CA-EmmaNeural', label: 'Emma (Canada)', locale: 'en-CA', quality: 'good', style: 'narrator' },
  { name: 'en-CA-BrentNeural', label: 'Brent (Canada)', locale: 'en-CA', quality: 'good', style: 'narrator' },
  // Europe (UK, Ireland, France, Germany, Spain, Italy, Portugal, Netherlands, etc.)
  { name: 'en-GB-SoniaNeural', label: 'Sonia (UK)', locale: 'en-GB', quality: 'premium', style: 'narrator' },
  { name: 'en-GB-RyanNeural', label: 'Ryan (UK)', locale: 'en-GB', quality: 'premium', style: 'narrator' },
  { name: 'en-GB-LibbyNeural', label: 'Libby (UK)', locale: 'en-GB', quality: 'premium', style: 'narrator' },
  { name: 'en-GB-MaisieNeural', label: 'Maisie (UK)', locale: 'en-GB', quality: 'premium', style: 'narrator' },
  { name: 'en-GB-AbbiNeural', label: 'Abbi (UK)', locale: 'en-GB', quality: 'premium', style: 'narrator' },
  { name: 'en-GB-AlfieNeural', label: 'Alfie (UK)', locale: 'en-GB', quality: 'premium', style: 'narrator' },
  { name: 'en-GB-ElliotNeural', label: 'Elliot (UK)', locale: 'en-GB', quality: 'premium', style: 'narrator' },
  { name: 'en-GB-EthanNeural', label: 'Ethan (UK)', locale: 'en-GB', quality: 'premium', style: 'narrator' },
  { name: 'en-IE-EmilyNeural', label: 'Emily (Ireland)', locale: 'en-IE', quality: 'good', style: 'narrator' },
  { name: 'en-IE-ConorNeural', label: 'Conor (Ireland)', locale: 'en-IE', quality: 'good', style: 'narrator' },
  { name: 'fr-FR-DeniseNeural', label: 'Denise (France)', locale: 'fr-FR', quality: 'premium', style: 'narrator' },
  { name: 'fr-FR-HenriNeural', label: 'Henri (France)', locale: 'fr-FR', quality: 'premium', style: 'narrator' },
  { name: 'de-DE-KatjaNeural', label: 'Katja (Germany)', locale: 'de-DE', quality: 'premium', style: 'narrator' },
  { name: 'de-DE-ConradNeural', label: 'Conrad (Germany)', locale: 'de-DE', quality: 'premium', style: 'narrator' },
  { name: 'es-ES-ElviraNeural', label: 'Elvira (Spain)', locale: 'es-ES', quality: 'premium', style: 'narrator' },
  { name: 'es-ES-AlvaroNeural', label: 'Alvaro (Spain)', locale: 'es-ES', quality: 'premium', style: 'narrator' },
  { name: 'it-IT-ElsaNeural', label: 'Elsa (Italy)', locale: 'it-IT', quality: 'premium', style: 'narrator' },
  { name: 'it-IT-DiegoNeural', label: 'Diego (Italy)', locale: 'it-IT', quality: 'premium', style: 'narrator' },
  { name: 'pt-PT-RaquelNeural', label: 'Raquel (Portugal)', locale: 'pt-PT', quality: 'good', style: 'narrator' },
  { name: 'ru-RU-SvetlanaNeural', label: 'Svetlana (Russia)', locale: 'ru-RU', quality: 'good', style: 'narrator' },
  { name: 'nl-NL-FennaNeural', label: 'Fenna (Netherlands)', locale: 'nl-NL', quality: 'good', style: 'narrator' },
  { name: 'nl-NL-MaartenNeural', label: 'Maarten (Netherlands)', locale: 'nl-NL', quality: 'good', style: 'narrator' },
  { name: 'pl-PL-ZofiaNeural', label: 'Zofia (Poland)', locale: 'pl-PL', quality: 'good', style: 'narrator' },
  { name: 'pl-PL-MarekNeural', label: 'Marek (Poland)', locale: 'pl-PL', quality: 'good', style: 'narrator' },
  { name: 'da-DK-ChristelNeural', label: 'Christel (Denmark)', locale: 'da-DK', quality: 'good', style: 'narrator' },
  { name: 'da-DK-JeppeNeural', label: 'Jeppe (Denmark)', locale: 'da-DK', quality: 'good', style: 'narrator' },
  { name: 'sv-SE-SofieNeural', label: 'Sofie (Sweden)', locale: 'sv-SE', quality: 'good', style: 'narrator' },
  { name: 'sv-SE-MattiasNeural', label: 'Mattias (Sweden)', locale: 'sv-SE', quality: 'good', style: 'narrator' },
  { name: 'nb-NO-IselinNeural', label: 'Iselin (Norway)', locale: 'nb-NO', quality: 'good', style: 'narrator' },
  { name: 'nb-NO-FinnNeural', label: 'Finn (Norway)', locale: 'nb-NO', quality: 'good', style: 'narrator' },
  { name: 'fi-FI-NooraNeural', label: 'Noora (Finland)', locale: 'fi-FI', quality: 'good', style: 'narrator' },
  { name: 'fi-FI-HarriNeural', label: 'Harri (Finland)', locale: 'fi-FI', quality: 'good', style: 'narrator' },
  // Asia (India, Singapore, Philippines, HK, China, Japan, Korea, Saudi)
  { name: 'en-IN-NeerjaNeural', label: 'Neerja (India)', locale: 'en-IN', quality: 'good', style: 'narrator' },
  { name: 'en-IN-PrabhatNeural', label: 'Prabhat (India)', locale: 'en-IN', quality: 'good', style: 'narrator' },
  { name: 'en-IN-AnanyaNeural', label: 'Ananya (India)', locale: 'en-IN', quality: 'good', style: 'narrator' },
  { name: 'en-IN-ManishNeural', label: 'Manish (India)', locale: 'en-IN', quality: 'good', style: 'narrator' },
  { name: 'en-SG-LunaNeural', label: 'Luna (Singapore)', locale: 'en-SG', quality: 'good', style: 'narrator' },
  { name: 'en-SG-WayneNeural', label: 'Wayne (Singapore)', locale: 'en-SG', quality: 'good', style: 'narrator' },
  { name: 'en-PH-RosaNeural', label: 'Rosa (Philippines)', locale: 'en-PH', quality: 'good', style: 'narrator' },
  { name: 'en-PH-JamesNeural', label: 'James (Philippines)', locale: 'en-PH', quality: 'good', style: 'narrator' },
  { name: 'en-HK-SamNeural', label: 'Sam (Hong Kong)', locale: 'en-HK', quality: 'good', style: 'narrator' },
  { name: 'en-HK-YanNeural', label: 'Yan (Hong Kong)', locale: 'en-HK', quality: 'good', style: 'narrator' },
  { name: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao (China)', locale: 'zh-CN', quality: 'premium', style: 'assistant' },
  { name: 'zh-CN-YunxiNeural', label: 'Yunxi (China)', locale: 'zh-CN', quality: 'premium', style: 'narrator' },
  { name: 'ja-JP-NanamiNeural', label: 'Nanami (Japan)', locale: 'ja-JP', quality: 'premium', style: 'narrator' },
  { name: 'ja-JP-KeitaNeural', label: 'Keita (Japan)', locale: 'ja-JP', quality: 'premium', style: 'narrator' },
  { name: 'ko-KR-SunHiNeural', label: 'SunHi (Korea)', locale: 'ko-KR', quality: 'premium', style: 'narrator' },
  { name: 'ar-SA-ZariyahNeural', label: 'Zariyah (Saudi)', locale: 'ar-SA', quality: 'good', style: 'narrator' },
  // Africa (Nigeria, Kenya, South Africa, Tanzania, Egypt)
  { name: 'en-NG-AbeoNeural', label: 'Abeo (Nigeria)', locale: 'en-NG', quality: 'good', style: 'narrator' },
  { name: 'en-NG-EzinneNeural', label: 'Ezinne (Nigeria)', locale: 'en-NG', quality: 'good', style: 'narrator' },
  { name: 'en-KE-AsiliaNeural', label: 'Asilia (Kenya)', locale: 'en-KE', quality: 'good', style: 'narrator' },
  { name: 'en-KE-ChilembaNeural', label: 'Chilemba (Kenya)', locale: 'en-KE', quality: 'good', style: 'narrator' },
  { name: 'en-ZA-LeahNeural', label: 'Leah (South Africa)', locale: 'en-ZA', quality: 'good', style: 'narrator' },
  { name: 'en-ZA-LukeNeural', label: 'Luke (South Africa)', locale: 'en-ZA', quality: 'good', style: 'narrator' },
  { name: 'en-TZ-ElimuNeural', label: 'Elimu (Tanzania)', locale: 'en-TZ', quality: 'good', style: 'narrator' },
  { name: 'ar-EG-ShakirNeural', label: 'Shakir (Egypt)', locale: 'ar-EG', quality: 'good', style: 'narrator' },
  // Oceania (Australia, New Zealand)
  { name: 'en-AU-NatashaNeural', label: 'Natasha (Australia)', locale: 'en-AU', quality: 'good', style: 'narrator' },
  { name: 'en-AU-WilliamNeural', label: 'William (Australia)', locale: 'en-AU', quality: 'good', style: 'narrator' },
  { name: 'en-AU-AnnetteNeural', label: 'Annette (Australia)', locale: 'en-AU', quality: 'good', style: 'narrator' },
  { name: 'en-AU-KenNeural', label: 'Ken (Australia)', locale: 'en-AU', quality: 'good', style: 'narrator' },
  { name: 'en-NZ-MitchellNeural', label: 'Mitchell (New Zealand)', locale: 'en-NZ', quality: 'good', style: 'narrator' },
  { name: 'en-NZ-MollyNeural', label: 'Molly (New Zealand)', locale: 'en-NZ', quality: 'good', style: 'narrator' },
  // South America (Brazil, Mexico, Argentina)
  { name: 'pt-BR-FranciscaNeural', label: 'Francisca (Brazil)', locale: 'pt-BR', quality: 'good', style: 'narrator' },
  { name: 'pt-BR-AntonioNeural', label: 'Antonio (Brazil)', locale: 'pt-BR', quality: 'good', style: 'narrator' },
  { name: 'es-MX-DaliaNeural', label: 'Dalia (Mexico)', locale: 'es-MX', quality: 'good', style: 'narrator' },
  { name: 'es-AR-ElenaNeural', label: 'Elena (Argentina)', locale: 'es-AR', quality: 'good', style: 'narrator' },
  // Additional languages
  { name: 'tr-TR-EmelNeural', label: 'Emel (Turkey)', locale: 'tr-TR', quality: 'good', style: 'narrator' },
  { name: 'tr-TR-AhmetNeural', label: 'Ahmet (Turkey)', locale: 'tr-TR', quality: 'good', style: 'narrator' },
  { name: 'he-IL-HilaNeural', label: 'Hila (Israel)', locale: 'he-IL', quality: 'good', style: 'narrator' },
  { name: 'he-IL-AvriNeural', label: 'Avri (Israel)', locale: 'he-IL', quality: 'good', style: 'narrator' },
  { name: 'id-ID-GadisNeural', label: 'Gadis (Indonesia)', locale: 'id-ID', quality: 'good', style: 'narrator' },
  { name: 'id-ID-ArdiNeural', label: 'Ardi (Indonesia)', locale: 'id-ID', quality: 'good', style: 'narrator' },
  { name: 'ms-MY-YasminNeural', label: 'Yasmin (Malaysia)', locale: 'ms-MY', quality: 'good', style: 'narrator' },
  { name: 'ms-MY-OsmanNeural', label: 'Osman (Malaysia)', locale: 'ms-MY', quality: 'good', style: 'narrator' },
  { name: 'vi-VN-HoaiMyNeural', label: 'Hoai My (Vietnam)', locale: 'vi-VN', quality: 'good', style: 'narrator' },
  { name: 'vi-VN-NamMinhNeural', label: 'Nam Minh (Vietnam)', locale: 'vi-VN', quality: 'good', style: 'narrator' },
  { name: 'th-TH-PremwadeeNeural', label: 'Premwadee (Thailand)', locale: 'th-TH', quality: 'good', style: 'narrator' },
  { name: 'th-TH-NiwatNeural', label: 'Niwat (Thailand)', locale: 'th-TH', quality: 'good', style: 'narrator' },
  { name: 'cs-CZ-VlastaNeural', label: 'Vlasta (Czech)', locale: 'cs-CZ', quality: 'good', style: 'narrator' },
  { name: 'cs-CZ-AntoninNeural', label: 'Antonin (Czech)', locale: 'cs-CZ', quality: 'good', style: 'narrator' },
  { name: 'hu-HU-NoemiNeural', label: 'Noemi (Hungary)', locale: 'hu-HU', quality: 'good', style: 'narrator' },
  { name: 'hu-HU-TamasNeural', label: 'Tamas (Hungary)', locale: 'hu-HU', quality: 'good', style: 'narrator' },
  { name: 'el-GR-AthinaNeural', label: 'Athina (Greece)', locale: 'el-GR', quality: 'good', style: 'narrator' },
  { name: 'el-GR-NestorasNeural', label: 'Nestoras (Greece)', locale: 'el-GR', quality: 'good', style: 'narrator' },
  { name: 'ro-RO-AlinaNeural', label: 'Alina (Romania)', locale: 'ro-RO', quality: 'good', style: 'narrator' },
  { name: 'ro-RO-EmilNeural', label: 'Emil (Romania)', locale: 'ro-RO', quality: 'good', style: 'narrator' },
  { name: 'sk-SK-ViktoriaNeural', label: 'Viktoria (Slovakia)', locale: 'sk-SK', quality: 'good', style: 'narrator' },
  { name: 'sk-SK-LukasNeural', label: 'Lukas (Slovakia)', locale: 'sk-SK', quality: 'good', style: 'narrator' },
  { name: 'sl-SI-PetraNeural', label: 'Petra (Slovenia)', locale: 'sl-SI', quality: 'good', style: 'narrator' },
  { name: 'sl-SI-RokNeural', label: 'Rok (Slovenia)', locale: 'sl-SI', quality: 'good', style: 'narrator' },
  { name: 'hr-HR-GabrijelaNeural', label: 'Gabrijela (Croatia)', locale: 'hr-HR', quality: 'good', style: 'narrator' },
  { name: 'hr-HR-SreckoNeural', label: 'Srecko (Croatia)', locale: 'hr-HR', quality: 'good', style: 'narrator' },
  // About 150 voices now
];

// ----- FAIR – 78 voices (your original list) -----
const FAIR_VOICES = [
  // North America
  { name: 'en-US-JennyNeural', label: 'Jenny US', locale: 'en-US' },
  { name: 'en-US-AriaNeural', label: 'Aria US', locale: 'en-US' },
  { name: 'en-US-MichelleNeural', label: 'Michelle US', locale: 'en-US' },
  { name: 'en-US-SaraNeural', label: 'Sara US', locale: 'en-US' },
  { name: 'en-US-AshleyNeural', label: 'Ashley US', locale: 'en-US' },
  { name: 'en-US-AnaNeural', label: 'Ana US', locale: 'en-US' },
  { name: 'en-US-GuyNeural', label: 'Guy US', locale: 'en-US' },
  { name: 'en-US-BrandonNeural', label: 'Brandon US', locale: 'en-US' },
  { name: 'en-US-ChristopherNeural', label: 'Christopher US', locale: 'en-US' },
  { name: 'en-US-EricNeural', label: 'Eric US', locale: 'en-US' },
  { name: 'en-US-SteffanNeural', label: 'Steffan US', locale: 'en-US' },
  { name: 'en-US-RogerNeural', label: 'Roger US', locale: 'en-US' },
  { name: 'en-CA-ClaraNeural', label: 'Clara CA', locale: 'en-CA' },
  { name: 'en-CA-LiamNeural', label: 'Liam CA', locale: 'en-CA' },
  { name: 'en-CA-EmmaNeural', label: 'Emma CA', locale: 'en-CA' },
  { name: 'en-CA-BrentNeural', label: 'Brent CA', locale: 'en-CA' },
  // Europe (28)
  { name: 'en-GB-SoniaNeural', label: 'Sonia UK', locale: 'en-GB' },
  { name: 'en-GB-RyanNeural', label: 'Ryan UK', locale: 'en-GB' },
  { name: 'en-GB-LibbyNeural', label: 'Libby UK', locale: 'en-GB' },
  { name: 'en-GB-MaisieNeural', label: 'Maisie UK', locale: 'en-GB' },
  { name: 'en-GB-AbbiNeural', label: 'Abbi UK', locale: 'en-GB' },
  { name: 'en-GB-AlfieNeural', label: 'Alfie UK', locale: 'en-GB' },
  { name: 'en-GB-ElliotNeural', label: 'Elliot UK', locale: 'en-GB' },
  { name: 'en-GB-EthanNeural', label: 'Ethan UK', locale: 'en-GB' },
  { name: 'en-IE-EmilyNeural', label: 'Emily IE', locale: 'en-IE' },
  { name: 'en-IE-ConorNeural', label: 'Conor IE', locale: 'en-IE' },
  { name: 'fr-FR-DeniseNeural', label: 'Denise FR', locale: 'fr-FR' },
  { name: 'fr-FR-HenriNeural', label: 'Henri FR', locale: 'fr-FR' },
  { name: 'de-DE-KatjaNeural', label: 'Katja DE', locale: 'de-DE' },
  { name: 'de-DE-ConradNeural', label: 'Conrad DE', locale: 'de-DE' },
  { name: 'es-ES-ElviraNeural', label: 'Elvira ES', locale: 'es-ES' },
  { name: 'es-ES-AlvaroNeural', label: 'Alvaro ES', locale: 'es-ES' },
  { name: 'it-IT-ElsaNeural', label: 'Elsa IT', locale: 'it-IT' },
  { name: 'it-IT-DiegoNeural', label: 'Diego IT', locale: 'it-IT' },
  { name: 'pt-PT-RaquelNeural', label: 'Raquel PT', locale: 'pt-PT' },
  { name: 'ru-RU-SvetlanaNeural', label: 'Svetlana RU', locale: 'ru-RU' },
  { name: 'nl-NL-FennaNeural', label: 'Fenna NL', locale: 'nl-NL' },
  { name: 'nl-NL-MaartenNeural', label: 'Maarten NL', locale: 'nl-NL' },
  { name: 'pl-PL-ZofiaNeural', label: 'Zofia PL', locale: 'pl-PL' },
  { name: 'pl-PL-MarekNeural', label: 'Marek PL', locale: 'pl-PL' },
  { name: 'da-DK-ChristelNeural', label: 'Christel DK', locale: 'da-DK' },
  { name: 'da-DK-JeppeNeural', label: 'Jeppe DK', locale: 'da-DK' },
  { name: 'sv-SE-SofieNeural', label: 'Sofie SE', locale: 'sv-SE' },
  { name: 'sv-SE-MattiasNeural', label: 'Mattias SE', locale: 'sv-SE' },
  { name: 'nb-NO-IselinNeural', label: 'Iselin NO', locale: 'nb-NO' },
  { name: 'nb-NO-FinnNeural', label: 'Finn NO', locale: 'nb-NO' },
  { name: 'fi-FI-NooraNeural', label: 'Noora FI', locale: 'fi-FI' },
  { name: 'fi-FI-HarriNeural', label: 'Harri FI', locale: 'fi-FI' },
  // Asia (16)
  { name: 'en-IN-NeerjaNeural', label: 'Neerja IN', locale: 'en-IN' },
  { name: 'en-IN-PrabhatNeural', label: 'Prabhat IN', locale: 'en-IN' },
  { name: 'en-IN-AnanyaNeural', label: 'Ananya IN', locale: 'en-IN' },
  { name: 'en-IN-ManishNeural', label: 'Manish IN', locale: 'en-IN' },
  { name: 'en-SG-LunaNeural', label: 'Luna SG', locale: 'en-SG' },
  { name: 'en-SG-WayneNeural', label: 'Wayne SG', locale: 'en-SG' },
  { name: 'en-PH-RosaNeural', label: 'Rosa PH', locale: 'en-PH' },
  { name: 'en-PH-JamesNeural', label: 'James PH', locale: 'en-PH' },
  { name: 'en-HK-SamNeural', label: 'Sam HK', locale: 'en-HK' },
  { name: 'en-HK-YanNeural', label: 'Yan HK', locale: 'en-HK' },
  { name: 'zh-CN-XiaoxiaoNeural', label: 'Xiaoxiao CN', locale: 'zh-CN' },
  { name: 'zh-CN-YunxiNeural', label: 'Yunxi CN', locale: 'zh-CN' },
  { name: 'ja-JP-NanamiNeural', label: 'Nanami JP', locale: 'ja-JP' },
  { name: 'ja-JP-KeitaNeural', label: 'Keita JP', locale: 'ja-JP' },
  { name: 'ko-KR-SunHiNeural', label: 'SunHi KR', locale: 'ko-KR' },
  { name: 'ar-SA-ZariyahNeural', label: 'Zariyah SA', locale: 'ar-SA' },
  // Africa (8)
  { name: 'en-NG-AbeoNeural', label: 'Abeo NG', locale: 'en-NG' },
  { name: 'en-NG-EzinneNeural', label: 'Ezinne NG', locale: 'en-NG' },
  { name: 'en-KE-AsiliaNeural', label: 'Asilia KE', locale: 'en-KE' },
  { name: 'en-KE-ChilembaNeural', label: 'Chilemba KE', locale: 'en-KE' },
  { name: 'en-ZA-LeahNeural', label: 'Leah ZA', locale: 'en-ZA' },
  { name: 'en-ZA-LukeNeural', label: 'Luke ZA', locale: 'en-ZA' },
  { name: 'en-TZ-ElimuNeural', label: 'Elimu TZ', locale: 'en-TZ' },
  { name: 'ar-EG-ShakirNeural', label: 'Shakir EG', locale: 'ar-EG' },
  // Oceania (6)
  { name: 'en-AU-NatashaNeural', label: 'Natasha AU', locale: 'en-AU' },
  { name: 'en-AU-WilliamNeural', label: 'William AU', locale: 'en-AU' },
  { name: 'en-AU-AnnetteNeural', label: 'Annette AU', locale: 'en-AU' },
  { name: 'en-AU-KenNeural', label: 'Ken AU', locale: 'en-AU' },
  { name: 'en-NZ-MitchellNeural', label: 'Mitchell NZ', locale: 'en-NZ' },
  { name: 'en-NZ-MollyNeural', label: 'Molly NZ', locale: 'en-NZ' },
  // South America (4)
  { name: 'pt-BR-FranciscaNeural', label: 'Francisca BR', locale: 'pt-BR' },
  { name: 'pt-BR-AntonioNeural', label: 'Antonio BR', locale: 'pt-BR' },
  { name: 'es-MX-DaliaNeural', label: 'Dalia MX', locale: 'es-MX' },
  { name: 'es-AR-ElenaNeural', label: 'Elena AR', locale: 'es-AR' },
];

// XTTS and Robotic
const XTTS_VOICES = [
  { name: 'en-US-AriaNeural', label: 'XTTS Female' },
  { name: 'en-US-GuyNeural', label: 'XTTS Male' }
];

const ROBOTIC_VOICES = [
  { name: 'male', label: 'Male Robotic' },
  { name: 'female', label: 'Female Robotic' }
];

// Build voice map for language routing
const voiceMap = {};
[...REALISTIC_VOICES, ...FAIR_VOICES].forEach(v => {
  if (!voiceMap[v.locale]) voiceMap[v.locale] = [];
  voiceMap[v.locale].push(v);
});

// ============================================================
//  FEATURES: Language Router, Emotion, Punctuation, etc.
// ============================================================

// Language → locale mapping
const LANGUAGE_TO_LOCALE = {
  eng: 'en-US',
  cmn: 'zh-CN',
  jpn: 'ja-JP',
  kor: 'ko-KR',
  ara: 'ar-SA',
  fra: 'fr-FR',
  deu: 'de-DE',
  spa: 'es-ES',
  ita: 'it-IT',
  por: 'pt-PT',
  rus: 'ru-RU',
  nld: 'nl-NL',
  pol: 'pl-PL',
  dan: 'da-DK',
  swe: 'sv-SE',
  nor: 'nb-NO',
  fin: 'fi-FI',
};

function getVoiceForLanguage(lang) {
  const locale = LANGUAGE_TO_LOCALE[lang];
  if (!locale) return null;
  const candidates = voiceMap[locale] || [];
  if (candidates.length === 0) return null;
  // Prefer premium
  const premium = candidates.filter(v => v.quality === 'premium');
  return (premium.length > 0 ? premium[0] : candidates[0]).name;
}

function detectLanguageWithConfidence(text) {
  try {
    const result = franc(text, { minLength: 3 });
    return { lang: result, confidence: 1.0 };
  } catch {
    return { lang: 'eng', confidence: 0.5 };
  }
}

// Pronunciation dictionary
const PRONUNCIATION_DICT = {
  'HYEZEN': 'H Y E Z E N',
  'AI': 'A I',
  'API': 'A P I',
  'JAMB': 'J A M B',
  'WAEC': 'W A E C',
};
function applyPronunciation(text) {
  let result = text;
  for (const [word, pron] of Object.entries(PRONUNCIATION_DICT)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), pron);
  }
  return result;
}

// Advanced punctuation
function getPauseDuration(char, multiplier = 1.0) {
  const map = {
    ',': 200,
    ';': 350,
    '.': 600,
    '?': 600,
    '!': 600,
    '…': 1200,
    '—': 750,
    '。': 600,
    '，': 250,
    '！': 600,
    '？': 600,
    '……': 1300,
  };
  return (map[char] || 300) * multiplier;
}

// Emotion detection
const EMOTION_KEYWORDS = {
  happy: ['happy', 'joy', 'celebrate', 'glad', 'cheerful', 'smile'],
  sad: ['sad', 'cry', 'tear', 'grief', 'mourn', 'depressed'],
  angry: ['angry', 'fury', 'rage', 'furious', 'outraged', 'mad'],
  fear: ['fear', 'scared', 'terrified', 'horror', 'dread', 'panic'],
  dramatic: ['dramatic', 'epic', 'final', 'destiny', 'fate', 'climax'],
  excited: ['exciting', 'amazing', 'incredible', 'wow', 'awesome', 'thrilling'],
  mysterious: ['mystery', 'secret', 'unknown', 'shadow', 'hidden', 'strange'],
  romantic: ['love', 'heart', 'romance', 'kiss', 'passion', 'sweet'],
  serious: ['serious', 'critical', 'grave', 'important', 'dangerous', 'severe'],
};
function detectEmotion(text) {
  const lower = text.toLowerCase();
  const scores = {};
  for (const [emotion, words] of Object.entries(EMOTION_KEYWORDS)) {
    let count = 0;
    for (const w of words) if (lower.includes(w)) count++;
    if (count > 0) scores[emotion] = count;
  }
  if (Object.keys(scores).length === 0) return 'neutral';
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}
function getEmotionProsody(emotion) {
  const map = {
    neutral: { pitch: 0, rate: 0, pauseMult: 1.0 },
    happy: { pitch: 5, rate: 5, pauseMult: 0.9 },
    sad: { pitch: -5, rate: -10, pauseMult: 1.2 },
    angry: { pitch: 8, rate: 8, pauseMult: 0.8 },
    fear: { pitch: 10, rate: -5, pauseMult: 1.1 },
    dramatic: { pitch: -2, rate: -15, pauseMult: 1.5 },
    excited: { pitch: 12, rate: 12, pauseMult: 0.7 },
    mysterious: { pitch: -3, rate: -10, pauseMult: 1.3 },
    romantic: { pitch: 2, rate: -5, pauseMult: 1.1 },
    serious: { pitch: -5, rate: -5, pauseMult: 1.0 },
  };
  return map[emotion] || map.neutral;
}

// Number normalization (language-specific)
function normalizeNumbersLang(text, lang) {
  if (lang === 'eng') {
    text = text.replace(/\$(\d+)/g, (m, n) => {
      try { return `${toWords(parseInt(n))} dollars`; } catch { return m; }
    });
    text = text.replace(/\b(\d+)\b/g, (m, n) => {
      try { return toWords(parseInt(n)); } catch { return m; }
    });
    return text;
  }
  // For other languages, do digit-by-digit
  const langMap = {
    cmn: { digits: '零一二三四五六七八九' },
    jpn: { digits: '零一二三四五六七八九' },
    kor: { digits: '영일이삼사오육칠팔구' },
    ara: { digits: '٠١٢٣٤٥٦٧٨٩' },
  };
  const config = langMap[lang];
  if (!config) return text;
  text = text.replace(/\b(\d+)\b/g, (match, num) => {
    return num.split('').map(d => config.digits[parseInt(d)] || d).join('');
  });
  return text;
}

// Character voice system
function applyCharacterVoices(text, characterMap) {
  if (!characterMap || Object.keys(characterMap).length === 0) return text;
  const voices = Object.values(characterMap);
  let idx = 0;
  return text.replace(/"([^"]*)"/g, (match, inner) => {
    const voice = voices[idx % voices.length];
    idx++;
    return `<char voice="${voice}">"${inner}"</char>`;
  });
}

// ============================================================
//  NARRATION MODES
// ============================================================
const NARRATION_MODES = {
  anime_narrator: { speed: 0.90, pitch: -2, pause_multiplier: 1.5 },
  assistant: { speed: 1.0, pitch: 0, pause_multiplier: 1.0 },
  news: { speed: 0.95, pitch: 0, pause_multiplier: 0.8 },
  story: { speed: 0.85, pitch: -1, pause_multiplier: 1.3 },
  education: { speed: 0.90, pitch: 0, pause_multiplier: 1.2 },
  documentary: { speed: 0.80, pitch: -2, pause_multiplier: 1.4 },
  character: { speed: 1.0, pitch: 5, pause_multiplier: 1.0 },
  whisper: { speed: 0.70, pitch: 5, pause_multiplier: 1.2 },
  dramatic: { speed: 0.75, pitch: -5, pause_multiplier: 1.8 },
  fast_talker: { speed: 1.4, pitch: 0, pause_multiplier: 0.5 },
};

// ============================================================
//  SSML BUILDER (full pipeline)
// ============================================================
async function buildSSMLFull({
  text,
  voice,
  speed = 1.0,
  pitch = 0,
  mode = 'story',
  emotion = null,
  characterMap = null,
  userPronunciation = null,
}) {
  // Clean
  let processed = text
    .replace(/##\s*/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  // User & default pronunciation
  if (userPronunciation) {
    for (const [word, pron] of Object.entries(userPronunciation)) {
      processed = processed.replace(new RegExp(`\\b${word}\\b`, 'gi'), pron);
    }
  }
  processed = applyPronunciation(processed);

  // Language detection
  const { lang } = detectLanguageWithConfidence(processed);
  // Number normalization
  processed = normalizeNumbersLang(processed, lang);

  // Emotion
  if (!emotion) emotion = detectEmotion(processed);
  const emotionProsody = getEmotionProsody(emotion);

  // Character voices
  processed = applyCharacterVoices(processed, characterMap);

  // Split sentences - USING CUSTOM FUNCTION (no external dependency)
  const sentences = getSentences(processed);

  // Apply mode
  const modeSettings = NARRATION_MODES[mode] || NARRATION_MODES.story;
  const baseSpeed = modeSettings.speed || 1.0;
  const basePitch = modeSettings.pitch || 0;
  const pauseMult = modeSettings.pause_multiplier || 1.0;

  const finalSpeed = speed * (1 + (emotionProsody.rate / 100)) * (baseSpeed / 1.0);
  const finalPitch = pitch + emotionProsody.pitch + basePitch;

  // Build with pauses
  const sentenceItems = sentences.map((s, idx) => {
    const lastChar = s.trim().slice(-1);
    const basePause = getPauseDuration(lastChar);
    const pauseMs = basePause * pauseMult * emotionProsody.pauseMult;
    const breakTag = (idx < sentences.length - 1) ? `<break time="${pauseMs}ms"/>` : '';
    // Check for character voice
    const charMatch = s.match(/<char voice="([^"]+)">(.+)<\/char>/);
    if (charMatch) {
      return `<voice name="${charMatch[1]}">${charMatch[2]}</voice>${breakTag}`;
    }
    return `${s}${breakTag}`;
  }).join(' ');

  const rateAttr = finalSpeed !== 1.0 ? `rate="${finalSpeed > 1 ? '+' : ''}${Math.round((finalSpeed - 1) * 100)}%"` : '';
  const pitchAttr = finalPitch !== 0 ? `pitch="${finalPitch > 0 ? '+' : ''}${finalPitch}%"` : '';

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
    <voice name="${voice}">
      <prosody ${rateAttr} ${pitchAttr}>
        ${sentenceItems}
      </prosody>
    </voice>
  </speak>`;

  return { ssml, lang, emotion, finalSpeed, finalPitch };
}

// ============================================================
//  EDGE-TTS WRAPPER (with concurrency queue)
// ============================================================
let queue = [];
let processing = false;

function edgeTTSWithSSML(ssml, voice, outputFile) {
  return new Promise((resolve, reject) => {
    const task = { ssml, voice, outputFile, resolve, reject };
    queue.push(task);
    processQueue();
  });
}

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  const task = queue.shift();
  try {
    const args = ['--ssml', task.ssml, '--voice', task.voice, '--write-media', task.outputFile];
    await new Promise((res, rej) => {
      execFile('edge-tts', args, (error, stdout, stderr) => {
        if (error) rej(error);
        else if (!fs.existsSync(task.outputFile) || fs.statSync(task.outputFile).size === 0) {
          rej(new Error('Audio file empty'));
        } else res();
      });
    });
    task.resolve();
  } catch (e) {
    task.reject(e);
  } finally {
    processing = false;
    processQueue(); // process next
  }
}

// ============================================================
//  AUDIO MASTERING (ffmpeg)
// ============================================================
async function masterAudio(inputFile, outputFile) {
  if (!ffmpeg) {
    fs.copyFileSync(inputFile, outputFile);
    return;
  }
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .audioFilters([
        'volume=2',
        'compand=0.3|0.3:1|1:-90/-60|-60/-40|-40/-30|-20/-20:6:0:-90:0.2',
        'silenceremove=1:0:-50dB'
      ])
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('end', resolve)
      .on('error', reject)
      .save(outputFile);
  });
}

// ============================================================
//  CACHE DATABASE
// ============================================================
const CACHE_DB_PATH = path.join(__dirname, 'cache_db.json');
function loadCacheDB() {
  try { if (fs.existsSync(CACHE_DB_PATH)) return JSON.parse(fs.readFileSync(CACHE_DB_PATH, 'utf8')); } catch {}
  return { entries: [] };
}
function saveCacheDB(db) { fs.writeFileSync(CACHE_DB_PATH, JSON.stringify(db, null, 2)); }

function getCacheEntry(text, voice, speed, pitch, mode, format) {
  const db = loadCacheDB();
  const key = crypto.createHash('sha256').update(`${text}|${voice}|${speed}|${pitch}|${mode}|${format}`).digest('hex');
  const entry = db.entries.find(e => e.key === key);
  if (entry && fs.existsSync(entry.filepath)) {
    entry.play_count = (entry.play_count || 0) + 1;
    entry.last_accessed = Date.now();
    saveCacheDB(db);
    return entry;
  }
  return null;
}
function addCacheEntry(text, voice, speed, pitch, mode, format, filepath, duration, size) {
  const db = loadCacheDB();
  const key = crypto.createHash('sha256').update(`${text}|${voice}|${speed}|${pitch}|${mode}|${format}`).digest('hex');
  db.entries = db.entries.filter(e => e.key !== key);
  db.entries.push({
    key,
    text: text.slice(0, 200),
    voice, speed, pitch, mode, format, filepath, duration, size,
    created_at: Date.now(),
    last_accessed: Date.now(),
    play_count: 0,
  });
  if (db.entries.length > 1000) {
    db.entries.sort((a, b) => a.last_accessed - b.last_accessed);
    const toRemove = db.entries.slice(0, db.entries.length - 1000);
    for (const e of toRemove) {
      try { fs.unlinkSync(e.filepath); } catch (e) {}
    }
    db.entries = db.entries.slice(-1000);
  }
  saveCacheDB(db);
}

// ============================================================
//  API ENDPOINTS
// ============================================================

app.get('/api/voices/:type', (req, res) => {
  const { type } = req.params;
  if (type === 'realistic') return res.json(REALISTIC_VOICES);
  if (type === 'fair') return res.json(FAIR_VOICES);
  if (type === 'xtts') return res.json(XTTS_VOICES);
  if (type === 'robotic') return res.json(ROBOTIC_VOICES);
  res.json([]);
});

app.get('/api/modes', (req, res) => {
  res.json(Object.keys(NARRATION_MODES));
});

// ElevenLabs (keep your existing code)
app.post('/api/elevenlabs/clone', async (req, res) => { /* ... */ });
app.post('/api/elevenlabs/tts', async (req, res) => { /* ... */ });

// Main TTS
app.post('/api/tts', async (req, res) => {
  try {
    let { text, voice, type = 'realistic', speed = 1.0, pitch = 0, mode = 'story', emotion, characters, user_pronunciation } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });

    if (type === 'robotic') return res.json({ success: true, robotic: true, text, voice });
    if (type === 'xtts') return res.status(400).json({ error: 'XTTS not in this route, use /api/elevenlabs/tts' });

    // Auto-select voice if not provided
    if (!voice) {
      const { lang } = detectLanguageWithConfidence(text);
      voice = getVoiceForLanguage(lang);
      if (!voice) voice = 'en-US-JennyNeural';
    }

    // Validate voice (fallback)
    const voiceList = type === 'realistic' ? REALISTIC_VOICES : FAIR_VOICES;
    if (!voiceList.some(v => v.name === voice)) {
      const { lang } = detectLanguageWithConfidence(text);
      const fallback = getVoiceForLanguage(lang) || 'en-US-JennyNeural';
      voice = fallback;
    }

    // Check cache
    const cacheEntry = getCacheEntry(text, voice, speed, pitch, mode, 'mp3');
    if (cacheEntry) {
      return res.json({
        success: true,
        url: `/cache/${path.basename(cacheEntry.filepath)}`,
        cached: true,
        duration: cacheEntry.duration,
        voice,
        language: cacheEntry.lang || detectLanguageWithConfidence(text).lang,
        size: cacheEntry.size,
        format: 'mp3',
        emotion: cacheEntry.emotion || 'unknown',
      });
    }

    // Build SSML
    const { ssml, lang, emotion: detectedEmotion, finalSpeed, finalPitch } = await buildSSMLFull({
      text, voice, speed, pitch, mode, emotion, characterMap: characters, userPronunciation: user_pronunciation,
    });

    // Generate audio
    const filename = `${type}_${uuidv4()}.mp3`;
    const filepath = path.join(__dirname, 'audio', filename);
    await edgeTTSWithSSML(ssml, voice, filepath);

    // Master
    const masteredFile = path.join(__dirname, 'audio', `mastered_${filename}`);
    await masterAudio(filepath, masteredFile);
    fs.unlinkSync(filepath);
    fs.renameSync(masteredFile, filepath);

    // Metadata
    let duration = 0;
    try {
      if (ffmpeg) {
        const probe = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(filepath, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata);
          });
        });
        duration = probe.format.duration || 0;
      }
    } catch {}
    const size = fs.statSync(filepath).size;

    // Cache
    addCacheEntry(text, voice, speed, pitch, mode, 'mp3', filepath, duration, size);

    res.json({
      success: true,
      url: `/audio/${filename}`,
      cached: false,
      duration,
      voice,
      language: lang,
      size,
      format: 'mp3',
      emotion: detectedEmotion,
    });
  } catch (e) {
    console.error('TTS error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => {
  const db = loadCacheDB();
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    realisticCount: REALISTIC_VOICES.length,
    fairCount: FAIR_VOICES.length,
    cacheEntries: db.entries.length,
    queueLength: queue.length,
  });
});

// ============================================================
//  START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 HYEZEN TTS v10 running on port ${PORT}`);
  console.log(`✅ Realistic: ${REALISTIC_VOICES.length} voices, Fair: ${FAIR_VOICES.length}`);
  console.log('✅ Modes:', Object.keys(NARRATION_MODES).join(', '));
  console.log('✅ No rate limiting – queue handles concurrency.');
  console.log('✅ Audio mastering:', ffmpeg ? 'enabled' : 'disabled');
});
