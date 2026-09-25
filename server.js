const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const COLUMNS = 7;
const ROWS = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
app.use(express.static('public'));

function newBoard() { return Array.from({ length: ROWS }, () => Array(COLUMNS).fill(null)); }
function makeCode() {
  let code;
  do { code = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function publicState(room) {
  return {
    code: room.code,
    board: room.board,
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    players: room.players.map((p, index) => p ? { name: p.name, connected: p.connected, color: index === 0 ? 'red' : 'yellow' } : null)
  };
}
function sendState(room) { io.to(room.code).emit('state', publicState(room)); }
function findPlayer(room, token) { return room.players.findIndex(p => p && p.token === token); }
function reject(socket, message) { socket.emit('notice', message); }
function attach(socket, room, slot) {
  room.players[slot].connected = true;
  room.players[slot].socketId = socket.id;
  clearTimeout(room.players[slot].expiry);
  socket.data.room = room.code;
  socket.data.token = room.players[slot].token;
  socket.join(room.code);
  socket.emit('joined', { code: room.code, token: room.players[slot].token, slot });
  sendState(room);
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name, token } = {}) => {
    if (socket.data.room) return reject(socket, 'You are already in a room.');
    const code = makeCode();
    const room = { code, board: newBoard(), turn: 0, status: 'waiting', winner: null, players: [null, null] };
    room.players[0] = { token: token || crypto.randomUUID(), name: String(name || 'Player 1').slice(0, 18), connected: true, socketId: socket.id };
    rooms.set(code, room);
    attach(socket, room, 0);
  });

  socket.on('leaveRoom', () => {
    const room = rooms.get(socket.data.room);
    if (room) {
      const slot = findPlayer(room, socket.data.token);
      if (slot >= 0 && room.players[slot].socketId === socket.id) {
        clearTimeout(room.players[slot].expiry);
        room.players[slot] = null;
        if (!room.players[0] && !room.players[1]) rooms.delete(room.code);
        else { room.status = room.players[1] ? 'playing' : 'waiting'; sendState(room); }
      }
      socket.leave(room.code);
    }
    socket.data.room = null;
    socket.data.token = null;
  });

  socket.on('joinRoom', ({ code, name, token } = {}) => {
    if (socket.data.room) return reject(socket, 'You are already in a room.');
    code = String(code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return reject(socket, 'Room not found. Check the code or ask for a fresh link.');
    const known = token && findPlayer(room, token);
    if (known >= 0) return attach(socket, room, known);
    if (room.status === 'finished') return reject(socket, 'That game has ended. Ask the host to start a new room.');
    const slot = room.players.findIndex(p => p === null);
    if (slot < 0) return reject(socket, 'This room already has two players.');
    room.players[slot] = { token: token || crypto.randomUUID(), name: String(name || `Player ${slot + 1}`).slice(0, 18), connected: true, socketId: socket.id };
    room.status = 'playing';
    attach(socket, room, slot);
    io.to(code).emit('notice', 'Opponent connected. Player 1 goes first.');
  });

  socket.on('move', column => {
    const room = rooms.get(socket.data.room);
    if (!room || room.status !== 'playing') return reject(socket, 'The game is not ready for a move.');
    const slot = findPlayer(room, socket.data.token);
    if (slot < 0 || !room.players[slot].connected) return reject(socket, 'Reconnect to play.');
    if (slot !== room.turn) return reject(socket, 'It is the other player’s turn.');
    if (!Number.isInteger(column) || column < 0 || column >= COLUMNS) return reject(socket, 'Choose a column on the board.');
    let row = ROWS - 1;
    while (row >= 0 && room.board[row][column] !== null) row--;
    if (row < 0) return reject(socket, 'That column is full. Choose another one.');
    room.board[row][column] = slot;
    if (hasWon(room.board, row, column, slot)) {
      room.status = 'finished'; room.winner = slot;
    } else if (room.board.every(r => r.every(cell => cell !== null))) {
      room.status = 'finished'; room.winner = 'draw';
    } else room.turn = 1 - slot;
    sendState(room);
  });

  socket.on('playAgain', () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.status !== 'finished') return reject(socket, 'Finish the current game first.');
    room.board = newBoard(); room.turn = 0; room.status = room.players[1] ? 'playing' : 'waiting'; room.winner = null;
    io.to(room.code).emit('notice', 'A new game has started. Player 1 goes first.');
    sendState(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    const slot = findPlayer(room, socket.data.token);
    if (slot < 0 || room.players[slot].socketId !== socket.id) return;
    room.players[slot].connected = false;
    sendState(room);
    io.to(room.code).emit('notice', `${room.players[slot].name} disconnected. They can rejoin with the same link for 2 minutes.`);
    room.players[slot].expiry = setTimeout(() => {
      if (room.players[slot] && !room.players[slot].connected) {
        room.players[slot] = null;
        if (!room.players[0] && !room.players[1]) rooms.delete(room.code);
        else if (room.players.some(Boolean)) { room.status = room.players[1] ? 'playing' : 'waiting'; sendState(room); }
      }
    }, 120000);
  });
});

function hasWon(board, row, col, player) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign, c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLUMNS && board[r][c] === player) {
        count++; r += dr * sign; c += dc * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

app.get('/health', (_req, res) => res.json({ ok: true }));
server.listen(PORT, '0.0.0.0', () => console.log(`Connect Four listening on ${PORT}`));
