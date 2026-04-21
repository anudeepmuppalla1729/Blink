import React, { useState, useEffect, useRef } from 'react';

const GroupChatWindow = ({ group, messages, onSend, onLeave, currentUserId, joinRequests, onAcceptJoin, onRejectJoin }) => {
  const [input, setInput] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (input.trim()) {
      onSend(input);
      setInput('');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onSend(file, 'file');
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isAdmin = group?.adminId === currentUserId;

  return (
    <div className="chat-overlay">
      <div className="chat-container">
        
        {/* Header */}
        <div className="chat-header">
          <div className="chat-peer-info">
            <div className="group-avatar-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <h2 className="chat-peer-name">{group?.name || 'Group Chat'}</h2>
              <div className="chat-status" style={{ cursor: 'pointer' }} onClick={() => setShowMembers(!showMembers)}>
                <span className="status-dot connected"></span>
                <span>{group?.members?.length || 0} members {isAdmin && '· Admin'}</span>
                <span style={{ fontSize: '0.6rem', marginLeft: '0.25rem' }}>{showMembers ? '▲' : '▼'}</span>
              </div>
            </div>
          </div>
          
          <button onClick={onLeave} className="btn-close-chat" title={isAdmin ? 'Disband Group' : 'Leave Group'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Members Panel */}
        {showMembers && (
          <div className="group-members-panel">
            {(group?.members || []).map(m => (
              <div key={m.userId} className="group-member-item">
                {m.avatar ? (
                  <img src={m.avatar} alt={m.name} className="avatar-sm" style={{ width: '28px', height: '28px' }} />
                ) : (
                  <div className="avatar-sm" style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}>
                    {(m.name || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span className="group-member-name">
                  {m.name || m.username}
                  {m.userId === group?.adminId && <span className="admin-badge">Admin</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Join Requests (inline for admin) */}
        {joinRequests && joinRequests.length > 0 && (
          <div className="group-join-requests-bar">
            {joinRequests.map((req, idx) => (
              <div key={idx} className="group-join-request-item">
                {req.avatar ? (
                  <img src={req.avatar} alt="" className="avatar-sm" style={{ width: '28px', height: '28px' }} />
                ) : (
                  <div className="avatar-sm" style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}>
                    {(req.name || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span className="group-member-name" style={{ flex: 1 }}>{req.name} wants to join</span>
                <button onClick={() => onRejectJoin(req)} className="btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}>✕</button>
                <button onClick={() => onAcceptJoin(req)} className="btn-primary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', width: 'auto' }}>✓</button>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg, idx) => {
            const isMe = msg.senderId === currentUserId;
            return (
              <div key={idx} className={`message-row ${isMe ? 'me' : 'peer'}`}>
                <div className="message-group">
                  
                  {/* Avatar for peer messages */}
                  {!isMe && (
                    <div style={{ flexShrink: 0, paddingBottom: '1.2rem' }}>
                      {msg.senderAvatar ? (
                         <img src={msg.senderAvatar} alt="" className="avatar-sm" style={{ width: '32px', height: '32px' }} />
                      ) : (
                         <div className="avatar-sm" style={{ width: '32px', height: '32px', fontSize: '0.75rem' }}>
                            {(msg.senderName || 'U')[0].toUpperCase()}
                         </div>
                      )}
                    </div>
                  )}

                  <div className="message-content">
                    {!isMe && (
                      <span className="group-sender-name">{msg.senderName}</span>
                    )}
                    <div className="message-bubble">
                      {msg.type === 'file' ? (
                        <div className="file-attachment">
                          <div className="file-header">
                            <div className="file-icon">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                            </div>
                            <p className="file-name" title={msg.fileName}>{msg.fileName}</p>
                          </div>
                          {(msg.status === 'uploading' || msg.status === 'downloading') ? (
                            <div className="file-progress-container">
                              <div className="file-progress-text">
                                <span>{msg.status === 'uploading' ? 'Sending...' : 'Receiving...'}</span>
                                <span>{msg.progress}%</span>
                              </div>
                              <div className="file-progress-bar-bg">
                                <div className="file-progress-bar-fill" style={{ width: `${msg.progress}%` }}></div>
                              </div>
                            </div>
                          ) : (
                            <a href={msg.content} download={msg.fileName} className="file-download">Download</a>
                          )}
                        </div>
                      ) : (
                        <span>{msg.content}</span>
                      )}
                    </div>
                    <span className="message-time">{formatTime(msg.ts)}</span>
                  </div>

                </div>
              </div>
            );
          })}
          
          {messages.length === 0 && (
            <div className="chat-empty-state">
               <div className="chat-empty-icon">👥</div>
               <h3 className="chat-empty-title">Group created</h3>
               <p className="chat-empty-subtitle">Waiting for members to join and start chatting.</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <form onSubmit={handleSend} className="chat-form">
            <label className="btn-attach" title="Attach file">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
              <input type="file" onChange={handleFileChange} />
            </label>
            <input
              type="text"
              className="chat-input"
              placeholder="Message the group..."
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            
            <button type="submit" disabled={!input.trim()} className="btn-send">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default GroupChatWindow;
