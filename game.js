// Source: Bilibili Toy HorrorCow public web version. Local adaptation; see README.md.
// ==================== 设备检测 ====================
const IS_MOBILE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
    || ((navigator.maxTouchPoints || 0) > 1 && Math.min(window.innerWidth, window.innerHeight) < 820);

// ==================== GAME CONFIG ====================
const CONFIG = {
    mazeWidth: 63,
    mazeHeight: 63,
    cellSize: 4,
    wallHeight: 3.6,
    playerHeight: 1.7,
    playerSpeed: 5,
    sprintMultiplier: 1.6,
    ghostSpeed: 7,
    ghostSpeedChase: 7,
    ghostDetectRange: 16,
    ghostCatchRange: 3.0, // ~ within one cell; combined with same-cell check below
    flashlightRange: 14,
    flashlightAngle: Math.PI / 5,
    fogDensity: 0.04,
    hideDuration: 3000,
    staminaMax: 100,
    staminaSprintDrain: 11,   // 冲刺时每秒消耗
    staminaWalkRegen: 12,     // 行走（非冲刺）时每秒恢复
    staminaIdleRegen: 26,     // 完全静止时每秒恢复（更快）
};

// ==================== MAZE GENERATION (Recursive Backtracker) ====================
function generateMaze(w, h) {
    const maze = Array.from({ length: h }, () => Array(w).fill(1));
    
    function carve(x, y) {
        maze[y][x] = 0;
        const dirs = [[0,-2],[0,2],[-2,0],[2,0]].sort(() => Math.random() - 0.5);
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx > 0 && nx < w-1 && ny > 0 && ny < h-1 && maze[ny][nx] === 1) {
                maze[y + dy/2][x + dx/2] = 0;
                carve(nx, ny);
            }
        }
    }
    carve(1, 1);
    
    // Guarantee the spawn cell (1,1) has exactly two exits (never a dead-end spawn).
    // Both directions connect to cells already visited by the carving, so connectivity is preserved.
    maze[1][2] = 0; // open east  -> cell (3,1)
    maze[2][1] = 0; // open south -> cell (1,3)
    
    // Add some extra passages for more open gameplay
    for (let i = 0; i < Math.floor(w * h * 0.08); i++) {
        const x = 1 + Math.floor(Math.random() * (w - 2));
        const y = 1 + Math.floor(Math.random() * (h - 2));
        if (maze[y][x] === 1) {
            let neighbors = 0;
            if (y > 0 && maze[y-1][x] === 0) neighbors++;
            if (y < h-1 && maze[y+1][x] === 0) neighbors++;
            if (x > 0 && maze[y][x-1] === 0) neighbors++;
            if (x < w-1 && maze[y][x+1] === 0) neighbors++;
            if (neighbors >= 2) maze[y][x] = 0;
        }
    }
    
    return maze;
}

// 选出离起点(1,1)最远的通道格（与 placeExit 选格逻辑一致）
function chooseFarthestOpenCell(maze) {
    const h = maze.length, w = maze[0].length;
    let maxDist = -1;
    let best = { x: w - 2, y: h - 2 };
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            if (maze[y][x] === 0) {
                const dist = Math.sqrt((x - 1.5) ** 2 + (y - 1.5) ** 2);
                if (dist > maxDist) { maxDist = dist; best = { x, y }; }
            }
        }
    }
    return best;
}

// BFS 求 start→goal 最短路径（格子序列）
function bfsShortestPath(maze, start, goal) {
    const h = maze.length, w = maze[0].length;
    const key = (x, y) => y * w + x;
    const prev = new Map();
    const seen = new Set([key(start.x, start.y)]);
    const q = [start];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (q.length) {
        const cur = q.shift();
        if (cur.x === goal.x && cur.y === goal.y) break;
        for (const [dx, dy] of dirs) {
            const nx = cur.x + dx, ny = cur.y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && maze[ny][nx] === 0 && !seen.has(key(nx, ny))) {
                seen.add(key(nx, ny));
                prev.set(key(nx, ny), cur);
                q.push({ x: nx, y: ny });
            }
        }
    }
    const path = [];
    let c = { x: goal.x, y: goal.y };
    let guard = 0;
    while (c && guard++ < w * h) {
        path.push(c);
        if (c.x === start.x && c.y === start.y) break;
        c = prev.get(key(c.x, c.y));
    }
    path.reverse();
    return path;
}

// 把"当前最短路径"的中间格全部临时堵住后，起点是否仍能到达出口（即有无第二条路）
function hasAlternateRoute(maze, start, goal) {
    const path = bfsShortestPath(maze, start, goal);
    if (path.length < 3) return false;
    const h = maze.length, w = maze[0].length;
    const key = (x, y) => y * w + x;
    const blocked = new Set();
    for (let i = 1; i < path.length - 1; i++) blocked.add(key(path[i].x, path[i].y));
    const seen = new Set([key(start.x, start.y)]);
    const q = [start];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (q.length) {
        const cur = q.shift();
        if (cur.x === goal.x && cur.y === goal.y) return true;
        for (const [dx, dy] of dirs) {
            const nx = cur.x + dx, ny = cur.y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && maze[ny][nx] === 0 && !blocked.has(key(nx, ny)) && !seen.has(key(nx, ny))) {
                seen.add(key(nx, ny));
                q.push({ x: nx, y: ny });
            }
        }
    }
    return false;
}

// 保证"起点 → 出口"之间至少存在两条可行路线
function ensureSecondRoute(maze, start, goal) {
    if (hasAlternateRoute(maze, start, goal)) return; // 已有环路
    const h = maze.length, w = maze[0].length;
    const path = bfsShortestPath(maze, start, goal);
    // 1) 在最短路径上找"共线且间隔一格墙"的格子对，打通中间墙即形成一条绕行旁路
    for (let i = 0; i < path.length; i++) {
        for (let j = i + 2; j < path.length; j++) {
            const a = path[i], b = path[j];
            if (a.x === b.x && Math.abs(a.y - b.y) === 2) {
                const wx = a.x, wy = (a.y + b.y) / 2;
                if (maze[wy][wx] === 1) { maze[wy][wx] = 0; return; }
            }
            if (a.y === b.y && Math.abs(a.x - b.x) === 2) {
                const wy = a.y, wx = (a.x + b.x) / 2;
                if (maze[wy][wx] === 1) { maze[wy][wx] = 0; return; }
            }
        }
    }
    // 2) 兜底：全局随机加环，直到起点→出口出现第二条路
    for (let tries = 0; tries < 400; tries++) {
        const x = 1 + Math.floor(Math.random() * (w - 2));
        const y = 1 + Math.floor(Math.random() * (h - 2));
        if (maze[y][x] !== 1) continue;
        let opened = false;
        if (maze[y][x - 1] === 0 && maze[y][x + 1] === 0) { maze[y][x] = 0; opened = true; }
        else if (maze[y - 1][x] === 0 && maze[y + 1][x] === 0) { maze[y][x] = 0; opened = true; }
        if (opened) {
            if (hasAlternateRoute(maze, start, goal)) return;
            maze[y][x] = 1; // 回滚
        }
    }
}

// ==================== GLOBALS ====================
let scene, camera, renderer, clock;
let mazeData = [];
let walls = [];
let exitPosition = null;
let mazeGroup = null;
let doorMesh = null;          // 铁门 Mesh（出口，常开，到达即逃脱）
let exitLight = null;         // 铁门上方状态灯（常绿）
let ghost = null;
let ghostSprite = null;
let ghostTexture = null;
let flashlight = null;
let playerPos = new THREE.Vector3();
let playerVelocity = new THREE.Vector3();
let gameStarted = false;
let gameEnded = false;
let gamePaused = false;
let settingsOpen = false; // 设置面板是否打开（打开时不因解锁而锁定鼠标）
let startTime = 0;
// 脚步音效（走路/跑步两套，各双元素交叉淡入，循环衔接更自然；兼容本地 file:// 打开）
let stepMuted = false;      // 是否静音脚步声（由右下静音按钮切换）
let bgmAudio = null;        // 鬼图 BGM（随距离变化的循环音效）
let deathAudio = null;      // 被抓死亡音效
const STEP_XFADE = 0.10; // 交叉淡入时长（秒）
let stepActive = false;  // 是否处于脚步播放状态
let stepMode = null;     // 当前激活的脚步集：'walk' | 'run'
// 走路 / 跑步 两套独立的交叉淡入音频元素
// phase: 当前段已播放时间（秒，由 delta 累加，不依赖音频 currentTime）；dur: 单段时长（秒，读元数据或回退默认值）
let stepWalk = { a:null, b:null, lead:null, trail:null, armed:false, vol:0.5, phase:0, dur:0.45 };
let stepRun  = { a:null, b:null, lead:null, trail:null, armed:false, vol:0.7, phase:0, dur:0.30 };
let elapsedTime = 0;

