// ===== GAME STATE & CONFIGURATION =====
const CONFIG = {
    API_URL: process.env.REACT_APP_API_URL || 'https://gladiator-arena-telegram.onrender.com/api',
    ENERGY_RESTORE_RATE: 20,
    ENERGY_RESTORE_INTERVAL: 30, // minutes
    DAILY_REWARD_BASE: 100,
    VIBRATION_ENABLED: true,
    SOUND_ENABLED: true
};

let gameState = {
    player: null,
    telegramUser: null,
    selectedGladiator: null,
    selectedDifficulty: null,
    selectedGladiatorType: null,
    shopItems: null,
    leaderboard: null,
    lastUpdate: null
};

// ===== TELEGRAM WEB APP INTEGRATION =====
const tg = window.Telegram.WebApp;

// Initialize Telegram Web App
function initTelegram() {
    tg.expand();
    tg.enableClosingConfirmation();
    tg.setHeaderColor('#1a1a2e');
    tg.setBackgroundColor('#0c0c14');
    
    // Get Telegram user data
    gameState.telegramUser = tg.initDataUnsafe.user;
    
    if (!gameState.telegramUser) {
        showToast('Ошибка загрузки Telegram данных', 'error');
        return;
    }
    
    console.log('Telegram User:', gameState.telegramUser);
    loadPlayerData();
}

