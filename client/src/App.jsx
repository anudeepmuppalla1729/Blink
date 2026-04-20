import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { useWebRTC } from './hooks/useWebRTC';
import ChatWindow from './components/Chat/ChatWindow';

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
      const reader = new FileReader();
      reader.onload = () => setAuthForm(prev => ({ ...prev, avatar: reader.result }));
      reader.readAsDataURL(file);
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
      const reader = new FileReader();
      reader.onload = () => setProfileForm(prev => ({ ...prev, avatar: reader.result }));
      reader.readAsDataURL(file);
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
    </div>
  );
}

export default App;