// Input state
const keys = {};
let mouseX = 0, mouseY = 0;
let pitch = 0, yaw = 0;
let isPointerLocked = false;

// Stamina
let stamina = 100;
let isSprinting = false;
let headBobPhase = 0;     // 视角摆动相位累加器
let headBobAmp = 0;       // 当前摆动幅度（平滑过渡，停下归零）
let staminaExhausted = false;  // 耗尽锁定：需恢复到阈值才能再冲刺

// Mobile controls
let joystickActive = false;
let joystickVector = { x: 0, y: 0 };
let lookActive = false;
let lastLookX = 0, lastLookY = 0;

// Ghost AI
let ghostState = 'wander'; // wander, chase, search
let ghostTarget = new THREE.Vector3();
let ghostLastPlayerPos = new THREE.Vector3();
let ghostSearchTime = 0;
let detectedByGhost = false;
let dangerLevel = 0;
let ghostPath = [];        // list of waypoint world positions (from BFS)
let ghostPathTimer = 0;    // throttle for path recomputation

// Minimap
let minimapCanvas, minimapCtx;

// Settings
let brightnessMul = 1.0;   // brightness multiplier (UI slider)
let sensitivityMul = 1.0;  // look sensitivity multiplier (UI slider)
let gameAmbient = null;    // reference to ambient light for brightness control
const BASE_EXPOSURE = 1.2;
const BASE_AMBIENT = 0.85;
const BASE_FLASHLIGHT = 10;
const BASE_MOUSE_SENS = 0.005;
const BASE_TOUCH_SENS = 0.008;

// ==================== INITIALIZATION ====================
function init() {
    // 移动端降级：缩小迷宫规模，减少墙体实例与每帧阴影渲染负担
    if (IS_MOBILE) {
        CONFIG.mazeWidth = 41;
        CONFIG.mazeHeight = 41;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x81734b);
    scene.fog = new THREE.FogExp2(0x81734b, CONFIG.fogDensity * 0.38);
    
    // Camera (First Person)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(CONFIG.cellSize * 1.5, CONFIG.playerHeight, CONFIG.cellSize * 1.5);
    // 菜单背景也展示实时游戏画面：朝向东侧通道（出生格东侧恒为通路），避免正对墙
    camera.rotation.order = 'YXZ';
    camera.rotation.y = -Math.PI / 2;
    camera.rotation.x = 0;
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // 限制像素比上限为 1，避免高分屏(4K/缩放)按 2x 渲染导致 GPU 负担翻倍而卡顿
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = BASE_EXPOSURE * brightnessMul;
    document.getElementById('game-container').insertBefore(renderer.domElement, document.getElementById('ui-overlay'));

    // 监听 WebGL 上下文丢失（GPU 过载/TDR 时触发），记录到控制台与屏幕，便于定位“卡死”根因
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.error('[WebGL context lost] 渲染上下文丢失，可能是 GPU 过载导致。');
        showLoopError('WebGL 上下文丢失（GPU 过载）。请降低画质或联系开发者。');
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => {
        console.warn('[WebGL context restored] 渲染上下文已恢复。');
    });

    clock = new THREE.Clock();
    
    // 走路音效（双元素交叉淡入，循环衔接更自然）
    initFootstepAudio();
    // 鬼图 BGM：循环播放，音量随玩家与鬼图距离变化（越近越响）
    bgmAudio = new Audio('assets/chase-voice.mp3');
    bgmAudio.loop = true;
    bgmAudio.volume = 0;
    bgmAudio.preload = 'auto';
    // 死亡音效：被抓时播放一次
    deathAudio = new Audio('assets/death.wav');
    deathAudio.preload = 'auto';

    // Generate and build maze (first time)
    rebuildWorld();
    createGhost();
    createFlashlight();
    setupLighting();
    
    // Setup minimap
    setupMinimap();
    
    // Input handlers
    setupInputs();
    setupInventoryControls();
    
    // Start render loop
    animate();
}

// ==================== REBUILD WORLD ====================
function clearMaze() {
    if (mazeGroup) {
        scene.remove(mazeGroup);
        mazeGroup.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => { if(m.map) m.map.dispose(); m.dispose(); });
            }
        });
    }
    mazeGroup = new THREE.Group();
    scene.add(mazeGroup);
    walls.length = 0;
    exitPosition = null;
    doorMesh = null;
    exitLight = null;
}

function rebuildWorld() {
    clearMaze();
    mazeData = addBackroomRooms(generateMaze(CONFIG.mazeWidth, CONFIG.mazeHeight));
    const exitCell = chooseFarthestOpenCell(mazeData);
    ensureSecondRoute(mazeData, { x: 1, y: 1 }, exitCell);
    buildMaze();
    placeExit();
    resetItems();
}

// ==================== BUILD MAZE ====================
function buildMaze() {
    const wallTexture=createBackroomTexture('wall');
    const wallMaterial=new THREE.MeshStandardMaterial({map:wallTexture,roughness:0.95,metalness:0});
    const floorTexture=createBackroomTexture('floor',CONFIG.mazeWidth,CONFIG.mazeHeight);
    const floorMaterial=new THREE.MeshStandardMaterial({map:floorTexture,roughness:1,metalness:0});
    const ceilingTexture=createBackroomTexture('ceiling',CONFIG.mazeWidth,CONFIG.mazeHeight);
    const ceilingMaterial=new THREE.MeshStandardMaterial({map:ceilingTexture,roughness:0.95,metalness:0});

    // Floor
    const floorGeom = new THREE.PlaneGeometry(
        CONFIG.mazeWidth * CONFIG.cellSize,
        CONFIG.mazeHeight * CONFIG.cellSize
    );
    const floor = new THREE.Mesh(floorGeom, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(
        CONFIG.mazeWidth * CONFIG.cellSize / 2,
        0,
        CONFIG.mazeHeight * CONFIG.cellSize / 2
    );
    floor.receiveShadow = true;
    mazeGroup.add(floor);
    
    // Ceiling
    const ceiling = new THREE.Mesh(floorGeom.clone(), ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(
        CONFIG.mazeWidth * CONFIG.cellSize / 2,
        CONFIG.wallHeight,
        CONFIG.mazeHeight * CONFIG.cellSize / 2
    );
    mazeGroup.add(ceiling);
    
    // Walls: 用 InstancedMesh 一次性渲染全部墙体（1 次绘制调用），
    // 避免大地图下创建上千个独立网格导致卡死/掉帧。
    const wallGeom = new THREE.BoxGeometry(CONFIG.cellSize, CONFIG.wallHeight, CONFIG.cellSize);
    const dummy = new THREE.Object3D();
    const wallPositions = [];
    for (let y = 0; y < CONFIG.mazeHeight; y++) {
        for (let x = 0; x < CONFIG.mazeWidth; x++) {
            if (mazeData[y][x] === 1) {
                wallPositions.push({
                    x: x * CONFIG.cellSize + CONFIG.cellSize / 2,
                    z: y * CONFIG.cellSize + CONFIG.cellSize / 2,
                });
            }
        }
    }
    const wallInstanced = new THREE.InstancedMesh(wallGeom, wallMaterial, wallPositions.length);
    wallInstanced.castShadow = true;
    wallInstanced.receiveShadow = true;
    for (let i = 0; i < wallPositions.length; i++) {
        const p = wallPositions[i];
        dummy.position.set(p.x, CONFIG.wallHeight / 2, p.z);
        dummy.updateMatrix();
        wallInstanced.setMatrixAt(i, dummy.matrix);
    }
    wallInstanced.instanceMatrix.needsUpdate = true;
    mazeGroup.add(wallInstanced);
    addBackroomFixtures();
}

// ==================== EXIT ====================
function placeExit() {
    // Place exit far from start
    let maxDist = 0;
    let bestPos = { x: CONFIG.mazeWidth - 2, y: CONFIG.mazeHeight - 2 };
    
    for (let y = 1; y < CONFIG.mazeHeight - 1; y++) {
        for (let x = 1; x < CONFIG.mazeWidth - 1; x++) {
            if (mazeData[y][x] === 0) {
                const dist = Math.sqrt(
                    Math.pow(x - 1.5, 2) + Math.pow(y - 1.5, 2)
                );
                if (dist > maxDist) {
                    maxDist = dist;
                    bestPos = { x, y };
                }
            }
        }
    }
    
    const ex = bestPos.x * CONFIG.cellSize + CONFIG.cellSize / 2;
    const ez = bestPos.y * CONFIG.cellSize + CONFIG.cellSize / 2;
    exitPosition = new THREE.Vector3(ex, 0, ez);
    
    // 铁门面向一个相邻通道（玩家来向）
    let faceDir = { x: 0, z: 1 };
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dy] of dirs) {
        const nx = bestPos.x + dx, ny = bestPos.y + dy;
        if (nx >= 0 && nx < CONFIG.mazeWidth && ny >= 0 && ny < CONFIG.mazeHeight && mazeData[ny][nx] === 0) {
            faceDir = { x: dx, z: dy };
            break;
        }
    }
    
    // 铁门：镶嵌在出口格相邻的某一堵墙上（而非立在道路中央）
    // 优先选"背对来路"那侧墙，否则任选一堵相邻墙；门贴在墙的通道侧表面、底部贴地。
    const back = { x: -faceDir.x, z: -faceDir.z };
    let wallDir = null;
    const bx = bestPos.x + back.x, bz = bestPos.y + back.z;
    if (mazeData[bz] && mazeData[bz][bx] === 1) {
        wallDir = back;
    } else {
        for (const [dx, dy] of dirs) {
            const nx = bestPos.x + dx, ny = bestPos.y + dy;
            if (mazeData[ny] && mazeData[ny][nx] === 1) { wallDir = { x: dx, z: dy }; break; }
        }
    }
    if (!wallDir) wallDir = back; // 兜底（出口四面都是路时）

    const doorW = CONFIG.cellSize * 0.92;
    const doorH = CONFIG.wallHeight * 0.96;
    const doorGeom = new THREE.PlaneGeometry(doorW, doorH);
    const doorTex = new THREE.TextureLoader().load('assets/door.jpg', tex => { tex.colorSpace = THREE.SRGBColorSpace; });
    const doorMat = new THREE.MeshStandardMaterial({
        map: doorTex, transparent: true, opacity: 1.0,
        side: THREE.DoubleSide, metalness: 0.55, roughness: 0.45
    });
    doorMesh = new THREE.Mesh(doorGeom, doorMat);
    // 墙格中心坐标
    const wx = (bestPos.x + wallDir.x) * CONFIG.cellSize + CONFIG.cellSize / 2;
    const wz = (bestPos.y + wallDir.z) * CONFIG.cellSize + CONFIG.cellSize / 2;
    // 向出口（通道）方向退半个格多一点，使门贴在墙的通道侧表面之外，避免嵌进墙体内被挡住
    const inset = CONFIG.cellSize / 2 + 0.06;
    doorMesh.position.set(wx - wallDir.x * inset, CONFIG.wallHeight / 2, wz - wallDir.z * inset);
    // 门法线朝向出口（玩家来路）
    doorMesh.rotation.y = Math.atan2(-wallDir.x, -wallDir.z);
    mazeGroup.add(doorMesh);

    // 铁门上方状态灯（常绿，表示出口可用）
    exitLight = new THREE.PointLight(0x00ff00, 2.2, 9);
    exitLight.position.set(ex, CONFIG.wallHeight + 0.6, ez);
    mazeGroup.add(exitLight);
}

