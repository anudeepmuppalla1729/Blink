import React, { useState } from 'react';

const ChatWindow = ({ messages, sendMessage, onClose, peerName }) => {
  const [input, setInput] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-lg shadow-xl flex flex-col h-[80vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold dark:text-white">Chat with {peerName}</h2>
          <button 
            onClick={onClose}
            className="text-red-500 hover:text-red-700 font-semibold"
          >
            End Chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex ${msg.senderId === 'me' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.senderId === 'me' 
                    ? 'bg-blue-500 text-white rounded-br-none' 
                    : 'bg-gray-200 dark:bg-gray-700 dark:text-white rounded-bl-none'
                }`}
              >
                {msg.type === 'file' ? (
                  <div className="min-w-[200px]">
                    <p className="font-bold text-sm mb-1">📎 {msg.fileName}</p>
                    {msg.status === 'uploading' || msg.status === 'downloading' ? (
                       <div className="w-full">
                         <div className="flex justify-between text-xs mb-1">
                            <span>{msg.status === 'uploading' ? 'Sending...' : 'Receiving...'}</span>
                            <span>{msg.progress}%</span>
                         </div>
                         <div className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-2">
                           <div 
                             className="bg-green-500 h-2 rounded-full transition-all duration-300" 
                             style={{ width: `${msg.progress}%` }}
                           ></div>
                         </div>
                       </div>
                    ) : (
                       <a href={msg.content} download={msg.fileName} className="underline text-xs block mt-1 hover:text-blue-100">Download</a>
                    )}
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="text-center text-gray-500">No messages yet. Say hello!</p>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
           <label className="cursor-pointer bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-3 py-2 rounded-lg flex items-center justify-center">
            <span className="text-xl">📎</span>
            <input 
              type="file" 
              className="hidden" 
              onChange={(e) => {
                if(e.target.files[0]) {
                  sendMessage(e.target.files[0], 'file'); // Check if sendMessage handles this
                }
              }}
            />
          </label>
          <input
            type="text"
            className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Type a message..."
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button 
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;
