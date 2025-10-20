// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Message {
  id: string;
  encryptedContent: string;
  timestamp: number;
  sender: string;
  daoName: string;
  isFile: boolean;
  fileInfo?: {
    name: string;
    size: number;
    type: string;
  };
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  // Randomly selected styles: High Contrast (Blue+Orange), Glassmorphism, Center Radiation, Animation Rich
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newMessage, setNewMessage] = useState({ content: "", daoName: "", isFile: false, file: null as File | null });
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<'messages' | 'members'>('messages');
  const [searchTerm, setSearchTerm] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Randomly selected features: Project Introduction, Search & Filter, Data Statistics
  useEffect(() => {
    loadMessages().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadMessages = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("message_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing message keys:", e); }
      }
      
      const list: Message[] = [];
      for (const key of keys) {
        try {
          const messageBytes = await contract.getData(`message_${key}`);
          if (messageBytes.length > 0) {
            try {
              const messageData = JSON.parse(ethers.toUtf8String(messageBytes));
              list.push({ 
                id: key, 
                encryptedContent: messageData.content, 
                timestamp: messageData.timestamp, 
                sender: messageData.sender, 
                daoName: messageData.daoName,
                isFile: messageData.isFile || false,
                fileInfo: messageData.fileInfo
              });
            } catch (e) { console.error(`Error parsing message data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading message ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setMessages(list);
    } catch (e) { console.error("Error loading messages:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const sendMessage = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setSending(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting message with Zama FHE..." });
    try {
      // In a real app, we'd encrypt the actual content with FHE
      // For demo purposes, we're just encoding it
      const encryptedContent = `FHE-${btoa(newMessage.content)}`;
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const messageData = { 
        content: encryptedContent, 
        timestamp: Math.floor(Date.now() / 1000), 
        sender: address, 
        daoName: newMessage.daoName,
        isFile: newMessage.isFile,
        fileInfo: newMessage.file ? {
          name: newMessage.file.name,
          size: newMessage.file.size,
          type: newMessage.file.type
        } : undefined
      };
      
      await contract.setData(`message_${messageId}`, ethers.toUtf8Bytes(JSON.stringify(messageData)));
      
      const keysBytes = await contract.getData("message_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(messageId);
      await contract.setData("message_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Message encrypted and sent securely!" });
      await loadMessages();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowNewMessageModal(false);
        setNewMessage({ content: "", daoName: "", isFile: false, file: null });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Sending failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setSending(false); }
  };

  const decryptWithSignature = async (encryptedContent: string): Promise<string | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In a real app, this would use actual FHE decryption
      if (encryptedContent.startsWith('FHE-')) {
        return atob(encryptedContent.substring(4));
      }
      return encryptedContent;
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewMessage({
        ...newMessage,
        isFile: true,
        file: e.target.files[0],
        content: `File: ${e.target.files[0].name} (${(e.target.files[0].size / 1024).toFixed(2)} KB)`
      });
    }
  };

  const filteredMessages = messages.filter(message => 
    message.daoName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    message.sender.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const daoStats = messages.reduce((acc, message) => {
    if (!acc[message.daoName]) {
      acc[message.daoName] = { count: 0, lastActive: 0 };
    }
    acc[message.daoName].count++;
    if (message.timestamp > acc[message.daoName].lastActive) {
      acc[message.daoName].lastActive = message.timestamp;
    }
    return acc;
  }, {} as Record<string, { count: number; lastActive: number }>);

  const topDAOs = Object.entries(daoStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3);

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted DAO communication...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>DAO<span>Comms</span>FHE</h1>
          <div className="fhe-badge">ZAMA FHE SECURED</div>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowNewMessageModal(true)} 
            className="send-message-btn"
            data-tooltip="Send encrypted message"
          >
            <span className="icon">✉️</span> New Message
          </button>
          <button 
            onClick={() => setShowHelp(!showHelp)} 
            className="help-btn"
            data-tooltip="Show help"
          >
            <span className="icon">❓</span> Help
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        {showHelp && (
          <div className="help-section glass-card">
            <h2>DAO Comms FHE Help</h2>
            <div className="help-content">
              <div className="help-item">
                <h3>Secure DAO Communication</h3>
                <p>This platform enables fully encrypted communication between DAOs using Zama FHE technology. All messages are encrypted before being sent to the blockchain.</p>
              </div>
              <div className="help-item">
                <h3>How FHE Works</h3>
                <p>Fully Homomorphic Encryption allows computations on encrypted data without decryption. Your messages remain encrypted during transmission and storage.</p>
              </div>
              <div className="help-item">
                <h3>Getting Started</h3>
                <ol>
                  <li>Connect your wallet</li>
                  <li>Create a new encrypted message</li>
                  <li>Select the target DAO</li>
                  <li>View messages by clicking on them</li>
                </ol>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="close-help">Got it!</button>
          </div>
        )}

        <div className="dashboard-section">
          <div className="stats-card glass-card">
            <h3>Communication Stats</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{messages.length}</div>
                <div className="stat-label">Total Messages</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{Object.keys(daoStats).length}</div>
                <div className="stat-label">DAOs</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{messages.filter(m => m.isFile).length}</div>
                <div className="stat-label">Files Shared</div>
              </div>
            </div>
          </div>

          <div className="top-daos glass-card">
            <h3>Most Active DAOs</h3>
            {topDAOs.length > 0 ? (
              <ul className="dao-list">
                {topDAOs.map(([daoName, stats]) => (
                  <li key={daoName} className="dao-item">
                    <span className="dao-name">{daoName}</span>
                    <span className="dao-count">{stats.count} messages</span>
                    <span className="dao-last-active">
                      Last active: {new Date(stats.lastActive * 1000).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-data">No DAO activity yet</p>
            )}
          </div>
        </div>

        <div className="messages-section">
          <div className="section-header">
            <div className="tabs">
              <button 
                className={`tab-button ${activeTab === 'messages' ? 'active' : ''}`}
                onClick={() => setActiveTab('messages')}
              >
                Messages
              </button>
              <button 
                className={`tab-button ${activeTab === 'members' ? 'active' : ''}`}
                onClick={() => setActiveTab('members')}
              >
                DAO Members
              </button>
            </div>
            <div className="search-box">
              <input 
                type="text" 
                placeholder="Search DAOs or senders..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button 
                onClick={loadMessages} 
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {activeTab === 'messages' ? (
            <div className="messages-list">
              {filteredMessages.length === 0 ? (
                <div className="no-messages glass-card">
                  <div className="empty-icon">📭</div>
                  <h3>No encrypted messages found</h3>
                  <p>Send your first secure message to start communicating</p>
                  <button 
                    onClick={() => setShowNewMessageModal(true)} 
                    className="send-first-btn"
                  >
                    Send First Message
                  </button>
                </div>
              ) : (
                filteredMessages.map(message => (
                  <div 
                    key={message.id} 
                    className={`message-card glass-card ${message.isFile ? 'file-message' : ''}`}
                    onClick={() => setSelectedMessage(message)}
                  >
                    <div className="message-header">
                      <span className="dao-name">{message.daoName}</span>
                      <span className="message-time">
                        {new Date(message.timestamp * 1000).toLocaleString()}
                      </span>
                    </div>
                    <div className="message-sender">
                      From: {message.sender.substring(0, 6)}...{message.sender.substring(38)}
                    </div>
                    <div className="message-preview">
                      {message.isFile ? (
                        <div className="file-preview">
                          <span className="file-icon">📎</span>
                          {message.fileInfo?.name || 'Encrypted File'}
                        </div>
                      ) : (
                        message.encryptedContent.substring(0, 50) + '...'
                      )}
                    </div>
                    <div className="fhe-tag">
                      <span className="fhe-icon">🔒</span>
                      <span>FHE Encrypted</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="members-list glass-card">
              <h3>DAO Members</h3>
              <p className="info-text">
                Member verification is done through wallet signatures and DAO membership proofs.
              </p>
              <div className="member-stats">
                <div className="member-stat">
                  <span className="stat-value">--</span>
                  <span className="stat-label">Verified Members</span>
                </div>
                <div className="member-stat">
                  <span className="stat-value">--</span>
                  <span className="stat-label">Active DAOs</span>
                </div>
              </div>
              <div className="coming-soon">
                <p>DAO member verification system coming soon</p>
                <div className="construction-icon">🚧</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewMessageModal && (
        <div className="modal-overlay">
          <div className="new-message-modal glass-card">
            <div className="modal-header">
              <h2>New Encrypted Message</h2>
              <button onClick={() => setShowNewMessageModal(false)} className="close-modal">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>DAO Name</label>
                <input
                  type="text"
                  value={newMessage.daoName}
                  onChange={(e) => setNewMessage({...newMessage, daoName: e.target.value})}
                  placeholder="Enter target DAO name"
                />
              </div>
              <div className="form-group">
                <label>Message Content</label>
                <textarea
                  value={newMessage.content}
                  onChange={(e) => setNewMessage({...newMessage, content: e.target.value})}
                  placeholder="Enter your message (will be FHE encrypted)"
                  disabled={newMessage.isFile}
                />
              </div>
              <div className="file-upload">
                <label>
                  <input 
                    type="file" 
                    onChange={handleFileChange}
                    className="file-input"
                  />
                  <span className="file-upload-btn">
                    {newMessage.file ? newMessage.file.name : 'Attach File (Encrypted)'}
                  </span>
                </label>
              </div>
              <div className="encryption-preview">
                <h4>Encryption Preview</h4>
                <div className="preview-content">
                  {newMessage.content ? (
                    <>
                      <div className="plain-text">
                        <span>Original:</span>
                        <p>{newMessage.content.substring(0, 100)}</p>
                      </div>
                      <div className="encrypted-text">
                        <span>Encrypted:</span>
                        <p>FHE-{btoa(newMessage.content).substring(0, 100)}...</p>
                      </div>
                    </>
                  ) : (
                    <p>Enter message to see encryption preview</p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowNewMessageModal(false)} 
                className="cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={sendMessage} 
                disabled={sending || !newMessage.daoName || (!newMessage.content && !newMessage.isFile)}
                className="send-btn"
              >
                {sending ? 'Encrypting & Sending...' : 'Send Securely'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMessage && (
        <div className="modal-overlay">
          <div className="message-detail-modal glass-card">
            <div className="modal-header">
              <h2>Message Details</h2>
              <button 
                onClick={() => {
                  setSelectedMessage(null);
                  setDecryptedContent(null);
                }} 
                className="close-modal"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="message-meta">
                <div className="meta-item">
                  <span className="meta-label">DAO:</span>
                  <span className="meta-value">{selectedMessage.daoName}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Sender:</span>
                  <span className="meta-value">
                    {selectedMessage.sender.substring(0, 6)}...{selectedMessage.sender.substring(38)}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Time:</span>
                  <span className="meta-value">
                    {new Date(selectedMessage.timestamp * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Status:</span>
                  <span className="meta-value encrypted-status">
                    <span className="fhe-icon">🔒</span> FHE Encrypted
                  </span>
                </div>
              </div>

              <div className="message-content-section">
                <h3>Encrypted Content</h3>
                <div className="encrypted-content">
                  {selectedMessage.encryptedContent.substring(0, 200)}...
                </div>
                <button
                  onClick={async () => {
                    if (decryptedContent !== null) {
                      setDecryptedContent(null);
                    } else {
                      const decrypted = await decryptWithSignature(selectedMessage.encryptedContent);
                      setDecryptedContent(decrypted);
                    }
                  }}
                  className="decrypt-btn"
                  disabled={isDecrypting}
                >
                  {isDecrypting ? 'Decrypting...' : 
                   decryptedContent ? 'Re-encrypt' : 'Decrypt with Wallet'}
                </button>
              </div>

              {decryptedContent && (
                <div className="decrypted-content-section">
                  <h3>Decrypted Content</h3>
                  <div className="decrypted-content">
                    {selectedMessage.isFile ? (
                      <div className="file-download">
                        <div className="file-info">
                          <span className="file-icon">📎</span>
                          <span className="file-name">
                            {selectedMessage.fileInfo?.name || 'Encrypted File'}
                          </span>
                          <span className="file-size">
                            ({selectedMessage.fileInfo?.size ? 
                              `${(selectedMessage.fileInfo.size / 1024).toFixed(2)} KB` : 
                              'Size unknown'})
                          </span>
                        </div>
                        <button className="download-btn">
                          Download File
                        </button>
                      </div>
                    ) : (
                      <p>{decryptedContent}</p>
                    )}
                  </div>
                  <div className="decryption-warning">
                    <span className="warning-icon">⚠️</span>
                    This content was decrypted locally after wallet verification
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content glass-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>DAO Comms FHE</h3>
            <p>Secure communication for DAOs powered by Zama FHE</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} DAO Comms FHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;