import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ==========================================
// 1. SKIN CONFIGURATION
// ==========================================
const SKIN_CATALOG = [
    { 
        id: 'default', 
        name: 'Default', 
        previewType: 'image', 
        previewVal: 'textures/preview_default.png' 
    },
    { 
        id: 'beta_merch', 
        name: 'Beta Merch', 
        previewType: 'image', 
        previewVal: 'textures/preview_beta.png', 
        reqType: 'free', 
        desc: 'Free for Beta Players!' 
    },
    { 
        id: 'blueprint', 
        name: 'The Blueprint', 
        previewType: 'image', 
        previewVal: 'textures/preview_blueprint.png', 
        reqType: 'games', 
        reqVal: 50, 
        desc: 'Unlock: Play 50 Games' 
    }
];

// ==========================================
// 2. DOM ELEMENTS
// ==========================================
const mainMenu = document.getElementById('main-menu');
const findGameBtn = document.getElementById('find-game-btn');
const nameInput = document.getElementById('name-input');
const resumeHint = document.getElementById('resume-hint');
const lobbyCodeDisplay = document.getElementById('lobby-code-display');
const currentLobbyCode = document.getElementById('current-lobby-code');

const gameTimerDisplay = document.getElementById('game-timer');
const centerAnnouncement = document.getElementById('center-announcement');
const centerText = document.getElementById('center-text');
const btnMenuStart = document.getElementById('btn-menu-start');
const btnHostRestart = document.getElementById('btn-host-restart');
const btnUnstuck = document.getElementById('btn-unstuck');
const modalEditProfile = document.getElementById('modal-edit-profile');
const btnOpenEdit = document.getElementById('btn-open-edit');
const btnSavePass = document.getElementById('btn-save-pass');
const inputOldPass = document.getElementById('edit-old-pass');
const inputNewPass = document.getElementById('edit-new-pass');

const guestPromo = document.getElementById('guest-promo');

// Chat Elements
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');

// Tab List Elements
const tabList = document.getElementById('tab-list');
const tabHeader = document.getElementById('tab-header-text');
const tabContent = document.getElementById('tab-content');

// Modals
const modalHost = document.getElementById('modal-host');
const modalJoin = document.getElementById('modal-join');
const modalAccount = document.getElementById('modal-account');
const modalProfile = document.getElementById('modal-profile');
const modalLegend = document.getElementById('modal-legend');
const modalShop = document.getElementById('modal-shop');
const modalCustomize = document.getElementById('modal-customize');
const modalSettings = document.getElementById('modal-settings');

// Report Modal
const modalReport = document.getElementById('modal-report');
const reportTargetName = document.getElementById('report-target-name');
const reportReason = document.getElementById('report-reason');
const reportDetails = document.getElementById('report-details');
const btnSubmitReport = document.getElementById('btn-submit-report');
let reportTargetId = null;

// Settings Inputs
const settingFov = document.getElementById('setting-fov');
const settingRender = document.getElementById('setting-render');
const settingsValDisplay = document.getElementById('settings-val-display');

// Auth UI
const accountBtn = document.getElementById('account-btn');
const accountStatus = document.getElementById('account-status');
const btnDoLogin = document.getElementById('btn-do-login');
const btnDoSignup = document.getElementById('btn-do-signup');
const btnLogout = document.getElementById('btn-logout');
const btnDeleteAcc = document.getElementById('btn-delete-acc');
const authUser = document.getElementById('auth-username');
const authPass = document.getElementById('auth-password');

// Profile Stats
const profTitle = document.getElementById('profile-title');
const profCoins = document.getElementById('prof-coins');
const profWins = document.getElementById('prof-wins');
const profGames = document.getElementById('prof-games');

// Host/Join Buttons
const btnHostGame = document.getElementById('host-game-btn');
const btnStartHost = document.getElementById('btn-start-host');
const btnJoinCode = document.getElementById('btn-join-code');
const btnSubmitCode = document.getElementById('btn-submit-code');
const btnInvite = document.getElementById('btn-invite');
const inputJoinCode = document.getElementById('join-code-input');

// Header Buttons
const btnLegend = document.getElementById('btn-legend');
const btnShop = document.getElementById('btn-shop');
const btnCustomize = document.getElementById('btn-customize');
const btnSettings = document.getElementById('btn-settings');

// HUD & Minimap
const minimap = document.getElementById('minimap');
const minimapPlayer = document.getElementById('minimap-player');
const powerupHud = document.getElementById('powerup-hud');
const timerVal = document.getElementById('timer-val');
const blindHud = document.getElementById('blind-hud');
const blindAtkTimer = document.getElementById('blind-atk-timer');
const blindedWarning = document.getElementById('blinded-warning');
const blindVicTimer = document.getElementById('blind-vic-timer');
const brickHud = document.getElementById('brick-hud');
const flyHud = document.getElementById('fly-hud');
const swapHud = document.getElementById('swap-hud');
const trapHud = document.getElementById('trap-hud');
const trappedWarning = document.getElementById('trapped-warning');
const trapTimer = document.getElementById('trap-timer');
const invertedWarning = document.getElementById('inverted-warning');
const invertedTimer = document.getElementById('inverted-timer');
const feedbackHud = document.getElementById('feedback-hud');
const scrambleWarning = document.getElementById('scramble-warning');
const scrambleTimer = document.getElementById('scramble-timer');
const ghostHud = document.getElementById('ghost-hud');
const ghostTimer = document.getElementById('ghost-timer');
const pepperHud = document.getElementById('pepper-hud');
const roundOverScreen = document.getElementById('round-over-screen');
const resultTitle = document.getElementById('result-title');
const leaderboardBody = document.getElementById('leaderboard-body');
const nextRoundTimer = document.getElementById('next-round-timer');

// ==========================================
// 3. VARIABLES & STATE
// ==========================================
const socket = io(); 
const otherPlayers = {};

// Movement Flags
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

// Game State
let gameEnded = false; 
let hasBrick = false; 
let hasTrap = false;
let hasPepper = false; 
let isTrapped = false;
let isInverted = false; 
let isGhost = false; 
let myName = "Guest"; 
let mySocketId = null;
let isInGame = false;
let currentLobby = null;
let exitConfig = null;
let maxPlayers = 8;
let isFrozen = false; 
let iAmHost = false;
let isChatting = false; 
let isTabOpen = false;
let serverRoundState = 'waiting'; 

// Auth State
let isLoggedIn = false;
let currentUserData = { coins: 0, stats: { wins: 0, gamesPlayed: 0 } };
let authenticatedUsername = null; 
let myOwnedSkins = ['default'];
let myEquippedSkin = 'default';

// Timers
let powerupTimerInterval = null; 
let trapInterval = null; 
let ghostInterval = null;
let invertedInterval = null;
let scrambleInterval = null;
let roundInterval = null;
let blindnessTimeout = null;
let blindnessInterval = null;
let gameTimerInterval = null; 

// Animation Timing
let prevTime = performance.now();

// Fly Mode
let isFlying = false;
let flyUp = false;
let flyDown = false;
const FLY_VERTICAL_SPEED = 30.0;  
const FLY_MOVE_SPEED = 200.0;     

// Physics
const velocity = new THREE.Vector3();
const WALK_SPEED = 60.0; 
const GRAVITY = 30.0;
const PLAYER_RADIUS = 0.4; 
const CAM_HEIGHT = 1.6; 
const JUMP_NORMAL = 12.0;
const JUMP_SUPER = 16.0; 
let currentJumpForce = JUMP_NORMAL;

const UNIT_SIZE = 3;
const WALL_HEIGHT = 4;
let MAP_SIZE = 61; 
let WORLD_SIZE = MAP_SIZE * UNIT_SIZE; 
let map = null; 

// ==========================================
// 4. THREE.JS SCENE SETUP
// ==========================================
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();

const skyTexture = textureLoader.load('textures/sky.jpg');
skyTexture.colorSpace = THREE.SRGBColorSpace;
skyTexture.mapping = THREE.EquirectangularReflectionMapping; 
scene.background = skyTexture; 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera);

// Trap Visual (Vine Cage - First Person)
const vineMaterial = new THREE.MeshBasicMaterial({ color: 0x006400, wireframe: true, transparent: true, opacity: 0.8 });
const vineCage = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.05, 64, 8), vineMaterial);
vineCage.position.set(0, 0, -0.5); 
vineCage.visible = false; 
camera.add(vineCage);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10); 
scene.add(dirLight);

