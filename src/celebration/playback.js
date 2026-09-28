const HISTORY_LIMIT = 60;
const LIVE_LIMIT = 12;

/** 新祝福优先出场；历史祝福按打乱的顺序循环，只重播气泡。 */
export class BlessingPlayback {
  constructor(random = Math.random) {
    this.random = random;
    this.messages = new Map();
    this.live = [];
    this.rotation = [];
    this.nextAt = 0;
    this.lastAt = -Infinity;
    this.recent = [];
  }
  seed(messages) {
    const added = messages.filter(message => !this.messages.has(message.id)).map(message => message.id);
    for (const message of messages) this.messages.set(message.id, message);
    const newest = [...this.messages.keys()].sort((a, b) => BigInt(a) < BigInt(b) ? 1 : -1).slice(0, HISTORY_LIMIT);
    this.messages = new Map(newest.map(id => [id, this.messages.get(id)]));
    this.rotation = this.rotation.filter(id => this.messages.has(id));
    if (this.rotation.length) for (const id of new Set(added)) {
      if (this.messages.has(id)) this.rotation.splice(Math.floor(this.random() * (this.rotation.length + 1)), 0, id);
    }
  }
  enqueue(message, own = false) {
    this.seed([message]);
    if (!this.live.some(item => item.message.id === message.id)) this.live.push({ message, historical: false, own });
    if (this.live.length > LIVE_LIMIT) this.live.shift();
    this.nextAt = Math.min(this.nextAt, this.lastAt + 3200);
  }
  take(now, visibleIds = []) {
    if (now < this.nextAt) return null;
    let item;
    const liveIndex = this.live.findIndex(entry => !visibleIds.includes(entry.message.id));
    if (liveIndex >= 0) {
      item = this.live.splice(liveIndex, 1)[0];
      this.rotation = this.rotation.filter(id => id !== item.message.id);
    } else {
      if (!this.rotation.length) {
        this.rotation = [...this.messages.keys()];
        for (let i = this.rotation.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [this.rotation[i], this.rotation[j]] = [this.rotation[j], this.rotation[i]];
        }
      }
      const recentLimit = Math.min(4, this.messages.size - 1);
      const recent = recentLimit > 0 ? this.recent.filter(id => this.messages.has(id)).slice(-recentLimit) : [];
      const index = this.rotation.findIndex(id => !visibleIds.includes(id) && !recent.includes(id));
      if (index < 0) return null;
      const [id] = this.rotation.splice(index, 1);
      item = { message: this.messages.get(id), historical: true, own: false };
    }
    this.recent = [...this.recent.filter(id => id !== item.message.id), item.message.id].slice(-4);
    this.lastAt = now;
    this.nextAt = now + (this.live.length ? 3200 : 4000 + this.random() * 2000);
    return item;
  }
  pause() {
    this.live = [];
    this.nextAt = 0;
  }
}
