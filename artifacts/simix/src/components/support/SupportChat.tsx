import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, ImagePlus, Trash2, Minimize2, Maximize2, Bot, Loader2, ChevronDown } from "lucide-react";

/* ── Types ───────────────────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageData?: string;
  createdAt: Date;
  streaming?: boolean;
}

/* ── Helpers ─────────────────────────────────────────────── */
function getSessionId(): string {
  const key = "simix_support_session";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function getApiBase(): string {
  return import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* ── Avatar ──────────────────────────────────────────────── */
function SimiaAvatar({ size = 40, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {pulse && (
        <span className="absolute inset-0 rounded-full bg-purple-500 opacity-30 animate-ping" />
      )}
      <div
        className="relative flex items-center justify-center rounded-full text-white font-bold"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #7C3AED 0%, #A855F7 50%, #EC4899 100%)",
          fontSize: size * 0.4,
          boxShadow: "0 0 20px rgba(124,58,237,0.5)",
        }}
      >
        <Bot size={size * 0.5} />
      </div>
    </div>
  );
}

/* ── Message bubble ───────────────────────────────────────── */
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"} items-end mb-3`}
    >
      {!isUser && (
        <div className="flex-shrink-0 mb-1">
          <SimiaAvatar size={28} />
        </div>
      )}
      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        {msg.imageData && (
          <div className={`rounded-2xl overflow-hidden border border-white/10 ${isUser ? "rounded-br-sm" : "rounded-bl-sm"}`}>
            <img src={msg.imageData} alt="uploaded" className="max-w-full max-h-48 object-contain" />
          </div>
        )}
        {msg.content && (
          <div
            className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
              isUser
                ? "bg-gradient-to-br from-purple-600 to-purple-800 text-white rounded-2xl rounded-br-sm shadow-lg shadow-purple-900/30"
                : "bg-white/10 backdrop-blur-sm border border-white/10 text-white/90 rounded-2xl rounded-bl-sm"
            }`}
          >
            {msg.streaming ? (
              <>
                {msg.content}
                <span className="inline-block w-0.5 h-3.5 bg-purple-300 ml-0.5 animate-pulse rounded" />
              </>
            ) : msg.content}
          </div>
        )}
        <span className="text-[10px] text-white/30 px-1">{formatTime(msg.createdAt)}</span>
      </div>
    </motion.div>
  );
}

/* ── Typing indicator ────────────────────────────────────── */
function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex items-end gap-2 mb-3"
    >
      <SimiaAvatar size={28} />
      <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-3">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-purple-400"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main component ──────────────────────────────────────── */
export default function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [unread, setUnread] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(getSessionId());

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }, []);

  /* Load history on open */
  useEffect(() => {
    if (!isOpen || messages.length > 0) return;
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/support/history/${sessionId.current}`);
        const data = await res.json();
        if (data.messages?.length > 0) {
          setMessages(data.messages.map((m: Message) => ({ ...m, createdAt: new Date(m.createdAt) })));
        } else {
          /* Welcome message */
          setMessages([{
            id: crypto.randomUUID(),
            role: "assistant",
            content: "👋 Bonjour ! Je suis **Simia**, votre assistante Simix. Comment puis-je vous aider aujourd'hui ?\n\nVous pouvez me poser des questions sur vos numéros, votre solde, les paiements ou tout autre sujet. 😊",
            createdAt: new Date(),
          }]);
        }
      } catch {
        setMessages([{
          id: crypto.randomUUID(),
          role: "assistant",
          content: "👋 Bonjour ! Je suis Simia, votre assistante Simix. Comment puis-je vous aider ?",
          createdAt: new Date(),
        }]);
      }
    })();
  }, [isOpen]);

  /* Auto-scroll */
  useEffect(() => {
    if (isOpen && !isMinimized) scrollToBottom();
  }, [messages, isTyping, isOpen, isMinimized, scrollToBottom]);

  /* Track scroll position */
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollBtn(distFromBottom > 80);
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  /* Unread count */
  useEffect(() => {
    if (!isOpen) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant") setUnread(n => n + 1);
    }
  }, [messages, isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setUnread(0);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Image max 5MB"); return; }
    const reader = new FileReader();
    reader.onload = ev => setImageData(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageData) || isStreaming) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      imageData: imageData ?? undefined,
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setImageData(null);
    setIsTyping(true);
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();

    try {
      const res = await fetch(`${getApiBase()}/support/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId.current,
          message: text,
          imageData: imageData ?? undefined,
          language: navigator.language.startsWith("en") ? "en" : "fr",
        }),
      });

      if (!res.ok || !res.body) throw new Error("API error");

      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
        streaming: true,
      }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + data.content } : m
              ));
            }
            if (data.done) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, streaming: false } : m
              ));
            }
            if (data.error) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: data.error, streaming: false } : m
              ));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setIsTyping(false);
      setMessages(prev => {
        const existing = prev.find(m => m.id === assistantId);
        if (existing) {
          return prev.map(m => m.id === assistantId
            ? { ...m, content: "Désolé, une erreur s'est produite. Veuillez réessayer.", streaming: false }
            : m
          );
        }
        return [...prev, {
          id: assistantId,
          role: "assistant",
          content: "Désolé, une erreur s'est produite. Veuillez réessayer.",
          createdAt: new Date(),
        }];
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, imageData, isStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = async () => {
    await fetch(`${getApiBase()}/support/history/${sessionId.current}`, { method: "DELETE" });
    sessionId.current = crypto.randomUUID();
    localStorage.setItem("simix_support_session", sessionId.current);
    setMessages([{
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Conversation effacée. Comment puis-je vous aider ?",
      createdAt: new Date(),
    }]);
  };

  return (
    <>
      {/* ── Floating button ── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            onClick={handleOpen}
            className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full shadow-2xl cursor-pointer group"
            style={{
              width: 60,
              height: 60,
              background: "linear-gradient(135deg, #7C3AED, #A855F7, #EC4899)",
              boxShadow: "0 0 30px rgba(124,58,237,0.6), 0 8px 24px rgba(0,0,0,0.4)",
            }}
            aria-label="Ouvrir le support"
          >
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
            >
              <Bot size={28} color="white" />
            </motion.div>
            {unread > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
              >
                {unread > 9 ? "9+" : unread}
              </motion.div>
            )}
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full border-2 border-purple-400 opacity-0 group-hover:opacity-100 animate-ping" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat window ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={isMinimized
              ? { opacity: 1, y: 0, scale: 1, height: "auto" }
              : { opacity: 1, y: 0, scale: 1 }
            }
            exit={{ opacity: 0, y: 40, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl overflow-hidden"
            style={{
              width: "min(420px, calc(100vw - 24px))",
              height: isMinimized ? "auto" : "min(620px, calc(100vh - 100px))",
              background: "linear-gradient(160deg, rgba(15,10,30,0.97) 0%, rgba(25,15,50,0.97) 100%)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(124,58,237,0.3)",
              boxShadow: "0 0 60px rgba(124,58,237,0.25), 0 24px 48px rgba(0,0,0,0.6)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{
                background: "linear-gradient(90deg, rgba(124,58,237,0.4) 0%, rgba(168,85,247,0.2) 100%)",
                borderBottom: "1px solid rgba(124,58,237,0.25)",
              }}
            >
              <SimiaAvatar size={38} pulse={!isStreaming} />
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm">Simia — Support Simix</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]" />
                  <span className="text-green-400 text-[11px]">En ligne • Répond instantanément</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearHistory}
                  className="p-1.5 text-white/40 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors"
                  title="Effacer la conversation"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  onClick={() => setIsMinimized(v => !v)}
                  className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                >
                  {isMinimized ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <AnimatePresence>
              {!isMinimized && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col flex-1 min-h-0"
                >
                  {/* Quick actions */}
                  {messages.length <= 1 && (
                    <div className="px-3 py-2 flex flex-wrap gap-1.5 border-b border-white/5">
                      {[
                        "Comment recharger ?",
                        "Numéro pas reçu",
                        "SMS non reçu",
                        "Mon solde",
                      ].map(q => (
                        <button
                          key={q}
                          onClick={() => { setInput(q); inputRef.current?.focus(); }}
                          className="text-[11px] px-2.5 py-1 rounded-full border border-purple-500/40 text-purple-300 hover:bg-purple-500/20 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto px-3 py-3 space-y-0 scroll-smooth"
                    style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(124,58,237,0.3) transparent" }}
                  >
                    {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                    {isTyping && <TypingIndicator />}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Scroll to bottom button */}
                  <AnimatePresence>
                    {showScrollBtn && (
                      <motion.button
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        onClick={() => scrollToBottom()}
                        className="absolute bottom-24 right-4 p-1.5 rounded-full bg-purple-600/90 text-white shadow-lg"
                      >
                        <ChevronDown size={14} />
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {/* Image preview */}
                  <AnimatePresence>
                    {imageData && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mx-3 mb-2 relative inline-block"
                      >
                        <img src={imageData} alt="preview" className="h-16 rounded-xl border border-purple-500/40 object-cover" />
                        <button
                          onClick={() => setImageData(null)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center text-xs"
                        >×</button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Input */}
                  <div
                    className="flex items-end gap-2 px-3 py-3 flex-shrink-0"
                    style={{ borderTop: "1px solid rgba(124,58,237,0.2)", background: "rgba(0,0,0,0.2)" }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-shrink-0 p-2 text-white/40 hover:text-purple-400 rounded-xl hover:bg-white/5 transition-colors"
                      title="Envoyer une image"
                    >
                      <ImagePlus size={18} />
                    </button>
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Écrivez votre message... (Entrée pour envoyer)"
                      rows={1}
                      disabled={isStreaming}
                      className="flex-1 bg-white/8 text-white placeholder-white/30 text-sm rounded-xl px-3 py-2 outline-none resize-none border border-white/10 focus:border-purple-500/60 transition-colors disabled:opacity-50"
                      style={{
                        maxHeight: "100px",
                        minHeight: "38px",
                        background: "rgba(255,255,255,0.06)",
                        scrollbarWidth: "none",
                      }}
                      onInput={e => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = Math.min(el.scrollHeight, 100) + "px";
                      }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={isStreaming || (!input.trim() && !imageData)}
                      className="flex-shrink-0 p-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: isStreaming || (!input.trim() && !imageData)
                          ? "rgba(124,58,237,0.3)"
                          : "linear-gradient(135deg, #7C3AED, #A855F7)",
                        boxShadow: (!isStreaming && (input.trim() || imageData))
                          ? "0 0 16px rgba(124,58,237,0.5)"
                          : "none",
                      }}
                    >
                      {isStreaming
                        ? <Loader2 size={18} color="white" className="animate-spin" />
                        : <Send size={18} color="white" />
                      }
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
