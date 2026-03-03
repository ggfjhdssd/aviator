// Backend URL
const BACKEND_URL = 'https://aviator-80md.onrender.com';

// Socket Connection
const socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Canvas Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 400;

// Game State
const gameState = {
    isWaiting: true,
    isPlaying: false,
    currentMultiplier: 1.00,
    gameId: null,
    waitingTime: 0,
    balance: 1000,
    userId: 'user123',
    hasBet: false,
    currentBet: 0
};

// Plane Object
const plane = {
    x: 100,
    y: 200,
    width: 60,
    height: 40,
    rotation: 0,
    trail: []
};

// DOM Elements
const elements = {
    gameId: document.getElementById('gameId'),
    gameStatus: document.getElementById('gameStatus'),
    balance: document.getElementById('balance'),
    multiplierDisplay: document.getElementById('multiplierDisplay'),
    waitingDisplay: document.getElementById('waitingDisplay'),
    waitingTime: document.getElementById('waitingTime'),
    crashDisplay: document.getElementById('crashDisplay'),
    placeBetBtn: document.getElementById('placeBetBtn'),
    cashoutBtn: document.getElementById('cashoutBtn'),
    userId: document.getElementById('userId'),
    betAmount: document.getElementById('betAmount'),
    historyList: document.getElementById('historyList')
};

// Socket Events
socket.on('connect', () => {
    console.log('✅ Connected to server');
    elements.gameStatus.textContent = 'ချိတ်ဆက်ပြီး';
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
    elements.gameStatus.textContent = 'ချိတ်ဆက်မှုပြတ်';
});

socket.on('waiting', (data) => {
    gameState.isWaiting = true;
    gameState.isPlaying = false;
    gameState.gameId = data.gameId;
    gameState.waitingTime = data.waitingTime;
    gameState.hasBet = false;
    
    elements.gameId.textContent = gameState.gameId;
    elements.gameStatus.textContent = 'စောင့်ဆိုင်း';
    elements.waitingDisplay.style.display = 'block';
    elements.waitingTime.textContent = gameState.waitingTime;
    elements.crashDisplay.style.display = 'none';
    
    resetPlane();
    updateButtons();
});

socket.on('waitingUpdate', (data) => {
    gameState.waitingTime = data.remainingTime;
    elements.waitingTime.textContent = gameState.waitingTime;
});

socket.on('gameStarted', (data) => {
    gameState.isWaiting = false;
    gameState.isPlaying = true;
    gameState.gameId = data.gameId;
    gameState.currentMultiplier = data.initialMultiplier;
    
    elements.gameStatus.textContent = 'ဂိမ်းစတင်';
    elements.waitingDisplay.style.display = 'none';
    elements.crashDisplay.style.display = 'none';
    
    resetPlane();
    updateButtons();
});

socket.on('multiplierUpdate', (data) => {
    if (gameState.isPlaying) {
        gameState.currentMultiplier = data.multiplier;
        elements.multiplierDisplay.textContent = gameState.currentMultiplier.toFixed(2) + 'x';
        updatePlanePosition();
    }
});

socket.on('gameCrashed', (data) => {
    gameState.isPlaying = false;
    gameState.isWaiting = false;
    gameState.hasBet = false;
    
    elements.gameStatus.textContent = 'ပေါက်ကွဲသည်';
    elements.crashDisplay.style.display = 'block';
    elements.multiplierDisplay.textContent = data.crashMultiplier.toFixed(2) + 'x';
    
    crashPlane();
    updateButtons();
    addHistory('loss', `Crash at ${data.crashMultiplier.toFixed(2)}x`);
});

socket.on('betPlaced', (data) => {
    gameState.hasBet = true;
    gameState.currentBet = data.betAmount;
    gameState.balance = data.remainingBalance;
    
    elements.balance.textContent = gameState.balance;
    updateButtons();
    addHistory('bet', `Bet $${data.betAmount}`);
});

socket.on('cashoutSuccess', (data) => {
    gameState.hasBet = false;
    gameState.balance = data.remainingBalance;
    
    elements.balance.textContent = gameState.balance;
    updateButtons();
    addHistory('win', `Win $${data.winAmount.toFixed(2)} at ${data.multiplier}x`);
});

socket.on('error', (data) => {
    alert(data.message);
});

// Canvas Functions
function resetPlane() {
    plane.x = 100;
    plane.y = 200;
    plane.rotation = 0;
    plane.trail = [];
    drawCanvas();
}

