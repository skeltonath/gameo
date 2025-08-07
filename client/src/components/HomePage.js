import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { getSessionId } from '../utils/session';

const HomePage = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const createLobby = async () => {
    console.log('Creating lobby...');
    setIsCreating(true);
    setError('');

    try {
      // Connect to socket server
      console.log('Connecting to Socket.IO server...');
      const socketUrl = process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3001';
      const newSocket = io(socketUrl, { withCredentials: true });
      const sessionId = getSessionId();

      newSocket.on('connect', () => {
        console.log('Socket connected!');
        console.log('Emitting create-lobby event...');
        newSocket.emit('create-lobby', { 
          sessionId: sessionId
        });
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setError('Failed to connect to server. Please try again.');
        setIsCreating(false);
      });

      newSocket.on('lobby-created', (lobby) => {
        console.log('Lobby created:', lobby);
        setIsCreating(false);
        // Automatically navigate to the lobby page
        navigate(`/${lobby.id}`);
      });

      newSocket.on('error', (errorMessage) => {
        console.error('Server error:', errorMessage);
        setError(errorMessage);
        setIsCreating(false);
      });

    } catch (err) {
      console.error('Error creating lobby:', err);
      setError('Failed to create lobby. Please try again.');
      setIsCreating(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1 style={{ textAlign: 'center', marginBottom: '32px', color: '#333' }}>
          🎮 Gameo
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '32px', color: '#666' }}>
          Play tabletop games online with your friends
        </p>

        <div style={{ textAlign: 'center' }}>
          <button 
            className="btn" 
            onClick={createLobby}
            disabled={isCreating}
          >
            {isCreating ? 'Creating Lobby...' : 'Create New Lobby'}
          </button>
          
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default HomePage;
