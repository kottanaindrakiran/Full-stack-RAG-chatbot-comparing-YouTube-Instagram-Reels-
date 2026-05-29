import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Send, 
  MessageSquare, 
  Video, 
  Activity, 
  User, 
  FileText, 
  Instagram, 
  Youtube, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  Cpu
} from 'lucide-react';

// API base path - can be configured via env
const API_BASE = 'http://localhost:8000';

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

function App() {
  // Input URL states
  const [urlA, setUrlA] = useState('https://youtube.com/watch?v=VII');
  const [urlB, setUrlB] = useState('https://instagram.com/reel/REEL_');
  
  // Status and loading states
  const [statusText, setStatusText] = useState('Transcripts · Metadata · Embeddings · Ready in ~15s');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState(null); // null, true, false
  
  // Video metadata states (loaded with initial screenshot mockup details)
  const [videoA, setVideoA] = useState(INITIAL_VIDEO_A);
  const [videoB, setVideoB] = useState(INITIAL_VIDEO_B);
  
  // Chat states
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT);
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
        
        // Split on double newlines to isolate SSE data blocks
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const part = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          
          if (part) {
            const lines = part.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const token = line.slice(6);
                
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
          boundary = buffer.indexOf('\n\n');
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
    
    // Pattern to match [Video A · chunk N] or [Video B · chunk N]
    const regex = /\[Video\s+(A|B)\s+·\s+chunk\s+(\d+)\]/g;
    const elements = [];
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      const videoLetter = match[1]; // A or B
      const chunkNum = match[2]; // N
      
      // Add preceding text
      if (matchIndex > lastIndex) {
        elements.push(text.substring(lastIndex, matchIndex));
      }
      
      // Add custom styled citation badge
      const badgeClass = videoLetter === 'A' ? 'citation-badge vid-a' : 'citation-badge vid-b';
      elements.push(
        <span key={matchIndex} className={badgeClass}>
          {videoLetter}-chunk {chunkNum}
        </span>
      );
      
      lastIndex = regex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      elements.push(text.substring(lastIndex));
    }
    
    return elements.length > 0 ? (
      <span style={{ whiteSpace: 'pre-line' }}>{elements}</span>
    ) : (
      <span style={{ whiteSpace: 'pre-line' }}>{text}</span>
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

          {/* Video B */}
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
      
      {/* Styles Injection for Spinners */}
      <style>{`
        .spin-animation {
          animation: spin-rotate 1.5s linear infinite;
        }
        @keyframes spin-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
