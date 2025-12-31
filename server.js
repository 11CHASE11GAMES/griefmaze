const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// --- DATABASE SETUP ---
const MONGO_URI = 'mongodb+srv://admin:CowsAreCool!!24732473!!@cluster0.bljh7gr.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.log('❌ MongoDB Error:', err));

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    sessionToken: { type: String, default: null },
    coins: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    skins: { type: [String], default: ['default'] }, 
    equippedSkin: { type: String, default: 'default' },
    settings: {
        fov: { type: Number, default: 75 },
        renderDist: { type: Number, default: 60 }
    }
});
const User = mongoose.model('User', userSchema);

const reportSchema = new mongoose.Schema({
    reporter: String,
    reported: String,
    reportedId: String,
    category: String,
    details: String,
    lobbyId: String,
    chatLogs: [String],
    timestamp: { type: Date, default: Date.now }
});
const Report = mongoose.model('Report', reportSchema);

// --- GLOBAL STATS SCHEMA ---
const globalStatsSchema = new mongoose.Schema({
    id: { type: String, default: 'global' },
    totalConnections: { type: Number, default: 0 },
    totalGamesPlayed: { type: Number, default: 0 },
    lobbiesCreated: { public: { type: Number, default: 0 }, private: { type: Number, default: 0 } }
});
const GlobalStats = mongoose.model('GlobalStats', globalStatsSchema);

async function incrementGlobalStat(field, amount = 1) {
    try {
        const update = {};
        update[field] = amount;
        await GlobalStats.findOneAndUpdate({ id: 'global' }, { $inc: update }, { upsert: true });
    } catch (e) { console.error("Stat Error:", e); }
}

app.use(express.static('public'));
app.use('/build', express.static(__dirname + '/node_modules/three/build'));
app.use('/jsm', express.static(__dirname + '/node_modules/three/examples/jsm'));

// --- HELPER: Angle Interpolation ---
function lerpAngle(start, end, amount) {
    let diff = end - start;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return start + diff * amount;
}

// --- BOT NAMES ---
const BOT_NAMES = [
    "SpeedRunner", "MazeMaster", "Glitch", "Shadow", "Ghost", "Viper", "Noob123", "ProGamer", 
    "Alex", "Sam", "Jordan", "Casey", "Riley", "Eagle", "Wolf", "Bear", "Tiger", "Runner", 
    "Walker", "Dasher", "Seeker", "Hider", "MazeKing", "QueenBee", "Pixel", "Voxel", 
    "LagSpike", "404NotFound", "Null", "Undefined", "System", "Admin_Fake"
];

// ==========================================
// GAME LOBBY CLASS
// ==========================================
class GameLobby {
    constructor(id, settings, isPrivate = false) {
        this.id = id;
        this.isPrivate = isPrivate;
        this.settings = settings; 
        
        this.players = {}; 
        this.hostId = null; 
        
        this.gameMap = [];
        this.distanceMap = [];
        this.activeItems = [];
        this.placedTraps = []; 
        this.chatHistory = []; 
        
        this.isRoundActive = false;
        this.exitConfig = { x: 0, z: 0, side: 'east' }; 
        
        this.UNIT_SIZE = 3;
        this.MIN_ITEM_DIST = 5 * this.UNIT_SIZE;

        this.timerInterval = null;
        this.safetyInterval = null;
        this.botInterval = null;
        this.nextRoundTimeout = null; // --- FIX: TRACK RESTART TIMER ---
        this.timeLeft = 0;
        this.state = 'waiting'; 
        
        this.setupMap();
        
        // --- BOT SPAWN FIX: RESPECT MAX PLAYERS ---
        if (!this.isPrivate) {
            const availableSlots = Math.max(0, this.settings.maxPlayers - 2);
            if (availableSlots > 0) {
                let botCount = Math.floor(Math.random() * 3) + 3; 
                if (botCount > availableSlots) botCount = availableSlots;
                for(let i=0; i<botCount; i++) this.addBot();
            }
        }

        this.safetyInterval = setInterval(() => this.checkStuckPlayers(), 1000);
        this.botInterval = setInterval(() => this.updateBots(), 100); 
    }

    // --- SMART BOT LOGIC ---
    
