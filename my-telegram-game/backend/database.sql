-- Initialize PostgreSQL database for Gladiator Arena

-- Players table
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    gold INTEGER DEFAULT 1000,
    gems INTEGER DEFAULT 10,
    fame INTEGER DEFAULT 0,
    energy INTEGER DEFAULT 100,
    max_energy INTEGER DEFAULT 100,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    game_data JSONB DEFAULT '{}',
    daily_reward_claimed BOOLEAN DEFAULT FALSE,
    last_daily_reward TIMESTAMP,
    daily_streak INTEGER DEFAULT 0,
    clan_id INTEGER,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    total_battles INTEGER DEFAULT 0,
    victories INTEGER DEFAULT 0
);

-- Battles history
CREATE TABLE IF NOT EXISTS battles (
    id SERIAL PRIMARY KEY,
    player_id BIGINT NOT NULL,
    gladiator_id INTEGER,
    enemy_name VARCHAR(100),
    difficulty VARCHAR(20),
    victory BOOLEAN,
    damage_dealt INTEGER,
    damage_taken INTEGER,
    rewards JSONB,
    battle_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clans
CREATE TABLE IF NOT EXISTS clans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    leader_id BIGINT NOT NULL,
    fame INTEGER DEFAULT 0,
    members_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    discord_link VARCHAR(255),
    requirements TEXT
);

-- Clan members
CREATE TABLE IF NOT EXISTS clan_members (
    clan_id INTEGER REFERENCES clans(id) ON DELETE CASCADE,
    player_id BIGINT REFERENCES players(telegram_id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    contributed_fame INTEGER DEFAULT 0,
    PRIMARY KEY (clan_id, player_id)
);

-- Items inventory (for future expansion)
CREATE TABLE IF NOT EXISTS player_items (
    id SERIAL PRIMARY KEY,
    player_id BIGINT REFERENCES players(telegram_id) ON DELETE CASCADE,
    item_type VARCHAR(50),
    item_id INTEGER,
    quantity INTEGER DEFAULT 1,
    equipped BOOLEAN DEFAULT FALSE,
    obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events log
CREATE TABLE IF NOT EXISTS game_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50),
    player_id BIGINT,
    details JSONB,
    event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_telegram_id ON players(telegram_id);
CREATE INDEX IF NOT EXISTS idx_players_fame ON players(fame DESC);
CREATE INDEX IF NOT EXISTS idx_players_level ON players(level DESC);
CREATE INDEX IF NOT EXISTS idx_battles_player_id ON battles(player_id);
CREATE INDEX IF NOT EXISTS idx_battles_time ON battles(battle_time DESC);
CREATE INDEX IF NOT EXISTS idx_clans_fame ON clans(fame DESC);
CREATE INDEX IF NOT EXISTS idx_clan_members_player ON clan_members(player_id);

-- Initial data (optional)
INSERT INTO clans (name, description, leader_id, fame) 
VALUES ('Легион Цезаря', 'Самый могущественный клан арены', 0, 10000)
ON CONFLICT (name) DO NOTHING;

-- View for leaderboard
CREATE OR REPLACE VIEW player_stats AS
SELECT 
    p.telegram_id,
    p.username,
    p.first_name,
    p.gold,
    p.gems,
    p.fame,
    p.level,
    p.experience,
    p.victories,
    p.total_battles,
    COALESCE(b.win_rate, 0) as win_rate,
    jsonb_array_length(p.game_data->'gladiators') as gladiator_count
FROM players p
LEFT JOIN (
    SELECT 
        player_id,
        COUNT(*) as total,
        SUM(CASE WHEN victory THEN 1 ELSE 0 END) as wins,
        ROUND(SUM(CASE WHEN victory THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as win_rate
    FROM battles
    GROUP BY player_id
) b ON p.telegram_id = b.player_id;