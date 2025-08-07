const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const TicTacToe = require('./games/ticTacToe');
const LoveLetter = require('./games/loveLetter');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Trust Heroku reverse proxy so we can detect protocol
app.enable('trust proxy');

// Redirect HTTP to HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    return next();
  });
}

app.use(express.static(path.join(__dirname, '../client/build')));

// In-memory storage for lobbies
const lobbies = new Map();

// Server-side session storage for player names
const playerSessions = new Map(); // sessionId -> playerData

// Lobby cleanup system
const lobbyCleanup = new Map(); // lobbyId -> timeout

const scheduleLobbyCleanup = (lobbyId, delayMs = 5 * 60 * 1000) => {
  // Clear existing cleanup if any
  if (lobbyCleanup.has(lobbyId)) {
    clearTimeout(lobbyCleanup.get(lobbyId));
  }
  
  // Schedule new cleanup
  const timeoutId = setTimeout(() => {
    if (lobbies.has(lobbyId)) {
      const lobby = lobbies.get(lobbyId);
      if (lobby.players.length === 0) {
        lobbies.delete(lobbyId);
        console.log(`Lobby ${lobbyId} deleted after 5 minutes of being empty`);
      }
    }
    lobbyCleanup.delete(lobbyId);
  }, delayMs);
  
  lobbyCleanup.set(lobbyId, timeoutId);
};

const cancelLobbyCleanup = (lobbyId) => {
  if (lobbyCleanup.has(lobbyId)) {
    clearTimeout(lobbyCleanup.get(lobbyId));
    lobbyCleanup.delete(lobbyId);
  }
};

