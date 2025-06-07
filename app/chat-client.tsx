"use client";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { trpc } from '../trpc/client';
import { Plus, ArrowUp, Image as ImageIcon } from "lucide-react";
// Extend Message type locally to allow imageBase64 for local (logged-out) image messages
import type { Message as BaseMessage } from "../lib/types";

type Message = BaseMessage & { imageBase64?: string };

interface ChatClientProps {
    user?: any;
    currentChatId?: string | null;
    messages?: Message[];
    loading?: boolean;
    onSendMessage?: (content: string, role: string, imageBase64?: string, isImagePrompt?: boolean) => Promise<void>;
    isLoggedIn: boolean;
}

export default function ChatClient({ user, currentChatId, messages, loading, onSendMessage, isLoggedIn }: ChatClientProps) {
    const [message, setMessage] = useState("");
    const [localMessages, setLocalMessages] = useState<Message[]>([]);
    const [pendingMessages, setPendingMessages] = useState<Message[]>([]);
    const [geminiIsTyping, setGeminiIsTyping] = useState(false);
    const geminiMutation = trpc.gemini.useMutation();
    const generateImageMutation = trpc.generateImage.useMutation();
    const [imageMode, setImageMode] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [justCreatedChat, setJustCreatedChat] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const wasAtBottomRef = useRef(true);
    const prevScrollHeightRef = useRef(0);

    const handleSend = async () => {
        if (!message.trim()) return;
        setMessage("");
        const userMsg: Message = { role: "user", content: message };
        // IMAGE GENERATION FLOW - LOGGED IN
        if (isLoggedIn && imageMode && onSendMessage) {
            setGeminiIsTyping(true);
            // Insert user message as image prompt
            await onSendMessage(message, "user", undefined, true);
            try {
                await generateImageMutation.mutateAsync({ prompt: message });
                // Do NOT call onSendMessage for assistant image or error; parent handles it.
            } catch (err) {
                // Parent handles error message as well
            }
            setGeminiIsTyping(false);
            setImageMode(false);
            return;
        }
        // IMAGE GENERATION FLOW - LOGGED OUT
        if (!isLoggedIn && imageMode) {
            const imagePromptMsg: Message = { ...userMsg, isImagePrompt: true } as Message;
            setLocalMessages((prev) => [...prev, imagePromptMsg]);
            setGeminiIsTyping(true);
            try {
                const { imageBase64 } = await generateImageMutation.mutateAsync({ prompt: message });
                setLocalMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "[image]", imageBase64 }
                ]);
            } catch (err) {
                setLocalMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "Sorry, I couldn't generate an image for that prompt." }
                ]);
            }
            setGeminiIsTyping(false);
            setImageMode(false);
            return;
        }
        // Normal text flow
        if (isLoggedIn && onSendMessage) {
            // setPendingMessages((prev) => [...prev, userMsg]); // Disabled for logged-in users
            setGeminiIsTyping(true);
            if (!currentChatId) setJustCreatedChat(true);
            await onSendMessage(message, "user");
            // Filter out image requests and image responses from context
            const newHistory = [
                ...(messages ?? []),
                ...pendingMessages,
                userMsg
            ].filter(msg => !msg.imageBase64 && msg.content !== "[image]" && (msg as any).isImagePrompt !== true && (msg as any).is_image_prompt !== true);
            geminiMutation.mutate({ history: newHistory });
        } else {
            setLocalMessages((prev) => [...prev, userMsg]);
            setGeminiIsTyping(true);
            // Filter out image requests and image responses from context
            const newHistory = [
                ...localMessages,
                ...pendingMessages,
                userMsg
            ].filter(msg => !msg.imageBase64 && msg.content !== "[image]" && !(msg as any).isImagePrompt);
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
                    setLocalMessages((prev) => [
                        ...prev,
                        ...pendingMessages,
                        { role: "assistant", content: geminiMutation.data.response ?? "" }
                    ]);
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

    // Debug: Log messages prop
    console.log("Messages prop received by ChatClient:", messages);
    // Compose the display messages
    let displayMessages: Message[] = [];
    if (isLoggedIn) {
        displayMessages = [...(messages ?? [])];
        // Deduplicate user image prompts: only show the latest for each unique content
        const seen = new Set<string>();
        displayMessages = displayMessages.filter((msg, idx, arr) => {
            if (msg.role === 'user' && (msg as any).isImagePrompt) {
                const key = msg.content + '__' + msg.role + '__' + (msg as any).isImagePrompt;
                if (seen.has(key)) return false;
                seen.add(key);
                // Only keep the last occurrence
                return arr.findLastIndex(m => (m.content + '__' + m.role + '__' + (m as any).isImagePrompt) === key) === idx;
            }
            return true;
        });
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
                    {displayMessages.map((msg, idx) => {
                        if (msg.role === 'user') {
                            return (
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
                            );
                        } else if (msg.content === '[image]' && msg.imageBase64) {
                            return (
                                <div key={msg.id ?? idx} className="d-flex flex-column w-100 mb-2">
                                    <div
                                        className="rounded-4 px-4 py-3 w-100 d-flex justify-content-center"
                                        style={{
                                            fontSize: '1rem',
                                            background: '#26272b',
                                            color: '#fff',
                                            borderRadius: 18,
                                            minHeight: 48,
                                        }}
                                    >
                                        <img src={`data:image/png;base64,${msg.imageBase64}`} alt="Generated" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12 }} />
                                    </div>
                                </div>
                            );
                        } else {
                            return (
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
                            );
                        }
                    })}
                    {(imageMode && geminiIsTyping) || geminiIsTyping ? (
                        <div className="d-flex flex-column w-100 mb-2">
                            <div className="rounded-4 px-4 py-3 w-100 opacity-50" style={{fontSize: '1rem', background: '#26272b', color: '#fff', borderRadius: 18, minHeight: 48}}>
                                {imageMode ? "Generating image..." : "Gemini is typing..."}
                            </div>
                        </div>
                    ) : null}
                </div>
                <div ref={bottomRef} />
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
                                placeholder={imageMode ? "Describe the image you want..." : "Ask anything"}
                                className="form-control border-0 bg-transparent text-white flex-grow-1"
                                style={{ outline: "none", boxShadow: "none", background: 'transparent', fontSize: '1rem' }}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                                disabled={geminiMutation.isPending || generateImageMutation.isPending}
                            />
                            <button
                                className={`btn btn-link p-2 ${imageMode ? 'text-primary' : 'text-muted'}`}
                                style={{ border: "none" }}
                                title="Generate Image"
                                onClick={() => setImageMode((v) => !v)}
                                disabled={geminiMutation.isPending || generateImageMutation.isPending}
                            >
                                <ImageIcon size={20} />
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
