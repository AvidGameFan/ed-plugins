/*
 * JSON Prompt Composer
 *
 * v1.0.1, last updated: 6/28/2026
 * By GitHub Copilot
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 *
 * Opens a visual dialog for building schema-compliant JSON image prompts.
 * Supports bounding box drawing on a normalized 0-1000 canvas, per-element
 * prompt editing, schema validation with auto-fix, and optional Magic Prompt
 * expansion via an OpenAI-compatible LLM.
 *
 * Schema fields:
 *   aspect_ratio            – optional, best-fit ratio from current width/height (e.g. 16:9)
 *   high_level_description  – optional scene summary
 *   style_description       – aesthetics, lighting, photo|art_style, medium, color_palette
 *   compositional_deconstruction – background + elements[]
 *     element: { type, bbox?, text? (text only), desc }
 * 
 * Plugins used as references for creating this plugin:
 * - ai-image-critic.plugin.js - Modal/overlay UI patterns, API error handling, JSON extraction patterns.
 * - llm-image-generator.plugin.js - LLM request/retry/settings patterns for text-generation integration.
 * - prompthistory.plugin.js - Prompt field update flow and event dispatch behavior after writes.
 * - scaleup.plugin.js - Pointer/selection interaction patterns relevant to box manipulation.
 * - clonebrush.plugin.js - Coordinate mapping and drag-state handling patterns.
 */

// Settings live outside IIFE so global save/load functions can reach them.
var JsonComposerSettings = {
    apiUrl:     '',    // e.g. "http://localhost:1234"
    apiKey:     '',    // optional Bearer token
    model:      '',    // model name, e.g. "gpt-4o", "mistral"
    timeout:    120000, // ms
    maxRetries: 2
};

