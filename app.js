/* ============================
   Azure Speech Studio — JS
   ============================ */

// ── Tab Switching ────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Helpers ──────────────────────────────────────────────────────
function getConfig() {
  const key    = document.getElementById('api-key').value.trim();
  const region = document.getElementById('region').value.trim();
  if (!key || !region) {
    return null;
  }
  return { key, region };
}

function setStatus(id, msg, type = 'info') {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status-msg ' + type;
}

function toggleVisibility(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    btn.textContent = '👁';
  }
}

// ── Text-to-Speech ───────────────────────────────────────────────
let ttsAudioBlob = null;

async function synthesizeSpeech() {
  const cfg = getConfig();
  if (!cfg) {
    setStatus('tts-status', '⚠ Please enter your API Key and Region above.', 'err');
    return;
  }

  const text  = document.getElementById('tts-text').value.trim();
  if (!text) {
    setStatus('tts-status', '⚠ Please enter some text to synthesize.', 'err');
    return;
  }

  const voice = document.getElementById('tts-voice').value;
  const rate  = document.getElementById('tts-rate').value;
  const pitch = document.getElementById('tts-pitch').value;

  const btn = document.getElementById('tts-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Synthesizing…';
  setStatus('tts-status', 'Requesting speech synthesis…', 'info');

  // Build SSML
  const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts"
       xml:lang="${voice.split('-').slice(0,2).join('-')}">
  <voice name="${voice}">
    <prosody rate="${rate > 0 ? '+' : ''}${rate}%" pitch="${pitch > 0 ? '+' : ''}${pitch}%">
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`.trim();

  const endpoint = `https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': cfg.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'AzureSpeechStudio'
      },
      body: ssml
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Azure error ${resp.status}: ${errText || resp.statusText}`);
    }

    const blob = await resp.blob();
    ttsAudioBlob = blob;
    const url = URL.createObjectURL(blob);

    const audio = document.getElementById('tts-audio');
    audio.src = url;
    document.getElementById('tts-audio-wrap').style.display = 'block';
    document.getElementById('tts-download').style.display = 'inline-flex';
    audio.play();

    setStatus('tts-status', '✓ Speech synthesized successfully.', 'ok');
  } catch (e) {
    setStatus('tts-status', '✕ ' + e.message, 'err');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">▶</span> Synthesize';
  }
}

function downloadAudio() {
  if (!ttsAudioBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(ttsAudioBlob);
  a.download = 'azure-speech-output.mp3';
  a.click();
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Speech-to-Text (Microphone) ──────────────────────────────────
let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;

async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  const cfg = getConfig();
  if (!cfg) {
    setStatus('stt-status', '⚠ Please enter your API Key and Region above.', 'err');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      await transcribeBlob(blob, cfg);
    };

    mediaRecorder.start(200);
    isRecording = true;

    const btn   = document.getElementById('mic-btn');
    const wave  = document.getElementById('mic-wave');
    btn.classList.add('recording');
    document.getElementById('mic-label').textContent = 'Stop Recording';
    wave.style.display = 'flex';
    setStatus('stt-status', '● Recording… click Stop when done.', 'info');
  } catch (e) {
    setStatus('stt-status', '✕ Microphone access denied: ' + e.message, 'err');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  const btn  = document.getElementById('mic-btn');
  const wave = document.getElementById('mic-wave');
  btn.classList.remove('recording');
  document.getElementById('mic-label').textContent = 'Start Recording';
  wave.style.display = 'none';
  setStatus('stt-status', 'Processing audio…', 'info');
}

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4'
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

// ── Speech-to-Text (File Upload) ─────────────────────────────────
async function transcribeFile(input) {
  const file = input.files[0];
  if (!file) return;

  document.getElementById('file-name').textContent = file.name;

  const cfg = getConfig();
  if (!cfg) {
    setStatus('stt-status', '⚠ Please enter your API Key and Region above.', 'err');
    return;
  }

  setStatus('stt-status', 'Uploading and transcribing…', 'info');
  await transcribeBlob(file, cfg);
}

async function transcribeBlob(blob, cfg) {
  const lang     = document.getElementById('stt-lang').value;
  const endpoint = `https://${cfg.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=detailed`;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': cfg.key,
        'Content-Type': getContentType(blob),
        'Accept': 'application/json'
      },
      body: blob
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Azure error ${resp.status}: ${errText || resp.statusText}`);
    }

    const data = await resp.json();
    const transcript =
      data.DisplayText ||
      data.NBest?.[0]?.Display ||
      data.RecognitionStatus ||
      'No transcript returned.';

    const box = document.getElementById('stt-result');
    box.innerHTML = '';
    box.textContent = transcript;
    setStatus('stt-status', `✓ Transcribed. Confidence: ${formatConfidence(data)}`, 'ok');
  } catch (e) {
    setStatus('stt-status', '✕ ' + e.message, 'err');
    console.error(e);
  }
}

function getContentType(blob) {
  const type = blob.type || '';
  if (type.includes('webm'))  return 'audio/webm;codecs=opus';
  if (type.includes('ogg'))   return 'audio/ogg;codecs=opus';
  if (type.includes('mp4'))   return 'audio/mp4';
  if (type.includes('wav'))   return 'audio/wav; codecs=audio/pcm; samplerate=16000';
  if (type.includes('flac'))  return 'audio/flac';
  if (type.includes('mpeg') || type.includes('mp3')) return 'audio/mpeg';
  return 'audio/wav';
}

function formatConfidence(data) {
  const conf = data.NBest?.[0]?.Confidence;
  if (conf !== undefined) return (conf * 100).toFixed(1) + '%';
  return data.RecognitionStatus || 'N/A';
}

// ── Transcript Actions ───────────────────────────────────────────
function copyTranscript() {
  const text = document.getElementById('stt-result').textContent;
  if (!text || text === 'Transcript will appear here…') return;
  navigator.clipboard.writeText(text).then(() => {
    setStatus('stt-status', '✓ Copied to clipboard.', 'ok');
  });
}

function clearTranscript() {
  const box = document.getElementById('stt-result');
  box.innerHTML = '<p class="result-placeholder">Transcript will appear here…</p>';
  document.getElementById('stt-status').textContent = '';
  document.getElementById('file-name').textContent = 'WAV, MP3, OGG, FLAC, M4A';
  document.getElementById('audio-file').value = '';
}

// ── Keyboard shortcut: Enter in textarea → synthesize ────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') {
    const ttsPanel = document.getElementById('tab-tts');
    if (ttsPanel.classList.contains('active')) synthesizeSpeech();
  }
});