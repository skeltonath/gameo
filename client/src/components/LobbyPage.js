import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { getSessionId } from '../utils/session';
import TicTacToe from './TicTacToe';
import LoveLetter from './LoveLetter';

const LobbyPage = () => {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [lobby, setLobby] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameConfig, setGameConfig] = useState({});
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(true);
  const [displayName, setDisplayNameState] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [gameState, setGameState] = useState(null);
  const [activeGame, setActiveGame] = useState(null);
  const hasJoined = useRef(false);

  // Cleanup old localStorage entries on component mount
  useEffect(() => {
    const cleanupOldEntries = () => {
      const keys = Object.keys(localStorage);
      const lobbyKeys = keys.filter(key => key.startsWith('lobby_') && key.endsWith('_name'));
      
      lobbyKeys.forEach(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          // Remove entries older than 24 hours
          if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem(key);
          }
        } catch (error) {
          // Remove corrupted entries
          localStorage.removeItem(key);
        }
      });
    };

    cleanupOldEntries();
  }, []);

  // Available games
  const availableGames = [
    {
      id: 'tic-tac-toe',
      name: 'Tic-Tac-Toe',
      description: 'Classic 3x3 grid game',
      minPlayers: 2,
      maxPlayers: 2,
      icon: '⭕'
    },
    {
      id: 'love-letter',
      name: 'Love Letter',
      description: 'Deduction card game',
      minPlayers: 2,
      maxPlayers: 4,
      icon: '💌'
    }
  ];

  useEffect(() => {
    const socketUrl = process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3001';
    const newSocket = io(socketUrl, { withCredentials: true });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      // Only join if we haven't already joined
      if (!hasJoined.current) {
        const sessionId = getSessionId();
        
        console.log('Socket connected, joining lobby automatically:', { 
          hasJoined: hasJoined.current, 
          sessionId, 
          lobbyId 
        });
        hasJoined.current = true;
        newSocket.emit('join-lobby', lobbyId, { sessionId: sessionId });
      } else {
        console.log('Already joined, skipping join request');
      }
    });

    newSocket.on('lobby-updated', (updatedLobby) => {
      setLobby(updatedLobby);
      setIsJoining(false);
      setShowNameInput(false);
    });

    newSocket.on('game-started', (data) => {
      console.log('Game started:', data);
      setGameState(data.gameState);
      setActiveGame(data.game);
      setLobby(prev => prev ? ({ ...prev, status: 'playing', game: data.game }) : ({ id: lobbyId, status: 'playing', game: data.game, players: [] }));
    });

    newSocket.on('move-made', (data) => {
      console.log('Move made:', data);
      setGameState(data.gameState);
    });

    newSocket.on('game-reset', (data) => {
      console.log('Game reset:', data);
      setGameState(data.gameState);
    });

    newSocket.on('error', (errorMessage) => {
      setError(errorMessage);
      setIsJoining(false);
    });

    return () => {
      console.log('Component unmounting, resetting hasJoined ref');
      hasJoined.current = false;
      newSocket.disconnect();
    };
  }, [lobbyId]);

  const handleChangeName = () => {
    if (!newName.trim()) {
      setError('Please enter a name');
      return;
    }

    console.log('Attempting to change name:', { newName: newName.trim(), socket: !!socket, lobby: !!lobby });
    
    if (socket) {
      const sessionId = getSessionId();
      console.log('Sending change-name request:', { newName: newName.trim(), sessionId });
      socket.emit('change-name', { 
        newName: newName.trim(),
        sessionId: sessionId
      });
      setEditingName(false);
      setNewName('');
    } else {
      console.log('No socket available for name change');
    }
  };

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    setGameConfig({});
  };

  const handleStartGame = () => {
    if (selectedGame && socket) {
      socket.emit('select-game', {
        game: selectedGame.id,
        config: gameConfig
      });
      socket.emit('start-game');
    }
  };

  const canStartGame = () => {
    return selectedGame && 
           lobby && 
           lobby.players.length >= selectedGame.minPlayers &&
           lobby.players.length <= selectedGame.maxPlayers;
  };

  const copyToClipboard = () => {
    const lobbyUrl = `${window.location.origin}/${lobbyId}`;
    navigator.clipboard.writeText(lobbyUrl).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  // Find current player
  const currentPlayer = lobby?.players.find(player => player.sessionId === getSessionId());
  const isOwner = lobby && currentPlayer && lobby.ownerSessionId === currentPlayer.sessionId;

  // Render game if we have a game state (works on reload too)
  if (gameState) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h1>🎮 {activeGame || lobby?.game}</h1>
            <button className="btn-secondary" onClick={() => navigate('/')}>Back to Home</button>
          </div>

          {(activeGame || lobby?.game) === 'tic-tac-toe' && (
            <TicTacToe
              socket={socket}
              gameState={gameState}
              onGameEnd={() => {
                setGameState(null);
                setLobby(prev => ({ ...prev, status: 'waiting' }));
                setActiveGame(null);
              }}
            />
          )}

          {(activeGame || lobby?.game) === 'love-letter' && (
            <LoveLetter
              socket={socket}
              gameState={gameState}
              isOwner={isOwner}
              onGameEnd={() => {
                setGameState(null);
                setLobby(prev => ({ ...prev, status: 'waiting' }));
                setActiveGame(null);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (isJoining) {
    return (
      <div className="container">
        <div className="card">
          <div className="loading">
            <h2>Joining Lobby...</h2>
            <p>Please wait while we connect you to the game.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <div className="error">
            <h2>Error</h2>
            <p>{error}</p>
            <button className="btn" onClick={() => navigate('/')}>
              Go Back Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="container">
        <div className="card">
          <div className="error">
            <h2>Lobby Not Found</h2>
            <p>The lobby you're looking for doesn't exist.</p>
            <button className="btn" onClick={() => navigate('/')}>
              Go Back Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1>🎮 Lobby: {lobbyId}</h1>
          <div>
            {isOwner && (
              <span className="player-chip" style={{ marginRight: 8 }}>Owner</span>
            )}
            <button className="btn-secondary" onClick={copyToClipboard} style={{ marginRight: 8 }}>
              {copySuccess ? 'Copied!' : 'Share'}
            </button>
            <button className="btn-secondary" onClick={() => navigate('/')}>Back to Home</button>
          </div>
        </div>

        {/* Current Player Info */}
        {currentPlayer && (
          <div style={{ marginBottom: '24px', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
            <h3>You are: {currentPlayer.name} {isOwner && <span style={{ fontSize: 12, color: '#666' }}>(Owner)</span>}</h3>
            <button 
              className="btn-secondary" 
              onClick={() => setEditingName(true)}
              style={{ marginTop: '8px' }}
            >
              Change Name
            </button>
            
            {editingName && (
              <div style={{ marginTop: '12px' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter new name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ marginRight: '8px', width: '200px' }}
                />
                <button className="btn" onClick={handleChangeName}>
                  Save
                </button>
                <button 
                  className="btn-secondary" 
                  onClick={() => {
                    setEditingName(false);
                    setNewName('');
                  }}
                  style={{ marginLeft: '8px' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Players Section */}
        <div style={{ marginBottom: '32px' }}>
          <h3>Players ({lobby.players.length})</h3>
          <div className="players-list">
            {lobby.players.map((player) => (
              <div key={player.id} className="player-chip">
                {player.name}{player.sessionId === lobby.ownerSessionId ? ' ⭐' : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Game Selection - owner only */}
        <div style={{ marginBottom: '32px', opacity: isOwner ? 1 : 0.6 }}>
          <h3>Select a Game {isOwner ? '' : '(owner only)'}</h3>
          <div className="game-grid">
            {availableGames.map((game) => (
              <div
                key={game.id}
                className={`game-card ${selectedGame?.id === game.id ? 'selected' : ''}`}
                onClick={() => isOwner ? handleGameSelect(game) : null}
                style={{ cursor: isOwner ? 'pointer' : 'not-allowed' }}
              >
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                  {game.icon}
                </div>
                <h4>{game.name}</h4>
                <p style={{ color: '#666', marginBottom: '12px' }}>
                  {game.description}
                </p>
                <small style={{ color: '#999' }}>
                  {game.minPlayers}-{game.maxPlayers} players
                </small>
              </div>
            ))}
          </div>
        </div>

        {/* Game Configuration (owner only for controls) */}
        {selectedGame && (
          <div style={{ marginBottom: '32px' }}>
            <h3>Game Configuration</h3>
            <div className="card">
              <h4>{selectedGame.name}</h4>
              <p>{selectedGame.description}</p>
              
              {/* Example option visible to all, but interactable only by owner */}
              <div style={{ marginTop: '16px', opacity: isOwner ? 1 : 0.6 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={gameConfig.customRules || false}
                    onChange={(e) => isOwner && setGameConfig({...gameConfig, customRules: e.target.checked})}
                    disabled={!isOwner}
                  />
                  Enable custom rules
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Start Game Button */}
        {selectedGame && (
          <div style={{ textAlign: 'center' }}>
            <button
              className="btn"
              onClick={handleStartGame}
              disabled={!isOwner || !canStartGame()}
              title={!isOwner ? 'Only the lobby owner can start the game' : ''}
            >
              Start Game
            </button>
            
            {!canStartGame() && (
              <p style={{ color: '#666', marginTop: '8px' }}>
                Need {selectedGame.minPlayers}-{selectedGame.maxPlayers} players to start
              </p>
            )}
          </div>
        )}

        {/* Share link moved to header via Share button */}
      </div>
    </div>
  );
};

export default LobbyPage;