const flashlight = new THREE.SpotLight(0xffffff, 50); 
flashlight.angle = Math.PI / 6; 
flashlight.penumbra = 0.5; 
flashlight.decay = 2;
flashlight.distance = 40;
flashlight.visible = false; 
camera.add(flashlight); 
flashlight.target.position.set(0, 0, -1);
camera.add(flashlight.target);

const controls = new PointerLockControls(camera, document.body);
camera.position.set(1 * UNIT_SIZE + (UNIT_SIZE/2), CAM_HEIGHT, 1 * UNIT_SIZE + (UNIT_SIZE/2));

// ==========================================
// 5. WORLD & ITEMS
// ==========================================
const wallTexture = textureLoader.load('textures/corn.jpg');
wallTexture.colorSpace = THREE.SRGBColorSpace;

const floorTexture = textureLoader.load('textures/ground.jpg');
floorTexture.colorSpace = THREE.SRGBColorSpace;
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(MAP_SIZE, MAP_SIZE); 

// --- SKIN TEXTURE ---
const betaShirtTexture = textureLoader.load('textures/beta_shirt.png');
betaShirtTexture.colorSpace = THREE.SRGBColorSpace;

const wallGeometry = new THREE.BoxGeometry(UNIT_SIZE, WALL_HEIGHT, UNIT_SIZE);
const wallMaterial = new THREE.MeshStandardMaterial({ 
    map: wallTexture,
    color: 0xffffff,
    roughness: 0.8
}); 

let floorMesh = null;
let wallMeshes = [];
let placedTraps = [];
const items = [];

function clearWorld() {
    if (floorMesh) {
        scene.remove(floorMesh);
        floorMesh = null;
    }
    wallMeshes.forEach(mesh => scene.remove(mesh));
    wallMeshes = [];
    
    items.forEach(item => {
        if(item.userData.minimapElement) item.userData.minimapElement.remove();
        scene.remove(item);
    });
    items.length = 0;

    placedTraps.forEach(trap => scene.remove(trap.mesh));
    placedTraps = [];
}

function buildWorld() {
    clearWorld();

    MAP_SIZE = map.length;
    WORLD_SIZE = MAP_SIZE * UNIT_SIZE;

    const floorSize = MAP_SIZE * UNIT_SIZE;
    const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        map: floorTexture,
        side: THREE.DoubleSide 
    });
    floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.x = floorSize / 2;
    floorMesh.position.z = floorSize / 2;
    scene.add(floorMesh);

    for (let z = 0; z < MAP_SIZE; z++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            if (map[z][x] === 1) {
                addWallMesh(x, z);
            }
        }
    }
}

function addWallMesh(gridX, gridZ) {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.x = (gridX * UNIT_SIZE) + (UNIT_SIZE / 2);
    wall.position.y = WALL_HEIGHT / 2; 
    wall.position.z = (gridZ * UNIT_SIZE) + (UNIT_SIZE / 2);
    scene.add(wall);
    wallMeshes.push(wall);
    return wall;
}

// --- ITEM CREATION (Visuals) ---
function createItem(id, type, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 1.0, z);
    
    let minimapDot = null;
    if (minimap) {
        minimapDot = document.createElement('div');
        minimapDot.classList.add('minimap-item');
        const pctX = (x / WORLD_SIZE) * 100;
        const pctZ = (z / WORLD_SIZE) * 100;
        minimapDot.style.left = pctX + '%';
        minimapDot.style.top = pctZ + '%';
        minimap.appendChild(minimapDot);
    }

    group.userData = { id: id, type: type, minimapElement: minimapDot };

    if (type === 'boot') {
        const mat = new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.4, metalness: 0.6 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.5), mat);
        group.add(base);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.2), mat);
        shaft.position.y = 0.2; shaft.position.z = -0.15; 
        group.add(shaft);
    } 
    else if (type === 'orb') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1 });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), mat);
        group.add(sphere);

        // Particles
        const particleCount = 50;
        const particleGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        for(let i=0; i<particleCount * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 1.5; 
        }
        particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particleMat = new THREE.PointsMaterial({
            color: 0x333333, size: 0.1, transparent: true, opacity: 0.6
        });
        const mist = new THREE.Points(particleGeo, particleMat);
        group.add(mist);
        group.userData.mist = mist; 
    }
    else if (type === 'brick') {
        const mat = new THREE.MeshStandardMaterial({ color: 0xcd5c5c, roughness: 0.9 });
        const brick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), mat);
        group.add(brick);
    }
    else if (type === 'swap') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x0000ff, roughness: 0.2, metalness: 0.5 });
        const geo = new THREE.ConeGeometry(0.3, 0.6, 4);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.y = Math.PI / 4; 
        group.add(mesh);
    }
    else if (type === 'trap') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
        for(let i=0; i<5; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 4), mat);
            spike.position.x = (Math.random() - 0.5) * 0.4;
            spike.position.z = (Math.random() - 0.5) * 0.4;
            spike.rotation.x = (Math.random() - 0.5);
            spike.rotation.z = (Math.random() - 0.5);
            group.add(spike);
        }
    }
    else if (type === 'hindered') {
        const visual = new THREE.Group();
        visual.rotation.z = Math.PI / 6; 
        const mat = new THREE.MeshStandardMaterial({ color: 0x9370DB, roughness: 0.2, transparent: true, opacity: 0.9 });
        const flaskBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 16), mat);
        const flaskNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 16), mat);
        flaskNeck.position.y = 0.3;
        visual.add(flaskBody);
        visual.add(flaskNeck);
        group.add(visual);
    }
    else if (type === 'scrambler') {
        const visual = new THREE.Group();
        visual.rotation.z = Math.PI / 6; 
        const mat = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.8, roughness: 0.2 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.2, 8), mat);
        visual.add(base);
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.3), mat);
        dish.position.y = 0.25;
        dish.rotation.x = -Math.PI / 2;
        visual.add(dish);
        group.add(visual);
        group.userData.dish = dish;
    }
    else if (type === 'pepper') {
        const visual = new THREE.Group();
        visual.rotation.x = Math.PI / 6; 
        const mat = new THREE.MeshStandardMaterial({ color: 0xFF0000, roughness: 0.4 });
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 8), mat);
        body.rotation.z = Math.PI; 
        visual.add(body);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), new THREE.MeshBasicMaterial({color: 0x00FF00}));
        stem.position.y = 0.3;
        visual.add(stem);
        group.add(visual);
    }

    scene.add(group);
    items.push(group);
}

// ==========================================
// 6. SHOP & CUSTOMIZE LOGIC
// ==========================================
function populateShop() {
    const shopContent = document.getElementById('shop-content');
    if(!shopContent) return;
    shopContent.innerHTML = "";

    SKIN_CATALOG.forEach(skin => {
        // If I already own it, skip (it's in Customize)
        if (myOwnedSkins.includes(skin.id)) return;

        const card = document.createElement('div');
        card.classList.add('skin-card');
        
        // --- VISUAL PREVIEW ---
        const preview = document.createElement('div');
        preview.classList.add('skin-preview');
        
        if (skin.previewType === 'color') {
            preview.style.backgroundColor = skin.previewVal;
        } else if (skin.previewType === 'image') {
            preview.style.backgroundImage = `url('${skin.previewVal}')`;
            preview.style.backgroundColor = '#fff';
        }
        
        const title = document.createElement('h3');
        title.innerText = skin.name;
        
        const desc = document.createElement('p');
        desc.innerText = skin.desc;
        
        const btn = document.createElement('button');
        btn.classList.add('btn-unlock');
        
        // CHECK REQUIREMENTS
        let canUnlock = false;
        if (skin.reqType === 'free') {
            canUnlock = true;
        } else if (skin.reqType === 'games') {
            // Safe access to stats
            if (currentUserData.stats && currentUserData.stats.gamesPlayed >= skin.reqVal) {
                canUnlock = true;
            }
        }

        if (canUnlock) {
            btn.innerText = "UNLOCK";
            btn.style.backgroundColor = "#2ecc71"; // Green
            
            // --- FIX: GUEST CHECK ON CLICK ---
            btn.onclick = (e) => {
                e.stopPropagation(); // Stop click from locking mouse
                if (!isLoggedIn) {
                    alert("You must be logged in to unlock skins! Sign up to save your progress.");
                    modalShop.style.display = 'none';
                    modalAccount.style.display = 'flex';
                    return;
                }
                btn.innerText = "Processing...";
                btn.disabled = true;
                socket.emit('buySkin', skin.id);
            };
        } else {
            btn.innerText = "LOCKED";
            btn.disabled = true;
            btn.style.backgroundColor = "#555";
        }

        card.appendChild(preview);
        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(btn);
        shopContent.appendChild(card);
    });
}

