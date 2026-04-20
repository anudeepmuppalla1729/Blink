import React, { useState, useEffect, useRef } from 'react';

const ChatWindow = ({ messages, sendMessage, onClose, peer, isConnected }) => {
  const [input, setInput] = useState('');
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
      sendMessage(input);
      setInput('');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      sendMessage(file, 'file');
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-overlay">
      <div className="chat-container">
        
        {/* Header */}
        <div className="chat-header">
          <div className="chat-peer-info">
            {peer?.avatar ? (
              <img src={peer.avatar} alt="Avatar" className="avatar-sm" style={{ width: '40px', height: '40px' }} />
            ) : (
              <div className="avatar-sm" style={{ width: '40px', height: '40px' }}>
                {(peer?.name || 'U')[0].toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="chat-peer-name">{peer?.name || 'Peer'}</h2>
              <div className="chat-status">
                <span className={`status-dot ${isConnected ? 'connected' : 'connecting'}`}></span>
                <span>{isConnected ? 'Connected securely' : 'Establishing connection...'}</span>
              </div>
            </div>
          </div>
          
          <button onClick={onClose} className="btn-close-chat" title="End Chat">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((msg, idx) => {
            const isMe = msg.senderId === 'me';
            return (
              <div key={idx} className={`message-row ${isMe ? 'me' : 'peer'}`}>
                <div className="message-group">
                  
                  {/* Avatar for peer messages */}
                  {!isMe && (
                    <div style={{ flexShrink: 0, paddingBottom: '1.2rem' }}>
                      {peer?.avatar ? (
                         <img src={peer.avatar} alt="" className="avatar-sm" style={{ width: '32px', height: '32px' }} />
                      ) : (
                         <div className="avatar-sm" style={{ width: '32px', height: '32px', fontSize: '0.75rem' }}>
                            {(peer?.name || 'U')[0].toUpperCase()}
                         </div>
                      )}
                    </div>
                  )}

                  <div className="message-content">
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
                            <a href={msg.content} download={msg.fileName} className="file-download">
                              Download
                            </a>
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
          
          {messages.length === 0 && isConnected && (
            <div className="chat-empty-state">
               <div className="chat-empty-icon">✨</div>
               <h3 className="chat-empty-title">Connection established</h3>
               <p className="chat-empty-subtitle">Your chat is peer-to-peer and secure.</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <form onSubmit={handleSend} className="chat-form">
            <label className="btn-attach" title="Attach file">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
              <input type="file" onChange={handleFileChange} disabled={!isConnected} />
            </label>
            
            <input
              type="text"
              className="chat-input"
              placeholder={isConnected ? "Message..." : "Connecting..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={!isConnected}
            />
            
            <button type="submit" disabled={!input.trim() || !isConnected} className="btn-send">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default ChatWindow;
