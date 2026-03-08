import type { MqttClient } from 'mqtt';
import type { HAData } from './ha';
import { getSetting, saveSetting } from './db';

export const MQTT_CONFIG_KEY = 'mqtt-config';

export interface MQTTConfig {
  brokerUrl: string;   // ws://hostname:9001 oder wss://hostname:8884
  username: string;
  password: string;
  topicSolar: string;
  topicLoad: string;
  topicBattery: string;
  topicGrid: string;
}

export type MQTTStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

// Re-use the same data shape as HAClient for easy merging in App.tsx
export type { HAData as MQTTData } from './ha';

export const DEFAULT_MQTT_CONFIG: MQTTConfig = {
  brokerUrl: 'ws://homeassistant.local:9001',
  username: '',
  password: '',
  topicSolar: 'bkw/energy/solar_w',
  topicLoad: 'bkw/energy/consumption_w',
  topicBattery: 'bkw/energy/battery_pct',
  topicGrid: 'bkw/energy/grid_w',
};

export async function getStoredMQTTConfig(): Promise<MQTTConfig> {
  try {
    const val = await getSetting<MQTTConfig | null>(MQTT_CONFIG_KEY, null);
    return val ? { ...DEFAULT_MQTT_CONFIG, ...val } : { ...DEFAULT_MQTT_CONFIG };
  } catch {
    return { ...DEFAULT_MQTT_CONFIG };
  }
}

export async function setStoredMQTTConfig(config: MQTTConfig): Promise<void> {
  await saveSetting(MQTT_CONFIG_KEY, config);
}

/**
 * MQTT.js browser client (WebSocket transport).
 * Assign onStatusChange / onDataUpdate before calling connect().
 *
 * Broker must expose a WebSocket listener, e.g.:
 *   Mosquitto  listener 9001  – protocol websockets
 *   Home Assistant Mosquitto Add-on: port 9001 already active
 *   EMQX, HiveMQ, etc.: consult their docs for WS port
 */
export class MQTTClient {
  onStatusChange: (status: MQTTStatus, error?: string) => void = () => {};
  onDataUpdate: (data: HAData) => void = () => {};

  private _client: MqttClient | null = null;
  private _config: MQTTConfig;
  private _status: MQTTStatus = 'disconnected';
  private _cached: Partial<HAData> = {};

  get status(): MQTTStatus {
    return this._status;
  }

  constructor(config: MQTTConfig) {
    this._config = config;
  }

  async connect(): Promise<void> {
    if (this._status === 'connected' || this._status === 'connecting') return;
    this._setStatus('connecting');

    let mqttLib: typeof import('mqtt');
    try {
      mqttLib = await import('mqtt');
    } catch (err) {
      this._setStatus('error', 'MQTT-Bibliothek konnte nicht geladen werden');
      return;
    }

    const { username, password, brokerUrl } = this._config;
    const client = mqttLib.connect(brokerUrl, {
      clientId: `bkw_${Math.random().toString(16).slice(2, 10)}`,
      username: username || undefined,
      password: password || undefined,
      reconnectPeriod: 5_000,
      connectTimeout: 15_000,
      clean: true,
    });

    this._client = client;

    client.on('connect', () => {
      this._setStatus('connected');
      const topics = [
        this._config.topicSolar,
        this._config.topicLoad,
        this._config.topicBattery,
        this._config.topicGrid,
      ].filter(Boolean);
      if (topics.length > 0) {
        client.subscribe(topics, { qos: 0 }, (err) => {
          if (err) console.warn('[MQTT] subscribe error:', err);
        });
      }
    });

    client.on('message', (topic, payload) => {
      const val = parseFloat(payload.toString());
      if (isNaN(val)) return;
      if (topic === this._config.topicSolar) this._cached.solarW = val;
      else if (topic === this._config.topicLoad) this._cached.loadW = val;
      else if (topic === this._config.topicBattery)
        this._cached.batteryPct = Math.min(100, Math.max(0, val));
      this._emit();
    });

    client.on('error', (err) => {
      this._setStatus('error', err.message);
    });

    client.on('close', () => {
      if (this._status !== 'error') this._setStatus('disconnected');
    });
  }

  disconnect(): void {
    this._client?.end(true);
    this._client = null;
    this._cached = {};
    this._setStatus('disconnected');
  }

  private _setStatus(s: MQTTStatus, error?: string): void {
    this._status = s;
    this.onStatusChange(s, error);
  }

  private _emit(): void {
    if (this._cached.solarW == null || this._cached.loadW == null) return;
    this.onDataUpdate({
      solarW: this._cached.solarW,
      loadW: this._cached.loadW,
      batteryPct: this._cached.batteryPct ?? null,
      updatedAt: Date.now(),
    });
  }
}
