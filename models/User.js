const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    default: function() {
      return 'User' + Math.floor(Math.random() * 10000);
    }
  },
  balance: { 
    type: Number, 
    default: 5000 // Starting balance 5,000
  },
  totalBets: { type: Number, default: 0 },
  totalWinnings: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
module.exports = User;
