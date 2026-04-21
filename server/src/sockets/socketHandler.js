const crypto = require('crypto');

// Map to store connected users: userId -> { socketId, ip, username, name, avatar }
const connectedUsers = new Map();

// Map to store active groups: groupId -> { name, adminId, adminName, adminAvatar, ip, members: Map<userId, {name, avatar, username, socketId}> }
const activeGroups = new Map();

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

// Helper to get groups visible on a given IP
const getGroupsForIP = (ip) => {
  const groups = [];
  activeGroups.forEach((group, groupId) => {
    if (group.ip === ip) {
      groups.push({
        groupId,
        name: group.name,
        adminId: group.adminId,
        adminName: group.adminName,
        adminAvatar: group.adminAvatar,
        memberCount: group.members.size,
      });
    }
  });
  return groups;
};

// Helper to broadcast updated group list to all users on an IP
const broadcastGroupList = (io, ip) => {
  const groups = getGroupsForIP(ip);
  connectedUsers.forEach((user) => {
    if (user.ip === ip) {
      io.to(user.socketId).emit('group_list', groups);
    }
  });
};

// Helper to get member list array from a group
const getMemberList = (group) => {
  const members = [];
  group.members.forEach((member, userId) => {
    members.push({ userId, name: member.name, avatar: member.avatar, username: member.username });
  });
  return members;
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

    // Send current group list to the newly connected user
    socket.emit('group_list', getGroupsForIP(ip));

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

      // --- Group cleanup on disconnect ---
      activeGroups.forEach((group, groupId) => {
        if (group.adminId === socket.userId) {
          // Admin disconnected → delete the group and notify all members
          group.members.forEach((member, memberId) => {
            if (memberId !== socket.userId) {
              const memberSocket = connectedUsers.get(memberId);
              if (memberSocket) {
                io.to(memberSocket.socketId).emit('group_deleted', { groupId, reason: 'Admin left the group' });
              }
            }
          });
          activeGroups.delete(groupId);
        } else if (group.members.has(socket.userId)) {
          // Regular member disconnected → remove from group
          group.members.delete(socket.userId);
          // Notify remaining members
          group.members.forEach((member, memberId) => {
            const memberSocket = connectedUsers.get(memberId);
            if (memberSocket) {
              io.to(memberSocket.socketId).emit('group_updated', {
                groupId,
                members: getMemberList(group),
                memberCount: group.members.size,
              });
            }
          });
        }
      });

      // Broadcast updated group list to same-IP users
      broadcastGroupList(io, ip);
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

    // ═══════════════════════════════════════
    // ═══  GROUP CHAT EVENTS  ═════════════
    // ═══════════════════════════════════════

    // Create Group
    socket.on('create_group', ({ name }) => {
      if (!name || !name.trim()) return;

      const groupId = crypto.randomUUID();
      const members = new Map();
      members.set(socket.userId, {
        name: socket.name,
        avatar: socket.avatar,
        username: socket.username,
        socketId: socket.id,
      });

      activeGroups.set(groupId, {
        name: name.trim(),
        adminId: socket.userId,
        adminName: socket.name,
        adminAvatar: socket.avatar,
        ip,
        members,
      });

      // Tell the creator they've joined
      socket.emit('group_joined', {
        groupId,
        name: name.trim(),
        adminId: socket.userId,
        adminName: socket.name,
        adminAvatar: socket.avatar,
        members: getMemberList(activeGroups.get(groupId)),
        isAdmin: true,
      });

      // Broadcast updated group list to everyone on same IP
      broadcastGroupList(io, ip);
    });

    // Request to Join Group
    socket.on('request_join_group', ({ groupId }) => {
      const group = activeGroups.get(groupId);
      if (!group) return;

      // Send the request to the admin
      const admin = connectedUsers.get(group.adminId);
      if (admin) {
        io.to(admin.socketId).emit('group_join_request', {
          groupId,
          groupName: group.name,
          fromUserId: socket.userId,
          name: socket.name,
          avatar: socket.avatar,
          username: socket.username,
        });
      }
    });

    // Admin Accepts Group Join
    socket.on('accept_group_join', ({ groupId, userId }) => {
      const group = activeGroups.get(groupId);
      if (!group || group.adminId !== socket.userId) return;

      const joiningUser = connectedUsers.get(userId);
      if (!joiningUser) return;

      // Add to members
      group.members.set(userId, {
        name: joiningUser.name,
        avatar: joiningUser.avatar,
        username: joiningUser.username,
        socketId: joiningUser.socketId,
      });

      // Tell the joining user they're in
      io.to(joiningUser.socketId).emit('group_joined', {
        groupId,
        name: group.name,
        adminId: group.adminId,
        adminName: group.adminName,
        adminAvatar: group.adminAvatar,
        members: getMemberList(group),
        isAdmin: false,
      });

      // Notify all existing members of the updated member list
      group.members.forEach((member, memberId) => {
        const memberSocket = connectedUsers.get(memberId);
        if (memberSocket) {
          io.to(memberSocket.socketId).emit('group_updated', {
            groupId,
            members: getMemberList(group),
            memberCount: group.members.size,
          });
        }
      });

      // Broadcast updated group list (member count changed)
      broadcastGroupList(io, ip);
    });

    // Admin Rejects Group Join
    socket.on('reject_group_join', ({ groupId, userId }) => {
      const group = activeGroups.get(groupId);
      if (!group || group.adminId !== socket.userId) return;

      const rejectedUser = connectedUsers.get(userId);
      if (rejectedUser) {
        io.to(rejectedUser.socketId).emit('group_join_rejected', {
          groupId,
          groupName: group.name,
        });
      }
    });

    // Group Message — relay to all members
    socket.on('group_message', ({ groupId, content }) => {
      const group = activeGroups.get(groupId);
      if (!group || !group.members.has(socket.userId)) return;
      if (!content || !content.trim()) return;

      const message = {
        groupId,
        senderId: socket.userId,
        senderName: socket.name,
        senderAvatar: socket.avatar,
        content: content.trim(),
        ts: Date.now(),
      };

      // Send to all members (including sender for confirmation)
      group.members.forEach((member, memberId) => {
        const memberSocket = connectedUsers.get(memberId);
        if (memberSocket) {
          io.to(memberSocket.socketId).emit('group_message', message);
        }
      });
    });

    // Group File Start — relay metadata to all members
    socket.on('group_file_start', ({ groupId, fileId, fileName, fileType, size, totalChunks }) => {
      const group = activeGroups.get(groupId);
      if (!group || !group.members.has(socket.userId)) return;

      const packet = {
        groupId, fileId, fileName, fileType, size, totalChunks,
        senderId: socket.userId,
        senderName: socket.name,
        senderAvatar: socket.avatar,
        ts: Date.now(),
      };

      group.members.forEach((member, memberId) => {
        const memberSocket = connectedUsers.get(memberId);
        if (memberSocket) {
          io.to(memberSocket.socketId).emit('group_file_start', packet);
        }
      });
    });

    // Group File Chunk — relay chunk to all members
    socket.on('group_file_chunk', ({ groupId, fileId, chunkIndex, content }) => {
      const group = activeGroups.get(groupId);
      if (!group || !group.members.has(socket.userId)) return;

      const packet = { groupId, fileId, chunkIndex, content, senderId: socket.userId };

      group.members.forEach((member, memberId) => {
        const memberSocket = connectedUsers.get(memberId);
        if (memberSocket) {
          io.to(memberSocket.socketId).emit('group_file_chunk', packet);
        }
      });
    });

    // Leave Group
    socket.on('leave_group', ({ groupId }) => {
      const group = activeGroups.get(groupId);
      if (!group) return;

      if (group.adminId === socket.userId) {
        // Admin leaving → delete the group
        group.members.forEach((member, memberId) => {
          if (memberId !== socket.userId) {
            const memberSocket = connectedUsers.get(memberId);
            if (memberSocket) {
              io.to(memberSocket.socketId).emit('group_deleted', { groupId, reason: 'Admin disbanded the group' });
            }
          }
        });
        activeGroups.delete(groupId);
      } else {
        // Regular member leaving
        group.members.delete(socket.userId);

        // Notify remaining members
        group.members.forEach((member, memberId) => {
          const memberSocket = connectedUsers.get(memberId);
          if (memberSocket) {
            io.to(memberSocket.socketId).emit('group_updated', {
              groupId,
              members: getMemberList(group),
              memberCount: group.members.size,
            });
          }
        });
      }

      // Broadcast updated group list
      broadcastGroupList(io, ip);
    });

    // Delete Group (admin only)
    socket.on('delete_group', ({ groupId }) => {
      const group = activeGroups.get(groupId);
      if (!group || group.adminId !== socket.userId) return;

      group.members.forEach((member, memberId) => {
        if (memberId !== socket.userId) {
          const memberSocket = connectedUsers.get(memberId);
          if (memberSocket) {
            io.to(memberSocket.socketId).emit('group_deleted', { groupId, reason: 'Group was deleted by admin' });
          }
        }
      });

      activeGroups.delete(groupId);
      broadcastGroupList(io, ip);
    });
  });
};
