const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const register = async (req, res) => {
  let { name, username, email, password, avatar } = req.body;

  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'Name, username, email and password are required' });
  }

  username = username.toLowerCase();
  email = email.toLowerCase();

  try {
    // Check duplicates
    const userExists = await User.findOne({ $or: [{ username }, { email }] });
    if (userExists) {
      if (userExists.username === username) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      name,
      username,
      email,
      password: hashedPassword,
      avatar: avatar || null,
    });

    if (user) {
      res.status(201).json({
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt,
      });
    } else {
      res.status(400).json({ error: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const login = async (req, res) => {
  let { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  username = username.toLowerCase();

  try {
    const user = await User.findOne({ username });

    if (user && (await bcrypt.compare(password, user.password))) {
      const token = jwt.sign(
        { userId: user._id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateProfile = async (req, res) => {
  const user = await User.findById(req.user.userId);

  if (user) {
    user.name = req.body.name || user.name;
    user.avatar = req.body.avatar !== undefined ? req.body.avatar : user.avatar;

    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(req.body.password, salt);
    }

    const updatedUser = await user.save();

    res.json({
      id: updatedUser._id,
      name: updatedUser.name,
      username: updatedUser.username,
      email: updatedUser.email,
      avatar: updatedUser.avatar,
    });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
};

module.exports = { register, login, updateProfile };
