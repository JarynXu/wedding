import { logError } from '../observability.js';
import pg from 'pg';

/** 每个进程共享一条通知连接；数据库游标负责恢复，订阅者只持有有界队列。 */
export class BlessingHub {
  constructor(store, config) {
    this.store = store;
    this.config = config;
    this.subscribers = new Set();
    this.cursor = null;
    this.ready = false;
    this.stopped = false;
  }
  start() {
    this.poll = setInterval(() => this.refresh(), 4000);
    this.poll.unref();
    this.connect();
  }
  subscribe(onMessage, onUnavailable) {
    const subscriber = { onMessage, onUnavailable };
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
  status() {
    if (this.stopped) return { state: 'stopped' };
    if (this.connecting) return { state: 'connecting' };
    if (!this.listener || !this.ready) return { state: 'unavailable' };
    return { state: 'ready' };
  }
  async connect() {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    const client = new pg.Client(this.config.database);
    this.listener = client;
    const lost = () => {
      if (this.listener !== client || this.stopped) return;
      this.listener = null;
      this.unavailable();
      client.end().catch(() => {});
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.connect(), 3000);
      this.retry.unref();
    };
    client.on('error', lost);
    client.on('end', lost);
    client.on('notification', notice => { if (notice.payload === this.config.room) this.refresh(); });
    try {
      await client.connect();
      await client.query('LISTEN wedding_blessings_changed');
      await this.store.verify();
      if (this.cursor == null) this.cursor = await this.store.latestId();
      if (!this.stopped && this.listener === client) await this.refresh();
    } catch (error) {
      logError('blessings.listener_failed',error);
      lost();
    } finally { this.connecting = false; }
  }
  refresh() {
    if (this.stopped || this.cursor == null || !this.listener) return Promise.resolve();
    if (this.reading) { this.dirty = true; return this.reading; }
    this.reading = this.readUpdates().finally(() => { this.reading = null; });
    return this.reading;
  }
  async readUpdates() {
    try {
      do {
        this.dirty = false;
        const state=await this.store.state();
        if(state.paused){this.unavailable();return;}
        if(this.generation!==undefined&&this.generation!==state.generation){this.unavailable();this.cursor=await this.store.latestId();}
        this.generation=state.generation;
        const messages = await this.store.since(this.cursor);
        if (this.stopped) return;
        for (const message of messages) {
          this.cursor = message.id;
          for (const subscriber of this.subscribers) subscriber.onMessage(message);
        }
        if (messages.length === 200) this.dirty = true;
      } while (this.dirty && !this.stopped);
      this.ready = Boolean(this.listener) && !this.stopped;
    } catch (error) {
      logError('blessings.poll_failed',error);
      this.unavailable();
    }
  }
  unavailable() {
    this.ready = false;
    for (const subscriber of [...this.subscribers]) subscriber.onUnavailable();
  }
  async close() {
    this.stopped = true;
    clearInterval(this.poll);
    clearTimeout(this.retry);
    this.unavailable();
    await this.listener?.end().catch(() => {});
    await this.reading;
  }
}
