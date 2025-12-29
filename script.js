/**
 * Online Whiteboard - Enterprise Grade Refactor
 * Architecture: OOP (App, Renderer, State, Tools)
 */

// --- 1. CONFIGURATION & CONSTANTS ---
const CONFIG = {
    DEFAULT_COLOR: '#ffffff',
    HIGHLIGHTER_ALPHA: 0.4,
    ERASER_COLOR: '#1e1e24', // Should match BG
    ZOOM_SENSITIVITY: 0.1,
    MIN_ZOOM: 0.1,
    MAX_ZOOM: 10,
};

// --- 2. DATA MODELS ---
class Element {
    constructor(type, config) {
        this.type = type;
        this.id = Date.now() + Math.random();
        this.x = config.x || 0;
        this.y = config.y || 0;
        this.color = config.color || CONFIG.DEFAULT_COLOR;
        this.size = config.size || 5;
        this.alpha = config.alpha || 1;
        // Specific props
        this.points = config.points || [];
        this.endX = config.endX || 0;
        this.endY = config.endY || 0;
        this.w = config.w || 0;
        this.h = config.h || 0;
    }

    // --- HIT TESTING ---
    isHit(x, y) {
        const threshold = 10 / this.scale; // Scale threshold? No, world coords.
        const hitMargin = 10;

        switch (this.type) {
            case 'brush':
            case 'eraser':
            case 'highlighter':
                return this.points.some(p => Math.hypot(p.x - x, p.y - y) < (this.size + hitMargin));

            case 'line':
                // dist from point to segment
                const d = this.distToSegment({ x, y }, { x: this.x, y: this.y }, { x: this.endX, y: this.endY });
                return d < (this.size + hitMargin);

            case 'rect':
            case 'sticky':
                return x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h;

            case 'circle':
                const r = Math.sqrt(Math.pow(this.endX - this.x, 2) + Math.pow(this.endY - this.y, 2));
                const dist = Math.hypot(x - this.x, y - this.y);
                return Math.abs(dist - r) < (this.size + hitMargin); // Ring only? Or fill? Let's do boundary.

            case 'text':
                const fontSize = this.size * 2;
                // Approx width/height - canvas measureText would be better but ctx is not here.
                // Simple approx: width ~ char count * font size * 0.6
                const estW = this.content.length * fontSize * 0.6;
                const estH = fontSize;
                return x >= this.x && x <= this.x + estW && y >= this.y && y <= this.y + estH;
        }
        return false;
    }

    distToSegment(p, v, w) {
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
    }
}

// --- 3. STATE MANAGEMENT ---
class StateManager {
    constructor(renderCallback) {
        this.elements = [];
        this.history = [];
        this.redoStack = [];
        this.renderCallback = renderCallback;
    }

    // ... existing methods ...

    getHitElement(x, y) {
        // Reverse iterate to find top-most
        for (let i = this.elements.length - 1; i >= 0; i--) {
            if (this.elements[i].isHit(x, y)) return this.elements[i];
        }
        return null;
    }

    addElement(element) {
        this.saveToHistory();
        this.elements.push(element);
        this.renderCallback();
    }

    setElements(elements) {
        this.elements = elements;
        this.renderCallback();
    }

    saveToHistory() {
        // Deep clone for history
        // IMPORTANT: We need to preserve Prototype (Element class) methods when restoring!
        // JSON.stringify strips functions. We need 'hydrate' logic or simple POJO usage.
        // For this refactor, let's keep it simple: Re-instantiate or just store POJO and use static util for Hit?
        // Or cleaner: `this.elements.map(el => new Element(el.type, el))` functionality on restore.

        const snapshot = this.elements.map(el => ({ ...el })); // Shallow copy props is usually enough if no nested objs (points are nested array, so need deep)
        // Correct deep clone:
        this.history.push(JSON.stringify(this.elements));
        if (this.history.length > 50) this.history.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.history.length === 0) return;
        this.redoStack.push(JSON.stringify(this.elements));
        this.restoreFromJSON(this.history.pop());
    }

    redo() {
        if (this.redoStack.length === 0) return;
        this.history.push(JSON.stringify(this.elements));
        this.restoreFromJSON(this.redoStack.pop());
    }

    restoreFromJSON(jsonStr) {
        const rawList = JSON.parse(jsonStr);
        // Hydrate back to Element instances to keep .isHit() method working!
        this.elements = rawList.map(data => {
            const el = new Element(data.type, data); // Constructor copies props
            // Special fix for points array which constructor expects in config
            // Constructor: this.points = config.points || []
            // It works.
            return el;
        });
        this.renderCallback();
    }

    clear() {
        this.saveToHistory();
        this.elements = [];
        this.renderCallback();
    }
}