// ===== API FUNCTIONS =====
async function apiRequest(endpoint, method = 'GET', data = null) {
    showLoading(true);
    
    const url = `${CONFIG.API_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'API Error');
        }
        
        return result;
    } catch (error) {
        console.error('API Request Error:', error);
        showToast(error.message || 'Ошибка соединения', 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

// ===== PLAYER MANAGEMENT =====
async function loadPlayerData() {
    try {
        const data = {
            telegramId: gameState.telegramUser.id,
            username: gameState.telegramUser.username,
            firstName: gameState.telegramUser.first_name,
            lastName: gameState.telegramUser.last_name || ''
        };
        
        const result = await apiRequest('/player/init', 'POST', data);
        
        if (result.success) {
            gameState.player = result.player;
            updatePlayerUI();
            
            if (result.newPlayer) {
                showToast('Добро пожаловать на арену!', 'success');
                showTutorial();
            } else {
                showToast('Игра загружена!', 'success');
            }
            
            // Load additional data
            loadShopItems();
            loadLeaderboard();
            loadBattleHistory();
        }
    } catch (error) {
        showToast('Ошибка загрузки игрока', 'error');
    }
}

function updatePlayerUI() {
    if (!gameState.player) return;
    
    const player = gameState.player;
    const gameData = typeof player.game_data === 'string' ? 
                     JSON.parse(player.game_data) : player.game_data;
    
    // Player info
    document.getElementById('player-name').textContent = 
        player.first_name || player.username || 'Гладиатор';
    document.getElementById('player-level').textContent = player.level;
    
    // Experience
    const expForNextLevel = player.level * 500;
    const expPercent = (player.experience / expForNextLevel) * 100;
    document.getElementById('xp-fill').style.width = `${expPercent}%`;
    document.getElementById('xp-text').textContent = 
        `${player.experience}/${expForNextLevel} XP`;
    
    // Resources
    document.getElementById('gold-value').textContent = formatNumber(player.gold);
    document.getElementById('gems-value').textContent = player.gems;
    document.getElementById('fame-value').textContent = player.fame;
    document.getElementById('energy-value').textContent = 
        `${player.energy}/${player.max_energy}`;
    
    // Energy bar
    const energyPercent = (player.energy / player.max_energy) * 100;
    document.getElementById('energy-fill').style.width = `${energyPercent}%`;
    
    // Market gold
    document.getElementById('market-gold').textContent = formatNumber(player.gold);
    
    // Update gladiators list
    updateGladiatorsList();
    
    // Update inventory
    updateInventoryUI();
    
    // Update buildings
    updateBuildingsUI();
    
    // Update statistics
    updateStatistics();
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// ===== GLADIATOR MANAGEMENT =====
function updateGladiatorsList() {
    if (!gameState.player) return;
    
    const gameData = typeof gameState.player.game_data === 'string' ? 
                     JSON.parse(gameState.player.game_data) : gameState.player.game_data;
    const gladiators = gameData.gladiators || [];
    const container = document.getElementById('gladiators-container');
    
    container.innerHTML = '';
    
    if (gladiators.length === 0) {
        container.innerHTML = '<p class="no-gladiators">У вас пока нет гладиаторов</p>';
        return;
    }
    
    gladiators.forEach(gladiator => {
        const healthPercent = (gladiator.health / gladiator.maxHealth) * 100;
        const gladiatorCard = document.createElement('div');
        gladiatorCard.className = 'gladiator-card';
        gladiatorCard.onclick = () => selectGladiatorForAction(gladiator.id);
        
        gladiatorCard.innerHTML = `
            <div class="gladiator-avatar">
                <i class="fas fa-${getGladiatorIcon(gladiator.type)}"></i>
            </div>
            <div class="gladiator-info">
                <div class="gladiator-name">${gladiator.name}</div>
                <div class="gladiator-type">${getGladiatorTypeName(gladiator.type)} • Ур. ${gladiator.level}</div>
                <div class="gladiator-stats">
                    <div class="stat-item">
                        <i class="fas fa-fist-raised"></i>
                        <span>${gladiator.strength}</span>
                    </div>
                    <div class="stat-item">
                        <i class="fas fa-wind"></i>
                        <span>${gladiator.agility}</span>
                    </div>
                    <div class="stat-item">
                        <i class="fas fa-heart"></i>
                        <span>${gladiator.endurance}</span>
                    </div>
                </div>
                <div class="health-bar-container">
                    <div class="health-bar">
                        <div class="health-fill" style="width: ${healthPercent}%"></div>
                    </div>
                    <div class="health-text">${gladiator.health}/${gladiator.maxHealth}</div>
                </div>
            </div>
            <div class="gladiator-level">${gladiator.level}</div>
        `;
        
        container.appendChild(gladiatorCard);
    });
}

function getGladiatorIcon(type) {
    const icons = {
        murmillo: 'shield-alt',
        thraex: 'user-ninja',
        retiarius: 'fish',
        secutor: 'helmet-battle',
        dimachaerus: 'user-injured',
        essedarius: 'horse',
        provocator: 'crown'
    };
    return icons[type] || 'user';
}

function getGladiatorTypeName(type) {
    const names = {
        murmillo: 'Мирмиллон',
        thraex: 'Фракиец',
        retiarius: 'Ретиарий',
        secutor: 'Секутор',
        dimachaerus: 'Димахер',
        essedarius: 'Эсседарий',
        provocator: 'Провокатор'
    };
    return names[type] || 'Гладиатор';
}

// ===== BATTLE SYSTEM =====
function startBattleModal(difficulty) {
    if (!gameState.player) {
        showToast('Загрузите игрока сначала', 'error');
        return;
    }
    
    const gameData = typeof gameState.player.game_data === 'string' ? 
                     JSON.parse(gameState.player.game_data) : gameState.player.game_data;
    const gladiators = gameData.gladiators || [];
    
    // Filter only healthy gladiators
    const healthyGladiators = gladiators.filter(g => g.health > 0);
    
    if (healthyGladiators.length === 0) {
        showToast('Нет здоровых гладиаторов для боя', 'error');
        return;
    }
    
    gameState.selectedDifficulty = difficulty;
    
    // Update modal info
    const difficultyText = {
        easy: 'Легкая',
        medium: 'Средняя',
        hard: 'Сложная'
    }[difficulty] || 'Легкая';
    
    const energyCost = {
        easy: 10,
        medium: 15,
        hard: 20
    }[difficulty] || 10;
    
    const rewards = {
        easy: '50-100 золота, 10 опыта',
        medium: '100-200 золота, 25 опыта, +1 самоцвет',
        hard: '200-300 золота, 50 опыта, +2-3 самоцвета, +10-20 славы'
    }[difficulty] || '50-100 золота, 10 опыта';
    
    document.getElementById('battle-difficulty-text').textContent = 
        `Сложность: ${difficultyText}`;
    document.getElementById('battle-energy-cost').textContent = 
        `Стоимость энергии: ${energyCost}`;
    document.getElementById('battle-rewards').textContent = 
        `Награда: ${rewards}`;
    
    // Populate gladiator selector
    const selector = document.getElementById('gladiator-selector');
    selector.innerHTML = '';
    
    healthyGladiators.forEach(gladiator => {
        const healthPercent = (gladiator.health / gladiator.maxHealth) * 100;
        const item = document.createElement('div');
        item.className = 'gladiator-selector-item';
        item.onclick = () => selectGladiatorForBattle(gladiator.id);
        
        item.innerHTML = `
            <div class="gladiator-avatar">
                <i class="fas fa-${getGladiatorIcon(gladiator.type)}"></i>
            </div>
            <div class="gladiator-info">
                <div class="gladiator-name">${gladiator.name}</div>
                <div class="gladiator-stats">
                    <span><i class="fas fa-fist-raised"></i> ${gladiator.strength}</span>
                    <span><i class="fas fa-heart"></i> ${gladiator.health}/${gladiator.maxHealth}</span>
                    <span><i class="fas fa-star"></i> Ур. ${gladiator.level}</span>
                </div>
                <div class="health-bar">
                    <div class="health-fill" style="width: ${healthPercent}%"></div>
                </div>
            </div>
            ${gameState.selectedGladiator === gladiator.id ? 
              '<i class="fas fa-check-circle selected-icon"></i>' : ''}
        `;
        
        selector.appendChild(item);
    });
    
    // Select first gladiator by default
    if (healthyGladiators.length > 0 && !gameState.selectedGladiator) {
        selectGladiatorForBattle(healthyGladiators[0].id);
    }
    
    openModal('battle-modal');
}

function selectGladiatorForBattle(gladiatorId) {
    gameState.selectedGladiator = gladiatorId;
    
    // Update UI
    const items = document.querySelectorAll('.gladiator-selector-item');
    items.forEach(item => {
        item.classList.remove('selected');
        const checkIcon = item.querySelector('.selected-icon');
        if (checkIcon) {
            checkIcon.remove();
        }
    });
    
    const selectedItem = Array.from(items).find(item => {
        const nameDiv = item.querySelector('.gladiator-name');
        return nameDiv && nameDiv.textContent.includes(gladiatorId.toString());
    });
    
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedItem.innerHTML += '<i class="fas fa-check-circle selected-icon"></i>';
    }
}

async function startBattle() {
    if (!gameState.selectedGladiator || !gameState.selectedDifficulty) {
        showToast('Выберите гладиатора для боя', 'error');
        return;
    }
    
    try {
        const data = {
            telegramId: gameState.telegramUser.id,
            gladiatorId: gameState.selectedGladiator,
            difficulty: gameState.selectedDifficulty
        };
        
        const result = await apiRequest('/battle/start', 'POST', data);
        
        if (result.success) {
            // Update player data
            gameState.player.gold = result.player.gold;
            gameState.player.gems = result.player.gems;
            gameState.player.fame = result.player.fame;
            gameState.player.energy = result.player.energy;
            gameState.player.level = result.player.level;
            gameState.player.experience = result.player.experience;
            
            // Update game data
            const gameData = typeof gameState.player.game_data === 'string' ? 
                           JSON.parse(gameState.player.game_data) : gameState.player.game_data;
            
            // Update gladiator in game data
            gameData.gladiators = gameData.gladiators.map(g => {
                if (g.id === gameState.selectedGladiator) {
                    return { ...g, ...result.gladiator };
                }
                return g;
            });
            
            gameState.player.game_data = JSON.stringify(gameData);
            
            // Update UI
            updatePlayerUI();
            
            // Show battle result
            showBattleResult(result);
            
            // Vibrate on victory
            if (result.victory && CONFIG.VIBRATION_ENABLED && tg.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('heavy');
            }
            
            // Reset selection
            gameState.selectedGladiator = null;
            gameState.selectedDifficulty = null;
            
            closeModal('battle-modal');
        }
    } catch (error) {
        showToast('Ошибка начала боя', 'error');
    }
}

function showBattleResult(result) {
    const modal = document.getElementById('battle-result-modal');
    const content = document.getElementById('battle-result-content');
    
    const title = document.getElementById('battle-result-title');
    title.textContent = result.victory ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
    
    content.innerHTML = `
        <div class="result-icon ${result.victory ? 'victory' : 'defeat'}">
            <i class="fas fa-${result.victory ? 'trophy' : 'skull-crossbones'}"></i>
        </div>
        
        <div class="result-title">${result.victory ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ'}</div>
        
        <div class="battle-details">
            <p>Противник: ${result.battle.enemy}</p>
            <p>Нанесено урона: ${result.battle.actualDamageDealt}</p>
            <p>Получено урона: ${result.battle.actualDamageTaken}</p>
        </div>
        
        <div class="result-rewards">
            <h4>${result.victory ? 'Награды:' : 'Опыт за попытку:'}</h4>
            ${Object.entries(result.rewards).map(([key, value]) => `
                <div class="reward-item">
                    <div class="reward-label">
                        <i class="fas fa-${getRewardIcon(key)}"></i>
                        <span>${getRewardName(key)}</span>
                    </div>
                    <div class="reward-value">+${value}</div>
                </div>
            `).join('')}
        </div>
        
        <div class="modal-actions">
            <button class="modal-btn confirm" onclick="closeModal('battle-result-modal')">
                Продолжить
            </button>
        </div>
    `;
    
    openModal('battle-result-modal');
}

function getRewardIcon(key) {
    const icons = {
        gold: 'coins',
        gems: 'gem',
        exp: 'star',
        fame: 'crown'
    };
    return icons[key] || 'gift';
}

function getRewardName(key) {
    const names = {
        gold: 'Золото',
        gems: 'Самоцветы',
        exp: 'Опыт',
        fame: 'Слава'
    };
    return names[key] || key;
}

// ===== SHOP SYSTEM =====
async function loadShopItems() {
    try {
        const result = await apiRequest('/shop/items');
        if (result.success) {
            gameState.shopItems = result.shop;
        }
    } catch (error) {
        console.error('Error loading shop items:', error);
    }
}

function showMarketCategory(category) {
    if (!gameState.shopItems) {
        showToast('Магазин еще не загружен', 'error');
        return;
    }
    
    const items = gameState.shopItems[category];
    if (!items) {
        showToast('Категория не найдена', 'error');
        return;
    }
    
    // Update active tab
    document.querySelectorAll('.market-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Display items
    const container = document.getElementById('market-items');
    container.innerHTML = '';
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'market-item-card';
        
        card.innerHTML = `
            <div class="market-item-header">
                <div class="market-item-icon">
                    <i class="fas fa-${getItemIcon(item)}"></i>
                </div>
                <div class="market-item-name">${item.name}</div>
            </div>
            
            <div class="market-item-stats">
                ${item.damage ? `<p><i class="fas fa-sword"></i> Урон: ${item.damage}</p>` : ''}
                ${item.defense ? `<p><i class="fas fa-shield-alt"></i> Защита: ${item.defense}</p>` : ''}
                ${item.heal ? `<p><i class="fas fa-heart"></i> Лечение: ${item.heal}</p>` : ''}
                ${item.effect ? `<p><i class="fas fa-magic"></i> Эффект: ${item.effect}</p>` : ''}
                <p class="item-description">${item.description || ''}</p>
            </div>
            
            <div class="market-item-cost">
                <div class="cost-amount">
                    <i class="fas fa-coins"></i>
                    <span>${item.cost}</span>
                </div>
                <button class="buy-btn" onclick="buyItem('${category}', ${item.id})">
                    Купить
                </button>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function getItemIcon(item) {
    if (item.type === 'sword') return 'sword';
    if (item.type === 'spear') return 'staff';
    if (item.type === 'axe') return 'hatchet';
    if (item.type === 'shield') return 'shield-alt';
    if (item.type === 'heal') return 'wine-bottle';
    if (item.type === 'buff') return 'magic';
    return 'box';
}

async function buyItem(category, itemId) {
    try {
        const data = {
            telegramId: gameState.telegramUser.id,
            itemType: category,
            itemId: itemId
        };
        
        const result = await apiRequest('/shop/buy', 'POST', data);
        
        if (result.success) {
            // Update player gold
            gameState.player.gold = result.newGold;
            
            // Update game data with new inventory
            const gameData = typeof gameState.player.game_data === 'string' ? 
                           JSON.parse(gameState.player.game_data) : gameState.player.game_data;
            gameData.inventory = result.inventory;
            gameState.player.game_data = JSON.stringify(gameData);
            
            // Update UI
            updatePlayerUI();
            updateInventoryUI();
            
            showToast('Покупка успешна!', 'success');
        }
    } catch (error) {
        showToast('Ошибка покупки', 'error');
    }
}

// ===== INVENTORY MANAGEMENT =====
function updateInventoryUI() {
    if (!gameState.player) return;
    
    const gameData = typeof gameState.player.game_data === 'string' ? 
                     JSON.parse(gameState.player.game_data) : gameState.player.game_data;
    const inventory = gameData.inventory || {};
    
    // Update weapons
    const weaponsContainer = document.getElementById('inventory-weapons');
    weaponsContainer.innerHTML = '';
    
    (inventory.weapons || []).forEach(weapon => {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        item.innerHTML = `
            <div class="item-name">${weapon.name}</div>
            <div class="item-quantity">x${weapon.quantity}</div>
        `;
        weaponsContainer.appendChild(item);
    });
    
    // Update armor
    const armorContainer = document.getElementById('inventory-armor');
    armorContainer.innerHTML = '';
    
    (inventory.armors || []).forEach(armor => {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        item.innerHTML = `
            <div class="item-name">${armor.name}</div>
            <div class="item-quantity">x${armor.quantity}</div>
        `;
        armorContainer.appendChild(item);
    });
    
    // Update potions
    const potionsContainer = document.getElementById('inventory-potions');
    potionsContainer.innerHTML = '';
    
    (inventory.potions || []).forEach(potion => {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        item.innerHTML = `
            <div class="item-name">${potion.name}</div>
            <div class="item-quantity">x${potion.quantity}</div>
        `;
        potionsContainer.appendChild(item);
    });
}

// ===== BUILDINGS MANAGEMENT =====
function updateBuildingsUI() {
    if (!gameState.player) return;
    
    const gameData = typeof gameState.player.game_data === 'string' ? 
                     JSON.parse(gameState.player.game_data) : gameState.player.game_data;
    const buildings = gameData.buildings || {};
    
    // Update barracks
    document.getElementById('barracks-capacity').textContent = 
        buildings.barracks?.capacity || 5;
    document.getElementById('barracks-cost').textContent = 
        (buildings.barracks?.level || 1) * 1000;
    
    // Update training ground
    document.getElementById('training-bonus').textContent = 
        `${((buildings.training_ground?.bonus || 0.1) * 100).toFixed(0)}%`;
    document.getElementById('training-cost').textContent = 
        (buildings.training_ground?.level || 1) * 1500;
    
    // Update infirmary
    document.getElementById('infirmary-speed').textContent = 
        `${buildings.infirmary?.heal_speed || 1}x`;
    document.getElementById('infirmary-cost').textContent = 
        (buildings.infirmary?.level || 1) * 1200;
}

async function upgradeBuilding(buildingType) {
    try {
        const data = {
            telegramId: gameState.telegramUser.id,
            buildingType: buildingType
        };
        
        const result = await apiRequest('/building/upgrade', 'POST', data);
        
        if (result.success) {
            // Update player gold
            gameState.player.gold = result.newGold;
            
            // Update game data with upgraded building
            const gameData = typeof gameState.player.game_data === 'string' ? 
                           JSON.parse(gameState.player.game_data) : gameState.player.game_data;
            gameData.buildings[buildingType] = result.building;
            gameState.player.game_data = JSON.stringify(gameData);
            
            // Update UI
            updatePlayerUI();
            updateBuildingsUI();
            
            showToast('Постройка улучшена!', 'success');
        }
    } catch (error) {
        showToast('Ошибка улучшения постройки', 'error');
    }
}

// ===== LEADERBOARD =====
async function loadLeaderboard() {
    try {
        const filter = document.getElementById('leaderboard-filter').value;
        const result = await apiRequest(`/leaderboard?type=${filter}&limit=50`);
        
        if (result.success) {
            gameState.leaderboard = result.leaderboard;
            updateLeaderboardUI();
        }
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

function updateLeaderboardUI() {
    if (!gameState.leaderboard) return;
    
    const container = document.getElementById('leaderboard-list');
    const valueHeader = document.getElementById('leaderboard-value');
    const filter = document.getElementById('leaderboard-filter').value;
    
    // Update header based on filter
    const headers = {
        fame: 'Слава',
        gold: 'Золото',
        level: 'Уровень',
        wins: 'Победы'
    };
    valueHeader.textContent = headers[filter] || 'Слава';
    
    container.innerHTML = '';
    
    gameState.leaderboard.forEach((player, index) => {
        const isCurrentPlayer = player.telegram_id === gameState.telegramUser.id;
        const item = document.createElement('div');
        item.className = `leaderboard-item ${isCurrentPlayer ? 'current-player' : ''}`;
        
        const value = player[filter] || player.fame;
        
        item.innerHTML = `
            <div class="rank rank-${index + 1}">${index + 1}</div>
            <div class="player-name">
                <div class="player-avatar-small">
                    <i class="fas fa-${isCurrentPlayer ? 'crown' : 'user'}"></i>
                </div>
                <span>${player.first_name || player.username || 'Игрок'}</span>
            </div>
            <div class="leaderboard-value">${formatNumber(value)}</div>
        `;
        
        container.appendChild(item);
    });
}

// ===== STATISTICS =====
async function updateStatistics() {
    try {
        const result = await apiRequest(`/player/${gameState.telegramUser.id}/battles?limit=100`);
        
        if (result.success) {
            const battles = result.battles || [];
            const victories = battles.filter(b => b.victory).length;
            const totalBattles = battles.length;
            const winRate = totalBattles > 0 ? ((victories / totalBattles) * 100).toFixed(1) : 0;
            
            // Update game data gladiator count
            const gameData = typeof gameState.player.game_data === 'string' ? 
                           JSON.parse(gameState.player.game_data) : gameState.player.game_data;
            const gladiatorCount = gameData.gladiators?.length || 0;
            
            document.getElementById('total-battles').textContent = totalBattles;
            document.getElementById('victories').textContent = victories;
            document.getElementById('win-rate').textContent = `${winRate}%`;
            document.getElementById('total-gladiators').textContent = gladiatorCount;
        }
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// ===== DAILY REWARD =====
async function claimDailyReward() {
    try {
        const data = {
            telegramId: gameState.telegramUser.id
        };
        
        const result = await apiRequest('/daily-reward', 'POST', data);
        
        if (result.success) {
            // Update player resources
            gameState.player.gold = result.newGold;
            gameState.player.gems = result.newGems;
            
            // Update UI
            updatePlayerUI();
            
            showToast(`Ежедневная награда получена! +${result.reward.gold} золота`, 'success');
        }
    } catch (error) {
        showToast('Ошибка получения награды', 'error');
    }
}

// ===== BATTLE HISTORY =====
async function loadBattleHistory() {
    try {
        const result = await apiRequest(`/player/${gameState.telegramUser.id}/battles?limit=5`);
        
        if (result.success) {
            updateBattleHistoryUI(result.battles);
        }
    } catch (error) {
        console.error('Error loading battle history:', error);
    }
}

function updateBattleHistoryUI(battles) {
    const container = document.getElementById('battle-history-list');
    container.innerHTML = '';
    
    if (!battles || battles.length === 0) {
        container.innerHTML = '<p>Пока не было боев</p>';
        return;
    }
    
    battles.forEach(battle => {
        const item = document.createElement('div');
        item.className = `battle-history-item ${battle.victory ? 'victory' : 'defeat'}`;
        
        const time = new Date(battle.battle_time).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const rewards = battle.rewards ? JSON.parse(battle.rewards) : {};
        const gold = rewards.gold || 0;
        
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between;">
                <div>
                    <strong>${battle.victory ? 'Победа' : 'Поражение'}</strong> vs ${battle.enemy_name}
                </div>
                <div>${time}</div>
            </div>
            <div style="font-size: 12px; opacity: 0.8; margin-top: 5px;">
                Урон: ${battle.damage_dealt} | Получено: ${battle.damage_taken}
                ${gold > 0 ? ` | +${gold} золота` : ''}
            </div>
        `;
        
        container.appendChild(item);
    });
}

// ===== GLADIATOR PURCHASE =====
function showBuyGladiatorModal() {
    gameState.selectedGladiatorType = null;
    openModal('buy-gladiator-modal');
}

function selectGladiatorType(type) {
    gameState.selectedGladiatorType = type;
    
    // Update UI
    document.querySelectorAll('.gladiator-type-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const selectedCard = Array.from(document.querySelectorAll('.gladiator-type-card')).find(card => {
        const h4 = card.querySelector('h4');
        return h4 && getGladiatorTypeFromName(h4.textContent) === type;
    });
    
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
}

function getGladiatorTypeFromName(name) {
    const types = {
        'Мирмиллон': 'murmillo',
        'Фракиец': 'thraex',
        'Ретиарий': 'retiarius',
        'Секутор': 'secutor',
        'Димахер': 'dimachaerus',
        'Эсседарий': 'essedarius',
        'Провокатор': 'provocator'
    };
    return types[name] || 'murmillo';
}

async function buySelectedGladiator() {
    if (!gameState.selectedGladiatorType) {
        showToast('Выберите тип гладиатора', 'error');
        return;
    }
    
    const nameInput = document.getElementById('gladiator-name-input');
    const name = nameInput.value.trim();
    
    if (!name) {
        showToast('Введите имя гладиатора', 'error');
        return;
    }
    
    if (name.length > 20) {
        showToast('Имя слишком длинное (макс 20 символов)', 'error');
        return;
    }
    
    try {
        const data = {
            telegramId: gameState.telegramUser.id,
            gladiatorType: gameState.selectedGladiatorType,
            name: name
        };
        
        const result = await apiRequest('/gladiator/buy', 'POST', data);
        
        if (result.success) {
            // Update player gold
            gameState.player.gold = result.newGold;
            
            // Update game data with new gladiator
            const gameData = typeof gameState.player.game_data === 'string' ? 
                           JSON.parse(gameState.player.game_data) : gameState.player.game_data;
            gameData.gladiators.push(result.gladiator);
            gameState.player.game_data = JSON.stringify(gameData);
            
            // Update UI
            updatePlayerUI();
            
            // Clear input
            nameInput.value = '';
            
            // Close modal
            closeModal('buy-gladiator-modal');
            
            showToast(`Гладиатор "${name}" куплен!`, 'success');
        }
    } catch (error) {
        showToast('Ошибка покупки гладиатора', 'error');
    }
}

// ===== HEALING SYSTEM =====
async function healGladiator(gladiatorId) {
    try {
        const data = {
            telegramId: gameState.telegramUser.id,
            gladiatorId: gladiatorId
        };
        
        const result = await apiRequest('/gladiator/heal', 'POST', data);
        
        if (result.success) {
            // Update game data
            const gameData = typeof gameState.player.game_data === 'string' ? 
                           JSON.parse(gameState.player.game_data) : gameState.player.game_data;
            
            gameData.gladiators = gameData.gladiators.map(g => {
                if (g.id === gladiatorId) {
                    return { ...g, health: result.gladiator.health };
                }
                return g;
            });
            
            gameData.inventory.potions = result.potions;
            gameState.player.game_data = JSON.stringify(gameData);
            
            // Update UI
            updatePlayerUI();
            
            showToast('Гладиатор вылечен!', 'success');
        }
    } catch (error) {
        showToast('Ошибка лечения', 'error');
    }
}

// ===== ENERGY RESTORATION =====
async function restoreEnergy() {
    try {
        const data = {
            telegramId: gameState.telegramUser.id
        };
        
        const result = await apiRequest('/player/update', 'POST', {
            ...data,
            energy: gameState.player.max_energy
        });
        
        if (result.success) {
            gameState.player.energy = gameState.player.max_energy;
            updatePlayerUI();
            showToast('Энергия восстановлена!', 'success');
        }
    } catch (error) {
        showToast('Ошибка восстановления энергии', 'error');
    }
}

// ===== UI UTILITIES =====
function switchTab(tabName) {
    // Update navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load data if needed
    if (tabName === 'leaderboard') {
        loadLeaderboard();
    } else if (tabName === 'market') {
        if (!gameState.shopItems) {
            loadShopItems();
        }
        showMarketCategory('weapons');
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.body.style.overflow = 'auto';
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.add('active');
    } else {
        loading.classList.remove('active');
    }
}

function showTutorial() {
    showToast('Добро пожаловать! Начните с покупки гладиатора и участия в боях.', 'info');
}

function selectGladiatorForAction(gladiatorId) {
    // For now, just show a toast
    const gameData = typeof gameState.player.game_data === 'string' ? 
                     JSON.parse(gameState.player.game_data) : gameState.player.game_data;
    const gladiator = gameData.gladiators.find(g => g.id === gladiatorId);
    
    if (gladiator) {
        showToast(`Выбран гладиатор: ${gladiator.name}`, 'info');
    }
}

function openHealingModal() {
    showToast('Функция лечения в разработке', 'info');
}

function openEquipmentModal() {
    showToast('Функция экипировки в разработке', 'info');
}

function openTrainingModal() {
    showToast('Функция тренировки в разработке', 'info');
}

function openTraining() {
    showToast('Тренировочный зал в разработке', 'info');
}

function showClanInfo() {
    showToast('Система кланов в разработке', 'info');
}

function showGameRules() {
    tg.showPopup({
        title: 'Правила игры',
        message: '1. Покупайте и тренируйте гладиаторов\n2. Участвуйте в боях на арене\n3. Зарабатывайте золото и славу\n4. Улучшайте свою школу\n5. Соревнуйтесь с другими игроками',
        buttons: [{ type: 'ok' }]
    });
}

function showTips() {
    tg.showPopup({
        title: 'Советы для новичков',
        message: '• Начните с легких боев\n• Покупайте лучшее оружие\n• Следите за здоровьем гладиаторов\n• Улучшайте казармы для большего количества гладиаторов\n• Заходите ежедневно для получения награды',
        buttons: [{ type: 'ok' }]
    });
}

function openDiscord() {
    tg.openLink('https://discord.gg/example');
}

function showAbout() {
    tg.showPopup({
        title: 'О проекте',
        message: 'Gladiator Arena - инкрементальная игра про гладиаторов для Telegram. Разработано с ❤️ для сообщества.',
        buttons: [{ type: 'ok' }]
    });
}

function buyGems() {
    tg.showPopup({
        title: 'Покупка самоцветов',
        message: 'Функция покупки в разработке',
        buttons: [{ type: 'ok' }]
    });
}

function showPremium() {
    tg.showPopup({
        title: 'Премиум статус',
        message: 'Премиум функции в разработке',
        buttons: [{ type: 'ok' }]
    });
}

function showDonate() {
    tg.openLink('https://www.donationalerts.com/r/example');
}

function saveGame() {
    showToast('Игра автоматически сохраняется', 'info');
}

function resetGame() {
    tg.showPopup({
        title: 'Новая игра',
        message: 'Вы уверены, что хотите начать новую игру? Весь прогресс будет потерян.',
        buttons: [
            { id: 'confirm', type: 'destructive', text: 'Да' },
            { id: 'cancel', type: 'cancel', text: 'Отмена' }
        ]
    }, (buttonId) => {
        if (buttonId === 'confirm') {
            // Implement game reset logic
            showToast('Новая игра начата', 'success');
            setTimeout(() => {
                location.reload();
            }, 1000);
        }
    });
}

function logout() {
    tg.showPopup({
        title: 'Выход',
        message: 'Вы уверены, что хотите выйти?',
        buttons: [
            { id: 'confirm', type: 'destructive', text: 'Выйти' },
            { id: 'cancel', type: 'cancel', text: 'Отмена' }
        ]
    }, (buttonId) => {
        if (buttonId === 'confirm') {
            tg.close();
        }
    });
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Telegram
    initTelegram();
    
    // Set up event listeners
    document.getElementById('sound-toggle').addEventListener('change', (e) => {
        CONFIG.SOUND_ENABLED = e.target.checked;
    });
    
    document.getElementById('vibration-toggle').addEventListener('change', (e) => {
        CONFIG.VIBRATION_ENABLED = e.target.checked;
    });
    
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
    });
    
    // Auto-save every 5 minutes
    setInterval(() => {
        if (gameState.player) {
            console.log('Auto-save triggered');
        }
    }, 5 * 60 * 1000);
    
    // Restore energy notification
    setInterval(() => {
        if (gameState.player && gameState.player.energy < gameState.player.max_energy) {
            showToast('Энергия восстановлена!', 'info');
        }
    }, CONFIG.ENERGY_RESTORE_INTERVAL * 60 * 1000);

});
