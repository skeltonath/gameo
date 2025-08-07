class TicTacToe {
  constructor() {
    this.board = Array(9).fill(null);
    this.currentPlayer = 'X';
    this.gameOver = false;
    this.winner = null;
    this.players = {
      X: null,
      O: null
    };
  }

  // Initialize the game with players
  initialize(players) {
    if (players.length !== 2) {
      throw new Error('Tic-Tac-Toe requires exactly 2 players');
    }
    
    this.players.X = players[0];
    this.players.O = players[1];
    this.currentPlayer = 'X';
    this.gameOver = false;
    this.winner = null;
    this.board = Array(9).fill(null);
  }

  // Validate and make a move
  makeMove(playerSessionId, position) {
    // Check if game is over
    if (this.gameOver) {
      return { valid: false, error: 'Game is already over' };
    }

    // Check if it's the player's turn
    const playerSymbol = this.getPlayerSymbol(playerSessionId);
    if (!playerSymbol) {
      return { valid: false, error: 'Player not found in game' };
    }

    if (this.currentPlayer !== playerSymbol) {
      return { valid: false, error: 'Not your turn' };
    }

    // Check if position is valid
    if (position < 0 || position > 8) {
      return { valid: false, error: 'Invalid position' };
    }

    // Check if position is already taken
    if (this.board[position] !== null) {
      return { valid: false, error: 'Position already taken' };
    }

    // Make the move
    this.board[position] = playerSymbol;

    // Check for win
    if (this.checkWin(position, playerSymbol)) {
      this.gameOver = true;
      this.winner = playerSymbol;
      return { 
        valid: true, 
        gameOver: true, 
        winner: playerSymbol,
        board: this.board 
      };
    }

    // Check for draw
    if (this.board.every(cell => cell !== null)) {
      this.gameOver = true;
      this.winner = 'draw';
      return { 
        valid: true, 
        gameOver: true, 
        winner: 'draw',
        board: this.board 
      };
    }

    // Switch players
    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';

    return { 
      valid: true, 
      gameOver: false,
      board: this.board,
      currentPlayer: this.currentPlayer
    };
  }

  // Get player symbol (X or O) by session ID
  getPlayerSymbol(sessionId) {
    if (this.players.X && this.players.X.sessionId === sessionId) {
      return 'X';
    }
    if (this.players.O && this.players.O.sessionId === sessionId) {
      return 'O';
    }
    return null;
  }

  // Check if the move results in a win
  checkWin(position, symbol) {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
      [0, 4, 8], [2, 4, 6] // Diagonals
    ];

    return winPatterns.some(pattern => {
      return pattern.every(pos => this.board[pos] === symbol);
    });
  }

  // Get current game state
  getState() {
    return {
      board: this.board,
      currentPlayer: this.currentPlayer,
      gameOver: this.gameOver,
      winner: this.winner,
      players: this.players
    };
  }

  // Reset the game
  reset() {
    this.board = Array(9).fill(null);
    this.currentPlayer = 'X';
    this.gameOver = false;
    this.winner = null;
  }
}

module.exports = TicTacToe;