function createGhost() {
    // Load the ghost image as texture
    const loader = new THREE.TextureLoader();
    
    // Create a canvas-based sprite for the ghost since we have an image
    ghostTexture = loader.load(
        'assets/runner-exact-face.png',
        () => {
            ghostTexture.colorSpace = THREE.SRGBColorSpace;
        },
        undefined,
        () => {
            console.warn('Ghost image load failed, using fallback');
            // Draw fallback creepy face
            const c = document.createElement('canvas');
            c.width = 256; c.height = 256;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ccaa00';
            ctx.fillRect(0, 0, 256, 256);
            ctx.fillStyle = '#000';
            ctx.fillRect(40, 80, 60, 60);
            ctx.fillRect(156, 80, 60, 60);
            ctx.fillStyle = '#f00';
            ctx.beginPath(); ctx.arc(70, 110, 18, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(186, 110, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.fillRect(90, 190, 76, 14);
            ghostTexture = new THREE.CanvasTexture(c);
            ghostSprite.material.map = ghostTexture;
            ghostSprite.material.needsUpdate = true;
        }
    );
    
    // Ghost sprite
    const spriteMat = new THREE.SpriteMaterial({
        map: ghostTexture,
        transparent: true,
        alphaTest: 0.45,
    });
    
    ghostSprite = new THREE.Sprite(spriteMat);
    ghostSprite.scale.set(1.4, RUNNER_ATLAS.worldHeight, 1);
    ghostSprite.center.set(0.5, 0);
    
    // Start position - far from player
    let gx, gy;
    do {
        gx = 1 + Math.floor(Math.random() * (CONFIG.mazeWidth - 2));
        gy = 1 + Math.floor(Math.random() * (CONFIG.mazeHeight - 2));
    } while (
        mazeData[gy][gx] === 1 ||
        (Math.abs(gx - 1.5) < 5 && Math.abs(gy - 1.5) < 5)
    );
    
    ghostSprite.position.set(
        gx * CONFIG.cellSize + CONFIG.cellSize / 2,
        1.0,
        gy * CONFIG.cellSize + CONFIG.cellSize / 2
    );
    
    scene.add(ghostSprite);
    ghost = ghostSprite;
    ghost.userData.runner = new RunnerAnimator(ghostSprite, ghostTexture);

    
    // Ghost ambient light (red glow)
    const ghostLight = new THREE.PointLight(0xff0000, 1.5, 6);
    ghost.add(ghostLight);
    ghost.userData.light = ghostLight;
    
    // Ghost eyes glow
    const eyeLight = new THREE.PointLight(0xff0000, 0.8, 3);
    eyeLight.position.set(0, 2.5, 0.5);
    ghost.add(eyeLight);
}

// ==================== FLASHLIGHT ====================
function createFlashlight() {
    flashlight = new THREE.SpotLight(0xffffee, 10, CONFIG.flashlightRange * 1.6, CONFIG.flashlightAngle * 1.4, 0.5, 0.8);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.width = IS_MOBILE ? 512 : 1024;
    flashlight.shadow.mapSize.height = IS_MOBILE ? 512 : 1024;
    flashlight.shadow.bias = -0.0004;       // 消除墙面阴影条纹（shadow acne）
    flashlight.shadow.normalBias = 0.05;     // 沿法线偏移，进一步消除自阴影黑线
    camera.add(flashlight);
    flashlight.position.set(0, 0, 0);
    flashlight.target.position.set(0, 0, -1);
    camera.add(flashlight.target);
    scene.add(camera);
    
    // Slight ambient from flashlight (centered on view)
    const flashAmbient = new THREE.PointLight(0xffffee, 0.8, 4);
    flashAmbient.position.set(0, 0, 0);
    camera.add(flashAmbient);
}

// ==================== LIGHTING ====================
function setupLighting() { setupBackroomLighting(); }

// ==================== MINIMAP ====================
function setupMinimap() {
    minimapCanvas = document.getElementById('minimap');
    minimapCtx = minimapCanvas.getContext('2d');
    minimapCanvas.width = 160;
    minimapCanvas.height = 160;
}

function drawMinimap() {
    const ctx = minimapCtx;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    // 固定缩放：始终显示玩家周围固定范围，元素尺寸不随迷宫总尺寸变化而缩小
    const viewCells = 18;
    const scale = w / (viewCells * CONFIG.cellSize);
    
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    
    // Offset for centered view (玩家居中)
    const offsetX = w / 2 - camera.position.x * scale;
    const offsetY = h / 2 - camera.position.z * scale;
    
    // Walls (只绘制视野范围内的墙，避免大地图逐帧遍历全图)
    ctx.fillStyle = '#333';
    const viewRange = (viewCells / 2 + 1) * CONFIG.cellSize;
    for (let my = 0; my < CONFIG.mazeHeight; my++) {
        for (let mx = 0; mx < CONFIG.mazeWidth; mx++) {
            if (mazeData[my][mx] !== 1) continue;
            const wx = mx * CONFIG.cellSize + CONFIG.cellSize / 2;
            const wz = my * CONFIG.cellSize + CONFIG.cellSize / 2;
            if (Math.abs(wx - camera.position.x) > viewRange ||
                Math.abs(wz - camera.position.z) > viewRange) continue;
            ctx.fillRect(
                offsetX + mx * CONFIG.cellSize * scale,
                offsetY + my * CONFIG.cellSize * scale,
                CONFIG.cellSize * scale,
                CONFIG.cellSize * scale
            );
        }
    }
    
    
    // Exit / iron door（常开，绿色圆点）
    if (exitPosition) {
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.arc(
            offsetX + exitPosition.x * scale,
            offsetY + exitPosition.z * scale,
            6, 0, Math.PI * 2
        );
        ctx.fill();
    }
    
    // Ghost (red dot)
    if (ghost) {
        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.arc(
            offsetX + ghost.position.x * scale,
            offsetY + ghost.position.z * scale,
            5, 0, Math.PI * 2
        );
        ctx.fill();
        
        // Ghost direction indicator
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(offsetX + ghost.position.x * scale, offsetY + ghost.position.z * scale);
        const dirVec = new THREE.Vector3(0, 0, -1);
        dirVec.applyQuaternion(ghost.quaternion);
        ctx.lineTo(
            offsetX + (ghost.position.x + dirVec.x * 2) * scale,
            offsetY + (ghost.position.z + dirVec.z * 2) * scale
        );
        ctx.stroke();
    }
    
    // Player (blue dot)
    ctx.fillStyle = '#0af';
    ctx.beginPath();
    ctx.arc(
        offsetX + camera.position.x * scale,
        offsetY + camera.position.z * scale,
        4, 0, Math.PI * 2
    );
    ctx.fill();
    
    // Player direction
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(camera.quaternion);
    ctx.strokeStyle = '#0af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(offsetX + camera.position.x * scale, offsetY + camera.position.z * scale);
    ctx.lineTo(
        offsetX + (camera.position.x + dir.x * 3) * scale,
        offsetY + (camera.position.z + dir.z * 3) * scale
    );
    ctx.stroke();
    
    // View circle
    ctx.strokeStyle = 'rgba(0,170,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(
        offsetX + camera.position.x * scale,
        offsetY + camera.position.z * scale,
        viewRange * scale, 0, Math.PI * 2
    );
    ctx.stroke();
}

// ==================== INPUT HANDLING ====================
function setupInputs() {
    // Keyboard
    document.addEventListener('keydown', e => {
        if (e.target.closest?.('input,textarea')) return;
        keys[e.code] = true;
    });
    document.addEventListener('keyup', e => {
        keys[e.code] = false;
    });
    
    // Mouse look：游戏进行中点击「画布」锁定鼠标（PC）。
    // 必须限定点到画布，否则点「开始游戏/再来一次/设置」等按钮时也会同步调用
    // requestPointerLock，在你浏览器里该同步调用易失败并连带使后续锁定也失效（表现像“没反应”）。
    document.addEventListener('click', (e) => {
        if (e.target !== renderer.domElement) return;
        if (gameStarted && !gameEnded && !isMobile() && !settingsOpen) {
            requestLockRobust();
        }
    });
    
    // 指针锁定状态变化：锁定成功后移除「冷却期失败」注册的自动重试监听
    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === renderer.domElement;
        if (isPointerLocked && lockRetryHandler) {
            document.removeEventListener('pointerdown', lockRetryHandler, true);
            lockRetryHandler = null;
        }
    });
    
    document.addEventListener('mousemove', e => {
        if (isPointerLocked && gameStarted) {
            yaw -= e.movementX * BASE_MOUSE_SENS * sensitivityMul;
            pitch -= e.movementY * BASE_MOUSE_SENS * sensitivityMul;
            pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
        }
    });
    
    // ===== 手机：统一多指处理（全屏可转视角，同时可摇杆移动）=====
    const joystickArea = document.getElementById('joystick-area');
    const stick = document.getElementById('joystick-stick');
    const touchRoles = {};  // identifier -> { role:'move'|'look', x, y }

    function updateJoystick(touch) {
        const rect = joystickArea.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = rect.width / 2 - 27.5;

        if (dist > maxDist) {
            dx = dx / dist * maxDist;
            dy = dy / dist * maxDist;
        }

        // 拖动时取消过渡，跟手不延迟
        stick.style.transition = 'none';
        stick.style.transform = `translate(${dx}px, ${dy}px)`;
        joystickVector = { x: dx / maxDist, y: dy / maxDist };
    }

    // 落在这些控件上的触摸交给控件自身处理，不接管为视角
    function isControlTarget(t) {
        return t && t.closest && (
            t.closest('#joystick-area') ||
            t.closest('#settings-btn') ||
            t.closest('#settings-panel') ||
            t.closest('#mute-btn') || t.closest('#inventory') || t.closest('button,input')
        );
    }

    const root = document.getElementById('game-container');
    root.addEventListener('touchstart', e => {
        if (!gameStarted || gameEnded || gamePaused) return;  // 菜单/结算界面不拦截，保证按钮可点
        for (const t of e.changedTouches) {
            if (t.target.closest('#joystick-area')) {
                joystickActive = true;
                touchRoles[t.identifier] = { role: 'move' };
                updateJoystick(t);
                continue;
            }
            if (isControlTarget(t.target)) {
                // 设置面板等：交给原生处理，不接管
                continue;
            }
            e.preventDefault();
            touchRoles[t.identifier] = { role: 'look', x: t.clientX, y: t.clientY };
        }
    }, { passive: false });

    root.addEventListener('touchmove', e => {
        if (!gameStarted || gameEnded || gamePaused) return;
        for (const t of e.changedTouches) {
            const r = touchRoles[t.identifier];
            if (!r) continue;
            e.preventDefault();
            if (r.role === 'move') {
                updateJoystick(t);
            } else {
                const dx = t.clientX - r.x;
                const dy = t.clientY - r.y;
                yaw -= dx * BASE_TOUCH_SENS * sensitivityMul;
                pitch -= dy * BASE_TOUCH_SENS * sensitivityMul;
                pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
                r.x = t.clientX;
                r.y = t.clientY;
            }
        }
    }, { passive: false });

    function endTouch(e) {
        for (const t of e.changedTouches) {
            const r = touchRoles[t.identifier];
            if (r && r.role === 'move') {
                joystickActive = false;
                joystickVector = { x: 0, y: 0 };
                // 松手时平滑回中
                stick.style.transition = 'transform 0.12s ease-out';
                stick.style.transform = 'translate(0, 0)';
            }
            delete touchRoles[t.identifier];
        }
    }
    root.addEventListener('touchend', endTouch, { passive: false });
    root.addEventListener('touchcancel', endTouch, { passive: false });
    
    // Window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Settings panel
    setupSettings();
}

