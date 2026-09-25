(() => {
  const socket = io();
  const $ = id => document.getElementById(id);
  const lobby = $('lobby');
  const gameView = $('game-view');
  const nameInput = $('player-name');
  const codeInput = $('room-code');
  const boardEl = $('board');
  const picksEl = $('column-picks');
  const banner = $('turn-banner');
  const turnText = $('turn-text');
  const gameActions = $('game-actions');
  let state = null;
  let mySlot = null;
  let toastTimer;

  const getToken = () => localStorage.getItem('fourplay-token') || '';
  const showToast = message => {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2900);
  };
  const cleanName = () => nameInput.value.trim().slice(0, 18) || 'Player';

  function enterRoom(code) {
    history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(code)}`);
    lobby.classList.add('hidden');
    gameView.classList.remove('hidden');
    $('room-code-display').textContent = code;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function createRoom() {
    socket.emit('createRoom', { name: cleanName(), token: getToken() || undefined });
  }

  function joinRoom(code) {
    const normalized = (code || '').trim().toUpperCase();
    if (!normalized) return showToast('Enter the room code first.');
    if (normalized.length !== 5) return showToast('Room codes are 5 characters long.');
    socket.emit('joinRoom', { code: normalized, name: cleanName(), token: getToken() || undefined });
  }

  $('create-button').addEventListener('click', createRoom);
  $('join-button').addEventListener('click', () => joinRoom(codeInput.value));
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(codeInput.value); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });
  $('share-button').addEventListener('click', async () => {
    const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(state?.code || '')}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Invite link copied. Send it to your opponent!');
    } catch {
      window.prompt('Copy this invite link:', link);
    }
  });
  $('play-again').addEventListener('click', () => socket.emit('playAgain'));
  $('new-room').addEventListener('click', () => {
    socket.emit('leaveRoom');
    history.replaceState(null, '', location.pathname);
    state = null; mySlot = null;
    gameView.classList.add('hidden'); lobby.classList.remove('hidden');
  });

  picksEl.innerHTML = Array.from({ length: 7 }, (_, col) => `<button type="button" aria-label="Drop disc in column ${col + 1}" title="Column ${col + 1}">${col + 1}</button>`).join('');
  [...picksEl.children].forEach((button, col) => button.addEventListener('click', () => socket.emit('move', col)));

  socket.on('joined', ({ code, token, slot }) => {
    localStorage.setItem('fourplay-token', token);
    mySlot = slot;
    enterRoom(code);
  });
  socket.on('notice', message => {
    if (!state && new URLSearchParams(location.search).has('room')) {
      lobby.classList.remove('hidden');
      gameView.classList.add('hidden');
      history.replaceState(null, '', location.pathname);
    }
    showToast(message);
  });
  socket.on('connect', () => {
    const code = new URLSearchParams(location.search).get('room');
    if (state) joinRoom(state.code);
    else if (code) joinRoom(code);
  });
  socket.on('connect_error', () => showToast('Connection issue. Reconnecting…'));
  socket.on('disconnect', () => {
    if (state) showToast('Connection lost. Trying to reconnect…');
  });
  socket.on('state', next => {
    state = next;
    if (location.search.includes('room=')) {
      lobby.classList.add('hidden');
      gameView.classList.remove('hidden');
    }
    $('room-code-display').textContent = next.code;
    render();
  });

  function render() {
    if (!state) return;
    boardEl.innerHTML = '';
    state.board.forEach((row, r) => row.forEach((cell, c) => {
      const el = document.createElement('div');
      el.className = `cell${cell === 0 ? ' red' : cell === 1 ? ' yellow' : ''}`;
      el.setAttribute('role', 'gridcell');
      el.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}${cell === null ? ', empty' : `, ${state.players[cell]?.name || `Player ${cell + 1}`}`}`);
      boardEl.appendChild(el);
    }));

    const ready = state.players.every(Boolean) && state.status === 'playing';
    [...picksEl.children].forEach((button, col) => {
      button.disabled = !ready || mySlot !== state.turn || state.board[0][col] !== null;
    });
    state.players.forEach((player, i) => {
      $(`player-name-${i}`).textContent = player ? player.name : 'Waiting…';
      $(`presence-${i}`).classList.toggle('online', Boolean(player?.connected));
      $(`player-card-${i}`).classList.toggle('active-player', state.status === 'playing' && i === state.turn);
    });

    banner.className = 'turn-banner';
    gameActions.classList.toggle('hidden', state.status !== 'finished');
    if (state.status === 'waiting') {
      turnText.textContent = 'Waiting for your opponent to join…';
    } else if (state.status === 'finished') {
      if (state.winner === 'draw') { banner.classList.add('draw'); turnText.textContent = 'It’s a draw! Nice game.'; }
      else {
        const winner = state.players[state.winner];
        banner.classList.add('won', state.winner === 0 ? 'red' : 'yellow');
        turnText.textContent = `${winner?.name || 'A player'} wins! Four in a row.`;
      }
    } else {
      const whoseTurn = state.players[state.turn];
      const isMine = mySlot === state.turn;
      if (!whoseTurn?.connected) turnText.textContent = `Waiting for ${whoseTurn?.name || 'your opponent'} to reconnect…`;
      else turnText.textContent = `${isMine ? 'Your turn' : `${whoseTurn?.name || `Player ${state.turn + 1}`}’s turn`} · ${whoseTurn?.name || `Player ${state.turn + 1}`}`;
      banner.classList.add(state.turn === 0 ? 'red' : 'yellow');
    }
  }

  const roomFromUrl = new URLSearchParams(location.search).get('room');
  if (roomFromUrl) {
    codeInput.value = roomFromUrl.toUpperCase();
    lobby.classList.add('hidden');
    gameView.classList.remove('hidden');
  }
})();
