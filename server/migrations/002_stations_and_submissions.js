export default {
  name: '002_stations_and_submissions',
  up: `
    CREATE TABLE IF NOT EXISTS stations (
      stationuuid   VARCHAR(80)   NOT NULL,
      name          VARCHAR(400)  NOT NULL,
      country       VARCHAR(100)  NOT NULL DEFAULT '',
      state         VARCHAR(100)  NOT NULL DEFAULT '',
      favicon       VARCHAR(500)  NOT NULL DEFAULT '',
      url_resolved  VARCHAR(500)  NOT NULL DEFAULT '',
      language      VARCHAR(200)  NOT NULL DEFAULT '',
      tags          VARCHAR(500)  NOT NULL DEFAULT '',
      votes         INT           NOT NULL DEFAULT 0,
      clickcount    INT           NOT NULL DEFAULT 0,
      lastcheckok   TINYINT       NOT NULL DEFAULT 1,
      geo_lat       DOUBLE NULL,
      geo_long      DOUBLE NULL,
      source        VARCHAR(50)   NOT NULL DEFAULT 'radio-browser',
      PRIMARY KEY (stationuuid),
      INDEX idx_stations_clickcount (clickcount DESC),
      INDEX idx_stations_country (country),
      INDEX idx_stations_lastcheckok (lastcheckok),
      INDEX idx_stations_geo_filter_sort (lastcheckok, clickcount DESC, geo_lat, geo_long),
      FULLTEXT INDEX ft_stations_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS station_submissions (
      id            BIGINT        NOT NULL AUTO_INCREMENT,
      stationuuid   VARCHAR(80)   NOT NULL UNIQUE,
      name          VARCHAR(400)  NOT NULL,
      country       VARCHAR(100)  NOT NULL DEFAULT '',
      state         VARCHAR(100)  NOT NULL DEFAULT '',
      favicon       VARCHAR(500)  NOT NULL DEFAULT '',
      url_resolved  VARCHAR(500)  NOT NULL,
      language      VARCHAR(200)  NOT NULL DEFAULT '',
      tags          VARCHAR(500)  NOT NULL DEFAULT '',
      votes         INT           NOT NULL DEFAULT 0,
      clickcount    INT           NOT NULL DEFAULT 0,
      lastcheckok   TINYINT       NOT NULL DEFAULT 1,
      geo_lat       DOUBLE NULL,
      geo_long      DOUBLE NULL,
      user_note     VARCHAR(500)  NOT NULL DEFAULT '',
      approved      TINYINT       NOT NULL DEFAULT 0,
      submitted_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_submissions_approved (approved)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS admin_moderation_audit_log (
      id                BIGINT        NOT NULL AUTO_INCREMENT,
      submission_id     BIGINT        NOT NULL,
      stationuuid       VARCHAR(80)   NOT NULL,
      action            VARCHAR(20)   NOT NULL,
      previous_approved TINYINT       NOT NULL,
      next_approved     TINYINT       NOT NULL,
      admin_username    VARCHAR(120)  NOT NULL,
      ip_address        VARCHAR(120)  NOT NULL DEFAULT '',
      user_agent        VARCHAR(255)  NOT NULL DEFAULT '',
      created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_admin_audit_submission (submission_id),
      INDEX idx_admin_audit_created_at (created_at),
      INDEX idx_admin_audit_admin (admin_username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    DROP TRIGGER IF EXISTS on_submission_insert_uuid;
    CREATE TRIGGER on_submission_insert_uuid
    BEFORE INSERT ON station_submissions
    FOR EACH ROW
    BEGIN
      IF NEW.stationuuid IS NULL OR NEW.stationuuid = '' THEN
        SET NEW.stationuuid = UUID();
      END IF;
    END;

    DROP TRIGGER IF EXISTS on_submission_approved;
    CREATE TRIGGER on_submission_approved
    AFTER UPDATE ON station_submissions
    FOR EACH ROW
    BEGIN
      IF NEW.approved = 1 AND IFNULL(OLD.approved, 0) <> 1 THEN
        INSERT INTO stations (
          stationuuid, name, country, state, favicon, url_resolved,
          language, tags, votes, clickcount, lastcheckok,
          geo_lat, geo_long, source
        ) VALUES (
          NEW.stationuuid, NEW.name, NEW.country, NEW.state, NEW.favicon,
          NEW.url_resolved, NEW.language, NEW.tags, NEW.votes,
          NEW.clickcount, NEW.lastcheckok, NEW.geo_lat, NEW.geo_long,
          'user-submission'
        ) ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          country = VALUES(country),
          state = VALUES(state),
          favicon = VALUES(favicon),
          url_resolved = VALUES(url_resolved),
          language = VALUES(language),
          tags = VALUES(tags),
          votes = VALUES(votes),
          clickcount = VALUES(clickcount),
          lastcheckok = VALUES(lastcheckok),
          geo_lat = VALUES(geo_lat),
          geo_long = VALUES(geo_long),
          source = VALUES(source);
      END IF;
    END;
  `,
}