function applyBrightness() {
    renderer.toneMappingExposure = BASE_EXPOSURE * brightnessMul;
    if (gameAmbient) gameAmbient.intensity = BASE_AMBIENT * brightnessMul;
    if (flashlight) flashlight.intensity = BASE_FLASHLIGHT * brightnessMul;
}

function setupSettings() {
    const btn = document.getElementById('settings-btn');
    const panel = document.getElementById('settings-panel');
    const closeBtn = document.getElementById('settings-close');
    const brightnessSlider = document.getElementById('brightness-slider');
    const sensSlider = document.getElementById('sens-slider');
    const brightnessVal = document.getElementById('brightness-val');
    const sensVal = document.getElementById('sens-val');
    
    btn.addEventListener('click', () => {
        if (settingsOpen) {
            // 再次点击设置按钮则关闭面板（淡出）
            panel.classList.remove('open');
            settingsOpen = false;
        } else {
            settingsOpen = true;
            panel.classList.add('open');
            if (isPointerLocked) document.exitPointerLock();
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        settingsOpen = false;
    });
    
    brightnessSlider.addEventListener('input', e => {
        brightnessMul = parseInt(e.target.value) / 100;
        brightnessVal.textContent = e.target.value + '%';
        applyBrightness();
    });
    
    sensSlider.addEventListener('input', e => {
        sensitivityMul = parseInt(e.target.value) / 100;
        sensVal.textContent = e.target.value + '%';
    });
    
    // 静音走路声按钮：切换 stepMuted 并更新图标
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.addEventListener('click', () => {
        stepMuted = !stepMuted;
        muteBtn.textContent = stepMuted ? '🔇' : '🔊';
        muteBtn.title = stepMuted ? '取消静音' : '静音走路声';
    });
}

function isMobile() {
    return IS_MOBILE;
}

// ==================== COLLISION DETECTION ====================
function checkCollision(x, z, radius = 0.35) {
    const gridX = Math.floor(x / CONFIG.cellSize);
    const gridZ = Math.floor(z / CONFIG.cellSize);
    
    // Check surrounding cells
    for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
            const cx = gridX + dx;
            const cz = gridZ + dz;
            
            if (cx < 0 || cx >= CONFIG.mazeWidth || cz < 0 || cz >= CONFIG.mazeHeight) return true;
            if (mazeData[cz][cx] === 1) {
                // Wall bounds
                const wallLeft = cx * CONFIG.cellSize;
                const wallRight = (cx + 1) * CONFIG.cellSize;
                const wallTop = cz * CONFIG.cellSize;
                const wallBottom = (cz + 1) * CONFIG.cellSize;
                
                const closestX = Math.max(wallLeft, Math.min(x, wallRight));
                const closestZ = Math.max(wallTop, Math.min(z, wallBottom));
                const distX = x - closestX;
                const distZ = z - closestZ;
                
                if ((distX * distX + distZ * distZ) < radius * radius) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

function canGhostPass(x, z) {
    const gridX = Math.floor(x / CONFIG.cellSize);
    const gridZ = Math.floor(z / CONFIG.cellSize);
    
    if (gridX < 0 || gridX >= CONFIG.mazeWidth || gridZ < 0 || gridZ >= CONFIG.mazeHeight) return false;
    return mazeData[gridZ][gridX] === 0;
}

// ==================== GHOST AI ====================
function worldToGrid(x, z) {
    return {
        gx: Math.max(0, Math.min(CONFIG.mazeWidth - 1, Math.floor(x / CONFIG.cellSize))),
        gy: Math.max(0, Math.min(CONFIG.mazeHeight - 1, Math.floor(z / CONFIG.cellSize))),
    };
}

// BFS pathfinding on the maze grid -> array of world-space waypoints (excluding start cell)
function computePath(sx, sy, tx, ty) {
    if (mazeData[sy][sx] === 1 || mazeData[ty][tx] === 1) return null;
    const W = CONFIG.mazeWidth, H = CONFIG.mazeHeight;
    const visited = Array.from({ length: H }, () => new Uint8Array(W));
    const prev = Array.from({ length: H }, () => new Array(W).fill(null));
    const queue = [[sx, sy]];
    visited[sy][sx] = 1;
    let found = false;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    
    let head = 0;
    while (head < queue.length) {
        const [x, y] = queue[head++];
        if (x === tx && y === ty) { found = true; break; }
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (mazeData[ny][nx] === 1 || visited[ny][nx]) continue;
            visited[ny][nx] = 1;
            prev[ny][nx] = [x, y];
            queue.push([nx, ny]);
        }
    }
    if (!found) return null;
    
    const path = [];
    let cur = [tx, ty];
    while (cur) {
        const [cx, cy] = cur;
        path.push(new THREE.Vector3(
            cx * CONFIG.cellSize + CONFIG.cellSize / 2,
            0,
            cy * CONFIG.cellSize + CONFIG.cellSize / 2
        ));
        cur = prev[cy][cx];
    }
    path.reverse();
    return path; // includes start cell at index 0
}

function replanPath() {
    const gc = worldToGrid(ghost.position.x, ghost.position.z);
    const tc = worldToGrid(ghostTarget.x, ghostTarget.z);
    const path = computePath(gc.gx, gc.gy, tc.gx, tc.gy);
    if (path && path.length > 1) {
        ghostPath = path.slice(1); // skip the cell the ghost is already in
    } else {
        ghostPath = [];
    }
}

function moveGhost(delta, ghostPos, ghostPos2D) {
    const speed = ghostState === 'chase' ? CONFIG.ghostSpeedChase : CONFIG.ghostSpeed;
    
    // Follow the precomputed path waypoints
    if (!ghostPath || ghostPath.length === 0) {
        // No path: face player when hunting, otherwise idle
        if (ghostState === 'chase' || ghostState === 'track' || ghostState === 'search') {
            const lookDir = new THREE.Vector3().subVectors(
                new THREE.Vector3(camera.position.x, 0, camera.position.z), ghostPos2D).normalize();
            ghost.rotation.y = Math.atan2(lookDir.x, lookDir.z) + Math.PI;
        }
        return;
    }
    
    const target = ghostPath[0];
    const dx = target.x - ghost.position.x;
    const dz = target.z - ghost.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    const moveDir = new THREE.Vector3(dx, 0, dz).normalize();
    
    // Advance toward current waypoint
    const step = speed * delta;
    if (dist <= step) {
        ghost.position.x = target.x;
        ghost.position.z = target.z;
        ghostPath.shift(); // reached this waypoint
    } else {
        ghost.position.x += moveDir.x * step;
        ghost.position.z += moveDir.z * step;
    }
    
    // Facing: always look at the player when chasing/searching; else face travel direction
    if (ghostState === 'chase' || ghostState === 'track' || ghostState === 'search') {
        const lookDir = new THREE.Vector3().subVectors(
            new THREE.Vector3(camera.position.x, 0, camera.position.z), ghostPos2D).normalize();
        ghost.rotation.y = Math.atan2(lookDir.x, lookDir.z) + Math.PI;
    } else {
        ghost.rotation.y = Math.atan2(moveDir.x, moveDir.z) + Math.PI;
    }
}

function updateGhostAI(delta) {
    if (!ghost) return;
    if (updateRepelledGhost(delta)) return;
    
    const ghostPos = ghost.position;
    const playerPos2D = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    const ghostPos2D = new THREE.Vector3(ghostPos.x, 0, ghostPos.z);
    const distToPlayer = ghostPos2D.distanceTo(playerPos2D);
    
    // 视觉检测：只控制"全力冲刺"与屏幕红色警告，不决定是否追猎
    const wasDetected = detectedByGhost;
    detectedByGhost = distToPlayer < CONFIG.ghostDetectRange;

    // 超级强悍：鬼图拥有全图嗅觉（第六感），永远知道玩家所在位置
    // 因此永不随机游荡 —— 持续沿最短路径追猎玩家。
    // 视觉范围内 -> chase（暴走冲刺），范围外 -> track（持续追踪，速度稍慢）
    ghostLastPlayerPos.copy(camera.position);  // 始终嗅到玩家当前位置
    ghostTarget.copy(camera.position);         // 目标永远指向玩家
    ghostState = detectedByGhost ? 'chase' : 'track';
    ghostSearchTime = 0;

    // Re-plan a route toward the current target (BFS pathfinding)
    ghostPathTimer -= delta;
    const replanInterval = (ghostState === 'chase') ? 0.1 : 0.2;
    if (ghostPathTimer <= 0 || ghostPath.length === 0) {
        replanPath();
        ghostPathTimer = replanInterval;
    }
    
    // Movement
    moveGhost(delta, ghostPos, ghostPos2D);
    
    // Ghost stays grounded and glides along the floor (no floating)
    ghost.userData.runner.update();

    // Update danger level
    if (detectedByGhost) {
        dangerLevel = Math.min(1, dangerLevel + delta * 2);
    } else {
        dangerLevel = Math.max(0, dangerLevel - delta * 0.5);
    }
    
    // 屏幕边缘泛红：触发范围与红字一致（cellSize*16），离得越近红得越厉害
    const vignette = document.getElementById('danger-vignette');
    const dangerRadius = CONFIG.cellSize * 16;
    let dangerFrac = 0;
    if (distToPlayer < dangerRadius) {
        dangerFrac = 1 - distToPlayer / dangerRadius; // 0(刚进入边缘) → 1(贴脸)
    }
    const intensity = Math.floor(dangerFrac * 90); // 越近越红，最大透明度 0.9
    const clearStop = Math.max(15, 50 - dangerFrac * 30); // 越近红色区域越往画面中心蔓延
    vignette.style.background = `radial-gradient(ellipse at center, transparent ${clearStop}%, rgba(139,0,0,${intensity / 100}) 100%)`;

    // 鬼图逼近警告：进入右上角小地图视野范围（可见半径 viewCells/2 格）内淡入，离开淡出
    const warnEl = document.getElementById('ghost-warning');
    if (warnEl) {
        const mapViewRadius = CONFIG.cellSize * 16; // 比小地图可见半径(9格)再大7格，更提前预警
        warnEl.style.opacity = distToPlayer <= mapViewRadius ? '1' : '0';
    }

    // 鬼图 BGM 音量随距离变化
    updateBgmVolume();
    
    // Check catch — within range OR sharing the player's cell (so a ghost that is
    // visually right in your face always catches you, regardless of grid size)
    const sameCell = (
        Math.floor(ghostPos.x / CONFIG.cellSize) === Math.floor(camera.position.x / CONFIG.cellSize) &&
        Math.floor(ghostPos.z / CONFIG.cellSize) === Math.floor(camera.position.z / CONFIG.cellSize)
    );
    if ((distToPlayer < CONFIG.ghostCatchRange || sameCell) && teleportProtection <= 0) {
        gameOver(false);
    }
    
    // Ghost light intensity based on state
    if (ghost.userData.light) {
        ghost.userData.light.intensity = ghostState === 'chase' ? 3 : 1.5;
    }
}

function pickWanderTarget() {
    let gx, gz;
    let attempts = 0;
    do {
        gx = 1 + Math.floor(Math.random() * (CONFIG.mazeWidth - 2));
        gz = 1 + Math.floor(Math.random() * (CONFIG.mazeHeight - 2));
        attempts++;
    } while ((!canGhostPass(gx * CONFIG.cellSize, gz * CONFIG.cellSize) || attempts < 20) && attempts < 50);
    
    ghostTarget.set(
        gx * CONFIG.cellSize + CONFIG.cellSize / 2,
        0,
        gz * CONFIG.cellSize + CONFIG.cellSize / 2
    );
}

// ==================== PLAYER MOVEMENT ====================
function updatePlayer(delta) {
    if (!gameStarted || gameEnded) return;
    
    const prevX = camera.position.x, prevZ = camera.position.z;
    
    // Get move input
    let moveX = 0, moveZ = 0;
    
    if (isMobile()) {
        moveX = joystickVector.x;
        moveZ = joystickVector.y;
    } else {
        if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;
        if (keys['KeyQ']) yaw += delta * 1.8 * sensitivityMul;
        if (keys['KeyE']) yaw -= delta * 1.8 * sensitivityMul;
    }
    
    // Sprint + stamina
    const moving = (moveX !== 0 || moveZ !== 0);
    // 耗尽锁定：体力归零后必须恢复到最大值的 20% 才能再次冲刺
    if (stamina <= 0) staminaExhausted = true;
    if (stamina >= CONFIG.staminaMax * 0.2) staminaExhausted = false;

    let speed = CONFIG.playerSpeed;
    let isSprintingNow = false;

    if (isMobile()) {
        // 手机：摇杆内侧走动（速度随拉杆轻重），拉到接近外圈（满杆）才冲刺
        const mag = Math.min(1, Math.hypot(moveX, moveZ));
        if (staminaExhausted) {
            speed = CONFIG.playerSpeed;
            stamina += (moving ? CONFIG.staminaWalkRegen : CONFIG.staminaIdleRegen) * delta;
        } else if (mag >= 0.9) {
            // 拉到接近圆圈边缘 → 冲刺（锁定最高速度并消耗体力）
            speed = CONFIG.playerSpeed * CONFIG.sprintMultiplier;
            isSprintingNow = true;
            stamina -= CONFIG.staminaSprintDrain * delta;
        } else {
            // 圆圈范围内 → 走路，速度跟随拉杆幅度（轻拉慢走）
            speed = CONFIG.playerSpeed * mag;
            stamina += (moving ? CONFIG.staminaWalkRegen : CONFIG.staminaIdleRegen) * delta;
        }
    } else {
        const wantSprint = (keys['ShiftLeft'] || keys['ShiftRight']) && moving && !staminaExhausted;
        if (wantSprint) {
            speed *= CONFIG.sprintMultiplier;
            isSprintingNow = true;
            stamina -= CONFIG.staminaSprintDrain * delta;
        } else {
            // 静止恢复更快，行走恢复较慢
            stamina += (moving ? CONFIG.staminaWalkRegen : CONFIG.staminaIdleRegen) * delta;
        }
    }
    stamina = Math.max(0, Math.min(CONFIG.staminaMax, stamina));
    isSprinting = isSprintingNow;
    
    // Calculate move direction in world space
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    
    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(forward, -moveZ);
    moveDir.addScaledVector(right, moveX);
    if (moveDir.length() > 0) moveDir.normalize();
    
    // Apply movement with collision
    const newPos = camera.position.clone();
    newPos.addScaledVector(moveDir, speed * delta);
    
    // Try X movement
    if (!checkCollision(newPos.x, camera.position.z)) {
        camera.position.x = newPos.x;
    }
    // Try Z movement
    if (!checkCollision(camera.position.x, newPos.z)) {
        camera.position.z = newPos.z;
    }
    
    // Apply camera rotation
    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    // 视角上下摆动（head bob）：移动时按步频累加相位，奔跑幅度更大、频率更快；停下平滑归零
    const bobMoving = moving && Math.hypot(camera.position.x - prevX, camera.position.z - prevZ) > 0.0005;
    const targetBob = bobMoving ? (isSprintingNow ? 0.20 : 0.10) : 0;
    headBobAmp += (targetBob - headBobAmp) * Math.min(1, delta * 10);
    if (headBobAmp > 0.0005) {
        headBobPhase += delta * (isSprintingNow ? 13 : 8.5);
    }
    camera.position.y = CONFIG.playerHeight + Math.sin(headBobPhase) * headBobAmp;
    
    // Check exit / win
    if (exitPosition) {
        const distToExit = Math.hypot(camera.position.x - exitPosition.x, camera.position.z - exitPosition.z);
        if (distToExit < 1.5) {
            gameOver(true);
        }
    }
    
    // 走路音效：移动且实际产生位移时循环播放（交叉淡入，衔接自然）；
    // 停止移动时让当前这一次要完整播完。撞墙不动则不出声。
    const movedDist = Math.hypot(camera.position.x - prevX, camera.position.z - prevZ);
    if (stepMuted) {
        silenceFootsteps(); // 静音：立即停掉脚步声
    } else {
        updateFootsteps(moving && movedDist > 0.0005, isSprintingNow, delta);
    }
    
    // Update stamina bar UI (color smoothly shifts red->yellow->green with level)
    const fill = document.getElementById('stamina-fill');
    if (fill) {
        const pct = stamina / CONFIG.staminaMax;
        fill.style.width = (pct * 100) + '%';
        const hue = pct * 120; // 0 = red, 60 = yellow, 120 = green
        fill.style.background = `hsl(${hue}, 85%, 50%)`;
    }
}

// ==================== FOOTSTEP AUDIO ====================
// 双元素交叉淡入循环：用两个 <audio> 交替播放，在每段末尾前启动另一个并以音量
// 交叉淡入，平滑掩盖单次样本的循环接缝，听感更自然。兼容本地 file:// 直接打开
// （不走 fetch / WebAudio decode，避免 CORS 限制）。

function initFootstepAudio() {
    stepWalk.a = new Audio('assets/走路4.wav');
    stepWalk.b = new Audio('assets/走路4.wav');
    stepRun.a = new Audio('assets/跑步1.wav');
    stepRun.b = new Audio('assets/跑步1.wav');
    [stepWalk.a, stepWalk.b, stepRun.a, stepRun.b].forEach(el => {
        el.preload = 'auto';
        el.loop = false; // 自行管理循环（交叉淡入）
        el.volume = 0;
        // 元数据加载后记录单段时长，供相位累加器使用（不依赖 currentTime 判断）
        el.addEventListener('loadedmetadata', () => {
            if (isFinite(el.duration) && el.duration > 0) {
                if (el === stepWalk.a || el === stepWalk.b) stepWalk.dur = el.duration;
                else stepRun.dur = el.duration;
            }
        });
    });
}

function startStepEl(el) {
    try {
        el.currentTime = 0;
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* 忽略 */ }
}

function stepSet(mode) {
    return mode === 'run' ? stepRun : stepWalk;
}

// 立即静音并停掉某一套脚步集（硬停，不播完）
function silenceStepSet(mode) {
    const s = stepSet(mode);
    if (!s) return;
    s.armed = false;
    if (s.trail) { try { s.trail.pause(); } catch (e) {} s.trail.currentTime = 0; s.trail.volume = 0; }
    if (s.lead) { try { s.lead.pause(); } catch (e) {} s.lead.currentTime = 0; s.lead.volume = 0; s.lead = null; }
}

// 启动某一套脚步集（首次或切换时调用）
function startStepSet(mode) {
    const s = stepSet(mode);
    if (!s.a) return;
    if (!s.lead) { s.lead = s.a; s.trail = s.b; }
    s.phase = 0;
    s.armed = false;
    s.dur = (s.lead.duration && isFinite(s.lead.duration) && s.lead.duration > 0) ? s.lead.duration : s.dur;
    s.lead.volume = s.vol;
    if (s.lead.paused) startStepEl(s.lead);
    stepActive = true;
    stepMode = mode;
}

// 交叉淡入当前激活集：用相位累加器（按 delta 推进），不依赖音频 currentTime，
// 避免元数据未加载 / 解码中断时整段逻辑失效导致脚步无声。
function crossfadeStepSet(mode, delta) {
    const s = stepSet(mode);
    if (!s.lead) return;
    // 若 lead 意外暂停（如解码中断 / 标签页切走），立即重启，避免静音
    if (s.lead.paused) startStepEl(s.lead);
    const dur = (s.lead.duration && isFinite(s.lead.duration) && s.lead.duration > 0) ? s.lead.duration : s.dur;
    s.dur = dur;
    s.phase += delta;
    const remain = dur - s.phase;
    if (!s.armed && remain <= STEP_XFADE && remain >= 0) {
        s.trail.volume = 0;
        startStepEl(s.trail);
        s.armed = true;
    }
    if (s.armed) {
        const k = Math.max(0, Math.min(1, remain / STEP_XFADE)); // 1→0
        s.lead.volume = s.vol * k;
        s.trail.volume = s.vol * (1 - k);
    }
    if (s.phase >= dur) {
        s.phase -= dur; // 保留溢出，保持节奏连续
        s.lead.pause(); s.lead.currentTime = 0; s.lead.volume = 0;
        const tmp = s.lead; s.lead = s.trail; s.trail = tmp;
        s.armed = false;
        if (s.lead.paused) startStepEl(s.lead); // 确保新 lead 在播放
        s.lead.volume = s.vol;
    }
}

// 停止脚步（不移动时）：让当前 lead 播完这一段自然停止
function stopStepSet(mode) {
    const s = stepSet(mode);
    if (!s) return;
    stepActive = false;
    if (s.armed && s.trail) {
        s.trail.pause(); s.trail.currentTime = 0; s.trail.volume = 0;
        s.armed = false;
    }
    // 当前 lead 已在播放，不强制停，让其自然播完整段
}

// moving: 是否正在移动（已产生位移）；sprint: 是否冲刺（用跑步音效）
function updateFootsteps(moving, sprint, delta) {
    if (!stepWalk.a || !stepRun.a) return;
    const want = sprint ? 'run' : 'walk';
    if (moving) {
        if (!stepActive) {
            startStepSet(want);
        } else if (stepMode !== want) {
            // 走路/跑步之间切换：立即停掉旧集，启动新集
            silenceStepSet(stepMode);
            startStepSet(want);
        }
        crossfadeStepSet(stepMode, delta);
    } else {
        if (stepMode) stopStepSet(stepMode);
    }
}

// 立即静音并停掉所有脚步声元素（静音按钮按下时调用）
function silenceFootsteps() {
    stepActive = false;
    stepMode = null;
    silenceStepSet('walk');
    silenceStepSet('run');
}

// 在用户点击手势内用一次性静音音频解锁页面音频（绕过浏览器自动播放限制）。
function unlockAudio() {
    try {
        const a = new Audio('assets/走路4.wav');
        a.muted = true;
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
        setTimeout(() => { a.muted = false; }, 50);
    } catch (e) { /* 忽略 */ }
    // 在用户手势内启动 BGM 循环（初始音量为 0，由距离控制）
    if (bgmAudio && bgmAudio.paused) {
        const bp = bgmAudio.play();
        if (bp && typeof bp.catch === 'function') bp.catch(() => {});
    }
}

// 根据玩家与鬼图距离设置 BGM 音量：越近越响，超出范围几乎静音
function updateBgmVolume() {
    if (!bgmAudio || !ghost) {
        if (bgmAudio) bgmAudio.volume = 0;
        return;
    }
    const dx = ghost.position.x - camera.position.x;
    const dz = ghost.position.z - camera.position.z;
    const dist = Math.hypot(dx, dz);
    const maxRange = 64; // 超过此距离几乎听不到
    let v = 1 - dist / maxRange;
    if (v < 0) v = 0;
    v = v * v; // 平滑衰减
    bgmAudio.volume = Math.min(v * 1.2, 0.9); // 接近时拉满（audio 上限 1.0）
}

// ==================== FLASHLIGHT EFFECTS ====================
function updateFlashlight(delta) {
    if (!flashlight) return;
    flashlight.intensity = BASE_FLASHLIGHT * brightnessMul;
}

// ==================== TIMER ====================
function updateTimer() {
    if (!gameStarted || gameEnded) return;
    elapsedTime = Date.now() - startTime;
    const seconds = Math.floor(elapsedTime / 1000);
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    document.getElementById('rec-timer').textContent = `${mins}:${secs}`;
}

// ==================== GAME STATE ====================
// 淡出遮罩层：先渐隐，动画结束后设为 display:none（再调用回调）。
function fadeOutScreen(id, cb) {
    const el = document.getElementById(id);
    if (!el || el.style.display === 'none') { if (cb) cb(); return; }
    el.style.transition = 'opacity 0.45s ease';
    void el.offsetWidth; // 强制重排，确保过渡生效
    el.style.opacity = '0';
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener('transitionend', finish);
        el.style.display = 'none';
        el.style.opacity = '';
        el.style.transition = '';
        if (cb) cb();
    };
    el.addEventListener('transitionend', finish);
    setTimeout(finish, 600); // 兜底，防止 transitionend 未触发
}

// 黑屏转场：覆盖黑屏 → 在黑屏时执行 midCallback（切地图）→ 淡出黑屏露出新地图。
// 注意：midCallback 在转场延迟后执行，已脱离点击手势，因此指针锁定不能放在这里，
// 必须在点击手势内（restartGame 中）同步请求，本函数只负责视觉转场。
function blackTransition(midCallback) {
    const el = document.getElementById('fade-black');
    el.style.display = 'block';
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '0';
    void el.offsetWidth; // 强制重排，确保过渡生效
    el.style.opacity = '1';
    let inDone = false;
    const afterIn = () => {
        if (inDone) return;
        inDone = true;
        el.removeEventListener('transitionend', afterIn);
        if (midCallback) midCallback();
        // 等两帧确保新地图已渲染，再淡出黑屏
        requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.opacity = '0';
            let outDone = false;
            const afterOut = () => {
                if (outDone) return;
                outDone = true;
                el.removeEventListener('transitionend', afterOut);
                el.style.display = 'none';
                el.style.transition = '';
            };
            el.addEventListener('transitionend', afterOut);
            setTimeout(afterOut, 400); // 兜底
        }));
    };
    el.addEventListener('transitionend', afterIn);
    setTimeout(afterIn, 400); // 兜底，防止 transitionend 未触发
}

