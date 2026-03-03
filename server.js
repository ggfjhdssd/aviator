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

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  balance: { type: Number, default: 1000 },
  createdAt: { type: Date, default: Date.now }
});

// Game History Schema
const gameHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  betAmount: { type: Number, required: true },
  cashoutMultiplier: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  crashedAt: { type: Number, default: 0 },
  status: { type: String, enum: ['win', 'loss', 'pending'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const GameHistory = mongoose.model('GameHistory', gameHistorySchema);

// Game State
let currentMultiplier = 1.00;
let gameActive = false;
let gameLoop = null;
let crashPoint = 1.00;
let activeBets = new Map(); // userId -> { betAmount, socketId }
let cashedOut = new Map(); // userId -> multiplier

// Generate random crash point (1.00 to 10.00)
function generateCrashPoint() {
  // Random crash point between 1.00 and 10.00
  // Higher chance of low multipliers
  const random = Math.random();
  if (random < 0.3) return 1.00; // 30% chance of instant crash
  if (random < 0.5) return Number((1 + Math.random() * 0.5).toFixed(2)); // 1.00 - 1.50
  if (random < 0.7) return Number((1.5 + Math.random() * 1).toFixed(2)); // 1.50 - 2.50
  if (random < 0.85) return Number((2.5 + Math.random() * 2).toFixed(2)); // 2.50 - 4.50
  return Number((4.5 + Math.random() * 5.5).toFixed(2)); // 4.50 - 10.00
}

// Start new game
async function startNewGame() {
  if (gameActive) return;
  
  crashPoint = generateCrashPoint();
  currentMultiplier = 1.00;
  gameActive = true;
  activeBets.clear();
  cashedOut.clear();
  
  console.log(`🎮 New game started. Crash point: ${crashPoint}x`);
  
  io.emit('gameStarted', { multiplier: currentMultiplier });
  
  // Start multiplier increase
  let increment = 0.01;
  gameLoop = setInterval(() => {
    if (!gameActive) return;
    
    currentMultiplier = Number((currentMultiplier + increment).toFixed(2));
    
    // Increase speed as multiplier grows
    if (currentMultiplier > 5) increment = 0.05;
    else if (currentMultiplier > 2) increment = 0.02;
    
    io.emit('multiplierUpdate', { multiplier: currentMultiplier });
    
    // Check for crash
    if (currentMultiplier >= crashPoint) {
      crash();
    }
  }, 100);
}

// Crash game
async function crash() {
  if (!gameActive) return;
  
  gameActive = false;
  clearInterval(gameLoop);
  
  console.log(`💥 Game crashed at ${crashPoint}x`);
  
  // Process pending bets (losses)
  for (const [userId, bet] of activeBets) {
    try {
      const user = await User.findById(userId);
      if (user) {
        // Record loss
        await GameHistory.create({
          userId: user._id,
          betAmount: bet.amount,
          cashoutMultiplier: 0,
          profit: -bet.amount,
          crashedAt: crashPoint,
          status: 'loss'
        });
        
        // Emit loss to user
        io.to(bet.socketId).emit('betResult', {
          result: 'loss',
          multiplier: crashPoint,
          betAmount: bet.amount,
          profit: -bet.amount,
          newBalance: user.balance
        });
      }
    } catch (error) {
      console.error('Error processing loss:', error);
    }
  }
  
  io.emit('gameCrashed', { multiplier: crashPoint });
  
  // Start new game after delay
  setTimeout(startNewGame, 5000);
}

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  socket.on('register', async (data) => {
    try {
      let user = await User.findOne({ username: data.username });
      
      if (!user) {
        user = new User({ username: data.username, balance: 1000 });
        await user.save();
        console.log(`📝 New user created: ${data.username}`);
      }
      
      socket.emit('userData', {
        userId: user._id,
        username: user.username,
        balance: user.balance
      });
      
      // Send current game state
      socket.emit('gameState', {
        active: gameActive,
        multiplier: currentMultiplier
      });
      
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('error', { message: 'Registration failed' });
    }
  });
  
  socket.on('placeBet', async (data) => {
    try {
      if (!gameActive) {
        return socket.emit('error', { message: 'Game not active' });
      }
      
      if (activeBets.has(data.userId)) {
        return socket.emit('error', { message: 'Bet already placed' });
      }
      
      const user = await User.findById(data.userId);
      if (!user) {
        return socket.emit('error', { message: 'User not found' });
      }
      
      if (user.balance < data.amount) {
        return socket.emit('error', { message: 'Insufficient balance' });
      }
      
      // Deduct bet amount
      user.balance -= data.amount;
      await user.save();
      
      // Store bet
      activeBets.set(data.userId, {
        amount: data.amount,
        socketId: socket.id
      });
      
      socket.emit('betPlaced', {
        amount: data.amount,
        newBalance: user.balance
      });
      
      console.log(`💰 Bet placed: User ${data.userId} - Amount: ${data.amount}`);
      
    } catch (error) {
      console.error('Bet placement error:', error);
      socket.emit('error', { message: 'Failed to place bet' });
    }
  });
  
  socket.on('cashout', async (data) => {
    try {
      if (!gameActive || cashedOut.has(data.userId)) {
        return;
      }
      
      const bet = activeBets.get(data.userId);
      if (!bet) {
        return socket.emit('error', { message: 'No active bet found' });
      }
      
      const user = await User.findById(data.userId);
      if (!user) {
        return socket.emit('error', { message: 'User not found' });
      }
      
      // Calculate profit
      const profit = bet.amount * (currentMultiplier - 1);
      const newBalance = user.balance + bet.amount + profit;
      
      // Update user balance
      user.balance = newBalance;
      await user.save();
      
      // Record win
      await GameHistory.create({
        userId: user._id,
        betAmount: bet.amount,
        cashoutMultiplier: currentMultiplier,
        profit: profit,
        crashedAt: crashPoint,
        status: 'win'
      });
      
      // Remove from active bets
      activeBets.delete(data.userId);
      cashedOut.set(data.userId, currentMultiplier);
      
      socket.emit('betResult', {
        result: 'win',
        multiplier: currentMultiplier,
        betAmount: bet.amount,
        profit: profit,
        newBalance: newBalance
      });
      
      console.log(`💰 Cashout: User ${data.userId} - Multiplier: ${currentMultiplier}x - Profit: ${profit}`);
      
    } catch (error) {
      console.error('Cashout error:', error);
      socket.emit('error', { message: 'Failed to cashout' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Admin API - Add coins
app.post('/admin/add-coin', async (req, res) => {
  try {
    const { username, amount } = req.body;
    
    if (!username || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid username or amount' });
    }
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.balance += amount;
    await user.save();
    
    res.json({
      success: true,
      message: `Added ${amount} coins to ${username}`,
      newBalance: user.balance
    });
    
  } catch (error) {
    console.error('Admin API error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API to get user history
app.get('/api/history/:userId', async (req, res) => {
  try {
    const history = await GameHistory.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Start the game when server starts
setTimeout(startNewGame, 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
