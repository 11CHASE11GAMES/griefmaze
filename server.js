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
    equippedSkin: { type: String, default: 'default' }
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

app.use(express.static('public'));
app.use('/build', express.static(__dirname + '/node_modules/three/build'));
app.use('/jsm', express.static(__dirname + '/node_modules/three/examples/jsm'));

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
        this.timeLeft = 0;
        this.state = 'waiting'; 
        
        this.setupMap();
        
        // Start Safety Loop
        this.safetyInterval = setInterval(() => this.checkStuckPlayers(), 1000);
    }

    checkStuckPlayers() {
        if (!this.gameMap || this.gameMap.length === 0) return;

        Object.keys(this.players).forEach(id => {
            const p = this.players[id];
            
            if (p.isGhost || p.isFlying) return;

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

        let pName = userData.name || "Guest";
        const isAuth = userData.isAuthenticated || false;

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

        this.players[socket.id] = {
            x: 4.5, y: 1.6, z: 4.5, rotation: 0,
            playerId: socket.id,
            name: pName,
            isTrapped: false,
            isGhost: false,
            isFlying: false,
            isAuthenticated: isAuth,
            dbId: userData.dbId || null
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
            hostId: this.hostId 
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
        const pName = this.players[socketId] ? this.players[socketId].name : "Unknown";
        delete this.players[socketId];
        
        io.to(this.id).emit('playerDisconnected', socketId);
        this.logAndBroadcast(`${pName} left the game.`, 'leave');

        if (socketId === this.hostId) {
            const remainingIds = Object.keys(this.players);
            if (remainingIds.length > 0) {
                this.hostId = remainingIds[Math.floor(Math.random() * remainingIds.length)];
                io.to(this.id).emit('hostAssigned', this.hostId);
                const newHostName = this.players[this.hostId].name;
                this.logAndBroadcast(`${newHostName} is now the Host.`, 'system');
            } else {
                this.hostId = null;
            }
        }
        
        if (this.getPlayerCount() === 0) {
            clearInterval(this.timerInterval);
            clearInterval(this.safetyInterval);
        }
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
        const stack = [[1, 1]]; m[1][1] = 0; 
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
        
        for (let z = 2; z < size - 2; z++) {
            for (let x = 2; x < size - 2; x++) {
                if (m[z][x] === 1) {
                    const v = (m[z-1][x] === 0 && m[z+1][x] === 0);
                    const h = (m[z][x-1] === 0 && m[z][x+1] === 0);
                    if ((v || h) && Math.random() < 0.10) m[z][x] = 0;
                }
            }
        }

        const side = Math.random() > 0.5 ? 'east' : 'south';
        const minIndex = Math.floor(size / 2);
        const maxIndex = size - 2;
        let randomCoord = Math.floor(Math.random() * (maxIndex - minIndex + 1)) + minIndex;
        if (randomCoord % 2 === 0) randomCoord++; 
        if (randomCoord > maxIndex) randomCoord = maxIndex - 1;

        let exitX, exitZ;
        if (side === 'east') { exitX = size - 2; exitZ = randomCoord; m[exitZ][size - 1] = 0; } 
        else { exitX = randomCoord; exitZ = size - 2; m[size - 1][exitX] = 0; }
        m[exitZ][exitX] = 0;

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
        const spawnBatch = (type, count) => {
            if (!this.settings.allowedItems[type]) return; 
            for(let i=0; i<count; i++) {
                const loc = this.getSpacedItemLocation();
                this.activeItems.push({ id: idCounter++, type: type, x: loc.x, z: loc.z });
            }
        };

        const scale = this.settings.mapSize / 61;
        const count = Math.ceil(5 * scale);
        
        spawnBatch('boot', count); spawnBatch('brick', count); 
        spawnBatch('swap', count); spawnBatch('trap', count); 
        spawnBatch('pepper', count);
        spawnBatch('orb', Math.ceil(3 * scale)); 
        spawnBatch('hindered', Math.ceil(3 * scale)); 
        spawnBatch('scrambler', Math.ceil(3 * scale));
    }

    startNewRound() {
        if(this.timerInterval) clearInterval(this.timerInterval);
        this.setupMap();
        Object.keys(this.players).forEach(id => {
            this.players[id].x = 4.5; this.players[id].y = 1.6; 
            this.players[id].z = 4.5; this.players[id].rotation = 0; 
            this.players[id].isTrapped = false;
            this.players[id].isGhost = false;
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
        let bestDist = Infinity;
        let winners = [];
        Object.keys(this.players).forEach(pid => {
            const p = this.players[pid];
            const gx = Math.floor(p.x / this.UNIT_SIZE);
            const gz = Math.floor(p.z / this.UNIT_SIZE);
            if(gx >= 0 && gx < this.settings.mapSize && gz >= 0 && gz < this.settings.mapSize) {
                const d = this.distanceMap[gz][gx];
                if(d !== -1) {
                    if (d < bestDist) { bestDist = d; winners = [pid]; } 
                    else if (d === bestDist) { winners.push(pid); }
                }
            }
        });
        this.endRound(winners, bestDist);
    }

    endRound(winnerIds, winningDistance = 0) {
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
                    .then(u => sock.emit('statsUpdate', { coins: u.coins, wins: u.wins, gamesPlayed: u.gamesPlayed }));
            }
        });

        io.to(this.id).emit('roundOver', { 
            winnerId: winnerIds.length === 1 ? winnerIds[0] : null,
            winners: winnerIds, 
            leaderboard, 
            nextRoundIn: 15 
        });

        setTimeout(() => {
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
    socket.data = { name: "Guest", isAuthenticated: false, dbId: null };

    // --- AUTH ---
    socket.on('signup', async ({ username, password }) => {
        try {
            const existing = await User.findOne({ username });
            if (existing) return socket.emit('authError', 'Username exists');
            const hashed = await bcrypt.hash(password, 10);
            const token = crypto.randomBytes(32).toString('hex');
            const newUser = new User({ username, password: hashed, sessionToken: token });
            await newUser.save();
            socket.data.name = newUser.username; socket.data.isAuthenticated = true; socket.data.dbId = newUser._id;
            socket.emit('authSuccess', { username: newUser.username, coins: 0, stats: { wins: 0, gamesPlayed: 0 }, token });
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
            socket.data.name = user.username; socket.data.isAuthenticated = true; socket.data.dbId = user._id;
            socket.emit('authSuccess', { username: user.username, coins: user.coins, stats: { wins: user.wins, gamesPlayed: user.gamesPlayed }, token });
        } catch (e) { socket.emit('authError', 'Login Failed'); }
    });

    socket.on('verifySession', async (token) => {
        try {
            const user = await User.findOne({ sessionToken: token });
            if (user && !user.isBanned) {
                socket.data.name = user.username; socket.data.isAuthenticated = true; socket.data.dbId = user._id;
                socket.emit('authSuccess', { username: user.username, coins: user.coins, stats: { wins: user.wins, gamesPlayed: user.gamesPlayed }, token });
            }
        } catch (e) { console.error(e); }
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

            // Verify Old Password
            const isMatch = await bcrypt.compare(oldPassword, user.password);
            if (!isMatch) return socket.emit('authError', 'Current password incorrect.');

            // Hash & Save New Password
            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();
            
            socket.emit('profileUpdateSuccess', 'Password changed successfully!');
        } catch (e) {
            console.error(e);
            socket.emit('authError', 'Failed to update password.');
        }
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

    // ==============================
    // ADMIN DASHBOARD LOGIC
    // ==============================
    socket.on('reqAdminData', async () => {
        // SECURITY CHECK: Only 11CHASE11 can access
        if (!socket.data.isAuthenticated || socket.data.name !== '11CHASE11') {
            return socket.emit('adminError', 'ACCESS DENIED: You are not 11CHASE11.');
        }

        try {
            // 1. Get Stats
            const totalUsers = await User.countDocuments({});
            // Sum of all games played by all users
            const gamesAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: "$gamesPlayed" } } }]);
            const totalGames = gamesAgg.length > 0 ? gamesAgg[0].total : 0;
            
            // 2. Get Reports (Player Reports)
            const playerReports = await Report.find({ category: { $ne: 'BUG' } }).sort({ timestamp: -1 }).limit(20);
            
            // 3. Get Bugs
            const bugReports = await Report.find({ category: 'BUG' }).sort({ timestamp: -1 }).limit(20);

            socket.emit('resAdminData', {
                stats: { users: totalUsers, games: totalGames },
                reports: playerReports,
                bugs: bugReports
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
                // Kick them if they are online
                // (Advanced: find their socket and disconnect them, but for now DB ban prevents login)
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

    // --- LOBBY LOGIC ---
    function leaveCurrentLobby(socket) {
        if(socketToLobby.has(socket.id)) {
            const lid = socketToLobby.get(socket.id);
            const lobby = lobbies.get(lid);
            if(lobby) {
                socket.leave(lid);
                lobby.removePlayer(socket.id);
                if(lobby.getPlayerCount() === 0) { lobbies.delete(lid); }
            }
            socketToLobby.delete(socket.id);
        }
    }

    function joinLobby(socket, lobby) {
        socket.join(lobby.id);
        socketToLobby.set(socket.id, lobby.id);
        if(socket.data.isAuthenticated && socket.data.dbId) {
            User.findByIdAndUpdate(socket.data.dbId, { $inc: { gamesPlayed: 1 } }).then(u => {
                if(u) socket.emit('statsUpdate', { coins: u.coins, wins: u.wins, gamesPlayed: u.gamesPlayed });
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
            // FIXED DEFAULT: preRoundTime: 10
            const defaultSettings = { maxPlayers: 8, mapSize: 61, preRoundTime: 10, gameTime: 300, allowedItems: { boot:true, brick:true, trap:true, pepper:true, orb:true, swap:true, hindered:true, scrambler:true } };
            targetLobby = createLobby(defaultSettings, false);
        }
        joinLobby(socket, targetLobby);
    });

    socket.on('hostGame', (data) => {
        leaveCurrentLobby(socket);
        let preTime = parseInt(data.preRoundTime); 
        // FIXED DEFAULT: 10 seconds fallback
        if (isNaN(preTime)) preTime = 10; 
        
        const settings = {
            maxPlayers: Math.min(Math.max(parseInt(data.maxPlayers)||8, 2), 20),
            mapSize: Math.min(Math.max(parseInt(data.mapSize)||61, 21), 101),
            preRoundTime: Math.min(Math.max(preTime, 0), 60),
            gameTime: parseInt(data.gameTime),
            allowedItems: data.allowedItems || {}
        };
        if(settings.mapSize % 2 === 0) settings.mapSize++;
        const lobby = createLobby(settings, data.isPrivate);
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
        if(!lobby) return;
        const idx = lobby.activeItems.findIndex(i => i.id === id);
        if (idx !== -1) {
            const type = lobby.activeItems[idx].type;
            const pName = lobby.players[socket.id].name;
            lobby.activeItems.splice(idx, 1);
            io.to(lid).emit('itemRemoved', id);
            
            if (type === 'orb') { socket.to(lid).emit('darknessTriggered'); lobby.logAndBroadcast(`${pName} used Dark Orb!`, 'system'); }
            else if (type === 'hindered') { socket.to(lid).emit('controlsInverted'); lobby.logAndBroadcast(`${pName} used Hinder Potion!`, 'system'); }
            else if (type === 'scrambler') { socket.to(lid).emit('radarScrambled'); lobby.logAndBroadcast(`${pName} scrambled the radar!`, 'system'); }
            else if (type === 'swap') {
                const others = Object.keys(lobby.players).filter(pid => pid !== socket.id);
                if (others.length) {
                    const targetId = others[Math.floor(Math.random()*others.length)];
                    const targetName = lobby.players[targetId].name;
                    const p1 = lobby.players[socket.id], p2 = lobby.players[targetId];
                    const tmp = {x:p1.x, y:p1.y, z:p1.z};
                    p1.x = p2.x; p1.y = p2.y; p1.z = p2.z; p2.x = tmp.x; p2.y = tmp.y; p2.z = tmp.z;
                    io.to(lid).emit('playerTeleported', {id: socket.id, x:p1.x, y:p1.y, z:p1.z, reason: 'swap'});
                    io.to(lid).emit('playerTeleported', {id: targetId, x:p2.x, y:p2.y, z:p2.z, reason: 'swap'});
                    lobby.logAndBroadcast(`${pName} swapped with ${targetName}!`, 'system');
                }
            }
        }
    });

    socket.on('placeWall', (d) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        let safe = true;
        if(lobby) {
            Object.values(lobby.players).forEach(p => {
                 const px = Math.floor(p.x / lobby.UNIT_SIZE);
                 const pz = Math.floor(p.z / lobby.UNIT_SIZE);
                 if (px === d.x && pz === d.z) safe = false;
            });
            if(safe) {
                lobby.gameMap[d.z][d.x] = 1;
                io.to(lid).emit('wallPlaced', d);
                setTimeout(() => { if(lobby.gameMap[d.z]) lobby.gameMap[d.z][d.x]=0; }, 10000);
            }
        }
    });

    socket.on('placeTrap', (d) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if(lobby) io.to(lid).emit('trapPlaced', {...d, id: `${socket.id}_${Date.now()}`});
    });

    socket.on('trapTriggered', (id) => {
        const lid = socketToLobby.get(socket.id);
        const lobby = lobbies.get(lid);
        if(lobby) {
            io.to(lid).emit('removeTrap', id);
            if(lobby.players[socket.id]) {
                lobby.players[socket.id].isTrapped = true;
                io.to(lid).emit('playerTrapped', socket.id);
                setTimeout(()=>{ if(lobby.players[socket.id]) { lobby.players[socket.id].isTrapped=false; io.to(lid).emit('playerUntrapped', socket.id);} }, 10000);
            }
        }
    });

    socket.on('disconnect', () => { leaveCurrentLobby(socket); });
});

server.listen(3000, () => console.log('GriefMaze.io Server Running'));