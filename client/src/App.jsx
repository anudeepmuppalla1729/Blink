import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { useWebRTC } from './hooks/useWebRTC';
import ChatWindow from './components/Chat/ChatWindow';

function App() {
  const { user, login, register, logout } = useAuth();
  const socket = useSocket();
  const { initiateConnection, isConnected, messages, sendMessage, cleanup } = useWebRTC();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  
  const [activeUsers, setActiveUsers] = useState([]);
  const [incomingRequest, setIncomingRequest] = useState(null); // { fromUserId, username }
  const [activeChatUser, setActiveChatUser] = useState(null); // { userId, username }

  // Socket Listeners for Discovery & Signaling
  useEffect(() => {
    if (!socket) return;

    socket.on('user_list', (users) => {
      setActiveUsers(users);
    });

    socket.on('user_online', (newUser) => {
      setActiveUsers(prev => [...prev.filter(u => u.userId !== newUser.userId), newUser]);
    });

    socket.on('user_offline', ({ userId }) => {
      setActiveUsers(prev => prev.filter(u => u.userId !== userId));
    });

    socket.on('receive_request', ({ fromUserId, username }) => {
      setIncomingRequest({ fromUserId, username });
    });

    socket.on('request_accepted', ({ fromUserId }) => {
      // I am the sender, request accepted by target
      // Find username
      console.log("Request accepted by", fromUserId);
      const targetUser = activeUsers.find(u => u.userId === fromUserId);
      console.log("Found target user:", targetUser);
      initiateConnection(fromUserId);
      setActiveChatUser({ userId: fromUserId, username: targetUser?.username || 'User' });
    });

    socket.on('request_rejected', ({ fromUserId }) => {
      alert(`Chat request rejected by user.`);
    });

    return () => {
      socket.off('user_list');
      socket.off('user_online');
      socket.off('user_offline');
      socket.off('receive_request');
      socket.off('request_accepted');
      socket.off('request_rejected');
    };
  }, [socket, activeUsers]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      if (isRegister) {
        await register(username, password);
        alert('Registration successful! Please login.');
        setIsRegister(false);
      } else {
        await login(username, password);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const sendRequest = (targetUserId) => {
    socket.emit('send_request', { toUserId: targetUserId });
    alert('Request sent! Waiting for approval...');
  };

  const acceptRequest = () => {
    if (!incomingRequest) return;
    socket.emit('accept_request', { toUserId: incomingRequest.fromUserId });
    setActiveChatUser({ userId: incomingRequest.fromUserId, username: incomingRequest.username });
    setIncomingRequest(null);
    // Note: The one who accepts waits for the Offer. useWebRTC handles incoming signals automatically.
  };

  const rejectRequest = () => {
    if (!incomingRequest) return;
    socket.emit('reject_request', { toUserId: incomingRequest.fromUserId });
    setIncomingRequest(null);
  };

  const handleCloseChat = () => {
    cleanup();
    setActiveChatUser(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg w-96">
          <h1 className="text-2xl font-bold mb-6 text-center">Blink - Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              placeholder="Username"
              className="w-full px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
            >
              {isRegister ? 'Register' : 'Login'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button 
              className="text-blue-500 hover:underline"
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister ? 'Login' : 'Register'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
      {/* Navbar */}
      <nav className="bg-white dark:bg-gray-800 shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Blink ({user.username})</h1>
        <button onClick={logout} className="text-red-500 hover:text-red-700">Logout</button>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto p-6">
        <h2 className="text-2xl font-semibold mb-4">Users on your Wi-Fi</h2>
        
        {activeUsers.length === 0 ? (
          <p className="text-gray-500">No other users found on this network.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeUsers.map(u => (
              <div key={u.userId} className="bg-white dark:bg-gray-800 p-4 rounded shadow flex justify-between items-center">
                <span>{u.username}</span>
                <button 
                  onClick={() => sendRequest(u.userId)}
                  className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 text-sm"
                >
                  Connect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incoming Request Modal */}
      {incomingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2">Chat Request</h3>
            <p className="mb-4">{incomingRequest.username} wants to chat.</p>
            <div className="flex gap-2">
              <button 
                onClick={acceptRequest}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                Accept
              </button>
              <button 
                onClick={rejectRequest}
                className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white py-2 rounded hover:bg-gray-400"
              >
                Decline
              </button>
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
          peerName={activeChatUser?.username || 'Peer'}
        />
      )}
    </div>
  );
}

export default App;
