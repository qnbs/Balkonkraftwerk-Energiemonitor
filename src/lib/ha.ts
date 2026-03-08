export const HA_CONFIG_KEY = 'bkw-ha-config';

export interface HAConfig {
  url: string;
  token: string;
  entitySolar: string;
  entityLoad: string;
  entityBattery: string;
}

export type HAStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'error';

export interface HAData {
  solarW: number;
  loadW: number;
  batteryPct: number | null;
  updatedAt: number;
}

export const DEFAULT_HA_CONFIG: HAConfig = {
  url: 'ws://homeassistant.local:8123/api/websocket',
  token: '',
  entitySolar: 'sensor.solar_power',
  entityLoad: 'sensor.load_power',
  entityBattery: 'sensor.battery_soc',
};

export function getStoredHAConfig(): HAConfig {
  try {
    const raw = localStorage.getItem(HA_CONFIG_KEY);
    return raw ? { ...DEFAULT_HA_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_HA_CONFIG };
  } catch {
    return { ...DEFAULT_HA_CONFIG };
  }
}

export function setStoredHAConfig(config: HAConfig): void {
  localStorage.setItem(HA_CONFIG_KEY, JSON.stringify(config));
}

type HAMsg = Record<string, unknown>;

/**
 * Home Assistant WebSocket API client (HA protocol v10+).
 * Connect once, subscribe to state_changed + get_states for initial values.
 * Assign onStatusChange / onDataUpdate callbacks before calling connect().
 */
export class HAClient {
  onStatusChange: (status: HAStatus, error?: string) => void = () => {};
  onDataUpdate: (data: HAData) => void = () => {};

  private ws: WebSocket | null = null;
  private msgId = 1;
  private subId: number | null = null;
  private getStatesId: number | null = null;
  private config: HAConfig;
  private _status: HAStatus = 'disconnected';
  private _cached: Partial<HAData> = {};

  get status(): HAStatus {
    return this._status;
  }

  constructor(config: HAConfig) {
    this.config = config;
  }

  connect() {
    if (this._status === 'connected' || this._status === 'connecting') return;
    this._setStatus('connecting');
    try {
      this.ws = new WebSocket(this.config.url);
    } catch (err) {
      this._setStatus('error', String(err));
      return;
    }
    this.ws.onmessage = (ev) => this._handleMsg(JSON.parse(ev.data as string) as HAMsg);
    this.ws.onerror = () => this._setStatus('error', 'WebSocket-Verbindungsfehler');
    this.ws.onclose = () => {
      if (this._status !== 'error') this._setStatus('disconnected');
      this.ws = null;
    };
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this._cached = {};
    this._setStatus('disconnected');
  }

  private _setStatus(s: HAStatus, error?: string) {
    this._status = s;
    this.onStatusChange(s, error);
  }

  private _send(msg: HAMsg) {
    this.ws?.send(JSON.stringify(msg));
  }

  private _handleMsg(msg: HAMsg) {
    const type = msg.type as string;

    if (type === 'auth_required') {
      this._setStatus('authenticating');
      this._send({ type: 'auth', access_token: this.config.token });
      return;
    }

    if (type === 'auth_ok') {
      this._setStatus('connected');
      // 1) Fetch initial states
      this.getStatesId = this.msgId++;
      this._send({ id: this.getStatesId, type: 'get_states' });
      // 2) Subscribe to ongoing state changes
      this.subId = this.msgId++;
      this._send({ id: this.subId, type: 'subscribe_events', event_type: 'state_changed' });
      return;
    }

    if (type === 'auth_invalid') {
      this._setStatus('error', 'Ungültiges Access Token');
      this.disconnect();
      return;
    }

    if (type === 'result' && msg.id === this.getStatesId && msg.success) {
      // Initial states – parse array
      const states = msg.result as Array<{ entity_id: string; state: string }>;
      if (Array.isArray(states)) {
        for (const s of states) this._applyEntityState(s.entity_id, s.state);
        this._emit();
      }
      return;
    }

    if (type === 'event' && msg.id === this.subId) {
      const event = (msg.event as HAMsg) ?? {};
      const data = (event.data as HAMsg) ?? {};
      const entityId = data.entity_id as string;
      const newState = (data.new_state as { state: string } | null)?.state;
      if (entityId != null && newState != null) {
        this._applyEntityState(entityId, newState);
        this._emit();
      }
    }
  }

  private _applyEntityState(entityId: string, state: string) {
    const val = parseFloat(state);
    if (isNaN(val)) return;
    if (entityId === this.config.entitySolar) this._cached.solarW = val;
    else if (entityId === this.config.entityLoad) this._cached.loadW = val;
    else if (entityId === this.config.entityBattery) this._cached.batteryPct = Math.min(100, Math.max(0, val));
  }

  private _emit() {
    if (this._cached.solarW == null || this._cached.loadW == null) return;
    this.onDataUpdate({
      solarW: this._cached.solarW,
      loadW: this._cached.loadW,
      batteryPct: this._cached.batteryPct ?? null,
      updatedAt: Date.now(),
    });
  }
}
