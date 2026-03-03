const socket = io();
let userId = null;
let username = '';
let balance = 0;
let gameActive = false;
let currentMultiplier = 1.00;
let hasBet = false;
let hasCashedOut = false;

// DOM Elements
const balanceEl = document.getElementById('balance');
const multiplierEl = document.getElementById('multiplier');
const gameStatusEl = document.getElementById('gameStatus');
const usernameInput = document.getElementById('username');
const registerBtn = document.getElementById('registerBtn');
const placeBetBtn = document.getElementById('placeBetBtn');
const cashoutBtn = document.getElementById('cashoutBtn');
const betAmountInput = document.getElementById('betAmount');
const activeBetsList = document.getElementById('activeBetsList');
const historyList = document.getElementById('historyList');

// Register user
registerBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (username) {
        socket.emit('register', { username });
    } else {
        alert('Please enter a username');
    }
});

// Place bet
placeBetBtn.addEventListener('click', () => {
    if (!userId) {
        alert('Please register first');
        return;
    }
    
    const amount = parseInt(betAmountInput.value);
    if (amount > 0 && amount <= balance) {
        socket.emit('placeBet', { userId, amount });
    } else {
        alert('Invalid bet amount or insufficient balance');
    }
});

// Cashout
cashoutBtn.addEventListener('click', () => {
    if (userId && hasBet && !hasCashedOut && gameActive) {
        socket.emit('cashout', { userId });
    }
});

// Socket event handlers
socket.on('userData', (data) => {
    userId = data.userId;
    username = data.username;
    balance = data.balance;
    updateBalance();
    usernameInput.value = data.username;
    usernameInput.disabled = true;
    registerBtn.disabled = true;
    loadHistory();
    gameStatusEl.textContent = 'Connected! Waiting for game...';
});

socket.on('gameState', (data) => {
    gameActive = data.active;
    currentMultiplier = data.multiplier;
    multiplierEl.textContent = currentMultiplier.toFixed(2) + 'x';
    
    if (gameActive) {
        gameStatusEl.textContent = 'Game in progress';
        updateBetButtons();
    } else {
        gameStatusEl.textContent = 'Game crashed! Next round starting...';
    }
});

socket.on('gameStarted', (data) => {
    gameActive = true;
    hasBet = false;
    hasCashedOut = false;
    currentMultiplier = data.multiplier;
    multiplierEl.textContent = currentMultiplier.toFixed(2) + 'x';
    multiplierEl.classList.remove('crash');
    gameStatusEl.textContent = 'Game started! Place your bets!';
    updateBetButtons();
    activeBetsList.innerHTML = 'No active bets';
});

socket.on('multiplierUpdate', (data) => {
    currentMultiplier = data.multiplier;
    multiplierEl.textContent = currentMultiplier.toFixed(2) + 'x';
    
    // Update multiplier color
    if (currentMultiplier > 5) {
        multiplierEl.style.color = '#f56565';
    } else if (currentMultiplier > 2) {
        multiplierEl.style.color = '#ffd700';
    } else {
        multiplierEl.style.color = '#ffd700';
    }
});

socket.on('gameCrashed', (data) => {
    gameActive = false;
    multiplierEl.classList.add('crash');
    gameStatusEl.textContent = `Game crashed at ${data.multiplier}x!`;
    updateBetButtons();
    loadHistory();
});

socket.on('betPlaced', (data) => {
    balance = data.newBalance;
    hasBet = true;
    updateBalance();
    updateBetButtons();
    
    // Add to active bets
    activeBetsList.innerHTML = `
        <div class="bet-item">
            <span>Your bet: $${data.amount}</span>
            <span class="multiplier">${currentMultiplier.toFixed(2)}x</span>
        </div>
    `;
});

socket.on('betResult', (data) => {
    balance = data.newBalance;
    hasBet = false;
    hasCashedOut = data.result === 'win';
    updateBalance();
    updateBetButtons();
    loadHistory();
    
    // Show result notification
    if (data.result === 'win') {
        gameStatusEl.textContent = `🎉 You won $${data.profit.toFixed(2)}!`;
        activeBetsList.innerHTML = `
            <div class="bet-item win">
                <span>Won: $${data.profit.toFixed(2)} at ${data.multiplier}x</span>
            </div>
        `;
    } else {
        gameStatusEl.textContent = `💥 You lost $${data.betAmount}!`;
        activeBetsList.innerHTML = `
            <div class="bet-item loss">
                <span>Lost: $${data.betAmount} at ${data.multiplier}x</span>
            </div>
        `;
    }
});

socket.on('error', (data) => {
    alert('Error: ' + data.message);
});

// Helper functions
function updateBalance() {
    balanceEl.textContent = balance.toFixed(2);
}

function updateBetButtons() {
    placeBetBtn.disabled = !gameActive || hasBet || !userId;
    cashoutBtn.disabled = !gameActive || !hasBet || hasCashedOut || !userId;
}

async function loadHistory() {
    if (!userId) return;
    
    try {
        const response = await fetch(`/api/history/${userId}`);
        const history = await response.json();
        
        if (history.length === 0) {
            historyList.innerHTML = 'No game history yet';
            return;
        }
        
        historyList.innerHTML = history.map(item => `
            <div class="history-item">
                <span class="amount">$${item.betAmount}</span>
                <span class="multiplier">${item.cashoutMultiplier || item.crashedAt}x</span>
                <span class="profit ${item.profit >= 0 ? 'positive' : 'negative'}">
                    ${item.profit >= 0 ? '+' : ''}$${item.profit.toFixed(2)}
                </span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

// Enter key to register
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        registerBtn.click();
    }
});

// Auto register with default username on page load
setTimeout(() => {
    if (!userId) {
        registerBtn.click();
    }
}, 1000);
