export default {
  name: '003_observability_tables',
  up: [
    `CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGINT NOT NULL AUTO_INCREMENT,
      event_name VARCHAR(80) NOT NULL,
      session_id VARCHAR(120) NOT NULL,
      page VARCHAR(200) NOT NULL DEFAULT '',
      occurred_at DATETIME NOT NULL,
      properties_json TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_analytics_events_occurred_at (occurred_at),
      INDEX idx_analytics_events_name (event_name),
      INDEX idx_analytics_events_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS analytics_errors (
      id BIGINT NOT NULL AUTO_INCREMENT,
      source VARCHAR(80) NOT NULL,
      message VARCHAR(400) NOT NULL,
      stack TEXT NOT NULL,
      context_json TEXT NOT NULL,
      session_id VARCHAR(120) NOT NULL DEFAULT '',
      page VARCHAR(200) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_analytics_errors_created_at (created_at),
      INDEX idx_analytics_errors_source (source)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
}
