import { readFile } from 'node:fs/promises';

/** 访问记录独立于祝福、答题和登录，多个实例使用同一个数据库去重。 */
export class VisitStore {
  constructor(pool, room) { this.pool = pool; this.room = room; }

  async ensure() {
    if (this.ready) return;
    if (!this.initializing) this.initializing = this.initialize().then(() => { this.ready = true; }).finally(() => { this.initializing = null; });
    await this.initializing;
  }

  async initialize() {
    const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
    const client = await this.pool.connect();
    let releaseError;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='4s'");
      await client.query("SELECT pg_advisory_xact_lock(1279440461,hashtext('wedding-visit-schema'))");
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) { try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; } throw error; }
    finally { client.release(releaseError); }
  }

  async record({ visitId, visitorHash, event, theme, browser, device }) {
    await this.ensure();
    if (event === 'ping') {
      await this.pool.query(`WITH updated AS (
        UPDATE wedding_visits SET last_seen=clock_timestamp()
        WHERE room_id=$1 AND visit_id=$2 AND visitor_hash=$3 AND last_seen<clock_timestamp()-interval '20 seconds'
        RETURNING last_seen)
        UPDATE wedding_visitors SET last_seen=GREATEST(wedding_visitors.last_seen,updated.last_seen)
        FROM updated WHERE room_id=$1 AND visitor_hash=$3`, [this.room, visitId, visitorHash]);
      return;
    }
    const client = await this.pool.connect();
    let releaseError;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='4s'");
      await client.query(`INSERT INTO wedding_visitors (room_id,visitor_hash) VALUES ($1,$2)
        ON CONFLICT (room_id,visitor_hash) DO UPDATE SET last_seen=clock_timestamp()`, [this.room, visitorHash]);
      const rate = await client.query(`SELECT count(*)::int AS count FROM wedding_visits
        WHERE room_id=$1 AND visitor_hash=$2 AND started_at>clock_timestamp()-interval '1 minute'`, [this.room, visitorHash]);
      if (rate.rows[0].count >= 60) { const error = new Error('访问过于频繁'); error.status = 429; throw error; }
      const inserted = await client.query(`INSERT INTO wedding_visits (room_id,visit_id,visitor_hash,theme,browser,device)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (room_id,visit_id) DO NOTHING RETURNING visit_id`, [this.room, visitId, visitorHash, theme, browser, device]);
      // 相同上报重试时连同临时访客一起回滚，不能凭空多算一位访客。
      await client.query(inserted.rows.length ? 'COMMIT' : 'ROLLBACK');
    } catch (error) { try { await client.query('ROLLBACK'); } catch (rollbackError) { releaseError = rollbackError; } throw error; }
    finally { client.release(releaseError); }
  }

  async snapshot() {
    await this.ensure();
    const { rows } = await this.pool.query(`WITH bounds AS (
      SELECT CURRENT_TIMESTAMP AS now, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date AS today
    ), daily AS (
      SELECT (started_at AT TIME ZONE 'Asia/Shanghai')::date AS day, count(*)::int AS opens, count(DISTINCT visitor_hash)::int AS visitors
      FROM wedding_visits, bounds WHERE room_id=$1 AND started_at >= ((today-6)::timestamp AT TIME ZONE 'Asia/Shanghai')
      GROUP BY day
    ), trend AS (
      SELECT day::date, COALESCE(daily.opens,0) AS opens, COALESCE(daily.visitors,0) AS visitors
      FROM bounds, generate_series(today-6,today,interval '1 day') AS dates(day) LEFT JOIN daily USING(day)
    ), browsers AS (
      SELECT browser AS kind,count(*)::int AS opens FROM wedding_visits WHERE room_id=$1 GROUP BY browser
    ), devices AS (
      SELECT device AS kind,count(*)::int AS opens FROM wedding_visits WHERE room_id=$1 GROUP BY device
    )
    SELECT now AS generated_at,
      (SELECT count(*)::int FROM wedding_visitors WHERE room_id=$1) AS visitors,
      (SELECT count(*)::int FROM wedding_visits WHERE room_id=$1) AS opens,
      (SELECT count(*)::int FROM wedding_visitors WHERE room_id=$1 AND last_seen>now-interval '2 minutes') AS active,
      (SELECT min(first_seen) FROM wedding_visitors WHERE room_id=$1) AS started_at,
      COALESCE((SELECT visitors FROM daily WHERE day=today),0) AS today_visitors,
      COALESCE((SELECT opens FROM daily WHERE day=today),0) AS today_opens,
      (SELECT json_agg(json_build_object('date',to_char(day,'YYYY-MM-DD'),'visitors',visitors,'opens',opens) ORDER BY day) FROM trend) AS trend,
      COALESCE((SELECT json_agg(browsers ORDER BY opens DESC,kind) FROM browsers),'[]') AS browsers,
      COALESCE((SELECT json_agg(devices ORDER BY opens DESC,kind) FROM devices),'[]') AS devices
    FROM bounds`, [this.room]);
    const row = rows[0];
    return { state: 'ready', generatedAt: row.generated_at.toISOString(), startedAt: row.started_at?.toISOString() || null,
      visitors: row.visitors, opens: row.opens, active: row.active, todayVisitors: row.today_visitors, todayOpens: row.today_opens,
      trend: row.trend, browsers: row.browsers, devices: row.devices };
  }
}
