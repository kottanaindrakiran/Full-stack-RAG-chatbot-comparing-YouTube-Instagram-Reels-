import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Send, 
  MessageSquare, 
  Video, 
  Activity, 
  User, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Cpu
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Custom SVG components for Youtube and Instagram (since Lucide v1.x deprecated brand icons)
const Youtube = ({ size = 24, fill = "none", className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <polygon points="10 15 15 12 10 9" fill={fill} />
  </svg>
);

const Instagram = ({ size = 24, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

// API base path - can be configured via env
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Mock/Initial data matching the screenshot exactly
const INITIAL_VIDEO_A = {
  video_id: 'A',
  url: 'https://youtube.com/watch?v=VII',
  platform: 'YouTube',
  title: 'How to grow your YouTube channel in 2024 — Full breakdown',
  views: 2400000,
  likes: 142000,
  comments: 8300,
  duration: 1122,
  duration_formatted: '18:42',
  creator: '@MrBeast',
  followers: 234000000,
  engagement_rate: 6.27
};

const INITIAL_VIDEO_B = {
  video_id: 'B',
  url: 'https://instagram.com/reel/REEL_',
  platform: 'Instagram',
  title: 'Content strategy tips that actually work for creators',
  views: 180000,
  likes: 9100,
  comments: 320,
  duration: 58,
  duration_formatted: '0:58',
  creator: '@GaryVee',
  followers: 11000000,
  engagement_rate: 5.23
};

const INITIAL_CHAT = [
  {
    role: 'assistant',
    content: `Video A outperformed Video B primarily due to its hook. [Video A · chunk 1] The opening 5 seconds posed a direct question to the viewer, boosting early retention.

Video B's hook [Video B · chunk 1] started with a generic statement, which typically lowers the watch-through rate in the first few seconds.

However, Video B (Instagram Reel) achieved a relatively high engagement rate of 5.23% [Video B · chunk 2] for its shorter length compared to Video A's 6.27% [Video A · chunk 3].`
  }
];

const WELCOME_CHAT = [
  {
    role: 'assistant',
    content: `Welcome to **VideoRAG**! 👋

Enter a YouTube video URL and an Instagram Reel URL in the inputs above, then click **"Analyze videos"** to start the comparison.

*If you don't have URLs ready, click **"Load Demo URLs"** in the controls bar to test the system in Demo Mode.*`
  }
];

function App() {
  // Input URL states
  const [urlA, setUrlA] = useState('');
  const [urlB, setUrlB] = useState('');
  
  // Status and loading states
  const [statusText, setStatusText] = useState('Enter video URLs to begin analysis.');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState(null); // null, true, false
  
  // Video metadata states (starts null to remove initial mock cards)
  const [videoA, setVideoA] = useState(null);
  const [videoB, setVideoB] = useState(null);
  
  // Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState(WELCOME_CHAT);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const messagesEndRef = useRef(null);

  // Auto scroll chat to bottom when history changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Format big numbers like 2.4M, 142K
  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace('.0', '') + 'K';
    }
    return num.toString();
  };

  // Video ingestion click handler
  const handleAnalyze = async () => {
    setIsIngesting(true);
    setIngestSuccess(null);
    setStatusText('Extracting metadata and transcripts...');
    
    // Check for Demo Mode: if inputs are the placeholder ones, simulate instantly!
    if (urlA === 'https://youtube.com/watch?v=VII' && urlB === 'https://instagram.com/reel/REEL_') {
      await new Promise(r => setTimeout(r, 2000)); // simulate delay
      setVideoA(INITIAL_VIDEO_A);
      setVideoB(INITIAL_VIDEO_B);
      setChatHistory(INITIAL_CHAT);
      setIsIngesting(false);
      setIngestSuccess(true);
      setStatusText('Demo Mode: Loaded pre-scraped video metadata and vector indexes successfully.');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url_a: urlA, url_b: urlB }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setVideoA(data.video_a);
        setVideoB(data.video_b);
        setIngestSuccess(true);
        setStatusText('Ingestion and embedding complete! Vector store updated.');
        // Add greeting message starting a fresh analysis
        setChatHistory([
          {
            role: 'assistant',
            content: `I have successfully analyzed both videos!
            
**Video A (YouTube):** "${data.video_a.title}" by ${data.video_a.creator}
**Video B (Instagram):** "${data.video_b.title}" by ${data.video_b.creator}

Feel free to ask me to compare their hooks, engagement rates, or overall content strategies.`
          }
        ]);
      } else {
        setIngestSuccess(false);
        setStatusText(`Ingestion failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      setIngestSuccess(false);
      setStatusText(`Connection error: Could not reach the backend API at ${API_BASE}`);
    } finally {
      setIsIngesting(false);
    }
  };

  // Chat submit handler
  const handleSendMessage = async (textToSend) => {
    const queryText = textToSend || chatInput;
    if (!queryText.trim() || isStreaming) return;
    
    setChatInput('');
    setIsStreaming(true);
    
    // Add user message to history
    const updatedHistory = [...chatHistory, { role: 'user', content: queryText }];
    setChatHistory(updatedHistory);
    
    // Append an empty assistant message that we will stream into
    setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);
    
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          history: updatedHistory.slice(0, -1) // pass history excluding the new empty bot message
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantText = '';
      let buffer = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Split the buffer by lines (handles both \r\n and \n)
        const lines = buffer.split(/\r?\n/);
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;
          if (cleanLine.startsWith('data: ')) {
            const token = cleanLine.slice(6);
            let cleanToken = token;
            try {
              // If token is JSON encoded (like with quotes), parse it
              if (token.startsWith('"') && token.endsWith('"')) {
                cleanToken = JSON.parse(token);
              }
            } catch (_) {}
            
            assistantText += cleanToken;
            
            setChatHistory(prev => {
              const copy = [...prev];
              if (copy.length > 0) {
                copy[copy.length - 1] = { role: 'assistant', content: assistantText };
              }
              return copy;
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
      setChatHistory(prev => {
        const copy = [...prev];
        if (copy.length > 0) {
          copy[copy.length - 1] = { 
            role: 'assistant', 
            content: `Failed to stream chat. Error details: ${err.message || err}. Please ensure backend is running at ${API_BASE}.` 
          };
        }
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  // Helper to parse citations in text and turn them into badges
  const renderMessageContent = (text) => {
    if (!text) return '';
    
    // Replace citations with markdown links first
    const preprocessedText = text.replace(
      /\[Video\s+(A|B)\s+·\s+chunk\s+(\d+)\]/g,
      (_, video, chunk) => `[${video}-chunk ${chunk}](#citation-${video}-${chunk})`
    );
    
    return (
      <ReactMarkdown
        components={{
          a: ({ href, children, ...props }) => {
            if (href && href.startsWith('#citation-')) {
              const parts = href.split('-');
              const videoLetter = parts[1]; // A or B
              const chunkNum = parts[2];
              const badgeClass = videoLetter === 'A' ? 'citation-badge vid-a' : 'citation-badge vid-b';
              return (
                <span className={badgeClass}>
                  {videoLetter}-chunk {chunkNum}
                </span>
              );
            }
            return <a href={href} {...props}>{children}</a>;
          }
        }}
      >
        {preprocessedText}
      </ReactMarkdown>
    );
  };

  // Quick reply options click handler
  const handleQuickReply = (label) => {
    let messageText = '';
    if (label === 'Compare hooks') {
      messageText = 'Compare the hooks of Video A and Video B. Which one is more effective and why?';
    } else if (label === 'Improve Video B') {
      messageText = 'Based on the transcripts, what are 3 actionable improvements we can make to Video B (Instagram Reel) to match or beat Video A?';
    } else if (label === 'Engagement rates') {
      messageText = 'Compare the engagement rates of Video A and Video B. What factors contributed to the difference?';
    } else if (label === 'Creator info') {
      messageText = 'What is the creator information, follower count, and audience scale for both Video A and Video B?';
    }
    
    handleSendMessage(messageText);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <span className="logo-title">
            <Video size={24} style={{ color: '#8ab4f8' }} />
            VideoRAG
          </span>
          <span className="badge-tech">Technical Challenge</span>
        </div>
        <div className="creator-credit">
          Techsolv IT · Creatorjoy
        </div>
      </header>

      {/* URL Inputs */}
      <div className="inputs-grid">
        <div className="url-input-wrapper">
          <span className="platform-icon yt">
            <Youtube size={20} fill="currentColor" />
          </span>
          <input 
            type="text" 
            className="url-field" 
            placeholder="https://youtube.com/watch?v=..." 
            value={urlA} 
            onChange={(e) => setUrlA(e.target.value)}
            disabled={isIngesting}
          />
          <span className="label-badge">A</span>
        </div>

        <div className="url-input-wrapper">
          <span className="platform-icon ig">
            <Instagram size={20} />
          </span>
          <input 
            type="text" 
            className="url-field" 
            placeholder="https://instagram.com/reel/..." 
            value={urlB} 
            onChange={(e) => setUrlB(e.target.value)}
            disabled={isIngesting}
          />
          <span className="label-badge">B</span>
        </div>
      </div>

      {/* Controls */}
      <div className="controls-bar">
        <button 
          className={`btn-analyze ${isIngesting ? 'pulse-glow' : ''}`}
          onClick={handleAnalyze}
          disabled={isIngesting || !urlA || !urlB}
        >
          <Cpu size={16} className={isIngesting ? 'spin-animation' : ''} />
          Analyze videos
        </button>
        {(!urlA && !urlB) && (
          <button 
            type="button"
            className="btn-quick-reply"
            onClick={() => {
              setUrlA('https://youtube.com/watch?v=VII');
              setUrlB('https://instagram.com/reel/REEL_');
              setStatusText('Demo URLs loaded. Click "Analyze videos" to trigger Demo Mode.');
            }}
            style={{ width: 'auto', padding: '10px 16px', fontSize: '13px', margin: 0 }}
          >
            Load Demo URLs
          </button>
        )}
        <span className="status-text">
          {isIngesting ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Extracting transcribes and metadata, indexing documents...
              <span className="loading-dots">
                <span></span><span></span><span></span>
              </span>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {ingestSuccess === true && <CheckCircle2 size={14} style={{ color: '#10b981' }} />}
              {ingestSuccess === false && <AlertCircle size={14} style={{ color: '#ef4444' }} />}
              {statusText}
            </span>
          )}
        </span>
      </div>

      {/* Main Grid Content */}
      <div className="dashboard-grid">
        {/* Video Cards (Left Side) */}
        <div className="video-cards-column">
          {/* Video A */}
          {!videoA ? (
            <div className="video-card empty-state-card">
              <div className="card-badge yt">Video A · YouTube</div>
              <div className="empty-card-body">
                <Youtube size={48} className="empty-card-icon yt" />
                <span className="empty-card-title">YouTube Video Metadata</span>
                <span className="empty-card-subtitle">Pending analysis</span>
              </div>
            </div>
          ) : (
            <div className="video-card">
              <div className="card-badge yt">Video A · YouTube</div>
              <div className="video-preview-box">
                <Play className="play-overlay-icon" size={32} fill="currentColor" />
              </div>
              <div className="video-title-text" title={videoA.title}>
                {videoA.title}
              </div>
              <div className="stats-grid">
                <div className="stat-item-box">
                  <span className="stat-label">Views</span>
                  <span className="stat-value">{formatNumber(videoA.views)}</span>
                </div>
                <div className="stat-item-box">
                  <span className="stat-label">Likes</span>
                  <span className="stat-value">{formatNumber(videoA.likes)}</span>
                </div>
                <div className="stat-item-box">
                  <span className="stat-label">Comments</span>
                  <span className="stat-value">{formatNumber(videoA.comments)}</span>
                </div>
                <div className="stat-item-box">
                  <span className="stat-label">Duration</span>
                  <span className="stat-value">{videoA.duration_formatted}</span>
                </div>
              </div>
              <div className="engagement-banner active">
                <span>Engagement rate</span>
                <span className="engagement-value">{videoA.engagement_rate}%</span>
              </div>
              <div className="card-footer-text">
                Creator: {videoA.creator} · {formatNumber(videoA.followers)} followers
              </div>
            </div>
          )}

          {/* Video B */}
          {!videoB ? (
            <div className="video-card empty-state-card">
              <div className="card-badge ig">Video B · Instagram</div>
              <div className="empty-card-body">
                <Instagram size={48} className="empty-card-icon ig" />
                <span className="empty-card-title">Instagram Reel Metadata</span>
                <span className="empty-card-subtitle">Pending analysis</span>
              </div>
            </div>
          ) : (
            <div className="video-card">
              <div className="card-badge ig">Video B · Instagram</div>
              <div className="video-preview-box">
                <Play className="play-overlay-icon" size={32} fill="currentColor" />
              </div>
              <div className="video-title-text" title={videoB.title}>
                {videoB.title}
              </div>
              <div className="stats-grid">
                <div className="stat-item-box">
                  <span className="stat-label">Views</span>
                  <span className="stat-value">{formatNumber(videoB.views)}</span>
                </div>
                <div className="stat-item-box">
                  <span className="stat-label">Likes</span>
                  <span className="stat-value">{formatNumber(videoB.likes)}</span>
                </div>
                <div className="stat-item-box">
                  <span className="stat-label">Comments</span>
                  <span className="stat-value">{formatNumber(videoB.comments)}</span>
                </div>
                <div className="stat-item-box">
                  <span className="stat-label">Duration</span>
                  <span className="stat-value">{videoB.duration_formatted}</span>
                </div>
              </div>
              <div className="engagement-banner ig">
                <span>Engagement rate</span>
                <span className="engagement-value">{videoB.engagement_rate}%</span>
              </div>
              <div className="card-footer-text">
                Creator: {videoB.creator} · {formatNumber(videoB.followers)} followers
              </div>
            </div>
          )}
        </div>

        {/* Chat Panel (Right Side) */}
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-header-title">
              <MessageSquare className="chat-header-icon" size={16} />
              <span>Ask about the videos</span>
            </div>
            <div className="chat-header-badge">
              <span className="chat-badge-primary">Memory on · Streaming</span>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="chat-messages-container">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <div className="assistant-message-content">
                  {msg.role === 'assistant' ? (
                    msg.content === '' && isStreaming && idx === chatHistory.length - 1 ? (
                      <span className="loading-dots">
                        <span></span><span></span><span></span>
                      </span>
                    ) : (
                      renderMessageContent(msg.content)
                    )
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Replies */}
          <div className="quick-replies-list">
            <button 
              className="btn-quick-reply" 
              onClick={() => handleQuickReply('Compare hooks')}
              disabled={isStreaming}
            >
              Compare hooks
            </button>
            <button 
              className="btn-quick-reply" 
              onClick={() => handleQuickReply('Improve Video B')}
              disabled={isStreaming}
            >
              Improve Video B
            </button>
            <button 
              className="btn-quick-reply" 
              onClick={() => handleQuickReply('Engagement rates')}
              disabled={isStreaming}
            >
              Engagement rates
            </button>
            <button 
              className="btn-quick-reply" 
              onClick={() => handleQuickReply('Creator info')}
              disabled={isStreaming}
            >
              Creator info
            </button>
          </div>

          {/* Input field bar */}
          <div className="chat-input-bar">
            <input 
              type="text" 
              className="chat-input-field" 
              placeholder="Ask anything about the videos..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isStreaming}
            />
            <button 
              className="btn-send-message" 
              onClick={() => handleSendMessage()}
              disabled={isStreaming || !chatInput.trim()}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Styles Injection for Spinners and Empty Cards */}
      <style>{`
        .spin-animation {
          animation: spin-rotate 1.5s linear infinite;
        }
        @keyframes spin-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .empty-state-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 340px;
          border: 1px dashed var(--border-color);
          background: rgba(30, 30, 30, 0.4);
        }
        .empty-card-body {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: auto;
          margin-bottom: auto;
          color: var(--text-muted);
        }
        .empty-card-icon {
          opacity: 0.25;
          transition: opacity 0.2s;
        }
        .empty-state-card:hover .empty-card-icon {
          opacity: 0.5;
        }
        .empty-card-icon.yt {
          color: var(--brand-yt);
        }
        .empty-card-icon.ig {
          color: var(--brand-ig);
        }
        .empty-card-title {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 600;
          color: var(--text-main);
        }
        .empty-card-subtitle {
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

export default App;