class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.showGrid = false; // Default off

        // Bind resize
        window.addEventListener('resize', this.resize.bind(this));
        this.resize();
    }

    toggleGrid() {
        this.showGrid = !this.showGrid;
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        // Optionally request render if we had reference, but StateManager handles main loop
    }

    screenToWorld(x, y) {
        return {
            x: (x - this.panX) / this.scale,
            y: (y - this.panY) / this.scale
        };
    }

    worldToScreen(x, y) {
        return {
            x: (x * this.scale) + this.panX,
            y: (y * this.scale) + this.panY
        };
    }

    // Core Draw Loop
    draw(elements, currentElement = null) {
        // Clear
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = CONFIG.ERASER_COLOR;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();

        // Transform
        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.scale, this.scale);

        // Grid
        if (this.showGrid) this.drawGrid();

        // Render All
        elements.forEach(el => this.drawElement(el));
        if (currentElement) this.drawElement(currentElement);

        this.ctx.restore();
    }

    drawGrid() {
        const gridSize = 50;
        const largeGridSize = 250;

        // Calculate visible area in world coords
        const startX = -this.panX / this.scale;
        const startY = -this.panY / this.scale;
        const endX = startX + (this.width / this.scale);
        const endY = startY + (this.height / this.scale);

        this.ctx.lineWidth = 1 / this.scale; // Thin lines relative to zoom

        // Small Grid
        this.ctx.beginPath();
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";

        // Vertical
        const startGridX = Math.floor(startX / gridSize) * gridSize;
        for (let x = startGridX; x < endX; x += gridSize) {
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
        }
        // Horizontal
        const startGridY = Math.floor(startY / gridSize) * gridSize;
        for (let y = startGridY; y < endY; y += gridSize) {
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
        }
        this.ctx.stroke();
    }

    drawElement(el) {
        this.ctx.save();
        this.ctx.lineWidth = el.size;
        this.ctx.lineCap = "round"; // Smoother scaling
        this.ctx.lineJoin = "round";
        this.ctx.globalAlpha = el.alpha;
        this.ctx.strokeStyle = el.color;
        this.ctx.fillStyle = el.color;

        // Adjust for Zoom: Constant screen stroke width? 
        // No, stroke should scale with zoom.
        // Wait, for Text we need scaling.

        this.ctx.beginPath();

        switch (el.type) {
            case 'brush':
            case 'eraser':
            case 'highlighter':
                if (el.points.length > 0) {
                    // Eraser overrides
                    if (el.type === 'eraser') this.ctx.strokeStyle = CONFIG.ERASER_COLOR;

                    this.ctx.moveTo(el.points[0].x, el.points[0].y);
                    for (let i = 1; i < el.points.length; i++) {
                        // Quadratic Curve for smoothness? For MVP, LineTo is fine.
                        this.ctx.lineTo(el.points[i].x, el.points[i].y);
                    }
                    this.ctx.stroke();
                }
                break;

            case 'line':
                this.ctx.moveTo(el.x, el.y);
                this.ctx.lineTo(el.endX, el.endY);
                this.ctx.stroke();
                break;

            case 'rect':
                this.ctx.strokeRect(el.x, el.y, el.w, el.h);
                break;

            case 'circle':
                const r = Math.sqrt(Math.pow(el.endX - el.x, 2) + Math.pow(el.endY - el.y, 2));
                this.ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
                this.ctx.stroke();
                break;

            case 'text':
                const fontSize = el.size * 2;
                this.ctx.font = `${fontSize}px Inter`;
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(el.content, el.x, el.y);
                break;

            case 'sticky':
                this.drawSticky(el);
                break;
        }

        this.ctx.restore();
    }

    drawSticky(el) {
        // Shadow
        this.ctx.fillStyle = "rgba(0,0,0,0.2)";
        this.ctx.fillRect(el.x + 4, el.y + 4, el.w, el.h);

        // Note Body
        this.ctx.fillStyle = el.color || "#ffea00"; // Default yellow if no color
        this.ctx.fillRect(el.x, el.y, el.w, el.h);

        // Text
        this.ctx.fillStyle = "#1e1e24"; // Always dark text
        this.ctx.font = "14px Inter";
        this.ctx.textBaseline = 'top';

        this.wrapText(el.content, el.x + 10, el.y + 10, el.w - 20, 20);
    }

    wrapText(text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = this.ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                this.ctx.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            }
            else {
                line = testLine;
            }
        }
        this.ctx.fillText(line, x, y);
    }
}

