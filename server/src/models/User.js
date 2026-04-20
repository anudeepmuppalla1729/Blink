const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add your full name'],
  },
  username: {
    type: String,
    required: [true, 'Please add a username'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
  },
  avatar: {
    type: String, // base64 data URL e.g. "data:image/png;base64,...."
    default: null,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', userSchema);
