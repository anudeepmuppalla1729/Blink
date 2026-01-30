// Map to store connected users: userId -> { socketId, ip, username }
const connectedUsers = new Map();

// Helper to get users on the same IP
const getUsersOnSameIP = (ip, currentUserId) => {
  const users = [];
  connectedUsers.forEach((user, userId) => {
    if (user.ip === ip && userId !== currentUserId) {
      users.push({ userId, username: user.username });
    }
  });
  return users;
};

module.exports = (io) => {
  // Middleware to extract user info (simplified for now, ideally verify JWT)
  io.use((socket, next) => {
    const { userId, username } = socket.handshake.auth;
    if (userId && username) {
      socket.userId = userId;
      socket.username = username;
      next();
    } else {
      next(new Error("Invalid auth"));
    }
  });

  io.on('connection', (socket) => {
    // Get IP address (handle proxies if needed, for now raw socket address)
    // On localhost it might be ::1, in prod use x-forwarded-for if behind proxy
    const ip = socket.handshake.address; 
    
    console.log(`User connected: ${socket.username} (${socket.userId}) from ${ip}`);

    // Store user
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      ip,
      username: socket.username
    });

    // Notify user of others on the same network
    const peers = getUsersOnSameIP(ip, socket.userId);
    socket.emit('user_list', peers);

    // Notify others on same network about this new user
    peers.forEach(peer => {
      const peerSocketId = connectedUsers.get(peer.userId)?.socketId;
      if (peerSocketId) {
        io.to(peerSocketId).emit('user_online', { userId: socket.userId, username: socket.username });
      }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.username}`);
      connectedUsers.delete(socket.userId);
      
      // Notify peers
      const peers = getUsersOnSameIP(ip, socket.userId); // peers are remaining users
      peers.forEach(peer => {
        const peerSocketId = connectedUsers.get(peer.userId)?.socketId;
        if (peerSocketId) {
          io.to(peerSocketId).emit('user_offline', { userId: socket.userId });
        }
      });
    });

    // --- Signaling & Chat Requests ---

    // Send Chat Request
    socket.on('send_request', ({ toUserId }) => {
      const target = connectedUsers.get(toUserId);
      if (target) {
        io.to(target.socketId).emit('receive_request', { 
          fromUserId: socket.userId, 
          username: socket.username 
        });
      }
    });

    // Accept Chat Request
    socket.on('accept_request', ({ toUserId }) => {
      const target = connectedUsers.get(toUserId);
      if (target) {
        io.to(target.socketId).emit('request_accepted', { 
          fromUserId: socket.userId 
        });
      }
    });

    // Reject Chat Request
    socket.on('reject_request', ({ toUserId }) => {
      const target = connectedUsers.get(toUserId);
      if (target) {
        io.to(target.socketId).emit('request_rejected', { 
          fromUserId: socket.userId 
        });
      }
    });

    // WebRTC Signal (Offer, Answer, ICE Candidate)
    socket.on('signal', ({ toUserId, signal }) => {
      const target = connectedUsers.get(toUserId);
      if (target) {
        io.to(target.socketId).emit('signal', { 
          fromUserId: socket.userId, 
          signal 
        });
      }
    });
  });
};
