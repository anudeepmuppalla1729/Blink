import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { useWebRTC } from './hooks/useWebRTC';
import ChatWindow from './components/Chat/ChatWindow';
import GroupChatWindow from './components/Chat/GroupChatWindow';

const compressImage = (file, callback) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 250;
      const MAX_HEIGHT = 250;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.8)); // Compress as JPEG with 80% quality
    };
  };
};

function App() {
  const { user, login, register, updateProfile, logout } = useAuth();
  const socket = useSocket();
  const { initiateConnection, isConnected, messages, sendMessage, cleanup, setOnPeerClose } = useWebRTC();

  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'profile'
  const [isRegister, setIsRegister] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', username: '', email: '', password: '', avatar: '' });
  
  const [activeUsers, setActiveUsers] = useState([]);
  const activeUsersRef = useRef([]); 
  
  const [incomingRequest, setIncomingRequest] = useState(null); 
  const [pendingRequest, setPendingRequest] = useState(null); 
  const [activeChatUser, setActiveChatUser] = useState(null); 

  const [toasts, setToasts] = useState([]);

  // ─── Group Chat State ───
  const [availableGroups, setAvailableGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [groupMessages, setGroupMessages] = useState([]);
  const [groupJoinRequests, setGroupJoinRequests] = useState([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [pendingGroupJoin, setPendingGroupJoin] = useState(null);
  const groupIncomingFiles = useRef({});

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('blink-theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('blink-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const showToast = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    activeUsersRef.current = activeUsers;
  }, [activeUsers]);

  useEffect(() => {
    if (!socket) return;

    const handleUserList = (users) => setActiveUsers(users);

    const handleUserOnline = (newUser) => {
      setActiveUsers(prev => {
        const filtered = prev.filter(u => u.userId !== newUser.userId);
        return [...filtered, newUser];
      });
    };

    const handleUserOffline = ({ userId }) => {
      setActiveUsers(prev => prev.filter(u => u.userId !== userId));
      setIncomingRequest(prev => prev?.fromUserId === userId ? null : prev);
      setPendingRequest(prev => prev === userId ? null : prev);
      
      setActiveChatUser(prev => {
        if (prev?.userId === userId) {
          showToast('Peer disconnected abruptly', 'error');
          cleanup();
          return null;
        }
        return prev;
      });
    };

    const handleReceiveRequest = (req) => setIncomingRequest(req);

    const handleRequestAccepted = ({ fromUserId, name, avatar }) => {
      showToast(`${name || 'User'} accepted your request`, 'success');
      setPendingRequest(null);
      initiateConnection(fromUserId);
      setActiveChatUser({ userId: fromUserId, name, avatar });
    };

    const handleRequestRejected = ({ name }) => {
      setPendingRequest(null);
      showToast(`${name || 'User'} declined your request`, 'error');
    };

    const handleChatEnded = ({ fromUserId }) => {
      setActiveChatUser(prev => {
        if (prev?.userId === fromUserId) {
          showToast('Chat ended by peer', 'info');
          cleanup();
          return null;
        }
        return prev;
      });
    };

    socket.on('user_list', handleUserList);
    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    socket.on('receive_request', handleReceiveRequest);
    socket.on('request_accepted', handleRequestAccepted);
    socket.on('request_rejected', handleRequestRejected);
    socket.on('chat_ended', handleChatEnded);

    return () => {
      socket.off('user_list', handleUserList);
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      socket.off('receive_request', handleReceiveRequest);
      socket.off('request_accepted', handleRequestAccepted);
      socket.off('request_rejected', handleRequestRejected);
      socket.off('chat_ended', handleChatEnded);
    };
  }, [socket, initiateConnection, showToast, cleanup]);

  // ─── Group Chat Socket Listeners ───
  useEffect(() => {
    if (!socket) return;

    const handleGroupList = (groups) => setAvailableGroups(groups);

    const handleGroupJoined = (data) => {
      setActiveGroup(data);
      setGroupMessages([]);
      setPendingGroupJoin(null);
      showToast(`Joined "${data.name}"`, 'success');
    };

    const handleGroupUpdated = ({ groupId, members, memberCount }) => {
      setActiveGroup(prev => {
        if (prev?.groupId === groupId) return { ...prev, members, memberCount };
        return prev;
      });
    };

    const handleGroupMessage = (msg) => {
      setGroupMessages(prev => [...prev, msg]);
    };

    const handleGroupJoinRequest = (req) => {
      setGroupJoinRequests(prev => [...prev, req]);
    };

    const handleGroupJoinRejected = ({ groupName }) => {
      setPendingGroupJoin(null);
      showToast(`Your request to join "${groupName}" was declined`, 'error');
    };

    const handleGroupDeleted = ({ reason }) => {
      setActiveGroup(null);
      setGroupMessages([]);
      showToast(reason || 'Group was deleted', 'info');
    };

    socket.on('group_list', handleGroupList);
    socket.on('group_joined', handleGroupJoined);
    socket.on('group_updated', handleGroupUpdated);
    socket.on('group_message', handleGroupMessage);
    socket.on('group_join_request', handleGroupJoinRequest);
    socket.on('group_join_rejected', handleGroupJoinRejected);
    socket.on('group_deleted', handleGroupDeleted);

    const handleGroupFileStart = (packet) => {
      if (packet.senderId === user.id) return; // sender tracks locally
      groupIncomingFiles.current[packet.fileId] = {
        meta: packet, chunks: new Array(packet.totalChunks), receivedCount: 0,
      };
      setGroupMessages(prev => [...prev, {
        senderId: packet.senderId, senderName: packet.senderName, senderAvatar: packet.senderAvatar,
        fileId: packet.fileId, fileName: packet.fileName, fileType: packet.fileType,
        status: 'downloading', progress: 0, type: 'file', ts: packet.ts,
      }]);
    };

    const handleGroupFileChunk = (packet) => {
      if (packet.senderId === user.id) return;
      const fd = groupIncomingFiles.current[packet.fileId];
      if (!fd) return;
      fd.chunks[packet.chunkIndex] = packet.content;
      fd.receivedCount++;
      const progress = Math.round((fd.receivedCount / fd.meta.totalChunks) * 100);
      setGroupMessages(prev => prev.map(m => m.fileId === packet.fileId ? { ...m, progress } : m));
      if (fd.receivedCount === fd.meta.totalChunks) {
        const byteArrays = fd.chunks.map(b64 => {
          const bin = window.atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return bytes;
        });
        const blob = new Blob(byteArrays, { type: fd.meta.fileType });
        const url = URL.createObjectURL(blob);
        setGroupMessages(prev => prev.map(m => m.fileId === packet.fileId ? { ...m, content: url, status: 'completed', progress: 100 } : m));
        delete groupIncomingFiles.current[packet.fileId];
      }
    };

    socket.on('group_file_start', handleGroupFileStart);
    socket.on('group_file_chunk', handleGroupFileChunk);

    return () => {
      socket.off('group_list', handleGroupList);
      socket.off('group_joined', handleGroupJoined);
      socket.off('group_updated', handleGroupUpdated);
      socket.off('group_message', handleGroupMessage);
      socket.off('group_join_request', handleGroupJoinRequest);
      socket.off('group_join_rejected', handleGroupJoinRejected);
      socket.off('group_deleted', handleGroupDeleted);
      socket.off('group_file_start', handleGroupFileStart);
      socket.off('group_file_chunk', handleGroupFileChunk);
    };
  }, [socket, showToast, user]);

  useEffect(() => {
    setOnPeerClose(() => {
      showToast('Connection closed', 'info');
      setActiveChatUser(null);
    });
  }, [setOnPeerClose, showToast]);

  const handleAuthChange = (e) => {
    const { name, value } = e.target;
    setAuthForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      compressImage(file, (compressedBase64) => {
        setAuthForm(prev => ({ ...prev, avatar: compressedBase64 }));
      });
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    
    // Frontend Validation
    if (isRegister) {
      if (authForm.name.trim().length < 2) return showToast('Name must be at least 2 characters', 'error');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForm.email)) return showToast('Invalid email address', 'error');
    }
    if (authForm.username.trim().length < 3) return showToast('Username must be at least 3 characters', 'error');
    if (!/^[a-z0-9_]+$/.test(authForm.username.toLowerCase())) return showToast('Username can only contain letters, numbers, and underscores', 'error');
    if (authForm.password.length < 6) return showToast('Password must be at least 6 characters', 'error');

    try {
      if (isRegister) {
        await register({ ...authForm, username: authForm.username.toLowerCase() });
        showToast('Registration successful! Logging in...', 'success');
        await login(authForm.username.toLowerCase(), authForm.password);
      } else {
        await login(authForm.username.toLowerCase(), authForm.password);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const sendRequest = (targetUserId) => {
    socket.emit('send_request', { toUserId: targetUserId });
    setPendingRequest(targetUserId);
  };

  const acceptRequest = () => {
    if (!incomingRequest) return;
    socket.emit('accept_request', { toUserId: incomingRequest.fromUserId });
    setActiveChatUser({ 
      userId: incomingRequest.fromUserId, 
      name: incomingRequest.name,
      avatar: incomingRequest.avatar 
    });
    setIncomingRequest(null);
  };

  const rejectRequest = () => {
    if (!incomingRequest) return;
    socket.emit('reject_request', { toUserId: incomingRequest.fromUserId });
    setIncomingRequest(null);
  };

  const handleCloseChat = () => {
    if (activeChatUser && socket) {
       socket.emit('end_chat', { toUserId: activeChatUser.userId });
    }
    cleanup();
    setActiveChatUser(null);
  };

  // ─── Group Chat Actions ───
  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return showToast('Group name is required', 'error');
    socket.emit('create_group', { name: newGroupName.trim() });
    setNewGroupName('');
    setShowCreateGroup(false);
  };

  const handleRequestJoinGroup = (groupId) => {
    socket.emit('request_join_group', { groupId });
    setPendingGroupJoin(groupId);
    showToast('Join request sent', 'info');
  };

  const handleAcceptGroupJoin = (req) => {
    socket.emit('accept_group_join', { groupId: req.groupId, userId: req.fromUserId });
    setGroupJoinRequests(prev => prev.filter(r => r.fromUserId !== req.fromUserId || r.groupId !== req.groupId));
  };

  const handleRejectGroupJoin = (req) => {
    socket.emit('reject_group_join', { groupId: req.groupId, userId: req.fromUserId });
    setGroupJoinRequests(prev => prev.filter(r => r.fromUserId !== req.fromUserId || r.groupId !== req.groupId));
  };

  const CHUNK_SIZE = 16 * 1024;

  const handleSendGroupMessage = (content, type = 'text') => {
    if (!activeGroup || !socket) return;
    if (type === 'file') {
      handleSendGroupFile(content);
    } else {
      socket.emit('group_message', { groupId: activeGroup.groupId, content });
    }
  };

  const handleSendGroupFile = async (file) => {
    if (!activeGroup || !socket) return;
    const groupId = activeGroup.groupId;
    const fileId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    socket.emit('group_file_start', { groupId, fileId, fileName: file.name, fileType: file.type, size: file.size, totalChunks });

    setGroupMessages(prev => [...prev, {
      senderId: 'me', fileId, fileName: file.name, fileType: file.type,
      status: 'uploading', progress: 0, type: 'file', ts: Date.now(),
    }]);

    let offset = 0, chunkIndex = 0;
    const readChunk = (start, end) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file.slice(start, end));
    });

    while (offset < file.size) {
      try {
        const chunkBase64 = await readChunk(offset, offset + CHUNK_SIZE);
        socket.emit('group_file_chunk', { groupId, fileId, chunkIndex, content: chunkBase64 });
        offset += CHUNK_SIZE;
        chunkIndex++;
        const progress = Math.round((chunkIndex / totalChunks) * 100);
        setGroupMessages(prev => prev.map(m => m.fileId === fileId ? { ...m, progress } : m));
        await new Promise(r => setTimeout(r, 5));
      } catch (err) {
        console.error('Group chunk send error', err);
        break;
      }
    }

    const localUrl = URL.createObjectURL(file);
    setGroupMessages(prev => prev.map(m => m.fileId === fileId ? { ...m, content: localUrl, status: 'completed', progress: 100 } : m));
  };

  const handleLeaveGroup = () => {
    if (!activeGroup) return;
    socket.emit('leave_group', { groupId: activeGroup.groupId });
    setActiveGroup(null);
    setGroupMessages([]);
  };

  // ─── Profile Form State ───
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    password: '',
    avatar: user?.avatar || ''
  });

  // Keep profile form synced with user
  useEffect(() => {
    if (user) {
      setProfileForm(prev => ({ ...prev, name: user.name, avatar: user.avatar || '' }));
    }
  }, [user]);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      compressImage(file, (compressedBase64) => {
        setProfileForm(prev => ({ ...prev, avatar: compressedBase64 }));
      });
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    
    // Frontend Validation
    if (profileForm.name.trim().length < 2) return showToast('Name must be at least 2 characters', 'error');
    if (profileForm.password && profileForm.password.length < 6) return showToast('New password must be at least 6 characters', 'error');

    try {
      await updateProfile(profileForm);
      showToast('Profile updated successfully', 'success');
      setProfileForm(prev => ({ ...prev, password: '' })); // clear password field
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ─── Toasts Component ───
  const Toasts = () => (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );

  if (!user) {
    return (
       <div className="auth-wrapper">
        <Toasts />
        <div className="auth-card">
          <h1 className="auth-title">Blink</h1>
          <p className="auth-subtitle">{isRegister ? 'Create your account' : 'Welcome back'}</p>
          
          <form onSubmit={handleAuthSubmit} className="auth-form">
            {isRegister && (
              <>
                <div className="avatar-upload-container">
                  <label style={{ cursor: 'pointer' }}>
                     {authForm.avatar ? (
                        <img src={authForm.avatar} alt="Avatar Preview" className="avatar-preview" />
                     ) : (
                        <div className="avatar-placeholder">
                           <span>+</span>
                        </div>
                     )}
                     <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                  </label>
                </div>
                <input type="text" name="name" placeholder="Full Name" value={authForm.name} onChange={handleAuthChange} required className="input-field" />
                <input type="email" name="email" placeholder="Email Address" value={authForm.email} onChange={handleAuthChange} required className="input-field" />
              </>
            )}
            <input type="text" name="username" placeholder="Username" value={authForm.username} onChange={handleAuthChange} required className="input-field" />
            <input type="password" name="password" placeholder="Password" value={authForm.password} onChange={handleAuthChange} required className="input-field" />
            
            <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
              {isRegister ? 'Sign Up' : 'Log In'}
            </button>
          </form>
          
          <div className="auth-switch">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}
            <button onClick={() => setIsRegister(!isRegister)}>
              {isRegister ? 'Log in' : 'Sign up'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <Toasts />

      {/* Navbar */}
      <nav className="navbar">
        <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => setCurrentView('dashboard')}>
          {user.avatar ? (
            <img src={user.avatar} alt="Profile" className="avatar-sm" />
          ) : (
            <div className="avatar-sm">
               {user.name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="nav-user-details">
            <h1 className="nav-logo-text">Blink</h1>
            <span className="nav-user-name">{user.name || user.username}</span>
          </div>
        </div>
        <div className="nav-actions">
          <button 
            onClick={toggleTheme} 
            className="nav-theme-toggle" 
            type="button" 
            title="Toggle theme" 
            aria-label="Toggle theme"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: 'color 0.2s' }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              width="1.25em"
              height="1.25em"
              fill="currentColor"
              strokeLinecap="round"
              viewBox="0 0 32 32"
            >
              {theme === 'light' ? (
                <g>
                  <circle cx="16" cy="16" r="9.34" />
                  <g stroke="currentColor" strokeWidth="1.5">
                    <path d="M16 5.5v-4" />
                    <path d="M16 30.5v-4" />
                    <path d="M1.5 16h4" />
                    <path d="M26.5 16h4" />
                    <path d="m23.4 8.6 2.8-2.8" />
                    <path d="m5.7 26.3 2.9-2.9" />
                    <path d="m5.8 5.8 2.8 2.8" />
                    <path d="m23.4 23.4 2.9 2.9" />
                  </g>
                </g>
              ) : (
                <>
                  <clipPath id="theme-toggle__classic__cutout">
                    <path d="M0-5h30a1 1 0 0 0 9 13v24H0Z" />
                  </clipPath>
                  <g clipPath="url(#theme-toggle__classic__cutout)">
                    <circle cx="16" cy="16" r="9.34" />
                    <g stroke="currentColor" strokeWidth="1.5">
                      <path d="M16 5.5v-4" />
                      <path d="M16 30.5v-4" />
                      <path d="M1.5 16h4" />
                      <path d="M26.5 16h4" />
                      <path d="m23.4 8.6 2.8-2.8" />
                      <path d="m5.7 26.3 2.9-2.9" />
                      <path d="m5.8 5.8 2.8 2.8" />
                      <path d="m23.4 23.4 2.9 2.9" />
                    </g>
                  </g>
                </>
              )}
            </svg>
          </button>
          <button onClick={() => setCurrentView('profile')} className="nav-profile-btn" style={{ color: currentView === 'profile' ? 'var(--accent)' : '' }}>Profile</button>
          <button onClick={logout} className="nav-logout">Log out</button>
        </div>
      </nav>

      {/* Main Content */}
      {currentView === 'dashboard' ? (
        <main className="dashboard-main">
          <div className="dashboard-header">
             <h2 className="dashboard-title">
               Nearby Users
               <span className="online-indicator"></span>
             </h2>
             <span className="online-count">{activeUsers.length} online</span>
          </div>
          
          {activeUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📡</div>
              <p>Scanning network for other users...</p>
            </div>
          ) : (
            <div className="users-grid">
              {activeUsers.map(u => (
                <div key={u.userId} className="user-card">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="avatar-sm" style={{ width: '48px', height: '48px' }} />
                  ) : (
                    <div className="avatar-sm" style={{ width: '48px', height: '48px', fontSize: '1.25rem' }}>
                       {(u.name || u.username)[0].toUpperCase()}
                    </div>
                  )}
                  <div className="user-info">
                    <div className="user-name">{u.name || u.username}</div>
                    <div className="user-username">@{u.username}</div>
                  </div>
                  
                  {pendingRequest === u.userId ? (
                    <button disabled className="btn-waiting">
                      <span className="spinner"></span>
                      Waiting
                    </button>
                  ) : (
                    <button onClick={() => sendRequest(u.userId)} className="btn-connect">
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ─── Group Chats Section ─── */}
          <div className="groups-section">
            <div className="dashboard-header" style={{ marginTop: '2rem' }}>
              <h2 className="dashboard-title">
                Group Chats
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </h2>
              <button className="btn-create-group" onClick={() => setShowCreateGroup(!showCreateGroup)}>
                {showCreateGroup ? 'Cancel' : '+ Create Group'}
              </button>
            </div>

            {showCreateGroup && (
              <div className="create-group-inline">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Group name..."
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                  autoFocus
                />
                <button className="btn-primary" style={{ width: 'auto', padding: '0.75rem 1.25rem' }} onClick={handleCreateGroup}>
                  Create
                </button>
              </div>
            )}

            {availableGroups.length === 0 && !showCreateGroup ? (
              <div className="empty-state" style={{ height: '120px' }}>
                <p>No active groups on this network</p>
              </div>
            ) : (
              <div className="users-grid">
                {availableGroups.map(g => (
                  <div key={g.groupId} className="user-card group-card">
                    <div className="group-avatar-icon">
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                    </div>
                    <div className="user-info">
                      <div className="user-name">{g.name}</div>
                      <div className="user-username">{g.memberCount} member{g.memberCount !== 1 ? 's' : ''} · by {g.adminName}</div>
                    </div>
                    {g.adminId === user.id ? (
                      <button className="btn-connect" style={{ backgroundColor: 'var(--accent)', color: 'var(--text-inverse)' }} onClick={() => {
                        socket.emit('request_join_group', { groupId: g.groupId });
                        setActiveGroup({ groupId: g.groupId, name: g.name, adminId: g.adminId, members: [], isAdmin: true });
                        setGroupMessages([]);
                      }}>Open</button>
                    ) : activeGroup?.groupId === g.groupId ? (
                      <button className="btn-connect" style={{ backgroundColor: 'var(--accent)', color: 'var(--text-inverse)' }}>Joined</button>
                    ) : pendingGroupJoin === g.groupId ? (
                      <button disabled className="btn-waiting"><span className="spinner"></span>Pending</button>
                    ) : (
                      <button onClick={() => handleRequestJoinGroup(g.groupId)} className="btn-connect">Join</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="dashboard-main">
          <div className="profile-container">
            <div className="profile-header">
              <h2 className="profile-title">Your Profile</h2>
              <p className="text-secondary text-sm">Manage your personal information and security.</p>
            </div>

            <form onSubmit={handleProfileSubmit} className="profile-form">
              <div className="avatar-upload-container">
                <label style={{ cursor: 'pointer' }}>
                   {profileForm.avatar ? (
                      <img src={profileForm.avatar} alt="Avatar Preview" className="avatar-preview" />
                   ) : (
                      <div className="avatar-placeholder">
                         <span>+</span>
                      </div>
                   )}
                   <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileAvatarChange} />
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" name="name" value={profileForm.name} onChange={handleProfileChange} required className="input-field" />
              </div>

              <div className="form-group">
                <label className="form-label">Username</label>
                <input type="text" value={user.username} disabled className="input-field" style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              </div>
              
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={user.email} disabled className="input-field" style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">New Password (leave blank to keep current)</label>
                <input type="password" name="password" placeholder="Enter new password" value={profileForm.password} onChange={handleProfileChange} className="input-field" />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }}>
                Save Changes
              </button>
            </form>
          </div>
        </main>
      )}

      {/* Incoming Request Notification */}
      {incomingRequest && (
        <div className="modal-overlay">
          <div className="request-card">
            <div className="request-header">
              {incomingRequest.avatar ? (
                <img src={incomingRequest.avatar} alt="" className="avatar-sm" style={{ width: '44px', height: '44px' }} />
              ) : (
                <div className="avatar-sm" style={{ width: '44px', height: '44px' }}>
                  {(incomingRequest.name || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="user-info">
                <div className="user-name">{incomingRequest.name}</div>
                <div className="user-username">wants to connect</div>
              </div>
            </div>
            <div className="request-actions">
              <button onClick={rejectRequest} className="btn-secondary flex-1">Decline</button>
              <button onClick={acceptRequest} className="btn-primary flex-1">Accept</button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Window */}
      {(activeChatUser || isConnected) && (
        <ChatWindow 
          messages={messages} 
          sendMessage={sendMessage} 
          onClose={handleCloseChat} 
          peer={activeChatUser}
          isConnected={isConnected}
        />
      )}

      {/* Group Chat Window */}
      {activeGroup && (
        <GroupChatWindow
          group={activeGroup}
          messages={groupMessages}
          onSend={handleSendGroupMessage}
          onLeave={handleLeaveGroup}
          currentUserId={user.id}
          joinRequests={groupJoinRequests}
          onAcceptJoin={handleAcceptGroupJoin}
          onRejectJoin={handleRejectGroupJoin}
        />
      )}
    </div>
  );
}

export default App;
