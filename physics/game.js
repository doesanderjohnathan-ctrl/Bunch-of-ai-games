/* Rube Goldberg Machine Simulator - Game Engine */

const { Engine, Render, Runner, World, Bodies, Body, Composite, Composites, Constraint, Mouse, MouseConstraint, Events, Vector, Query, Collision } = Matter;

const THEMES = {
    modern: { bg: '#1a1a2e', wall: '#16213e', body: '#e94560', accent: '#0f3460', highlight: '#ff6b6b', text: '#f1f1f1', success: '#4ecca3', warning: '#f4d03f' },
    space: { bg: '#0b0d17', wall: '#161b33', body: '#7b61ff', accent: '#232946', highlight: '#a594f9', text: '#e0e0ff', success: '#2cb67d', warning: '#f4d03f' },
    medieval: { bg: '#2c1810', wall: '#3e2723', body: '#d4a017', accent: '#5d4037', highlight: '#f4d03f', text: '#f5e6cc', success: '#4ecca3', warning: '#f4d03f' },
    factory: { bg: '#1a1a1a', wall: '#2d2d2d', body: '#ff6b35', accent: '#454545', highlight: '#ff8c61', text: '#e0e0e0', success: '#4caf50', warning: '#f4d03f' },
    neon: { bg: '#050510', wall: '#0a0a1a', body: '#ff00ff', accent: '#14142b', highlight: '#ff66ff', text: '#ffffff', success: '#00ff88', warning: '#ffff00' }
};

const ELEMENT_DEFS = {
    ball: { type: 'ball', label: 'Ball', w: 30, h: 30, dynamic: true, shape: 'circle', restitution: 0.6, friction: 0.05, density: 0.04 },
    box: { type: 'box', label: 'Box', w: 50, h: 50, dynamic: true, shape: 'rect', restitution: 0.3, friction: 0.5, density: 0.002 },
    domino: { type: 'domino', label: 'Domino', w: 20, h: 80, dynamic: true, shape: 'rect', restitution: 0.1, friction: 0.6, density: 0.002 },
    ramp: { type: 'ramp', label: 'Ramp', w: 150, h: 20, dynamic: false, shape: 'rect', angle: Math.PI / 6, restitution: 0.2, friction: 0.3 },
    platform: { type: 'platform', label: 'Platform', w: 150, h: 15, dynamic: false, shape: 'rect', restitution: 0.2, friction: 0.5 },
    spring: { type: 'spring', label: 'Spring', w: 50, h: 20, dynamic: false, shape: 'rect', restitution: 1.2, friction: 0.1 },
    fan: { type: 'fan', label: 'Fan', w: 60, h: 60, dynamic: false, shape: 'rect', restitution: 0.2, friction: 0.5 },
    seesaw: { type: 'seesaw', label: 'Seesaw', w: 200, h: 12, dynamic: true, shape: 'rect', density: 0.003, restitution: 0.2, friction: 0.5 },
    pendulum: { type: 'pendulum', label: 'Pendulum', w: 30, h: 30, dynamic: true, shape: 'circle', density: 0.05, restitution: 0.5, friction: 0.05 },
    cannon: { type: 'cannon', label: 'Cannon', w: 60, h: 30, dynamic: false, shape: 'rect', restitution: 0.2, friction: 0.5 },
    conveyor: { type: 'conveyor', label: 'Conveyor', w: 150, h: 20, dynamic: false, shape: 'rect', restitution: 0.1, friction: 0.8 },
    bucket: { type: 'bucket', label: 'Bucket', w: 80, h: 60, dynamic: false, shape: 'bucket', restitution: 0.2, friction: 0.5 },
    teleporter: { type: 'teleporter', label: 'Teleporter', w: 40, h: 40, dynamic: false, shape: 'circle', isSensor: true },
    bouncer: { type: 'bouncer', label: 'Bouncer', w: 40, h: 40, dynamic: false, shape: 'circle', restitution: 1.5, friction: 0.1 }
};