function startGame() {
    PlayerRankings.start();
    // 显示游戏内 HUD 与右上角按钮（菜单/结算界面时隐藏）
    document.getElementById('ui-overlay').style.display = 'block';
    document.getElementById('settings-btn').style.display = 'flex';
    document.getElementById('mute-btn').style.display = 'flex';
    // 先淡出开始界面，游戏在遮罩后方即时初始化（淡出即“淡入”游戏画面）
    fadeOutScreen('start-screen');
    gameStarted = true;
    gameEnded = false;
    gamePaused = false;
    startTime = Date.now();
    elapsedTime = 0;
    // 清理可能残留的锁定重试监听
    if (lockRetryHandler) { document.removeEventListener('pointerdown', lockRetryHandler, true); lockRetryHandler = null; }
    
    // Regenerate the maze every time we (re)start so the layout is fresh
    rebuildWorld();
    
    // Reset player position
    camera.position.set(CONFIG.cellSize * 1.5, CONFIG.playerHeight, CONFIG.cellSize * 1.5);
    // Face east at spawn: the spawn cell's east side is always an open passage
    // (forced open in generateMaze), so the camera never starts staring at a wall.
    yaw = -Math.PI / 2;
    pitch = 0;
    
    // Reset ghost — spawn it at the exit so it begins hunting from there
    if (ghost && exitPosition) {
        ghost.position.set(exitPosition.x, 0, exitPosition.z);
        ghost.userData.runner.reset();
        ghostState = 'wander';
        pickWanderTarget();
    }
    
    // Reset state
    dangerLevel = 0;
    detectedByGhost = false;
    const warnEl0 = document.getElementById('ghost-warning');
    if (warnEl0) {warnEl0.style.opacity = '0';warnEl0.textContent = '他在找你';}
    stamina = CONFIG.staminaMax;
    isSprinting = false;
    staminaExhausted = false;
    
    // Request pointer lock on desktop.
    // 必须在用户点击手势内（按钮 onclick 触发的本函数调用中）同步请求：
    // 放进 setTimeout 会丢失 transient user activation，导致 requestPointerLock
    // 被拒并进入浏览器冷却期，于是第一下只切了地图却没锁上视角，需再点一次
    // 才能锁定（表现为“再来一次要点击两次才切换”）。
    // 若个别浏览器仍拒绝，requestLockRobust 内部的 promise.catch 会注册
    // pointerdown 重试监听作为兜底，下一次点击画布即可锁定。
    if (!isMobile()) {
        requestLockRobust();
    }
}

