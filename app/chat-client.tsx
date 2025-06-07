"use client";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { trpc } from '../trpc/client';
import { Plus, Wrench, Mic, ArrowUp } from "lucide-react";
import type { Message } from "../lib/types";

interface ChatClientProps {
    user?: any;
    currentChatId?: string | null;
    messages?: Message[];
    loading?: boolean;
    onSendMessage?: (content: string, role: string) => Promise<void>;
    isLoggedIn: boolean;
}

export default function ChatClient({ user, currentChatId, messages, loading, onSendMessage, isLoggedIn }: ChatClientProps) {
    const [message, setMessage] = useState("");
    const [localMessages, setLocalMessages] = useState<Message[]>([]);
    const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
    const [geminiIsTyping, setGeminiIsTyping] = useState(false);
    const geminiMutation = trpc.gemini.useMutation();
    const bottomRef = useRef<HTMLDivElement>(null);
    const [justCreatedChat, setJustCreatedChat] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const wasAtBottomRef = useRef(true);
    const prevScrollHeightRef = useRef(0);

    const handleSend = async () => {
        if (!message.trim()) return;
        setMessage("");
        const userMsg: Message = { role: "user", content: message };
        if (isLoggedIn && onSendMessage) {
            setPendingMessages((prev) => [...prev, userMsg]);
            setGeminiIsTyping(true);
            if (!currentChatId) setJustCreatedChat(true);
            await onSendMessage(message, "user");
            const newHistory = [
                ...(messages ?? []),
                ...pendingMessages,
                userMsg
            ];
            geminiMutation.mutate({ history: newHistory });
        } else {
            setLocalMessages((prev) => [...prev, userMsg]);
            setPendingMessages((prev) => [...prev, userMsg]);
            setGeminiIsTyping(true);
            const newHistory = [
                ...localMessages,
                ...pendingMessages,
                userMsg
            ];
            geminiMutation.mutate({ history: newHistory });
        }
    };

    useEffect(() => {
        if (geminiMutation.data) {
            if (isLoggedIn && onSendMessage) {
                if (geminiMutation.data.response) {
                    onSendMessage(geminiMutation.data.response, "assistant");
                }
            } else {
                if (geminiMutation.data.response) {
                    setLocalMessages((prev) => [...prev, { role: "assistant", content: geminiMutation.data.response ?? "" }]);
                }
            }
            setPendingMessages([]);
            setGeminiIsTyping(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [geminiMutation.data]);

    useEffect(() => {
        if (isLoggedIn && messages && pendingMessages.length > 0) {
            const lastPending = pendingMessages[pendingMessages.length - 1];
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastPending && lastMsg.content === lastPending.content && lastMsg.role === lastPending.role) {
                setPendingMessages([]);
                setJustCreatedChat(false);
            }
        }
    }, [messages, pendingMessages, isLoggedIn]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, localMessages, pendingMessages, geminiIsTyping, geminiMutation.isPending]);

    // Compose the display messages
    let displayMessages: Message[] = [];
    if (isLoggedIn) {
        displayMessages = [...(messages ?? []), ...pendingMessages];
    } else {
        displayMessages = [...localMessages, ...pendingMessages];
    }

    // BEFORE messages change: record scroll position and scroll height
    useLayoutEffect(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        prevScrollHeightRef.current = el.scrollHeight;
        // This effect should run before displayMessages changes
    }, [messages, localMessages, pendingMessages, geminiIsTyping]);

    // AFTER messages change: restore scroll position
    useLayoutEffect(() => {
        const el = chatContainerRef.current;
        if (!el) return;
        if (wasAtBottomRef.current) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        } else {
            const diff = el.scrollHeight - prevScrollHeightRef.current;
            el.scrollTop += diff;
        }
        // This effect should run after displayMessages changes
    }, [displayMessages.length, geminiIsTyping]);

    // Only show loading when switching to an existing chat, not when sending the first message
    const showLoading = loading && isLoggedIn && currentChatId && (messages?.length ?? 0) === 0 && !justCreatedChat;

    return (
        <div className="d-flex flex-column h-100 position-relative" style={{ minHeight: '100vh', background: '#18181a' }}>
            {/* Main Content */}
            <div
                ref={chatContainerRef}
                className="flex-grow-1 px-2 overflow-auto"
                style={{
                    paddingBottom: 80, // slightly more than input bar height
                    paddingTop: 56,    // match header height
                    height: '100%',
                }}
            >
                {/* Always render chat history */}
                <div className="d-flex flex-column gap-2 py-2">
                    {showLoading ? (
                        <div className="text-center text-muted py-2">Loading messages...</div>
                    ) : displayMessages.length === 0 && !geminiIsTyping ? (
                        <h2 className="display-6 fw-light text-center lh-base text-white" style={{marginTop: '30%'}}>What's on the agenda today?</h2>
                    ) : null}
                    {displayMessages.map((msg, idx) => (
                        msg.role === 'user' ? (
                            <div key={msg.id ?? idx} className="d-flex justify-content-end align-items-start gap-2 mb-1 w-100">
                                <div
                                    className="rounded-pill px-4 py-2"
                                    style={{
                                        maxWidth: '80%',
                                        fontSize: '1rem',
                                        wordBreak: 'break-word',
                                        borderRadius: 24,
                                        background: '#232325',
                                        color: '#fff',
                                        textAlign: 'right',
                                    }}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        ) : (
                            <div key={msg.id ?? idx} className="d-flex flex-column w-100 mb-2">
                                <div
                                    className="rounded-4 px-4 py-3 w-100"
                                    style={{
                                        fontSize: '1rem',
                                        background: '#26272b',
                                        color: '#fff',
                                        borderRadius: 18,
                                        minHeight: 48,
                                    }}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        )
                    ))}
                    {geminiIsTyping && (
                        <div className="d-flex flex-column w-100 mb-2">
                            <div className="rounded-4 px-4 py-3 w-100 opacity-50" style={{fontSize: '1rem', background: '#26272b', color: '#fff', borderRadius: 18, minHeight: 48}}>
                                Gemini is typing...
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
                {geminiMutation.error && (
                    <div style={{ color: 'red' }}>Error: {geminiMutation.error.message}</div>
                )}
            </div>
            {/* Input Section - fixed to bottom */}
            <div className="fixed-bottom w-100" style={{background: '#18181a', zIndex: 100, boxShadow: '0 -2px 8px rgba(0,0,0,0.2)'}}>
                <div className="container-fluid px-0">
                    <div className="position-relative px-2 pt-2 pb-2">
                        <div className="d-flex align-items-center gap-2 bg-secondary rounded-pill px-3 py-2" style={{background: '#232325'}}>
                            <button className="btn btn-link text-muted p-2" style={{ border: "none" }}>
                                <Plus size={20} />
                            </button>
                            <input
                                type="text"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Ask anything"
                                className="form-control border-0 bg-transparent text-white flex-grow-1"
                                style={{ outline: "none", boxShadow: "none", background: 'transparent', fontSize: '1rem' }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                                disabled={geminiMutation.isPending}
                            />
                            <div className="d-flex align-items-center gap-2 text-muted">
                                <Wrench size={16} />
                            </div>
                            <button className="btn btn-link text-muted p-2" style={{ border: "none" }}>
                                <Mic size={20} />
                            </button>
                            <button
                                className="btn btn-secondary rounded-circle d-flex align-items-center justify-content-center"
                                style={{ width: "36px", height: "36px", background: '#4f4f51', border: 'none' }}
                                disabled={!message.trim() || geminiMutation.isPending}
                                onClick={handleSend}
                            >
                                <ArrowUp size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