function populateCustomize() {
    const custContent = document.getElementById('cust-content');
    if(!custContent) return;
    custContent.innerHTML = "";

    myOwnedSkins.forEach(skinId => {
        // Find name
        const catalogEntry = SKIN_CATALOG.find(s => s.id === skinId);
        const name = catalogEntry ? catalogEntry.name : (skinId === 'default' ? 'Default' : skinId);

        const card = document.createElement('div');
        card.classList.add('skin-card');
        
        // --- VISUAL PREVIEW ---
        const preview = document.createElement('div');
        preview.classList.add('skin-preview');
        
        // Use Catalog Entry if exists, otherwise fallback to default look
        if (catalogEntry) {
            if (catalogEntry.previewType === 'color') {
                preview.style.backgroundColor = catalogEntry.previewVal;
            } else if (catalogEntry.previewType === 'image') {
                preview.style.backgroundImage = `url('${catalogEntry.previewVal}')`;
                preview.style.backgroundColor = '#fff';
            }
        } else {
            preview.style.backgroundColor = '#3366ff';
        }

        const title = document.createElement('h3');
        title.innerText = name;
        
        const btn = document.createElement('button');
        btn.classList.add('btn-unlock');
        
        if (myEquippedSkin === skinId) {
            btn.innerText = "EQUIPPED";
            btn.disabled = true;
            btn.style.backgroundColor = "#888";
        } else {
            btn.innerText = "EQUIP";
            btn.style.backgroundColor = "#3498db";
            btn.onclick = (e) => {
                e.stopPropagation(); // Stop click from locking mouse
                socket.emit('equipSkin', skinId);
            };
        }

        card.appendChild(preview);
        card.appendChild(title);
        card.appendChild(btn);
        custContent.appendChild(card);
    });
}

// -----------------------------------------------------------
// BUTTON LISTENERS WITH EVENT STOP PROPAGATION
// -----------------------------------------------------------

btnShop.addEventListener('click', (e) => {
    e.stopPropagation();
    populateShop();
    modalShop.style.display = 'flex';
});

btnCustomize.addEventListener('click', (e) => {
    e.stopPropagation();
    populateCustomize();
    modalCustomize.style.display = 'flex';
});

// Store Listeners
socket.on('skinUnlocked', (skinId) => {
    if(!myOwnedSkins.includes(skinId)) myOwnedSkins.push(skinId);
    populateShop(); // Refresh
    populateCustomize();
    // Optional: Alert user
    alert("Skin unlocked! Check the Skins tab to equip it.");
});

socket.on('skinEquipped', (skinId) => {
    myEquippedSkin = skinId;
    populateCustomize();
});

// --- PROFILE EDITOR HANDLERS ---
btnOpenEdit.addEventListener('click', (e) => {
    e.stopPropagation();
    modalProfile.style.display = 'none'; 
    modalEditProfile.style.display = 'flex'; 
});

btnSavePass.addEventListener('click', (e) => {
    e.stopPropagation();
    const oldP = inputOldPass.value;
    const newP = inputNewPass.value;
    
    if(!oldP || !newP) {
        alert("Please fill in both fields.");
        return;
    }
    
    socket.emit('changePassword', { oldPassword: oldP, newPassword: newP });
});

// Generic Success Listener
socket.on('profileUpdateSuccess', (msg) => {
    alert(msg);
    inputOldPass.value = '';
    inputNewPass.value = '';
    modalEditProfile.style.display = 'none';
    modalProfile.style.display = 'flex'; // Return to main profile
});

// --- AUTH HANDLERS ---
accountBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isLoggedIn) {
        profTitle.innerText = myName + "'s Profile";
        profCoins.innerText = currentUserData.coins;
        // FIX: Ensure stats exist safely
        profWins.innerText = currentUserData.stats ? currentUserData.stats.wins : 0;
        profGames.innerText = currentUserData.stats ? currentUserData.stats.gamesPlayed : 0;
        modalProfile.style.display = 'flex';
    } else {
        modalAccount.style.display = 'flex';
    }
});

// GUEST PROMO CLICK HANDLER
if (guestPromo) {
    guestPromo.addEventListener('click', (e) => {
        e.stopPropagation();
        modalAccount.style.display = 'flex';
    });
}

btnDoLogin.addEventListener('click', (e) => {
    e.stopPropagation();
    const u = authUser.value; const p = authPass.value;
    if(u && p) socket.emit('login', { username: u, password: p });
});

btnDoSignup.addEventListener('click', (e) => {
    e.stopPropagation();
    const u = authUser.value; const p = authPass.value;
    if(u && p) socket.emit('signup', { username: u, password: p });
});

btnLogout.addEventListener('click', (e) => {
    e.stopPropagation();
    isLoggedIn = false; 
    myName = "Guest"; 
    // FIX: Reset with correct structure
    currentUserData = { coins: 0, stats: { wins: 0, gamesPlayed: 0 } };
    authenticatedUsername = null; 
    myOwnedSkins = ['default'];
    myEquippedSkin = 'default';
    
    accountStatus.innerText = "Login / Sign Up"; 
    modalProfile.style.display = 'none';
    localStorage.removeItem('gm_session'); 
    
    // Show Guest Promo Again
    if(guestPromo) guestPromo.style.display = 'block';
    
    alert("Logged out.");
});

btnDeleteAcc.addEventListener('click', (e) => {
    e.stopPropagation();
    if(confirm("Are you sure? This cannot be undone!")) {
        socket.emit('deleteAccount');
        localStorage.removeItem('gm_session'); 
    }
});

socket.on('accountDeleted', () => {
    isLoggedIn = false; 
    myName = "Guest"; 
    // FIX: Reset with correct structure
    currentUserData = { coins: 0, stats: { wins: 0, gamesPlayed: 0 } };
    authenticatedUsername = null;
    myOwnedSkins = ['default'];
    
    accountStatus.innerText = "Login / Sign Up"; 
    modalProfile.style.display = 'none';
    if(guestPromo) guestPromo.style.display = 'block';
    alert("Account deleted.");
});

socket.on('authSuccess', (data) => {
    isLoggedIn = true; 
    myName = data.username; 
    authenticatedUsername = data.username; 
    currentUserData = data;
    
    // Load Skins from server
    if (data.skins) myOwnedSkins = data.skins;
    if (data.equippedSkin) myEquippedSkin = data.equippedSkin;
    
    nameInput.value = myName;
    accountStatus.innerText = myName + " (" + data.coins + " 💰)";
    modalAccount.style.display = 'none';
    
    // Hide Guest Promo
    if(guestPromo) guestPromo.style.display = 'none';
    
    if(data.token) {
        localStorage.setItem('gm_session', data.token);
    }
});

socket.on('statsUpdate', (data) => {
    currentUserData.coins = data.coins;
    // FIX: Use correct structure
    if(currentUserData.stats) {
        currentUserData.stats.wins = data.wins;
        currentUserData.stats.gamesPlayed = data.gamesPlayed;
    }
    if(isLoggedIn) accountStatus.innerText = myName + " (" + data.coins + " 💰)";
});

socket.on('authError', (msg) => {
    alert("Error: " + msg);
});

// --- HELPER TO UPDATE BUTTONS BASED ON STATE ---
function updateHostButtons() {
    if (iAmHost) {
        btnHostRestart.style.display = 'block';
        if (serverRoundState === 'manual') {
            btnMenuStart.style.display = 'block';
        } else {
            btnMenuStart.style.display = 'none';
        }
    } else {
        btnHostRestart.style.display = 'none';
        btnMenuStart.style.display = 'none';
    }
}

// --- MENU & MODAL HANDLERS (UPDATED TO PREVENT BUBBLING) ---
findGameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const name = nameInput.value.trim();
    if (name) myName = name; 

    if (isInGame) {
        socket.emit('joinGame', myName);
        socket.emit('findGame', { forceNew: true });
        mainMenu.style.display = 'none';
        setTimeout(() => controls.lock(), 100);
    } else {
        if (!isLoggedIn && !name) myName = "Guest";
        
        isInGame = true; 
        mainMenu.style.display = 'none';
        socket.emit('joinGame', myName);
        socket.emit('findGame', {}); 
        setTimeout(() => controls.lock(), 100);
    }
});