// --- 5. APPLICATION CONTROLLER ---
class WhiteboardApp {
    constructor() {
        this.canvas = document.getElementById("whiteboard");
        this.renderer = new Renderer(this.canvas);
        this.state = new StateManager(() => this.requestRender());

        // App State
        this.activeTool = 'brush';
        this.isDrawing = false;
        this.isPanning = false;
        this.currentElement = null; // Temp element being drawn

        // Settings
        this.color = CONFIG.DEFAULT_COLOR;
        this.size = 5;

        // UI references
        this.ui = {
            tools: document.querySelectorAll(".tool-btn"),
            color: document.querySelector("#color-picker"),
            size: document.querySelector("#size-slider"),
            outputWrapper: document.querySelector(".color-picker-wrapper")
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.setupUI();
        this.requestRender();
    }

    requestRender() {
        requestAnimationFrame(() => {
            this.renderer.draw(this.state.elements, this.currentElement);
        });
    }

    // --- EVENT HANDLING ---
    bindEvents() {
        // Mouse / Touch
        this.canvas.addEventListener('mousedown', this.handleStart.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMove.bind(this));
        window.addEventListener('mouseup', this.handleEnd.bind(this));

        // Wheel Zoom
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // Keyboard
        window.addEventListener('keydown', this.handleKey.bind(this));
        window.addEventListener('keyup', this.handleKey.bind(this));

        // Touch Support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling
            this.handleStart(e);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleMove(e);
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            this.handleEnd(e);
        });

