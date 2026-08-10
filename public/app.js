// DOM Elements
const stateIdle = document.getElementById('stateIdle');
const stateRecording = document.getElementById('stateRecording');
const statePreview = document.getElementById('statePreview');
const stateSending = document.getElementById('stateSending');
const stateSuccess = document.getElementById('stateSuccess');

const btnStartRecord = document.getElementById('btnStartRecord');
const btnCancelRecord = document.getElementById('btnCancelRecord');
const btnStopRecord = document.getElementById('btnStopRecord');
const btnReRecord = document.getElementById('btnReRecord');
const btnSendRecord = document.getElementById('btnSendRecord');
const btnRestart = document.getElementById('btnRestart');

const recordingTimer = document.getElementById('recordingTimer');
const visualizerCanvas = document.getElementById('visualizerCanvas');
const audioPlayback = document.getElementById('audioPlayback');
const btnPlayPause = document.getElementById('btnPlayPause');
const iconPlay = document.getElementById('iconPlay');
const iconPause = document.getElementById('iconPause');
const playerTimelineBar = document.getElementById('playerTimelineBar');
const playerTimelineProgress = document.getElementById('playerTimelineProgress');
const playerCurrentTime = document.getElementById('playerCurrentTime');
const playerDuration = document.getElementById('playerDuration');
const senderNameInput = document.getElementById('senderName');

const errorToast = document.getElementById('errorToast');
const errorMessage = document.getElementById('errorMessage');

// Audio Recorder State Variables
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let audioUrl = null;
let recordInterval = null;
let recordDuration = 0; // in seconds

// Audio Context & Visualizer Variables
let audioCtx = null;
let analyser = null;
let source = null;
let dataArray = null;
let animationFrameId = null;
let streamInstance = null;

// Display state switcher helper
function changeState(activeState) {
  [stateIdle, stateRecording, statePreview, stateSending, stateSuccess].forEach(state => {
    state.classList.remove('active');
  });
  activeState.classList.add('active');
}

// Format duration to mm:ss format
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Display error toast
function showError(msg) {
  errorMessage.textContent = msg;
  errorToast.classList.add('active');
  setTimeout(() => {
    errorToast.classList.remove('active');
  }, 4000);
}

// Check for recording MIME types supported by the browser
function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/aac',
    'audio/wav'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

// Draw Audio Waveform Visualizer
function drawVisualizer() {
  if (!analyser) return;

  const canvasCtx = visualizerCanvas.getContext('2d');
  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;
  const bufferLength = analyser.frequencyBinCount;

  analyser.getByteFrequencyData(dataArray);

  canvasCtx.clearRect(0, 0, width, height);

  // Styling properties
  const barWidth = 4;
  const barGap = 3;
  const maxBars = Math.floor(width / (barWidth + barGap));
  const step = Math.ceil(bufferLength / maxBars);
  
  canvasCtx.fillStyle = '#e07a5f'; // Terracotta accent color

  // Draw symmetric waveform from center
  for (let i = 0; i < maxBars; i++) {
    const dataIndex = Math.min(i * step, bufferLength - 1);
    // Normalize value from 0 to 1
    const value = dataArray[dataIndex] / 255;
    
    // Scale visual height to canvas height
    const barHeight = Math.max(4, value * height * 0.8);
    const x = i * (barWidth + barGap) + (width - (maxBars * (barWidth + barGap))) / 2;
    const y = (height - barHeight) / 2;

    // Draw rounded rect bar
    canvasCtx.beginPath();
    canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
    canvasCtx.fill();
  }

  animationFrameId = requestAnimationFrame(drawVisualizer);
}

// Start Recording Action
async function startRecording() {
  audioChunks = [];
  recordDuration = 0;
  recordingTimer.textContent = '00:00';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Tarayıcınız mikrofon erişimini desteklemiyor veya SSL/Localhost bağlantısı kullanmıyorsunuz.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamInstance = stream;
    
    // Set up Web Audio API for visualizer
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128; // lower fft size for clean bar counts
    
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // Initialize Media Recorder
    const mimeType = getSupportedMimeType();
    const options = mimeType ? { mimeType } : {};
    
    mediaRecorder = new MediaRecorder(stream, options);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
      audioUrl = URL.createObjectURL(audioBlob);
      audioPlayback.src = audioUrl;
      
      // Cleanup Web Audio elements
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close();
      }
      cancelAnimationFrame(animationFrameId);
      
      // Stop all tracks in the stream to turn off mic light
      if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
      }

      // Automatically populate player duration after metadata loads
      audioPlayback.onloadedmetadata = () => {
        playerDuration.textContent = formatTime(audioPlayback.duration);
        playerTimelineProgress.style.width = '0%';
        playerCurrentTime.textContent = '00:00';
      };

      changeState(statePreview);
    };

    // Begin recording
    mediaRecorder.start(1000); // chunk every second
    changeState(stateRecording);
    
    // Run real-time visualizer canvas
    drawVisualizer();

    // Start timer interval
    recordInterval = setInterval(() => {
      recordDuration++;
      recordingTimer.textContent = formatTime(recordDuration);
      
      // Max recording length: 3 minutes (180s)
      if (recordDuration >= 180) {
        stopRecording();
        showError('Maksimum 3 dakikalık kayıt süresine ulaşıldı.');
      }
    }, 1000);

  } catch (err) {
    console.error('Mikrofon erişim hatası:', err);
    showError('Mikrofon izni reddedildi veya cihaz bulunamadı.');
  }
}