// Helper to get or create player session data
const getPlayerSession = (sessionId) => {
  if (!playerSessions.has(sessionId)) {
    playerSessions.set(sessionId, {
      name: null,
      lastSeen: Date.now()
    });
  }
  return playerSessions.get(sessionId);
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a lobby
  socket.on('join-lobby', (lobbyId, data) => {
    console.log(`User ${socket.id} attempting to join lobby: ${lobbyId}`);
    if (lobbies.has(lobbyId)) {
      const lobby = lobbies.get(lobbyId);
      const sessionId = data?.sessionId || socket.id;
      
      // If a game is already in progress, ensure membership and return player to game view immediately
      if (lobby.status === 'playing' && lobby.game && lobby.gameInstance) {
        // Ensure player entry exists or update socket id
        let player = lobby.players.find(p => p.sessionId === sessionId);
        if (!player) {
          const playerSession = getPlayerSession(sessionId);
          const playerName = playerSession.name || `Player ${lobby.players.length + 1}`;
          player = { id: socket.id, sessionId, name: playerName };
          lobby.players.push(player);
        } else {
          player.id = socket.id;
        }
        socket.join(lobbyId);
        socket.lobbyId = lobbyId;
        cancelLobbyCleanup(lobbyId);

        if (lobby.game === 'love-letter') {
          socket.emit('game-started', { game: lobby.game, gameState: lobby.gameInstance.getState(sessionId) });
        } else if (lobby.game === 'tic-tac-toe') {
          socket.emit('game-started', { game: lobby.game, gameState: lobby.gameInstance.getState() });
        }
        return;
      }
      
      // Check if user is already in this lobby (by session ID)
      const existingPlayer = lobby.players.find(player => player.sessionId === sessionId);
      if (existingPlayer) {
        console.log(`User with session ${sessionId} is already in lobby ${lobbyId} as ${existingPlayer.name}`);
        // Update the stored socket ID to the current socket
        existingPlayer.id = socket.id;
        // Still set the socket.lobbyId so the socket can send lobby-specific events
        socket.join(lobbyId);
        socket.lobbyId = lobbyId;
        // Cancel any pending cleanup since someone is joining
        cancelLobbyCleanup(lobbyId);
        
        // If a game is in progress, immediately return player to game view
        if (lobby.status === 'playing' && lobby.game && lobby.gameInstance) {
          if (lobby.game === 'love-letter') {
            socket.emit('game-started', {
              game: lobby.game,
              gameState: lobby.gameInstance.getState(sessionId)
            });
          } else if (lobby.game === 'tic-tac-toe') {
            socket.emit('game-started', {
              game: lobby.game,
              gameState: lobby.gameInstance.getState()
            });
          }
        } else {
          socket.emit('lobby-updated', lobby);
        }
        return;
      }
      
      // Get player session data
      const playerSession = getPlayerSession(sessionId);
      let playerName;
      
      if (playerSession.name) {
        // Use existing name from server session
        playerName = playerSession.name;
        console.log(`Using existing name for session ${sessionId}: ${playerName}`);
      } else {
        // Generate new default name
        playerName = `Player ${lobby.players.length + 1}`;
        playerSession.name = playerName;
        console.log(`Generated new name for session ${sessionId}: ${playerName}`);
      }
      
      console.log(`Adding user ${socket.id} (session: ${sessionId}) to lobby ${lobbyId} with name: ${playerName}`);
      socket.join(lobbyId);
      socket.lobbyId = lobbyId;
      
      // Cancel any pending cleanup since someone is joining
      cancelLobbyCleanup(lobbyId);
      
      lobby.players.push({
        id: socket.id,
        sessionId: sessionId,
        name: playerName
      });
      
      console.log(`Lobby ${lobbyId} now has ${lobby.players.length} players:`, lobby.players.map(p => p.name));
      io.to(lobbyId).emit('lobby-updated', lobby);
      console.log(`User ${socket.id} joined lobby ${lobbyId}`);
    } else {
      console.log(`Lobby ${lobbyId} not found for user ${socket.id}`);
      socket.emit('error', 'Lobby not found');
    }
  });

  // Create a new lobby
  socket.on('create-lobby', (data) => {
    console.log(`User ${socket.id} requesting to create a new lobby`);
    const lobbyId = uuidv4().substring(0, 8);
    const lobby = {
      id: lobbyId,
      players: [],
      game: null,
      gameConfig: {},
      status: 'waiting', // waiting, playing, finished
      createdAt: Date.now(),
      ownerSessionId: null,
    };
    
    lobbies.set(lobbyId, lobby);
    console.log(`New lobby created: ${lobbyId} by user ${socket.id}`);
    
    // Add the creator to the lobby
    socket.join(lobbyId);
    socket.lobbyId = lobbyId;
    const sessionId = data?.sessionId || socket.id;
    
    // Store creator's name in server session
    const playerSession = getPlayerSession(sessionId);
    playerSession.name = 'Player 1';
    playerSession.lastSeen = Date.now();

    // Record owner
    lobby.ownerSessionId = sessionId;
    
    lobby.players.push({
      id: socket.id,
      sessionId: sessionId,
      name: 'Player 1'
    });
    
    socket.emit('lobby-created', lobby);
  });

  // Change player name
  socket.on('change-name', (data) => {
    console.log('Received change-name request:', { socketId: socket.id, data });
    
    if (socket.lobbyId && lobbies.has(socket.lobbyId)) {
      const lobby = lobbies.get(socket.lobbyId);
      const sessionId = data?.sessionId;
      
      console.log('Processing name change:', { 
        lobbyId: socket.lobbyId, 
        sessionId, 
        players: lobby.players.map(p => ({ id: p.id, sessionId: p.sessionId, name: p.name }))
      });
      
      if (!sessionId) {
        console.log('No session ID provided for name change');
        return;
      }
      
      // Find the player by session ID
      const player = lobby.players.find(p => p.sessionId === sessionId);
      if (player) {
        // Update both the lobby player and the server session
        player.name = data.newName;
        const playerSession = getPlayerSession(sessionId);
        playerSession.name = data.newName;
        playerSession.lastSeen = Date.now();
        
        console.log(`Player ${sessionId} changed name to: ${data.newName}`);
        io.to(socket.lobbyId).emit('lobby-updated', lobby);
      } else {
        console.log(`Player with session ${sessionId} not found in lobby ${socket.lobbyId}`);
        console.log('Available players:', lobby.players.map(p => ({ sessionId: p.sessionId, name: p.name })));
      }
    } else {
      console.log('Socket not in lobby or lobby not found:', { socketId: socket.id, lobbyId: socket.lobbyId });
    }
  });

  // Update game selection
  socket.on('select-game', (gameData) => {
    if (socket.lobbyId && lobbies.has(socket.lobbyId)) {
      const lobby = lobbies.get(socket.lobbyId);

      // Identify acting player
      const actor = lobby.players.find(p => p.id === socket.id);
      if (!actor) {
        socket.emit('error', 'Not in lobby');
        return;
      }
      if (actor.sessionId !== lobby.ownerSessionId) {
        socket.emit('error', 'Only the lobby owner can select the game');
        return;
      }

      lobby.game = gameData.game;
      lobby.gameConfig = gameData.config || {};
      io.to(socket.lobbyId).emit('lobby-updated', lobby);
    }
  });

  // Start game
  socket.on('start-game', () => {
    if (socket.lobbyId && lobbies.has(socket.lobbyId)) {
      const lobby = lobbies.get(socket.lobbyId);
      
      // Identify acting player
      const actor = lobby.players.find(p => p.id === socket.id);
      if (!actor) {
        socket.emit('error', 'Not in lobby');
        return;
      }
      if (actor.sessionId !== lobby.ownerSessionId) {
        socket.emit('error', 'Only the lobby owner can start the game');
        return;
      }
      
      // Check if game is selected
      if (!lobby.game) {
        socket.emit('error', 'No game selected');
        return;
      }
      
      // Initialize game based on type
      if (lobby.game === 'tic-tac-toe') {
        if (lobby.players.length !== 2) {
          socket.emit('error', 'Tic-Tac-Toe requires exactly 2 players');
          return;
        }
        
        // Create new game instance
        lobby.gameInstance = new TicTacToe();
        lobby.gameInstance.initialize(lobby.players);
        lobby.status = 'playing';
        
        console.log(`Tic-Tac-Toe game started in lobby ${socket.lobbyId}`);
        io.to(socket.lobbyId).emit('game-started', {
          game: lobby.game,
          gameState: lobby.gameInstance.getState()
        });
      } else if (lobby.game === 'love-letter') {
        if (lobby.players.length < 2 || lobby.players.length > 4) {
          socket.emit('error', 'Love Letter requires 2-4 players');
          return;
        }
        
        // Create new game instance
        lobby.gameInstance = new LoveLetter();
        lobby.gameInstance.initialize(lobby.players);
        lobby.status = 'playing';
        
        console.log(`Love Letter game started in lobby ${socket.lobbyId}`);
        // Send player-specific game state to each player
        lobby.players.forEach(player => {
          const playerSocket = io.sockets.sockets.get(player.id);
          if (playerSocket) {
            playerSocket.emit('game-started', {
              game: lobby.game,
              gameState: lobby.gameInstance.getState(player.sessionId)
            });
          }
        });
      }
    }
  });

  // Play again (owner only): re-initialize the current game with same players
  socket.on('play-again', () => {
    if (!socket.lobbyId || !lobbies.has(socket.lobbyId)) return;
    const lobby = lobbies.get(socket.lobbyId);
    const actor = lobby.players.find(p => p.id === socket.id);
    if (!actor) { socket.emit('error', 'Not in lobby'); return; }
    if (actor.sessionId !== lobby.ownerSessionId) { socket.emit('error', 'Only the lobby owner can play again'); return; }
    if (!lobby.game) { socket.emit('error', 'No game selected'); return; }

    if (lobby.game === 'tic-tac-toe') {
      if (lobby.players.length !== 2) { socket.emit('error', 'Tic-Tac-Toe requires exactly 2 players'); return; }
      lobby.gameInstance = new TicTacToe();
      lobby.gameInstance.initialize(lobby.players);
      lobby.status = 'playing';
      io.to(socket.lobbyId).emit('game-started', { game: lobby.game, gameState: lobby.gameInstance.getState() });
    } else if (lobby.game === 'love-letter') {
      if (lobby.players.length < 2 || lobby.players.length > 4) { socket.emit('error', 'Love Letter requires 2-4 players'); return; }
      lobby.gameInstance = new LoveLetter();
      lobby.gameInstance.initialize(lobby.players);
      lobby.status = 'playing';
      lobby.players.forEach(player => {
        const s = io.sockets.sockets.get(player.id);
        if (s) s.emit('game-started', { game: lobby.game, gameState: lobby.gameInstance.getState(player.sessionId) });
      });
    }
  });

  // Back to lobby (owner only): stop game and return to lobby screen
  socket.on('back-to-lobby', () => {
    if (!socket.lobbyId || !lobbies.has(socket.lobbyId)) return;
    const lobby = lobbies.get(socket.lobbyId);
    const actor = lobby.players.find(p => p.id === socket.id);
    if (!actor) { socket.emit('error', 'Not in lobby'); return; }
    if (actor.sessionId !== lobby.ownerSessionId) { socket.emit('error', 'Only the lobby owner can return to lobby'); return; }

    lobby.status = 'waiting';
    lobby.gameInstance = null;
    lobby.game = null; // allow selecting new game
    io.to(socket.lobbyId).emit('lobby-updated', lobby);
  });

  // Make a move
  socket.on('make-move', (data) => {
    if (socket.lobbyId && lobbies.has(socket.lobbyId)) {
      const lobby = lobbies.get(socket.lobbyId);
      
      if (lobby.status !== 'playing' || !lobby.gameInstance) {
        socket.emit('error', 'No active game');
        return;
      }
      
      const sessionId = data?.sessionId;
      
      if (!sessionId) {
        socket.emit('error', 'Session ID required');
        return;
      }
      
      let result;
      
      // Handle different game types
      if (lobby.game === 'tic-tac-toe') {
        const position = data?.position;
        if (position === undefined) {
          socket.emit('error', 'Position required for Tic-Tac-Toe');
          return;
        }
        
        result = lobby.gameInstance.makeMove(sessionId, position);
      } else if (lobby.game === 'love-letter') {
        const { cardIndex, targetPlayerSessionId, guessCard } = data;
        if (cardIndex === undefined) {
          socket.emit('error', 'Card index required for Love Letter');
          return;
        }
        
        result = lobby.gameInstance.makeMove(sessionId, data);
      } else {
        socket.emit('error', 'Unknown game type');
        return;
      }
      
      if (result.valid) {
        // Send player-specific game state to each player
        lobby.players.forEach(player => {
          const playerSocket = io.sockets.sockets.get(player.id);
          if (playerSocket) {
            let gameState;
            if (lobby.game === 'love-letter') {
              gameState = lobby.gameInstance.getState(player.sessionId);
            } else {
              gameState = lobby.gameInstance.getState();
            }
            
            playerSocket.emit('move-made', {
              gameState: gameState,
              gameOver: result.gameOver || false
            });
          }
        });

        // Send private info to acting player if applicable (e.g., Priest reveal)
        if (lobby.game === 'love-letter' && result.effect && result.effect.revealedCard !== undefined) {
          const actingPlayer = lobby.players.find(p => p.sessionId === sessionId);
          if (actingPlayer) {
            const actingSocket = io.sockets.sockets.get(actingPlayer.id);
            if (actingSocket) {
              actingSocket.emit('private-info', {
                type: 'priest-reveal',
                targetPlayerSessionId: result.targetPlayerSessionId,
                revealedCard: result.effect.revealedCard
              });
            }
          }
        }
        
        console.log(`Move made in lobby ${socket.lobbyId} for ${lobby.game}`);
      } else {
        socket.emit('error', result.error);
      }
    }
  });

  // Reset game
  socket.on('reset-game', () => {
    if (socket.lobbyId && lobbies.has(socket.lobbyId)) {
      const lobby = lobbies.get(socket.lobbyId);
      
      if (lobby.gameInstance) {
        lobby.gameInstance.reset();
        lobby.status = 'playing';
        
        console.log(`Game reset in lobby ${socket.lobbyId}`);
        // Send player-specific game state to each player
        lobby.players.forEach(player => {
          const playerSocket = io.sockets.sockets.get(player.id);
          if (playerSocket) {
            let gameState;
            if (lobby.game === 'love-letter') {
              gameState = lobby.gameInstance.getState(player.sessionId);
            } else {
              gameState = lobby.gameInstance.getState();
            }
            
            playerSocket.emit('game-reset', {
              gameState: gameState
            });
          }
        });
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.lobbyId && lobbies.has(socket.lobbyId)) {
      const lobby = lobbies.get(socket.lobbyId);
      // Remove the player by socket ID (but keep session ID for reconnection)
      lobby.players = lobby.players.filter(player => player.id !== socket.id);
      
      if (lobby.players.length === 0) {
        // Schedule cleanup instead of immediate deletion
        console.log(`Lobby ${socket.lobbyId} is now empty, scheduling cleanup in 5 minutes`);
        scheduleLobbyCleanup(socket.lobbyId);
      } else {
        // Cancel any pending cleanup since there are still players
        cancelLobbyCleanup(socket.lobbyId);
        io.to(socket.lobbyId).emit('lobby-updated', lobby);
      }
    }
  });
});

// API Routes
app.get('/api/lobbies/:lobbyId', (req, res) => {
  const { lobbyId } = req.params;
  const lobby = lobbies.get(lobbyId);
  
  if (lobby) {
    res.json(lobby);
  } else {
    res.status(404).json({ error: 'Lobby not found' });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
