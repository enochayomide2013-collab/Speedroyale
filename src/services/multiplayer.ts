import type { MultiplayerRoomState, RemoteRacerFrame } from '../shared/types';
import { getSessionToken } from './api';

export interface MultiplayerCallbacks {
  onConnected: (clientId: string) => void;
  onRoomState: (room: MultiplayerRoomState | null) => void;
  onRoomStart: (room: MultiplayerRoomState) => void;
  onSpectateOk?: (room: MultiplayerRoomState) => void;
  onRemoteFrame: (frame: RemoteRacerFrame) => void;
  onError: (message: string) => void;
  onDisconnect: () => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private callbacks: MultiplayerCallbacks;
  private reconnectTimer: number | null = null;
  private manualClose = false;
  public clientId: string | null = null;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(): void {
    const token = getSessionToken();
    if (!token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manualClose = false;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', payload: { token } }));
    };

    ws.onmessage = (event) => {
      let msg: { type: string; payload: unknown };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (msg.type === 'auth:ok') {
        this.clientId = (msg.payload as { clientId: string }).clientId;
        this.callbacks.onConnected(this.clientId);
      } else if (msg.type === 'room:state') {
        this.callbacks.onRoomState(msg.payload as MultiplayerRoomState);
      } else if (msg.type === 'room:left') {
        this.callbacks.onRoomState(null);
      } else if (msg.type === 'room:start') {
        this.callbacks.onRoomStart(msg.payload as MultiplayerRoomState);
      } else if (msg.type === 'room:spectate-ok') {
        this.callbacks.onSpectateOk?.(msg.payload as MultiplayerRoomState);
      } else if (msg.type === 'race:frame') {
        this.callbacks.onRemoteFrame(msg.payload as RemoteRacerFrame);
      } else if (msg.type === 'error') {
        this.callbacks.onError(String(msg.payload));
      }
    };

    ws.onclose = () => {
      this.callbacks.onDisconnect();
      if (!this.manualClose) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 2500);
      }
    };
  }

  public send(type: string, payload: Record<string, unknown> = {}): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  public disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