        // State for robust delta calculation
        this.lastX = 0;
        this.lastY = 0;
    }

    handleStart(e) {
        // Init Last Pos for Delta
        const pos = this.getEventPos(e);
        this.lastX = pos.x;
        this.lastY = pos.y;

        if (this.activeTool === 'text') {
            this.handleTextTool(e);
            return;
        }

        const { x, y } = this.eventToWorld(e);

        if (this.activeTool === 'sticky') {
            this.handleStickyTool(x, y);
            return;
        }

        // Pan Logic
        if (e.button === 1 || this.activeTool === 'pan' || this.isSpacePressed) {
            this.isPanning = true;
            this.canvas.style.cursor = "grabbing";
            return;
        }

        // Move Logic
        if (this.activeTool === 'move') {
            const hitEl = this.state.getHitElement(x, y);
            if (hitEl) {
                this.isMoving = true;
                this.movingElement = hitEl;
                this.moveStartPos = { x, y };
                this.state.saveToHistory(); // Save state BEFORE move for Undo
                this.canvas.style.cursor = "move";
                return;
            }
        }

        // Draw Logic
        // COLOR SAFETY CHECK: Prevent drawing with board color
        if (this.color === CONFIG.ERASER_COLOR && this.activeTool !== 'eraser') {
            // Auto-switch to White if user tries to use background color
            this.color = '#ffffff';
            this.ui.color.value = '#ffffff';
            this.ui.outputWrapper.style.backgroundColor = '#ffffff';
            // Optional: alert("Auto-switched to White (Invisible on Dark Board)");
        }

        this.isDrawing = true;
        this.startDrawing(x, y);
    }

    handleMove(e) {
        const pos = this.getEventPos(e);
        const deltaX = pos.x - this.lastX;
        const deltaY = pos.y - this.lastY;

        // Update last pos
        this.lastX = pos.x;
        this.lastY = pos.y;

        if (this.isPanning) {
            this.renderer.panX += deltaX;
            this.renderer.panY += deltaY;
            this.requestRender();
            return;
        }

        const { x, y } = this.eventToWorld(e); // Still robust as it uses client coord

        if (this.isMoving && this.movingElement) {
            const dx = x - this.moveStartPos.x;
            const dy = y - this.moveStartPos.y;

            // Apply delta
            const el = this.movingElement;
            el.x += dx;
            el.y += dy;

            // For complex shapes (Rect/Circ/Line) that use endX/Y
            if (el.endX !== undefined) el.endX += dx;
            if (el.endY !== undefined) el.endY += dy;

            // For Brush/Eraser (Points)
            if (el.points) {
                el.points.forEach(p => {
                    p.x += dx;
                    p.y += dy;
                });
            }

            this.moveStartPos = { x, y }; // Reset ref
            this.requestRender();
            return;
        }

        if (this.isDrawing && this.currentElement) {
            this.updateDrawing(x, y);
            this.requestRender();
        }
    }

    handleEnd(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.activeTool === 'pan' ? "grab" : "crosshair";
            return; // Don't finalize drawing if panning
        }

        if (this.isMoving) {
            this.isMoving = false;
            this.movingElement = null;
            this.canvas.style.cursor = "default";
            return;
        }

        if (this.isDrawing) {
            this.isDrawing = false;
            if (this.currentElement) {
                this.state.addElement(this.currentElement);
                this.currentElement = null;
            }
        }
    }

    handleWheel(e) {
        e.preventDefault();
        const zoomDir = e.deltaY > 0 ? -1 : 1;
        const factor = 1 + (CONFIG.ZOOM_SENSITIVITY * zoomDir);

        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        const worldPos = this.renderer.screenToWorld(mouseX, mouseY);

        let newScale = this.renderer.scale * factor;
        newScale = Math.max(CONFIG.MIN_ZOOM, Math.min(newScale, CONFIG.MAX_ZOOM));

        this.renderer.scale = newScale;

        // Adjust Pan to keep mouse centered
        this.renderer.panX = mouseX - (worldPos.x * newScale);
        this.renderer.panY = mouseY - (worldPos.y * newScale);

        this.requestRender();
    }

    handleKey(e) {
        if (e.type === 'keydown' && e.code === 'Space') {
            this.isSpacePressed = true;
            this.canvas.style.cursor = "grab";
        }
        if (e.type === 'keyup' && e.code === 'Space') {
            this.isSpacePressed = false;
            this.canvas.style.cursor = "crosshair";
        }
        // Undo/Redo Shortcuts could go here
    }

    // --- TOOL STRATEGIES ---
    startDrawing(x, y) {
        const baseConfig = { x, y, color: this.color, size: this.size };

        switch (this.activeTool) {
            case 'brush':
                this.currentElement = new Element('brush', { ...baseConfig, points: [{ x, y }] });
                break;
            case 'eraser':
                this.currentElement = new Element('eraser', { ...baseConfig, points: [{ x, y }] });
                break;
            case 'highlighter':
                this.currentElement = new Element('highlighter', {
                    ...baseConfig,
                    points: [{ x, y }],
                    alpha: CONFIG.HIGHLIGHTER_ALPHA // Transparent
                });
                break;
            case 'line':
            case 'rect':
            case 'circle':
                this.currentElement = new Element(this.activeTool, {
                    ...baseConfig,
                    endX: x, endY: y, w: 0, h: 0
                });
                break;
        }
    }

    updateDrawing(x, y) {
        if (!this.currentElement) return;
        const el = this.currentElement;

        if (['brush', 'eraser', 'highlighter'].includes(el.type)) {
            el.points.push({ x, y });
        } else if (el.type === 'line' || el.type === 'circle') {
            el.endX = x;
            el.endY = y;
        } else if (el.type === 'rect') {
            el.w = x - el.x;
            el.h = y - el.y;
        }
    }

    // Text Tool (Advanced Overlay)
    handleTextTool(e) {
        const { x, y } = this.eventToWorld(e);

        // Create Input Overlay
        const input = document.createElement("textarea");
        input.id = "text-input-overlay";
        // Calculate screen pos for input
        const screenPos = this.renderer.worldToScreen(x, y);

        input.style.left = `${screenPos.x}px`;
        input.style.top = `${screenPos.y}px`;
        input.style.fontSize = `${this.size * 2 * this.renderer.scale}px`; // Match scale
        input.style.color = this.color;

        document.body.appendChild(input);

        // Helper to finalize text
        const finalize = () => {
            // Re-calculate world pos from input in case they dragged it (not supported yet)
            // or zoomed? (blocked usually)
            // simplified: text stays at creation world coord
            if (input.value.trim()) {
                const el = new Element('text', {
                    x: x, y: y,
                    content: input.value,
                    color: this.color,
                    size: this.size
                });
                this.state.addElement(el);
            }
            input.remove();
            this.isDrawing = false;
        };

        // Focus & Listen
        setTimeout(() => input.focus(), 10);
        input.addEventListener("blur", finalize);
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) { // Shift+Enter for newline
                ev.preventDefault();
                input.blur();
            }
            if (ev.key === "Escape") {
                input.value = ""; // Clear to prevent save
                input.blur();
            }
        });
    }

    handleStickyTool(x, y) {
        // Create Input Overlay for Sticky
        const input = document.createElement("textarea");
        input.id = "sticky-input-overlay";
        // Calculate screen pos for input
        const screenPos = this.renderer.worldToScreen(x, y);

        // Style it to look like the sticky
        input.style.position = "absolute";
        input.style.left = `${screenPos.x}px`;
        input.style.top = `${screenPos.y}px`;
        input.style.width = `${200 * this.renderer.scale}px`;
        input.style.height = `${200 * this.renderer.scale}px`;
        input.style.backgroundColor = "#ffea00"; // Sticky Yellow
        input.style.color = "#1e1e24";
        input.style.padding = "10px";
        input.style.border = "none";
        input.style.outline = "none";
        input.style.fontFamily = "Inter, sans-serif";
        input.style.zIndex = 1000;

        document.body.appendChild(input);

        const finalize = () => {
            if (input.value.trim()) {
                const el = new Element('sticky', {
                    x: x, y: y,
                    w: 200, h: 200,
                    content: input.value,
                    color: "#ffea00",
                    size: 0 // No stroke
                });
                this.state.addElement(el);
            }
            input.remove();
        };

        // Focus & Listen
        setTimeout(() => input.focus(), 10);
        input.addEventListener("blur", finalize);
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape") {
                input.value = ""; // Clear to prevent save
                input.blur();
            }
        });
    }

    // --- HELPERS ---
    getEventPos(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    eventToWorld(e) {
        const pos = this.getEventPos(e);
        const rect = this.canvas.getBoundingClientRect();
        const mx = pos.x - rect.left;
        const my = pos.y - rect.top;
        return this.renderer.screenToWorld(mx, my);
    }

    setupUI() {
        // --- Sidebar Actions ---
        const gridBtn = document.querySelector("#grid-btn");
        gridBtn.addEventListener("click", () => {
            this.renderer.toggleGrid();
            gridBtn.classList.toggle("active");
            this.requestRender();
        });

        document.querySelector("#zoom-in-btn").addEventListener("click", () => {
            this.renderer.scale *= 1.2;
            this.requestRender();
        });

        document.querySelector("#zoom-out-btn").addEventListener("click", () => {
            this.renderer.scale /= 1.2;
            this.requestRender();
        });

        document.querySelector("#zoom-reset-btn").addEventListener("click", () => {
            this.renderer.scale = 1;
            this.renderer.panX = 0;
            this.renderer.panY = 0;
            this.requestRender();
        });

        // Tool Buttons
        document.querySelectorAll(".tool-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const action = btn.dataset.tool;
                if (!action) {
                    if (btn.id === 'undo-btn') this.state.undo();
                    if (btn.id === 'redo-btn') this.state.redo();
                    return;
                }

                // Activating Tool
                document.querySelector(".tool-btn.active")?.classList.remove("active");
                btn.classList.add("active");
                this.activeTool = action;
            });
        });

        // Properties
        // Properties
        this.ui.color.addEventListener("input", (e) => {
            this.color = e.target.value;
            this.ui.outputWrapper.style.backgroundColor = this.color;
        });
        this.ui.color.addEventListener("change", (e) => { // Backup
            this.color = e.target.value;
            this.ui.outputWrapper.style.backgroundColor = this.color;
        });
        this.ui.outputWrapper.style.backgroundColor = this.color; // init

        // Fix Color Button
        document.querySelector("#color-fix-btn").addEventListener("click", () => {
            this.color = '#ffffff';
            this.ui.color.value = '#ffffff';
            this.ui.outputWrapper.style.backgroundColor = '#ffffff';
        });

        this.ui.size.addEventListener("change", (e) => {
            this.size = parseInt(e.target.value);
        });

        // Global Actions
        document.querySelector("#clear-btn").addEventListener("click", () => this.state.clear());

        // Export Image
        document.querySelector("#save-btn").addEventListener("click", () => {
            const link = document.createElement("a");
            link.download = `whiteboard-${Date.now()}.jpg`;
            link.href = this.canvas.toDataURL();
            link.click();
        });

        // Save Project (JSON)
        document.querySelector("#save-project-btn").addEventListener("click", () => {
            const data = JSON.stringify(this.state.elements);
            const blob = new Blob([data], { type: 'application/json' });
            const link = document.createElement("a");
            link.download = `project-${Date.now()}.json`;
            link.href = URL.createObjectURL(blob);
            link.click();
        });

        // Load Project
        const fileInput = document.querySelector("#file-input");
        document.querySelector("#load-btn").addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    this.state.restoreFromJSON(e.target.result);
                    // Clear history to start fresh or keep interactions? 
                    // Usually loading a file clears undo stack of previous session
                    this.state.history = [];
                    this.state.redoStack = [];
                } catch (err) {
                    alert("Failed to load project files.");
                    console.error(err);
                }
            };
            reader.readAsText(file);
            // Reset input
            fileInput.value = '';
        });
    }
}

// Start App
window.onload = () => {
    window.app = new WhiteboardApp();
};
