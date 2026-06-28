/*
 * AI Image Critic Plugin
 *
 * v1.1.0, last updated: 06/14/2026
 * Initial version by GitHub Copilot 5/2026
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 *
 * Analyzes generated images for common AI image artifacts and errors,
 * then recommends prompt and parameter changes to fix them.
 *
 * Requires an OpenAI-compatible API with vision capabilities:
 * - OpenAI GPT-4o
 * - Ollama with LLaVA / BakLLaVA / gemma3 etc.
 * - LM Studio with a vision model
 */

// Settings live outside the IIFE so save/load functions can reach them.
var AiImageCriticSettings = {
    apiUrl: "",   // e.g. "http://localhost:1234"
    apiKey: "",   // leave empty for local LLMs
    model: "llava" // vision-capable model name
};

(function () {
    "use strict";

    // ── Button registration ──────────────────────────────────────────────────
    PLUGINS['IMAGE_INFO_BUTTONS'].push([
        {
            html: '<span class="region-label" style="background:rgba(0,0,0,0.5)">AI Critic:</span>',
            type: 'label'
        },
        {
            html: '<i class="fa-solid fa-magnifying-glass"></i>',
            on_click: onCriticButtonClick,
            filter: () => true
        }
    ]);

    // ── Config ───────────────────────────────────────────────────────────────
    const config = {
        timeout: 120000,
        maxRetries: 2,
        maxImageSize: 1536
    };

    // ── API helpers ──────────────────────────────────────────────────────────
    function resolveApiEndpoint() {
        const base = AiImageCriticSettings.apiUrl.trim();
        if (!base) {
            const proto = window.location.protocol || 'http:';
            const host  = window.location.hostname  || '127.0.0.1';
            return `${proto}//${host}:1234/v1/chat/completions`;
        }
        const clean = base.endsWith('/') ? base.slice(0, -1) : base;
        return clean.endsWith('/v1/chat/completions') ? clean : clean + '/v1/chat/completions';
    }

    // ── Image → base64 ───────────────────────────────────────────────────────
    function imageToBase64(imgEl) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx    = canvas.getContext('2d');
                let w = imgEl.naturalWidth  || imgEl.width;
                let h = imgEl.naturalHeight || imgEl.height;
                const max = config.maxImageSize;
                if (w > max || h > max) {
                    if (w > h) { h = Math.round(h * max / w); w = max; }
                    else       { w = Math.round(w * max / h); h = max; }
                }
                canvas.width  = w;
                canvas.height = h;
                ctx.drawImage(imgEl, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            } catch (e) { reject(e); }
        });
    }

    // ── LLM call ─────────────────────────────────────────────────────────────
    async function analyzeImageWithLLM(base64Image) {
        const systemPrompt = `You are an expert AI image quality analyst specialising in Stable Diffusion outputs.
Your job is to carefully examine the provided image and identify any common AI image generation artifacts or errors.

Common artifacts to look for (check every one):
- Extra, missing, or fused fingers / toes / limbs
- Facial anomalies: asymmetric eyes, extra eyes, distorted nose or mouth, off-skin tones
- Duplicate body parts or merged bodies
- Unnatural anatomy or impossible body proportions
- Garbled, nonsense, or incorrectly rendered text
- Inconsistent or impossible lighting / shadows
- Incoherent or melting backgrounds
- Visible seams or stitching artefacts
- Blurry, muddy, or over-smoothed areas
- Unnatural skin texture or plastic-looking skin
- Object merging / melting into each other
- Floating or disconnected body parts
- Hair clumping or unrealistic hair physics
- Wrong number of objects (e.g. six-legged animals)
- Incorrect perspective or scale between elements

Respond ONLY with a valid JSON object matching this exact schema (no markdown fences, no extra text):
{
  "severity": "none|minor|moderate|severe",
  "issues": [
    { "area": "<short label>", "description": "<what is wrong>", "severity": "minor|moderate|severe" }
  ],
  "positive_prompt_additions": "<comma-separated terms to ADD to the positive prompt, or empty string>",
  "negative_prompt_additions": "<comma-separated terms to ADD to the negative prompt, or empty string>",
  "parameter_suggestions": "<free-text advice on CFG scale, steps, sampler, seed variation, etc., or empty string>",
  "summary": "<one or two sentence plain-English summary>"
}
If the image looks clean with no issues, return severity "none", an empty issues array, and explain in summary.`;

        const userMessage = "Please analyze this AI-generated image for any artifacts or errors and provide your JSON report.";

        const payload = {
            model: AiImageCriticSettings.model,
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text",      text: userMessage },
                        { type: "image_url", image_url: { url: base64Image } }
                    ]
                }
            ],
            max_tokens: 2500, // we really don't want this many tokens, but thinking models end up with a lot of extra tokens we need to remove.
            temperature: 0.3   // lower = more deterministic / factual
        };

        const headers = { 'Content-Type': 'application/json' };
        if (AiImageCriticSettings.apiKey.trim()) {
            headers['Authorization'] = `Bearer ${AiImageCriticSettings.apiKey.trim()}`;
        }

        let lastError;
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), config.timeout);

                const response = await fetch(resolveApiEndpoint(), {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                clearTimeout(tid);

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API ${response.status}: ${errText}`);
                }

                const data = await response.json();
                const raw  = data?.choices?.[0]?.message?.content?.trim();
                return parseJsonFromModelText(raw);
                // if (!raw) throw new Error('Empty response from LLM');

                // // Strip accidental markdown code fences if the model added them
                // const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
                // return JSON.parse(cleaned);

            } catch (e) {
                lastError = e;
                console.warn(`AI Critic attempt ${attempt} failed:`, e.message);
                if (attempt < config.maxRetries) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }
        }
        throw lastError || new Error('All retry attempts failed');
    }

    function parseJsonFromModelText(raw) {
        if (!raw || typeof raw !== "string") {
            throw new Error("Empty response from LLM");
        }

        const candidates = [];

        // 1) Raw as-is
        candidates.push(raw.trim());

        // 2) Remove common reasoning/channel wrappers
        const noThinking = raw
            .replace(/<\|[a-zA-Z0-9_.-]+\|>[\s\S]*?[a-zA-Z0-9_.-]+\|>/g, " ")
            .replace(/<think>[\s\S]*?<\/think>/gi, " ")
            .replace(/<analysis>[\s\S]*?<\/analysis>/gi, " ")
            .trim();
        candidates.push(noThinking);

        // 3) Extract fenced JSON (```json ... ``` or ``` ... ```)
        const fenceMatch = noThinking.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

        // 4) Extract first balanced {...} object
        const balanced = extractFirstBalancedJsonObject(noThinking);
        if (balanced) candidates.push(balanced);

        for (const c of candidates) {
            //console.log('parsing:', c); //DEBUG
            try {
                return JSON.parse(c);
            } catch (_) {}
        }
        throw new Error("LLM returned non-JSON content");
    }

    function extractFirstBalancedJsonObject(text) {
        let start = -1, depth = 0, inStr = false, esc = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inStr) {
                if (esc) esc = false;
                else if (ch === "\\") esc = true;
                else if (ch === "\"") inStr = false;
                continue;
            }
            if (ch === "\"") { inStr = true; continue; }
            if (ch === "{") {
                if (depth === 0) start = i;
                depth++;
            } else if (ch === "}") {
                if (depth > 0) depth--;
                if (depth === 0 && start !== -1) {
                    return text.slice(start, i + 1);
                }
            }
        }
        return null;
    }

    // ── Button handler ───────────────────────────────────────────────────────
    async function onCriticButtonClick(origRequest, image) {
        if (!image) {
            showNotification('Image not found', 'error');
            return;
        }
        if (!AiImageCriticSettings.apiUrl.trim()) {
            showNotification('Configure AI Image Critic settings first', 'warning');
            return;
        }

        const loading = showNotification('Analyzing image for errors…', 'info', true);
        try {
            const base64 = await imageToBase64(image);
            const report = await analyzeImageWithLLM(base64);
            if (loading) loading.remove();
            showReportModal(report);
        } catch (err) {
            if (loading) loading.remove();
            console.error('AI Image Critic error:', err);
            let msg = 'Analysis failed';
            if (err.message.includes('401'))      msg = 'Auth failed – check API key';
            else if (err.message.includes('404')) msg = 'Endpoint not found – check URL';
            else if (err.message.includes('abort') || err.message.includes('timeout')) msg = 'Request timed out';
            else if (err.message.includes('JSON')) msg = 'LLM returned non-JSON – try a different model';
            showNotification(msg, 'error');
        }
    }

    // ── Report modal ─────────────────────────────────────────────────────────
    function severityColor(s) {
        return { none: '#28a745', minor: '#ffc107', moderate: '#fd7e14', severe: '#dc3545' }[s] || '#6c757d';
    }

    function showReportModal(report) {
        // Remove existing modal if present
        const existing = document.getElementById('ai-critic-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'ai-critic-modal';
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 20000;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.6);
        `;

        const overallColor = severityColor(report.severity || 'none');
        const issueRows = (report.issues || []).map(issue => `
            <tr>
                <td style="padding:6px 10px;font-weight:bold;white-space:nowrap;color:${severityColor(issue.severity)}">${escHtml(issue.area)}</td>
                <td style="padding:6px 10px">${escHtml(issue.description)}</td>
                <td style="padding:6px 10px;white-space:nowrap;color:${severityColor(issue.severity)}">${escHtml(issue.severity)}</td>
            </tr>`).join('');

        const noIssuesRow = (!report.issues || report.issues.length === 0)
            ? `<tr><td colspan="3" style="padding:10px;text-align:center;color:#28a745">No issues detected ✓</td></tr>`
            : '';

        modal.innerHTML = `
            <div id="ai-critic-modal-box" style="
                background:#1e1e2e; color:#cdd6f4; border-radius:10px;
                padding:24px; max-width:700px; width:90%; max-height:85vh;
                overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.7);
                font-family:sans-serif; font-size:14px;
            ">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                    <h3 style="margin:0;display:flex;align-items:center;gap:10px">
                        <i class="fa-solid fa-magnifying-glass"></i> AI Image Critic Report
                        <span style="
                            font-size:12px;font-weight:normal;padding:2px 10px;
                            border-radius:20px;background:${overallColor};color:#fff
                        ">${escHtml(report.severity || 'unknown')}</span>
                    </h3>
                    <button id="ai-critic-close" style="
                        background:none;border:none;color:#cdd6f4;font-size:20px;
                        cursor:pointer;line-height:1
                    ">&times;</button>
                </div>

                <p style="margin:0 0 16px;line-height:1.5;color:#bac2de">${escHtml(report.summary || '')}</p>

                <h4 style="margin:0 0 8px;color:#89b4fa">Issues Found</h4>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
                    <thead>
                        <tr style="background:#313244;text-align:left">
                            <th style="padding:6px 10px">Area</th>
                            <th style="padding:6px 10px">Description</th>
                            <th style="padding:6px 10px">Severity</th>
                        </tr>
                    </thead>
                    <tbody style="background:#1e1e2e">
                        ${issueRows}${noIssuesRow}
                    </tbody>
                </table>

                ${report.positive_prompt_additions ? `
                <h4 style="margin:0 0 6px;color:#a6e3a1">Add to Positive Prompt</h4>
                <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:16px">
                    <textarea id="ai-critic-pos" readonly style="
                        flex:1;background:#313244;color:#a6e3a1;border:1px solid #45475a;
                        border-radius:6px;padding:8px;font-family:monospace;font-size:13px;
                        resize:vertical;min-height:54px
                    ">${escHtml(report.positive_prompt_additions)}</textarea>
                    <button class="btn btn-secondary ai-critic-copy-btn" data-target="ai-critic-pos"
                        style="white-space:nowrap;height:36px">Copy</button>
                    <button class="btn btn-primary ai-critic-append-btn" data-target="ai-critic-pos" data-field="#prompt"
                        style="white-space:nowrap;height:36px">Append to Prompt</button>
                </div>` : ''}

                ${report.negative_prompt_additions ? `
                <h4 style="margin:0 0 6px;color:#f38ba8">Add to Negative Prompt</h4>
                <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:16px">
                    <textarea id="ai-critic-neg" readonly style="
                        flex:1;background:#313244;color:#f38ba8;border:1px solid #45475a;
                        border-radius:6px;padding:8px;font-family:monospace;font-size:13px;
                        resize:vertical;min-height:54px
                    ">${escHtml(report.negative_prompt_additions)}</textarea>
                    <button class="btn btn-secondary ai-critic-copy-btn" data-target="ai-critic-neg"
                        style="white-space:nowrap;height:36px">Copy</button>
                    <button class="btn btn-primary ai-critic-append-btn" data-target="ai-critic-neg" data-field="#negative_prompt"
                        style="white-space:nowrap;height:36px">Append to Neg</button>
                </div>` : ''}

                ${report.parameter_suggestions ? `
                <h4 style="margin:0 0 6px;color:#fab387">Parameter Suggestions</h4>
                <p style="background:#313244;border-radius:6px;padding:10px;line-height:1.6;margin:0 0 16px">
                    ${escHtml(report.parameter_suggestions)}
                </p>` : ''}

                <div style="text-align:right;margin-top:8px">
                    <button id="ai-critic-close-btn" class="btn btn-secondary">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        function closeModal() { modal.remove(); }
        document.getElementById('ai-critic-close').addEventListener('click', closeModal);
        document.getElementById('ai-critic-close-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

        // Copy buttons
        modal.querySelectorAll('.ai-critic-copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ta = document.getElementById(btn.dataset.target);
                if (!ta) return;
                navigator.clipboard.writeText(ta.value).then(() => {
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
                }).catch(() => {
                    ta.select();
                    document.execCommand('copy');
                });
            });
        });

        // Append buttons
        modal.querySelectorAll('.ai-critic-append-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ta    = document.getElementById(btn.dataset.target);
                const field = document.querySelector(btn.dataset.field);
                if (!ta || !field) return;
                const addition = ta.value.trim();
                if (!addition) return;
                const current = field.value.trim();
                field.value = current ? current + ', ' + addition : addition;
                field.dispatchEvent(new Event('input',  { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                btn.textContent = 'Done!';
                setTimeout(() => { btn.textContent = btn.dataset.field === '#prompt' ? 'Append to Prompt' : 'Append to Neg'; }, 2000);
            });
        });
    }

    // ── Notification helper ──────────────────────────────────────────────────
    function showNotification(message, type = 'info', persistent = false) {
        const n = document.createElement('div');
        n.textContent = message;
        n.style.cssText = `
            position:fixed;top:20px;right:20px;padding:12px 20px;
            border-radius:6px;color:#fff;font-weight:bold;z-index:10001;
            max-width:350px;word-wrap:break-word;
            animation:aic-slideIn 0.3s ease-out;
            box-shadow:0 4px 12px rgba(0,0,0,0.3);
        `;
        const bg = { success:'#28a745', error:'#dc3545', warning:'#fd7e14', info:'#17a2b8' };
        n.style.backgroundColor = bg[type] || bg.info;
        if (type === 'warning') n.style.color = '#222';

        if (!document.querySelector('#ai-critic-anim')) {
            const s = document.createElement('style');
            s.id = 'ai-critic-anim';
            s.textContent = `@keyframes aic-slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}`;
            document.head.appendChild(s);
        }

        document.body.appendChild(n);
        if (!persistent) {
            setTimeout(() => {
                n.style.animation = 'aic-slideIn 0.3s ease-out reverse';
                setTimeout(() => n.remove(), 300);
            }, 5000);
        }
        return n;
    }

    // ── Utility ──────────────────────────────────────────────────────────────
    function escHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Settings panel ───────────────────────────────────────────────────────
    function setup() {
        const panel = document.createElement('div');
        panel.id = 'ai-image-critic-settings';
        panel.classList.add('settings-box', 'panel-box');

        panel.innerHTML = `
            <h4 class="collapsible">
                <i class="fa-solid fa-magnifying-glass"></i> AI Image Critic Settings
                <i id="reset-ai-critic-settings" class="fa-solid fa-arrow-rotate-left section-button">
                    <span class="simple-tooltip top-left">Reset AI Image Critic Settings</span>
                </i>
            </h4>
            <div id="ai-critic-settings-entries" class="collapsible-content" style="display:block">
                <p>
                    Analyze generated images for common AI artifacts and get prompt fix suggestions.
                    Requires a vision-capable LLM.
                </p>
                <p>
                    <b>Examples:</b><br>
                    OpenAI: <code>https://api.openai.com</code><br>
                    Ollama: <code>http://localhost:11434</code><br>
                    LM Studio: <code>http://localhost:1234</code>
                </p>

                <div class="input-group">
                    <label for="ai_critic_api_url">API URL:</label>
                    <input id="ai_critic_api_url" name="ai_critic_api_url" size="50"
                        placeholder="http://localhost:1234"
                        onchange="setAiImageCriticSettings()" autocomplete="off">
                    <small>Base URL (will append /v1/chat/completions)</small>
                </div>

                <div class="input-group">
                    <label for="ai_critic_api_key">API Key (optional):</label>
                    <input id="ai_critic_api_key" name="ai_critic_api_key" type="password" size="50"
                        placeholder="sk-..."
                        onchange="setAiImageCriticSettings()" autocomplete="off">
                    <small>Leave empty for local LLMs</small>
                </div>

                <div class="input-group">
                    <label for="ai_critic_model">Model Name:</label>
                    <input id="ai_critic_model" name="ai_critic_model" size="50"
                        placeholder="llava, gpt-4o, gemma3, etc."
                        onchange="setAiImageCriticSettings()" autocomplete="off">
                    <small>Must support image (vision) input</small>
                </div>

                <div class="input-group">
                    <button class="btn btn-secondary" onclick="aiImageCriticResetSettings(event)">
                        Reset to Defaults
                    </button>
                </div>

                <small><i>Tip: The same model used for Image to Prompt works here.</i></small>
            </div>
        `;

        // Insert after #editor-settings, same pattern as Glitchify / ScaleUp
        const editorSettings = document.getElementById('editor-settings');
        editorSettings.parentNode.insertBefore(panel, editorSettings.nextSibling);

        createCollapsibles(panel);

        document.getElementById('reset-ai-critic-settings')
            ?.addEventListener('click', aiImageCriticResetSettings);

        // Load saved (or default) settings
        aiImageCriticResetSettings(null);
    }

    setup();
    console.log('AI Image Critic Plugin loaded');

})();

// ── Settings save / load (must be global for inline onchange handlers) ───────

function setAiImageCriticSettings() {
    const get = id => document.getElementById(id);
    if (get('ai_critic_api_url')) AiImageCriticSettings.apiUrl = get('ai_critic_api_url').value;
    if (get('ai_critic_api_key')) AiImageCriticSettings.apiKey = get('ai_critic_api_key').value;
    if (get('ai_critic_model'))   AiImageCriticSettings.model  = get('ai_critic_model').value;
    localStorage.setItem('AiImageCritic_Plugin_Settings', JSON.stringify(AiImageCriticSettings));
}

function aiImageCriticResetSettings(resetEvent) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('AiImageCritic_Plugin_Settings')); } catch (_) {}

    if (saved == null || resetEvent != null) {
        // Seed defaults from image-to-prompt settings if available
        const itp = (typeof ImageToPromptSettings !== 'undefined') ? ImageToPromptSettings : {};
        AiImageCriticSettings.apiUrl = itp.apiUrl || "http://localhost:1234";
        AiImageCriticSettings.apiKey = itp.apiKey || "";
        AiImageCriticSettings.model  = itp.model  || "llava";
    } else {
        AiImageCriticSettings.apiUrl = saved.apiUrl || "";
        AiImageCriticSettings.apiKey = saved.apiKey || "";
        AiImageCriticSettings.model  = saved.model  || "llava";
    }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('ai_critic_api_url', AiImageCriticSettings.apiUrl);
    set('ai_critic_api_key', AiImageCriticSettings.apiKey);
    set('ai_critic_model',   AiImageCriticSettings.model);

    localStorage.setItem('AiImageCritic_Plugin_Settings', JSON.stringify(AiImageCriticSettings));
}
