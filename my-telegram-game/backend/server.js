const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: [
        'https://gladiator-arena-telegram-1.onrender.com', // ваш фронтенд
        'http://localhost:3000' // для локальной разработки
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Слишком много запросов. Попробуйте позже.'
});
app.use('/api/', limiter);

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection error:', err.stack);
    } else {
        console.log('✅ Connected to PostgreSQL database');
        release();
        
        // Initialize database tables
        initDatabase();
    }
});

async function initDatabase() {
    try {
        // Create players table
        await pool.query(`
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
                clan_id INTEGER,
                level INTEGER DEFAULT 1,
                experience INTEGER DEFAULT 0
            )
        `);
        
        // Create battles table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS battles (
                id SERIAL PRIMARY KEY,
                player_id BIGINT,
                gladiator_id INTEGER,
                enemy_name VARCHAR(100),
                difficulty VARCHAR(20),
                victory BOOLEAN,
                damage_dealt INTEGER,
                damage_taken INTEGER,
                rewards JSONB,
                battle_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create clans table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                leader_id BIGINT,
                fame INTEGER DEFAULT 0,
                members_count INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_players_telegram_id ON players(telegram_id);
            CREATE INDEX IF NOT EXISTS idx_players_fame ON players(fame DESC);
            CREATE INDEX IF NOT EXISTS idx_battles_player_id ON battles(player_id);
            CREATE INDEX IF NOT EXISTS idx_clans_fame ON clans(fame DESC);
        `);
        
        console.log('✅ Database tables initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// Schedule: Restore energy every 30 minutes
cron.schedule('*/30 * * * *', async () => {
    try {
        await pool.query(`
            UPDATE players 
            SET energy = LEAST(max_energy, energy + 20)
            WHERE last_login > CURRENT_TIMESTAMP - INTERVAL '7 days'
        `);
        console.log('✅ Energy restored for active players');
    } catch (error) {
        console.error('❌ Energy restore error:', error);
    }
});

// Schedule: Reset daily rewards at midnight UTC
cron.schedule('0 0 * * *', async () => {
    try {
        await pool.query(`
            UPDATE players 
            SET daily_reward_claimed = FALSE
        `);
        console.log('✅ Daily rewards reset');
    } catch (error) {
        console.error('❌ Daily rewards reset error:', error);
    }
});

// ==================== API ENDPOINTS ====================

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Gladiator Arena API'
    });
});

// Get or create player
app.post('/api/player/init', async (req, res) => {
    try {
        const { telegramId, username, firstName, lastName } = req.body;
        
        if (!telegramId) {
            return res.status(400).json({ error: 'Telegram ID is required' });
        }
        
        // Check if player exists
        const existingPlayer = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (existingPlayer.rows.length > 0) {
            // Update last login
            await pool.query(
                'UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE telegram_id = $1',
                [telegramId]
            );
            
            return res.json({
                success: true,
                player: existingPlayer.rows[0],
                newPlayer: false
            });
        }
        
        // Create new player with initial game data
        const initialGameData = {
            gladiators: [
                {
                    id: 1,
                    name: 'Спартак',
                    type: 'murmillo',
                    level: 1,
                    health: 100,
                    maxHealth: 100,
                    strength: 12,
                    agility: 8,
                    endurance: 10,
                    experience: 0,
                    equipment: {
                        weapon: { id: 1, name: 'Деревянный меч', damage: 5, type: 'sword' },
                        armor: { id: 1, name: 'Кожаный доспех', defense: 3, type: 'light' }
                    },
                    skills: ['basic_attack'],
                    status: 'ready'
                }
            ],
            buildings: {
                barracks: { level: 1, capacity: 5 },
                training_ground: { level: 1, bonus: 0.1 },
                infirmary: { level: 1, heal_speed: 1 },
                arena: { level: 1, fame_bonus: 0 }
            },
            inventory: {
                weapons: [
                    { id: 1, name: 'Деревянный меч', damage: 5, type: 'sword', quantity: 1 }
                ],
                armors: [
                    { id: 1, name: 'Кожаный доспех', defense: 3, type: 'light', quantity: 1 }
                ],
                potions: [
                    { id: 1, name: 'Малое зелье здоровья', heal: 30, quantity: 3 },
                    { id: 2, name: 'Малое зелье энергии', energy: 20, quantity: 2 }
                ]
            },
            unlocked_types: ['murmillo'],
            tutorial_completed: false
        };
        
        const newPlayer = await pool.query(
            `INSERT INTO players (
                telegram_id, username, first_name, last_name, 
                gold, gems, fame, energy, max_energy,
                game_data, level, experience, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
            RETURNING *`,
            [
                telegramId,
                username || 'Гладиатор',
                firstName || 'Игрок',
                lastName || '',
                1000, // gold
                10,   // gems
                0,    // fame
                100,  // energy
                100,  // max_energy
                JSON.stringify(initialGameData),
                1,    // level
                0     // experience
            ]
        );
        
        res.json({
            success: true,
            player: newPlayer.rows[0],
            newPlayer: true
        });
        
    } catch (error) {
        console.error('Player init error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get player data
app.get('/api/player/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        // Update last login
        await pool.query(
            'UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE telegram_id = $1',
            [telegramId]
        );
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get player error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start a battle
app.post('/api/battle/start', async (req, res) => {
    try {
        const { telegramId, gladiatorId, difficulty } = req.body;
        
        // Get player
        const playerResult = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (playerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const player = playerResult.rows[0];
        const gameData = JSON.parse(player.game_data);
        
        // Find gladiator
        const gladiator = gameData.gladiators.find(g => g.id === gladiatorId);
        if (!gladiator) {
            return res.status(404).json({ error: 'Gladiator not found' });
        }
        
        // Check if gladiator is ready
        if (gladiator.health <= 0) {
            return res.status(400).json({ error: 'Гладиатор ранен и не может сражаться' });
        }
        
        // Check energy
        const energyCost = { easy: 10, medium: 15, hard: 20 }[difficulty] || 10;
        if (player.energy < energyCost) {
            return res.status(400).json({ error: 'Недостаточно энергии' });
        }
        
        // Generate enemy
        const enemies = {
            easy: [
                { name: 'Новичок-гладиатор', health: 50, damage: 8, reward: { gold: 50, exp: 10 } },
                { name: 'Горожанин-воин', health: 60, damage: 6, reward: { gold: 60, exp: 12 } },
                { name: 'Ополченец', health: 45, damage: 9, reward: { gold: 45, exp: 9 } }
            ],
            medium: [
                { name: 'Ветеран арены', health: 100, damage: 15, reward: { gold: 100, exp: 25, gems: 1 } },
                { name: 'Наёмник', health: 120, damage: 12, reward: { gold: 120, exp: 30, gems: 1 } },
                { name: 'Охранник патриция', health: 90, damage: 18, reward: { gold: 90, exp: 22, gems: 1 } }
            ],
            hard: [
                { name: 'Чемпион Колизея', health: 200, damage: 25, reward: { gold: 200, exp: 50, gems: 2 } },
                { name: 'Гладиатор-легенда', health: 180, damage: 30, reward: { gold: 220, exp: 55, gems: 3 } },
                { name: 'Боец из провинции', health: 160, damage: 28, reward: { gold: 180, exp: 45, gems: 2 } }
            ]
        };
        
        const enemyList = enemies[difficulty] || enemies.easy;
        const enemy = enemyList[Math.floor(Math.random() * enemyList.length)];
        
        // Calculate battle
        const gladiatorDamage = gladiator.strength + (gladiator.equipment.weapon?.damage || 0);
        const enemyDamage = enemy.damage;
        
        // Defense reduces damage
        const defense = gladiator.equipment.armor?.defense || 0;
        const reducedEnemyDamage = Math.max(1, enemyDamage - defense);
        
        // Calculate hits to kill
        const hitsToKillEnemy = Math.ceil(enemy.health / gladiatorDamage);
        const hitsToKillGladiator = Math.ceil(gladiator.health / reducedEnemyDamage);
        
        const victory = hitsToKillEnemy <= hitsToKillGladiator;
        
        // Calculate actual damage
        const actualDamageDealt = victory ? enemy.health : (hitsToKillGladiator - 1) * gladiatorDamage;
        const actualDamageTaken = victory ? (hitsToKillEnemy - 1) * reducedEnemyDamage : gladiator.health;
        
        // Update player data
        let newGold = player.gold;
        let newGems = player.gems;
        let newFame = player.fame;
        let newEnergy = player.energy - energyCost;
        let gladiatorExp = gladiator.experience;
        let gladiatorLevel = gladiator.level;
        
        if (victory) {
            newGold += enemy.reward.gold;
            newGems += enemy.reward.gems || 0;
            newFame += Math.floor(enemy.reward.exp / 5);
            gladiatorExp += enemy.reward.exp;
            
            // Check level up
            const expForNextLevel = gladiatorLevel * 100;
            if (gladiatorExp >= expForNextLevel) {
                gladiatorLevel++;
                gladiatorExp -= expForNextLevel;
                gladiator.strength += 3;
                gladiator.agility += 2;
                gladiator.endurance += 3;
                gladiator.maxHealth += 25;
            }
            
            // Restore some health on victory
            gladiator.health = Math.min(gladiator.maxHealth, gladiator.health + 10);
        } else {
            gladiator.health -= actualDamageTaken;
            if (gladiator.health <= 0) gladiator.health = 1;
            
            // Still give some experience for trying
            gladiatorExp += Math.floor(enemy.reward.exp / 3);
        }
        
        // Update gladiator
        gladiator.experience = gladiatorExp;
        gladiator.level = gladiatorLevel;
        gladiator.health = Math.max(1, gladiator.health);
        
        // Update game data
        gameData.gladiators = gameData.gladiators.map(g => 
            g.id === gladiatorId ? gladiator : g
        );
        
        // Update player in database
        await pool.query(
            `UPDATE players 
             SET gold = $1, gems = $2, fame = $3, energy = $4, game_data = $5
             WHERE telegram_id = $6`,
            [newGold, newGems, newFame, newEnergy, JSON.stringify(gameData), telegramId]
        );
        
        // Log battle
        await pool.query(
            `INSERT INTO battles 
             (player_id, gladiator_id, enemy_name, difficulty, victory, 
              damage_dealt, damage_taken, rewards)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                telegramId,
                gladiatorId,
                enemy.name,
                difficulty,
                victory,
                actualDamageDealt,
                actualDamageTaken,
                JSON.stringify(enemy.reward)
            ]
        );
        
        // Check player level up
        const playerExp = player.experience + (victory ? enemy.reward.exp : Math.floor(enemy.reward.exp / 2));
        const playerLevel = player.level;
        const expForPlayerLevel = playerLevel * 500;
        
        let newPlayerLevel = playerLevel;
        let newPlayerExp = playerExp;
        
        if (playerExp >= expForPlayerLevel) {
            newPlayerLevel++;
            newPlayerExp -= expForPlayerLevel;
            
            await pool.query(
                'UPDATE players SET level = $1, experience = $2 WHERE telegram_id = $3',
                [newPlayerLevel, newPlayerExp, telegramId]
            );
        } else {
            await pool.query(
                'UPDATE players SET experience = $1 WHERE telegram_id = $2',
                [newPlayerExp, telegramId]
            );
        }
        
        res.json({
            success: true,
            victory,
            battle: {
                enemy: enemy.name,
                enemyHealth: enemy.health,
                gladiatorDamage: gladiatorDamage,
                enemyDamage: enemyDamage,
                defense: defense,
                hitsToKillEnemy,
                hitsToKillGladiator,
                actualDamageDealt,
                actualDamageTaken
            },
            rewards: victory ? enemy.reward : { exp: Math.floor(enemy.reward.exp / 3) },
            player: {
                gold: newGold,
                gems: newGems,
                fame: newFame,
                energy: newEnergy,
                level: newPlayerLevel,
                experience: newPlayerExp
            },
            gladiator: {
                health: gladiator.health,
                maxHealth: gladiator.maxHealth,
                level: gladiator.level,
                experience: gladiator.experience,
                strength: gladiator.strength,
                agility: gladiator.agility,
                endurance: gladiator.endurance
            }
        });
        
    } catch (error) {
        console.error('Battle start error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Buy gladiator
app.post('/api/gladiator/buy', async (req, res) => {
    try {
        const { telegramId, gladiatorType, name } = req.body;
        
        const playerResult = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (playerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const player = playerResult.rows[0];
        const gameData = JSON.parse(player.game_data);
        
        // Check capacity
        const maxCapacity = gameData.buildings.barracks.capacity * 5;
        if (gameData.gladiators.length >= maxCapacity) {
            return res.status(400).json({ error: 'Недостаточно мест в казармах. Улучшите казармы.' });
        }
        
        // Cost based on type
        const costs = {
            murmillo: 500,
            thraex: 600,
            retiarius: 550,
            secutor: 700,
            dimachaerus: 800,
            essedarius: 900,
            provocator: 1000
        };
        
        const cost = costs[gladiatorType] || 500;
        
        if (player.gold < cost) {
            return res.status(400).json({ error: `Недостаточно золота. Нужно: ${cost}` });
        }
        
        // Check if type is unlocked
        if (!gameData.unlocked_types.includes(gladiatorType)) {
            return res.status(400).json({ error: 'Этот тип гладиатора еще не разблокирован' });
        }
        
        // Create new gladiator
        const baseStats = {
            murmillo: { str: 12, agi: 8, end: 10 },
            thraex: { str: 10, agi: 12, end: 8 },
            retiarius: { str: 8, agi: 14, end: 8 },
            secutor: { str: 14, agi: 6, end: 10 },
            dimachaerus: { str: 11, agi: 11, end: 8 },
            essedarius: { str: 9, agi: 13, end: 8 },
            provocator: { str: 13, agi: 9, end: 13 }
        };
        
        const stats = baseStats[gladiatorType] || baseStats.murmillo;
        const newId = Math.max(0, ...gameData.gladiators.map(g => g.id)) + 1;
        
        const newGladiator = {
            id: newId,
            name: name || `Гладиатор-${newId}`,
            type: gladiatorType,
            level: 1,
            health: 100,
            maxHealth: 100,
            strength: stats.str,
            agility: stats.agi,
            endurance: stats.end,
            experience: 0,
            equipment: {
                weapon: { id: 1, name: 'Деревянный меч', damage: 5, type: 'sword' },
                armor: { id: 1, name: 'Кожаный доспех', defense: 3, type: 'light' }
            },
            skills: ['basic_attack'],
            status: 'ready'
        };
        
        // Add to game data
        gameData.gladiators.push(newGladiator);
        
        // Update database
        await pool.query(
            'UPDATE players SET gold = gold - $1, game_data = $2 WHERE telegram_id = $3',
            [cost, JSON.stringify(gameData), telegramId]
        );
        
        res.json({
            success: true,
            gladiator: newGladiator,
            newGold: player.gold - cost
        });
        
    } catch (error) {
        console.error('Buy gladiator error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Heal gladiator
app.post('/api/gladiator/heal', async (req, res) => {
    try {
        const { telegramId, gladiatorId } = req.body;
        
        const playerResult = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (playerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const player = playerResult.rows[0];
        const gameData = JSON.parse(player.game_data);
        
        const gladiator = gameData.gladiators.find(g => g.id === gladiatorId);
        if (!gladiator) {
            return res.status(404).json({ error: 'Gladiator not found' });
        }
        
        if (gladiator.health >= gladiator.maxHealth) {
            return res.status(400).json({ error: 'Гладиатор уже полностью здоров' });
        }
        
        // Check for healing potions
        const healingPotion = gameData.inventory.potions.find(p => p.id === 1);
        if (!healingPotion || healingPotion.quantity <= 0) {
            return res.status(400).json({ error: 'Нет зелий лечения' });
        }
        
        // Use potion
        healingPotion.quantity--;
        if (healingPotion.quantity <= 0) {
            gameData.inventory.potions = gameData.inventory.potions.filter(p => p.id !== 1);
        }
        
        // Heal
        const healAmount = healingPotion.heal || 30;
        gladiator.health = Math.min(gladiator.maxHealth, gladiator.health + healAmount);
        
        // Update game data
        gameData.gladiators = gameData.gladiators.map(g => 
            g.id === gladiatorId ? gladiator : g
        );
        
        await pool.query(
            'UPDATE players SET game_data = $1 WHERE telegram_id = $2',
            [JSON.stringify(gameData), telegramId]
        );
        
        res.json({
            success: true,
            gladiator: {
                health: gladiator.health,
                maxHealth: gladiator.maxHealth
            },
            potions: gameData.inventory.potions.filter(p => p.id === 1)[0]?.quantity || 0
        });
        
    } catch (error) {
        console.error('Heal gladiator error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Buy item
app.post('/api/shop/buy', async (req, res) => {
    try {
        const { telegramId, itemType, itemId } = req.body;
        
        const playerResult = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (playerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const player = playerResult.rows[0];
        
        // Shop items
        const shopItems = {
            weapons: [
                { id: 2, name: 'Железный меч', damage: 10, cost: 200, type: 'sword' },
                { id: 3, name: 'Стальной меч', damage: 15, cost: 500, type: 'sword' },
                { id: 4, name: 'Длинное копье', damage: 12, cost: 300, type: 'spear' },
                { id: 5, name: 'Боевой топор', damage: 18, cost: 800, type: 'axe' }
            ],
            armors: [
                { id: 2, name: 'Кольчуга', defense: 8, cost: 300, type: 'medium' },
                { id: 3, name: 'Латный доспех', defense: 15, cost: 800, type: 'heavy' },
                { id: 4, name: 'Чешуйчатый доспех', defense: 12, cost: 500, type: 'medium' }
            ],
            potions: [
                { id: 3, name: 'Среднее зелье здоровья', heal: 60, cost: 50, type: 'heal' },
                { id: 4, name: 'Большое зелье здоровья', heal: 100, cost: 100, type: 'heal' },
                { id: 5, name: 'Зелье силы', effect: 'strength', cost: 150, type: 'buff' }
            ]
        };
        
        const itemList = shopItems[itemType];
        if (!itemList) {
            return res.status(400).json({ error: 'Invalid item type' });
        }
        
        const item = itemList.find(i => i.id === itemId);
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        if (player.gold < item.cost) {
            return res.status(400).json({ error: `Недостаточно золота. Нужно: ${item.cost}` });
        }
        
        const gameData = JSON.parse(player.game_data);
        
        // Add to inventory
        if (itemType === 'weapons') {
            const existing = gameData.inventory.weapons.find(w => w.id === itemId);
            if (existing) {
                existing.quantity++;
            } else {
                gameData.inventory.weapons.push({
                    id: item.id,
                    name: item.name,
                    damage: item.damage,
                    type: item.type,
                    quantity: 1
                });
            }
        } else if (itemType === 'armors') {
            const existing = gameData.inventory.armors.find(a => a.id === itemId);
            if (existing) {
                existing.quantity++;
            } else {
                gameData.inventory.armors.push({
                    id: item.id,
                    name: item.name,
                    defense: item.defense,
                    type: item.type,
                    quantity: 1
                });
            }
        } else if (itemType === 'potions') {
            const existing = gameData.inventory.potions.find(p => p.id === itemId);
            if (existing) {
                existing.quantity++;
            } else {
                gameData.inventory.potions.push({
                    id: item.id,
                    name: item.name,
                    heal: item.heal,
                    effect: item.effect,
                    type: item.type,
                    quantity: 1
                });
            }
        }
        
        // Update database
        await pool.query(
            'UPDATE players SET gold = gold - $1, game_data = $2 WHERE telegram_id = $3',
            [item.cost, JSON.stringify(gameData), telegramId]
        );
        
        res.json({
            success: true,
            item: item,
            newGold: player.gold - item.cost,
            inventory: gameData.inventory
        });
        
    } catch (error) {
        console.error('Shop buy error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Equip item
app.post('/api/gladiator/equip', async (req, res) => {
    try {
        const { telegramId, gladiatorId, itemType, itemId } = req.body;
        
        const playerResult = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (playerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const player = playerResult.rows[0];
        const gameData = JSON.parse(player.game_data);
        
        const gladiator = gameData.gladiators.find(g => g.id === gladiatorId);
        if (!gladiator) {
            return res.status(404).json({ error: 'Gladiator not found' });
        }
        
        let inventory;
        let equipped;
        
        if (itemType === 'weapon') {
            inventory = gameData.inventory.weapons;
            equipped = gladiator.equipment.weapon;
        } else if (itemType === 'armor') {
            inventory = gameData.inventory.armors;
            equipped = gladiator.equipment.armor;
        } else {
            return res.status(400).json({ error: 'Invalid item type' });
        }
        
        const item = inventory.find(i => i.id === itemId);
        if (!item || item.quantity <= 0) {
            return res.status(404).json({ error: 'Item not found in inventory' });
        }
        
        // Unequip current item (add back to inventory)
        if (equipped && equipped.id !== 1) { // Don't add basic equipment
            const existing = inventory.find(i => i.id === equipped.id);
            if (existing) {
                existing.quantity++;
            } else {
                inventory.push({
                    id: equipped.id,
                    name: equipped.name,
                    damage: equipped.damage,
                    defense: equipped.defense,
                    type: equipped.type,
                    quantity: 1
                });
            }
        }
        
        // Equip new item
        if (itemType === 'weapon') {
            gladiator.equipment.weapon = {
                id: item.id,
                name: item.name,
                damage: item.damage,
                type: item.type
            };
        } else {
            gladiator.equipment.armor = {
                id: item.id,
                name: item.name,
                defense: item.defense,
                type: item.type
            };
        }
        
        // Remove from inventory
        item.quantity--;
        if (item.quantity <= 0) {
            if (itemType === 'weapon') {
                gameData.inventory.weapons = gameData.inventory.weapons.filter(i => i.id !== itemId);
            } else {
                gameData.inventory.armors = gameData.inventory.armors.filter(i => i.id !== itemId);
            }
        }
        
        // Update game data
        gameData.gladiators = gameData.gladiators.map(g => 
            g.id === gladiatorId ? gladiator : g
        );
        
        await pool.query(
            'UPDATE players SET game_data = $1 WHERE telegram_id = $2',
            [JSON.stringify(gameData), telegramId]
        );
        
        res.json({
            success: true,
            gladiator: gladiator,
            inventory: gameData.inventory
        });
        
    } catch (error) {
        console.error('Equip item error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upgrade building
app.post('/api/building/upgrade', async (req, res) => {
    try {
        const { telegramId, buildingType } = req.body;
        
        const playerResult = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (playerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const player = playerResult.rows[0];
        const gameData = JSON.parse(player.game_data);
        
        const building = gameData.buildings[buildingType];
        if (!building) {
            return res.status(404).json({ error: 'Building not found' });
        }
        
        // Calculate cost
        const baseCosts = {
            barracks: 1000,
            training_ground: 1500,
            infirmary: 1200,
            arena: 2000
        };
        
        const cost = baseCosts[buildingType] * building.level;
        
        if (player.gold < cost) {
            return res.status(400).json({ error: `Недостаточно золота. Нужно: ${cost}` });
        }
        
        // Upgrade
        building.level++;
        
        // Apply bonuses
        switch (buildingType) {
            case 'barracks':
                building.capacity = 5 + building.level * 2;
                break;
            case 'training_ground':
                building.bonus = building.level * 0.1;
                break;
            case 'infirmary':
                building.heal_speed = building.level;
                break;
            case 'arena':
                building.fame_bonus = (building.level - 1) * 0.1;
                break;
        }
        
        // Update database
        await pool.query(
            'UPDATE players SET gold = gold - $1, game_data = $2 WHERE telegram_id = $3',
            [cost, JSON.stringify(gameData), telegramId]
        );
        
        res.json({
            success: true,
            building: building,
            newGold: player.gold - cost
        });
        
    } catch (error) {
        console.error('Upgrade building error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Claim daily reward
app.post('/api/daily-reward', async (req, res) => {
    try {
        const { telegramId } = req.body;
        
        const playerResult = await pool.query(
            'SELECT * FROM players WHERE telegram_id = $1',
            [telegramId]
        );
        
        if (playerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        
        const player = playerResult.rows[0];
        
        if (player.daily_reward_claimed) {
            return res.status(400).json({ error: 'Ежедневная награда уже получена сегодня' });
        }
        
        // Calculate streak (simplified)
        const lastReward = player.last_daily_reward;
        const today = new Date();
        const streak = lastReward && 
                      new Date(lastReward).getDate() === today.getDate() - 1 ? 
                      (player.daily_streak || 1) + 1 : 1;
        
        // Calculate reward
        const baseReward = 100;
        const streakBonus = Math.min(streak * 20, 200);
        const totalGold = baseReward + streakBonus;
        const gems = Math.floor(streak / 7); // 1 gem every 7 days
        
        // Update player
        await pool.query(
            `UPDATE players 
             SET gold = gold + $1, 
                 gems = gems + $2,
                 daily_reward_claimed = TRUE,
                 last_daily_reward = CURRENT_TIMESTAMP,
                 daily_streak = $3
             WHERE telegram_id = $4`,
            [totalGold, gems, streak, telegramId]
        );
        
        res.json({
            success: true,
            reward: {
                gold: totalGold,
                gems: gems,
                streak: streak
            },
            newGold: player.gold + totalGold,
            newGems: player.gems + gems
        });
        
    } catch (error) {
        console.error('Daily reward error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        const { type = 'fame', limit = 50 } = req.query;
        
        let orderBy;
        switch (type) {
            case 'fame': orderBy = 'fame DESC'; break;
            case 'gold': orderBy = 'gold DESC'; break;
            case 'level': orderBy = 'level DESC, experience DESC'; break;
            default: orderBy = 'fame DESC';
        }
        
        const result = await pool.query(
            `SELECT telegram_id, username, first_name, 
                    gold, gems, fame, level, experience,
                    (SELECT COUNT(*) FROM battles WHERE player_id = players.telegram_id AND victory = true) as wins,
                    (SELECT COUNT(*) FROM gladiators WHERE jsonb_array_length(game_data->'gladiators')) as gladiator_count
             FROM players 
             ORDER BY ${orderBy} 
             LIMIT $1`,
            [limit]
        );
        
        // Add rank
        const leaderboard = result.rows.map((player, index) => ({
            rank: index + 1,
            ...player
        }));
        
        res.json({
            success: true,
            leaderboard,
            type
        });
        
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get player battles history
app.get('/api/player/:telegramId/battles', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const { limit = 20 } = req.query;
        
        const result = await pool.query(
            `SELECT * FROM battles 
             WHERE player_id = $1 
             ORDER BY battle_time DESC 
             LIMIT $2`,
            [telegramId, limit]
        );
        
        res.json({
            success: true,
            battles: result.rows
        });
        
    } catch (error) {
        console.error('Battles history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get shop items
app.get('/api/shop/items', async (req, res) => {
    const shopItems = {
        weapons: [
            { id: 2, name: 'Железный меч', damage: 10, cost: 200, type: 'sword', description: 'Надежное железное оружие' },
            { id: 3, name: 'Стальной меч', damage: 15, cost: 500, type: 'sword', description: 'Острое стальное лезвие' },
            { id: 4, name: 'Длинное копье', damage: 12, cost: 300, type: 'spear', description: 'Дальнобойное оружие' },
            { id: 5, name: 'Боевой топор', damage: 18, cost: 800, type: 'axe', description: 'Мощный разящий удар' },
            { id: 6, name: 'Гладиус', damage: 16, cost: 600, type: 'sword', description: 'Классический римский меч' }
        ],
        armors: [
            { id: 2, name: 'Кольчуга', defense: 8, cost: 300, type: 'medium', description: 'Гибкая металлическая защита' },
            { id: 3, name: 'Латный доспех', defense: 15, cost: 800, type: 'heavy', description: 'Тяжелая, но надежная броня' },
            { id: 4, name: 'Чешуйчатый доспех', defense: 12, cost: 500, type: 'medium', description: 'Чешуйчатая металлическая броня' },
            { id: 5, name: 'Поножные латы', defense: 5, cost: 200, type: 'light', description: 'Защита для ног' }
        ],
        potions: [
            { id: 3, name: 'Среднее зелье здоровья', heal: 60, cost: 50, type: 'heal', description: 'Восстанавливает 60 HP' },
            { id: 4, name: 'Большое зелье здоровья', heal: 100, cost: 100, type: 'heal', description: 'Восстанавливает 100 HP' },
            { id: 5, name: 'Зелье силы', effect: 'strength', cost: 150, type: 'buff', description: '+5 к силе на 3 боя' },
            { id: 6, name: 'Зелье энергии', energy: 30, cost: 80, type: 'energy', description: 'Восстанавливает 30 энергии' }
        ],
        gladiators: [
            { type: 'murmillo', name: 'Мирмиллон', cost: 500, description: 'Меч и прямоугольный щит' },
            { type: 'thraex', name: 'Фракиец', cost: 600, description: 'Изогнутый меч, высокий щит' },
            { type: 'retiarius', name: 'Ретиарий', cost: 550, description: 'Трезубец и сеть' },
            { type: 'secutor', name: 'Секутор', cost: 700, description: 'Гладкий шлем, короткий меч' }
        ]
    };
    
    res.json({
        success: true,
        shop: shopItems
    });
});

// Главная страница API
app.get('/', (req, res) => {
    res.json({
        service: '🏛️ Gladiator Arena API',
        status: 'running',
        version: '1.0.0',
        database: 'connected',
        endpoints: {
            player_init: 'POST /api/player/init',
            player_data: 'GET /api/player/:telegramId',
            battle_start: 'POST /api/battle/start',
            shop_items: 'GET /api/shop/items',
            leaderboard: 'GET /api/leaderboard',
            daily_reward: 'POST /api/daily-reward',
            health: 'GET /health'
        },
        message: 'API для Telegram игры Gladiator Arena'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
    console.log(`🎮 Game available at http://localhost:${PORT}`);

});

