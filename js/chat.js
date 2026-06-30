// ============================================
// F1 PREDICTION LEAGUE — GLOBAL CHAT
// ============================================

import {
  db,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc
} from './firebase.js';

let unsubscribe = null;
let currentUser = null;

/**
 * Initialize chat for the logged-in user
 */
export function initChat(user) {
  if (!user) return;
  currentUser = user;
  
  const wrapper = document.getElementById('global-chat-wrapper');
  const popup = document.getElementById('chat-popup');
  const fab = document.getElementById('chat-fab');
  const closeBtn = document.getElementById('btn-close-chat');
  const messagesContainer = document.getElementById('chat-messages');
  const inputForm = document.getElementById('chat-input-form');
  const inputField = document.getElementById('chat-input');
  
  if (!wrapper || !fab) return;

  // Show the chat wrapper (FAB)
  wrapper.classList.remove('hidden');

  const toggleChat = () => {
    popup.classList.toggle('hidden');
    if (!popup.classList.contains('hidden')) {
      inputField.focus();
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    const text = inputField.value.trim();
    if (!text || !currentUser) return;
    
    // Optimistically clear input
    inputField.value = '';
    inputField.focus();
    
    try {
      await addDoc(collection(db, 'messages'), {
        text,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email.split('@')[0],
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Bind UI events (remove first to avoid duplicates if re-inited)
  fab.removeEventListener('click', toggleChat);
  closeBtn.removeEventListener('click', toggleChat);
  inputForm.removeEventListener('submit', handleSendMessage);
  
  fab.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);
  inputForm.addEventListener('submit', handleSendMessage);

  // Subscribe to messages (last 24 hours only)
  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
  
  const q = query(
    collection(db, 'messages'),
    where('timestamp', '>', twentyFourHoursAgo),
    orderBy('timestamp', 'asc')
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const msg = change.doc.data();
        
        // Render Message
        if (!document.getElementById(`msg-${change.doc.id}`)) {
          const isOwn = msg.senderId === currentUser.uid;
          const wrapperClass = isOwn ? 'own' : 'other';
          
          const div = document.createElement('div');
          div.className = `chat-message-wrapper ${wrapperClass}`;
          div.id = `msg-${change.doc.id}`;
          
          // Escape HTML
          const safeText = msg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const safeName = msg.senderName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          
          div.innerHTML = `
            <div class="chat-sender-name">${safeName}</div>
            <div class="chat-bubble">${safeText}</div>
          `;
          
          messagesContainer.appendChild(div);
        }
      }
    });
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

/**
 * Clean up chat on logout
 */
export function cleanupChat() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  currentUser = null;
  
  const wrapper = document.getElementById('global-chat-wrapper');
  const popup = document.getElementById('chat-popup');
  const messagesContainer = document.getElementById('chat-messages');
  
  if (wrapper) wrapper.classList.add('hidden');
  if (popup) popup.classList.add('hidden');
  if (messagesContainer) messagesContainer.innerHTML = '';
}