btnHostGame.addEventListener('click', (e) => {
    e.stopPropagation();
    modalHost.style.display = 'flex';
});

btnStartHost.addEventListener('click', (e) => {
    e.stopPropagation();
    const maxPlayers = document.getElementById('host-max-players').value;
    const mapSize = document.getElementById('host-map-size').value;
    const preRoundTime = document.getElementById('host-pre-time').value;
    const gameTime = document.getElementById('host-game-time').value;
    const isPrivate = document.getElementById('host-private').checked;
    
    const allowedItems = {
        boot: document.getElementById('item-boot').checked,
        brick: document.getElementById('item-brick').checked,
        trap: document.getElementById('item-trap').checked,
        pepper: document.getElementById('item-pepper').checked,
        orb: document.getElementById('item-orb').checked,
        swap: document.getElementById('item-swap').checked,
        hindered: document.getElementById('item-hindered').checked,
        scrambler: document.getElementById('item-scrambler').checked,
    };

    const name = nameInput.value.trim();
    if (name) myName = name;
    
    socket.emit('joinGame', myName); 
    socket.emit('hostGame', { maxPlayers, mapSize, preRoundTime, gameTime, allowedItems, isPrivate });
    
    modalHost.style.display = 'none';
    mainMenu.style.display = 'none';
    isInGame = true;
    setTimeout(() => controls.lock(), 100);
});

// HOST BUTTONS LOGIC
btnMenuStart.addEventListener('click', (e) => {
    e.stopPropagation();
    socket.emit('forceStartGame');
    controls.lock(); 
});

btnHostRestart.addEventListener('click', (e) => {
    e.stopPropagation();
    if(confirm("Restart the game for everyone?")) {
        socket.emit('restartGame');
    }
});

// NEW UNSTUCK BUTTON
btnUnstuck.addEventListener('click', (e) => {
    e.stopPropagation();
    socket.emit('requestUnstuck');
    controls.lock(); // Return to game
});

btnJoinCode.addEventListener('click', (e) => {
    e.stopPropagation();
    modalJoin.style.display = 'flex';
});

btnSubmitCode.addEventListener('click', (e) => {
    e.stopPropagation();
    const code = inputJoinCode.value.trim();
    if(code) {
        const name = nameInput.value.trim();
        if (name) myName = name;
        
        socket.emit('joinGame', myName);
        socket.emit('joinCode', code);
        modalJoin.style.display = 'none';
    }
});

socket.on('gameCode', (code) => {
    currentLobby = code;
    lobbyCodeDisplay.style.display = 'block';
    document.getElementById('current-lobby-code').innerText = code;
});

btnInvite.addEventListener('click', (e) => {
    e.stopPropagation();
    if(currentLobby) prompt("Copy this lobby code to share:", currentLobby);
    else alert("You are not in a lobby yet.");
});

btnLegend.addEventListener('click', (e) => { e.stopPropagation(); modalLegend.style.display = 'flex'; });
btnSettings.addEventListener('click', (e) => { e.stopPropagation(); modalSettings.style.display = 'flex'; });

// --- SETTINGS LOGIC ---
settingFov.addEventListener('input', (e) => {
    const val = e.target.value;
    camera.fov = parseInt(val);
    camera.updateProjectionMatrix();
    settingsValDisplay.innerText = `FOV: ${val}, Dist: ${settingRender.value}`;
});

settingRender.addEventListener('input', (e) => {
    const val = e.target.value;
    if(!scene.fog) scene.fog = new THREE.Fog(0xffffff, 10, parseInt(val));
    else scene.fog.far = parseInt(val);
    settingsValDisplay.innerText = `FOV: ${settingFov.value}, Dist: ${val}`;
});

// --- REPORTING LOGIC ---
window.openBugReport = function() {
    const desc = prompt("Describe the bug:");
    if(desc) {
        socket.emit('bugReport', { details: desc });
        alert("Bug reported. Thanks!");
    }
};

function openReportModal(targetName, targetId) {
    reportTargetName.innerText = `Reporting: ${targetName}`;
    reportTargetId = targetId;
    modalReport.style.display = 'flex';
}

btnSubmitReport.addEventListener('click', (e) => {
    e.stopPropagation();
    const category = reportReason.value;
    const details = reportDetails.value;
    
    if (reportTargetId && category) {
        socket.emit('reportPlayer', {
            targetId: reportTargetId,
            targetName: reportTargetName.innerText.replace('Reporting: ', ''),
            category: category,
            details: details
        });
        alert('Report submitted. Thank you.');
        modalReport.style.display = 'none';
        reportDetails.value = ''; 
        
        if (!isTabOpen && !isChatting) controls.lock(); 
    }
});

socket.on('reportReceived', () => { });

// --- CHAT LOGIC ---
chatInput.addEventListener('click', (e) => { e.stopPropagation(); });
chatBox.addEventListener('click', (e) => { e.stopPropagation(); });

function addChatMessage(data) {
    const msg = document.createElement('div');
    msg.classList.add('chat-msg');

    if (data.type === 'system') {
        msg.classList.add('chat-system');
        msg.innerText = data.text;
    } else if (data.type === 'join') {
        msg.classList.add('chat-join');
        msg.innerText = data.text;
    } else if (data.type === 'leave') {
        msg.classList.add('chat-leave');
        msg.innerText = data.text;
    } else {
        msg.classList.add('chat-player');
        
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('chat-name');
        nameSpan.innerText = `${data.name}: `;
        
        nameSpan.addEventListener('click', (e) => {
            e.stopPropagation(); 
            if (!controls.isLocked) {
                openReportModal(data.name, data.id);
            }
        });

        const textSpan = document.createElement('span');
        textSpan.innerText = data.text;

        msg.appendChild(nameSpan);
        msg.appendChild(textSpan);
    }

    chatBox.appendChild(msg);
    while (chatBox.children.length > 50) {
        chatBox.removeChild(chatBox.firstChild);
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

socket.on('chatMessage', (data) => {
    addChatMessage(data);
});

// --- POINTER LOCK & MENU LOGIC ---
controls.addEventListener('lock', () => {
    isChatting = false; 
    isTabOpen = false;
    tabList.style.display = 'none';
    modalReport.style.display = 'none'; 
});

controls.addEventListener('unlock', () => {
    if (isChatting || isTabOpen || modalReport.style.display === 'flex') {
        mainMenu.style.display = 'none';
        return;
    }

    mainMenu.style.display = 'flex';
    if (isInGame) {
        findGameBtn.innerText = "Find New Game";
        findGameBtn.classList.remove('btn-play');
        findGameBtn.classList.add('btn-leave'); 
        resumeHint.style.display = 'block';
    } else {
        findGameBtn.innerText = "Find Game";
        findGameBtn.classList.add('btn-play');
        findGameBtn.classList.remove('btn-leave');
        resumeHint.style.display = 'none';
    }
});

// --- KEYBOARD INPUT ---
function updateTabList() {
    const total = 1 + Object.keys(otherPlayers).length;
    tabHeader.innerText = `LOBBY PLAYERS (${total}/${maxPlayers})`;
    tabContent.innerHTML = "";

    const meRow = document.createElement("div");
    meRow.className = "tab-row";
    meRow.innerHTML = `<span class="tab-name tab-me">${myName} (You)${iAmHost ? ' [HOST]' : ''}</span>`;
    tabContent.appendChild(meRow);

    Object.keys(otherPlayers).forEach(id => {
        let pName = "Unknown";
        if(otherPlayers[id].userData.nameStr) pName = otherPlayers[id].userData.nameStr;
        
        const row = document.createElement("div");
        row.className = "tab-row";
        
        const nameSpan = document.createElement("span");
        nameSpan.className = "tab-name";
        nameSpan.innerText = pName;
        
        const reportIcon = document.createElement("span");
        reportIcon.innerText = " 🚩";
        reportIcon.className = "tab-report";
        reportIcon.title = "Report Player";
        reportIcon.onclick = (e) => {
             e.stopPropagation(); 
             openReportModal(pName, id);
        };

        row.appendChild(nameSpan);
        row.appendChild(reportIcon);
        tabContent.appendChild(row);
    });
    
    if(isFrozen && total < 2) {
        const waitRow = document.createElement("div");
        waitRow.className = "tab-row";
        waitRow.innerHTML = `<span class="tab-name" style="color:yellow; font-style:italic;">Waiting for players...</span>`;
        tabContent.appendChild(waitRow);
    }
}

function setupEnterKey(inputId, actionBtnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(actionBtnId);
    if(input && btn) {
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') btn.click();
        });
    }
}