// “开始游戏”入口：黑屏转场切换到新地图（与“再来一次”一致）。
// 指针锁定必须在点击手势内同步请求，不能放进黑屏转场的延迟回调。
function beginGame() {
    unlockAudio(); // 在点击手势内解锁音频
    if (!isMobile()) requestLockRobust();
    blackTransition(() => {
        startGame();
        // 黑屏中直接隐藏开始界面（不淡出，避免黑屏淡出时残留）
        const s = document.getElementById('start-screen');
        if (s.style.display !== 'none') { s.style.display = 'none'; s.style.opacity = ''; }
    });
}

// 线性淡入/淡出 audio 音量
function fadeVolume(audio, from, to, duration, onDone) {
    if (!audio) { if (onDone) onDone(); return; }
    const start = performance.now();
    audio.volume = Math.max(0, Math.min(1, from));
    let raf = null;
    function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
        if (t < 1) {
            raf = requestAnimationFrame(tick);
        } else if (onDone) {
            onDone();
        }
    }
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); };
}

// 时间计数动画：从 0 快速增加到实际用时（easeOutCubic）
function animateTimeCounter(el, finalSeconds, durationMs, prefix) {
    if (!el) return;
    const start = performance.now();
    const fmt = (s) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = Math.floor(s % 60).toString().padStart(2, '0');
        return `${prefix}${m}:${sec}`;
    };
    function tick(now) {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3); // 先快后慢
        el.textContent = fmt(eased * finalSeconds);
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = fmt(finalSeconds);
    }
    requestAnimationFrame(tick);
}

