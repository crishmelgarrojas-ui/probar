const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos de la interfaz
const scoreDisplay = document.getElementById('scoreDisplay');
const highScoreDisplay = document.getElementById('highScoreDisplay');
const levelDisplay = document.getElementById('levelDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreEl = document.getElementById('finalScore');
const finalBestEl = document.getElementById('finalBest');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

// Cargar la imagen oficial logo.webp para dibujarla en el Canvas
const logoImg = new Image();
logoImg.src = 'img/logo.webp';
let logoLoaded = false;
logoImg.onload = () => {
  logoLoaded = true;
};

// Configuración del estado del juego
let score = 0;
let highScore = Number(localStorage.getItem('iestp_high_score')) || 0;
let level = 1;
let lives = 3;
let isRunning = false;
let animationId = null;
let lastSpawnTime = 0;

highScoreDisplay.textContent = highScore;

// Jugador (Plataforma recolectora con el escudo del IESTP)
const player = {
  x: canvas.width / 2 - 55,
  y: canvas.height - 95,
  width: 110,
  height: 75,
  speed: 8,
  dx: 0
};

let items = [];
let particles = [];
const keys = { left: false, right: false };

// Tipos de objetos que caen (Herramientas del logo vs Peligros)
const itemTypes = [
  { icon: '⚛️', points: 15, type: 'good', label: 'Ciencia' },
  { icon: '💻', points: 20, type: 'good', label: 'Sistemas' },
  { icon: '🔧', points: 15, type: 'good', label: 'Mecánica' },
  { icon: '📘', points: 10, type: 'good', label: 'Estudio' },
  { icon: '⛑️', points: 25, type: 'good', label: 'Seguridad' },
  { icon: '⚡', points: 0,  type: 'bad',  label: 'Sobrecarga' },
  { icon: '🔥', points: 0,  type: 'bad',  label: 'Cortocircuito' }
];

// Sonidos sintetizados sin archivos externos
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTone(freq, type = 'sine', duration = 0.12) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// Controles de Teclado
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = true;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = true;
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = false;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = false;
});

// Controles de Ratón y Pantalla Táctil
function movePlayerToPointer(clientX) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const canvasX = (clientX - rect.left) * scaleX;
  player.x = Math.max(0, Math.min(canvas.width - player.width, canvasX - player.width / 2));
}

canvas.addEventListener('mousemove', (e) => {
  if (isRunning) movePlayerToPointer(e.clientX);
});

canvas.addEventListener('touchmove', (e) => {
  if (isRunning && e.touches.length > 0) {
    e.preventDefault();
    movePlayerToPointer(e.touches[0].clientX);
  }
}, { passive: false });

// Generar partículas al atrapar o chocar
function createParticles(x, y, color) {
  for (let i = 0; i < 14; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      alpha: 1,
      color
    });
  }
}

// Crear nuevo ítem que cae
function spawnItem() {
  const isBadChance = Math.min(0.42, 0.22 + level * 0.03);
  const pool = Math.random() < isBadChance
    ? itemTypes.filter(i => i.type === 'bad')
    : itemTypes.filter(i => i.type === 'good');

  const chosen = pool[Math.floor(Math.random() * pool.length)];
  const radius = 22;

  items.push({
    x: radius + Math.random() * (canvas.width - radius * 2),
    y: -30,
    radius,
    speed: 3 + Math.random() * 2 + (level * 0.45),
    ...chosen
  });
}

// Dibujar fondo técnico con cuadrícula y marca de agua del logo
function drawBackground() {
  ctx.fillStyle = '#090e1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Cuadrícula estilo plano de ingeniería
  ctx.strokeStyle = 'rgba(0, 40, 104, 0.35)';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Marca de agua sutil con logo.webp en el centro del tablero
  if (logoLoaded) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    const wmSize = 260;
    ctx.drawImage(
      logoImg,
      canvas.width / 2 - wmSize / 2,
      canvas.height / 2 - wmSize / 2,
      wmSize,
      wmSize
    );
    ctx.restore();
  }
}

// Dibujar al jugador con el escudo logo.webp integrado
function drawPlayer() {
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;

  // Base energética de captura
  ctx.fillStyle = '#002868';
  ctx.strokeStyle = '#F4C430';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(player.x, player.y + 28, player.width, 26, 12);
  ctx.fill();
  ctx.stroke();

  // Escudo circular blanco con el logo.webp en el centro
  const shieldRadius = 34;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, shieldRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#C8102E';
  ctx.stroke();
  ctx.clip();

  if (logoLoaded) {
    ctx.drawImage(
      logoImg,
      centerX - shieldRadius + 3,
      centerY - shieldRadius + 3,
      (shieldRadius - 3) * 2,
      (shieldRadius - 3) * 2
    );
  }
  ctx.restore();
}

// Actualizar HUD superior
function updateHUD() {
  scoreDisplay.textContent = score;
  level = Math.floor(score / 100) + 1;
  levelDisplay.textContent = level;
  livesDisplay.textContent = '❤️'.repeat(Math.max(0, lives));

  if (score > highScore) {
    highScore = score;
    highScoreDisplay.textContent = highScore;
    localStorage.setItem('iestp_high_score', highScore);
  }
}

// Bucle principal del juego
function gameLoop(timestamp) {
  if (!isRunning) return;

  drawBackground();

  // Movimiento horizontal por teclado
  if (keys.left) player.x -= player.speed;
  if (keys.right) player.x += player.speed;
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

  // Generación periódica de ítems
  const spawnInterval = Math.max(420, 1050 - level * 75);
  if (timestamp - lastSpawnTime > spawnInterval) {
    spawnItem();
    lastSpawnTime = timestamp;
  }

  // Actualizar y dibujar ítems
  ctx.font = '28px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    item.y += item.speed;

    // Aura circular del ítem
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    ctx.fillStyle = item.type === 'good'
      ? 'rgba(0, 40, 104, 0.75)'
      : 'rgba(200, 16, 46, 0.75)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = item.type === 'good' ? '#F4C430' : '#ff6b6b';
    ctx.stroke();

    // Ícono
    ctx.fillText(item.icon, item.x, item.y + 2);

    // Detección de colisión con el jugador
    const hitX = item.x + item.radius > player.x && item.x - item.radius < player.x + player.width;
    const hitY = item.y + item.radius > player.y && item.y - item.radius < player.y + player.height;

    if (hitX && hitY) {
      if (item.type === 'good') {
        score += item.points;
        playTone(580, 'triangle', 0.1);
        createParticles(item.x, item.y, '#F4C430');
      } else {
        lives--;
        playTone(150, 'sawtooth', 0.25);
        createParticles(item.x, item.y, '#C8102E');
      }
      updateHUD();
      items.splice(i, 1);

      if (lives <= 0) {
        endGame();
        return;
      }
      continue;
    }

    // Eliminar si sale por la parte inferior
    if (item.y - item.radius > canvas.height) {
      items.splice(i, 1);
    }
  }

  // Actualizar y dibujar partículas
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.035;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPlayer();
  animationId = requestAnimationFrame(gameLoop);
}

function startGame() {
  score = 0;
  level = 1;
  lives = 3;
  items = [];
  particles = [];
  player.x = canvas.width / 2 - player.width / 2;
  updateHUD();

  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  isRunning = true;
  lastSpawnTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
  isRunning = false;
  cancelAnimationFrame(animationId);
  finalScoreEl.textContent = score;
  finalBestEl.textContent = highScore;
  gameOverScreen.classList.remove('hidden');
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);