setupEnterKey('auth-password', 'btn-do-login');
setupEnterKey('join-code-input', 'btn-submit-code');
setupEnterKey('name-input', 'find-game-btn');
['host-max-players', 'host-map-size', 'host-pre-time', 'host-game-time'].forEach(id => {
    setupEnterKey(id, 'btn-start-host');
});

const onKeyDown = function (event) {
    if (document.activeElement === chatInput || document.activeElement === reportDetails) {
        if (event.code === 'Enter' && document.activeElement === chatInput) {
            const text = chatInput.value.trim();
            if (text) {
                socket.emit('chatMessage', text);
                chatInput.value = '';
            }
            chatInput.blur();
            isChatting = false;
            controls.lock(); 
        } else if (event.code === 'Escape') {
            chatInput.blur();
            reportDetails.blur();
            isChatting = false;
            modalReport.style.display = 'none';
            controls.lock(); 
        }
        return; 
    }

    switch (event.code) {
        case 'Enter':
            if (isInGame && !gameEnded) {
                isChatting = true; 
                controls.unlock();
                setTimeout(() => chatInput.focus(), 50);
            }
            break;

        case 'Tab':
            if(isInGame) {
                event.preventDefault();
                if (isTabOpen) {
                    isTabOpen = false;
                    tabList.style.display = 'none';
                    controls.lock();
                } else {
                    isTabOpen = true;
                    updateTabList();
                    tabList.style.display = 'flex';
                    controls.unlock(); 
                }
            }
            break;

        case 'Escape':
            if (!controls.isLocked) {
                if (mainMenu.style.display === 'flex') {
                    mainMenu.style.display = 'none';
                } else {
                    mainMenu.style.display = 'flex';
                    if (isInGame) {
                        findGameBtn.innerText = "Find New Game";
                        findGameBtn.classList.remove('btn-play');
                        findGameBtn.classList.add('btn-leave');
                        resumeHint.style.display = 'block';
                    }
                }
            }
            break;

        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyD': moveRight = true; break;
        
        case 'KeyP': 
            if (!gameEnded) {
                if (authenticatedUsername === '11CHASE11') {
                    isFlying = !isFlying;
                    flyHud.style.display = isFlying ? 'block' : 'none';
                    velocity.y = 0; 
                    socket.emit('toggleFly', isFlying);
                }
            }
            break;

        case 'Space': 
            if (isFlying) {
                flyUp = true; 
            } else if (canJump === true && !isTrapped) {
                velocity.y += currentJumpForce; 
                canJump = false;
            }
            break;

        case 'AltLeft': case 'AltRight':
            if (isFlying) {
                event.preventDefault(); 
                flyDown = true;
            }
            break;

        case 'KeyE':
            if (!gameEnded) {
                const dir = new THREE.Vector3();
                camera.getWorldDirection(dir);
                const targetX = camera.position.x + dir.x * 2.5;
                const targetZ = camera.position.z + dir.z * 2.5;
                const gridX = Math.floor(targetX / UNIT_SIZE);
                const gridZ = Math.floor(targetZ / UNIT_SIZE);
                const myGridX = Math.floor(camera.position.x / UNIT_SIZE);
                const myGridZ = Math.floor(camera.position.z / UNIT_SIZE);

                if (hasBrick) {
                    if (gridX === myGridX && gridZ === myGridZ) {
                        // Optional: show "Cannot place here" UI
                    } else if ((gridX !== myGridX || gridZ !== myGridZ) && gridX > 0 && gridX < MAP_SIZE && gridZ > 0 && gridZ < MAP_SIZE && map[gridZ][gridX] === 0) {
                        socket.emit('placeWall', {x: gridX, z: gridZ});
                        hasBrick = false;
                        brickHud.style.display = 'none';
                    }
                }
                else if (hasTrap) {
                    if (gridX > 0 && gridX < MAP_SIZE && gridZ > 0 && gridZ < MAP_SIZE) {
                        socket.emit('placeTrap', { x: targetX, z: targetZ });
                        hasTrap = false;
                        trapHud.style.display = 'none';
                    }
                }
                else if (hasPepper) {
                    activateGhostMode();
                    hasPepper = false;
                    pepperHud.style.display = 'none';
                }
            }
            break;
    }
};

const onKeyUp = function (event) {
    if (document.activeElement === chatInput) return;
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyA': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyD': moveRight = false; break;
        case 'Space': flyUp = false; break;
        case 'AltLeft': case 'AltRight': flyDown = false; break;
    }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// IMPORTANT: Modified listener to prevent double-locking
document.body.addEventListener('click', (e) => {
    // Ignore if clicking a UI element
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.modal-content') || e.target.closest('.menu-box')) return;
    
    // Ignore if already locked
    if (controls.isLocked) return;

    if (isInGame && !gameEnded && mainMenu.style.display === 'none' && document.activeElement !== chatInput && !isTabOpen && modalReport.style.display === 'none') {
        controls.lock();
    }
});

// ... [Helper functions like createNameLabel, createHuman, addPlayer, removePlayer, etc. remain unchanged] ...

function createNameLabel(name) {
    const fontSize = 24; 
    const font = `bold ${fontSize}px Arial`;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = font;
    const textMetrics = tempCtx.measureText(name);
    const textWidth = textMetrics.width;

    const paddingX = 10;
    const paddingY = 8;
    const canvasWidth = Math.ceil(textWidth + (paddingX * 2));
    const canvasHeight = Math.ceil(fontSize + (paddingY * 2));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(canvasWidth - 5, 0);
    ctx.quadraticCurveTo(canvasWidth, 0, canvasWidth, 5);
    ctx.lineTo(canvasWidth, canvasHeight - 5);
    ctx.quadraticCurveTo(canvasWidth, canvasHeight, canvasWidth - 5, canvasHeight);
    ctx.lineTo(5, canvasHeight);
    ctx.quadraticCurveTo(0, canvasHeight, 0, canvasHeight - 5);
    ctx.lineTo(0, 5);
    ctx.quadraticCurveTo(0, 0, 5, 0);
    ctx.fill();
    
    ctx.font = font;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvasWidth / 2, canvasHeight / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; 
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    const aspectRatio = canvasWidth / canvasHeight;
    const baseHeight = 0.25; 
    sprite.scale.set(baseHeight * aspectRatio, baseHeight, 1);
    
    sprite.position.y = 2.1; 
    sprite.renderOrder = 999; 
    return sprite;
}

function createHuman(skinName = 'default') {
    const group = new THREE.Group();

    let skinMat = new THREE.MeshStandardMaterial({color: 0xffccaa});
    let shirtMat = new THREE.MeshStandardMaterial({color: 0x3366ff}); 
    let pantsMat = new THREE.MeshStandardMaterial({color: 0x111111}); 
    let eyeMat = new THREE.MeshBasicMaterial({color: 0x000000}); 

    if (skinName === 'beta_merch') {
        shirtMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            map: betaShirtTexture 
        });
        pantsMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    } 
    else if (skinName === 'blueprint') {
        const wireMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8
        });
        skinMat = wireMat; shirtMat = wireMat; pantsMat = wireMat;
        eyeMat = wireMat;
    }

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
    head.position.y = 1.6;
    group.add(head);

    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMat);
    leftEye.position.set(-0.1, 1.65, -0.21); 
    group.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), eyeMat);
    rightEye.position.set(0.1, 1.65, -0.21);
    group.add(rightEye);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), shirtMat);
    body.position.y = 1.1;
    group.add(body);

    const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    legGeo.translate(0, -0.35, 0); 
    
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.15, 0.8, 0); 
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.15, 0.8, 0); 
    group.add(rightLeg);

    const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    armGeo.translate(0, -0.3, 0);

    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.35, 1.35, 0); 
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.35, 1.35, 0); 
    group.add(rightArm);

    const trapVisualGeo = new THREE.SphereGeometry(1, 16, 16);
    const trapVisualMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        transparent: true,
        opacity: 0.7
    });
    const trapVisual = new THREE.Mesh(trapVisualGeo, trapVisualMat);
    trapVisual.position.y = 1; 
    trapVisual.visible = false; 
    group.add(trapVisual);

    group.userData.limbs = {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        leftArm: leftArm,
        rightArm: rightArm,
        trapVisual: trapVisual 
    };

    return group;
}