function updatePlanePosition() {
    const distance = (gameState.currentMultiplier - 1) * 200;
    
    plane.trail.push({ x: plane.x, y: plane.y });
    if (plane.trail.length > 20) plane.trail.shift();
    
    plane.x = 100 + distance;
    plane.y = 200 - Math.sin(gameState.currentMultiplier * 2) * 30;
    plane.rotation = Math.sin(gameState.currentMultiplier * 3) * 0.1;
    
    drawCanvas();
}

function crashPlane() {
    let frames = 0;
    const interval = setInterval(() => {
        if (frames < 20) {
            plane.y += 10;
            plane.rotation += 0.1;
            drawCanvas();
            frames++;
        } else {
            clearInterval(interval);
            resetPlane();
        }
    }, 50);
}

function drawPlane() {
    ctx.save();
    ctx.translate(plane.x, plane.y);
    ctx.rotate(plane.rotation);
    
    // Body
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(-plane.width/2, -plane.height/2, plane.width, plane.height);
    
    // Wings
    ctx.fillStyle = '#FFA500';
    ctx.fillRect(-plane.width/2 - 10, -plane.height/2 - 10, 20, 15);
    ctx.fillRect(-plane.width/2 - 10, plane.height/2 - 5, 20, 15);
    
    // Cockpit
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(plane.width/2 - 15, -10, 10, 20);
    
    // Light
    if (gameState.isPlaying) {
        ctx.fillStyle = Math.random() > 0.5 ? '#FF0000' : '#FFFF00';
        ctx.fillRect(-plane.width/2 - 5, -5, 5, 10);
    }
    
    ctx.restore();
}

function drawTrail() {
    for (let i = 0; i < plane.trail.length; i++) {
        const alpha = i / plane.trail.length;
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.3})`;
        ctx.beginPath();
        ctx.arc(plane.trail[i].x, plane.trail[i].y, 5 + i * 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawClouds() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    
    // Cloud 1
    ctx.beginPath();
    ctx.arc(200, 100, 30, 0, Math.PI * 2);
    ctx.arc(240, 90, 40, 0, Math.PI * 2);
    ctx.arc(280, 100, 30, 0, Math.PI * 2);
    ctx.fill();
    
    // Cloud 2
    ctx.beginPath();
    ctx.arc(600, 300, 40, 0, Math.PI * 2);
    ctx.arc(650, 290, 50, 0, Math.PI * 2);
    ctx.arc(700, 300, 40, 0, Math.PI * 2);
    ctx.fill();
}

function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1e3c72');
    gradient.addColorStop(1, '#2a5298');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Ground
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, canvas.height - 30, canvas.width, 30);
    ctx.fillStyle = '#34495e';
    ctx.fillRect(0, canvas.height - 40, canvas.width, 10);
    
    drawClouds();
    drawTrail();
    drawPlane();
    
    if (gameState.isPlaying) {
        requestAnimationFrame(drawCanvas);
    }
}

// UI Functions
function updateButtons() {
    if (gameState.isWaiting) {
        elements.placeBetBtn.disabled = false;
        elements.cashoutBtn.disabled = true;
    } else if (gameState.isPlaying) {
        elements.placeBetBtn.disabled = gameState.hasBet;
        elements.cashoutBtn.disabled = !gameState.hasBet;
    } else {
        elements.placeBetBtn.disabled = true;
        elements.cashoutBtn.disabled = true;
    }
}

function addHistory(type, text) {
    const item = document.createElement('div');
    item.className = `history-item ${type === 'loss' ? 'loss' : 'win'}`;
    
    const time = new Date().toLocaleTimeString();
    
    item.innerHTML = `
        <span>${gameState.gameId}</span>
        <span>${time}</span>
        <span>${text}</span>
    `;
    
    elements.historyList.insertBefore(item, elements.historyList.firstChild);
    
    while (elements.historyList.children.length > 20) {
        elements.historyList.removeChild(elements.historyList.lastChild);
    }
}

// Event Listeners
elements.placeBetBtn.addEventListener('click', () => {
    const userId = elements.userId.value.trim();
    const betAmount = parseInt(elements.betAmount.value);
    
    if (!userId) {
        alert('ကျေးဇူးပြု၍ User ID ထည့်ပါ');
        return;
    }
    
    if (betAmount < 10) {
        alert('လောင်းကြေးအနည်းဆုံး ၁၀ ဖြစ်ရပါမည်');
        return;
    }
    
    if (betAmount > gameState.balance) {
        alert('လက်ကျန်ငွေ မလုံလောက်ပါ');
        return;
    }
    
    gameState.userId = userId;
    socket.emit('placeBet', { userId, betAmount });
});

elements.cashoutBtn.addEventListener('click', () => {
    socket.emit('cashout', { userId: gameState.userId });
});

// Start Animation
drawCanvas();