const game = {
    engine: null,
    runner: null,
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    currentScreen: 'menu',
    currentLevel: 0,
    theme: 'modern',
    isPaused: false,
    isSlowMo: false,
    isSimulating: false,
    designMode: false,
    selectedTool: null,
    selectedBody: null,
    bodies: new Map(), // id -> { type, props, custom }
    mouseConstraint: null,
    animationId: null,
    levelData: null,
    startTime: 0,
    goalReached: false,
    teleporters: [], // pairs of teleporter bodies
    fans: [],
    conveyors: [],
    springs: [],
    cannons: [],
    pendulums: [], // { constraint, anchor }
    seesaws: [], // { plank, pivot }
    designBodies: [], // saved design state
    levelProgress: {},

    init() {
        this.loadProgress();
        this.setupEventListeners();
        this.setTheme('modern');
    },

    loadProgress() {
        try {
            const saved = localStorage.getItem('rubeProgress');
            if (saved) this.levelProgress = JSON.parse(saved);
        } catch (e) { }
    },

    saveProgress() {
        try { localStorage.setItem('rubeProgress', JSON.stringify(this.levelProgress)); } catch (e) { }
    },

    setTheme(name) {
        this.theme = name;
        document.body.className = `theme-${name}`;
        document.getElementById('menu-theme').value = name;
        document.getElementById('game-theme').value = name;
        document.getElementById('design-theme').value = name;
    },

    showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`${name}-screen`).classList.add('active');
        this.currentScreen = name;
    },

    showMenu() {
        this.stopSimulation();
        this.showScreen('menu');
    },

    showLevelSelect() {
        this.renderLevelGrid();
        this.showScreen('level-select');
    },

    showGame() {
        this.showScreen('game');
        this.resizeCanvas('sim-canvas');
    },

    showDesignMode() {
        this.showScreen('design');
        this.resizeCanvas('design-canvas');
        this.initDesignMode();
    },

    showTutorial() {
        document.getElementById('tutorial-modal').classList.add('active');
    },

    hideTutorial() {
        document.getElementById('tutorial-modal').classList.remove('active');
    },

    showWin() {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        const msg = document.getElementById('win-message');
        const stats = document.getElementById('win-stats');
        const level = LEVELS[this.currentLevel];
        msg.textContent = level ? level.winMessage || 'Great chain reaction!' : 'Machine complete!';
        stats.innerHTML = `
            <div class="stat-item"><div class="stat-value">${elapsed}s</div><div class="stat-label">Time</div></div>
            <div class="stat-item"><div class="stat-value">${this.bodies.size}</div><div class="stat-label">Parts</div></div>
        `;
        document.getElementById('win-modal').classList.add('active');
    },

    hideWin() {
        document.getElementById('win-modal').classList.remove('active');
    },

    nextLevel() {
        this.hideWin();
        if (this.currentLevel < LEVELS.length - 1) {
            this.loadLevel(this.currentLevel + 1);
        } else {
            this.showMenu();
        }
    },

    renderLevelGrid() {
        const grid = document.getElementById('level-grid');
        grid.innerHTML = '';
        LEVELS.forEach((lvl, idx) => {
            const prog = this.levelProgress[idx] || { stars: 0, unlocked: idx === 0 || (this.levelProgress[idx - 1] || {}).completed };
            if (idx > 0 && !prog.unlocked) prog.unlocked = !!(this.levelProgress[idx - 1] || {}).completed;
            const card = document.createElement('div');
            card.className = `level-card ${prog.unlocked ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="level-number">${idx + 1}</div>
                <div class="level-title">${lvl.name}</div>
                <div class="level-desc">${lvl.description}</div>
                <div class="level-stars">
                    ${[1, 2, 3].map(s => `<span class="star ${prog.stars >= s ? 'filled' : ''}">★</span>`).join('')}
                </div>
            `;
            if (prog.unlocked) {
                card.onclick = () => this.loadLevel(idx);
            }
            grid.appendChild(card);
        });
    },

    resizeCanvas(id) {
        const canvas = document.getElementById(id);
        if (!canvas) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        this.width = rect.width;
        this.height = rect.height;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    },

    createEngine() {
        const engine = Engine.create({
            gravity: { x: 0, y: 1 }
        });
        return engine;
    },

    createWalls() {
        const t = 60;
        const w = this.width, h = this.height;
        return [
            Bodies.rectangle(w / 2, -t / 2, w + 200, t, { isStatic: true, label: 'Wall', render: { fillStyle: THEMES[this.theme].wall } }),
            Bodies.rectangle(w / 2, h + t / 2, w + 200, t, { isStatic: true, label: 'Wall', render: { fillStyle: THEMES[this.theme].wall } }),
            Bodies.rectangle(-t / 2, h / 2, t, h + 200, { isStatic: true, label: 'Wall', render: { fillStyle: THEMES[this.theme].wall } }),
            Bodies.rectangle(w + t / 2, h / 2, t, h + 200, { isStatic: true, label: 'Wall', render: { fillStyle: THEMES[this.theme].wall } })
        ];
    },

    // ========== LEVEL SYSTEM ==========
    loadLevel(idx) {
        this.currentLevel = idx;
        this.levelData = LEVELS[idx];
        this.designMode = false;
        this.setTheme(this.levelData.theme || 'modern');
        this.showGame();
        this.stopSimulation();
        this.engine = this.createEngine();
        this.engine.gravity = this.levelData.gravity || { x: 0, y: 1 };
        this.bodies.clear();
        this.teleporters = [];
        this.fans = [];
        this.conveyors = [];
        this.springs = [];
        this.cannons = [];
        this.pendulums = [];
        this.seesaws = [];
        this.goalReached = false;

        document.getElementById('level-name').textContent = this.levelData.name;
        document.getElementById('level-status').textContent = 'Ready';
        document.getElementById('level-status').className = 'status-badge';

        World.add(this.engine.world, this.createWalls());
        this.levelData.setup(this.engine, this.width, this.height, this);
        this.setupMouse('sim-canvas');
        this.startRenderLoop();
    },

    // ========== DESIGN MODE ==========
    initDesignMode() {
        this.designMode = true;
        this.isSimulating = false;
        this.stopSimulation();
        this.engine = this.createEngine();
        this.bodies.clear();
        this.teleporters = [];
        this.fans = [];
        this.conveyors = [];
        this.springs = [];
        this.cannons = [];
        this.pendulums = [];
        this.seesaws = [];
        World.add(this.engine.world, this.createWalls());
        this.setupMouse('design-canvas');
        this.selectedTool = null;
        this.selectedBody = null;
        this.designBodies = [];
        document.querySelectorAll('.palette-item').forEach(el => el.classList.remove('active'));
        this.updatePropertiesPanel();
        this.startRenderLoop();
    },

    setupMouse(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (this.mouseConstraint) {
            World.remove(this.engine.world, this.mouseConstraint);
        }
        const mouse = Mouse.create(canvas);
        const mc = MouseConstraint.create(this.engine, {
            mouse: mouse,
            constraint: { stiffness: 0.2, render: { visible: false } }
        });
        this.mouseConstraint = mc;
        World.add(this.engine.world, mc);

        Events.on(mc, 'mousedown', (e) => this.onMouseDown(e, canvasId));
        Events.on(mc, 'mouseup', (e) => this.onMouseUp(e, canvasId));
    },

    onMouseDown(e, canvasId) {
        const mousePos = e.mouse.position;
        if (this.currentScreen === 'design' && !this.isSimulating) {
            if (e.source.body) {
                this.selectedBody = e.source.body;
                this.updatePropertiesPanel();
            } else if (this.selectedTool) {
                this.placeElement(this.selectedTool, mousePos.x, mousePos.y);
            }
        }
    },

    onMouseUp(e, canvasId) {
        if (this.currentScreen === 'design' && this.selectedBody && !this.isSimulating) {
            // Snap or update after drag
        }
    },

    placeElement(type, x, y) {
        const def = ELEMENT_DEFS[type];
        if (!def) return;
        const body = this.createElementBody(type, x, y, def);
        if (!body) return;
        if (type === 'teleporter') {
            const pair = this.teleporters.find(tp => tp.length < 2);
            if (pair) { pair.push(body); body.label = 'Teleporter B'; }
            else { this.teleporters.push([body]); body.label = 'Teleporter A'; }
        }
        if (type === 'fan') this.fans.push(body);
        if (type === 'conveyor') this.conveyors.push(body);
        if (type === 'spring') this.springs.push(body);
        if (type === 'cannon') this.cannons.push(body);
        if (type === 'pendulum') {
            const anchor = Bodies.circle(x, y - 100, 5, { isStatic: true, render: { visible: false } });
            const constraint = Constraint.create({
                bodyA: anchor, bodyB: body,
                length: 120, stiffness: 1, damping: 0.01
            });
            World.add(this.engine.world, [anchor, constraint]);
            this.pendulums.push({ body, anchor, constraint });
        }
        if (type === 'seesaw') {
            const pivot = Bodies.circle(x, y + 10, 10, { isStatic: true, restitution: 0, friction: 0.5 });
            const constraint = Constraint.create({ bodyA: pivot, bodyB: body, pointA: { x: 0, y: 0 }, pointB: { x: 0, y: 0 }, stiffness: 1, length: 0 });
            World.add(this.engine.world, [pivot, constraint]);
            this.seesaws.push({ body, pivot, constraint });
        }
        World.add(this.engine.world, body);
        this.bodies.set(body.id, { type, props: { ...def } });
    },

    createElementBody(type, x, y, def) {
        const t = THEMES[this.theme];
        let body;
        const common = {
            restitution: def.restitution || 0.5,
            friction: def.friction || 0.5,
            density: def.density || 0.001,
            isStatic: !def.dynamic,
            label: def.label,
            render: { fillStyle: t.body, strokeStyle: t.highlight, lineWidth: 2 }
        };
        if (def.isSensor) common.isSensor = true;

        if (def.shape === 'circle') {
            body = Bodies.circle(x, y, def.w / 2, common);
        } else if (def.shape === 'bucket') {
            const w = def.w, h = def.h, th = 8;
            const left = Bodies.rectangle(x - w / 2 + th / 2, y + h / 4, th, h / 2, { isStatic: true, ...common });
            const right = Bodies.rectangle(x + w / 2 - th / 2, y + h / 4, th, h / 2, { isStatic: true, ...common });
            const bottom = Bodies.rectangle(x, y + h / 2 - th / 2, w, th, { isStatic: true, ...common });
            body = Body.create({
                parts: [left, right, bottom],
                isStatic: true,
                label: def.label,
                render: common.render
            });
        } else {
            body = Bodies.rectangle(x, y, def.w, def.h, common);
        }
        if (def.angle) Body.rotate(body, def.angle);
        return body;
    },

    selectTool(type) {
        this.selectedTool = type;
        document.querySelectorAll('.palette-item').forEach(el => el.classList.toggle('active', el.dataset.type === type));
        document.getElementById('design-hint').textContent = `Click on canvas to place ${ELEMENT_DEFS[type].label}`;
    },

    clearDesign() {
        const mouse = this.mouseConstraint;
        World.clear(this.engine.world);
        this.bodies.clear();
        this.teleporters = []; this.fans = []; this.conveyors = []; this.springs = [];
        this.cannons = []; this.pendulums = []; this.seesaws = [];
        this.selectedBody = null;
        this.designSnapshot = null;
        this.updatePropertiesPanel();
        World.add(this.engine.world, this.createWalls());
        if (mouse) {
            World.add(this.engine.world, mouse);
            this.mouseConstraint = mouse;
        }
    },

    testDesign() {
        this.isSimulating = !this.isSimulating;
        const btn = document.querySelector('#design-screen .controls-bar .btn-primary');
        btn.textContent = this.isSimulating ? '⏹ Stop' : '▶ Test';
        document.getElementById('design-hint').textContent = this.isSimulating ? 'Simulation running...' : 'Click an element to select, then click on canvas to place. Right-click to remove.';
        if (this.isSimulating) {
            this.takeDesignSnapshot();
            this.runner = Runner.create();
            Runner.run(this.runner, this.engine);
            this.fireCannons();
        } else {
            this.resetDesign();
        }
    },

    takeDesignSnapshot() {
        this.designSnapshot = new Map();
        Composite.allBodies(this.engine.world).forEach(b => {
            if (!this.bodies.has(b.id)) return;
            this.designSnapshot.set(b.id, {
                x: b.position.x, y: b.position.y, angle: b.angle,
                velocity: { x: 0, y: 0 }, angularVelocity: 0
            });
        });
    },

    restoreDesignSnapshot() {
        if (!this.designSnapshot) return;
        // Only remove cannonballs spawned during test; leave all user-placed parts and constraints alone
        const toRemove = Composite.allBodies(this.engine.world).filter(b => b.label === 'Cannonball');
        World.remove(this.engine.world, toRemove);
        this.designSnapshot.forEach((state, id) => {
            const b = Composite.get(this.engine.world, id, 'body');
            if (b) {
                Body.setPosition(b, { x: state.x, y: state.y });
                Body.setAngle(b, state.angle);
                Body.setVelocity(b, { x: 0, y: 0 });
                Body.setAngularVelocity(b, 0);
            }
        });
    },

    resetDesign() {
        this.isSimulating = false;
        const btn = document.querySelector('#design-screen .controls-bar .btn-primary');
        if (btn) btn.textContent = '▶ Test';
        this.stopSimulation();
        this.restoreDesignSnapshot();
    },

    // ========== SIMULATION CONTROL ==========
    startSimulation() {
        if (!this.engine) return;
        this.isSimulating = true;
        this.startTime = Date.now();
        this.goalReached = false;
        document.getElementById('level-status').textContent = 'Running';
        document.getElementById('level-status').className = 'status-badge running';
        document.getElementById('play-btn').textContent = '⏹ Stop';
        document.getElementById('play-btn').onclick = () => this.stopSimulation();
        document.getElementById('edit-btn').style.display = 'none';

        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);
        this.fireCannons();
    },

    stopSimulation() {
        this.isSimulating = false;
        if (this.runner) {
            Runner.stop(this.runner);
            this.runner = null;
        }
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.textContent = '▶ Start';
            playBtn.onclick = () => this.startSimulation();
        }
        const status = document.getElementById('level-status');
        if (status) {
            status.textContent = this.goalReached ? 'Complete' : 'Ready';
            status.className = this.goalReached ? 'status-badge complete' : 'status-badge';
        }

    },

    resetSimulation() {
        this.stopSimulation();
        if (this.levelData) {
            this.loadLevel(this.currentLevel);
        }
    },

    stepFrame() {
        if (!this.isSimulating && this.engine) {
            Engine.update(this.engine, 1000 / 60);
            this.update();
        }
    },

    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.engine) this.engine.enabled = !this.isPaused;
        document.getElementById('pause-btn').textContent = this.isPaused ? 'Resume' : 'Pause';
        document.getElementById('design-pause-btn').textContent = this.isPaused ? 'Resume' : 'Pause';
    },

    toggleSlowMo() {
        this.isSlowMo = !this.isSlowMo;
        document.getElementById('slowmo-btn').textContent = this.isSlowMo ? 'Normal' : 'Slow Mo';
        if (this.runner) this.runner.delta = this.isSlowMo ? 1000 / 180 : 1000 / 60;
    },

    fireCannons() {
        this.cannons.forEach(cannon => {
            const ball = Bodies.circle(cannon.position.x + 40, cannon.position.y - 10, 12, {
                restitution: 0.5, density: 0.04, friction: 0.05, label: 'Cannonball'
            });
            Body.setVelocity(ball, { x: 15, y: -5 });
            World.add(this.engine.world, ball);
        });
    },

    // ========== UPDATE & RENDER ==========
    startRenderLoop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        const loop = () => {
            this.update();
            this.draw();
            this.animationId = requestAnimationFrame(loop);
        };
        loop();
    },

    update() {
        if (!this.engine || this.isPaused) return;
        const bodies = Composite.allBodies(this.engine.world);

        // Decrement cooldowns
        bodies.forEach(b => {
            if (b._springCooldown && b._springCooldown > 0) b._springCooldown--;
            if (b._teleportCooldown && b._teleportCooldown > 0) b._teleportCooldown--;
        });

        // Fan forces
        this.fans.forEach(fan => {
            const range = 150;
            bodies.forEach(b => {
                if (!b.isStatic && b !== fan) {
                    const dist = Vector.magnitude(Vector.sub(b.position, fan.position));
                    if (dist < range) {
                        const force = Vector.mult(Vector.normalise(Vector.sub(b.position, fan.position)), 0.03 * (1 - dist / range));
                        Body.applyForce(b, b.position, { x: force.x, y: -0.05 });
                    }
                }
            });
        });

        // Conveyor push
        this.conveyors.forEach(conv => {
            bodies.forEach(b => {
                if (!b.isStatic && b !== conv && Math.abs(b.position.x - conv.position.x) < (conv.bounds.max.x - conv.bounds.min.x) * 0.5 &&
                    Math.abs(b.position.y - conv.position.y) < 25) {
                    Body.applyForce(b, b.position, { x: 0.008, y: 0 });
                }
            });
        });

        // Spring bounce
        this.springs.forEach(spring => {
            bodies.forEach(b => {
                if (!b.isStatic && b !== spring && !b._springCooldown) {
                    const col = Collision.collides(b, spring);
                    if (col && col.collided) {
                        Body.setVelocity(b, { x: b.velocity.x * 0.8, y: -15 });
                        b._springCooldown = 30;
                    }
                }
            });
        });

        // Teleport
        this.teleporters.forEach(pair => {
            if (pair.length === 2) {
                const [a, b] = pair;
                bodies.forEach(body => {
                    if (!body.isStatic && body !== a && body !== b && !body._teleportCooldown) {
                        const col = Collision.collides(body, a);
                        if (col && col.collided) {
                            Body.setPosition(body, { x: b.position.x, y: b.position.y - 30 });
                            Body.setVelocity(body, { x: body.velocity.x * 0.5, y: -5 });
                            body._teleportCooldown = 60;
                        }
                    }
                });
            }
        });

        // Level win check
        if (this.isSimulating && this.levelData && !this.goalReached) {
            if (this.levelData.checkWin(this.engine, this)) {
                this.goalReached = true;
                this.onLevelWin();
            }
        }
    },

    draw() {
        if (!this.ctx || !this.canvas) return;
        const ctx = this.ctx;
        const t = THEMES[this.theme];
        ctx.clearRect(0, 0, this.width, this.height);

        // Background
        ctx.fillStyle = t.bg;
        ctx.fillRect(0, 0, this.width, this.height);

        // Grid lines
        ctx.strokeStyle = t.wall + '40';
        ctx.lineWidth = 1;
        for (let x = 0; x < this.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke(); }
        for (let y = 0; y < this.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke(); }

        if (!this.engine) return;
        const bodies = Composite.allBodies(this.engine.world);
        const constraints = Composite.allConstraints(this.engine.world);

        // Draw constraints
        constraints.forEach(c => {
            if (!c.render.visible && c !== this.mouseConstraint?.constraint) return;
            const pA = c.bodyA ? Vector.add(c.bodyA.position, c.pointA) : c.pointA;
            const pB = c.bodyB ? Vector.add(c.bodyB.position, c.pointB) : c.pointB;
            ctx.beginPath();
            ctx.moveTo(pA.x, pA.y);
            ctx.lineTo(pB.x, pB.y);
            ctx.strokeStyle = t.text + '60';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Draw bodies
        bodies.forEach(body => {
            if (!body.render.visible) return;
            ctx.beginPath();
            const vertices = body.vertices;
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let j = 1; j < vertices.length; j++) ctx.lineTo(vertices[j].x, vertices[j].y);
            ctx.closePath();

            const info = this.bodies.get(body.id);
            const type = info ? info.type : null;

            // Style based on type and theme
            if (body.label === 'Wall') {
                ctx.fillStyle = t.wall;
                ctx.strokeStyle = t.accent;
            } else if (type === 'teleporter') {
                ctx.fillStyle = t.accent + '80';
                ctx.strokeStyle = t.highlight;
                ctx.setLineDash([4, 4]);
            } else if (type === 'fan') {
                ctx.fillStyle = t.body + '60';
                ctx.strokeStyle = t.highlight;
                ctx.lineWidth = body.render.lineWidth || 2;
                ctx.fill();
                ctx.stroke();
                ctx.setLineDash([]);
                // Draw fan blades
                ctx.save();
                ctx.translate(body.position.x, body.position.y);
                const time = Date.now() / 100;
                ctx.rotate(time);
                for (let i = 0; i < 4; i++) {
                    ctx.rotate(Math.PI / 2);
                    ctx.fillStyle = t.highlight;
                    ctx.fillRect(-2, -25, 4, 20);
                }
                ctx.restore();
                return; // skip default fill/stroke
            } else if (type === 'spring') {
                ctx.fillStyle = t.warning || '#f4d03f';
                ctx.strokeStyle = '#d4ac0d';
            } else if (type === 'cannon') {
                ctx.fillStyle = t.body;
                ctx.strokeStyle = t.highlight;
            } else if (type === 'bouncer') {
                ctx.fillStyle = '#f39c12';
                ctx.strokeStyle = '#e67e22';
            } else if (body.label === 'Goal') {
                ctx.fillStyle = t.success + '40';
                ctx.strokeStyle = t.success;
                ctx.setLineDash([6, 4]);
            } else {
                ctx.fillStyle = body.render.fillStyle || t.body;
                ctx.strokeStyle = body.render.strokeStyle || t.highlight;
            }

            ctx.lineWidth = body.render.lineWidth || 2;
            ctx.fill();
            ctx.stroke();
            ctx.setLineDash([]);

            // Special overlays
            if (type === 'teleporter') {
                ctx.fillStyle = t.text;
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(body.label || 'TP', body.position.x, body.position.y + 3);
            }
            if (type === 'conveyor') {
                ctx.strokeStyle = t.text + '40';
                ctx.lineWidth = 1;
                const y = body.position.y;
                const bw = body.bounds.max.x - body.bounds.min.x;
                for (let i = -bw / 2; i < bw / 2; i += 12) {
                    const offset = (Date.now() / 50) % 12;
                    ctx.beginPath();
                    ctx.moveTo(body.position.x + i + offset, y - 6);
                    ctx.lineTo(body.position.x + i + offset, y + 6);
                    ctx.stroke();
                }
            }
            if (type === 'cannon') {
                ctx.fillStyle = t.text;
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('💥', body.position.x, body.position.y + 3);
            }
            if (body.label === 'Goal') {
                ctx.fillStyle = t.success;
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('GOAL', body.position.x, body.position.y + 4);
            }
        });

        // Draw mouse constraint line
        if (this.mouseConstraint && this.mouseConstraint.body) {
            const mc = this.mouseConstraint;
            ctx.beginPath();
            ctx.moveTo(mc.mouse.position.x, mc.mouse.position.y);
            const bodyPos = mc.body.position;
            ctx.lineTo(bodyPos.x, bodyPos.y);
            ctx.strokeStyle = t.highlight + '80';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    },

    onLevelWin() {
        this.stopSimulation();
        const elapsed = (Date.now() - this.startTime) / 1000;
        let stars = 1;
        if (elapsed < (this.levelData.parTime || 20)) stars = 2;
        if (elapsed < (this.levelData.parTime || 20) * 0.6) stars = 3;
        this.levelProgress[this.currentLevel] = { completed: true, stars, unlocked: true };
        this.saveProgress();
        this.showWin();
    },

    // ========== PROPERTIES PANEL ==========
    updatePropertiesPanel() {
        const panel = document.getElementById('prop-content');
        if (!this.selectedBody || !this.bodies.has(this.selectedBody.id)) {
            panel.innerHTML = '<p class="no-selection">Select an element to edit properties</p>';
            return;
        }
        const info = this.bodies.get(this.selectedBody.id);
        const b = this.selectedBody;
        panel.innerHTML = `
            <div class="prop-group">
                <label>Type</label>
                <div style="font-weight:700;color:var(--accent)">${info.type}</div>
            </div>
            <div class="prop-group">
                <label>Rotation <span class="prop-value">${(b.angle * 180 / Math.PI).toFixed(1)}°</span></label>
                <input type="range" min="-180" max="180" value="${(b.angle * 180 / Math.PI).toFixed(0)}" oninput="game.rotateSelected(this.value)">
            </div>
            <div class="prop-group">
                <label>Scale</label>
                <input type="range" min="0.5" max="2" step="0.1" value="1" oninput="game.scaleSelected(this.value)">
            </div>
            <div class="prop-group">
                <label>Restitution</label>
                <input type="range" min="0" max="1.5" step="0.1" value="${b.restitution}" oninput="game.propSelected('restitution', this.value)">
            </div>
            <div class="prop-group">
                <label>Friction</label>
                <input type="range" min="0" max="1" step="0.05" value="${b.friction}" oninput="game.propSelected('friction', this.value)">
            </div>
            <div class="prop-group">
                <button class="btn btn-small" style="width:100%;background:var(--accent)" onclick="game.deleteSelected()">Delete Element</button>
            </div>
        `;
    },

    rotateSelected(deg) {
        if (!this.selectedBody) return;
        Body.setAngle(this.selectedBody, deg * Math.PI / 180);
    },

    scaleSelected(scale) {
        if (!this.selectedBody) return;
        const last = this.selectedBody._lastScale || 1;
        Body.scale(this.selectedBody, scale / last, scale / last);
        this.selectedBody._lastScale = scale;
    },

    propSelected(prop, val) {
        if (!this.selectedBody) return;
        if (prop === 'restitution') this.selectedBody.restitution = parseFloat(val);
        if (prop === 'friction') this.selectedBody.friction = parseFloat(val);
    },

    deleteSelected() {
        if (!this.selectedBody) return;
        World.remove(this.engine.world, this.selectedBody);
        this.bodies.delete(this.selectedBody.id);
        this.selectedBody = null;
        this.updatePropertiesPanel();
    },

    // ========== SAVE / LOAD ==========
    saveDesign() {
        const data = {
            theme: this.theme,
            bodies: Array.from(this.bodies.entries()).map(([id, info]) => {
                const body = Composite.get(this.engine.world, id, 'body');
                if (!body) return null;
                return {
                    type: info.type,
                    x: body.position.x,
                    y: body.position.y,
                    angle: body.angle,
                    restitution: body.restitution,
                    friction: body.friction,
                    density: body.density
                };
            }).filter(Boolean)
        };
        localStorage.setItem('rubeDesign', JSON.stringify(data));
        alert('Design saved to local storage!');
    },

    loadDesign() {
        const saved = localStorage.getItem('rubeDesign');
        if (saved) {
            if (confirm('Load saved design from browser storage?\nClick OK to load saved design, or Cancel to import from a JSON file.')) {
                try {
                    this.importDesign(JSON.parse(saved));
                    return;
                } catch (e) {
                    alert('Failed to load saved design');
                }
            }
        }
        document.getElementById('load-file').click();
    },

    exportDesign() {
        const data = {
            theme: this.theme,
            bodies: Array.from(this.bodies.entries()).map(([id, info]) => {
                const body = Composite.get(this.engine.world, id, 'body');
                if (!body) return null;
                return { type: info.type, x: body.position.x, y: body.position.y, angle: body.angle };
            }).filter(Boolean)
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rube-goldberg-design.json';
        a.click();
        URL.revokeObjectURL(url);
    },

    setupEventListeners() {
        document.getElementById('load-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    this.importDesign(data);
                } catch (err) { alert('Invalid file'); }
            };
            reader.readAsText(file);
        });

        document.querySelectorAll('.palette-item').forEach(el => {
            el.addEventListener('click', () => this.selectTool(el.dataset.type));
        });

        window.addEventListener('resize', () => {
            if (this.currentScreen === 'game') this.resizeCanvas('sim-canvas');
            if (this.currentScreen === 'design') this.resizeCanvas('design-canvas');
        });

        // Right click to delete in design mode
        document.getElementById('design-canvas').addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.engine || this.isSimulating) return;
            const rect = e.target.getBoundingClientRect();
            const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const bodies = Composite.allBodies(this.engine.world);
            const clicked = Query.point(bodies, mouse);
            if (clicked.length > 0) {
                const body = clicked[0];
                if (this.bodies.has(body.id)) {
                    World.remove(this.engine.world, body);
                    this.bodies.delete(body.id);
                    if (this.selectedBody === body) this.selectedBody = null;
                    this.updatePropertiesPanel();
                }
            }
        });
    },

    importDesign(data) {
        this.clearDesign();
        if (data.theme) this.setTheme(data.theme);
        data.bodies.forEach(b => {
            this.placeElement(b.type, b.x, b.y);
            const body = Array.from(this.bodies.keys()).pop();
            const actual = Composite.get(this.engine.world, body, 'body');
            if (actual) {
                if (b.angle !== undefined) Body.setAngle(actual, b.angle);
                if (b.restitution !== undefined) actual.restitution = b.restitution;
                if (b.friction !== undefined) actual.friction = b.friction;
                if (b.density !== undefined) actual.density = b.density;
            }
        });
    }
};

