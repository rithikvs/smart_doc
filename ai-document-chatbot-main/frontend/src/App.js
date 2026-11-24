import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  MessageSquare,
  Plus,
  Upload,
  Search,
  Trash2,
  FileText,
  User as UserIcon,
  PanelRight,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Copy,
  Check,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  Send,
  Sparkles,
  Paperclip,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  ExternalLink,
  Bot
} from 'lucide-react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

function App() {
  // ---- Conversations State ----
  const [conversations, setConversations] = useState(() => {
    try {
      const saved = localStorage.getItem('smartdoc_conversations');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [{
      id: 'conv-' + Date.now(),
      title: 'New Conversation',
      date: 'Today',
      messages: []
    }];
  });

  const [activeConvId, setActiveConvId] = useState(() => {
    return conversations[0]?.id || 'default';
  });

  // ---- Documents History State ----
  const [documents, setDocuments] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);

  // ---- Document Viewer State (User-Controlled) ----
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerZoom, setViewerZoom] = useState(100);

  // ---- Chat & Input State ----
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsedTimer, setElapsedTimer] = useState(0);

  // ---- Search & Modals ----
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [activeSourcesMsgId, setActiveSourcesMsgId] = useState(null);
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const modalFileInputRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const textareaRef = useRef(null);

  // Active conversation object
  const activeConversation = conversations.find((c) => c.id === activeConvId) || conversations[0];
  const messages = useMemo(() => activeConversation?.messages || [], [activeConversation]);

  // Persist conversations in localStorage
  useEffect(() => {
    try {
      localStorage.setItem('smartdoc_conversations', JSON.stringify(conversations));
    } catch (e) {
      console.error(e);
    }
  }, [conversations]);

  // Fetch documents from backend on mount
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/documents/list`);
      if (res.data && res.data.documents) {
        setDocuments(res.data.documents);
        if (!activeDocument && res.data.documents.length > 0) {
          setActiveDocument(res.data.documents[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load documents list:', err);
    }
  }, [activeDocument]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Live stopwatch while loading response
  useEffect(() => {
    if (loading) {
      const startTime = performance.now();
      timerIntervalRef.current = setInterval(() => {
        setElapsedTimer(((performance.now() - startTime) / 1000).toFixed(1));
      }, 100);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setElapsedTimer(0);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [loading]);

  // Show auto-dismissing toast notifications
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // ---- Conversation Management ----
  const createNewChat = () => {
    const newId = 'conv-' + Date.now();
    const newConv = {
      id: newId,
      title: 'New Conversation',
      date: 'Today',
      messages: []
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newId);
  };

  const deleteConversation = (e, convId) => {
    e.stopPropagation();
    const remaining = conversations.filter((c) => c.id !== convId);
    if (remaining.length === 0) {
      const newConv = { id: 'conv-' + Date.now(), title: 'New Conversation', date: 'Today', messages: [] };
      setConversations([newConv]);
      setActiveConvId(newConv.id);
    } else {
      setConversations(remaining);
      if (activeConvId === convId) {
        setActiveConvId(remaining[0].id);
      }
    }
    showToast('Conversation deleted', 'info');
  };

  const appendMessageToActive = (messageObj) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConvId) {
          const updatedMessages = [...c.messages, messageObj];
          // Auto-generate title from first user message
          let title = c.title;
          if (c.messages.length === 0 && messageObj.role === 'user') {
            title = messageObj.content.slice(0, 32) + (messageObj.content.length > 32 ? '...' : '');
          }
          return { ...c, title, messages: updatedMessages };
        }
        return c;
      })
    );
  };

  // ---- Direct Document Upload Logic ----
  const handleUploadFile = async (file) => {
    if (!file) return;

    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      showToast('Please upload a PDF, DOC, or DOCX document.', 'error');
      return;
    }

    setUploading(true);
    showToast(`Uploading and processing ${file.name}...`, 'info');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`${API_BASE_URL}/api/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      const localBlobUrl = URL.createObjectURL(file);
      const newDoc = {
        id: res.data.document_id,
        filename: res.data.filename,
        upload_date: 'Today',
        size: file.size,
        status: 'Ready',
        fileUrl: localBlobUrl
      };

      setActiveDocument(newDoc);
      fetchDocuments();
      showToast(`Document "${res.data.filename}" processed and ready!`, 'success');

      appendMessageToActive({
        id: 'msg-' + Date.now(),
        role: 'assistant',
        content: `Document **${res.data.filename}** has been indexed successfully. You can now ask questions about it or reference specific sections.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: null
      });
    } catch (err) {
      console.error('Upload failed:', err);
      showToast(err.response?.data?.detail || 'Error uploading document', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ---- Delete Single Document File ----
  const handleDeleteDocument = async (e, filename) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_BASE_URL}/api/documents/file/${encodeURIComponent(filename)}`);
      setDocuments((prev) => {
        const remaining = prev.filter((d) => d.filename !== filename);
        if (activeDocument?.filename === filename) {
          setActiveDocument(remaining.length > 0 ? remaining[0] : null);
          if (remaining.length === 0) {
            setDocumentViewerOpen(false);
          }
        }
        return remaining;
      });
      showToast(`Deleted ${filename}`, 'info');
    } catch (err) {
      showToast('Failed to delete document', 'error');
    }
  };

  // ---- Delete All Uploaded Documents ----
  const handleDeleteAllDocuments = async (e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete all uploaded documents and clear the index?")) {
      return;
    }
    try {
      await axios.delete(`${API_BASE_URL}/api/documents/all`);
      setDocuments([]);
      setActiveDocument(null);
      setDocumentViewerOpen(false);
      showToast("All documents deleted and index cleared", "info");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete all documents", "error");
    }
  };

  // ---- Sending Chat Messages with Accurate Duration ----
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const queryText = inputMessage.trim();
    setInputMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMsg = {
      id: 'msg-u-' + Date.now(),
      role: 'user',
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    appendMessageToActive(userMsg);

    setLoading(true);
    const startTiming = performance.now();

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/chat/`,
        {
          message: queryText,
          conversation_id: activeConvId,
          document_id: activeDocument?.id || undefined
        },
        { timeout: 90000 }
      );

      const elapsed = ((performance.now() - startTiming) / 1000).toFixed(1);

      appendMessageToActive({
        id: 'msg-a-' + Date.now(),
        role: 'assistant',
        content: res.data.response,
        sources: res.data.sources || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: `${elapsed}s`
      });
    } catch (err) {
      const elapsed = ((performance.now() - startTiming) / 1000).toFixed(1);
      const errMsg = err.response?.data?.detail || err.message || 'Error communicating with server.';
      appendMessageToActive({
        id: 'msg-a-' + Date.now(),
        role: 'assistant',
        content: `❌ **Request Failed**: ${errMsg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: `${elapsed}s`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-resize textarea
  const handleTextareaInput = (e) => {
    setInputMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  };

  // ---- Citation Click Handler ----
  const handleCitationClick = (pageNum) => {
    setViewerPage(pageNum);
    setDocumentViewerOpen(true);
  };

  // ---- Copy Message Content ----
  const handleCopyMessage = (msgId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // ---- Regenerate Response ----
  const handleRegenerate = (msgIndex) => {
    // Find the previous user message
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        setInputMessage(messages[i].content);
        break;
      }
    }
  };

  // ---- Toggle Feedback ----
  const toggleLike = (msgId) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConvId) {
          const updated = c.messages.map((m) =>
            m.id === msgId ? { ...m, liked: !m.liked, disliked: false } : m
          );
          return { ...c, messages: updated };
        }
        return c;
      })
    );
  };

  const toggleDislike = (msgId) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConvId) {
          const updated = c.messages.map((m) =>
            m.id === msgId ? { ...m, disliked: !m.disliked, liked: false } : m
          );
          return { ...c, messages: updated };
        }
        return c;
      })
    );
  };

  // ---- Inline Markdown & Citation Parser ----
  const renderMarkdown = (text) => {
    if (!text) return null;

    // Split code blocks ```
    const codeBlockRegex = /```([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'code', content: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts.map((part, pIdx) => {
      if (part.type === 'code') {
        return (
          <div key={pIdx} className="markdown-code-block">
            <div className="markdown-code-header">
              <span>Code Snippet</span>
              <button
                className="btn-copy-code"
                onClick={() => navigator.clipboard.writeText(part.content)}
              >
                <Copy size={12} /> Copy
              </button>
            </div>
            <pre>{part.content}</pre>
          </div>
        );
      }

      // Paragraph / line rendering with citation and bold support
      const lines = part.content.split('\n');
      return (
        <div key={pIdx}>
          {lines.map((line, lIdx) => {
            if (!line.trim()) return <div key={lIdx} style={{ height: '6px' }} />;

            // Header tags
            if (line.startsWith('### ')) return <h3 key={lIdx}>{line.slice(4)}</h3>;
            if (line.startsWith('## ')) return <h2 key={lIdx}>{line.slice(3)}</h2>;
            if (line.startsWith('# ')) return <h1 key={lIdx}>{line.slice(2)}</h1>;

            // List items
            const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ');
            const cleanLine = isBullet ? line.trim().slice(2) : line;

            // Citation replacement: (Page 2/3), [Page 2], (Page 2), (4/34)
            const citationRegex = /(\(Page\s*(\d+)(?:\/\d+)?\)|\(Page\s*(\d+)\)|\[Page\s*(\d+)(?:\/\d+)?\]|\((\d+)\/\d+\))/gi;
            const segments = [];
            let cLast = 0;
            let cMatch;

            while ((cMatch = citationRegex.exec(cleanLine)) !== null) {
              if (cMatch.index > cLast) {
                segments.push(cleanLine.slice(cLast, cMatch.index));
              }
              const pageNum = parseInt(cMatch[2] || cMatch[3] || cMatch[4] || cMatch[5], 10) || 1;
              segments.push(
                <button
                  key={cMatch.index}
                  className="citation-pill"
                  title={`View Page ${pageNum} in Document Viewer`}
                  onClick={() => handleCitationClick(pageNum)}
                >
                  <FileText size={11} /> Page {pageNum}
                </button>
              );
              cLast = cMatch.index + cMatch[0].length;
            }
            if (cLast < cleanLine.length) {
              segments.push(cleanLine.slice(cLast));
            }

            // Bold formatting inside segments
            const renderedSegments = segments.map((seg, sIdx) => {
              if (typeof seg !== 'string') return seg;
              const boldParts = seg.split(/(\*\*.*?\*\*)/g);
              return boldParts.map((bp, bIdx) => {
                if (bp.startsWith('**') && bp.endsWith('**')) {
                  return <strong key={bIdx}>{bp.slice(2, -2)}</strong>;
                }
                return bp;
              });
            });

            if (isBullet) {
              return (
                <ul key={lIdx} style={{ margin: '3px 0 3px 20px' }}>
                  <li>{renderedSegments}</li>
                </ul>
              );
            }

            return <p key={lIdx}>{renderedSegments}</p>;
          })}
        </div>
      );
    });
  };

  // Filtered lists for search
  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredDocuments = documents.filter((d) =>
    d.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Document file URL for iframe
  const viewerUrl = activeDocument
    ? activeDocument.fileUrl || `${API_BASE_URL}/api/documents/file/${encodeURIComponent(activeDocument.filename)}`
    : null;

  return (
    <div className="app-container">
      {/* ====================================================================
          LEFT SIDEBAR (~260px)
          ==================================================================== */}
      <aside className="sidebar">
        {/* Header Branding */}
        <div className="sidebar-header">
          <div className="brand-badge">
            <div className="brand-icon">
              <Bot size={18} />
            </div>
            <div>
              <span className="brand-title">SmartDoc AI</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sidebar-actions">
          <button className="btn-new-chat" onClick={createNewChat}>
            <Plus size={15} />
            <span>New Chat</span>
          </button>
          <button
            className="btn-upload-sidebar"
            onClick={() => modalFileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={14} />
            <span>{uploading ? 'Processing...' : 'Upload Document'}</span>
          </button>
          <input
            type="file"
            ref={modalFileInputRef}
            onChange={(e) => handleUploadFile(e.target.files[0])}
            accept=".pdf,.doc,.docx"
            style={{ display: 'none' }}
          />
        </div>

        {/* Search Input */}
        <div className="sidebar-search">
          <div className="search-input-wrapper">
            <Search size={14} />
            <input
              type="text"
              className="search-input"
              placeholder="Search chats & docs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Scrollable History Lists */}
        <div className="sidebar-scroll-area">
          {/* Chat History Section */}
          <div>
            <div className="section-label">
              <span>Chat History</span>
              <span className="section-count">{filteredConversations.length}</span>
            </div>
            <div className="history-list">
              {filteredConversations.length === 0 ? (
                <div className="empty-history-text">No conversations found</div>
              ) : (
                filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`history-item ${conv.id === activeConvId ? 'active' : ''}`}
                    onClick={() => setActiveConvId(conv.id)}
                  >
                    <div className="history-item-left">
                      <MessageSquare size={13} className="history-item-icon" />
                      <span className="history-item-text">{conv.title}</span>
                    </div>
                    <span className="history-item-date">{conv.date}</span>
                    <button
                      className="history-item-delete"
                      title="Delete Conversation"
                      onClick={(e) => deleteConversation(e, conv.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Document History Section */}
          <div>
            <div className="section-label">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Document History</span>
                <span className="section-count">{filteredDocuments.length}</span>
              </div>
              {documents.length > 0 && (
                <button
                  className="btn-clear-all"
                  title="Delete all uploaded documents"
                  onClick={handleDeleteAllDocuments}
                >
                  <Trash2 size={11} />
                  <span>Clear All</span>
                </button>
              )}
            </div>
            <div className="history-list">
              {filteredDocuments.length === 0 ? (
                <div className="empty-history-text">No documents uploaded</div>
              ) : (
                filteredDocuments.map((doc, idx) => (
                  <div
                    key={idx}
                    className={`history-item ${activeDocument?.filename === doc.filename ? 'active' : ''}`}
                    onClick={() => {
                      setActiveDocument(doc);
                      setViewerPage(1);
                      setDocumentViewerOpen(true);
                    }}
                  >
                    <div className="history-item-left">
                      <FileText size={13} className="history-item-icon" />
                      <span className="history-item-text" title={doc.filename}>{doc.filename}</span>
                    </div>
                    <span className="doc-status-badge" title="Ready & Indexed" />
                    <button
                      className="history-item-delete"
                      title="Delete Document"
                      onClick={(e) => handleDeleteDocument(e, doc.filename)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ====================================================================
          CENTER CHAT WORKSPACE
          ==================================================================== */}
      <main className="chat-workspace">
        {/* Chat Header */}
        <header className="chat-header">
          <div className="chat-header-left">
            {activeDocument ? (
              <div className="active-doc-badge" title={activeDocument.filename}>
                <FileCheck size={14} />
                <span>{activeDocument.filename}</span>
              </div>
            ) : (
              <div className="active-doc-badge">
                <FileText size={14} />
                <span>No active document selected</span>
              </div>
            )}
          </div>

          <div className="chat-header-actions">
            {/* User Controlled Document Viewer Toggle */}
            <button
              className={`btn-header-action ${documentViewerOpen ? 'active' : ''}`}
              onClick={() => setDocumentViewerOpen((prev) => !prev)}
              title={documentViewerOpen ? 'Close Document Viewer' : 'Open Document Viewer'}
            >
              <PanelRight size={14} />
              <span>{documentViewerOpen ? 'Close Viewer' : 'View Document'}</span>
            </button>
          </div>
        </header>

        {/* Messages Viewport */}
        <div className="messages-viewport">
          <div className="messages-inner">
            {messages.length === 0 ? (
              <div className="welcome-container">
                <div className="welcome-logo">
                  <Sparkles size={24} />
                </div>
                <h1 className="welcome-heading">Document Intelligence Workspace</h1>
                <p className="welcome-subtext">
                  Upload PDF, DOC, or DOCX documents to perform semantic search, ask context-aware questions,
                  and receive grounded answers with verifiable page citations.
                </p>

                <div className="welcome-cards">
                  <div className="welcome-card" onClick={() => modalFileInputRef.current?.click()}>
                    <div className="welcome-card-title">
                      <Upload size={14} />
                      <span>Upload Document</span>
                    </div>
                    <p className="welcome-card-desc">Add a PDF to start analyzing its content.</p>
                  </div>
                  <div className="welcome-card" onClick={() => {
                    if (documents.length > 0) {
                      setActiveDocument(documents[0]);
                      setDocumentViewerOpen(true);
                    } else {
                      modalFileInputRef.current?.click();
                    }
                  }}>
                    <div className="welcome-card-title">
                      <FileText size={14} />
                      <span>{documents.length > 0 ? 'Open First Document' : 'Browse Files'}</span>
                    </div>
                    <p className="welcome-card-desc">
                      {documents.length > 0 ? documents[0].filename : 'Supported: .pdf, .doc, .docx'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={msg.id || idx} className={`message-row ${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <div className="avatar-box assistant">
                      <Bot size={15} />
                    </div>
                  )}

                  <div className="message-content-container">
                    <div className="message-bubble">
                      {msg.role === 'user' ? (
                        <div>{msg.content}</div>
                      ) : (
                        <div className="markdown-body">{renderMarkdown(msg.content)}</div>
                      )}
                    </div>

                    {/* AI Actions & Timing Bar */}
                    {msg.role === 'assistant' && (
                      <div className="ai-action-bar">
                        <div className="action-btn-group">
                          <button
                            className="action-icon-btn"
                            title="Copy response"
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                          >
                            {copiedMsgId === msg.id ? <Check size={13} color="#43B581" /> : <Copy size={13} />}
                          </button>
                          <button
                            className="action-icon-btn"
                            title="Regenerate response"
                            onClick={() => handleRegenerate(idx)}
                          >
                            <RefreshCw size={13} />
                          </button>
                          <button
                            className={`action-icon-btn ${msg.liked ? 'active' : ''}`}
                            title="Helpful"
                            onClick={() => toggleLike(msg.id)}
                          >
                            <ThumbsUp size={13} />
                          </button>
                          <button
                            className={`action-icon-btn ${msg.disliked ? 'active' : ''}`}
                            title="Not helpful"
                            onClick={() => toggleDislike(msg.id)}
                          >
                            <ThumbsDown size={13} />
                          </button>
                          {msg.sources && msg.sources.length > 0 && (
                            <button
                              className={`action-icon-btn ${activeSourcesMsgId === msg.id ? 'active' : ''}`}
                              title="Sources"
                              onClick={() => setActiveSourcesMsgId(activeSourcesMsgId === msg.id ? null : msg.id)}
                            >
                              <FileText size={13} />
                            </button>
                          )}
                          <button
                            className="action-icon-btn"
                            title="More actions"
                            onClick={() => showToast('Action options', 'info')}
                          >
                            <MoreHorizontal size={13} />
                          </button>
                        </div>

                        {/* Accurate Generation Timing */}
                        {msg.duration && (
                          <span className="generation-duration">
                            <Clock size={11} />
                            Generated in {msg.duration}
                          </span>
                        )}
                        <span className="message-timestamp">{msg.timestamp}</span>
                      </div>
                    )}

                    {/* Sources Panel Drawer */}
                    {msg.role === 'assistant' && activeSourcesMsgId === msg.id && msg.sources && (
                      <div className="sources-panel">
                        <div className="sources-panel-title">
                          <FileCheck size={12} />
                          <span>Retrieved Context Sources</span>
                        </div>
                        <div>{msg.sources.join(', ')}</div>
                      </div>
                    )}

                    {msg.role === 'user' && (
                      <span className="message-timestamp">{msg.timestamp}</span>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="avatar-box user">
                      <UserIcon size={14} />
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Subtle Thinking Indicator with Elapsed Live Timer */}
            {loading && (
              <div className="message-row assistant">
                <div className="avatar-box assistant">
                  <Bot size={15} />
                </div>
                <div className="message-content-container">
                  <div className="thinking-container">
                    <div className="thinking-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span>Analyzing document & generating response...</span>
                    <span className="thinking-timer">{elapsedTimer}s</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Bar at Bottom */}
        <div className="chat-input-bar">
          <div className="input-shell">
            <button
              className="btn-attach"
              title="Attach document"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={16} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleUploadFile(e.target.files[0])}
              accept=".pdf,.doc,.docx"
              style={{ display: 'none' }}
            />
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder={
                activeDocument
                  ? `Ask about ${activeDocument.filename}...`
                  : 'Ask a question or upload a document...'
              }
              value={inputMessage}
              rows={1}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="btn-send"
              disabled={loading || !inputMessage.trim()}
              onClick={handleSendMessage}
              title="Send message"
            >
              <Send size={14} />
            </button>
          </div>
          <span className="input-disclaimer">
            SmartDoc AI searches context with ChromaDB and generates responses via Google Gemini 3.5 Flash.
          </span>
        </div>
      </main>

      {/* ====================================================================
          RIGHT PANEL: DOCUMENT VIEWER (USER CONTROLLED)
          ==================================================================== */}
      {documentViewerOpen && (
        <aside className="document-viewer-panel">
          <div className="viewer-header">
            <div className="viewer-title-info">
              <FileText size={15} color="#FF6B2C" />
              <span className="viewer-filename">
                {activeDocument ? activeDocument.filename : 'Document Preview'}
              </span>
            </div>

            <div className="viewer-toolbar">
              <button
                className="viewer-tool-btn"
                title="Previous Page"
                onClick={() => setViewerPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="viewer-page-counter">Page {viewerPage}</span>
              <button
                className="viewer-tool-btn"
                title="Next Page"
                onClick={() => setViewerPage((p) => p + 1)}
              >
                <ChevronRight size={14} />
              </button>
              <button
                className="viewer-tool-btn"
                title="Zoom Out"
                onClick={() => setViewerZoom((z) => Math.max(50, z - 20))}
              >
                <ZoomOut size={13} />
              </button>
              <button
                className="viewer-tool-btn"
                title="Zoom In"
                onClick={() => setViewerZoom((z) => Math.min(200, z + 20))}
              >
                <ZoomIn size={13} />
              </button>
              <button
                className="viewer-tool-btn"
                title="Fit to Width"
                onClick={() => setViewerZoom(100)}
              >
                <Maximize2 size={13} />
              </button>
              {viewerUrl && (
                <a
                  href={viewerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="viewer-tool-btn"
                  title="Open in New Tab"
                >
                  <ExternalLink size={13} />
                </a>
              )}
              <button
                className="viewer-tool-btn"
                title="Close Viewer"
                onClick={() => setDocumentViewerOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {viewerUrl ? (
            <div style={{ width: '100%', height: 'calc(100vh - 54px)', background: '#1B1C20' }}>
              <object
                key={`${viewerUrl}-${viewerPage}-${viewerZoom}`}
                data={`${viewerUrl}#page=${viewerPage}&zoom=${viewerZoom}`}
                type="application/pdf"
                className="viewer-content-frame"
                style={{ width: '100%', height: '100%', border: 'none' }}
              >
                <iframe
                  src={`${viewerUrl}#page=${viewerPage}&zoom=${viewerZoom}`}
                  className="viewer-content-frame"
                  title="Document Preview"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                >
                  <div className="viewer-empty-state">
                    <p>Unable to preview PDF directly.</p>
                    <a
                      href={viewerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-header-action"
                      style={{ marginTop: '12px' }}
                    >
                      <ExternalLink size={13} /> Open in new tab
                    </a>
                  </div>
                </iframe>
              </object>
            </div>
          ) : (
            <div className="viewer-empty-state">
              <FileText size={40} />
              <p>No document selected</p>
              <span style={{ fontSize: '12px', marginTop: '6px' }}>
                Select a document from Document History or upload a new one.
              </span>
            </div>
          )}
        </aside>
      )}

      {/* ====================================================================
          NOTIFICATION TOAST
          ==================================================================== */}
      {notification && (
        <div className={`toast-banner ${notification.type}`}>
          {notification.type === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{notification.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
