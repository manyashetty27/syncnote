const socket = io();

const state = {
  username: localStorage.getItem('syncnote-username') || 'Manya',
  noteId: '1',
  revision: 0,
  notes: [],
  debounceTimer: null,
  typingTimer: null,
  lastRemoteUpdate: 0,
  isApplyingRemote: false,
  users: []
};

const els = {
  noteList: document.getElementById('noteList'),
  editor: document.getElementById('editor'),
  noteTitle: document.getElementById('noteTitle'),
  breadcrumbTitle: document.getElementById('breadcrumbTitle'),
  profileName: document.getElementById('profileName'),
  profileAvatar: document.getElementById('profileAvatar'),
  changeNameBtn: document.getElementById('changeNameBtn'),
  newNoteBtn: document.getElementById('newNoteBtn'),
  shareBtn: document.getElementById('shareBtn'),
  connectionPill: document.getElementById('connectionPill'),
  connectionText: document.getElementById('connectionText'),
  saveStatus: document.getElementById('saveStatus'),
  lastUpdated: document.getElementById('lastUpdated'),
  revisionLabel: document.getElementById('revisionLabel'),
  presenceAvatars: document.getElementById('presenceAvatars'),
  activeCount: document.getElementById('activeCount'),
  typingStatus: document.getElementById('typingStatus'),
  wordCount: document.getElementById('wordCount'),
  editorHint: document.getElementById('editorHint'),
  activityFeed: document.getElementById('activityFeed'),
  toast: document.getElementById('toast')
};

function initials(name) {
  return name.trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'G';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function addActivity(message, type = 'normal') {
  const item = document.createElement('div');
  item.className = `activity-item ${type}`;
  item.innerHTML = message;
  els.activityFeed.prepend(item);
  while (els.activityFeed.children.length > 10) els.activityFeed.lastElementChild.remove();
}

function updateProfile() {
  els.profileName.textContent = state.username;
  els.profileAvatar.textContent = initials(state.username).slice(0, 1);
}

function renderNotes() {
  els.noteList.innerHTML = state.notes.map(note => `
    <button class="note-item ${note.id === state.noteId ? 'active' : ''}" data-note-id="${escapeHtml(note.id)}">
      <strong>${escapeHtml(note.title)}</strong>
      <span>${new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${escapeHtml(note.updatedBy || 'System')}</span>
    </button>
  `).join('');

  els.noteList.querySelectorAll('.note-item').forEach(button => {
    button.addEventListener('click', () => joinNote(button.dataset.noteId));
  });
}

async function loadNotes() {
  const response = await fetch('/api/notes');
  state.notes = await response.json();
  renderNotes();
}

function joinNote(noteId) {
  state.noteId = noteId;
  state.isApplyingRemote = true;
  socket.emit('join-note', { noteId, username: state.username });
  renderNotes();
  els.editor.focus();
}

function applyNote(note) {
  state.isApplyingRemote = true;
  els.noteTitle.value = note.title;
  els.breadcrumbTitle.textContent = note.title;
  els.editor.value = note.content;
  state.revision = note.revision;
  els.revisionLabel.textContent = `Revision ${note.revision}`;
  els.lastUpdated.textContent = `Updated ${relativeTime(note.updatedAt)}`;
  els.saveStatus.textContent = 'Synced';
  els.saveStatus.style.color = 'var(--success)';
  updateWordCount();
  setTimeout(() => { state.isApplyingRemote = false; }, 0);
}

function relativeTime(timestamp) {
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function updateWordCount() {
  const words = els.editor.value.trim() ? els.editor.value.trim().split(/\s+/).length : 0;
  els.wordCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
}

function sendChange() {
  if (state.isApplyingRemote) return;
  const content = els.editor.value;
  const title = els.noteTitle.value.trim() || 'Untitled Note';
  els.saveStatus.textContent = 'Syncing...';
  els.saveStatus.style.color = 'var(--warning)';
  socket.emit('note-change', {
    noteId: state.noteId,
    content,
    title,
    baseRevision: state.revision,
    cursor: els.editor.selectionStart
  });
}

function scheduleChange() {
  updateWordCount();
  els.editorHint.textContent = 'Syncing changes...';
  socket.emit('typing', { noteId: state.noteId, typing: true });
  clearTimeout(state.debounceTimer);
  clearTimeout(state.typingTimer);
  state.debounceTimer = setTimeout(sendChange, 180);
  state.typingTimer = setTimeout(() => {
    socket.emit('typing', { noteId: state.noteId, typing: false });
  }, 700);
}

function updatePresence(users) {
  state.users = users;
  els.activeCount.textContent = `${users.length} active`;
  els.presenceAvatars.innerHTML = users.slice(0, 5).map((user, index) => `
    <div class="presence-avatar" title="${escapeHtml(user.name)}${user.typing ? ' · typing' : ''}" style="background:${avatarColor(index)}">${escapeHtml(initials(user.name))}</div>
  `).join('');

  const othersTyping = users.filter(user => user.id !== socket.id && user.typing);
  if (othersTyping.length === 0) {
    els.typingStatus.textContent = users.length <= 1 ? 'Only you' : 'Everyone is synced';
  } else if (othersTyping.length === 1) {
    els.typingStatus.textContent = `${othersTyping[0].name} is typing...`;
  } else {
    els.typingStatus.textContent = `${othersTyping.length} people are typing...`;
  }
}

function avatarColor(index) {
  const colors = ['#3157d5', '#8a5cf6', '#e26d5a', '#16a36b', '#d78b19'];
  return colors[index % colors.length];
}

els.editor.addEventListener('input', scheduleChange);
els.noteTitle.addEventListener('input', scheduleChange);
els.editor.addEventListener('keyup', () => {
  socket.emit('cursor-move', { noteId: state.noteId, cursor: els.editor.selectionStart });
});
els.editor.addEventListener('click', () => {
  socket.emit('cursor-move', { noteId: state.noteId, cursor: els.editor.selectionStart });
});

els.changeNameBtn.addEventListener('click', () => {
  const nextName = prompt('Enter your display name:', state.username);
  if (!nextName || !nextName.trim()) return;
  state.username = nextName.trim().slice(0, 30);
  localStorage.setItem('syncnote-username', state.username);
  updateProfile();
  joinNote(state.noteId);
});

els.newNoteBtn.addEventListener('click', async () => {
  const title = prompt('Enter a title for the new note:', 'New Collaborative Note');
  if (!title || !title.trim()) return;
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim() })
  });
  const note = await response.json();
  state.notes.unshift(note);
  renderNotes();
  joinNote(note.id);
  showToast('New collaborative note created');
});

