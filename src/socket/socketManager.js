const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;
const userSockets = new Map();

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(decoded.id);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);
    console.log(`[socket] User ${userId} connected (socket ${socket.id})`);

    socket.on('disconnect', () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) userSockets.delete(userId);
      }
      console.log(`[socket] User ${userId} disconnected`);
    });
  });

  return io;
};

const getIO = () => io;

const emitToUser = (idUsuario, event, data) => {
  if (!io) return;
  const socketIds = userSockets.get(String(idUsuario));
  if (!socketIds) return;
  for (const sid of socketIds) {
    io.to(sid).emit(event, data);
  }
};

module.exports = { initSocket, getIO, emitToUser };