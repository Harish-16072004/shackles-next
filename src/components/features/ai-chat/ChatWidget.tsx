'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const chatContext = useChat() as any;
  const { messages, append, status, handleSubmit, handleInputChange } = chatContext;
  const isLoading = status === 'streaming' || status === 'submitted';

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const userMessage = inputValue;
    setInputValue('');
    if (chatContext.append) {
      chatContext.append({ role: 'user', content: userMessage });
    } else if (chatContext.sendMessage) {
      chatContext.sendMessage({ role: 'user', content: userMessage });
    }
  };

  return (
    /* Increased z-index to 9999 to ensure it's above everything else */
    <div className="fixed bottom-6 right-6 z-9999 pointer-events-auto">
      {isOpen ? (
        <div className="w-80 h-[450px] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
          {/* Header */}
          <div className="bg-blue-600 text-white p-4 flex justify-between items-center shrink-0">
            <div>
              <h3 className="font-bold text-sm">Fest Assistant AI</h3>
              <p className="text-[10px] text-blue-100">Shackles 25-26 Support</p>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-blue-500 rounded-full transition-colors"
              aria-label="Close chat"
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
          
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 flex flex-col">
            {messages.length === 0 && (
              <div className="my-auto text-center px-4">
                <div className="bg-blue-100 text-blue-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                  🤖
                </div>
                <p className="text-gray-600 font-medium text-sm">Hi Harish!</p>
                <p className="text-gray-400 text-xs mt-1">
                  Ask me about robotics, events, or symposium schedules.
                </p>
              </div>
            )}
            {messages.map((m: any) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-xs ${
                    m.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl p-3 text-sm shadow-xs rounded-bl-none">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Input Area */}
          <form 
            onSubmit={handleFormSubmit} 
            className="p-3 bg-white border-t border-gray-100 shrink-0 flex gap-2"
          >
            <input
              autoFocus
              name="prompt"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm text-black bg-gray-50"
              placeholder="Type a message..."
              disabled={isLoading}
              required
            />
            <button 
              type="submit" 
              className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !inputValue.trim()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </form>
        </div>
      ) : (
        /* The Trigger Button */
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 text-white p-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(37,99,235,0.4)] transition-all duration-300 transform hover:scale-110 active:scale-90 flex items-center gap-2 group relative overflow-hidden"
          aria-label="Open chat"
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <span className="text-xl">💬</span>
          <span className="font-semibold text-sm pr-1">Ask AI</span>
        </button>
      )}
    </div>
  );
}