// ========== LEVELS ==========
const LEVELS = [
    {
        name: 'Domino Effect',
        description: 'Start the chain reaction',
        theme: 'modern',
        parTime: 8,
        winMessage: 'Perfect chain reaction!',
        setup(engine, w, h, game) {
            const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, label: 'Wall' });
            World.add(engine.world, ground);

            // Ramp to guide the ball onto the dominoes
            const ramp = Bodies.rectangle(w / 2 - 280, h - 120, 200, 15, { isStatic: true, angle: Math.PI / 6, label: 'Ramp' });
            World.add(engine.world, ramp);

            // 8 dominoes grounded on the floor
            for (let i = 0; i < 8; i++) {
                const dom = Bodies.rectangle(w / 2 - 150 + i * 40, h - 20, 20, 80, {
                    restitution: 0.1, friction: 0.6, density: 0.002, label: 'Domino'
                });
                World.add(engine.world, dom);
                game.bodies.set(dom.id, { type: 'domino' });
            }

            // Bowling ball starter at the top of the ramp
            const ball = Bodies.circle(w / 2 - 340, h - 200, 20, { restitution: 0.5, density: 0.04, label: 'Starter' });
            World.add(engine.world, ball);
            game.bodies.set(ball.id, { type: 'ball' });

            // Goal sensor
            const goal = Bodies.rectangle(w / 2 + 200, h - 30, 80, 60, { isStatic: true, isSensor: true, label: 'Goal' });
            World.add(engine.world, goal);
        },
        checkWin(engine, game) {
            const goal = Composite.allBodies(engine.world).find(b => b.label === 'Goal');
            const ball = Composite.allBodies(engine.world).find(b => b.label === 'Starter');
            return goal && ball && Vector.magnitude(Vector.sub(ball.position, goal.position)) < 60;
        }
    },
    {
        name: 'Rolling Ramp',
        description: 'Guide the ball down',
        theme: 'modern',
        parTime: 10,
        winMessage: 'Smooth landing!',
        setup(engine, w, h, game) {
            const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, label: 'Wall' });
            World.add(engine.world, ground);

            // Start platform
            const platform = Bodies.rectangle(80, 140, 100, 15, { isStatic: true, label: 'Platform' });
            World.add(engine.world, platform);

            // Three ramps forming a zig-zag staircase
            const ramp1 = Bodies.rectangle(w / 2 - 150, h - 180, 300, 15, { isStatic: true, angle: Math.PI / 6, label: 'Ramp' });
            const ramp2 = Bodies.rectangle(w / 2 + 50, h - 120, 300, 15, { isStatic: true, angle: -Math.PI / 6, label: 'Ramp' });
            const ramp3 = Bodies.rectangle(w / 2 - 50, h - 60, 250, 15, { isStatic: true, angle: Math.PI / 8, label: 'Ramp' });
            World.add(engine.world, [ramp1, ramp2, ramp3]);

            const ball = Bodies.circle(80, 100, 20, { restitution: 0.5, density: 0.04, label: 'Starter' });
            World.add(engine.world, ball);
            game.bodies.set(ball.id, { type: 'ball' });

            const goal = Bodies.rectangle(w / 2 + 150, h - 30, 80, 60, { isStatic: true, isSensor: true, label: 'Goal' });
            World.add(engine.world, goal);
        },
        checkWin(engine, game) {
            const goal = Composite.allBodies(engine.world).find(b => b.label === 'Goal');
            const ball = Composite.allBodies(engine.world).find(b => b.label === 'Starter');
            return goal && ball && Vector.magnitude(Vector.sub(ball.position, goal.position)) < 50;
        }
    },
    {
        name: 'Seesaw Launch',
        description: 'Tip the seesaw just right',
        theme: 'medieval',
        parTime: 12,
        winMessage: 'Balanced to perfection!',
        setup(engine, w, h, game) {
            const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, label: 'Wall' });
            World.add(engine.world, ground);

            // Seesaw anchored near the ground
            const plank = Bodies.rectangle(w / 2, h - 100, 200, 12, { density: 0.003, restitution: 0.2, friction: 0.5 });
            const pivot = Bodies.circle(w / 2, h - 90, 10, { isStatic: true, restitution: 0, friction: 0.5 });
            const constraint = Constraint.create({ bodyA: pivot, bodyB: plank, pointA: { x: 0, y: 0 }, pointB: { x: 0, y: 0 }, stiffness: 1, length: 0 });
            World.add(engine.world, [plank, pivot, constraint]);
            game.bodies.set(plank.id, { type: 'seesaw' });
            game.seesaws.push({ body: plank, pivot, constraint });

            // Ball on the left end (will be launched)
            const ball = Bodies.circle(w / 2 - 80, h - 150, 20, { restitution: 0.5, density: 0.04, label: 'Starter' });
            World.add(engine.world, ball);
            game.bodies.set(ball.id, { type: 'ball' });

            // Heavy box above the right end (drops to launch the ball)
            const box = Bodies.rectangle(w / 2 + 80, h - 200, 50, 50, { density: 0.05, friction: 0.5, label: 'Box' });
            World.add(engine.world, box);
            game.bodies.set(box.id, { type: 'box' });

            // Goal to the left of the seesaw
            const goal = Bodies.rectangle(w / 2 - 200, h - 30, 120, 60, { isStatic: true, isSensor: true, label: 'Goal' });
            World.add(engine.world, goal);
        },
        checkWin(engine, game) {
            const goal = Composite.allBodies(engine.world).find(b => b.label === 'Goal');
            const ball = Composite.allBodies(engine.world).find(b => b.label === 'Starter');
            return goal && ball && Vector.magnitude(Vector.sub(ball.position, goal.position)) < 60;
        }
    },
    {
        name: 'Cannon Fire',
        description: 'Fire the cannon to hit the target',
        theme: 'factory',
        parTime: 6,
        winMessage: 'Direct hit!',
        setup(engine, w, h, game) {
            const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, label: 'Wall' });
            World.add(engine.world, ground);

            // Cannon on the left
            const cannon = Bodies.rectangle(80, h - 70, 60, 30, { isStatic: true, angle: -Math.PI / 6, label: 'Cannon' });
            World.add(engine.world, cannon);
            game.bodies.set(cannon.id, { type: 'cannon' });
            game.cannons.push(cannon);

            // 6 dominoes on the ground
            const dominoes = [];
            for (let i = 0; i < 6; i++) {
                const dom = Bodies.rectangle(w / 2 + 50 + i * 35, h - 20, 20, 80, { restitution: 0.1, friction: 0.6, density: 0.002, label: 'Domino' });
                dominoes.push(dom);
            }
            World.add(engine.world, dominoes);
            dominoes.forEach(d => game.bodies.set(d.id, { type: 'domino' }));

            const goal = Bodies.rectangle(w - 80, h - 30, 80, 60, { isStatic: true, isSensor: true, label: 'Goal' });
            World.add(engine.world, goal);
        },
        checkWin(engine, game) {
            const goal = Composite.allBodies(engine.world).find(b => b.label === 'Goal');
            const balls = Composite.allBodies(engine.world).filter(b => b.label === 'Cannonball');
            return goal && balls.some(b => Vector.magnitude(Vector.sub(b.position, goal.position)) < 50);
        }
    },
    {
        name: 'Pendulum Swing',
        description: 'Let the pendulum do the work',
        theme: 'medieval',
        parTime: 12,
        winMessage: 'Swinging success!',
        setup(engine, w, h, game) {
            const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, label: 'Wall' });
            World.add(engine.world, ground);

            // Starter ball on a platform above the pendulum
            const platform = Bodies.rectangle(w / 2 + 150, h / 2 - 150, 80, 15, { isStatic: true, label: 'Platform' });
            World.add(engine.world, platform);
            const ball = Bodies.circle(w / 2 + 150, h / 2 - 190, 20, { restitution: 0.5, density: 0.04, label: 'Starter' });
            World.add(engine.world, ball);
            game.bodies.set(ball.id, { type: 'ball' });

            // Pendulum
            const pBall = Bodies.circle(w / 2 + 150, h / 2 - 50, 30, { density: 0.05, restitution: 0.5, friction: 0.05 });
            const anchor = Bodies.circle(w / 2 + 150, h / 2 - 170, 5, { isStatic: true, render: { visible: false } });
            const constraint = Constraint.create({ bodyA: anchor, bodyB: pBall, length: 120, stiffness: 1, damping: 0.01 });
            World.add(engine.world, [pBall, anchor, constraint]);
            game.bodies.set(pBall.id, { type: 'pendulum' });
            game.pendulums.push({ body: pBall, anchor, constraint });

            // Dominoes to the right of the pendulum
            const dominoes = [];
            for (let i = 0; i < 5; i++) {
                const dom = Bodies.rectangle(w / 2 + 250 + i * 35, h - 20, 20, 80, { restitution: 0.1, friction: 0.6, density: 0.002, label: 'Domino' });
                dominoes.push(dom);
            }
            World.add(engine.world, dominoes);
            dominoes.forEach(d => game.bodies.set(d.id, { type: 'domino' }));

            // Goal near the pendulum base
            const goal = Bodies.rectangle(w / 2 + 150, h - 30, 80, 60, { isStatic: true, isSensor: true, label: 'Goal' });
            World.add(engine.world, goal);
        },
        checkWin(engine, game) {
            const goal = Composite.allBodies(engine.world).find(b => b.label === 'Goal');
            const starter = Composite.allBodies(engine.world).find(b => b.label === 'Starter');
            return goal && starter && Vector.magnitude(Vector.sub(starter.position, goal.position)) < 60;
        }
    },
    {
        name: 'Spring Jump',
        description: 'Bounce your way to victory',
        theme: 'neon',
        parTime: 10,
        winMessage: 'Boing! Victory!',
        setup(engine, w, h, game) {
            const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, label: 'Wall' });
            World.add(engine.world, ground);

            // Start platform
            const platform = Bodies.rectangle(w / 2 - 200, h - 120, 120, 15, { isStatic: true, label: 'Platform' });
            World.add(engine.world, platform);

            // Spring on the ground
            const spring = Bodies.rectangle(w / 2 - 200, h - 50, 50, 20, { isStatic: true, restitution: 1.2, friction: 0.1, label: 'Spring' });
            World.add(engine.world, spring);
            game.bodies.set(spring.id, { type: 'spring' });
            game.springs.push(spring);

            // Catcher ramp above the spring
            const ramp = Bodies.rectangle(w / 2 + 50, h - 250, 250, 15, { isStatic: true, angle: -Math.PI / 7, label: 'Ramp' });
            World.add(engine.world, ramp);

            // Ball
            const ball = Bodies.circle(w / 2 - 200, h - 170, 20, { restitution: 0.5, density: 0.04, label: 'Starter' });
            World.add(engine.world, ball);
            game.bodies.set(ball.id, { type: 'ball' });

            // Goal at the top right
            const goal = Bodies.rectangle(w - 80, 80, 80, 60, { isStatic: true, isSensor: true, label: 'Goal' });
            World.add(engine.world, goal);
        },
        checkWin(engine, game) {
            const goal = Composite.allBodies(engine.world).find(b => b.label === 'Goal');
            const ball = Composite.allBodies(engine.world).find(b => b.label === 'Starter');
            return goal && ball && Vector.magnitude(Vector.sub(ball.position, goal.position)) < 60;
        }
    },
    {
        name: 'Teleporter Maze',
        description: 'Warp through space',
        theme: 'space',
        parTime: 14,
        winMessage: 'Beam me up!',
        setup(engine, w, h, game) {
            const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, label: 'Wall' });
            World.add(engine.world, ground);

            // Start ramp on the left
            const ramp1 = Bodies.rectangle(w / 2 - 200, h - 120, 200, 15, { isStatic: true, angle: Math.PI / 6, label: 'Ramp' });
            World.add(engine.world, ramp1);

            // Teleporter pair
            const tpA = Bodies.circle(w / 2 - 60, h - 60, 20, { isStatic: true, isSensor: true, label: 'Teleporter A' });
            const tpB = Bodies.circle(w / 2 + 60, 120, 20, { isStatic: true, isSensor: true, label: 'Teleporter B' });
            World.add(engine.world, [tpA, tpB]);
            game.bodies.set(tpA.id, { type: 'teleporter' });
            game.bodies.set(tpB.id, { type: 'teleporter' });
            game.teleporters.push([tpA, tpB]);

            // Landing ramp after teleport
            const ramp2 = Bodies.rectangle(w / 2 + 150, h - 120, 200, 15, { isStatic: true, angle: Math.PI / 6, label: 'Ramp' });
            World.add(engine.world, ramp2);

            // Ball at the top of the first ramp
            const ball = Bodies.circle(w / 2 - 280, h - 200, 20, { restitution: 0.5, density: 0.04, label: 'Starter' });
            World.add(engine.world, ball);
            game.bodies.set(ball.id, { type: 'ball' });

            const goal = Bodies.rectangle(w - 80, h - 30, 80, 60, { isStatic: true, isSensor: true, label: 'Goal' });
            World.add(engine.world, goal);
        },
        checkWin(engine, game) {
            const goal = Composite.allBodies(engine.world).find(b => b.label === 'Goal');
            const ball = Composite.allBodies(engine.world).find(b => b.label === 'Starter');
            return goal && ball && Vector.magnitude(Vector.sub(ball.position, goal.position)) < 60;
        }
    },
    {
        name: 'Factory Frenzy',
        description: 'Combine all elements',
        theme: 'factory',
        parTime: 20,
        winMessage: 'Master engineer!',
        setup(engine, w, h, game) {
            const ground = Bodies.rectangle(w / 2, h - 30, w, 60, { isStatic: true, label: 'Wall' });
            World.add(engine.world, ground);

            // Conveyor on the left
            const conveyor = Bodies.rectangle(150, h - 60, 250, 20, { isStatic: true, friction: 0.8, label: 'Conveyor' });
            World.add(engine.world, conveyor);
            game.bodies.set(conveyor.id, { type: 'conveyor' });
            game.conveyors.push(conveyor);

            // Fan above the conveyor exit
            const fan = Bodies.rectangle(300, h - 150, 60, 60, { isStatic: true, label: 'Fan' });
            World.add(engine.world, fan);
            game.bodies.set(fan.id, { type: 'fan' });
            game.fans.push(fan);

            // Bouncer on the right wall
            const bouncer = Bodies.circle(w - 60, h - 200, 30, { isStatic: true, restitution: 1.5, friction: 0.1, label: 'Bouncer' });
            World.add(engine.world, bouncer);
            game.bodies.set(bouncer.id, { type: 'bouncer' });

            // Dominoes under the bouncer
            const dominoes = [];
            for (let i = 0; i < 4; i++) {
                const dom = Bodies.rectangle(w - 120 + i * 30, h - 20, 20, 80, { restitution: 0.1, friction: 0.6, density: 0.002, label: 'Domino' });
                dominoes.push(dom);
            }
            World.add(engine.world, dominoes);
            dominoes.forEach(d => game.bodies.set(d.id, { type: 'domino' }));

            // Ball on the conveyor
            const ball = Bodies.circle(80, h - 100, 20, { restitution: 0.5, density: 0.04, label: 'Starter' });
            World.add(engine.world, ball);
            game.bodies.set(ball.id, { type: 'ball' });

            const goal = Bodies.rectangle(w - 60, h - 30, 80, 60, { isStatic: true, isSensor: true, label: 'Goal' });
            World.add(engine.world, goal);
        },
        checkWin(engine, game) {
            const goal = Composite.allBodies(engine.world).find(b => b.label === 'Goal');
            const ball = Composite.allBodies(engine.world).find(b => b.label === 'Starter');
            return goal && ball && Vector.magnitude(Vector.sub(ball.position, goal.position)) < 60;
        }
    }
];

// Initialize
game.init();
