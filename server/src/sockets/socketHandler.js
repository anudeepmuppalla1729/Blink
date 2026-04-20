// Map to store connected users: userId -> { socketId, ip, username, name, avatar }
const connectedUsers = new Map();

// Helper to get users on the same IP
const getUsersOnSameIP = (ip, currentUserId) => {
  const users = [];
  connectedUsers.forEach((user, userId) => {
    if (user.ip === ip && userId !== currentUserId) {
      users.push({ userId, username: user.username, name: user.name, avatar: user.avatar });
    }
  });
  return users;
};

module.exports = (io) => {
  // Middleware to extract user info
  io.use((socket, next) => {
    const { userId, username, name, avatar } = socket.handshake.auth;
    if (userId && username) {
      socket.userId = userId;
      socket.username = username;
      socket.name = name || username;
      socket.avatar = avatar || null;
      next();
    } else {
      next(new Error("Invalid auth"));
    }
  });

  io.on('connection', (socket) => {
    // Handle proxies — use x-forwarded-for in production
    const forwardedFor = socket.handshake.headers['x-forwarded-for'];
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : socket.handshake.address;

    console.log(`User connected: ${socket.username} (${socket.userId}) from ${ip}`);

    // Store user
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      ip,
      username: socket.username,
      name: socket.name,
      avatar: socket.avatar,
    });

    // Send current peer list to the newly connected user
    const peers = getUsersOnSameIP(ip, socket.userId);
    socket.emit('user_list', peers);

    // Notify everyone on same network about this new user
    peers.forEach(peer => {
      const peerSocketId = connectedUsers.get(peer.userId)?.socketId;
      if (peerSocketId) {
        io.to(peerSocketId).emit('user_online', {
          userId: socket.userId,
          username: socket.username,
          name: socket.name,
          avatar: socket.avatar,
        });
      }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.username}`);

      // Get peers BEFORE removing from map
      const peersToNotify = getUsersOnSameIP(ip, socket.userId);

      connectedUsers.delete(socket.userId);

      peersToNotify.forEach(peer => {
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
          username: socket.username,
          name: socket.name,
          avatar: socket.avatar,
        });
      }
    });

    // Accept Chat Request
    socket.on('accept_request', ({ toUserId }) => {
      const target = connectedUsers.get(toUserId);
      if (target) {
        io.to(target.socketId).emit('request_accepted', {
          fromUserId: socket.userId,
          name: socket.name,
          avatar: socket.avatar,
        });
      }
    });

    // Reject Chat Request
    socket.on('reject_request', ({ toUserId }) => {
      const target = connectedUsers.get(toUserId);
      if (target) {
        io.to(target.socketId).emit('request_rejected', {
          fromUserId: socket.userId,
          name: socket.name,
        });
      }
    });

    // End Chat — notify peer that the session has ended
    socket.on('end_chat', ({ toUserId }) => {
      const target = connectedUsers.get(toUserId);
      if (target) {
        io.to(target.socketId).emit('chat_ended', { fromUserId: socket.userId });
      }
    });

    // WebRTC Signal (Offer, Answer, ICE Candidate)
    socket.on('signal', ({ toUserId, signal }) => {
      const target = connectedUsers.get(toUserId);
      if (target) {
        io.to(target.socketId).emit('signal', {
          fromUserId: socket.userId,
          signal,
        });
      }
    });
  });
};
