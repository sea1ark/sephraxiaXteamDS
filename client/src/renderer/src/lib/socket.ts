// Socket.io client wrapper, typed against the shared event contracts.
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@sephraxia/shared';
import { SERVER_URL } from './config';

export type SephraxiaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: SephraxiaSocket | null = null;

export function connectSocket(token: string): SephraxiaSocket {
  if (socket) socket.disconnect();
  socket = io(SERVER_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });
  return socket;
}

export function getSocket(): SephraxiaSocket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
