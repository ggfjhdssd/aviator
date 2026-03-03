const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aviator_game';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB Connected Successfully');
}).catch((err) => {
  console.error('❌ MongoDB Connection Error:', err);
});

const User = require('./models/User');

// Game State
let gameState = {
  status: 'waiting', // waiting, flying, crashed
  multiplier: 1.00,
  crashPoint: 1.00,
  timeRemaining: 5,
  players: 0,
  totalBets: 0,
  totalWinnings: 0,
  activeBets: new Map(), // username -> { amount, socketId }
  cashedOut: new Map() // username -> multiplier
};

// Stats update interval
let statsInterval = null;

// Generate random stats
function updateStats() {
  gameState.players = Math.floor(Math.random() * 50) + 10;
  gameState.totalBets = Math.floor(Math.random() * 1000000) + 500000;
  gameState.totalWinnings = Math.floor(Math.random() * 800000) + 200000;
  
  io.emit('statsUpdate', {
    players: gameState.players,
    totalBets: gameState.totalBets,
    totalWinnings: gameState.totalWinnings
  });
}

// Start stats updates
function startStatsUpdates() {
  if (statsInterval) clearInterval(statsInterval);
  statsInterval = setInterval(updateStats, 5000);
}

// Generate random crash point
function generateCrashPoint() {
  const random = Math.random();
  if (random < 0.3) return 1.01;
  if (random < 0.5) return Number((1 + Math.random() * 0.5).toFixed(2));
  if (random < 0.7) return Number((1.5 + Math.random() * 1).toFixed(2));
  if (random < 0.85) return Number((2.5 + Math.random() * 2).toFixed(2));
  return Number((4.5 + Math.random() * 5.5).toFixed(2));
}

// Game Loop
async function gameLoop() {
  while (true) {
    // Waiting state (5 seconds)
    gameState.status = 'waiting';
    gameState.multiplier = 1.00;
    gameState.timeRemaining = 5;
    gameState.activeBets.clear();
    gameState.cashedOut.clear();
    
    console.log('⏳ Waiting for bets...');
    io.emit('waitingStatus', { timeRemaining: gameState.timeRemaining });
    
    // Countdown
    while (gameState.timeRemaining > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      gameState.timeRemaining--;
      io.emit('waitingStatus', { timeRemaining: gameState.timeRemaining });
    }
    
    // Start flying
    gameState.status = 'flying';
    gameState.crashPoint = generateCrashPoint();
    gameState.multiplier = 1.00;
    
    console.log(`✈️ Game started. Crash point: ${gameState.crashPoint}x`);
    io.emit('gameStarted', { multiplier: gameState.multiplier });
    
    // Flying state
    let increment = 0.01;
    while (gameState.multiplier < gameState.crashPoint) {
      await new Promise(resolve => setTimeout(resolve, 100));
      gameState.multiplier = Number((gameState.multiplier + increment).toFixed(2));
      
      if (gameState.multiplier > 5) increment = 0.05;
      else if (gameState.multiplier > 2) increment = 0.02;
      
      io.emit('multiplierUpdate', { multiplier: gameState.multiplier });
    }
    
    // Crash!
    gameState.status = 'crashed';
    console.log(`💥 Game crashed at ${gameState.crashPoint}x`);
    
    // Process pending bets (losses)
    for (const [username, bet] of gameState.activeBets) {
      try {
        const user = await User.findOne({ username });
        if (user) {
          // No balance change, just record loss
          io.to(bet.socketId).emit('betResult', {
            result: 'loss',
            multiplier: gameState.crashPoint,
            betAmount: bet.amount,
            profit: 0,
            newBalance: user.balance
          });
        }
      } catch (error) {
        console.error('Error processing loss:', error);
      }
    }
    
    io.emit('gameCrashed', { multiplier: gameState.crashPoint });
    
    // Short pause before next round
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

// Start the game
setTimeout(() => {
  gameLoop();
  startStatsUpdates();
}, 1000);

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  socket.on('register', async (data) => {
    try {
      let user = await User.findOne({ username: data.username });
      
      if (!user) {
        user = new User({ username: data.username });
        await user.save();
      }
      
      socket.emit('userData', {
        username: user.username,
        balance: user.balance
      });
      
      // Send current game state
      socket.emit('gameState', {
        status: gameState.status,
        multiplier: gameState.multiplier,
        timeRemaining: gameState.timeRemaining
      });
      
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('error', { message: 'Registration failed' });
    }
  });
  
  socket.on('placeBet', async (data) => {
    try {
      if (gameState.status !== 'waiting') {
        return socket.emit('error', { message: 'Can only bet during waiting time' });
      }
      
      if (gameState.activeBets.has(data.username)) {
        return socket.emit('error', { message: 'Bet already placed' });
      }
      
      const user = await User.findOne({ username: data.username });
      if (!user) {
        return socket.emit('error', { message: 'User not found' });
      }
      
      if (user.balance < data.amount) {
        return socket.emit('error', { message: 'Insufficient balance' });
      }
      
      // Deduct bet amount
      user.balance -= data.amount;
      user.totalBets += data.amount;
      await user.save();
      
      // Store bet
      gameState.activeBets.set(data.username, {
        amount: data.amount,
        socketId: socket.id
      });
      
      socket.emit('betPlaced', {
        amount: data.amount,
        newBalance: user.balance
      });
      
      console.log(`💰 Bet placed: ${data.username} - Amount: ${data.amount}`);
      
    } catch (error) {
      console.error('Bet placement error:', error);
      socket.emit('error', { message: 'Failed to place bet' });
    }
  });
  
  socket.on('cashout', async (data) => {
    try {
      if (gameState.status !== 'flying' || gameState.cashedOut.has(data.username)) {
        return;
      }
      
      const bet = gameState.activeBets.get(data.username);
      if (!bet) {
        return socket.emit('error', { message: 'No active bet found' });
      }
      
      const user = await User.findOne({ username: data.username });
      if (!user) {
        return socket.emit('error', { message: 'User not found' });
      }
      
      // Calculate winnings
      const winnings = Math.floor(bet.amount * gameState.multiplier);
      const profit = winnings - bet.amount;
      
      // Update user balance
      user.balance += winnings;
      user.totalWinnings += profit;
      await user.save();
      
      // Remove from active bets
      gameState.activeBets.delete(data.username);
      gameState.cashedOut.set(data.username, gameState.multiplier);
      
      socket.emit('betResult', {
        result: 'win',
        multiplier: gameState.multiplier,
        betAmount: bet.amount,
        winnings: winnings,
        profit: profit,
        newBalance: user.balance
      });
      
      console.log(`💰 Cashout: ${data.username} - Multiplier: ${gameState.multiplier}x - Profit: ${profit}`);
      
    } catch (error) {
      console.error('Cashout error:', error);
      socket.emit('error', { message: 'Failed to cashout' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
