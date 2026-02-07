const controls = {
  chime: document.getElementById("chime"),
  silence: document.getElementById("silence"),
  schumann: document.getElementById("schumann"),
  hum: document.getElementById("hum"),
  schumannEnabled: document.getElementById("schumann-enabled"),
  humEnabled: document.getElementById("hum-enabled"),
};

const generateButton = document.getElementById("generate");
const startButton = document.getElementById("start");
const pauseButton = document.getElementById("pause");
const resetButton = document.getElementById("reset");
const shareBox = document.querySelector(".share");
const shareLink = document.getElementById("share-link");
const copyButton = document.getElementById("copy");
const timeline = document.getElementById("timeline");
const currentPhase = document.getElementById("current-phase");
const remaining = document.getElementById("remaining");
const matchStatus = document.getElementById("match-status");
const emailInput = document.getElementById("email");
const saveEmail = document.getElementById("save-email");
const emailStatus = document.getElementById("email-status");

const valueElements = document.querySelectorAll(".value");
const nestedControls = document.querySelectorAll(".nested");

const state = {
  phases: [],
  currentIndex: 0,
  remainingMs: 0,
  timerId: null,
  paused: false,
  audioContext: null,
  audioNodes: [],
};

const SCHUMANN_BASE = 7.83;
const SCHUMANN_HARMONIC = 8;
const SCHUMANN_FREQUENCY = SCHUMANN_BASE * SCHUMANN_HARMONIC;

function formatSeconds(value) {
  return `${value}s`;
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateValue(element) {
  const target = element.dataset.for;
  const control = document.getElementById(target);
  if (control) {
    element.textContent = formatSeconds(control.value);
  }
}

valueElements.forEach((element) => updateValue(element));

Object.values(controls).forEach((control) => {
  if (control && control.type === "range") {
    control.addEventListener("input", () => {
      const valueElement = document.querySelector(`.value[data-for='${control.id}']`);
      if (valueElement) {
        valueElement.textContent = formatSeconds(control.value);
      }
    });
  }
});

function updateNested() {
  nestedControls.forEach((control) => {
    const parentId = control.dataset.parent;
    const parent = document.getElementById(parentId);
    if (parent) {
      control.style.opacity = parent.checked ? "1" : "0.5";
      control.querySelectorAll("input").forEach((input) => {
        input.disabled = !parent.checked;
      });
    }
  });
}

controls.schumannEnabled.addEventListener("change", updateNested);
controls.humEnabled.addEventListener("change", updateNested);
updateNested();

function getOrder() {
  const selected = document.querySelector("input[name='order']:checked");
  return selected ? selected.value : "schumann-then-hum";
}

function buildPhases() {
  const phases = [
    {
      id: "chime",
      label: "Singing bowl chime",
      duration: Number(controls.chime.value),
    },
    {
      id: "silence",
      label: "Silence",
      duration: Number(controls.silence.value),
    },
  ];

  const optional = [];
  if (controls.schumannEnabled.checked) {
    optional.push({
      id: "schumann",
      label: `Schumann tone (${SCHUMANN_FREQUENCY.toFixed(2)} Hz)`,
      duration: Number(controls.schumann.value),
    });
  }
  if (controls.humEnabled.checked) {
    optional.push({
      id: "hum",
      label: "Hum together",
      duration: Number(controls.hum.value),
    });
  }

  if (optional.length) {
    const order = getOrder();
    if (order === "hum-then-schumann") {
      optional.reverse();
    }
    phases.push(...optional);
  }

  phases.push({
    id: "speak",
    label: "Begin speaking (open-ended)",
    duration: 0,
  });

  return phases;
}

function renderTimeline(phases) {
  timeline.innerHTML = "";
  phases.forEach((phase, index) => {
    const row = document.createElement("div");
    row.className = "phase";
    if (index === state.currentIndex) {
      row.classList.add("active");
    }
    const name = document.createElement("span");
    name.textContent = phase.label;
    const duration = document.createElement("span");
    duration.textContent = phase.duration ? formatSeconds(phase.duration) : "∞";
    row.append(name, duration);
    timeline.appendChild(row);
  });
}

function stopAudio() {
  state.audioNodes.forEach((node) => {
    try {
      node.stop();
    } catch (error) {
      // ignore already stopped nodes
    }
  });
  state.audioNodes = [];
}

function ensureAudioContext() {
  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioContext.state === "suspended") {
    state.audioContext.resume();
  }
}

function playChime(durationSeconds) {
  ensureAudioContext();
  const now = state.audioContext.currentTime;
  const gains = [];
  const frequencies = [220, 330, 440, 660];

  frequencies.forEach((frequency) => {
    const oscillator = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.6, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

    oscillator.connect(gain).connect(state.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + durationSeconds);
    state.audioNodes.push(oscillator);
    gains.push(gain);
  });
}

function playTone(durationSeconds, frequency) {
  ensureAudioContext();
  const now = state.audioContext.currentTime;
  const oscillator = state.audioContext.createOscillator();
  const gain = state.audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.5);
  gain.gain.linearRampToValueAtTime(0.001, now + durationSeconds);
  oscillator.connect(gain).connect(state.audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + durationSeconds);
  state.audioNodes.push(oscillator);
}

