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
  const generateImage = trpc.generateImage.useMutation();

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
            console.log('[fetchAndSetMessages] Fetching messages for chat', currentChatId);
            const mapped = data.map((msg: any) => ({
              ...msg,
              role: msg.role === "user" ? "user" : "assistant",
              imageBase64: msg.image_base64 ?? undefined,
              isImagePrompt: msg.is_image_prompt ?? false
            }));
            console.log('[fetchAndSetMessages] Setting messages:', mapped);
            const deduped = mapped.filter((msg, idx, arr) =>
              idx === arr.findIndex(m =>
                m.content === msg.content &&
                m.role === msg.role &&
                m.isImagePrompt === msg.isImagePrompt &&
                m.chat_id === msg.chat_id
              )
            );
            setMessages(deduped);
            console.log('[fetchAndSetMessages] setMessages(deduped):', deduped);
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

  // Helper to fetch all messages for the current chat and update state
  const fetchAndSetMessages = async (chatId: string) => {
    console.log('[fetchAndSetMessages] Fetching messages for chat', chatId);
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      // Only keep [image] messages if they have imageBase64
      const mapped = data
        .filter((msg: any) => !(msg.content === '[image]' && !msg.image_base64))
        .map((msg: any) => ({
          ...msg,
          role: msg.role === "user" ? "user" : "assistant",
          imageBase64: msg.image_base64 ?? undefined,
          isImagePrompt: msg.is_image_prompt ?? false
        }));
      console.log('[fetchAndSetMessages] Setting messages:', mapped);
      setMessages(mapped);
    }
  };


  const [isImageGenerating, setIsImageGenerating] = useState(false);
  const handleSendMessage = async (content: string, role: string, imageBase64?: string, isImagePrompt?: boolean) => {
  console.log('[handleSendMessage] called with:', { content, role, imageBase64, isImagePrompt });
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
    // IMAGE GENERATION FLOW
    if (isImagePrompt) {
      // 1. Insert user prompt as image prompt
      console.log('[handleSendMessage] Inserting user image prompt', { chatId, content });
      const { data: promptMsg, error: promptErr } = await supabase
        .from('messages')
        .insert([{ chat_id: chatId, user_id: user.sub, content, role, image_base64: null, is_image_prompt: true }])
        .select()
        .single();
      console.log('[handleSendMessage] Supabase insert result for user image prompt:', { promptMsg, promptErr });
      if (!promptErr && promptMsg) {
        console.log('[handleSendMessage] Inserted user image prompt', promptMsg);
        // Do NOT setMessages optimistically here. Only update messages via fetchAndSetMessages after insert.
        await fetchAndSetMessages(chatId!);
      }
      setIsImageGenerating(true); // Start loading indicator
      // 2. Call Gemini image API
      try {
        console.log('[handleSendMessage] Calling Gemini image API', { prompt: content });
        await new Promise<void>((resolve, reject) => {
          generateImage.mutate(
            { prompt: content },
            {
              onSuccess: async (data: { imageBase64: string }) => {
                console.log('[handleSendMessage] Gemini image API returned', { imageBase64: data.imageBase64 });
                // 3. Insert assistant image response with image_base64
                console.log('[handleSendMessage] Inserting assistant image message to Supabase', { chatId, imageBase64: data.imageBase64 });
                const { data: imageMsg, error: imageErr } = await supabase
                  .from('messages')
                  .insert([{ chat_id: chatId!, user_id: user.sub, content: '[image]', role: 'assistant', image_base64: data.imageBase64, is_image_prompt: false }])
                  .select()
                  .single();
                console.log('[handleSendMessage] Supabase insert result for assistant image:', { imageMsg, imageErr });
                if (!imageErr && imageMsg) {
                  console.log('[handleSendMessage] Inserted assistant image message', imageMsg);
                  // Force refetch so UI is always up to date
                  await fetchAndSetMessages(chatId!);
                }
                setIsImageGenerating(false); // End loading indicator
                resolve();
              },
              onError: async (err: any) => {
                console.log('[handleSendMessage] Gemini image API failed', err);
                console.log('[handleSendMessage] Inserting assistant error message to Supabase', { chatId });
                const { data: errMsg } = await supabase
                  .from('messages')
                  .insert([{ chat_id: chatId!, user_id: user.sub, content: "Sorry, I couldn't generate an image for that prompt.", role: 'assistant', image_base64: null, is_image_prompt: false }])
                  .select()
                  .single();
                console.log('[handleSendMessage] Supabase insert result for assistant error:', { errMsg });
                if (errMsg) {
                  console.log('[handleSendMessage] Inserted assistant error message', errMsg);
                  await fetchAndSetMessages(chatId!);
                }
                setIsImageGenerating(false); // End loading indicator
                resolve();
              }
            }
          );
        });
      } catch (err) {
        console.log('[handleSendMessage] Error generating image:', err);
      }
    }
    // NORMAL TEXT FLOW
    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert([{ chat_id: chatId, user_id: user.sub, content, role, image_base64: imageBase64 ?? null, is_image_prompt: isImagePrompt ?? false }])
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
            <div className="d-flex align-items-center justify-content-end px-3 py-3 border-bottom" style={{ borderColor: '#232325' }}>

              <button className="btn btn-link text-white p-2" style={{ border: "none" }} onClick={() => setSidebarOpen(false)}>
                <X size={24} />
              </button>
            </div>
            {/* Sidebar Content: Chat List */}
            <div className="flex-grow-1 overflow-auto">
              <button
  className="w-100 my-2 fw-semibold"
  style={{
    background: '#232325',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 0',
    transition: 'background 0.2s',
    fontSize: '16px',
    letterSpacing: '0.5px',
    outline: 'none',
    cursor: 'pointer',
  }}
  onMouseOver={e => (e.currentTarget.style.background = '#34343a')}
  onMouseOut={e => (e.currentTarget.style.background = '#232325')}
  onClick={handleNewChat}
>
  New Chat
</button>
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
          <>
            <ChatClient
              user={user}
              currentChatId={currentChatId}
              messages={messages}
              loading={loadingMessages}
              onSendMessage={handleSendMessage}
              isLoggedIn={isLoggedIn}
            />
            {isImageGenerating && (
              <div className="d-flex flex-column w-100 mb-2">
                <div className="rounded-4 px-4 py-3 w-100 opacity-50" style={{fontSize: '1rem', background: '#26272b', color: '#fff', borderRadius: 18, minHeight: 48}}>
                  Generating image...
                </div>
              </div>
            )}
          </>
        ) : (
          <ChatClient isLoggedIn={false} />
        )}
      </div>
    </div>
  );
} 