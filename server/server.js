const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');

const app = express();
const server = http.createServer(app);
// DB Config
const connectDB = require('./src/config/db');
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for local Wi-Fi, or restrictive in prod
    methods: ["GET", "POST"]
  }
});

// Socket Logic (Placeholder for now)
require('./src/sockets/socketHandler')(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