    findPath(startX, startZ, targetX, targetZ) {
        const queue = [[{x: startX, z: startZ}]];
        const visited = new Set();
        visited.add(`${startX},${startZ}`);
        let iterations = 0;
        
        while (queue.length > 0 && iterations < 2000) {
            iterations++;
            const path = queue.shift();
            const curr = path[path.length - 1];

            if (curr.x === targetX && curr.z === targetZ) {
                return path.slice(1); 
            }

            const neighbors = [
                {x: curr.x+1, z: curr.z}, {x: curr.x-1, z: curr.z},
                {x: curr.x, z: curr.z+1}, {x: curr.x, z: curr.z-1}
            ];

            for (const n of neighbors) {
                if (n.x <= 0 || n.x >= this.settings.mapSize || n.z <= 0 || n.z >= this.settings.mapSize) continue;
                if (this.gameMap[n.z][n.x] === 1) continue;
                
                const key = `${n.x},${n.z}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    const newPath = [...path, n];
                    queue.push(newPath);
                }
            }
        }
        return null; 
    }

    assignBotTarget(bot) {
        const bgx = Math.floor(bot.x / this.UNIT_SIZE);
        const bgz = Math.floor(bot.z / this.UNIT_SIZE);

        let target = null;

        // 1. ITEMS (High Priority)
        if (this.activeItems.length > 0 && Math.random() > 0.4) {
            let closest = null;
            let minLen = 9999;
            for(let i=0; i<4; i++) {
                const item = this.activeItems[Math.floor(Math.random() * this.activeItems.length)];
                if(!item) continue;
                const igx = Math.floor(item.x / this.UNIT_SIZE);
                const igz = Math.floor(item.z / this.UNIT_SIZE);
                const path = this.findPath(bgx, bgz, igx, igz);
                if (path && path.length < minLen) {
                    minLen = path.length;
                    closest = path;
                }
            }
            if (closest) target = closest;
        }

        // 2. LONG DISTANCE (Attempt > 8 blocks)
        if (!target) {
            let attempts = 0;
            while (!target && attempts < 15) {
                attempts++;
                const rx = Math.floor(Math.random() * (this.settings.mapSize - 2)) + 1;
                const rz = Math.floor(Math.random() * (this.settings.mapSize - 2)) + 1;
                if (this.gameMap[rz][rx] === 1) continue;
                if (rx === bot.lastGx && rz === bot.lastGz) continue;

                const dist = Math.abs(rx - bgx) + Math.abs(rz - bgz);
                if (dist < 8) continue;

                const path = this.findPath(bgx, bgz, rx, rz);
                if (path && path.length > 5) target = path;
            }
        }

        // 3. MEDIUM DISTANCE
        if (!target) {
            let attempts = 0;
            while (!target && attempts < 15) {
                attempts++;
                const rx = Math.floor(Math.random() * (this.settings.mapSize - 2)) + 1;
                const rz = Math.floor(Math.random() * (this.settings.mapSize - 2)) + 1;
                if (this.gameMap[rz][rx] === 1) continue;
                if (rx === bot.lastGx && rz === bot.lastGz) continue;

                const dist = Math.abs(rx - bgx) + Math.abs(rz - bgz);
                if (dist < 3) continue;

                const path = this.findPath(bgx, bgz, rx, rz);
                if (path && path.length >= 2) target = path;
            }
        }

        // 4. FALLBACK
        if (!target) {
            const neighbors = [{x:bgx+1,z:bgz}, {x:bgx-1,z:bgz}, {x:bgx,z:bgz+1}, {x:bgx,z:bgz-1}];
            const valid = neighbors.filter(n => 
                this.gameMap[n.z] && 
                this.gameMap[n.z][n.x] === 0 &&
                !(n.x === bot.lastGx && n.z === bot.lastGz) 
            );
            
            if(valid.length > 0) {
                target = [valid[Math.floor(Math.random()*valid.length)]];
            } else {
                const allValid = neighbors.filter(n => this.gameMap[n.z] && this.gameMap[n.z][n.x] === 0);
                if(allValid.length > 0) target = [allValid[Math.floor(Math.random()*allValid.length)]];
            }
        }

        if (target) {
            bot.currentPath = target;
            if(bot.currentPath.length > 0) {
                const node = bot.currentPath[0];
                const wiggleX = (Math.random() - 0.5) * 0.5; 
                const wiggleZ = (Math.random() - 0.5) * 0.5;
                
                bot.targetX = (node.x * this.UNIT_SIZE) + (this.UNIT_SIZE/2) + wiggleX;
                bot.targetZ = (node.z * this.UNIT_SIZE) + (this.UNIT_SIZE/2) + wiggleZ;
                
                bot.lastGx = bgx;
                bot.lastGz = bgz;
            }
        }
    }

    addBot() {
        const botId = 'BOT_' + crypto.randomBytes(4).toString('hex');
        
        let name;
        if (Math.random() > 0.5) {
            const currentNames = Object.values(this.players).map(p => p.name);
            const availableNames = BOT_NAMES.filter(n => !currentNames.includes(n));
            name = availableNames.length > 0 ? availableNames[Math.floor(Math.random() * availableNames.length)] : this.getUniqueName("Guest");
        } else {
            name = this.getUniqueName("Guest");
        }

        const botSkins = ['default', 'beta_merch'];
        const randomSkin = botSkins[Math.floor(Math.random() * botSkins.length)];

        // SPAWN CENTER
        const center = (this.settings.mapSize * this.UNIT_SIZE) / 2;
        const sx = center;
        const sz = center;

        this.players[botId] = {
            x: sx, y: 1.6, z: sz, rotation: 0,
            playerId: botId,
            name: name,
            isBot: true,
            isTrapped: false,
            isGhost: false,
            isFlying: false,
            isAuthenticated: false,
            targetX: sx, targetZ: sz,
            moveSpeed: 60.0,
            currentPath: [],
            vy: 0, 
            lookOffset: 0,
            lastX: sx, lastZ: sz, stuckTicks: 0,
            lastGx: Math.floor(center/3), lastGz: Math.floor(center/3),
            skin: randomSkin 
        };
        
        this.assignBotTarget(this.players[botId]);
        io.to(this.id).emit('newPlayer', this.players[botId]);
        
        this.logAndBroadcast(`${name} joined the game.`, 'join');
    }

    removeBot() {
        const botIds = Object.keys(this.players).filter(id => this.players[id].isBot);
        if (botIds.length > 0) {
            const removeId = botIds[botIds.length - 1]; 
            const pName = this.players[removeId].name;
            delete this.players[removeId];
            
            io.to(this.id).emit('playerDisconnected', removeId);
            this.logAndBroadcast(`${pName} left the game.`, 'leave');
        }
    }

    checkBotCollision(x, z) {
        if (!this.gameMap) return false;
        const radius = 0.4; 
        
        const points = [
            { x: x + radius, z: z + radius },
            { x: x - radius, z: z + radius },
            { x: x + radius, z: z - radius },
            { x: x - radius, z: z - radius }
        ];

        for (const p of points) {
            const gx = Math.floor(p.x / this.UNIT_SIZE);
            const gz = Math.floor(p.z / this.UNIT_SIZE);

            if (gx < 0 || gx >= this.settings.mapSize || gz < 0 || gz >= this.settings.mapSize) return true;
            if (this.gameMap[gz][gx] === 1) return true;
        }
        return false;
    }

    updateBots() {
        if (this.state !== 'playing') return;
        if (!this.gameMap || this.gameMap.length === 0) return;

        Object.keys(this.players).forEach(id => {
            const p = this.players[id];
            if (!p.isBot || p.isTrapped) return;

            // STUCK MONITOR
            const movedDist = Math.abs(p.x - p.lastX) + Math.abs(p.z - p.lastZ);
            
            let diffX = p.targetX - p.x;
            let diffZ = p.targetZ - p.z;
            const targetAngle = Math.atan2(diffX, diffZ) + Math.PI; 
            
            let angleDiff = Math.abs(targetAngle - p.rotation);
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            angleDiff = Math.abs(angleDiff);

            if (movedDist < 0.1 && angleDiff < 0.5) {
                p.stuckTicks++;
            } else {
                p.stuckTicks = 0;
            }
            p.lastX = p.x;
            p.lastZ = p.z;

            if (p.stuckTicks > 20) { 
                const gx = Math.floor(p.x / this.UNIT_SIZE);
                const gz = Math.floor(p.z / this.UNIT_SIZE);
                
                const neighbors = [{x:gx+1,z:gz}, {x:gx-1,z:gz}, {x:gx,z:gz+1}, {x:gx,z:gz-1}];
                const valid = neighbors.filter(n => this.gameMap[n.z] && this.gameMap[n.z][n.x] === 0);
                
                if (valid.length > 0) {
                    const jumpTo = valid[Math.floor(Math.random() * valid.length)];
                    p.x = (jumpTo.x * this.UNIT_SIZE) + (this.UNIT_SIZE/2);
                    p.z = (jumpTo.z * this.UNIT_SIZE) + (this.UNIT_SIZE/2);
                } else {
                    p.x = (gx * this.UNIT_SIZE) + (this.UNIT_SIZE/2);
                    p.z = (gz * this.UNIT_SIZE) + (this.UNIT_SIZE/2);
                }

                p.currentPath = [];
                p.stuckTicks = 0;
                this.assignBotTarget(p); 
                io.to(this.id).emit('playerTeleported', { id: id, x: p.x, y: p.y, z: p.z, reason: 'stuck' });
                return;
            }

            // DYNAMIC OBSTACLE CHECK
            const targetGx = Math.floor(p.targetX / this.UNIT_SIZE);
            const targetGz = Math.floor(p.targetZ / this.UNIT_SIZE);
            if (targetGx > 0 && targetGx < this.settings.mapSize && targetGz > 0 && targetGz < this.settings.mapSize) {
                if (this.gameMap[targetGz][targetGx] === 1) {
                    p.x = Math.round(p.x / this.UNIT_SIZE) * this.UNIT_SIZE + (this.UNIT_SIZE/2);
                    p.z = Math.round(p.z / this.UNIT_SIZE) * this.UNIT_SIZE + (this.UNIT_SIZE/2);
                    p.targetX = p.x;
                    p.targetZ = p.z;
                    p.currentPath = [];
                    this.assignBotTarget(p);
                    return; 
                }
            }

            // ITEM CHECK
            for (let i = this.activeItems.length - 1; i >= 0; i--) {
                const item = this.activeItems[i];
                const distToItem = Math.sqrt(Math.pow(item.x - p.x, 2) + Math.pow(item.z - p.z, 2));
                if (distToItem < 1.5) {
                    this.handleItemCollection(item.id, id);
                }
            }

            // TRAP CHECK
            for (let i = this.placedTraps.length - 1; i >= 0; i--) {
                const trap = this.placedTraps[i];
                const distToTrap = Math.sqrt(Math.pow(trap.x - p.x, 2) + Math.pow(trap.z - p.z, 2));
                if (distToTrap < 1.0) {
                    this.handleTrapTrigger(trap.id, id); 
                    return;
                }
            }

            // PHYSICS
            const GRAVITY = 30.0;
            const JUMP_FORCE = 12.0;
            const delta = 0.1;

            if (p.y <= 1.6 && Math.random() < 0.02) {
                p.vy = JUMP_FORCE; 
            }
            
            p.vy -= GRAVITY * delta; 
            p.y += p.vy * delta;
            if (p.y < 1.6) {
                p.y = 1.6;
                p.vy = 0;
            }

            // ROTATION & MOVEMENT
            let dist = Math.sqrt(diffX*diffX + diffZ*diffZ); 

            if (dist < 0.4) {
                if (p.currentPath.length > 0) p.currentPath.shift();

                if (p.currentPath.length > 0) {
                    const node = p.currentPath[0];
                    const wiggleX = (Math.random() - 0.5) * 0.5;
                    const wiggleZ = (Math.random() - 0.5) * 0.5;
                    
                    p.targetX = (node.x * this.UNIT_SIZE) + (this.UNIT_SIZE/2) + wiggleX;
                    p.targetZ = (node.z * this.UNIT_SIZE) + (this.UNIT_SIZE/2) + wiggleZ;
                } else {
                    this.assignBotTarget(p);
                }
                
                diffX = p.targetX - p.x;
                diffZ = p.targetZ - p.z;
                dist = Math.sqrt(diffX*diffX + diffZ*diffZ);
            }

            if (dist > 0.1) {
                const newTargetAngle = Math.atan2(diffX, diffZ) + Math.PI; 
                
                if(Math.random() < 0.1) p.lookOffset = (Math.random() - 0.5) * 0.5;
                
                const rotSpeed = 0.2 + Math.random() * 0.3;
                p.rotation = lerpAngle(p.rotation, newTargetAngle + p.lookOffset, rotSpeed);

                let moveDist = (p.moveSpeed * delta * 0.1); 

                let currentAngleDiff = Math.abs(newTargetAngle - p.rotation);
                while (currentAngleDiff > Math.PI) currentAngleDiff -= Math.PI * 2;
                while (currentAngleDiff < -Math.PI) currentAngleDiff += Math.PI * 2;
                currentAngleDiff = Math.abs(currentAngleDiff);

                if (currentAngleDiff > 0.8) { 
                    moveDist *= 0.1; 
                }

                const forwardX = -Math.sin(p.rotation);
                const forwardZ = -Math.cos(p.rotation);

                if (!this.checkBotCollision(p.x + (forwardX * moveDist), p.z)) {
                    p.x += forwardX * moveDist;
                }
                if (!this.checkBotCollision(p.x, p.z + (forwardZ * moveDist))) {
                    p.z += forwardZ * moveDist;
                }

                io.to(this.id).emit('playerMoved', p);
            }
        });
    }

    // --- SHARED ITEM LOGIC ---
    handleItemCollection(itemId, playerId) {
        const idx = this.activeItems.findIndex(i => i.id === itemId);
        if (idx === -1) return;

        const player = this.players[playerId];
        if (!player) return;

        const type = this.activeItems[idx].type;
        const pName = player.name;
        
        this.activeItems.splice(idx, 1);
        io.to(this.id).emit('itemRemoved', itemId);

        const sock = io.sockets.sockets.get(playerId);

        if (type === 'orb') { 
            if (sock) sock.to(this.id).emit('darknessTriggered');
            else io.to(this.id).emit('darknessTriggered');
            this.logAndBroadcast(`${pName} used Dark Orb!`, 'system'); 
        }
        else if (type === 'hindered') { 
            if (sock) sock.to(this.id).emit('controlsInverted');
            else io.to(this.id).emit('controlsInverted');
            this.logAndBroadcast(`${pName} used Hinder Potion!`, 'system'); 
        }
        else if (type === 'scrambler') { 
            if (sock) sock.to(this.id).emit('radarScrambled');
            else io.to(this.id).emit('radarScrambled');
            this.logAndBroadcast(`${pName} scrambled the radar!`, 'system'); 
        }
        else if (type === 'swap') {
            const others = Object.keys(this.players).filter(pid => pid !== playerId);
            if (others.length) {
                const targetId = others[Math.floor(Math.random()*others.length)];
                const targetName = this.players[targetId].name;
                const p1 = this.players[playerId], p2 = this.players[targetId];
                const tmp = {x:p1.x, y:p1.y, z:p1.z};
                p1.x = p2.x; p1.y = p2.y; p1.z = p2.z; p2.x = tmp.x; p2.y = tmp.y; p2.z = tmp.z;
                
                if(p1.isBot) { p1.targetX = p1.x; p1.targetZ = p1.z; p1.currentPath = []; }
                if(p2.isBot) { p2.targetX = p2.x; p2.targetZ = p2.z; p2.currentPath = []; }

                io.to(this.id).emit('playerTeleported', {id: playerId, x:p1.x, y:p1.y, z:p1.z, reason: 'swap'});
                io.to(this.id).emit('playerTeleported', {id: targetId, x:p2.x, y:p2.y, z:p2.z, reason: 'swap'});
                this.logAndBroadcast(`${pName} swapped with ${targetName}!`, 'system');
            }
        }

        if (player.isBot) {
            const gx = Math.floor(player.x / this.UNIT_SIZE);
            const gz = Math.floor(player.z / this.UNIT_SIZE);

            if (type === 'brick') {
                const neighbors = [{x:gx+1,z:gz}, {x:gx-1,z:gz}, {x:gx,z:gz+1}, {x:gx,z:gz-1}];
                const valid = neighbors.filter(n => this.gameMap[n.z] && this.gameMap[n.z][n.x] === 0);
                if(valid.length > 0) {
                    const spot = valid[Math.floor(Math.random()*valid.length)];
                    this.placeWall(spot.x, spot.z);
                }
            }
            else if (type === 'trap') {
                this.placeTrap(player.x, player.z, playerId);
            }
            else if (type === 'pepper') {
                player.isGhost = true;
                io.to(this.id).emit('toggleGhost', true);
                setTimeout(() => { 
                    if(this.players[playerId]) this.players[playerId].isGhost = false; 
                }, 3000);
            }
        }
    }

    // --- SHARED TRAP LOGIC ---
    handleTrapTrigger(trapId, playerId) {
        const idx = this.placedTraps.findIndex(t => t.id === trapId);
        if(idx !== -1) {
            io.to(this.id).emit('removeTrap', trapId);
            this.placedTraps.splice(idx, 1);

            if(this.players[playerId]) {
                const player = this.players[playerId];
                player.isTrapped = true;
                player.vy = 0; 

                if(player.isBot) {
                    player.currentPath = [];
                    player.targetX = player.x;
                    player.targetZ = player.z;
                }

                io.to(this.id).emit('playerTrapped', playerId);

                setTimeout(()=>{
                    if(this.players[playerId]) {
                        this.players[playerId].isTrapped = false;
                        io.to(this.id).emit('playerUntrapped', playerId);
                        if(this.players[playerId].isBot) {
                            this.assignBotTarget(this.players[playerId]);
                        }
                    }
                }, 10000);
            }
        }
    }

    placeWall(x, z) {
        if(x > 0 && x < this.settings.mapSize && z > 0 && z < this.settings.mapSize) {
            let safe = true;
            Object.values(this.players).forEach(p => {
                const px = Math.floor(p.x / this.UNIT_SIZE);
                const pz = Math.floor(p.z / this.UNIT_SIZE);
                if (px === x && pz === z) safe = false;
            });

            if(safe) {
                this.gameMap[z][x] = 1;
                io.to(this.id).emit('wallPlaced', {x, z});
                setTimeout(() => { if(this.gameMap[z]) this.gameMap[z][x]=0; }, 10000);
            }
        }
    }

    placeTrap(x, z, ownerId) {
        const id = `${ownerId}_${Date.now()}`;
        this.placedTraps.push({ mesh: null, id: id, x: x, z: z }); 
        io.to(this.id).emit('trapPlaced', {x, z, id});
    }

    getHumanCount() {
        return Object.values(this.players).filter(p => !p.isBot).length;
    }

    getBotCount() {
        return Object.values(this.players).filter(p => p.isBot).length;
    }

    checkStuckPlayers() {
        if (!this.gameMap || this.gameMap.length === 0) return;

        Object.keys(this.players).forEach(id => {
            const p = this.players[id];
            if (p.isGhost || p.isFlying || p.isBot) return; 

            const gx = Math.floor(p.x / this.UNIT_SIZE);
            const gz = Math.floor(p.z / this.UNIT_SIZE);

            if (gx < 0 || gx >= this.settings.mapSize || gz < 0 || gz >= this.settings.mapSize) return;

            if (this.gameMap[gz][gx] === 1) {
                this.findSafeSpotAndTeleport(id, gx, gz);
            }
        });
    }

    forceUnstuckPlayer(id) {
        const p = this.players[id];
        if (!p) return;

        const gx = Math.floor(p.x / this.UNIT_SIZE);
        const gz = Math.floor(p.z / this.UNIT_SIZE);

        if (gx < 0 || gx >= this.settings.mapSize || gz < 0 || gz >= this.settings.mapSize) {
            this.doTeleport(id, 4.5, 4.5); 
            return;
        }

        if (this.gameMap[gz][gx] === 0) {
            const centerX = (gx * this.UNIT_SIZE) + (this.UNIT_SIZE / 2);
            const centerZ = (gz * this.UNIT_SIZE) + (this.UNIT_SIZE / 2);
            this.doTeleport(id, centerX, centerZ);
        } else {
            this.findSafeSpotAndTeleport(id, gx, gz);
        }
    }

    findSafeSpotAndTeleport(id, gx, gz) {
        const neighbors = [
            {x: gx+1, z: gz}, {x: gx-1, z: gz}, 
            {x: gx, z: gz+1}, {x: gx, z: gz-1},
            {x: gx+1, z: gz+1}, {x: gx-1, z: gz-1}, {x: gx+1, z: gz-1}, {x: gx-1, z: gz+1}
        ];

        let safeSpot = null;
        for (const n of neighbors) {
            if (n.x > 0 && n.x < this.settings.mapSize && n.z > 0 && n.z < this.settings.mapSize) {
                if (this.gameMap[n.z][n.x] === 0) {
                    safeSpot = n;
                    break;
                }
            }
        }

        if (safeSpot) {
            const newX = (safeSpot.x * this.UNIT_SIZE) + (this.UNIT_SIZE / 2);
            const newZ = (safeSpot.z * this.UNIT_SIZE) + (this.UNIT_SIZE / 2);
            this.doTeleport(id, newX, newZ);
        } else {
            this.doTeleport(id, 4.5, 4.5);
        }
    }

    doTeleport(id, x, z) {
        if(this.players[id]) {
            this.players[id].x = x;
            this.players[id].z = z;
            io.to(this.id).emit('playerTeleported', { 
                id: id, x: x, y: this.players[id].y, z: z, reason: 'unstuck' 
            });
        }
    }

    getPlayerCount() { return Object.keys(this.players).length; }
    hasSpace() { return this.getPlayerCount() < this.settings.maxPlayers; }

    getUniqueName(baseName, excludeSocketId = null) {
        let newName = baseName;
        let counter = 1;
        const currentNames = Object.values(this.players)
            .filter(p => p.playerId !== excludeSocketId)
            .map(p => p.name);

        while (currentNames.includes(newName)) {
            newName = `${baseName} ${counter}`;
            counter++;
        }
        return newName;
    }

    addPlayer(socket, userData) {
        if (!this.hostId) this.hostId = socket.id;

        // BOT LOGIC: If bots exist, remove one to make room
        if (this.getBotCount() > 0) {
            this.removeBot();
        }

        let pName = userData.name || "Guest";
        const isAuth = userData.isAuthenticated || false;

        let pSkin = 'default';
        if (userData.equippedSkin) pSkin = userData.equippedSkin;

        if (isAuth) {
            const squatterId = Object.keys(this.players).find(id => 
                this.players[id].name === pName && !this.players[id].isAuthenticated
            );

            if (squatterId) {
                const oldName = this.players[squatterId].name;
                const newGuestName = this.getUniqueName(oldName, null); 
                this.players[squatterId].name = newGuestName;
                io.to(this.id).emit('updatePlayerName', { id: squatterId, name: newGuestName });
                this.broadcastSystemMessage(`${oldName} was renamed to ${newGuestName} (Reserved Name).`, 'system');
            }
        }

        pName = this.getUniqueName(pName, socket.id);
        
        // --- SPAWN CENTER CALCULATION ---
        const center = (this.settings.mapSize * this.UNIT_SIZE) / 2;

        this.players[socket.id] = {
            x: center, y: 1.6, z: center, rotation: 0,
            playerId: socket.id,
            name: pName,
            isTrapped: false,
            isGhost: false,
            isFlying: false,
            isAuthenticated: isAuth,
            isBot: false,
            dbId: userData.dbId || null,
            skin: pSkin
        };

        socket.emit('initialGameState', {
            map: this.gameMap,
            items: this.activeItems,
            players: this.players,
            myId: socket.id,
            lobbyId: this.id,
            exit: this.exitConfig,
            maxPlayers: this.settings.maxPlayers,
            timeLeft: this.timeLeft,
            roundState: this.state,
            hostId: this.hostId,
            settings: userData.settings || { fov: 75, renderDist: 60 } 
        });

        socket.to(this.id).emit('newPlayer', this.players[socket.id]);
        this.logAndBroadcast(`${pName} joined the game.`, 'join');

        if (this.settings.preRoundTime > 0 && this.state === 'waiting' && this.getPlayerCount() >= 2) {
            this.startPreRound();
        } else if (this.settings.preRoundTime === 0 && this.state === 'waiting') {
            this.state = 'manual';
            io.to(this.id).emit('roundState', { state: 'manual' });
        }
    }

    removePlayer(socketId) {
        const p = this.players[socketId];
        if(!p) return;
        const pName = p.name;
        delete this.players[socketId];
        
        io.to(this.id).emit('playerDisconnected', socketId);
        this.logAndBroadcast(`${pName} left the game.`, 'leave');

        // BOT LOGIC: If room has humans left but < 5 bots, add one back
        if (!this.isPrivate) {
             // 1. Calculate Active Bot Lobbies
             let lobbiesWithBots = 0;
             // NOTE: 'lobbies' map is defined below, but accessible here due to scope
             if (typeof lobbies !== 'undefined') {
                 lobbies.forEach(l => {
                     if (l.id !== this.id && l.getBotCount() > 0) lobbiesWithBots++;
                 });
             }

             // If this lobby already has bots, we can refill it.
             // If this lobby has 0 bots, we only add if total bot lobbies < 2.
             const canAddBot = (this.getBotCount() > 0) || (lobbiesWithBots < 2);

             if (canAddBot && this.getHumanCount() > 0 && this.getBotCount() < 5) {
                 this.addBot();
             }
        }

        if (socketId === this.hostId) {
            const remainingIds = Object.keys(this.players).filter(id => !this.players[id].isBot);
            if (remainingIds.length > 0) {
                this.hostId = remainingIds[Math.floor(Math.random() * remainingIds.length)];
                io.to(this.id).emit('hostAssigned', this.hostId);
                const newHostName = this.players[this.hostId].name;
                this.logAndBroadcast(`${newHostName} is now the Host.`, 'system');
            } else {
                this.hostId = null;
            }
        }
        
        // FIX: REMOVED ZOMBIE DESTRUCTION HERE
        // Destruction is now handled in leaveCurrentLobby to prevent double logs
    }

    logAndBroadcast(text, type='system', senderName=null, senderId=null) {
        const timestamp = new Date().toLocaleTimeString();
        let logEntry = `[${timestamp}] `;
        if (senderName) logEntry += `${senderName}: ${text}`;
        else logEntry += `[${type.toUpperCase()}] ${text}`;
        
        this.chatHistory.push(logEntry);
        if (this.chatHistory.length > 50) this.chatHistory.shift(); 

        io.to(this.id).emit('chatMessage', { 
            type: type, 
            text: text, 
            name: senderName, 
            id: senderId 
        }); 
    }

    broadcastSystemMessage(text, type='system') {
        io.to(this.id).emit('chatMessage', { type: type, text: text });
    }

    // --- MAZE & LOGIC ---
    generateMaze(size) {
        if (size % 2 === 0) size++;
        const m = [];
        for (let i = 0; i < size; i++) m.push(new Array(size).fill(1));
        
        // --- 1. GENERATE MAZE FIRST ---
        // Start at a guaranteed valid spot (e.g., 1,1) to ensure the whole grid is filled
        const stack = [[1, 1]]; 
        m[1][1] = 0; 
        const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];

        while (stack.length) {
            const [x, z] = stack[stack.length - 1];
            const neighbors = [];
            for (const d of dirs) {
                const nx = x + d[0], nz = z + d[1];
                if (nx > 0 && nx < size - 1 && nz > 0 && nz < size - 1 && m[nz][nx] === 1) {
                    neighbors.push({ x: nx, z: nz, dx: d[0], dz: d[1] });
                }
            }
            if (neighbors.length > 0) {
                const next = neighbors[Math.floor(Math.random() * neighbors.length)];
                m[z + next.dz / 2][x + next.dx / 2] = 0; m[next.z][next.x] = 0;
                stack.push([next.x, next.z]);
            } else stack.pop();
        }
        
        // Random loops to reduce dead ends
        for (let z = 2; z < size - 2; z++) {
            for (let x = 2; x < size - 2; x++) {
                if (m[z][x] === 1) {
                    const v = (m[z-1][x] === 0 && m[z+1][x] === 0);
                    const h = (m[z][x-1] === 0 && m[z][x+1] === 0);
                    if ((v || h) && Math.random() < 0.10) m[z][x] = 0;
                }
            }
        }

        // --- 2. CARVE CENTER HUB (3x3) ---
        // Range -1 to 1 (3 tiles total: -1, 0, 1)
        const cx = Math.floor(size / 2);
        const cz = Math.floor(size / 2);
        
        for (let z = -1; z <= 1; z++) {
            for (let x = -1; x <= 1; x++) {
                if(cx+x > 0 && cx+x < size-1 && cz+z > 0 && cz+z < size-1) {
                    m[cz+z][cx+x] = 0; 
                }
            }
        }

        // --- 3. RANDOM EXIT ON ANY EDGE ---
        const sides = ['north', 'south', 'east', 'west'];
        const side = sides[Math.floor(Math.random() * sides.length)];
        
        let exitX, exitZ;
        const randEdge = () => {
             let r = Math.floor(Math.random() * (size - 4)) + 2; 
             if(r % 2 === 0) r++;
             return r;
        };

        if (side === 'north') {
            exitX = randEdge(); exitZ = 0; 
            m[1][exitX] = 0; m[0][exitX] = 0;
        } else if (side === 'south') {
            exitX = randEdge(); exitZ = size - 1;
            m[size-2][exitX] = 0; m[size-1][exitX] = 0;
        } else if (side === 'east') {
            exitX = size - 1; exitZ = randEdge();
            m[exitZ][size-2] = 0; m[exitZ][size-1] = 0;
        } else if (side === 'west') {
            exitX = 0; exitZ = randEdge();
            m[exitZ][1] = 0; m[exitZ][0] = 0;
        }

        return { map: m, exit: { x: exitX, z: exitZ, side: side } };
    }

    calculateDistanceMap(map, size, exitX, exitZ) {
        const dist = []; for(let i=0; i<size; i++) dist.push(new Array(size).fill(-1));
        const q = [{x: exitX, z: exitZ, val: 0}]; dist[exitZ][exitX] = 0;
        const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
        while(q.length > 0) {
            const c = q.shift();
            for(const d of dirs) {
                const nx = c.x + d[0], nz = c.z + d[1];
                if(nx >= 0 && nx < size && nz >= 0 && nz < size && map[nz][nx] === 0 && dist[nz][nx] === -1) {
                    dist[nz][nx] = c.val + 1; q.push({x: nx, z: nz, val: c.val + 1});
                }
            }
        }
        return dist;
    }

    getSpacedItemLocation() {
        let valid = false, attempts = 0, gx, gz, x, z;
        while (!valid && attempts < 50) {
            attempts++;
            gx = Math.floor(Math.random() * (this.settings.mapSize - 2)) + 1;
            gz = Math.floor(Math.random() * (this.settings.mapSize - 2)) + 1;
            if (this.gameMap[gz][gx] === 1) continue;
            x = (gx * this.UNIT_SIZE) + (this.UNIT_SIZE / 2);
            z = (gz * this.UNIT_SIZE) + (this.UNIT_SIZE / 2);
            let tooClose = false;
            for (const item of this.activeItems) {
                if (Math.sqrt(Math.pow(item.x - x, 2) + Math.pow(item.z - z, 2)) < this.MIN_ITEM_DIST) { tooClose = true; break; }
            }
            if (!tooClose) valid = true;
        }
        return { x, z };
    }

    setupMap() {
        const generated = this.generateMaze(this.settings.mapSize);
        this.gameMap = generated.map;
        this.exitConfig = generated.exit;
        this.distanceMap = this.calculateDistanceMap(this.gameMap, this.settings.mapSize, this.exitConfig.x, this.exitConfig.z);
        this.activeItems = [];
        this.placedTraps = [];

        let idCounter = 0;
        
        // --- ITEM QTY FIX: USE EXACT NUMBER FROM HOST ---
        // settings.allowedItems is now { boot: 5, brick: 10 ... }
        const spawnBatch = (type) => {
            const qty = this.settings.allowedItems[type] || 0; 
            if (qty <= 0) return;
            
            // Safety cap if someone bypassed validation
            const safeQty = Math.min(qty, 20); // CHANGED 50 to 20

            for(let i=0; i<safeQty; i++) {
                const loc = this.getSpacedItemLocation();
                this.activeItems.push({ id: idCounter++, type: type, x: loc.x, z: loc.z });
            }
        };

        // If public lobby, use defaults. If private, use host settings.
        if (!this.settings.allowedItems.boot && typeof this.settings.allowedItems.boot !== 'number') {
            // BACKWARDS COMPATIBILITY / PUBLIC LOBBY DEFAULTS
            const scale = this.settings.mapSize / 61;
            const count = Math.ceil(5 * scale);
            const defaultQty = {
                boot: count, brick: count, swap: count, trap: count, pepper: count,
                orb: Math.ceil(3*scale), hindered: Math.ceil(3*scale), scrambler: Math.ceil(3*scale)
            };
            this.settings.allowedItems = defaultQty;
        }

        Object.keys(this.settings.allowedItems).forEach(key => spawnBatch(key));
    }

    startNewRound() {
        // --- FIX: CLEAR PENDING AUTO-RESTART TIMER ---
        if(this.nextRoundTimeout) clearTimeout(this.nextRoundTimeout);
        this.nextRoundTimeout = null;

        if(this.timerInterval) clearInterval(this.timerInterval);
        this.setupMap();
        
        const center = (this.settings.mapSize * this.UNIT_SIZE) / 2;

        Object.keys(this.players).forEach(id => {
            this.players[id].x = center; this.players[id].y = 1.6; 
            this.players[id].z = center; this.players[id].rotation = 0; 
            this.players[id].isTrapped = false;
            this.players[id].isGhost = false;
            // Reset Bot Targets
            if(this.players[id].isBot) {
                this.players[id].targetX = center;
                this.players[id].targetZ = center;
                this.players[id].currentPath = [];
                this.assignBotTarget(this.players[id]); 
            }
            
            // FIX: Force visual reset immediately
            io.to(this.id).emit('playerTeleported', { 
                id: id, x: center, y: 1.6, z: center, reason: 'reset' 
            });
        });

        if (this.settings.preRoundTime === 0) {
            this.state = 'manual';
            io.to(this.id).emit('newRound', { map: this.gameMap, items: this.activeItems, players: this.players, exit: this.exitConfig });
            io.to(this.id).emit('roundState', { state: 'manual' });
        } 
        else if (this.getPlayerCount() >= 2) {
            this.startPreRound();
        } 
        else {
            this.state = 'waiting';
            io.to(this.id).emit('newRound', { map: this.gameMap, items: this.activeItems, players: this.players, exit: this.exitConfig });
            io.to(this.id).emit('roundState', { state: 'waiting' });
        }
    }

    startPreRound() {
        this.state = 'preround';
        this.timeLeft = this.settings.preRoundTime;
        io.to(this.id).emit('newRound', { map: this.gameMap, items: this.activeItems, players: this.players, exit: this.exitConfig });
        io.to(this.id).emit('roundState', { state: 'preround', duration: this.timeLeft });

        if(this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            if(this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.startGame();
            }
        }, 1000);
    }

    startGame() {
        this.state = 'playing';
        this.isRoundActive = true;
        this.timeLeft = this.settings.gameTime;
        io.to(this.id).emit('roundState', { state: 'playing', duration: this.timeLeft });

        if (this.timeLeft > 0) {
            this.timerInterval = setInterval(() => {
                this.timeLeft--;
                if (this.timeLeft <= 0) {
                    this.handleTimeout();
                }
            }, 1000);
        }
    }

    handleTimeout() {
        clearInterval(this.timerInterval);
        this.isRoundActive = false;
        
        // 1. Collect all valid human distances
        let results = [];
        Object.keys(this.players).forEach(pid => {
            const p = this.players[pid];
            if (p.isBot) return;

            const gx = Math.floor(p.x / this.UNIT_SIZE);
            const gz = Math.floor(p.z / this.UNIT_SIZE);
            
            // Check bounds
            if (gx >= 0 && gx < this.settings.mapSize && gz >= 0 && gz < this.settings.mapSize) {
                const d = this.distanceMap[gz][gx];
                if (d !== -1) {
                    results.push({ id: pid, dist: d });
                }
            }
        });

        // 2. Sort by distance
        results.sort((a, b) => a.dist - b.dist);

        // 3. Determine winners (allow ties)
        let winners = [];
        let winningDist = 0;

        if (results.length > 0) {
            winningDist = results[0].dist;
            // Get everyone who matches the best distance
            winners = results.filter(r => r.dist === winningDist).map(r => r.id);
        }

        this.endRound(winners, winningDist);
    }

    endRound(winnerIds, winningDistance = 0) {
        incrementGlobalStat('totalGamesPlayed');

        if(this.timerInterval) clearInterval(this.timerInterval);
        this.state = 'ended';
        this.isRoundActive = false;

        const leaderboard = [];
        Object.keys(this.players).forEach(pid => {
            const p = this.players[pid];
            const gx = Math.floor(p.x / this.UNIT_SIZE);
            const gz = Math.floor(p.z / this.UNIT_SIZE);
            let dist = 9999;
            if (gx >= 0 && gx < this.settings.mapSize && gz >= 0 && gz < this.settings.mapSize) {
                const val = this.distanceMap[gz][gx];
                if (val !== -1) dist = val;
            }
            if (winnerIds.includes(pid)) dist = (winningDistance > 0 ? winningDistance : 0);
            leaderboard.push({ name: p.name, distance: dist, id: pid });
        });
        leaderboard.sort((a, b) => a.distance - b.distance);

        winnerIds.forEach(wid => {
            const sock = io.sockets.sockets.get(wid);
            if(sock && sock.data.isAuthenticated && sock.data.dbId) {
                 User.findByIdAndUpdate(sock.data.dbId, { $inc: { wins: 1, coins: 50 } }, { new: true })
                    .then(u => {
                        if (u) {
                            sock.emit('statsUpdate', { coins: u.coins, wins: u.wins, gamesPlayed: u.gamesPlayed });
                            // Check for Blueprint skin unlock
                            if (u.gamesPlayed >= 50 && !u.skins.includes('blueprint')) {
                                u.skins.push('blueprint');
                                u.save();
                                sock.emit('skinUnlocked', 'blueprint');
                                sock.emit('chatMessage', { type: 'system', text: 'You unlocked the "Blueprint" Skin!' });
                            }
                        }
                    });
            }
        });

        io.to(this.id).emit('roundOver', { 
            winnerId: winnerIds.length === 1 ? winnerIds[0] : null,
            winners: winnerIds, 
            leaderboard, 
            nextRoundIn: 15 
        });

        // --- FIX: SAVE TIMEOUT ID SO WE CAN CANCEL IT ON MANUAL RESTART ---
        this.nextRoundTimeout = setTimeout(() => {
            if (this.settings.preRoundTime === 0) this.startNewRound();
            else this.startNewRound();
        }, 15000);
    }
}

// ==========================================
// GLOBAL STATE & SOCKET
// ==========================================
const lobbies = new Map(); 
const socketToLobby = new Map(); 

function createLobby(settings, isPrivate) {
    const id = crypto.randomBytes(3).toString('hex').toUpperCase();
    const lobby = new GameLobby(id, settings, isPrivate);
    lobbies.set(id, lobby);
    console.log(`Created Lobby: ${id} (Private: ${isPrivate})`);
    return lobby;
}

io.on('connection', (socket) => {
    incrementGlobalStat('totalConnections');
    
    // DEFAULT DATA (Initialize with default skin)
    socket.data = { name: "Guest", isAuthenticated: false, dbId: null, equippedSkin: 'default' };

    // --- AUTH ---
    socket.on('signup', async ({ username, password }) => {
        try {
            const existing = await User.findOne({ username });
            if (existing) return socket.emit('authError', 'Username exists');
            const hashed = await bcrypt.hash(password, 10);
            const token = crypto.randomBytes(32).toString('hex');
            
            // --- NEW: GIVE BETA SKIN ON SIGNUP ---
            const newUser = new User({ 
                username, 
                password: hashed, 
                sessionToken: token,
                skins: ['default'], // CHANGED: 'beta_merch' REMOVED to force unlock in shop
                equippedSkin: 'default',
                settings: { fov: 75, renderDist: 60 } // NEW
            });
            await newUser.save();
            
            socket.data.name = newUser.username; 
            socket.data.isAuthenticated = true; 
            socket.data.dbId = newUser._id;
            socket.data.equippedSkin = newUser.equippedSkin; // Load Skin

            socket.emit('authSuccess', { 
                username: newUser.username, 
                coins: 0, 
                stats: { wins: 0, gamesPlayed: 0 }, 
                token, 
                skins: newUser.skins, 
                equippedSkin: newUser.equippedSkin,
                settings: newUser.settings // Send Settings
            });
        } catch (e) { socket.emit('authError', 'Server Error'); }
    });

    socket.on('login', async ({ username, password }) => {
        try {
            const user = await User.findOne({ username });
            if (!user) return socket.emit('authError', 'Invalid credentials');
            if (user.isBanned) return socket.emit('authError', 'Account Suspended');
            if (!(await bcrypt.compare(password, user.password))) return socket.emit('authError', 'Invalid credentials');
            
            const token = crypto.randomBytes(32).toString('hex');
            user.sessionToken = token; await user.save();
            
            socket.data.name = user.username; 
            socket.data.isAuthenticated = true; 
            socket.data.dbId = user._id;
            socket.data.equippedSkin = user.equippedSkin; // Load Skin

            socket.emit('authSuccess', { 
                username: user.username, 
                coins: user.coins, 
                stats: { wins: user.wins, gamesPlayed: user.gamesPlayed }, 
                token, 
                skins: user.skins, 
                equippedSkin: user.equippedSkin,
                settings: user.settings // Send Settings
            });
        } catch (e) { socket.emit('authError', 'Login Failed'); }
    });

    socket.on('verifySession', async (token) => {
        try {
            const user = await User.findOne({ sessionToken: token });
            if (user && !user.isBanned) {
                socket.data.name = user.username; 
                socket.data.isAuthenticated = true; 
                socket.data.dbId = user._id;
                socket.data.equippedSkin = user.equippedSkin; // Load Skin

                socket.emit('authSuccess', { 
                    username: user.username, 
                    coins: user.coins, 
                    stats: { wins: user.wins, gamesPlayed: user.gamesPlayed }, 
                    token, 
                    skins: user.skins, 
                    equippedSkin: user.equippedSkin,
                    settings: user.settings // Send Settings
                });
            }
        } catch (e) { console.error(e); }
    });

    // --- SETTINGS SAVE LOGIC ---
    socket.on('saveSettings', async (settings) => {
        if (!socket.data.isAuthenticated || !socket.data.dbId) return;
        try {
            await User.findByIdAndUpdate(socket.data.dbId, { settings: settings });
        } catch (e) { console.error(e); }
    });

    // --- SKIN UNLOCK LOGIC ---
    socket.on('buySkin', async (skinId) => {
        if(!socket.data.isAuthenticated || !socket.data.dbId) return;
        
        try {
            const user = await User.findById(socket.data.dbId);
            if(!user) return;

            // Check Requirements
            let canBuy = false;
            if (skinId === 'blueprint') {
                if (user.gamesPlayed >= 50) canBuy = true;
            } else if (skinId === 'beta_merch') {
                // Free for now
                canBuy = true; 
            }

            if (canBuy && !user.skins.includes(skinId)) {
                user.skins.push(skinId);
                await user.save();
                socket.emit('skinUnlocked', skinId); // Notify Client
                socket.emit('chatMessage', { type: 'system', text: `Unlocked skin: ${skinId}!` });
            }
        } catch(e) { console.error(e); }
    });

    socket.on('equipSkin', async (skinId) => {
        if(!socket.data.isAuthenticated || !socket.data.dbId) return;
        
        try {
            const user = await User.findById(socket.data.dbId);
            if(user && user.skins.includes(skinId)) {
                user.equippedSkin = skinId;
                await user.save();
                socket.data.equippedSkin = skinId;
                socket.emit('skinEquipped', skinId);
            }
        } catch(e) { console.error(e); }
    });

    socket.on('deleteAccount', async () => {
        if(socket.data.isAuthenticated && socket.data.dbId) {
            await User.findByIdAndDelete(socket.data.dbId);
            socket.data.isAuthenticated = false; socket.data.name = "Guest"; socket.data.dbId = null;
            socket.emit('accountDeleted');
        }
    });

    // --- PROFILE MANAGEMENT ---
    socket.on('changePassword', async ({ oldPassword, newPassword }) => {
        if (!socket.data.isAuthenticated || !socket.data.dbId) return;
        
        try {
            const user = await User.findById(socket.data.dbId);
            if (!user) return socket.emit('authError', 'User not found.');

            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) return socket.emit('authError', 'Current password incorrect.');

            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();
            
            socket.emit('profileUpdateSuccess', 'Password changed successfully!');
        } catch (e) {
            console.error(e);
            socket.emit('authError', 'Failed to update password.');
        }
    });

    // ==============================
    // ADMIN DASHBOARD LOGIC
    // ==============================
    socket.on('reqAdminData', async () => {
        if (!socket.data.isAuthenticated || socket.data.name !== '11CHASE11') {
            return socket.emit('adminError', 'ACCESS DENIED: You are not 11CHASE11.');
        }

        try {
            const totalUsers = await User.countDocuments({});
            const globalStats = await GlobalStats.findOne({ id: 'global' }) || {};
            
            const playerReports = await Report.find({ category: { $ne: 'BUG' } }).sort({ timestamp: -1 }).limit(20);
            const bugReports = await Report.find({ category: 'BUG' }).sort({ timestamp: -1 }).limit(20);

            // --- NEW: LOBBY DATA ---
            const activeLobbies = [];
            lobbies.forEach(l => {
                const playerList = Object.values(l.players).map(p => ({
                    name: p.name,
                    isBot: p.isBot,
                    id: p.playerId
                }));
                activeLobbies.push({
                    id: l.id,
                    private: l.isPrivate,
                    count: l.getPlayerCount(),
                    max: l.settings.maxPlayers,
                    players: playerList
                });
            });

            socket.emit('resAdminData', {
                stats: { 
                    users: totalUsers, 
                    connections: globalStats.totalConnections || 0,
                    games: globalStats.totalGamesPlayed || 0,
                    lobbies: globalStats.lobbiesCreated || { public: { type: Number, default: 0 }, private: { type: Number, default: 0 } }
                },
                reports: playerReports,
                bugs: bugReports,
                lobbies: activeLobbies
            });
        } catch (e) {
            console.error(e);
            socket.emit('adminError', 'Database Error');
        }
    });

    socket.on('adminBanUser', async (targetName) => {
        if (socket.data.name !== '11CHASE11') return;
        try {
            const user = await User.findOneAndUpdate({ username: targetName }, { isBanned: true });
            if (user) {
                socket.emit('adminActionSuccess', `Banned user: ${targetName}`);
            } else {
                socket.emit('adminError', 'User not found');
            }
        } catch (e) { socket.emit('adminError', 'Ban failed'); }
    });

    socket.on('adminDeleteReport', async (reportId) => {
        if (socket.data.name !== '11CHASE11') return;
        await Report.findByIdAndDelete(reportId);
        socket.emit('adminActionSuccess', 'Report deleted');
    });

    // --- STATE TOGGLES (Secure Unstuck) ---
    socket.on('toggleGhost', (state) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if(lobby && lobby.players[socket.id]) {
            lobby.players[socket.id].isGhost = state;
        }
    });

    socket.on('toggleFly', (state) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if(lobby && lobby.players[socket.id]) {
            lobby.players[socket.id].isFlying = state;
        }
    });

    socket.on('requestUnstuck', () => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if(lobby) lobby.forceUnstuckPlayer(socket.id);
    });

    // --- NEW: KICK COMMAND ---
    socket.on('kickPlayer', (targetId) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        
        // Ensure requester is the host
        if(lobby && lobby.hostId === socket.id) {
            // Check if target is in this lobby
            if(lobby.players[targetId]) {
                const targetName = lobby.players[targetId].name;
                
                // If it's a real player (socket exists)
                const targetSocket = io.sockets.sockets.get(targetId);
                if(targetSocket) {
                    targetSocket.emit('kicked');
                    targetSocket.leave(lid);
                    socketToLobby.delete(targetId);
                }
                
                // Remove from game logic (works for bots too)
                lobby.removePlayer(targetId);
                lobby.logAndBroadcast(`${targetName} was kicked by the host.`, 'system');
            }
        }
    });

    // --- REPORTING SYSTEM ---
    socket.on('reportPlayer', async (data) => {
        if (!data || !data.targetId || !data.category) return;
        const lobbyId = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lobbyId);
        let logs = lobby ? lobby.chatHistory.slice(-50) : [];
        const report = new Report({
            reporter: socket.data.name, reported: data.targetName, reportedId: data.targetId,
            category: data.category, details: data.details || "", lobbyId: lobbyId || 'Unknown', chatLogs: logs
        });
        await report.save();
        socket.emit('reportReceived');
    });

    socket.on('bugReport', async (data) => {
        if (!data || !data.details) return;
        const report = new Report({
            reporter: socket.data.name, reported: "SYSTEM", reportedId: "SYSTEM",
            category: "BUG", details: data.details, lobbyId: socketToLobby.get(socket.id) || 'Unknown', chatLogs: []
        });
        await report.save();
    });

    // --- LOBBY LOGIC ---
    function leaveCurrentLobby(socket) {
        if(socketToLobby.has(socket.id)) {
            const lid = socketToLobby.get(socket.id);
            const lobby = lobbies.get(lid);
            if(lobby) {
                socket.leave(lid);
                lobby.removePlayer(socket.id);
                // Check if empty of HUMANS
                if(lobby.getHumanCount() === 0) { 
                    // DEFENSIVE CHECK TO PREVENT DOUBLE LOGS
                    if (lobbies.has(lid)) {
                        lobbies.delete(lid);
                        console.log('Destroyed Lobby:', lid); 
                        
                        // Clear intervals explicitly
                        if(lobby.timerInterval) clearInterval(lobby.timerInterval);
                        if(lobby.safetyInterval) clearInterval(lobby.safetyInterval);
                        if(lobby.botInterval) clearInterval(lobby.botInterval);
                        if(lobby.nextRoundTimeout) clearTimeout(lobby.nextRoundTimeout); // Clear pending round start
                    }
                }
            }
            socketToLobby.delete(socket.id);
        }
    }

    function joinLobby(socket, lobby) {
        socket.join(lobby.id);
        socketToLobby.set(socket.id, lobby.id);
        if(socket.data.isAuthenticated && socket.data.dbId) {
            User.findByIdAndUpdate(socket.data.dbId, { $inc: { gamesPlayed: 1 } }).then(u => {
                if(u) {
                    socket.emit('statsUpdate', { coins: u.coins, wins: u.wins, gamesPlayed: u.gamesPlayed });
                }
            });
        }
        lobby.addPlayer(socket, socket.data);
    }

    socket.on('joinGame', (name) => {
        if (name && name.trim().length > 0) socket.data.name = name.trim().substring(0, 12);
        const lid = socketToLobby.get(socket.id);
        if (lid) {
            const lobby = lobbies.get(lid);
            if (lobby && lobby.players[socket.id]) {
                const newName = lobby.getUniqueName(socket.data.name, socket.id);
                lobby.players[socket.id].name = newName;
                io.to(lid).emit('updatePlayerName', { id: socket.id, name: newName });
            }
        }
    });

    socket.on('findGame', (options) => {
        const currentLobbyId = socketToLobby.get(socket.id);
        leaveCurrentLobby(socket);
        let targetLobby = null;
        for (const [id, l] of lobbies) {
            if (!l.isPrivate && l.hasSpace()) {
                if (options && options.forceNew && id === currentLobbyId) continue; 
                targetLobby = l; break;
            }
        }
        if (!targetLobby) {
            // FIX: EXPLICIT DEFAULT ITEMS
            const defaultSettings = { 
                maxPlayers: 8, 
                mapSize: 71, 
                preRoundTime: 10, 
                gameTime: 300, 
                allowedItems: { 
                    boot: 6, brick: 6, trap: 6, pepper: 6, 
                    orb: 4, swap: 6, hindered: 4, scrambler: 4 
                } 
            };
            targetLobby = createLobby(defaultSettings, false);
            incrementGlobalStat('lobbiesCreated.public');
        }
        joinLobby(socket, targetLobby);
    });

    socket.on('hostGame', (data) => {
        leaveCurrentLobby(socket);
        let preTime = parseInt(data.preRoundTime); 
        if (isNaN(preTime)) preTime = 10; 
        
        const settings = {
            maxPlayers: Math.min(Math.max(parseInt(data.maxPlayers)||8, 2), 20),
            mapSize: Math.min(Math.max(parseInt(data.mapSize)||71, 21), 151),
            preRoundTime: Math.min(Math.max(preTime, 0), 60),
            gameTime: parseInt(data.gameTime),
            allowedItems: data.allowedItems || {}
        };
        if(settings.mapSize % 2 === 0) settings.mapSize++;
        const lobby = createLobby(settings, data.isPrivate);
        
        if(data.isPrivate) incrementGlobalStat('lobbiesCreated.private');
        else incrementGlobalStat('lobbiesCreated.public');

        joinLobby(socket, lobby);
        socket.emit('gameCode', lobby.id);
    });

    socket.on('joinCode', (code) => {
        const lobbyId = code.toUpperCase();
        const lobby = lobbies.get(lobbyId);
        if (lobby && lobby.hasSpace()) { leaveCurrentLobby(socket); joinLobby(socket, lobby); }
        else socket.emit('authError', 'Lobby not found or full');
    });

    socket.on('forceStartGame', () => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if (lobby && lobby.hostId === socket.id && lobby.state === 'manual') lobby.startGame();
    });

    socket.on('restartGame', () => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if (lobby && lobby.hostId === socket.id) lobby.startNewRound();
    });

    // --- GAMEPLAY ---
    socket.on('chatMessage', (msg) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if (lobby && msg && msg.trim().length > 0) {
            const cleanMsg = msg.trim().substring(0, 100);
            lobby.logAndBroadcast(cleanMsg, 'chat', lobby.players[socket.id].name, socket.id);
        }
    });

    socket.on('playerMovement', (d) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if (lobby && lobby.isRoundActive && lobby.players[socket.id]) {
            const p = lobby.players[socket.id];
            p.x = d.x; p.y = d.y; p.z = d.z; p.rotation = d.rotation;
            socket.to(lid).emit('playerMoved', p);
        }
    });

    socket.on('playerWon', async () => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if (!lobby || !lobby.isRoundActive) return;
        lobby.endRound([socket.id], 0);
    });

    socket.on('itemCollected', (id) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if (lobby) lobby.handleItemCollection(id, socket.id);
    });

    socket.on('placeWall', (d) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if (lobby) lobby.placeWall(d.x, d.z);
    });

    socket.on('placeTrap', (d) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if (lobby) lobby.placeTrap(d.x, d.z, socket.id);
    });

    socket.on('trapTriggered', (id) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if(lobby) {
            // FIX: Use shared handler
            lobby.handleTrapTrigger(id, socket.id);
        }
    });

    socket.on('disconnect', () => { leaveCurrentLobby(socket); });
});

server.listen(3000, () => console.log('GriefMaze.io Server Running'));