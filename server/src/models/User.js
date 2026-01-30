const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please add a username'],
    unique: true
  },
  password: {
    type: String,
    required: [true, 'Please add a password']
  },
}, {
  timestamps: true // adds createdAt and updatedAt
});

module.exports = mongoose.model('User', userSchema);
