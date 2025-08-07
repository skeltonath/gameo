# Gameo - Online Tabletop Games

A modern web application for playing tabletop games online with friends. Built with React frontend and Node.js/Express backend with Socket.IO for real-time communication.

## Features

- **Create Lobbies**: Generate unique lobby links to share with friends
- **Join Lobbies**: Easy lobby joining via shared links
- **Game Selection**: Choose from various tabletop games
- **Real-time Updates**: Live updates when players join/leave
- **Game Configuration**: Customize game settings before starting
- **Modern UI**: Beautiful, responsive design

## Available Games

- Tic-Tac-Toe (2 players)
- Connect Four (2 players)
- Checkers (2 players)
- Hangman (2-8 players)

## Tech Stack

- **Frontend**: React, React Router, Socket.IO Client
- **Backend**: Node.js, Express, Socket.IO
- **Styling**: CSS3 with modern gradients and animations

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd gameo
```

2. Install dependencies for both frontend and backend:
```bash
npm run install-all
```

3. Start the development servers:
```bash
npm run dev
```

This will start:
- Backend server on `http://localhost:5000`
- Frontend development server on `http://localhost:3000`

### Development

- **Backend only**: `npm run server`
- **Frontend only**: `npm run client`
- **Build for production**: `npm run build`

## Usage

1. **Create a Lobby**: Visit the homepage and click "Create New Lobby"
2. **Share the Link**: Copy the generated lobby link and share it with friends
3. **Join a Lobby**: Friends can join by visiting the shared link
4. **Select a Game**: Choose from available games in the lobby
5. **Configure & Start**: Set game options and start playing

## Project Structure

```
gameo/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── App.js         # Main app component
│   │   └── index.js       # Entry point
│   └── package.json
├── server/                 # Node.js backend
│   └── index.js           # Express server with Socket.IO
├── package.json           # Root package.json
└── README.md
```

## API Endpoints

- `GET /api/lobbies/:lobbyId` - Get lobby information
- `GET /` - Homepage
- `GET /:lobbyId` - Lobby page

## Socket.IO Events

### Client to Server
- `create-lobby` - Create a new lobby
- `join-lobby` - Join an existing lobby
- `select-game` - Select a game and configuration
- `start-game` - Start the selected game

### Server to Client
- `lobby-created` - New lobby created
- `lobby-updated` - Lobby state updated
- `game-started` - Game has started
- `error` - Error message

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Future Enhancements

- [ ] Implement actual game logic for each game
- [ ] Add more games (Chess, Battleship, etc.)
- [ ] User authentication and profiles
- [ ] Game history and statistics
- [ ] Mobile app version
- [ ] Voice chat integration
