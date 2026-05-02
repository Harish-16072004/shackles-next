"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  X, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  ChevronDown 
} from 'lucide-react';

const QUICK_ACTIONS = [
  "Event schedule",
  "Technical events",
  "Non-technical events",
  "Registration process",
  "Accommodation rules"
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Show unread indicator if closed and new message arrives
  useEffect(() => {
    if (!isOpen && messages.length === 0) {
      setHasUnread(true);
    }
  }, [isOpen, messages.length]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setHasUnread(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const sendMessageToAPI = async (text: string) => {
    if (!text.trim() || isLoading) return;

    setError(false);
    setIsLoading(true);

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`Failed to fetch response: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      const assistantMessageId = (Date.now() + 1).toString();

      // Append initial empty assistant message
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: 'assistant', content: "" }
      ]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        assistantContent += chunkText;

        // Update the last message
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.id === assistantMessageId) {
            lastMsg.content = assistantContent;
          }
          return newMessages;
        });
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessageToAPI(input);
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
    sendMessageToAPI(action);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[350px] sm:w-[400px] h-[550px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100 transition-all duration-300 ease-in-out">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white flex justify-between items-center shadow-md">
            <div className="flex items-center space-x-2">
              <div className="bg-white/20 p-2 rounded-full">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Shackles Assistant</h3>
                <p className="text-xs text-blue-100 opacity-90">Always here to help</p>
              </div>
            </div>
            <button 
              onClick={toggleChat}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Close chat"
            >
              <ChevronDown size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 flex flex-col space-y-4">
            {messages.length === 0 && (
              <div className="text-center my-auto px-4">
                <div className="bg-blue-100 text-blue-600 p-3 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                  <Bot size={24} />
                </div>
                <h4 className="font-medium text-gray-800 mb-2">Welcome to Shackles 2026!</h4>
                <p className="text-sm text-gray-500 mb-6">
                  I can answer questions about the symposium, events, schedule, and rules.
                </p>
                
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_ACTIONS.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickAction(action)}
                      className="text-xs bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-600 text-gray-600 py-1.5 px-3 rounded-full transition-colors shadow-sm"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div 
                key={m.id} 
                className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1
                    ${m.role === 'user' ? 'bg-indigo-100 text-indigo-600 ml-2' : 'bg-blue-600 text-white mr-2'}`}
                  >
                    {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div 
                    className={`px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                      m.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-white border border-gray-100 text-gray-800 shadow-sm rounded-tl-none'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start w-full">
                <div className="flex flex-row max-w-[85%]">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1 bg-blue-600 text-white mr-2">
                    <Bot size={14} />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm rounded-tl-none flex items-center space-x-2">
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="bg-red-50 text-red-500 text-xs p-3 rounded-xl text-center border border-red-100 mt-2">
                Sorry, there was an error processing your request. Please try again.
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-gray-100">
            <form 
              onSubmit={handleSubmit}
              className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-2 py-1 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all"
            >
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about Shackles..."
                className="flex-1 bg-transparent border-none focus:outline-none px-3 py-2 text-sm text-gray-700 placeholder-gray-400"
                disabled={isLoading}
              />
              <button 
                type="submit" 
                disabled={!input.trim() || isLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full p-2 h-8 w-8 flex items-center justify-center transition-colors shadow-sm"
                aria-label="Send message"
              >
                {isLoading && messages[messages.length - 1]?.role === 'user' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="ml-0.5" />}
              </button>
            </form>
            <div className="text-[10px] text-center text-gray-400 mt-2">
              AI responses may be inaccurate.
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={toggleChat}
        className={`${
          isOpen ? 'bg-gray-800 hover:bg-gray-700' : 'bg-blue-600 hover:bg-blue-700'
        } text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 relative`}
        aria-label="Toggle chat window"
      >
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
        
        {/* Unread Indicator */}
        {!isOpen && hasUnread && (
          <span className="absolute top-0 right-0 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white"></span>
          </span>
        )}
      </button>
    </div>
  );
}