function gameOver(won) {
    if(gameEnded) return;
    gameEnded = true;
    elapsedTime = Math.max(0,Date.now() - startTime);
    PlayerRankings.finish(won,elapsedTime);
    // 结算界面隐藏右上角按钮（仅游戏内进行时显示）
    document.getElementById('settings-btn').style.display = 'none';
    document.getElementById('mute-btn').style.display = 'none';
    // 隐藏鬼图逼近警告
    const warnEl = document.getElementById('ghost-warning');
    if (warnEl) warnEl.style.opacity = '0';
    // 游戏结束：停止鬼图 BGM
    if (bgmAudio) { try { bgmAudio.pause(); } catch (e) {} bgmAudio.currentTime = 0; bgmAudio.volume = 0; }
    // 立即停止脚步声
    silenceFootsteps();
    // 清理可能残留的锁定重试监听
    if (lockRetryHandler) { document.removeEventListener('pointerdown', lockRetryHandler, true); lockRetryHandler = null; }
    
    if (won) {
        document.exitPointerLock?.();
        document.getElementById('win-screen').style.display = 'flex';
        const seconds = Math.floor(elapsedTime / 1000);
        const etEl = document.getElementById('escape-time');
        etEl.textContent = '用时: 00:00';
        animateTimeCounter(etEl, seconds, 900, '用时: ');
    } else {
        document.exitPointerLock?.();
        // 被抓死亡流程：花屏直接硬切出现（无淡入），2秒后淡出花屏/音效并淡入失败界面
        const staticEl = document.getElementById('death-static');
        staticEl.style.transition = 'none'; // 出现直接切换，不要淡入
        staticEl.style.display = 'block';
        staticEl.style.opacity = '1';
        void staticEl.offsetWidth; // 强制重排

        // 播放死亡音效并快速淡入
        if (deathAudio) {
            try { deathAudio.currentTime = 0; } catch (e) {}
            deathAudio.volume = 0;
            const p = deathAudio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
            fadeVolume(deathAudio, 0, 1, 0.2);
        }

        // 记录最终存活时间，待失败界面淡入时从 0 快速累加
        const surviveSeconds = Math.floor(elapsedTime / 1000);
        const stEl = document.getElementById('survive-time');
        stEl.textContent = '存活时间: 00:00';

        // 2秒后：花屏淡出、音效淡出、失败界面淡入
        setTimeout(() => {
            staticEl.style.transition = 'opacity 0.6s ease';
            staticEl.style.opacity = '0';

            const overEl = document.getElementById('gameover-screen');
            overEl.style.display = 'flex';
            overEl.style.opacity = '0';
            void overEl.offsetWidth;
            overEl.style.opacity = '1';

            // 存活时间从 0 快速增加到实际用时
            animateTimeCounter(stEl, surviveSeconds, 900, '存活时间: ');

            if (deathAudio) {
                fadeVolume(deathAudio, deathAudio.volume, 0, 0.6, () => {
                    try { deathAudio.pause(); } catch (e) {}
                    try { deathAudio.currentTime = 0; } catch (e) {}
                });
            }

            setTimeout(() => {
                staticEl.style.display = 'none';
                staticEl.style.transition = '';
                staticEl.style.opacity = '';
            }, 650);
        }, 2000);
    }
}