function startPhase(index) {
  const phase = state.phases[index];
  if (!phase) {
    currentPhase.textContent = "Complete";
    remaining.textContent = "00:00";
    pauseButton.disabled = true;
    resetButton.disabled = false;
    return;
  }

  document.querySelectorAll(".phase").forEach((row, rowIndex) => {
    row.classList.toggle("active", rowIndex === index);
  });

  currentPhase.textContent = phase.label;
  state.remainingMs = phase.duration * 1000;

  if (phase.id === "chime") {
    playChime(phase.duration);
  }
  if (phase.id === "schumann") {
    playTone(phase.duration, SCHUMANN_FREQUENCY);
  }

  if (phase.duration === 0) {
    remaining.textContent = "∞";
    pauseButton.disabled = true;
    resetButton.disabled = false;
    stopAudio();
    return;
  }

  remaining.textContent = formatTime(state.remainingMs);
  pauseButton.disabled = false;
  resetButton.disabled = false;

  state.timerId = window.setInterval(() => {
    if (!state.paused) {
      state.remainingMs -= 1000;
      remaining.textContent = formatTime(state.remainingMs);
      if (state.remainingMs <= 0) {
        window.clearInterval(state.timerId);
        stopAudio();
        state.currentIndex += 1;
        startPhase(state.currentIndex);
      }
    }
  }, 1000);
}

function startRitual() {
  state.phases = buildPhases();
  state.currentIndex = 0;
  state.paused = false;
  if (state.timerId) {
    window.clearInterval(state.timerId);
  }
  stopAudio();
  renderTimeline(state.phases);
  startPhase(0);
}

function resetRitual() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
  }
  stopAudio();
  state.phases = buildPhases();
  state.currentIndex = 0;
  state.remainingMs = 0;
  state.paused = false;
  currentPhase.textContent = "Ready";
  remaining.textContent = "00:00";
  renderTimeline(state.phases);
  pauseButton.textContent = "Pause";
  pauseButton.disabled = true;
  resetButton.disabled = true;
}

function togglePause() {
  state.paused = !state.paused;
  pauseButton.textContent = state.paused ? "Resume" : "Pause";
}

function updateShare() {
  const params = new URLSearchParams({
    chime: controls.chime.value,
    silence: controls.silence.value,
    schumann: controls.schumann.value,
    hum: controls.hum.value,
    schumannEnabled: controls.schumannEnabled.checked ? "1" : "0",
    humEnabled: controls.humEnabled.checked ? "1" : "0",
    order: getOrder(),
  });
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  shareLink.value = url;
  shareBox.hidden = false;
  matchStatus.textContent = "Share to match on the same timing.";
}

function applyParams() {
  const params = new URLSearchParams(window.location.search);
  if (!params.size) {
    renderTimeline(buildPhases());
    return;
  }

  ["chime", "silence", "schumann", "hum"].forEach((key) => {
    const value = params.get(key);
    if (value && controls[key]) {
      controls[key].value = value;
      const valueElement = document.querySelector(`.value[data-for='${key}']`);
      if (valueElement) {
        valueElement.textContent = formatSeconds(value);
      }
    }
  });

  const schumannEnabled = params.get("schumannEnabled");
  const humEnabled = params.get("humEnabled");
  if (schumannEnabled !== null) {
    controls.schumannEnabled.checked = schumannEnabled === "1";
  }
  if (humEnabled !== null) {
    controls.humEnabled.checked = humEnabled === "1";
  }
  const order = params.get("order");
  if (order) {
    const radio = document.querySelector(`input[name='order'][value='${order}']`);
    if (radio) {
      radio.checked = true;
    }
  }

  updateNested();
  renderTimeline(buildPhases());
  shareBox.hidden = false;
  matchStatus.textContent = "Match found — you are aligned on timing.";
}

function copyLink() {
  navigator.clipboard.writeText(shareLink.value);
  copyButton.textContent = "Copied";
  window.setTimeout(() => {
    copyButton.textContent = "Copy";
  }, 1500);
}

function saveEmailAddress() {
  const email = emailInput.value.trim();
  if (!email) {
    emailStatus.textContent = "Please enter an email.";
    return;
  }
  localStorage.setItem("half-circle-email", email);
  emailStatus.textContent = "Saved locally. We'll only use this when you share it.";
}

const storedEmail = localStorage.getItem("half-circle-email");
if (storedEmail) {
  emailInput.value = storedEmail;
}

renderTimeline(buildPhases());

controls.chime.addEventListener("input", () => renderTimeline(buildPhases()));
controls.silence.addEventListener("input", () => renderTimeline(buildPhases()));
controls.schumann.addEventListener("input", () => renderTimeline(buildPhases()));
controls.hum.addEventListener("input", () => renderTimeline(buildPhases()));
controls.schumannEnabled.addEventListener("change", () => renderTimeline(buildPhases()));
controls.humEnabled.addEventListener("change", () => renderTimeline(buildPhases()));

document.querySelectorAll("input[name='order']").forEach((input) => {
  input.addEventListener("change", () => renderTimeline(buildPhases()));
});

generateButton.addEventListener("click", updateShare);
copyButton.addEventListener("click", copyLink);
startButton.addEventListener("click", startRitual);
pauseButton.addEventListener("click", togglePause);
resetButton.addEventListener("click", resetRitual);
saveEmail.addEventListener("click", saveEmailAddress);

applyParams();