(function () {
    'use strict';

    // ── Constants ─────────────────────────────────────────────────────────────
    const LOGIC_SIZE           = 1000;  // normalized coordinate space
    const HANDLE_PX            = 8;     // resize handle square size in canvas pixels
    const HANDLE_HIT_LOGICAL   = 18;    // hit radius in logical units for handles
    const MIN_BOX_LOGICAL      = 20;    // minimum box dimension when drawing

    // ── State ─────────────────────────────────────────────────────────────────
    let state  = null;
    let modal  = null;
    let cvs    = null;  // canvas element
    let ctx    = null;  // canvas 2d context
    let cScale = 1;     // canvas pixels per logical unit  (cPx = logical * cScale)

    function freshState() {
        return {
            aspectRatio: '',
            highLevelDescription: '',
            style: {
                aesthetics:   '',
                lighting:     '',
                styleMode:    'photo',  // 'photo' | 'art_style'
                photo:        '',
                art_style:    '',
                medium:       '',
                colorPalette: []
            },
            background:    '',
            elements:      [],
            selectedIndex: -1,
            ci: {                    // canvas interaction
                isDrawing:    false,
                isDragging:   false,
                isResizing:   false,
                resizeHandle: null,  // 'tl','tc','tr','ml','mr','bl','bc','br'
                startLX:      0,
                startLY:      0,
                origBbox:     null,
                hoverIndex:   -1
            }
        };
    }

    // ── Launch button ─────────────────────────────────────────────────────────
    function insertLaunchButton() {
        if (document.getElementById('jpc-launch-btn')) return;
        const btn = document.createElement('button');
        btn.id        = 'jpc-launch-btn';
        btn.className = 'btn btn-primary';
        btn.title     = 'Open JSON Prompt Composer';
        btn.innerHTML = '<i class="fa-solid fa-diagram-project"></i> JSON Composer';
        btn.style.cssText = 'margin-top:4px;font-size:12px;padding:5px 10px;';
        btn.addEventListener('click', openComposer);

        const anchor = document.querySelector('#prompt_history')
            || (typeof negativePromptField !== 'undefined' && negativePromptField)
            || document.querySelector('#negative_prompt_handle');//|| document.querySelector('#negative_prompt');
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        }
    }

    // ── Open composer ─────────────────────────────────────────────────────────
    function openComposer() {
        const existing = document.getElementById('jpc-modal');
        if (existing) { existing.remove(); }

        state = freshState();

        // Auto-parse if prompt already contains JSON
        const pf = getPromptField();
        if (pf) {
            const raw = unescapeFromPrompt(pf.value.trim());
            if (raw.startsWith('{')) {
                try { hydrateStateFromSchema(JSON.parse(raw)); } catch (_) {}
            }
        }

        buildModal();
    }

    // ── Modal construction ────────────────────────────────────────────────────
    function buildModal() {
        injectStyles();

        modal = document.createElement('div');
        modal.id           = 'jpc-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);';

        modal.innerHTML = `
<div id="jpc-box" style="
    background:#1e1e2e;color:#cdd6f4;border-radius:10px;padding:0;
    max-width:1280px;width:96vw;max-height:93vh;
    display:flex;flex-direction:column;
    box-shadow:0 8px 40px rgba(0,0,0,0.8);font-family:sans-serif;font-size:13px;overflow:hidden;
">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;
        padding:14px 20px;background:#181825;border-bottom:1px solid #313244;flex-shrink:0;">
        <h3 style="margin:0;font-size:16px;display:flex;align-items:center;gap:8px">
            <i class="fa-solid fa-diagram-project" style="color:#89b4fa"></i>
            JSON Prompt Composer
        </h3>
        <button id="jpc-close" style="background:none;border:none;color:#cdd6f4;font-size:22px;cursor:pointer;line-height:1;padding:0 4px">&times;</button>
    </div>

    <!-- Issues bar -->
    <div id="jpc-issues" style="display:none;padding:8px 16px;background:#3d2a0a;border-bottom:1px solid #7a4f10;color:#fab387;font-size:12px;flex-shrink:0;"></div>

    <!-- 3-pane content -->
    <div id="jpc-content" style="display:flex;flex:1;overflow:hidden;min-height:0;">

        <!-- ═══ LEFT PANEL: scene + style + background ═══ -->
        <div id="jpc-left" style="
            width:270px;min-width:200px;flex-shrink:0;overflow-y:auto;
            padding:12px;border-right:1px solid #313244;
            display:flex;flex-direction:column;gap:8px;
        ">
            <div class="jpc-section">
                <div class="jpc-label">Scene Description
                    <span class="jpc-hint">optional</span>
                </div>
                <textarea id="jpc-hld" rows="3"
                    placeholder="A golden retriever riding a skateboard down a sunny sidewalk."
                    style="width:100%;box-sizing:border-box;resize:vertical;"></textarea>
            </div>

            <div class="jpc-section">
                <div class="jpc-label">Style</div>
                <label class="jpc-fl">Aesthetics *</label>
                <input id="jpc-aesthetics" type="text" placeholder="warm, playful, vibrant">
                <label class="jpc-fl">Lighting *</label>
                <input id="jpc-lighting" type="text" placeholder="bright afternoon sunlight">
                <label class="jpc-fl">Medium *</label>
                <input id="jpc-medium" type="text" placeholder="photograph">

                <label class="jpc-fl" style="margin-top:6px">Style Mode *</label>
                <div style="display:flex;gap:6px;margin-bottom:6px;">
                    <button id="jpc-mode-photo"    class="jpc-mode-btn jpc-mode-active" data-mode="photo">Photo</button>
                    <button id="jpc-mode-artstyle" class="jpc-mode-btn"                 data-mode="art_style">Art Style</button>
                </div>
                <div id="jpc-photo-row">
                    <label class="jpc-fl">Photo Details</label>
                    <input id="jpc-photo" type="text" placeholder="shallow DoF, 85mm lens">
                </div>
                <div id="jpc-artstyle-row" style="display:none;">
                    <label class="jpc-fl">Art Style Details</label>
                    <input id="jpc-art-style" type="text" placeholder="oil painting, impasto">
                </div>

                <label class="jpc-fl" style="margin-top:6px">Color Palette
                    <span class="jpc-hint">optional</span>
                </label>
                <input id="jpc-palette" type="text" placeholder="#F5C542, #87CEEB">
                <small style="color:#6c7086;">Comma-separated hex codes; must be last in style block</small>
            </div>

            <div class="jpc-section">
                <div class="jpc-label">Background *</div>
                <textarea id="jpc-background" rows="3"
                    placeholder="A sun-drenched suburban sidewalk lined with green hedges."
                    style="width:100%;box-sizing:border-box;resize:vertical;"></textarea>
            </div>
        </div>

        <!-- ═══ CENTER: canvas ═══ -->
        <div id="jpc-center" style="
            flex:1;min-width:0;
            display:flex;flex-direction:column;align-items:center;
            padding:10px;gap:6px;overflow:hidden;
        ">
            <div style="font-size:11px;color:#6c7086;text-align:center;">
                Drag empty area to draw box &nbsp;·&nbsp; Click box to select &nbsp;·&nbsp;
                Drag box to move &nbsp;·&nbsp; Drag handle to resize &nbsp;·&nbsp;
                Arrow keys to nudge (Shift = ×10) &nbsp;·&nbsp; Del to delete
            </div>
            <div id="jpc-canvas-wrap" style="
                flex:1;width:100%;display:flex;align-items:center;justify-content:center;
                min-height:0;overflow:hidden;
            ">
                <canvas id="jpc-canvas" style="cursor:crosshair;touch-action:none;display:block;"></canvas>
            </div>
            <div id="jpc-coords" style="font-size:11px;color:#6c7086;height:16px;flex-shrink:0;"></div>
        </div>

        <!-- ═══ RIGHT PANEL: element list + editor ═══ -->
        <div id="jpc-right" style="
            width:270px;min-width:200px;flex-shrink:0;overflow-y:auto;
            padding:12px;border-left:1px solid #313244;
            display:flex;flex-direction:column;gap:8px;
        ">
            <div class="jpc-section">
                <div class="jpc-label">Elements</div>
                <div style="display:flex;gap:6px;margin-bottom:8px;">
                    <button id="jpc-add-obj"  class="btn btn-secondary jpc-sm">+ Object</button>
                    <button id="jpc-add-text" class="btn btn-secondary jpc-sm">+ Text</button>
                </div>
                <div id="jpc-elem-list" style="display:flex;flex-direction:column;gap:4px;"></div>
            </div>

            <div id="jpc-editor" class="jpc-section" style="display:none;">
                <div class="jpc-label">Edit Element</div>

                <label class="jpc-fl">Type</label>
                <select id="jpc-el-type" style="margin-bottom:6px;">
                    <option value="obj">Object (obj)</option>
                    <option value="text">In-image Text (text)</option>
                </select>

                <label class="jpc-fl">Bounding Box
                    <span class="jpc-hint">optional · 0–1000 · [y_min, x_min, y_max, x_max]</span>
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px;">
                    <div><small style="color:#6c7086;">y_min</small>
                        <input id="jpc-bb-y0" type="number" min="0" max="1000" style="width:100%;box-sizing:border-box;">
                    </div>
                    <div><small style="color:#6c7086;">x_min</small>
                        <input id="jpc-bb-x0" type="number" min="0" max="1000" style="width:100%;box-sizing:border-box;">
                    </div>
                    <div><small style="color:#6c7086;">y_max</small>
                        <input id="jpc-bb-y1" type="number" min="0" max="1000" style="width:100%;box-sizing:border-box;">
                    </div>
                    <div><small style="color:#6c7086;">x_max</small>
                        <input id="jpc-bb-x1" type="number" min="0" max="1000" style="width:100%;box-sizing:border-box;">
                    </div>
                </div>
                <button id="jpc-clear-bbox" class="btn btn-secondary jpc-sm" style="margin-bottom:8px;">Clear BBox</button>

                <div id="jpc-text-row" style="display:none;">
                    <label class="jpc-fl">Literal Text *</label>
                    <input id="jpc-el-text" type="text" placeholder="Hello World" style="margin-bottom:6px;">
                </div>

                <label class="jpc-fl">Description *</label>
                <textarea id="jpc-el-desc" rows="4"
                    placeholder="Describe this element in detail…"
                    style="width:100%;box-sizing:border-box;resize:vertical;"></textarea>

                <div style="display:flex;gap:6px;margin-top:8px;">
                    <button id="jpc-del-el" class="btn btn-secondary jpc-sm" style="color:#f38ba8;border-color:#f38ba8;">Delete</button>
                    <button id="jpc-dup-el" class="btn btn-secondary jpc-sm">Duplicate</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Footer -->
    <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:12px 20px;background:#181825;border-top:1px solid #313244;
        flex-shrink:0;flex-wrap:wrap;gap:8px;
    ">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="jpc-parse-btn"   class="btn btn-secondary">&#8595; Parse from Prompt</button>
            <button id="jpc-magic-btn"   class="btn btn-secondary"><i class="fa-solid fa-wand-magic-sparkles"></i> Magic Prompt</button>
            <button id="jpc-preview-btn" class="btn btn-secondary">{ } Preview JSON</button>
        </div>
        <div style="display:flex;gap:8px;">
            <button id="jpc-cancel-btn" class="btn btn-secondary">Cancel</button>
            <button id="jpc-apply-btn"  class="btn btn-primary">&#10003; Apply to Prompt</button>
        </div>
    </div>
</div>
`;

        document.body.appendChild(modal);
        wireEvents();
        setupCanvas();
        populateFields();
        renderElementList();
    }

    // ── Event wiring ──────────────────────────────────────────────────────────
    function wireEvents() {
        // Close
        document.getElementById('jpc-close').addEventListener('click', closeModal);
        document.getElementById('jpc-cancel-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', onKeyDown);

        // Style mode
        modal.querySelectorAll('.jpc-mode-btn').forEach(btn =>
            btn.addEventListener('click', () => {
                state.style.styleMode = btn.dataset.mode;
                updateStyleModeUI();
            })
        );

        // Add element
        document.getElementById('jpc-add-obj').addEventListener('click', () => addElement('obj'));
        document.getElementById('jpc-add-text').addEventListener('click', () => addElement('text'));

        // Actions
        document.getElementById('jpc-apply-btn').addEventListener('click', applyToPrompt);
        document.getElementById('jpc-parse-btn').addEventListener('click', parseFromPrompt);
        document.getElementById('jpc-magic-btn').addEventListener('click', onMagicPrompt);
        document.getElementById('jpc-preview-btn').addEventListener('click', showPreview);

        // Editor field changes
        document.getElementById('jpc-el-type').addEventListener('change', onEditorTypeChange);
        document.getElementById('jpc-del-el').addEventListener('click', deleteSelectedElement);
        document.getElementById('jpc-dup-el').addEventListener('click', duplicateSelectedElement);
        document.getElementById('jpc-clear-bbox').addEventListener('click', clearSelectedBbox);

        // Live sync – left panel + desc/text
        ['jpc-hld','jpc-aesthetics','jpc-lighting','jpc-medium','jpc-photo',
         'jpc-art-style','jpc-palette','jpc-background','jpc-el-desc','jpc-el-text']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', syncStateFromFields);
            });

        // Bbox numeric fields
        ['jpc-bb-y0','jpc-bb-x0','jpc-bb-y1','jpc-bb-x1'].forEach(id =>
            document.getElementById(id).addEventListener('input', onBboxFieldInput)
        );
    }

    function closeModal() {
        if (modal) { modal.remove(); modal = null; }
        document.removeEventListener('keydown', onKeyDown);
        cvs = null; ctx = null;
    }

    // ── CSS injection ─────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('jpc-styles')) return;
        const s = document.createElement('style');
        s.id = 'jpc-styles';
        s.textContent = `
#jpc-box textarea,
#jpc-box input[type="text"],
#jpc-box input[type="number"],
#jpc-box select {
    background:#313244;color:#cdd6f4;border:1px solid #45475a;
    border-radius:4px;padding:5px 7px;font-size:12px;
    width:100%;box-sizing:border-box;margin-bottom:4px;
}
#jpc-box textarea:focus, #jpc-box input:focus, #jpc-box select:focus {
    outline:none;border-color:#89b4fa;
}
.jpc-section { background:#181825;border-radius:6px;padding:10px; }
.jpc-label   { font-weight:bold;font-size:12px;color:#89b4fa;margin-bottom:8px; }
.jpc-hint    { font-weight:normal;font-size:10px;color:#6c7086;margin-left:4px; }
.jpc-fl      { display:block;font-size:11px;color:#a6adc8;margin-bottom:2px;margin-top:4px; }
.jpc-sm      { font-size:11px;padding:3px 8px;height:auto; }
.jpc-mode-btn {
    padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;
    background:#313244;color:#cdd6f4;border:1px solid #45475a;
}
.jpc-mode-active { background:#89b4fa !important;color:#1e1e2e !important;border-color:#89b4fa !important; }
.jpc-row {
    display:flex;align-items:center;gap:6px;padding:5px 8px;
    border-radius:5px;cursor:pointer;border:1px solid transparent;
    background:#313244;user-select:none;
}
.jpc-row:hover  { border-color:#45475a; }
.jpc-row.jpc-sel { border-color:#89b4fa;background:#1e3a5f; }
.jpc-badge { font-size:10px;padding:1px 5px;border-radius:10px;font-weight:bold;flex-shrink:0; }
.jpc-badge-obj  { background:#313244;color:#89b4fa;border:1px solid #89b4fa; }
.jpc-badge-text { background:#313244;color:#a6e3a1;border:1px solid #a6e3a1; }
`;
        document.head.appendChild(s);
    }

    // ── Canvas setup ──────────────────────────────────────────────────────────
    function setupCanvas() {
        cvs = document.getElementById('jpc-canvas');
        ctx = cvs.getContext('2d');

        const wrap = document.getElementById('jpc-canvas-wrap');
        const size = Math.max(280, Math.min(wrap.clientWidth - 8, wrap.clientHeight - 8, 580));
        cvs.width  = size;
        cvs.height = size;
        cScale     = size / LOGIC_SIZE;

        cvs.addEventListener('pointerdown',  onPointerDown);
        cvs.addEventListener('pointermove',  onPointerMove);
        cvs.addEventListener('pointerup',    onPointerUp);
        cvs.addEventListener('pointercancel',onPointerUp);
        cvs.addEventListener('pointerleave', () => {
            document.getElementById('jpc-coords').textContent = '';
            state.ci.hoverIndex = -1;
            drawCanvas();
        });

        drawCanvas();
    }

    // Convert client XY → logical coordinates clamped to [0, LOGIC_SIZE]
    function toLogical(clientX, clientY) {
        const r  = cvs.getBoundingClientRect();
        const lx = Math.round((clientX - r.left) / r.width  * LOGIC_SIZE);
        const ly = Math.round((clientY - r.top)  / r.height * LOGIC_SIZE);
        return {
            lx: Math.max(0, Math.min(LOGIC_SIZE, lx)),
            ly: Math.max(0, Math.min(LOGIC_SIZE, ly))
        };
    }

    // ── Canvas draw ───────────────────────────────────────────────────────────
    function drawCanvas() {
        if (!ctx || !cvs) return;
        const W = cvs.width, H = cvs.height;

        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = '#11111b';
        ctx.fillRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = '#252535';
        ctx.lineWidth   = 0.5;
        for (let i = 0; i <= 10; i++) {
            const p = i * cScale * 100;
            ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
        }

        // Axis labels
        const labelPx = Math.max(8, Math.round(cScale * 18));
        ctx.font        = `${labelPx}px monospace`;
        ctx.fillStyle   = '#3d3d5c';
        ctx.textAlign   = 'left';
        for (let i = 1; i < 10; i++) {
            const p = i * cScale * 100;
            ctx.fillText(String(i * 100), p + 2, labelPx + 2);
        }

        // Elements
        state.elements.forEach((el, idx) => {
            if (!el.bbox) return;
            const [ly0, lx0, ly1, lx1] = el.bbox;
            const x = lx0 * cScale, y = ly0 * cScale;
            const w = (lx1 - lx0) * cScale, h = (ly1 - ly0) * cScale;
            const isSel = idx === state.selectedIndex;
            const isHov = idx === state.ci.hoverIndex && !isSel;

            // Fill
            ctx.fillStyle = isSel ? 'rgba(137,180,250,0.12)'
                          : isHov ? 'rgba(137,180,250,0.06)'
                          :         'rgba(255,255,255,0.04)';
            ctx.fillRect(x, y, w, h);

            // Stroke
            const col = isSel ? '#89b4fa'
                      : el.type === 'text' ? '#a6e3a1'
                      : '#89dceb';
            ctx.strokeStyle = col;
            ctx.lineWidth   = isSel ? 2 : 1;
            ctx.setLineDash(isSel ? [] : [4, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // Label
            const fPx = Math.max(9, Math.round(cScale * 14));
            ctx.font      = `${fPx}px sans-serif`;
            ctx.fillStyle = col;
            ctx.textAlign = 'left';
            const label   = (idx + 1) + ': ' + (el.desc || el.text || '').substring(0, 24);
            ctx.fillText(label, x + 3, y + fPx + 3);

            // Handles (selected only)
            if (isSel) drawHandles(el.bbox);
        });
    }

    function drawHandles(bbox) {
        const hpx = HANDLE_PX, half = hpx / 2;
        for (const [hx, hy] of Object.values(handlePositions(bbox))) {
            const px = hx * cScale, py = hy * cScale;
            ctx.fillStyle   = '#89b4fa';
            ctx.strokeStyle = '#1e1e2e';
            ctx.lineWidth   = 1;
            ctx.fillRect(px - half, py - half, hpx, hpx);
            ctx.strokeRect(px - half, py - half, hpx, hpx);
        }
    }

    // Returns handle center positions in LOGICAL coordinates
    function handlePositions(bbox) {
        const [y0, x0, y1, x1] = bbox;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        return {
            tl: [x0, y0], tc: [cx, y0], tr: [x1, y0],
            ml: [x0, cy],               mr: [x1, cy],
            bl: [x0, y1], bc: [cx, y1], br: [x1, y1]
        };
    }

    // ── Hit testing ───────────────────────────────────────────────────────────
    function hitHandle(lx, ly) {
        if (state.selectedIndex < 0) return null;
        const el = state.elements[state.selectedIndex];
        if (!el || !el.bbox) return null;
        for (const [name, [hx, hy]] of Object.entries(handlePositions(el.bbox))) {
            if (Math.abs(lx - hx) <= HANDLE_HIT_LOGICAL &&
                Math.abs(ly - hy) <= HANDLE_HIT_LOGICAL) return name;
        }
        return null;
    }

    function hitBox(lx, ly) {
        // iterate in reverse so top-most (last drawn) takes priority
        for (let i = state.elements.length - 1; i >= 0; i--) {
            const el = state.elements[i];
            if (!el.bbox) continue;
            const [y0, x0, y1, x1] = el.bbox;
            if (lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1) return i;
        }
        return -1;
    }

    function cursorFor(lx, ly) {
        if (hitHandle(lx, ly)) return 'nwse-resize';
        if (hitBox(lx, ly) >= 0) return 'move';
        return 'crosshair';
    }

    // ── Canvas interactions ───────────────────────────────────────────────────
    function onPointerDown(e) {
        e.preventDefault();
        cvs.setPointerCapture(e.pointerId);
        const { lx, ly } = toLogical(e.clientX, e.clientY);

        const handle = hitHandle(lx, ly);
        if (handle) {
            const el = state.elements[state.selectedIndex];
            state.ci.isResizing  = true;
            state.ci.resizeHandle = handle;
            state.ci.startLX     = lx;
            state.ci.startLY     = ly;
            state.ci.origBbox    = [...el.bbox];
            return;
        }

        const boxIdx = hitBox(lx, ly);
        if (boxIdx >= 0) {
            selectElement(boxIdx);
            state.ci.isDragging = true;
            state.ci.startLX    = lx;
            state.ci.startLY    = ly;
            state.ci.origBbox   = [...state.elements[boxIdx].bbox];
            return;
        }

        // Begin drawing a new box
        state.ci.isDrawing = true;
        state.ci.startLX   = lx;
        state.ci.startLY   = ly;
    }

    function onPointerMove(e) {
        if (!cvs) return;
        const { lx, ly } = toLogical(e.clientX, e.clientY);
        const coords = document.getElementById('jpc-coords');
        if (coords) coords.textContent = `x: ${lx}  y: ${ly}`;

        const ci = state.ci;

        if (ci.isDrawing) {
            drawCanvas();
            // Draw preview rectangle
            const px0 = Math.min(ci.startLX, lx) * cScale;
            const py0 = Math.min(ci.startLY, ly) * cScale;
            const pw  = Math.abs(lx - ci.startLX) * cScale;
            const ph  = Math.abs(ly - ci.startLY) * cScale;
            ctx.strokeStyle = '#f5c542';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(px0, py0, pw, ph);
            ctx.setLineDash([]);
            return;
        }

        if (ci.isDragging) {
            const el = state.elements[state.selectedIndex];
            if (!el) return;
            const [oy0, ox0, oy1, ox1] = ci.origBbox;
            const bw = ox1 - ox0, bh = oy1 - oy0;
            const dx = lx - ci.startLX, dy = ly - ci.startLY;
            const nx0 = Math.max(0, Math.min(LOGIC_SIZE - bw, ox0 + dx));
            const ny0 = Math.max(0, Math.min(LOGIC_SIZE - bh, oy0 + dy));
            el.bbox = [Math.round(ny0), Math.round(nx0), Math.round(ny0 + bh), Math.round(nx0 + bw)];
            syncBboxFields();
            drawCanvas();
            return;
        }

        if (ci.isResizing) {
            applyResize(lx, ly);
            syncBboxFields();
            drawCanvas();
            return;
        }

        // Hover update
        const h = hitBox(lx, ly);
        if (h !== ci.hoverIndex) { ci.hoverIndex = h; drawCanvas(); }
        cvs.style.cursor = cursorFor(lx, ly);
    }

    function onPointerUp(e) {
        const { lx, ly } = toLogical(e.clientX, e.clientY);
        const ci = state.ci;

        if (ci.isDrawing) {
            ci.isDrawing = false;
            const bx0 = Math.round(Math.min(ci.startLX, lx));
            const bx1 = Math.round(Math.max(ci.startLX, lx));
            const by0 = Math.round(Math.min(ci.startLY, ly));
            const by1 = Math.round(Math.max(ci.startLY, ly));
            if ((bx1 - bx0) >= MIN_BOX_LOGICAL && (by1 - by0) >= MIN_BOX_LOGICAL) {
                state.elements.push({ type: 'obj', desc: '', bbox: [by0, bx0, by1, bx1] });
                selectElement(state.elements.length - 1);
            } else {
                drawCanvas();
            }
            return;
        }

        ci.isDragging  = false;
        ci.isResizing  = false;
        ci.resizeHandle = null;
        ci.origBbox    = null;
    }

    function applyResize(lx, ly) {
        const el = state.elements[state.selectedIndex];
        if (!el || !el.bbox) return;
        const [oy0, ox0, oy1, ox1] = state.ci.origBbox;
        const dx = lx - state.ci.startLX;
        const dy = ly - state.ci.startLY;
        const h  = state.ci.resizeHandle;
        let ny0 = oy0, nx0 = ox0, ny1 = oy1, nx1 = ox1;

        if (h.includes('t')) ny0 = Math.max(0,         Math.min(oy1 - MIN_BOX_LOGICAL, oy0 + dy));
        if (h.includes('b')) ny1 = Math.min(LOGIC_SIZE, Math.max(oy0 + MIN_BOX_LOGICAL, oy1 + dy));
        if (h.includes('l')) nx0 = Math.max(0,         Math.min(ox1 - MIN_BOX_LOGICAL, ox0 + dx));
        if (h.includes('r')) nx1 = Math.min(LOGIC_SIZE, Math.max(ox0 + MIN_BOX_LOGICAL, ox1 + dx));

        el.bbox = [Math.round(ny0), Math.round(nx0), Math.round(ny1), Math.round(nx1)];
    }

    // ── Keyboard ──────────────────────────────────────────────────────────────
    function onKeyDown(e) {
        if (!modal) return;

        if (e.key === 'Escape') { closeModal(); return; }

        // Delete selected element only when canvas is focused (not a text input)
        if (e.key === 'Delete' && document.activeElement === cvs) {
            e.preventDefault();
            deleteSelectedElement();
            return;
        }

        // Arrow nudge when canvas focused
        const arrows = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
        if (arrows.includes(e.key) && document.activeElement === cvs && state.selectedIndex >= 0) {
            e.preventDefault();
            const el = state.elements[state.selectedIndex];
            if (!el || !el.bbox) return;
            const d = e.shiftKey ? 10 : 1;
            const [y0, x0, y1, x1] = el.bbox;
            const bw = x1 - x0, bh = y1 - y0;
            let ny0 = y0, nx0 = x0;
            if (e.key === 'ArrowUp')    ny0 = Math.max(0,              y0 - d);
            if (e.key === 'ArrowDown')  ny0 = Math.min(LOGIC_SIZE - bh, y0 + d);
            if (e.key === 'ArrowLeft')  nx0 = Math.max(0,              x0 - d);
            if (e.key === 'ArrowRight') nx0 = Math.min(LOGIC_SIZE - bw, x0 + d);
            el.bbox = [Math.round(ny0), Math.round(nx0), Math.round(ny0 + bh), Math.round(nx0 + bw)];
            syncBboxFields();
            drawCanvas();
        }
    }

    // ── Element management ────────────────────────────────────────────────────
    function addElement(type) {
        const el = { type, desc: '', bbox: null };
        if (type === 'text') el.text = '';
        state.elements.push(el);
        selectElement(state.elements.length - 1);
    }

    function selectElement(idx) {
        state.selectedIndex = idx;
        renderElementList();
        renderEditor();
        drawCanvas();
    }

    function deleteSelectedElement() {
        if (state.selectedIndex < 0 || state.selectedIndex >= state.elements.length) return;
        state.elements.splice(state.selectedIndex, 1);
        state.selectedIndex = Math.min(state.selectedIndex, state.elements.length - 1);
        renderElementList();
        renderEditor();
        drawCanvas();
    }

    function duplicateSelectedElement() {
        if (state.selectedIndex < 0) return;
        const clone = JSON.parse(JSON.stringify(state.elements[state.selectedIndex]));
        if (clone.bbox) {
            clone.bbox = clone.bbox.map((v, i) => Math.min(LOGIC_SIZE, v + (i < 2 ? 30 : 30)));
        }
        state.elements.splice(state.selectedIndex + 1, 0, clone);
        selectElement(state.selectedIndex + 1);
    }

    function clearSelectedBbox() {
        if (state.selectedIndex < 0) return;
        state.elements[state.selectedIndex].bbox = null;
        syncBboxFields();
        drawCanvas();
    }

    // ── Element list rendering ────────────────────────────────────────────────
    function renderElementList() {
        const list = document.getElementById('jpc-elem-list');
        if (!list) return;
        list.innerHTML = '';
        state.elements.forEach((el, idx) => {
            const row   = document.createElement('div');
            row.className = 'jpc-row' + (idx === state.selectedIndex ? ' jpc-sel' : '');
            const badge = `<span class="jpc-badge jpc-badge-${el.type}">${el.type}</span>`;
            const label = escHtml((el.desc || el.text || '(empty)').substring(0, 28));
            const bbtag = el.bbox ? '<small style="color:#6c7086;margin-left:auto">[bbox]</small>' : '';
            row.innerHTML = badge
                + `<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span>`
                + bbtag;
            row.addEventListener('click', () => selectElement(idx));
            list.appendChild(row);
        });
    }

    // ── Element editor rendering ──────────────────────────────────────────────
    function renderEditor() {
        const editor = document.getElementById('jpc-editor');
        if (!editor) return;
        if (state.selectedIndex < 0 || state.selectedIndex >= state.elements.length) {
            editor.style.display = 'none';
            return;
        }
        editor.style.display = '';
        const el = state.elements[state.selectedIndex];
        document.getElementById('jpc-el-type').value = el.type;
        document.getElementById('jpc-el-desc').value = el.desc || '';
        document.getElementById('jpc-el-text').value = el.text || '';
        document.getElementById('jpc-text-row').style.display = el.type === 'text' ? '' : 'none';
        syncBboxFields();
    }

    function syncBboxFields() {
        if (state.selectedIndex < 0) return;
        const el = state.elements[state.selectedIndex];
        if (!el) return;
        const set = (id, v) => { const f = document.getElementById(id); if (f) f.value = v !== null && v !== undefined ? v : ''; };
        if (el.bbox) {
            set('jpc-bb-y0', el.bbox[0]);
            set('jpc-bb-x0', el.bbox[1]);
            set('jpc-bb-y1', el.bbox[2]);
            set('jpc-bb-x1', el.bbox[3]);
        } else {
            ['jpc-bb-y0','jpc-bb-x0','jpc-bb-y1','jpc-bb-x1'].forEach(id => set(id, ''));
        }
    }

    function onEditorTypeChange() {
        if (state.selectedIndex < 0) return;
        const el  = state.elements[state.selectedIndex];
        el.type   = document.getElementById('jpc-el-type').value;
        if (el.type === 'text' && el.text === undefined) el.text = '';
        if (el.type === 'obj')  delete el.text;
        document.getElementById('jpc-text-row').style.display = el.type === 'text' ? '' : 'none';
        renderElementList();
        drawCanvas();
    }

    function onBboxFieldInput() {
        if (state.selectedIndex < 0) return;
        const el = state.elements[state.selectedIndex];
        const vals = ['jpc-bb-y0','jpc-bb-x0','jpc-bb-y1','jpc-bb-x1']
            .map(id => parseInt(document.getElementById(id).value, 10));
        if (vals.every(v => !isNaN(v))) {
            el.bbox = vals;
        } else {
            el.bbox = null;
        }
        drawCanvas();
    }

    // ── Sync state from form fields ───────────────────────────────────────────
    function syncStateFromFields() {
        const g = id => (document.getElementById(id) || {}).value || '';
        state.highLevelDescription = g('jpc-hld');
        state.style.aesthetics     = g('jpc-aesthetics');
        state.style.lighting       = g('jpc-lighting');
        state.style.medium         = g('jpc-medium');
        state.style.photo          = g('jpc-photo');
        state.style.art_style      = g('jpc-art-style');
        state.background           = g('jpc-background');
        state.style.colorPalette   = g('jpc-palette').split(',').map(s => s.trim()).filter(Boolean);

        if (state.selectedIndex >= 0) {
            const el = state.elements[state.selectedIndex];
            if (el) {
                el.desc = g('jpc-el-desc');
                if (el.type === 'text') el.text = g('jpc-el-text');
            }
        }

        renderElementList();
    }

    // ── Populate form fields from state ───────────────────────────────────────
    function populateFields() {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        set('jpc-hld',        state.highLevelDescription);
        set('jpc-aesthetics', state.style.aesthetics);
        set('jpc-lighting',   state.style.lighting);
        set('jpc-medium',     state.style.medium);
        set('jpc-photo',      state.style.photo);
        set('jpc-art-style',  state.style.art_style);
        set('jpc-background', state.background);
        set('jpc-palette',    (state.style.colorPalette || []).join(', '));
        updateStyleModeUI();
        renderEditor();
    }

    function updateStyleModeUI() {
        const isPhoto = state.style.styleMode === 'photo';
        const modeP = document.getElementById('jpc-mode-photo');
        const modeA = document.getElementById('jpc-mode-artstyle');
        if (modeP) modeP.classList.toggle('jpc-mode-active',  isPhoto);
        if (modeA) modeA.classList.toggle('jpc-mode-active', !isPhoto);
        const photoRow    = document.getElementById('jpc-photo-row');
        const artstyleRow = document.getElementById('jpc-artstyle-row');
        if (photoRow)    photoRow.style.display    = isPhoto ? '' : 'none';
        if (artstyleRow) artstyleRow.style.display = isPhoto ? 'none' : '';
    }

    // ── Schema serializer ─────────────────────────────────────────────────────
    function buildSchema() {
        const out = {};

        // aspect_ratio – optional, inserted first when derivable from main UI size
        const derivedAspectRatio = deriveAspectRatioFromMainUi();
        if (derivedAspectRatio) {
            out.aspect_ratio = derivedAspectRatio;
        }

        // high_level_description – only if non-empty
        if (state.highLevelDescription.trim()) {
            out.high_level_description = state.highLevelDescription.trim();
        }

        // style_description – enforced key order
        const sd = {};
        sd.aesthetics = state.style.aesthetics;
        sd.lighting   = state.style.lighting;
        if (state.style.styleMode === 'photo') {
            sd.photo = state.style.photo;
        } else {
            sd.art_style = state.style.art_style;
        }
        sd.medium = state.style.medium;
        if (state.style.colorPalette && state.style.colorPalette.length > 0) {
            sd.color_palette = state.style.colorPalette;  // must be last
        }
        out.style_description = sd;

        // compositional_deconstruction
        const elements = state.elements.map(el => {
            const entry = { type: el.type };
            if (el.bbox) {
                entry.bbox = el.bbox.map(v => Math.round(v));
            }
            if (el.type === 'text') {
                entry.text = el.text || '';   // between bbox and desc per schema
            }
            entry.desc = el.desc || '';
            return entry;
        });
        out.compositional_deconstruction = {
            background: state.background,
            elements
        };

        return out;
    }

    // ── Validator / auto-fixer ────────────────────────────────────────────────
    function validateAndFix(schema) {
        const warns = [];

        if (schema.aspect_ratio !== undefined) {
            const aspectRatio = String(schema.aspect_ratio || '').trim();
            if (/^\d+:\d+$/.test(aspectRatio)) {
                schema.aspect_ratio = aspectRatio;
            } else {
                warns.push('aspect_ratio is not in n:n format and was removed');
                delete schema.aspect_ratio;
            }
        }

        // style_description
        const sd = schema.style_description || {};
        if (!sd.aesthetics)          warns.push('style_description.aesthetics is empty');
        if (!sd.lighting)            warns.push('style_description.lighting is empty');
        if (!sd.medium)              warns.push('style_description.medium is empty');
        if (!sd.photo && !sd.art_style) warns.push('style_description requires photo or art_style');

        // background
        if (!schema.compositional_deconstruction?.background) {
            warns.push('compositional_deconstruction.background is empty');
        }

        // elements
        (schema.compositional_deconstruction?.elements || []).forEach((el, i) => {
            const n = i + 1;

            // Unknown type → coerce to obj
            if (el.type !== 'obj' && el.type !== 'text') {
                warns.push(`Element ${n}: unknown type "${el.type}" changed to "obj"`);
                el.type = 'obj';
            }

            // Remove text field from obj elements
            if (el.type === 'obj' && 'text' in el) delete el.text;

            // text type requires text field
            if (el.type === 'text' && !el.text) {
                warns.push(`Element ${n}: type=text requires a non-empty text field`);
            }

            // Empty desc warning
            if (!el.desc) warns.push(`Element ${n}: desc is empty`);

            // bbox normalization
            if (el.bbox) {
                // Coerce to integers, clamp to [0, 1000]
                el.bbox = el.bbox.map(v => Math.max(0, Math.min(LOGIC_SIZE, Math.round(Number(v) || 0))));
                // Swap reversed coordinates
                if (el.bbox[0] > el.bbox[2]) {
                    [el.bbox[0], el.bbox[2]] = [el.bbox[2], el.bbox[0]];
                    warns.push(`Element ${n}: y_min > y_max – swapped automatically`);
                }
                if (el.bbox[1] > el.bbox[3]) {
                    [el.bbox[1], el.bbox[3]] = [el.bbox[3], el.bbox[1]];
                    warns.push(`Element ${n}: x_min > x_max – swapped automatically`);
                }
            }
        });

        return warns;
    }

    function showIssues(warns) {
        const bar = document.getElementById('jpc-issues');
        if (!bar) return;
        if (!warns || warns.length === 0) { bar.style.display = 'none'; return; }
        bar.style.display = '';
        bar.innerHTML = '<b>Validation notices (auto-fixed where possible):</b><br>'
            + warns.map(w => '&#8226; ' + escHtml(w)).join('<br>');
    }

    // ── Parse from prompt ─────────────────────────────────────────────────────
    async function parseFromPrompt() {
        const pf  = getPromptField();
        const raw = pf ? pf.value.trim() : '';
        if (!raw) { showNotification('Prompt field is empty', 'warning'); return; }

        const unescaped = unescapeFromPrompt(raw);
        if (unescaped.startsWith('{')) {
            try {
                const parsed = JSON.parse(unescaped);
                state = freshState();
                hydrateStateFromSchema(parsed);
                populateFields();
                renderElementList();
                renderEditor();
                drawCanvas();
                showIssues([]);
                showNotification('Parsed prompt JSON into editor', 'success');
            } catch (err) {
                showNotification('Could not parse JSON: ' + err.message, 'error');
            }
            return;
        }

        // Plain text – offer to seed scene description
        const shouldSeed = await showYesCancelDialog({
            title: 'Parse From Prompt',
            message: 'Prompt is plain text (not JSON).\nSeed the "Scene Description" field with the current prompt text?',
            yesLabel: 'Yes',
            cancelLabel: 'Cancel'
        });
        if (shouldSeed) {
            state = freshState();
            state.highLevelDescription = raw;
            populateFields();
            renderElementList();
            drawCanvas();
        }
    }

    function hydrateStateFromSchema(schema) {
        state.aspectRatio = schema.aspect_ratio || '';
        state.highLevelDescription = schema.high_level_description || '';
        const sd = schema.style_description || {};
        state.style.aesthetics   = sd.aesthetics   || '';
        state.style.lighting     = sd.lighting     || '';
        state.style.medium       = sd.medium       || '';
        state.style.colorPalette = Array.isArray(sd.color_palette) ? sd.color_palette : [];
        if (sd.photo !== undefined) {
            state.style.styleMode = 'photo';
            state.style.photo     = sd.photo;
        } else {
            state.style.styleMode = 'art_style';
            state.style.art_style = sd.art_style || '';
        }
        const cd = schema.compositional_deconstruction || {};
        state.background = cd.background || '';
        state.elements   = (cd.elements || []).map(el => ({
            type: el.type === 'text' ? 'text' : 'obj',
            desc: el.desc || '',
            text: el.type === 'text' ? (el.text || '') : undefined,
            bbox: Array.isArray(el.bbox) && el.bbox.length === 4
                ? el.bbox.map(v => Math.max(0, Math.min(LOGIC_SIZE, Math.round(Number(v) || 0))))
                : null
        }));
    }

    // ── Apply to prompt ───────────────────────────────────────────────────────
    function applyToPrompt() {
        syncStateFromFields();
        const schema = buildSchema();
        const warns  = validateAndFix(schema);
        showIssues(warns);

        const pf = getPromptField();
        if (!pf) { showNotification('Prompt field not found', 'error'); return; }

        pf.value = escapeForPrompt(JSON.stringify(schema)).replace(/[\r\n]+/g, ' ');
        pf.dispatchEvent(new Event('input',  { bubbles: true }));
        pf.dispatchEvent(new Event('change', { bubbles: true }));
        showNotification('JSON schema applied to prompt field', 'success');
        closeModal();
    }

    // ── Preview JSON ──────────────────────────────────────────────────────────
    function showPreview() {
        syncStateFromFields();
        const schema = buildSchema();
        const warns  = validateAndFix(schema);
        showIssues(warns);
        const json   = JSON.stringify(schema, null, 2);

        const existing = document.getElementById('jpc-preview-modal');
        if (existing) existing.remove();

        const pm = document.createElement('div');
        pm.id           = 'jpc-preview-modal';
        pm.style.cssText = 'position:fixed;inset:0;z-index:21000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);';
        pm.innerHTML = `
<div style="background:#1e1e2e;color:#cdd6f4;border-radius:10px;padding:24px;
    max-width:720px;width:92%;max-height:82vh;overflow:auto;
    box-shadow:0 8px 32px rgba(0,0,0,0.8);font-family:sans-serif;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h4 style="margin:0;">JSON Preview</h4>
        <button id="jpc-pm-close" style="background:none;border:none;color:#cdd6f4;font-size:20px;cursor:pointer;">&times;</button>
    </div>
    <pre style="background:#11111b;padding:14px;border-radius:6px;font-size:12px;overflow-x:auto;margin:0;white-space:pre-wrap;word-break:break-all;">${escHtml(json)}</pre>
    <div style="text-align:right;margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
        <button id="jpc-pm-copy"  class="btn btn-secondary">Copy</button>
        <button id="jpc-pm-apply" class="btn btn-primary">Apply to Prompt</button>
    </div>
</div>`;
        document.body.appendChild(pm);

        document.getElementById('jpc-pm-close').addEventListener('click', () => pm.remove());
        pm.addEventListener('click', e => { if (e.target === pm) pm.remove(); });

        document.getElementById('jpc-pm-copy').addEventListener('click', () => {
            const copyBtn = document.getElementById('jpc-pm-copy');
            navigator.clipboard.writeText(json).catch(() => {});
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy'; }, 2000);
        });

        document.getElementById('jpc-pm-apply').addEventListener('click', () => {
            pm.remove();
            applyToPrompt();
        });
    }

    // ── Magic Prompt ──────────────────────────────────────────────────────────
    async function onMagicPrompt() {
        if (!JsonComposerSettings.apiUrl.trim()) {
            showNotification('Configure Magic Prompt API URL in JSON Composer settings first', 'warning');
            return;
        }

        syncStateFromFields();
        const magicPromptInput = buildMagicPromptUserInput();

        const btn      = document.getElementById('jpc-magic-btn');
        const origHtml = btn.innerHTML;
        btn.disabled   = true;
        btn.innerHTML  = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…';

        const loadingNote = showNotification('Magic Prompt: generating JSON schema…', 'info', true);
        try {
            const rawText = await callMagicPromptApi(magicPromptInput);
            if (loadingNote) loadingNote.remove();
            const parsed = extractJsonFromText(rawText);
            state = freshState();
            hydrateStateFromSchema(parsed);
            populateFields();
            renderElementList();
            renderEditor();
            drawCanvas();
            showIssues([]);
            showNotification('Magic Prompt applied – review before clicking Apply', 'success');
        } catch (err) {
            if (loadingNote) loadingNote.remove();
            console.error('[JSON Composer] Magic Prompt error:', err);
            const msg = err.message.includes('401')    ? 'Auth failed – check API key'
                      : err.message.includes('404')    ? 'Endpoint not found – check URL'
                      : err.message.includes('abort')  ? 'Request timed out'
                      : err.message.includes('JSON')   ? 'Model returned non-JSON – try a different model'
                      : err.message;
            showNotification('Magic Prompt failed: ' + msg, 'error');
        } finally {
            btn.disabled  = false;
            btn.innerHTML = origHtml;
        }
    }

    async function callMagicPromptApi(userInput) {
        const system = `You are an expert at creating structured JSON image prompts.
Given a plain-text description, produce a valid JSON object with EXACTLY these top-level keys in order:
1. aspect_ratio            – optional, if present this MUST be first and use n:n format (example "16:9")
2. high_level_description  – one or two sentence scene summary
3. style_description       – object with keys IN ORDER: aesthetics, lighting, photo (for photos) OR art_style (for illustrations), medium, and optionally color_palette (hex array, MUST be last)
4. compositional_deconstruction – object with: background (string) and elements (array of objects)
   Each element object has keys IN ORDER: type ("obj" or "text"), optional bbox ([y_min, x_min, y_max, x_max] integers 0-1000), optional text (only for type "text", between bbox and desc), desc (detailed description).

Return ONLY the raw JSON object. No markdown fences, no explanation, no other text.`;

        const user = (userInput || '').trim()
            ? userInput
            : 'Create a detailed example schema-compliant JSON image prompt for an interesting scene.';

        const endpoint  = JsonComposerSettings.apiUrl.trim().replace(/\/$/, '') + '/v1/chat/completions';
        const controller = new AbortController();
        const tId = setTimeout(() => controller.abort(), JsonComposerSettings.timeout || 120000);

        try {
            const resp = await fetch(endpoint, {
                method:  'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(JsonComposerSettings.apiKey
                        ? { 'Authorization': 'Bearer ' + JsonComposerSettings.apiKey }
                        : {})
                },
                body: JSON.stringify({
                    ...(JsonComposerSettings.model ? { model: JsonComposerSettings.model } : {}),
                    messages:    [{ role: 'system', content: system }, { role: 'user', content: user }],
                    max_tokens:  2400,
                    temperature: 0.8
                }),
                signal: controller.signal
            });
            clearTimeout(tId);
            if (!resp.ok) throw new Error(`API returned ${resp.status}`);
            const data = await resp.json();
            return data.choices?.[0]?.message?.content
                || data.choices?.[0]?.text
                || '';
        } catch (err) {
            clearTimeout(tId);
            throw err;
        }
    }

    function extractJsonFromText(text) {
        if (!text) throw new Error('Empty response from model');

        let cleaned = sanitizeLlmJsonText(text);

        // Some providers return JSON as a quoted string; unwrap and parse again.
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object') return parsed;
            if (typeof parsed === 'string') cleaned = sanitizeLlmJsonText(parsed);
        } catch (_) {}

        try { return JSON.parse(cleaned); } catch (_) {}

        // Find first balanced { ... } block
        const balanced = findBalancedObject(cleaned);
        if (balanced) {
            try { return JSON.parse(balanced); } catch (_) {}
        }

        throw new Error('Model returned non-JSON content');
    }

    function sanitizeLlmJsonText(text) {
        let cleaned = String(text || '').trim();

        // Unwrap simple outer quotes when the whole payload is quoted.
        if ((cleaned.startsWith('"') && cleaned.endsWith('"'))
            || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
            cleaned = cleaned.slice(1, -1).trim();
        }

        // Normalize common escaped sequences seen in LLM outputs.
        cleaned = cleaned
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"');

        // Remove markdown fences, including escaped forms.
        cleaned = cleaned
            .replace(/\\`\\`\\`(?:json)?/gi, '')
            .replace(/```(?:json)?\s*/gi, '')
            .replace(/```/g, '')
            .trim();

        return cleaned;
    }

    function findBalancedObject(text) {
        let start = -1, depth = 0, inStr = false, esc = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inStr) {
                if (esc)           esc = false;
                else if (ch === '\\') esc = true;
                else if (ch === '"')  inStr = false;
                continue;
            }
            if (ch === '"') { inStr = true; continue; }
            if (ch === '{') { if (depth === 0) start = i; depth++; }
            else if (ch === '}') {
                if (depth > 0) depth--;
                if (depth === 0 && start !== -1) return text.slice(start, i + 1);
            }
        }
        return null;
    }

    function buildMagicPromptUserInput() {
        const lines = [];
        const fallbackPrompt = (getPromptField() ? getPromptField().value.trim() : '') || '';

        lines.push('Create or refine a schema-compliant JSON image prompt using the context below.');

        if (state.highLevelDescription.trim()) {
            lines.push('Scene Description: ' + state.highLevelDescription.trim());
        }

        if (state.background.trim()) {
            lines.push('Background: ' + state.background.trim());
        }

        const styleParts = [];
        if (state.style.aesthetics.trim()) styleParts.push('aesthetics=' + state.style.aesthetics.trim());
        if (state.style.lighting.trim()) styleParts.push('lighting=' + state.style.lighting.trim());
        if (state.style.medium.trim()) styleParts.push('medium=' + state.style.medium.trim());
        if (state.style.styleMode === 'photo' && state.style.photo.trim()) {
            styleParts.push('photo=' + state.style.photo.trim());
        }
        if (state.style.styleMode === 'art_style' && state.style.art_style.trim()) {
            styleParts.push('art_style=' + state.style.art_style.trim());
        }
        if (Array.isArray(state.style.colorPalette) && state.style.colorPalette.length > 0) {
            styleParts.push('color_palette=' + state.style.colorPalette.join(', '));
        }
        if (styleParts.length > 0) {
            lines.push('Style Context: ' + styleParts.join(' | '));
        }

        const aspect = deriveAspectRatioFromMainUi();
        if (aspect) {
            lines.push('Suggested aspect_ratio: ' + aspect);
        }

        const existingElements = Array.isArray(state.elements) ? state.elements : [];
        if (existingElements.length > 0) {
            lines.push('Existing elements (preserve intent; improve clarity and consistency):');
            existingElements.forEach((el, idx) => {
                const parts = [];
                parts.push('type=' + (el.type || 'obj'));
                if (Array.isArray(el.bbox) && el.bbox.length === 4) {
                    parts.push('bbox=[' + el.bbox.map(v => Math.round(Number(v) || 0)).join(', ') + ']');
                }
                if (el.type === 'text' && (el.text || '').trim()) {
                    parts.push('text=' + (el.text || '').trim());
                }
                if ((el.desc || '').trim()) {
                    parts.push('desc=' + (el.desc || '').trim());
                }
                lines.push((idx + 1) + '. ' + parts.join(' | '));
            });
        }

        if (!state.highLevelDescription.trim() && fallbackPrompt) {
            lines.push('Fallback freeform prompt text: ' + fallbackPrompt);
        }

        lines.push('Return only valid JSON matching the required schema.');
        return lines.join('\n');
    }

    // Pick the closest common ratio using current main UI width/height settings.
    function deriveAspectRatioFromMainUi() {
        const widthEl  = document.querySelector('#width');
        const heightEl = document.querySelector('#height');
        if (!widthEl || !heightEl) return '';

        const width  = parseInt(widthEl.value, 10);
        const height = parseInt(heightEl.value, 10);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';

        const ratio = width / height;
        const commonRatios = [
            { label: '1:1',  value: 1 },
            { label: '4:3',  value: 4 / 3 },
            { label: '3:4',  value: 3 / 4 },
            { label: '3:2',  value: 3 / 2 },
            { label: '2:3',  value: 2 / 3 },
            { label: '16:9', value: 16 / 9 },
            { label: '9:16', value: 9 / 16 },
            { label: '21:9', value: 21 / 9 },
            { label: '32:9', value: 32 / 9 }
        ];

        let best = commonRatios[0];
        let bestDelta = Math.abs(ratio - best.value);
        for (let i = 1; i < commonRatios.length; i++) {
            const candidate = commonRatios[i];
            const delta = Math.abs(ratio - candidate.value);
            if (delta < bestDelta) {
                best = candidate;
                bestDelta = delta;
            }
        }

        return best.label;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function getPromptField() {
        return (typeof promptField !== 'undefined' && promptField)
            || document.querySelector('#prompt');
    }

    // Escape curly braces so the prompt field doesn't interpret them specially.
    function escapeForPrompt(json) {
        return json.replace(/[{}]/g, m => '\\' + m);
    }

    // Reverse escapeForPrompt before JSON.parse.
    function unescapeFromPrompt(text) {
        return text.replace(/\\([{}])/g, '$1');
    }

    function showNotification(message, type = 'info', persistent = false) {
        const n = document.createElement('div');
        const bg = { success: '#28a745', error: '#dc3545', warning: '#fd7e14', info: '#17a2b8' };
        n.style.cssText = `
            position:fixed;top:20px;right:20px;padding:12px 20px;
            border-radius:6px;color:#fff;font-weight:bold;z-index:21001;
            max-width:360px;word-wrap:break-word;
            box-shadow:0 4px 12px rgba(0,0,0,0.4);font-family:sans-serif;font-size:13px;
        `;
        n.style.backgroundColor = bg[type] || bg.info;
        if (type === 'warning') n.style.color = '#222';
        n.textContent = message;
        document.body.appendChild(n);
        if (!persistent) setTimeout(() => n.remove(), 4500);
        return n;
    }

    function escHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Modal confirm helper so both affirmative and cancel actions are always visible.
    function showYesCancelDialog(options) {
        const title = options?.title || 'Confirm';
        const message = options?.message || '';
        const yesLabel = options?.yesLabel || 'OK';
        const cancelLabel = options?.cancelLabel || 'Cancel';

        return new Promise(resolve => {
            const existing = document.getElementById('jpc-confirm-modal');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'jpc-confirm-modal';
            overlay.style.cssText = `
                position:fixed;inset:0;z-index:22000;
                display:flex;align-items:center;justify-content:center;
                background:rgba(0,0,0,0.65);
            `;

            const htmlMessage = escHtml(message).replace(/\n/g, '<br>');
            overlay.innerHTML = `
                <div id="jpc-confirm-box" style="
                    background:#1e1e2e;color:#cdd6f4;border-radius:10px;
                    border:1px solid #313244;
                    padding:18px;max-width:460px;width:90%;
                    box-shadow:0 8px 32px rgba(0,0,0,0.75);font-family:sans-serif;
                ">
                    <h4 style="margin:0 0 10px 0;color:#89b4fa;">${escHtml(title)}</h4>
                    <div style="font-size:13px;line-height:1.5;white-space:normal;">${htmlMessage}</div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
                        <button id="jpc-confirm-cancel" class="btn btn-secondary">${escHtml(cancelLabel)}</button>
                        <button id="jpc-confirm-yes" class="btn btn-primary">${escHtml(yesLabel)}</button>
                    </div>
                </div>
            `;

            function cleanup(value) {
                document.removeEventListener('keydown', onKeyDown);
                overlay.remove();
                resolve(value);
            }

            function onKeyDown(e) {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Enter') cleanup(true);
            }

            overlay.addEventListener('click', e => {
                if (e.target === overlay) cleanup(false);
            });

            document.body.appendChild(overlay);
            document.getElementById('jpc-confirm-cancel').addEventListener('click', () => cleanup(false));
            document.getElementById('jpc-confirm-yes').addEventListener('click', () => cleanup(true));
            document.addEventListener('keydown', onKeyDown);
        });
    }

    // ── Settings panel (sidebar) ──────────────────────────────────────────────
    function setup() {
        const panel = document.createElement('div');
        panel.id = 'json-composer-settings';
        panel.classList.add('settings-box', 'panel-box');
        panel.innerHTML = `
<h4 class="collapsible">
    <i class="fa-solid fa-diagram-project"></i> JSON Prompt Composer
    <i id="jpc-reset-icon" class="fa-solid fa-arrow-rotate-left section-button">
        <span class="simple-tooltip top-left">Reset JSON Composer Settings</span>
    </i>
</h4>
<div id="jpc-settings-entries" class="collapsible-content" style="display:block;">
    <p>Compose structured JSON image prompts with a visual bounding-box editor.</p>
    <p><b>Magic Prompt</b> requires an OpenAI-compatible text API (no vision needed).</p>
    <p>
        <b>Examples:</b><br>
        OpenAI: <code>https://api.openai.com</code><br>
        Ollama: <code>http://localhost:11434</code><br>
        LM Studio: <code>http://localhost:1234</code>
    </p>

    <div class="input-group">
        <label for="jpc_api_url">Magic Prompt API URL:</label>
        <input id="jpc_api_url" name="jpc_api_url" size="50"
            placeholder="http://localhost:1234"
            onchange="setJsonComposerSettings()" autocomplete="off">
        <small>Base URL – appends /v1/chat/completions</small>
    </div>

    <div class="input-group">
        <label for="jpc_api_key">API Key (optional):</label>
        <input id="jpc_api_key" name="jpc_api_key" type="password" size="50"
            placeholder="sk-..."
            onchange="setJsonComposerSettings()" autocomplete="off">
        <small>Leave empty for local LLMs</small>
    </div>

    <div class="input-group">
        <label for="jpc_model">Model Name:</label>
        <input id="jpc_model" name="jpc_model" size="50"
            placeholder="gpt-4o, mistral, llama3, etc."
            onchange="setJsonComposerSettings()" autocomplete="off">
    </div>

    <div class="input-group">
        <label for="jpc_timeout_seconds">Request Timeout (seconds):</label>
        <input id="jpc_timeout_seconds" name="jpc_timeout_seconds" type="number" min="1" step="1" size="10"
            placeholder="120"
            onchange="setJsonComposerSettings()" autocomplete="off">
    </div>

    <div class="input-group">
        <button class="btn btn-secondary" onclick="jsonComposerResetSettings(event)">
            Reset to Defaults
        </button>
    </div>
    <small><i>Tip: Only text generation is needed – no vision model required for Magic Prompt.</i></small>
</div>
`;

        const editorSettings = document.getElementById('editor-settings');
        if (editorSettings) {
            editorSettings.parentNode.insertBefore(panel, editorSettings.nextSibling);
        }

        if (typeof createCollapsibles === 'function') createCollapsibles(panel);

        document.getElementById('jpc-reset-icon')
            ?.addEventListener('click', jsonComposerResetSettings);

        jsonComposerResetSettings(null);  // load saved settings

        waitForUiAndInsert();
    }

    function waitForUiAndInsert() {
        let tries = 0;
        const interval = setInterval(() => {
            tries++;
            const ready = !!document.querySelector('#prompt_history')
                || (typeof negativePromptField !== 'undefined' && !!negativePromptField)
                || !!document.querySelector('#negative_prompt');
            if (ready) {
                clearInterval(interval);
                insertLaunchButton();
            } else if (tries >= 120) {
                clearInterval(interval);
                console.warn('[JSON Composer] UI anchor not found after 12s – launch button not inserted');
            }
        }, 100);
    }

    setup();
    console.log('JSON Prompt Composer Plugin loaded (v1.0.0)');

})();

// ── Global settings functions (must be global for inline onchange handlers) ───

function setJsonComposerSettings() {
    const g = id => (document.getElementById(id) || {}).value || '';
    JsonComposerSettings.apiUrl = g('jpc_api_url');
    JsonComposerSettings.apiKey = g('jpc_api_key');
    JsonComposerSettings.model  = g('jpc_model');

    const timeoutSecondsRaw = parseFloat(g('jpc_timeout_seconds'));
    const timeoutSeconds = Number.isFinite(timeoutSecondsRaw) && timeoutSecondsRaw > 0
        ? timeoutSecondsRaw
        : 120;
    JsonComposerSettings.timeout = Math.round(timeoutSeconds * 1000);

    localStorage.setItem('JsonComposer_Plugin_Settings', JSON.stringify(JsonComposerSettings));
}

function jsonComposerResetSettings(resetEvent) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('JsonComposer_Plugin_Settings')); } catch (_) {}

    if (saved == null || resetEvent != null) {
        JsonComposerSettings.apiUrl     = '';
        JsonComposerSettings.apiKey     = '';
        JsonComposerSettings.model      = '';
        JsonComposerSettings.timeout    = 120000;
        JsonComposerSettings.maxRetries = 2;
    } else {
        Object.assign(JsonComposerSettings, saved);
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('jpc_api_url', JsonComposerSettings.apiUrl);
    set('jpc_api_key', JsonComposerSettings.apiKey);
    set('jpc_model',   JsonComposerSettings.model);
    set('jpc_timeout_seconds', Math.max(1, Math.round((JsonComposerSettings.timeout || 120000) / 1000)));
}
