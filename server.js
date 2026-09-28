const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory note store for this internship task.
const notes = new Map([
  ['1', {
    id: '1',
    title: 'Team Meeting Notes',
    content: '# Team Meeting Notes\n\nAgenda:\n- Review sprint progress\n- Discuss blockers\n- Plan next release\n\nType here and open this page in another browser tab to test real-time collaboration.',
    revision: 1,
    updatedAt: Date.now(),
    updatedBy: 'System'
  }],
  ['2', {
    id: '2',
    title: 'Project Ideas',
    content: '# Project Ideas\n\n1. Collaborative whiteboard\n2. Study planner\n3. Interview preparation tracker',
    revision: 1,
    updatedAt: Date.now(),
    updatedBy: 'System'
  }],
  ['3', {
    id: '3',
    title: 'Daily Standup',
    content: '# Daily Standup\n\nYesterday:\n- Completed API integration\n\nToday:\n- Finish real-time editing\n\nBlockers:\n- None',
    revision: 1,
    updatedAt: Date.now(),
    updatedBy: 'System'
  }]
]);

// Track users currently inside each note room.
const presence = new Map(); // noteId -> Map(socketId -> user)

function safeText(value, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 10000) : fallback;
}

function getNote(noteId) {
  if (!notes.has(noteId)) {
    notes.set(noteId, {
      id: noteId,
      title: `Untitled Note ${noteId}`,
      content: '',
      revision: 0,
      updatedAt: Date.now(),
      updatedBy: 'System'
    });
  }
  return notes.get(noteId);
}

function getPresence(noteId) {
  if (!presence.has(noteId)) presence.set(noteId, new Map());
  return presence.get(noteId);
}

function presenceList(noteId) {
  return Array.from(getPresence(noteId).values());
}

app.get('/api/notes', (req, res) => {
  const result = Array.from(notes.values()).map(({ id, title, updatedAt, updatedBy }) => ({
    id, title, updatedAt, updatedBy
  }));
  res.json(result);
});

app.get('/api/notes/:id', (req, res) => {
  const note = getNote(req.params.id);
  res.json(note);
});

app.post('/api/notes', (req, res) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = safeText(req.body?.title, 'Untitled Note').trim() || 'Untitled Note';
  const note = {
    id,
    title: title.slice(0, 80),
    content: '',
    revision: 0,
    updatedAt: Date.now(),
    updatedBy: 'System'
  };
  notes.set(id, note);
  res.status(201).json(note);
});

io.on('connection', (socket) => {
  socket.on('join-note', ({ noteId, username }) => {
    noteId = safeText(noteId, '1');
    username = safeText(username, 'Guest').trim().slice(0, 30) || 'Guest';

    // Leave previous room if the user switches notes.
    if (socket.data.noteId) {
      leaveNote(socket);
    }

    const note = getNote(noteId);
    socket.data.noteId = noteId;
    socket.data.username = username;
    socket.join(`note:${noteId}`);

    const users = getPresence(noteId);
    users.set(socket.id, {
      id: socket.id,
      name: username,
      typing: false,
      cursor: 0
    });

    socket.emit('note-state', note);
    io.to(`note:${noteId}`).emit('presence-update', presenceList(noteId));
    socket.to(`note:${noteId}`).emit('system-message', `${username} joined the note.`);
  });

  socket.on('note-change', ({ noteId, content, title, baseRevision, cursor }) => {
    if (socket.data.noteId !== noteId) return;

    const note = getNote(noteId);
    const previousRevision = note.revision;
    const incomingContent = safeText(content);
    const incomingTitle = safeText(title, note.title).trim().slice(0, 80) || note.title;

    // Basic last-write-wins strategy. Every accepted change gets a new server revision.
    // A stale baseRevision is reported as a conflict but the newest received edit wins.
    const conflict = Number.isInteger(baseRevision) && baseRevision !== previousRevision;

    note.content = incomingContent;
    note.title = incomingTitle;
    note.revision += 1;
    note.updatedAt = Date.now();
    note.updatedBy = socket.data.username;

    const user = getPresence(noteId).get(socket.id);
    if (user) {
      user.typing = false;
      user.cursor = Number.isFinite(cursor) ? cursor : 0;
    }

    io.to(`note:${noteId}`).emit('note-updated', {
      note,
      sourceId: socket.id,
      sourceName: socket.data.username,
      conflict,
      previousRevision
    });

    if (conflict) {
      socket.emit('conflict-notice', {
        message: 'A newer edit arrived before this change. The latest server edit was applied.',
        revision: note.revision
      });
    }
  });

  socket.on('typing', ({ noteId, typing }) => {
    if (socket.data.noteId !== noteId) return;
    const user = getPresence(noteId).get(socket.id);
    if (!user) return;
    user.typing = Boolean(typing);
    socket.to(`note:${noteId}`).emit('user-typing', {
      id: socket.id,
      name: socket.data.username,
      typing: user.typing
    });
    io.to(`note:${noteId}`).emit('presence-update', presenceList(noteId));
  });

  socket.on('cursor-move', ({ noteId, cursor }) => {
    if (socket.data.noteId !== noteId) return;
    const user = getPresence(noteId).get(socket.id);
    if (!user) return;
    user.cursor = Number.isFinite(cursor) ? cursor : 0;
    socket.to(`note:${noteId}`).emit('cursor-update', {
      id: socket.id,
      name: socket.data.username,
      cursor: user.cursor
    });
  });

  socket.on('disconnect', () => {
    leaveNote(socket);
  });

  function leaveNote(currentSocket) {
    const oldNoteId = currentSocket.data.noteId;
    if (!oldNoteId) return;

    const users = getPresence(oldNoteId);
    users.delete(currentSocket.id);
    currentSocket.leave(`note:${oldNoteId}`);
    io.to(`note:${oldNoteId}`).emit('presence-update', presenceList(oldNoteId));

    if (currentSocket.data.username) {
      io.to(`note:${oldNoteId}`).emit('system-message', `${currentSocket.data.username} left the note.`);
    }

    currentSocket.data.noteId = null;
  }
});

server.listen(PORT, () => {
  console.log(`Real-Time Collaborative Notes running at http://localhost:${PORT}`);
});
