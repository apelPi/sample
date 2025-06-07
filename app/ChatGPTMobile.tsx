"use client";

import { useState, useEffect } from "react";
import {
  Menu,
  RotateCcw,
  Plus,
  Mic,
  ArrowUp,
  ChevronDown,
  Wrench,
  X,
  Edit,
  Search,
  MoreHorizontal,
  User,
} from "lucide-react";
import ChatClient from './chat-client';
import { supabase } from "../lib/supabase";
import type { Message } from "../lib/types";
import { trpc } from '../trpc/client';

interface Auth0User {
  name?: string;
  email?: string;
  picture?: string;
  [key: string]: any;
}

interface ChatGPTMobileProps {
  user?: Auth0User;
  isLoggedIn: boolean;
}

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

export default function ChatGPTMobile({ user, isLoggedIn }: ChatGPTMobileProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const geminiTitleMutation = trpc.geminiTitle.useMutation();

  useEffect(() => {
    if (isLoggedIn && user?.sub) {
      setLoadingChats(true);
      supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.sub)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          setLoadingChats(false);
          if (!error && data) setChats(data);
        });
    }
  }, [isLoggedIn, user?.sub]);

  useEffect(() => {
    if (currentChatId) {
      setLoadingMessages(true);
      supabase
        .from('messages')
        .select('*')
        .eq('chat_id', currentChatId)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          setLoadingMessages(false);
          if (!error && data) {
            setMessages(
              data.map((msg: any) => ({
                ...msg,
                role: msg.role === "user" ? "user" : "assistant"
              }))
            );
          }
        });
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  const handleLogout = () => {
    window.location.href = '/auth/logout';
  };

  const handleLogin = () => {
    window.location.href = '/auth/login';
  };

  const handleNewChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const handleSendMessage = async (content: string, role: string) => {
    if (!user?.sub) return;
    let chatId = currentChatId;
    let isNewChat = false;
    if (!chatId) {
      const { data, error } = await supabase
        .from('chats')
        .insert([{ user_id: user.sub, title: 'New Chat' }])
        .select()
        .single();
      if (!error && data) {
        setChats([data, ...chats]);
        setCurrentChatId(data.id);
        chatId = data.id;
        isNewChat = true;
      } else {
        return;
      }
    }
    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert([{ chat_id: chatId, user_id: user.sub, content, role }])
      .select()
      .single();
    if (!msgError && msgData) {
      setMessages((prev) => [...prev, msgData]);
    }
    if (isNewChat && role === 'user') {
      const prompt = `Provide just one(maximum 3 words) concise title for this chat based on the following message: "${content}"`;
      const { title } = await geminiTitleMutation.mutateAsync({ prompt });
      if (title) {
        await supabase.from('chats').update({ title }).eq('id', chatId);
        setChats((prev) => prev.map((chat) => chat.id === chatId ? { ...chat, title } : chat));
      }
    }
  };

  return (
    <div className="position-relative" style={{ minHeight: '100vh', background: '#18181a' }}>
      {/* Fixed Top Bar */}
      <nav className="navbar navbar-dark bg-dark fixed-top px-3" style={{height: 56, background: '#18181a', borderBottom: '1px solid #232325', zIndex: 1050}}>
        <div className="d-flex w-100 align-items-center justify-content-between position-relative" style={{minHeight: 56}}>
          {/* Sidebar/Menu Icon (only if logged in) */}
          {isLoggedIn ? (
            <button
              className="btn btn-link text-white p-2"
              style={{ border: "none" }}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={28} />
            </button>
          ) : (
            <div style={{width: 44}}></div>
          )}
          {/* Center: Title */}
          <span className="navbar-brand mb-0 h1 fw-bold position-absolute start-50 translate-middle-x" style={{color: '#fff', fontSize: '1.25rem', left: '50%'}}>ChatGPT</span>
          {/* Login Button (only if not logged in) */}
          {!isLoggedIn ? (
            <button
              className="btn btn-outline-light btn-sm rounded-pill px-3 ms-auto"
              style={{fontWeight: 500, fontSize: '1rem'}}
              onClick={handleLogin}
            >
              Login
            </button>
          ) : (
            <div style={{width: 44}}></div>
          )}
        </div>
      </nav>

      {/* Sidebar Overlay (only if logged in) */}
      {isLoggedIn && sidebarOpen && (
        <>
          {/* Overlay */}
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ background: 'rgba(0,0,0,0.4)', zIndex: 2000 }}
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar */}
          <div
            className="position-fixed top-0 start-0 h-100 d-flex flex-column justify-content-between"
            style={{ width: 320, maxWidth: '85vw', background: '#18181a', zIndex: 2100, boxShadow: '2px 0 16px rgba(0,0,0,0.4)' }}
          >
            {/* Sidebar Header */}
            <div className="d-flex align-items-center justify-content-between px-3 py-3 border-bottom" style={{ borderColor: '#232325' }}>
              <span className="fw-bold" style={{ color: '#fff', fontSize: 22 }}>
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#232325"/><path d="M16 7.5c-2.485 0-4.5 2.015-4.5 4.5 0 1.657 1.343 3 3 3h3c1.657 0 3-1.343 3-3 0-2.485-2.015-4.5-4.5-4.5zm0 2c1.38 0 2.5 1.12 2.5 2.5S17.38 14.5 16 14.5 13.5 13.38 13.5 12 14.62 9.5 16 9.5zm-7 10c0-2.21 3.582-4 8-4s8 1.79 8 4v1c0 1.104-.896 2-2 2H11c-1.104 0-2-.896-2-2v-1zm2 0v1h12v-1c0-1.104-3.582-2-8-2s-8 .896-8 2z" fill="#fff"/></svg>
              </span>
              <button className="btn btn-link text-white p-2" style={{ border: "none" }} onClick={() => setSidebarOpen(false)}>
                <X size={24} />
              </button>
            </div>
            {/* Sidebar Content: Chat List */}
            <div className="flex-grow-1 overflow-auto">
              <button className="btn btn-primary w-100 my-2" onClick={handleNewChat}>+ New Chat</button>
              {loadingChats ? (
                <div className="text-center text-muted py-2">Loading chats...</div>
              ) : (
                chats.map(chat => (
                  <div
                    key={chat.id}
                    className={`px-3 py-2 ${chat.id === currentChatId ? 'bg-secondary text-white' : 'text-white'}`}
                    style={{ cursor: 'pointer', borderRadius: 8, marginBottom: 4, background: chat.id === currentChatId ? '#232325' : 'transparent' }}
                    onClick={() => { setCurrentChatId(chat.id); setSidebarOpen(false); }}
                  >
                    {chat.title || 'Untitled Chat'}
                  </div>
                ))
              )}
            </div>
            {/* Sidebar Footer - Profile */}
            <div className="p-3 border-top" style={{ borderColor: '#232325' }}>
              <div
                className="d-flex align-items-center gap-3 rounded-4 px-2 py-2"
                style={{ cursor: 'pointer', background: showLogout ? '#232325' : 'transparent', transition: 'background 0.2s' }}
                onClick={() => setShowLogout((v) => !v)}
              >
                <img src={user?.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=232325&color=fff&size=64`} alt="avatar" width={36} height={36} className="rounded-circle border" style={{ borderColor: '#232325' }} />
                <div className="flex-grow-1">
                  <div className="fw-semibold text-white" style={{ fontSize: 16 }}>{user?.name || 'User'}</div>
                  <div className="text-muted small">User</div>
                </div>
                <User size={20} className="text-muted" />
              </div>
              {showLogout && (
                <button
                  className="btn btn-outline-danger w-100 mt-3 rounded-pill fw-semibold"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Chat Area (scrollable between top and bottom bars) */}
      <div
        className="w-100"
        style={{
          position: 'absolute',
          top: 56, // height of navbar
          bottom: 0,
          left: 0,
          right: 0,
          overflow: 'hidden',
        }}
      >
        {isLoggedIn ? (
          <ChatClient
            user={user}
            currentChatId={currentChatId}
            messages={messages}
            loading={loadingMessages}
            onSendMessage={handleSendMessage}
            isLoggedIn={true}
          />
        ) : (
          <ChatClient isLoggedIn={false} />
        )}
      </div>
    </div>
  );
} 