import React, { useState, useEffect } from 'react';
import { getSessionId } from '../utils/session';

const TicTacToe = ({ socket, gameState, onGameEnd }) => {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState('X');
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [mySymbol, setMySymbol] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (gameState) {
      setBoard(gameState.board);
      setCurrentPlayer(gameState.currentPlayer);
      setGameOver(gameState.gameOver);
      setWinner(gameState.winner);
      
      // Determine my symbol
      const sessionId = getSessionId();
      if (gameState.players.X && gameState.players.X.sessionId === sessionId) {
        setMySymbol('X');
      } else if (gameState.players.O && gameState.players.O.sessionId === sessionId) {
        setMySymbol('O');
      }
    }
  }, [gameState]);

  useEffect(() => {
    if (!socket) return;

    // Listen for move updates
    socket.on('move-made', (data) => {
      setBoard(data.gameState.board);
      setCurrentPlayer(data.gameState.currentPlayer);
      setGameOver(data.gameState.gameOver);
      setWinner(data.gameState.winner);
      setError('');
    });

    // Listen for game reset
    socket.on('game-reset', (data) => {
      setBoard(data.gameState.board);
      setCurrentPlayer(data.gameState.currentPlayer);
      setGameOver(data.gameState.gameOver);
      setWinner(data.gameState.winner);
      setError('');
    });

    // Listen for errors
    socket.on('error', (errorMessage) => {
      setError(errorMessage);
    });

    return () => {
      socket.off('move-made');
      socket.off('game-reset');
      socket.off('error');
    };
  }, [socket]);

  const handleCellClick = (index) => {
    if (!socket || gameOver || board[index] !== null) {
      return;
    }

    // Check if it's my turn
    if (currentPlayer !== mySymbol) {
      setError('Not your turn');
      return;
    }

    // Send move to server
    const sessionId = getSessionId();
    socket.emit('make-move', {
      sessionId: sessionId,
      position: index
    });
  };

  const handleResetGame = () => {
    if (socket) {
      socket.emit('reset-game');
    }
  };

  const renderCell = (value, index) => {
    const isClickable = !gameOver && value === null && currentPlayer === mySymbol;
    
    return (
      <div
        key={index}
        className={`cell ${isClickable ? 'clickable' : ''}`}
        onClick={() => handleCellClick(index)}
      >
        {value}
      </div>
    );
  };

  const getStatusMessage = () => {
    if (gameOver) {
      if (winner === 'draw') {
        return "It's a draw!";
      } else if (winner === mySymbol) {
        return 'You won!';
      } else {
        return 'You lost!';
      }
    } else {
      if (currentPlayer === mySymbol) {
        return "It's your turn";
      } else {
        return "Waiting for opponent...";
      }
    }
  };

  return (
    <div className="game-container">
      <h2>Tic-Tac-Toe</h2>
      
      {error && <div className="error">{error}</div>}
      
      <div className="status">
        <p>{getStatusMessage()}</p>
        <p>You are: {mySymbol}</p>
      </div>
      
      <div className="board">
        {board.map((cell, index) => renderCell(cell, index))}
      </div>
      
      <div style={{ marginTop: '20px' }}>
        {gameOver && (
          <button className="btn" onClick={handleResetGame} style={{ marginRight: '10px' }}>
            Play Again
          </button>
        )}
        <button className="btn-secondary" onClick={() => window.location.reload()}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
};

export default TicTacToe;