// Stop and Save Recording
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  clearInterval(recordInterval);
}

// Cancel and Discard Recording
function cancelRecording() {
  // Stop recording process
  clearInterval(recordInterval);
  cancelAnimationFrame(animationFrameId);
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    // Override onstop so it doesn't trigger state transition
    mediaRecorder.onstop = () => {
      if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
      }
    };
    mediaRecorder.stop();
  } else if (streamInstance) {
    streamInstance.getTracks().forEach(track => track.stop());
  }

  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close();
  }

  // Cleanup variables
  audioChunks = [];
  audioBlob = null;
  
  changeState(stateIdle);
}

// Custom Player Functionality
function togglePlayPause() {
  if (audioPlayback.paused) {
    audioPlayback.play();
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    audioPlayback.pause();
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
}

// Update Timeline Progress
audioPlayback.addEventListener('timeupdate', () => {
  if (audioPlayback.duration) {
    const progress = (audioPlayback.currentTime / audioPlayback.duration) * 100;
    playerTimelineProgress.style.width = `${progress}%`;
    playerCurrentTime.textContent = formatTime(audioPlayback.currentTime);
  }
});

// Audio Playback Ends
audioPlayback.addEventListener('ended', () => {
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  playerTimelineProgress.style.width = '0%';
  playerCurrentTime.textContent = '00:00';
});

// Click Timeline to Seek
playerTimelineBar.addEventListener('click', (e) => {
  if (!audioPlayback.duration) return;
  const barWidth = playerTimelineBar.clientWidth;
  const clickX = e.offsetX;
  const seekTime = (clickX / barWidth) * audioPlayback.duration;
  audioPlayback.currentTime = seekTime;
});

// Send Voice Note to server
async function sendVoiceNote() {
  const senderName = senderNameInput.value.trim();
  
  if (!senderName) {
    showError('Lütfen sesli notu kimin gönderdiğini belirtmek için adınızı yazın.');
    senderNameInput.focus();
    return;
  }

  if (!audioBlob) {
    showError('Kayıtlı ses dosyası bulunamadı. Lütfen tekrar kaydedin.');
    changeState(stateIdle);
    return;
  }

  changeState(stateSending);

  const formData = new FormData();
  formData.append('senderName', senderName);
  
  // Choose standard file extension
  let ext = 'webm';
  if (audioBlob.type.includes('mp4')) ext = 'mp4';
  else if (audioBlob.type.includes('wav')) ext = 'wav';
  else if (audioBlob.type.includes('ogg')) ext = 'ogg';
  
  formData.append('audio', audioBlob, `${senderName}_audio.${ext}`);

  try {
    const response = await fetch('/api/send-voice-note', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok && result.success) {
      changeState(stateSuccess);
    } else {
      showError(result.error || 'Ses kaydı gönderilemedi. Lütfen tekrar deneyin.');
      changeState(statePreview);
    }
  } catch (error) {
    console.error('Gönderim hatası:', error);
    showError('Bağlantı hatası oluştu. Lütfen sunucunun açık olduğundan emin olun.');
    changeState(statePreview);
  }
}

// Reset recorder to initial state
function resetRecorder() {
  audioChunks = [];
  audioBlob = null;
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  audioPlayback.src = '';
  senderNameInput.value = '';
  changeState(stateIdle);
}

// Event Listeners
btnStartRecord.addEventListener('click', startRecording);
btnCancelRecord.addEventListener('click', cancelRecording);
btnStopRecord.addEventListener('click', stopRecording);
btnReRecord.addEventListener('click', cancelRecording);
btnPlayPause.addEventListener('click', togglePlayPause);
btnSendRecord.addEventListener('click', sendVoiceNote);
btnRestart.addEventListener('click', resetRecorder);

// Input Validation Highlight
senderNameInput.addEventListener('input', () => {
  if (senderNameInput.value.trim()) {
    senderNameInput.style.borderColor = 'rgba(212, 163, 115, 0.25)';
  }
});
