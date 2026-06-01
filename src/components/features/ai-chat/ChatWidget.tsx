"use client";

import React, { useState, useEffect, useRef, useId } from 'react';
import Image from 'next/image';
import { X, Send, User, Loader2, ChevronDown } from 'lucide-react';

const ASSISTANT_NAME = "Mickey";

const QUICK_ACTIONS = [
  "Event schedule",
  "Technical events",
  "Non-technical events",
  "Registration process",
  "Accommodation rules"
];

function MascotAvatar({ size = 40, className = '' }: { size?: number; className?: string }) {
  const gradientId = useId();
  const stripeId = useId();

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#141414" />
          <stop offset="58%" stopColor="#242424" />
          <stop offset="100%" stopColor="#0b0b0b" />
        </linearGradient>
        <linearGradient id={stripeId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffd348" />
          <stop offset="100%" stopColor="#f7a600" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="36" r="24" fill={`url(#${gradientId})`} />
      <path d="M20 9L11 26C10 28 10 31 11 33L20 20C22 17 22 12 20 9Z" fill="#111" />
      <path d="M44 9L53 26C54 28 54 31 53 33L44 20C42 17 42 12 44 9Z" fill="#111" />
      <path d="M20.5 12L15 23C14.2 24.7 14.4 26.7 15.6 28.1L22.5 18.6C23.7 16.9 23.7 14.5 22.6 12.8L20.5 12Z" fill="#ff8f5e" opacity="0.95" />
      <path d="M43.5 12L49 23C49.8 24.7 49.6 26.7 48.4 28.1L41.5 18.6C40.3 16.9 40.3 14.5 41.4 12.8L43.5 12Z" fill="#ff8f5e" opacity="0.95" />
      <path d="M20 23C22 15 27 10 32 10C37 10 42 15 44 23L32 31L20 23Z" fill={`url(#${stripeId})`} />
      <path d="M18 37C18 27 24.9 20 32 20C39.1 20 46 27 46 37C46 46 39.1 53 32 53C24.9 53 18 46 18 37Z" fill="#f6e5c7" />
      <ellipse cx="24" cy="34" rx="4.7" ry="6" fill="#fff8ea" />
      <ellipse cx="40" cy="34" rx="4.7" ry="6" fill="#fff8ea" />
      <circle cx="25.5" cy="35.5" r="3.1" fill="#111" />
      <circle cx="41.5" cy="35.5" r="3.1" fill="#111" />
      <circle cx="26.7" cy="34.2" r="1" fill="#fff" />
      <circle cx="42.7" cy="34.2" r="1" fill="#fff" />
      <path d="M29.7 40C31 41.4 33 41.4 34.3 40" stroke="#da8456" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <path d="M31.5 38.8L29 44.5C28.6 45.5 29.4 46.5 30.5 46.5H33.5C34.6 46.5 35.4 45.5 35 44.5L32.5 38.8" fill="#ffb58c" />
      <path d="M20 24C22.5 18.5 26.9 15.5 32 15.5C37.1 15.5 41.5 18.5 44 24" stroke="rgba(255,211,72,0.95)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M18 24.5C18 18.2 21 13 25.5 9.5" stroke="#111" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.7" />
      <path d="M46 24.5C46 18.2 43 13 38.5 9.5" stroke="#111" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.7" />
    </svg>
  );
}

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

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text };
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
      const assistantMessageId = crypto.randomUUID();

      // Append initial empty assistant message
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: 'assistant', content: "" }
      ]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });

        // Update the last message incrementally
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg && lastMsg.id === assistantMessageId) {
            lastMsg.content = lastMsg.content + chunkText;
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
          <div className="bg-gradient-to-r from-[#161616] via-[#1f1b12] to-[#d89b11] p-4 text-white flex items-start justify-between gap-4 shadow-md border-b border-amber-400/20">
            <div className="flex-1 text-center">
              <h3 className="font-bold text-lg leading-tight">{ASSISTANT_NAME}</h3>
              <p className="text-sm font-semibold text-amber-100 mt-1">Shackles mascot guide</p>
              <p className="text-xs text-amber-50/90 mt-1 hidden sm:block">Your quick guide for events, rules, and registration.</p>
            </div>
            <button
              onClick={toggleChat}
              className="shrink-0 p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Close chat"
            >
              <ChevronDown size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 flex flex-col space-y-4">
            {messages.length === 0 && (
              <div className="px-1 pt-2 pb-1">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
                  <div className="shrink-0 rounded-[1.5rem] bg-amber-100/90 border border-amber-200 p-2 shadow-sm">
                    <Image
                      src="/Mickey_Mascot.webp"
                      alt="Mickey mascot"
                      width={96}
                      height={96}
                      className="h-24 w-24 object-contain"
                    />
                  </div>
                  <div className="flex-1 pt-1">
                    <h4 className="font-medium text-gray-900 mb-2 text-lg">Welcome to Shackles 2026!</h4>
                    <p className="text-sm text-gray-600 mb-5 max-w-[24rem]">
                      {ASSISTANT_NAME} can answer questions about the symposium, events, schedule, and rules.
                    </p>

                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
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
                    ${m.role === 'user' ? 'bg-indigo-100 text-indigo-600 ml-2' : 'bg-amber-100 text-amber-950 mr-2 ring-1 ring-amber-200'}`}
                  >
                    {m.role === 'user' ? <User size={14} /> : <MascotAvatar size={24} />}
                  </div>
                  <div
                    className={`px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-white border border-amber-100 text-gray-800 shadow-sm rounded-tl-none'
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
                  <div className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1 bg-amber-100 text-amber-950 mr-2 ring-1 ring-amber-200">
                    <MascotAvatar size={24} />
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
              className="flex items-center bg-gray-50 border border-gray-200 rounded-full px-2 py-1 focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500 transition-all"
            >
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder={`Ask ${ASSISTANT_NAME} about Shackles...`}
                className="flex-1 bg-transparent border-none focus:outline-none px-3 py-2 text-sm text-gray-700 placeholder-gray-400"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-[#161616] rounded-full p-2 h-8 w-8 flex items-center justify-center transition-colors shadow-sm"
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
        className={`${isOpen ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gradient-to-br from-[#141414] via-[#2a2415] to-[#d89b11] hover:from-[#1c1c1c] hover:to-[#f2b326]'
          } text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 relative overflow-hidden border border-amber-300/20`}
        aria-label="Toggle chat window"
      >
        {isOpen ? <X size={24} /> : <MascotAvatar size={28} />}

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
