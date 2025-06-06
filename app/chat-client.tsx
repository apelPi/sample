"use client";
import { useState, useEffect, useRef } from "react";
import { trpc } from '../trpc/client';
import { Plus, Wrench, Mic, ArrowUp } from "lucide-react";

// Define the message type
interface Message {
    role: "user" | "assistant";
    content: string;
}

export default function ChatClient() {
    const [message, setMessage] = useState("");
    const [history, setHistory] = useState<Message[]>([]);
    const geminiMutation = trpc.gemini.useMutation();
    const bottomRef = useRef<HTMLDivElement>(null);

    const handleSend = () => {
        if (!message.trim()) return;
        const newHistory: Message[] = [
            ...history,
            { role: "user", content: message }
        ];
        geminiMutation.mutate({ history: newHistory });
        setHistory(newHistory);
        setMessage("");
    };

    useEffect(() => {
        if (geminiMutation.data) {
            setHistory((prev) => {
                // Only append assistant message if the last message is from the user
                if (prev.length === 0 || prev[prev.length - 1].role !== 'assistant') {
                    return [
                        ...prev,
                        { role: "assistant", content: geminiMutation.data.response ?? "" }
                    ];
                }
                return prev;
            });
        }
    }, [geminiMutation.data]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history, geminiMutation.isPending]);

    return (
        <div className="d-flex flex-column h-100 position-relative" style={{ minHeight: '100vh', background: '#18181a' }}>
            {/* Main Content */}
            <div
                className="flex-grow-1 px-2 pb-0 overflow-auto"
                style={{
                    marginBottom: 0,
                    paddingBottom: 70, // for input bar
                    paddingTop: 56,    // match header height
                    height: '100%',
                }}
            >
                {/* Always render chat history */}
                <div className="d-flex flex-column gap-2 py-2">
                    {history.length === 0 && !geminiMutation.isPending ? (
                        <h2 className="display-6 fw-light text-center lh-base text-white" style={{marginTop: '30%'}}>What's on the agenda today?</h2>
                    ) : null}
                    {history.map((msg, idx) => (
                        msg.role === 'user' ? (
                            <div key={idx} className="d-flex justify-content-end align-items-start gap-2 mb-1 w-100">
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
                            <div key={idx} className="d-flex flex-column w-100 mb-2">
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
                    {geminiMutation.isPending && (
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
