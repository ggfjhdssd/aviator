const socket = io();
let username = 'User' + Math.floor(Math.random() * 10000);
let balance = 5000;
let gameActive = false;
let gameStatus = 'waiting';
let currentMultiplier = 1.00;
let timeRemaining = 5;
let hasBet = false;
let hasCashedOut = false;
let betAmount = 200;

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let planeY = 200;
let planeX = 100;

// DOM Elements
const balanceEl = document.getElementById('balance');
const multiplierEl = document.getElementById('multiplier');
const gameStatusEl = document.getElementById('gameStatus');
const playersEl = document.getElementById('players');
const totalBetsEl = document.getElementById('totalBets');
const totalWinningsEl = document.getElementById('totalWinnings');
const placeBetBtn = document.getElementById('placeBetBtn');
const cashoutBtn = document.getElementById('cashoutBtn');
const betAmountInput = document.getElementById('betAmount');
const historyTable = document.getElementById('historyTable');
const presetBtns = document.querySelectorAll('.preset-btn');
const autoBetCheckbox = document.getElementById('autoBet');

// Register user
socket.emit('register', { username });

// Preset bet buttons
presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const amount = parseInt(btn.dataset.amount);
        betAmountInput.value = amount;
        betAmount = amount;
        
        // Remove active class from all buttons
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Bet amount input
betAmountInput.addEventListener('change', (e) => {
    betAmount = parseInt(e.target.value) || 200;
    if (betAmount < 200) betAmount = 200;
    if (betAmount > 80000) betAmount = 80000;
    betAmountInput.value = betAmount;
});

// Place bet
placeBetBtn.addEventListener('click', () => {
    if (gameStatus === 'waiting' && !hasBet && balance >= betAmount) {
        socket.emit('placeBet', { username, amount: betAmount });
    }
});

// Cashout
cashoutBtn.addEventListener('click', () => {
    if (gameStatus === 'flying' && hasBet && !hasCashedOut) {
        socket.emit('cashout', { username });
    }
});

// Socket event handlers
socket.on('userData', (data) => {
    username = data.username;
    balance = data.balance;
    updateBalance();
});

socket.on('gameState', (data) => {
    gameStatus = data.status;
    currentMultiplier = data.multiplier;
    timeRemaining = data.timeRemaining;
    
    multiplierEl.textContent = currentMultiplier.toFixed(2) + 'x';
    updateGameStatus();
    updateButtons();
});

socket.on('waitingStatus', (data) => {
    gameStatus = 'waiting';
    timeRemaining = data.timeRemaining;
    gameStatusEl.textContent = `Next round in ${timeRemaining}s...`;
    updateButtons();
    
    // Reset for next round
    if (timeRemaining === 5) {
        hasBet = false;
        hasCashedOut = false;
        planeY = 200;
    }
});

socket.on('gameStarted', (data) => {
    gameStatus = 'flying';
    currentMultiplier = data.multiplier;
    multiplierEl.textContent = currentMultiplier.toFixed(2) + 'x';
    gameStatusEl.textContent = 'Game in progress...';
    updateButtons();
});

socket.on('multiplierUpdate', (data) => {
    currentMultiplier = data.multiplier;
    multiplierEl.textContent = currentMultiplier.toFixed(2) + 'x';
    
    // Update plane position for animation
    planeY = Math.max(50, 200 - (currentMultiplier * 30));
    planeX = 100 + (currentMultiplier * 20);
});

socket.on('gameCrashed', (data) => {
    gameStatus = 'crashed';
    gameStatusEl.textContent = `Crashed at ${data.multiplier}x!`;
    updateButtons();
    addToHistory('💥', '***', data.multiplier.toFixed(2) + 'x', '0', '0');
});

socket.on('statsUpdate', (data) => {
    playersEl.textContent = data.players;
    totalBetsEl.textContent = formatNumber(data.totalBets);
    totalWinningsEl.textContent = formatNumber(data.totalWinnings);
});

socket.on('betPlaced', (data) => {
    balance = data.newBalance;
    hasBet = true;
    updateBalance();
    updateButtons();
    
    addToHistory('👤', username, '1.00x', formatNumber(data.amount), '0');
});

socket.on('betResult', (data) => {
    balance = data.newBalance;
    
    if (data.result === 'win') {
        hasCashedOut = true;
        gameStatusEl.textContent = `🎉 Won ${formatNumber(data.winnings)} XAF!`;
        addToHistory('👤', username, data.multiplier.toFixed(2) + 'x', 
                   formatNumber(data.betAmount), formatNumber(data.winnings));
    } else {
        gameStatusEl.textContent = `💥 Lost ${formatNumber(data.betAmount)} XAF!`;
        addToHistory('👤', username, data.multiplier.toFixed(2) + 'x', 
                   formatNumber(data.betAmount), '0');
    }
    
    updateBalance();
    updateButtons();
});

socket.on('error', (data) => {
    alert('Error: ' + data.message);
});

// Helper functions
function updateBalance() {
    balanceEl.textContent = formatNumber(balance);
}

function updateButtons() {
    placeBetBtn.disabled = gameStatus !== 'waiting' || hasBet || balance < betAmount;
    cashoutBtn.disabled = gameStatus !== 'flying' || !hasBet || hasCashedOut;
}

function updateGameStatus() {
    if (gameStatus === 'waiting') {
        gameStatusEl.textContent = `Next round in ${timeRemaining}s...`;
    } else if (gameStatus === 'flying') {
        gameStatusEl.textContent = 'Game in progress...';
    }
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function addToHistory(icon, username, odds, bet, win) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${icon} ${username}</td>
        <td>${odds}</td>
        <td>${bet} XAF</td>
        <td>${win} XAF</td>
    `;
    
    historyTable.insertBefore(row, historyTable.firstChild);
    
    // Keep only last 10 rows
    if (historyTable.children.length > 10) {
        historyTable.removeChild(historyTable.lastChild);
    }
}

// Animation loop
function animate() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#1a3247');
    gradient.addColorStop(1, '#0f263b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Horizontal lines
    for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.stroke();
    }
    
    // Vertical lines
    for (let i = 0; i < canvas.width; i += 100) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.stroke();
    }
    
    // Draw plane trail
    ctx.beginPath();
    ctx.moveTo(planeX - 50, planeY);
    ctx.lineTo(planeX - 30, planeY - 10);
    ctx.lineTo(planeX - 10, planeY - 5);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw plane
    ctx.fillStyle = '#ffd966';
    ctx.shadowColor = '#ffd966';
    ctx.shadowBlur = 20;
    
    // Plane body
    ctx.beginPath();
    ctx.moveTo(planeX, planeY);
    ctx.lineTo(planeX - 30, planeY - 15);
    ctx.lineTo(planeX - 20, planeY);
    ctx.lineTo(planeX - 30, planeY + 15);
    ctx.closePath();
    ctx.fill();
    
    // Plane window
    ctx.fillStyle = '#4ecdc4';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(planeX - 25, planeY, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    requestAnimationFrame(animate);
}

// Start animation
animate();

// Auto bet functionality
setInterval(() => {
    if (autoBetCheckbox.checked && gameStatus === 'waiting' && !hasBet && balance >= betAmount) {
        socket.emit('placeBet', { username, amount: betAmount });
    }
}, 1000);

// Add sample history data on load
window.addEventListener('load', () => {
    addToHistory('18******', '1.01x', '200', '0');
    addToHistory('57******', '3.02x', '300', '0');
    addToHistory('30******', '1.84x', '489', '0');
    addToHistory('52******', '4.04x', '458', '0');
    addToHistory('38******', '3.58x', '419', '0');
});
