import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// IMAGE UPLOAD SETUP
// ==========================================

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images allowed.'));
    }
  }
});

app.use('/uploads', express.static(uploadsDir));

// Database file paths
const commentsFile = path.join(__dirname, 'data', 'comments.json');
const analyticsFile = path.join(__dirname, 'data', 'analytics.json');
const subscribersFile = path.join(__dirname, 'data', 'subscribers.json');
const usersFile = path.join(__dirname, 'data', 'users.json');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Initialize data directory
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize data files if they don't exist
function initializeDataFiles() {
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(analyticsFile)) {
    fs.writeFileSync(analyticsFile, JSON.stringify({
      postViews: {},
      totalLikes: 0,
      totalComments: 0
    }, null, 2));
  }
  if (!fs.existsSync(subscribersFile)) {
    fs.writeFileSync(subscribersFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([], null, 2));
  }
}

initializeDataFiles();

// Email configuration (using test credentials - configure with real service)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-app-password'
  }
});

// API: Get all comments for a post
app.get('/api/comments/:postId', (req, res) => {
  try {
    const comments = JSON.parse(fs.readFileSync(commentsFile, 'utf8'));
    const postComments = comments.filter(c => c.postId === req.params.postId);
    res.json(postComments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// API: Post a new comment
app.post('/api/comments', (req, res) => {
  try {
    const { postId, name, text } = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!postId || !text) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let userId = null;
    let userName = name || 'Anonymous';

    // If authenticated, get user info
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
        userName = decoded.username;
      } catch (e) {
        // Invalid token, treat as anonymous
      }
    }

    const comments = JSON.parse(fs.readFileSync(commentsFile, 'utf8'));
    const newComment = {
      id: uuidv4(),
      postId,
      userId,
      name: userName,
      text,
      timestamp: new Date().toISOString()
    };

    comments.push(newComment);
    fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2));

    // Update analytics
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, 'utf8'));
    analytics.totalComments++;
    fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));

    // Update user comment count if authenticated
    if (userId) {
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex !== -1) {
        users[userIndex].comments++;
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
      }
    }

    res.status(201).json(newComment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// API: Get analytics
app.get('/api/analytics', (req, res) => {
  try {
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, 'utf8'));
    const subscribers = JSON.parse(fs.readFileSync(subscribersFile, 'utf8'));
    
    res.json({
      ...analytics,
      totalSubscribers: subscribers.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// API: Record page view
app.post('/api/analytics/view/:postId', (req, res) => {
  try {
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, 'utf8'));
    const postId = req.params.postId;

    if (!analytics.postViews[postId]) {
      analytics.postViews[postId] = 0;
    }
    analytics.postViews[postId]++;

    fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record view' });
  }
});

// API: Like a post
app.post('/api/analytics/like', (req, res) => {
  try {
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, 'utf8'));
    analytics.totalLikes++;
    fs.writeFileSync(analyticsFile, JSON.stringify(analytics, null, 2));
    res.json({ totalLikes: analytics.totalLikes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record like' });
  }
});

// API: Subscribe to newsletter
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const subscribers = JSON.parse(fs.readFileSync(subscribersFile, 'utf8'));
    
    // Check if already subscribed
    if (subscribers.includes(email)) {
      return res.status(400).json({ error: 'Already subscribed' });
    }

    subscribers.push(email);
    fs.writeFileSync(subscribersFile, JSON.stringify(subscribers, null, 2));

    // Send confirmation email (configure with real email service)
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: email,
        subject: 'Welcome to Efe\'s Blog!',
        html: `
          <h2>Welcome to the Blog!</h2>
          <p>Thank you for subscribing to our newsletter.</p>
          <p>You'll now receive updates about new posts and insights.</p>
          <p>Best regards,<br>Efe</p>
        `
      });
    } catch (emailError) {
      console.log('Email service not configured: ', emailError.message);
      // Don't fail the subscription if email fails
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Start server
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKEN = 'essence-admin-token-2026';

// ==========================================
// USER AUTHENTICATION
// ==========================================

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validation
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check if user already exists
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    if (users.find(u => u.email === email || u.username === username)) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      bio: '',
      avatar: null,
      posts: 0,
      comments: 0
    };

    users.push(newUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    // Generate token
    const token = jwt.sign({ id: newUser.id, username: newUser.username, email: newUser.email }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        bio: newUser.bio,
        avatar: newUser.avatar,
        createdAt: newUser.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const user = users.find(u => u.email === email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        createdAt: user.createdAt,
        posts: user.posts,
        comments: user.comments
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Validate token
app.post('/api/auth/validate', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const user = users.find(u => u.id === decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        posts: user.posts,
        comments: user.comments
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Get user profile
app.get('/api/users/:username', (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const user = users.find(u => u.username === req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar: user.avatar,
      createdAt: user.createdAt,
      posts: user.posts,
      comments: user.comments
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
app.put('/api/users/profile/:id', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.id !== req.params.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { bio } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    const userIndex = users.findIndex(u => u.id === req.params.id);

    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].bio = bio || users[userIndex].bio;
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    res.json({
      success: true,
      user: {
        id: users[userIndex].id,
        username: users[userIndex].username,
        email: users[userIndex].email,
        bio: users[userIndex].bio,
        avatar: users[userIndex].avatar
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    res.json({ token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Middleware to check admin token
function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  
  if (token === ADMIN_TOKEN) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ==========================================
// ADMIN: POSTS MANAGEMENT
// ==========================================

app.post('/api/admin/posts', verifyAdmin, (req, res) => {
  try {
    const { id, title, category, content } = req.body;
    // In a real app, save to database
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save post' });
  }
});

app.delete('/api/admin/posts/:id', verifyAdmin, (req, res) => {
  try {
    const { id } = req.params;
    // In a real app, delete from database
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ==========================================
// ADMIN: SUBSCRIBERS MANAGEMENT
// ==========================================

app.get('/api/admin/subscribers', verifyAdmin, (req, res) => {
  try {
    const subscribers = JSON.parse(fs.readFileSync(subscribersFile, 'utf8'));
    const subscribersData = subscribers.map((email, index) => ({
      email,
      date: new Date().toISOString(),
      id: index
    }));
    res.json(subscribersData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

app.delete('/api/admin/subscribers/:id', verifyAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const subscribers = JSON.parse(fs.readFileSync(subscribersFile, 'utf8'));
    subscribers.splice(parseInt(id), 1);
    fs.writeFileSync(subscribersFile, JSON.stringify(subscribers, null, 2));
    
    // Update analytics
    const analytics = JSON.parse(fs.readFileSync(analyticsFile, 'utf8'));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
});

// ==========================================
// ADMIN: SETTINGS
// ==========================================

app.post('/api/admin/settings', verifyAdmin, (req, res) => {
  try {
    const { password } = req.body;
    
    if (password) {
      // In production, store hashed password in .env or database
      process.env.ADMIN_PASSWORD = password;
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'No settings to update' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ==========================================
// IMAGE UPLOAD ENDPOINTS
// ==========================================

app.post('/api/admin/upload', verifyAdmin, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const imageData = {
      id: uuidv4(),
      filename: req.file.filename,
      originalname: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    };

    res.json(imageData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// PUBLIC: Get all images (no auth required)
app.get('/api/images', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const images = files.map(filename => {
      const filepath = path.join(uploadsDir, filename);
      const stat = fs.statSync(filepath);
      return {
        id: filename,
        filename,
        url: `/uploads/${filename}`,
        size: stat.size,
        uploadedAt: stat.birthtime.toISOString()
      };
    });

    res.json(images);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// ADMIN: Get all images (admin only)
app.get('/api/admin/images', verifyAdmin, (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const images = files.map(filename => {
      const filepath = path.join(uploadsDir, filename);
      const stat = fs.statSync(filepath);
      return {
        id: filename,
        filename,
        url: `/uploads/${filename}`,
        size: stat.size,
        uploadedAt: stat.birthtime.toISOString()
      };
    });

    res.json(images);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

app.delete('/api/admin/images/:filename', verifyAdmin, (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    fs.unlinkSync(filepath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

app.listen(PORT, () => {
  console.log(`Blog server running on http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
  console.log(`Default admin password: ${ADMIN_PASSWORD}`);
});