els.shareBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    showToast('Note link copied to clipboard');
  } catch {
    showToast('Copy failed — share the browser URL manually');
  }
});

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    const start = els.editor.selectionStart;
    const end = els.editor.selectionEnd;
    const selected = els.editor.value.slice(start, end);
    let replacement = selected;

    if (action === 'bold') replacement = `**${selected || 'bold text'}**`;
    if (action === 'italic') replacement = `_${selected || 'italic text'}_`;
    if (action === 'heading') replacement = `# ${selected || 'Heading'}`;
    if (action === 'bullet') replacement = `- ${selected || 'List item'}`;
    if (action === 'code') replacement = `\`${selected || 'code'}\``;

    els.editor.setRangeText(replacement, start, end, 'select');
    scheduleChange();
    els.editor.focus();
  });
});

document.getElementById('focusEditor').addEventListener('click', () => els.editor.focus());

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    sendChange();
    showToast('Changes sent to collaborators');
  }
});

socket.on('connect', () => {
  els.connectionPill.className = 'connection-pill connected';
  els.connectionText.textContent = 'Connected';
  addActivity('Connected to the collaboration server.', 'system');
  socket.emit('join-note', { noteId: state.noteId, username: state.username });
});

socket.on('disconnect', () => {
  els.connectionPill.className = 'connection-pill disconnected';
  els.connectionText.textContent = 'Disconnected';
  els.saveStatus.textContent = 'Offline';
  els.saveStatus.style.color = '#e05b62';
  addActivity('Connection lost. Socket.IO will attempt to reconnect.', 'system');
});

socket.on('note-state', (note) => {
  applyNote(note);
  state.notes = state.notes.map(item => item.id === note.id ? note : item);
  if (!state.notes.some(item => item.id === note.id)) state.notes.unshift(note);
  renderNotes();
});

socket.on('note-updated', ({ note, sourceId, sourceName, conflict }) => {
  if (note.id !== state.noteId) return;
  state.lastRemoteUpdate = Date.now();

  if (sourceId === socket.id) {
    // Preserve the local cursor while confirming the server revision.
    const cursor = els.editor.selectionStart;
    state.isApplyingRemote = true;
    els.noteTitle.value = note.title;
    els.breadcrumbTitle.textContent = note.title;
    state.revision = note.revision;
    els.revisionLabel.textContent = `Revision ${note.revision}`;
    els.lastUpdated.textContent = 'Updated just now';
    els.saveStatus.textContent = conflict ? 'Conflict resolved' : 'Saved';
    els.saveStatus.style.color = conflict ? 'var(--warning)' : 'var(--success)';
    els.editorHint.textContent = 'Changes sync automatically';
    updateWordCount();
    setTimeout(() => {
      els.editor.setSelectionRange(Math.min(cursor, els.editor.value.length), Math.min(cursor, els.editor.value.length));
      state.isApplyingRemote = false;
    }, 0);
    return;
  }

  applyNote(note);
  addActivity(`<span class="name">${escapeHtml(sourceName)}</span> updated the note.`);
  els.editorHint.textContent = `${sourceName} made a live edit`;
  setTimeout(() => { els.editorHint.textContent = 'Changes sync automatically'; }, 1800);
});

socket.on('presence-update', updatePresence);

socket.on('user-typing', ({ name, typing }) => {
  if (typing) {
    els.typingStatus.textContent = `${name} is typing...`;
  }
});

socket.on('system-message', message => addActivity(escapeHtml(message), 'system'));

socket.on('conflict-notice', ({ message }) => {
  els.saveStatus.textContent = 'Conflict handled';
  els.saveStatus.style.color = 'var(--warning)';
  showToast(message);
  addActivity(escapeHtml(message), 'system');
});

socket.on('cursor-update', ({ name, cursor }) => {
  // Presence indicator requirement: show where a remote editor is positioned as a line number.
  const before = els.editor.value.slice(0, Math.min(cursor, els.editor.value.length));
  const line = before.split('\n').length;
  els.editorHint.textContent = `${name} is viewing line ${line}`;
  clearTimeout(window.cursorHintTimer);
  window.cursorHintTimer = setTimeout(() => {
    els.editorHint.textContent = 'Changes sync automatically';
  }, 1200);
});

updateProfile();
loadNotes().then(() => joinNote(state.noteId)).catch(error => {
  console.error(error);
  showToast('Unable to load notes');
});