function addPlayer(id, x, y, z, rotation, name, isTrapped, skin = 'default') {
    const human = createHuman(skin); 
    human.position.set(x, y - CAM_HEIGHT, z);
    human.userData.targetPos = new THREE.Vector3(x, y - CAM_HEIGHT, z);
    human.userData.targetRot = rotation;
    human.rotation.y = rotation;
    human.userData.lastPos = new THREE.Vector3(x, y, z);
    human.userData.nameStr = name; 

    if(name) {
        const label = createNameLabel(name);
        human.add(label);
        human.userData.label = label;
    }

    if (isTrapped) {
        human.userData.limbs.trapVisual.visible = true;
    }

    scene.add(human);
    otherPlayers[id] = human;
}

function removePlayer(id) {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
}

// ... [Socket listeners for initialGameState, itemRemoved, roundState, etc. remain unchanged] ...
// Re-adding socket listeners below to ensure full file integrity

socket.on('initialGameState', (data) => {
    map = data.map;
    mySocketId = data.myId; 
    if(data.maxPlayers) maxPlayers = data.maxPlayers;
    iAmHost = (data.hostId === mySocketId);
    serverRoundState = data.roundState;
    updateHostButtons();

    if (iAmHost) btnHostRestart.style.display = 'block';
    else btnHostRestart.style.display = 'none';

    if(data.lobbyId) {
        currentLobby = data.lobbyId;
        lobbyCodeDisplay.style.display = 'block';
        document.getElementById('current-lobby-code').innerText = currentLobby;
        mainMenu.style.display = 'none'; 
        isInGame = true;
    }
    chatBox.innerHTML = '';
    Object.keys(otherPlayers).forEach(id => removePlayer(id));
    buildWorld();
    hasBrick = false; hasTrap = false; hasPepper = false;
    brickHud.style.display = 'none'; trapHud.style.display = 'none'; pepperHud.style.display = 'none';
    isChatting = false; chatInput.blur();
    camera.position.set(4.5, 1.6, 4.5); velocity.set(0, 0, 0);

    Object.keys(data.players).forEach((id) => {
        if (id !== mySocketId) {
            const p = data.players[id];
            addPlayer(id, p.x, p.y, p.z, p.rotation, p.name, p.isTrapped, p.skin);
        }
    });
    data.items.forEach(item => { createItem(item.id, item.type, item.x, item.z); });
    exitConfig = data.exit;
    
    if(data.roundState === 'manual') {
        isFrozen = true; centerAnnouncement.style.display = 'flex'; centerText.innerText = "WAITING FOR HOST TO START"; gameTimerDisplay.style.display = 'none';
    } else if(data.roundState === 'preround') {
        isFrozen = true; centerAnnouncement.style.display = 'flex'; btnMenuStart.style.display = 'none'; gameTimerDisplay.style.display = 'none';
        let t = data.timeLeft; centerText.innerText = `STARTS IN: ${t}`;
        if (gameTimerInterval) clearInterval(gameTimerInterval);
        gameTimerInterval = setInterval(() => { t--; if(t > 0) centerText.innerText = `STARTS IN: ${t}`; else { clearInterval(gameTimerInterval); centerText.innerText = "GO!"; setTimeout(()=>centerAnnouncement.style.display='none',1000); } }, 1000);
    } else if (data.roundState === 'waiting') {
        isFrozen = true; centerAnnouncement.style.display = 'flex'; btnMenuStart.style.display = 'none'; centerText.innerText = "WAITING FOR PLAYERS... (1/" + maxPlayers + ")"; gameTimerDisplay.style.display = 'none';
    } else if (data.roundState === 'playing') {
        isFrozen = false; centerAnnouncement.style.display = 'none'; btnMenuStart.style.display = 'none';
        let t = data.timeLeft;
        if(t > 0) {
            gameTimerDisplay.style.display = 'block';
            if (gameTimerInterval) clearInterval(gameTimerInterval);
            const fmt = (s) => { const m=Math.floor(s/60); const sec=s%60; return `${m<10?'0'+m:m}:${sec<10?'0'+sec:sec}`; };
            gameTimerDisplay.innerText = fmt(t);
            gameTimerInterval = setInterval(() => { t--; if(t>=0) gameTimerDisplay.innerText = fmt(t); else clearInterval(gameTimerInterval); }, 1000);
        }
    }
});

socket.on('itemRemoved', (itemId) => {
    const index = items.findIndex(i => i.userData.id === itemId);
    if (index !== -1) {
        const itemObj = items[index];
        if (itemObj.userData.minimapElement) itemObj.userData.minimapElement.remove();
        scene.remove(itemObj);
        items.splice(index, 1);
    }
});

socket.on('roundState', (data) => {
    serverRoundState = data.state;
    updateHostButtons();
    if (data.state === 'waiting') {
        isFrozen = true; centerAnnouncement.style.display = 'flex'; centerText.innerText = "WAITING FOR PLAYERS..."; gameTimerDisplay.style.display = 'none';
    } else if (data.state === 'manual') {
        isFrozen = true; centerAnnouncement.style.display = 'flex'; centerText.innerText = "WAITING FOR HOST TO START"; gameTimerDisplay.style.display = 'none';
        if(iAmHost) { mainMenu.style.display = 'flex'; controls.unlock(); }
    } else if (data.state === 'preround') {
        isFrozen = true; gameTimerDisplay.style.display = 'none'; centerAnnouncement.style.display = 'flex';
        let timeLeft = data.duration; centerText.innerText = `STARTS IN: ${timeLeft}`;
        if (gameTimerInterval) clearInterval(gameTimerInterval);
        gameTimerInterval = setInterval(() => { timeLeft--; if (timeLeft > 0) centerText.innerText = `STARTS IN: ${timeLeft}`; else { clearInterval(gameTimerInterval); centerText.innerText = "GO!"; setTimeout(() => { centerAnnouncement.style.display = 'none'; }, 1000); } }, 1000);
    } else if (data.state === 'playing') {
        isFrozen = false; centerAnnouncement.style.display = 'none';
        if(mainMenu.style.display === 'flex' && !controls.isLocked) mainMenu.style.display = 'none';
        let timeLeft = data.duration;
        if (timeLeft > 0) {
            gameTimerDisplay.style.display = 'block';
            if (gameTimerInterval) clearInterval(gameTimerInterval);
            const format = (s) => { const m = Math.floor(s / 60); const sec = s % 60; return `${m < 10 ? '0'+m : m}:${sec < 10 ? '0'+sec : sec}`; };
            gameTimerDisplay.innerText = format(timeLeft);
            gameTimerInterval = setInterval(() => { timeLeft--; if (timeLeft >= 0) gameTimerDisplay.innerText = format(timeLeft); else clearInterval(gameTimerInterval); }, 1000);
        } else { gameTimerDisplay.style.display = 'none'; }
    }
});

socket.on('newRound', (data) => {
    gameEnded = false; hasBrick = false; hasTrap = false; hasPepper = false; isTrapped = false; isInverted = false; isGhost = false; currentJumpForce = JUMP_NORMAL; isInGame = true;
    roundOverScreen.style.display = 'none'; brickHud.style.display = 'none'; trapHud.style.display = 'none'; trappedWarning.style.display = 'none'; powerupHud.style.display = 'none'; blindHud.style.display = 'none'; blindedWarning.style.display = 'none'; swapHud.style.display = 'none'; invertedWarning.style.display = 'none'; feedbackHud.style.display = 'none'; scrambleWarning.style.display = 'none'; ghostHud.style.display = 'none'; pepperHud.style.display = 'none'; vineCage.visible = false;
    isChatting = false; chatInput.blur(); minimap.classList.remove('jammed'); scene.background = skyTexture; scene.fog = null; hemiLight.intensity = 0.6; dirLight.intensity = 0.8; flashlight.visible = false;
    map = data.map; exitConfig = data.exit; buildWorld();
    data.items.forEach(item => { createItem(item.id, item.type, item.x, item.z); });
    camera.position.set(4.5, 1.6, 4.5); velocity.set(0, 0, 0);
    if (!controls.isLocked) mainMenu.style.display = 'none';
});

