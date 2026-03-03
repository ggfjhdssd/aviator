const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const cors = require('cors');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection (Render Environment Variable)
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI ကို Environment Variable ထဲမှာ ထည့်ပေးပါ။');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Premium Database Connected Successfully');
}).catch((err) => {
  console.error('❌ Database Connection Error:', err);
});

const User = require('./models/User');

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'premium-aviator-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    ttl: 24 * 60 * 60 // 1 day
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Authentication Middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login.html');
};

// ============= AUTHENTICATION ROUTES =============

// SIGNUP ROUTE
app.post('/api/signup', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validation
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'ကျေးဇူးပြု၍ အကွက်အားလုံး ဖြည့်သွင်းပါ။' 
      });
    }

    if (username.length < 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'အသုံးပြုသူအမည်သည် အနည်းဆုံး ၃ လုံးရှိရပါမည်။' 
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'စကားဝှက်နှစ်ခု မတူညီပါ။' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'စကားဝှက်သည် အနည်းဆုံး ၆ လုံးရှိရပါမည်။' 
      });
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ 
        success: false, 
        message: 'ဤအသုံးပြုသူအမည်ဖြင့် အကောင့်ရှိပြီးသားဖြစ်ပါသည်။' 
      });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'ဤအီးမေးလ်ဖြင့် အကောင့်ရှိပြီးသားဖြစ်ပါသည်။' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword
    });

    await user.save();

    // Set session
    req.session.userId = user._id;
    req.session.username = user.username;

    res.json({ 
      success: true, 
      message: 'အကောင့်ဖွင့်ခြင်း အောင်မြင်ပါသည်။',
      redirect: '/index.html'
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'ဆာဗာချိတ်ဆက်မှု အမှားရှိနေပါသည်။' 
    });
  }
});

// LOGIN ROUTE (with Username)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'ကျေးဇူးပြု၍ အသုံးပြုသူအမည်နှင့် စကားဝှက် ဖြည့်သွင်းပါ။' 
      });
    }

    // Find user by username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'အသုံးပြုသူအမည် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်။' 
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'ဤအကောင့်ကို ပိတ်ထားပါသည်။' 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'အသုံးပြုသူအမည် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်။' 
      });
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    // Set session
    req.session.userId = user._id;
    req.session.username = user.username;

    res.json({ 
      success: true, 
      message: 'အကောင့်ဝင်ရောက်ခြင်း အောင်မြင်ပါသည်။',
      redirect: '/index.html'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'ဆာဗာချိတ်ဆက်မှု အမှားရှိနေပါသည်။' 
    });
  }
});

// FORGET PASSWORD - Check Email
app.post('/api/forget-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'ကျေးဇူးပြု၍ အီးမေးလ် ဖြည့်သွင်းပါ။' 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'ဤအီးမေးလ်ဖြင့် အကောင့်မရှိပါ။' 
      });
    }

    // Store email in session for reset
    req.session.resetEmail = email;

    res.json({ 
      success: true, 
      message: 'အီးမေးလ် အတည်ပြုပြီးပါပြီ။',
      redirect: '/reset-password.html'
    });

  } catch (error) {
    console.error('Forget password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'ဆာဗာချိတ်ဆက်မှု အမှားရှိနေပါသည်။' 
    });
  }
});

// RESET PASSWORD
app.post('/api/reset-password', async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const email = req.session.resetEmail;

    if (!email) {
      return res.status(401).json({ 
        success: false, 
        message: 'ကျေးဇူးပြု၍ ပြန်လည်စတင်ပါ။' 
      });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'ကျေးဇူးပြု၍ စကားဝှက်အသစ် ဖြည့်သွင်းပါ။' 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'စကားဝှက်နှစ်ခု မတူညီပါ။' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'စကားဝှက်သည် အနည်းဆုံး ၆ လုံးရှိရပါမည်။' 
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'အသုံးပြုသူ မတွေ့ပါ။' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedPassword;
    await user.save();

    // Clear reset session
    req.session.resetEmail = null;

    res.json({ 
      success: true, 
      message: 'စကားဝှက် ပြောင်းလဲခြင်း အောင်မြင်ပါသည်။',
      redirect: '/login.html'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'ဆာဗာချိတ်ဆက်မှု အမှားရှိနေပါသည်။' 
    });
  }
});

// LOGOUT ROUTE
app.get('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, redirect: '/login.html' });
  });
});

// CHECK AUTH STATUS
app.get('/api/auth-status', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ 
      isAuthenticated: true, 
      username: req.session.username 
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// GET USER DATA
app.get('/api/user-data', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password');
    res.json({ 
      success: true, 
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Serve game page with auth check
app.get('/index.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Redirect root to login
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/index.html');
  } else {
    res.redirect('/login.html');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Premium Server running on port ${PORT}`);
});
