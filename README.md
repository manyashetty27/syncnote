# SyncNote — Real-Time Collaborative Notes App

A professional real-time collaborative notes application built for Internship Task 28. Multiple users can open the same note and edit it simultaneously while changes, presence, typing status, and cursor position updates are synchronized through Socket.IO.

## Features

- Real-time collaborative text editing
- Shared note rooms using Socket.IO
- Automatic debounced synchronization
- Server-side revision tracking
- Basic last-write-wins conflict handling
- Active user presence indicators
- Live typing status
- Remote cursor position shown as a line indicator
- Create and switch between notes
- Editable note titles
- Collaboration activity feed
- Connection and synchronization status
- Responsive professional UI
- Clipboard-based Share Note action

## Tech Stack

- HTML5
- CSS3
- JavaScript
- Node.js
- Express.js
- Socket.IO

## Project Structure

```text
real-time-collaborative-notes/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   └── index.html
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## Installation

### 1. Open the project

```bash
cd real-time-collaborative-notes
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the application

```bash
npm start
```

For development with automatic server restart:

```bash
npm run dev
```

### 4. Open the application

```text
http://localhost:3000
```

## How to Test Real-Time Collaboration

1. Start the Node.js server.
2. Open `http://localhost:3000` in Chrome.
3. Open the same URL in a second browser tab or another browser window.
4. Change the display name in each tab.
5. Open the same note in both tabs.
6. Type in one editor.
7. The second editor receives the update automatically.
8. Check the active-user avatars and typing status.
9. Move the cursor in one tab and observe the remote editor line indicator.
10. Edit the title and verify that it is synchronized as well.

## Conflict Handling

The server assigns an incrementing revision to each accepted edit. Each client sends the revision it last observed. If an edit arrives with an older base revision, the server flags the change as a conflict and applies a simple last-write-wins strategy using server arrival order. The affected client receives a conflict notification.

This is intentionally a basic conflict strategy for the internship task. Production collaborative editors can use operational transformation (OT) or CRDTs for finer-grained concurrent editing.

## Notes on Data Storage

This internship version uses an in-memory `Map`, so note changes are reset when the Node.js process restarts. A production version can replace the in-memory store with SQLite, PostgreSQL, MongoDB, or another persistent database.

## Security and Production Improvements

For production deployment, add authentication, authorization, input validation, rate limiting, persistent storage, HTTPS/WSS, structured logging, and a shared Socket.IO adapter such as Redis when running multiple server instances.

## References

- Socket.IO: https://socket.io/
- Express static files: https://expressjs.com/en/starter/static-files.html
- MDN WebSockets API: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