socket.on('roundOver', (data) => {
    gameEnded = true; isInGame = true; roundOverScreen.style.display = 'flex'; mainMenu.style.display = 'none'; gameTimerDisplay.style.display = 'none';
    if(gameTimerInterval) clearInterval(gameTimerInterval);
    if (data.winners && data.winners.includes(mySocketId)) { resultTitle.innerText = "VICTORY!"; resultTitle.style.color = "lime"; } else { resultTitle.innerText = "ROUND OVER"; resultTitle.style.color = "white"; }
    leaderboardBody.innerHTML = "";
    data.leaderboard.forEach((entry, index) => {
        const tr = document.createElement('tr');
        if(entry.id === socket.id) tr.style.color = "yellow";
        const tdRank = document.createElement('td'); tdRank.innerText = index + 1;
        const tdName = document.createElement('td'); tdName.innerText = entry.name;
        const tdDist = document.createElement('td'); tdDist.innerText = entry.distance + " steps";
        tr.appendChild(tdRank); tr.appendChild(tdName); tr.appendChild(tdDist);
        leaderboardBody.appendChild(tr);
    });
    let countdown = data.nextRoundIn; nextRoundTimer.innerText = `Next Round: ${countdown}s`;
    if (roundInterval) clearInterval(roundInterval);
    roundInterval = setInterval(() => { countdown--; nextRoundTimer.innerText = `Next Round: ${countdown}s`; if(countdown <= 0) clearInterval(roundInterval); }, 1000);
});

socket.on('wallPlaced', (data) => { map[data.z][data.x] = 1; const wall = addWallMesh(data.x, data.z); setTimeout(() => { if(wallMeshes.includes(wall)) { scene.remove(wall); map[data.z][data.x] = 0; } }, 10000); });
socket.on('trapPlaced', (data) => { const trapGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.05, 16); const trapMat = new THREE.MeshBasicMaterial({ color: 0x004400 }); const trapMesh = new THREE.Mesh(trapGeo, trapMat); trapMesh.position.set(data.x, 0.05, data.z); scene.add(trapMesh); placedTraps.push({ mesh: trapMesh, id: data.id, x: data.x, z: data.z }); });
socket.on('removeTrap', (trapId) => { const idx = placedTraps.findIndex(t => t.id === trapId); if(idx !== -1) { scene.remove(placedTraps[idx].mesh); placedTraps.splice(idx, 1); } });
socket.on('controlsInverted', () => { isInverted = true; invertedWarning.style.display = 'block'; let timeLeft = 15; invertedTimer.innerText = timeLeft; if(invertedInterval) clearInterval(invertedInterval); invertedInterval = setInterval(() => { timeLeft--; invertedTimer.innerText = timeLeft; if(timeLeft <= 0) { clearInterval(invertedInterval); isInverted = false; invertedWarning.style.display = 'none'; } }, 1000); });
socket.on('radarScrambled', () => { minimap.classList.add('jammed'); scrambleWarning.style.display = 'block'; let timeLeft = 15; scrambleTimer.innerText = timeLeft; if(scrambleInterval) clearInterval(scrambleInterval); scrambleInterval = setInterval(() => { timeLeft--; scrambleTimer.innerText = timeLeft; if(timeLeft <= 0) { clearInterval(scrambleInterval); minimap.classList.remove('jammed'); scrambleWarning.style.display = 'none'; } }, 1000); });
socket.on('playerTrapped', (id) => { if (otherPlayers[id]) otherPlayers[id].userData.limbs.trapVisual.visible = true; });
socket.on('playerUntrapped', (id) => { if (otherPlayers[id]) otherPlayers[id].userData.limbs.trapVisual.visible = false; });
socket.on('playerTeleported', (data) => { if (data.id === mySocketId) { camera.position.set(data.x, data.y, data.z); velocity.set(0, 0, 0); if (data.reason === 'swap') { swapHud.style.display = 'block'; setTimeout(() => { swapHud.style.display = 'none'; }, 2500); } } else if (otherPlayers[data.id]) { const newY = data.y - CAM_HEIGHT; otherPlayers[data.id].position.set(data.x, newY, data.z); otherPlayers[data.id].userData.targetPos.set(data.x, newY, data.z); otherPlayers[data.id].userData.lastPos.copy(otherPlayers[data.id].position); } });
socket.on('updatePlayerName', (data) => { if (otherPlayers[data.id]) { if(otherPlayers[data.id].userData.label) otherPlayers[data.id].remove(otherPlayers[data.id].userData.label); const label = createNameLabel(data.name); otherPlayers[data.id].add(label); otherPlayers[data.id].userData.label = label; otherPlayers[data.id].userData.nameStr = data.name; } });
socket.on('newPlayer', (playerInfo) => { const pY = playerInfo.y !== undefined ? playerInfo.y : 1; addPlayer(playerInfo.playerId, playerInfo.x, pY, playerInfo.z, playerInfo.rotation, playerInfo.name, playerInfo.isTrapped, playerInfo.skin); });
socket.on('playerMoved', (playerInfo) => { if (otherPlayers[playerInfo.playerId]) { const p = otherPlayers[playerInfo.playerId]; if (playerInfo.y !== undefined) p.userData.targetPos.set(playerInfo.x, playerInfo.y - CAM_HEIGHT, playerInfo.z); else p.userData.targetPos.set(playerInfo.x, p.position.y, playerInfo.z); p.userData.targetRot = playerInfo.rotation; } });
socket.on('playerDisconnected', (id) => { removePlayer(id); });
socket.on('darknessTriggered', () => { blindedWarning.style.display = 'block'; let timeLeft = 15; blindVicTimer.innerText = timeLeft; if (blindnessInterval) clearInterval(blindnessInterval); blindnessInterval = setInterval(() => { timeLeft--; blindVicTimer.innerText = timeLeft; if (timeLeft <= 0) clearInterval(blindnessInterval); }, 1000); flashlight.visible = true; scene.background = new THREE.Color(0x000000); scene.fog = new THREE.Fog(0x000000, 0, 15); hemiLight.intensity = 0.05; dirLight.intensity = 0.05; if (blindnessTimeout) clearTimeout(blindnessTimeout); blindnessTimeout = setTimeout(() => { blindedWarning.style.display = 'none'; flashlight.visible = false; scene.background = skyTexture; scene.fog = null; hemiLight.intensity = 0.6; dirLight.intensity = 0.8; }, 15000); });