// ==================== POINTER LOCK ====================
// 健壮地请求指针锁定：在本次手势内尝试；若被浏览器冷却期拒绝，
// 则注册一次性的 pointerdown 监听，等用户下一次点击（任意位置）自动重试，直到锁定成功。
let lockRetryHandler = null;
function requestLockRobust() {
    if (isMobile() || document.pointerLockElement === renderer.domElement) return;
    // Embedded browsers may reject pointer lock synchronously; drag/Q/E remain available.
    try {
        const p = renderer.domElement.requestPointerLock?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (error) { /* Use drag-to-look fallback. */ }
}

function restartGame() {
    // Reset UI
    document.getElementById('danger-vignette').style.background = 'transparent';
    unlockAudio(); // 在点击手势内解锁音频
    // 指针锁定必须在此处（点击手势内）同步请求，不能放进黑屏转场的延迟回调，
    // 否则会丢失用户手势导致需要再点一次才能锁定视角。
    if (!isMobile()) requestLockRobust();
    // 黑屏转场：先盖黑屏，在黑屏时切换新地图并隐藏结束界面，再淡出黑屏。
    blackTransition(() => {
        startGame();
        const win = document.getElementById('win-screen');
        const over = document.getElementById('gameover-screen');
        const staticEl = document.getElementById('death-static');
        if (win.style.display !== 'none') { win.style.display = 'none'; win.style.opacity = ''; }
        if (over.style.display !== 'none') { over.style.display = 'none'; over.style.opacity = ''; }
        if (staticEl.style.display !== 'none') {
            staticEl.style.display = 'none';
            staticEl.style.opacity = '';
            staticEl.style.transition = '';
        }
        if (deathAudio) { try { deathAudio.pause(); } catch (e) {} deathAudio.currentTime = 0; deathAudio.volume = 0; }
    });
}

// ==================== MAIN LOOP ====================
// 在屏幕上显示一次运行错误（便于无控制台时定位“卡死”根因）
let loopErrorShown = false;
function showLoopError(msg) {
    if (loopErrorShown) return;
    loopErrorShown = true;
    let el = document.getElementById('loop-error');
    if (!el) {
        el = document.createElement('div');
        el.id = 'loop-error';
        el.style.cssText = 'position:fixed;left:10px;bottom:10px;max-width:78%;z-index:999;' +
            'background:rgba(130,0,0,0.92);color:#fff;font:12px/1.5 monospace;' +
            'padding:8px 10px;border-radius:6px;white-space:pre-wrap;pointer-events:none;';
        document.body.appendChild(el);
    }
    el.textContent = '运行错误（请截图/复制给开发者）：\n' + msg;
}

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);

    // 即使某一帧的更新逻辑抛出异常，也保证 renderer.render 始终执行，
    // 避免画面定格（”卡死“）。异常信息会被打印并展示在屏幕上以便定位根因。
    try {
        if (gameStarted && !gameEnded && !gamePaused) {
            updatePlayer(delta);
            if(!gameEnded) { updateItems(delta); updateGhostAI(delta); }
            updateFlashlight(delta);
            updateTimer();
            drawMinimap();
        }
    } catch (err) {
        console.error('[animate loop error]', err);
        showLoopError((err && err.stack) ? err.stack : String(err));
    }

    renderer.render(scene, camera);
}

// ==================== START ====================
init();

// Show mobile controls on mobile devices
if (isMobile()) {
    document.getElementById('mobile-controls').style.display = 'block';
}