function checkCollision(x, z) { if (!map) return false; if (isGhost) { const gridX = Math.floor(x / UNIT_SIZE); const gridZ = Math.floor(z / UNIT_SIZE); if (gridX < 0 || gridZ < 0 || gridZ >= MAP_SIZE || gridX >= MAP_SIZE) return true; return false; } const points = [ { x: x + PLAYER_RADIUS, z: z + PLAYER_RADIUS }, { x: x - PLAYER_RADIUS, z: z + PLAYER_RADIUS }, { x: x + PLAYER_RADIUS, z: z - PLAYER_RADIUS }, { x: x - PLAYER_RADIUS, z: z - PLAYER_RADIUS } ]; for (const p of points) { const gridX = Math.floor(p.x / UNIT_SIZE); const gridZ = Math.floor(p.z / UNIT_SIZE); if (exitConfig) { if (exitConfig.side === 'east' && gridX >= MAP_SIZE - 1 && gridZ === exitConfig.z) continue; if (exitConfig.side === 'south' && gridZ >= MAP_SIZE - 1 && gridX === exitConfig.x) continue; } if (gridX < 0 || gridZ < 0 || gridX >= MAP_SIZE || gridZ >= MAP_SIZE) return true; if (gridX < MAP_SIZE && map[gridZ] && map[gridZ][gridX] === 1) return true; } return false; }
function activateSuperJump() { currentJumpForce = JUMP_SUPER; powerupHud.style.display = 'block'; let secondsLeft = 15; timerVal.innerText = secondsLeft; if (powerupTimerInterval) clearInterval(powerupTimerInterval); powerupTimerInterval = setInterval(() => { secondsLeft--; timerVal.innerText = secondsLeft; if (secondsLeft <= 0) { clearInterval(powerupTimerInterval); currentJumpForce = JUMP_NORMAL; powerupHud.style.display = 'none'; } }, 1000); }
function activateGhostMode() { isGhost = true; socket.emit('toggleGhost', true); ghostHud.style.display = 'block'; let secondsLeft = 3; ghostTimer.innerText = secondsLeft; if (ghostInterval) clearInterval(ghostInterval); ghostInterval = setInterval(() => { secondsLeft--; ghostTimer.innerText = secondsLeft; if (secondsLeft <= 0) { clearInterval(ghostInterval); isGhost = false; socket.emit('toggleGhost', false); ghostHud.style.display = 'none'; const gridX = Math.floor(camera.position.x / UNIT_SIZE); const gridZ = Math.floor(camera.position.z / UNIT_SIZE); if (map[gridZ][gridX] === 1) { const dirs = [[0,1], [0,-1], [1,0], [-1,0]]; for(let d of dirs) { const nx = gridX + d[0]; const nz = gridZ + d[1]; if (nx > 0 && nx < MAP_SIZE && nz > 0 && nz < MAP_SIZE) { if (map[nz][nx] === 0) { camera.position.x = (nx * UNIT_SIZE) + (UNIT_SIZE/2); camera.position.z = (nz * UNIT_SIZE) + (UNIT_SIZE/2); velocity.set(0,0,0); return; } } } } } }, 1000); }
function triggerTrap(trapId) { isTrapped = true; vineCage.visible = true; trappedWarning.style.display = 'block'; socket.emit('trapTriggered', trapId); let timeLeft = 10; trapTimer.innerText = timeLeft; if (trapInterval) clearInterval(trapInterval); trapInterval = setInterval(() => { timeLeft--; trapTimer.innerText = timeLeft; if (timeLeft <= 0) { clearInterval(trapInterval); isTrapped = false; vineCage.visible = false; trappedWarning.style.display = 'none'; } }, 1000); }
function checkItems() { for (let i = items.length - 1; i >= 0; i--) { const item = items[i]; item.rotation.y += 0.02; if (item.userData.type === 'scrambler' && item.userData.dish) item.userData.dish.rotation.y += 0.1; if (item.userData.mist) { item.userData.mist.rotation.y -= 0.05; item.userData.mist.rotation.x += 0.02; } const dist = camera.position.distanceTo(item.position); if (dist < 1.5) { socket.emit('itemCollected', item.userData.id); if (item.userData.type === 'boot') activateSuperJump(); else if (item.userData.type === 'orb') { blindHud.style.display = 'block'; let atkTime = 15; blindAtkTimer.innerText = atkTime; const atkInt = setInterval(() => { atkTime--; blindAtkTimer.innerText = atkTime; if(atkTime<=0) clearInterval(atkInt); }, 1000); setTimeout(() => { blindHud.style.display = 'none'; }, 15000); } else if (item.userData.type === 'brick') { hasBrick = true; brickHud.style.display = 'block'; hasTrap = false; trapHud.style.display = 'none'; hasPepper = false; pepperHud.style.display = 'none'; } else if (item.userData.type === 'trap') { hasTrap = true; trapHud.style.display = 'block'; hasBrick = false; brickHud.style.display = 'none'; hasPepper = false; pepperHud.style.display = 'none'; } else if (item.userData.type === 'pepper') { hasPepper = true; pepperHud.style.display = 'block'; hasBrick = false; brickHud.style.display = 'none'; hasTrap = false; trapHud.style.display = 'none'; } else if (item.userData.type === 'hindered') { feedbackHud.style.display = 'block'; setTimeout(() => { feedbackHud.style.display = 'none'; }, 3000); } else if (item.userData.type === 'scrambler') { feedbackHud.style.display = 'block'; setTimeout(() => { feedbackHud.style.display = 'none'; }, 3000); } } } }

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now(); let delta = (time - prevTime) / 1000; prevTime = time;
    if (!map) { renderer.render(scene, camera); return; }
    if (delta > 0.1) delta = 0.1;
    checkItems();
    if (!isTrapped && !isFlying) { placedTraps.forEach(trap => { const dist = Math.sqrt(Math.pow(trap.x - camera.position.x, 2) + Math.pow(trap.z - camera.position.z, 2)); if (dist < 1.0) triggerTrap(trap.id); }); }
    const inputVelocity = new THREE.Vector3();
    if (controls.isLocked === true && !gameEnded && !isTrapped && !isFrozen) {
        const forwardVector = new THREE.Vector3(); controls.getDirection(forwardVector); forwardVector.y = 0; forwardVector.normalize();
        const rightVector = new THREE.Vector3(); rightVector.crossVectors(forwardVector, new THREE.Vector3(0, 1, 0)); rightVector.normalize();
        if (isInverted) { if (moveForward) inputVelocity.sub(forwardVector); if (moveBackward) inputVelocity.add(forwardVector); if (moveRight) inputVelocity.sub(rightVector); if (moveLeft) inputVelocity.add(rightVector); } 
        else { if (moveForward) inputVelocity.add(forwardVector); if (moveBackward) inputVelocity.sub(forwardVector); if (moveRight) inputVelocity.add(rightVector); if (moveLeft) inputVelocity.sub(rightVector); }
        inputVelocity.normalize();
        if (exitConfig) { const gx = Math.floor(camera.position.x / UNIT_SIZE); const gz = Math.floor(camera.position.z / UNIT_SIZE); if (exitConfig.side === 'east') { if(gx >= MAP_SIZE) socket.emit('playerWon'); } else { if(gz >= MAP_SIZE) socket.emit('playerWon'); } } else if (camera.position.x > WORLD_SIZE) socket.emit('playerWon'); 
    }
    const currentSpeed = isFlying ? FLY_MOVE_SPEED : WALK_SPEED;
    if (inputVelocity.length() > 0) { velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta; velocity.x += inputVelocity.x * currentSpeed * delta; velocity.z += inputVelocity.z * currentSpeed * delta; } else { velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta; }
    if (isFlying) { velocity.y = 0; if (flyUp) velocity.y = FLY_VERTICAL_SPEED; if (flyDown) velocity.y = -FLY_VERTICAL_SPEED; camera.position.x += velocity.x * delta; camera.position.z += velocity.z * delta; camera.position.y += velocity.y * delta; } else { velocity.y -= GRAVITY * delta; const steps = 10; const subDelta = delta / steps; for (let i = 0; i < steps; i++) { const originalX = camera.position.x; camera.position.x += velocity.x * subDelta; if (checkCollision(camera.position.x, camera.position.z)) { camera.position.x = originalX; velocity.x = 0; } const originalZ = camera.position.z; camera.position.z += velocity.z * subDelta; if (checkCollision(camera.position.x, camera.position.z)) { camera.position.z = originalZ; velocity.z = 0; } } camera.position.y += velocity.y * delta; if (camera.position.y < -10) { camera.position.set(4.5, CAM_HEIGHT, 4.5); velocity.set(0,0,0); } if (camera.position.y < CAM_HEIGHT) { velocity.y = 0; camera.position.y = CAM_HEIGHT; canJump = true; } }
    const lookDir = new THREE.Vector3(); camera.getWorldDirection(lookDir); const myRotation = Math.atan2(lookDir.x, lookDir.z) + Math.PI;
    socket.emit('playerMovement', { x: camera.position.x, y: camera.position.y, z: camera.position.z, rotation: myRotation });
    if (minimapPlayer) { const pctX = camera.position.x / WORLD_SIZE; const pctZ = camera.position.z / WORLD_SIZE; minimapPlayer.style.left = (pctX * 100) + '%'; minimapPlayer.style.top = (pctZ * 100) + '%'; }
    const t = time * 0.01; 
    Object.keys(otherPlayers).forEach(id => {
        const player = otherPlayers[id]; const dist = player.position.distanceTo(player.userData.targetPos);
        if (dist > 3.0) player.position.copy(player.userData.targetPos);
        else if (dist > 0.01) { const speed = 6.0; const step = speed * delta; const dir = new THREE.Vector3().subVectors(player.userData.targetPos, player.position).normalize(); if (step >= dist) player.position.copy(player.userData.targetPos); else player.position.add(dir.multiplyScalar(step)); }
        const currentRot = player.rotation.y; const targetRot = player.userData.targetRot; player.rotation.y += (targetRot - currentRot) * 0.1;
        if (dist > 0.01) { const swing = Math.sin(t) * 0.5; player.userData.limbs.leftArm.rotation.x = swing; player.userData.limbs.rightLeg.rotation.x = swing; player.userData.limbs.rightArm.rotation.x = -swing; player.userData.limbs.leftLeg.rotation.x = -swing; } else { player.userData.limbs.leftArm.rotation.x = 0; player.userData.limbs.rightLeg.rotation.x = 0; player.userData.limbs.rightArm.rotation.x = 0; player.userData.limbs.leftLeg.rotation.x = 0; }
        player.userData.lastPos.copy(player.position);
    });
    renderer.render(scene, camera);
}
const savedToken = localStorage.getItem('gm_session');
if (savedToken) socket.emit('verifySession', savedToken);
animate();