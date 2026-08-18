/**
 * Use as Reference Plugin for Easy Diffusion
 * v1.1.0, last updated: 08/16/2026
 * By GitHub Copilot / Gary W.
 *
 * Adds a "Use as Reference" button to each generated image.
 * Clicking it appends that image to the Reference Images list and
 * ensures the reference images panel is visible.
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 */

(function () {
    "use strict";

    const BUTTON_TEXT = 'Use as Reference';
    const BUTTON_ATTR = 'data-use-as-reference-btn';

    PLUGINS['IMAGE_INFO_BUTTONS'].push([
        { text: 'Use as Reference', on_click: onUseAsReferenceClick, filter: onUseAsReferenceFilter }
    ]);

    initDynamicButtonSync();

    // Only show the button when reference images are currently usable/visible:
    // 1) backend-gated feature is enabled (style.display is not "none")
    // 2) the panel is not manually/model-hidden via "displayNone"
    function onUseAsReferenceFilter(origRequest, image) {
        if (typeof addRefImage !== 'function') return false;

        const refContainer = document.getElementById('editor-inputs-ref-images');
        if (!refContainer) return false;

        const backendEnabled = refContainer.style.display !== 'none';
        const panelVisible = !refContainer.classList.contains('displayNone');

        return backendEnabled && panelVisible;
    }

    function hasReferencePanelVisible() {
        const refContainer = document.getElementById('editor-inputs-ref-images');
        if (!refContainer) return false;

        const backendEnabled = refContainer.style.display !== 'none';
        const panelVisible = !refContainer.classList.contains('displayNone');

        return backendEnabled && panelVisible;
    }

    function syncUseAsReferenceButtons() {
        const shouldShow = hasReferencePanelVisible();
        const infos = document.querySelectorAll('.imgItemInfo');

        infos.forEach((info) => {
            // Tag core-created buttons so we can manage them dynamically later.
            info.querySelectorAll('.tasksBtns').forEach((btn) => {
                if (!btn.hasAttribute(BUTTON_ATTR) && btn.textContent && btn.textContent.trim() === BUTTON_TEXT) {
                    btn.setAttribute(BUTTON_ATTR, '1');
                }
            });

            const existing = info.querySelector(`.tasksBtns[${BUTTON_ATTR}="1"]`);

            if (shouldShow) {
                if (existing) return;

                const img = info.closest('.imgItem')?.querySelector('img');
                if (!img) return;

                const btn = document.createElement('button');
                btn.classList.add('tasksBtns');
                btn.setAttribute(BUTTON_ATTR, '1');
                btn.innerText = BUTTON_TEXT;
                btn.addEventListener('click', function () {
                    onUseAsReferenceClick(null, img);
                });
                info.appendChild(btn);
            } else if (existing) {
                existing.remove();
            }
        });
    }

    function initDynamicButtonSync() {
        const start = () => {
            const refContainer = document.getElementById('editor-inputs-ref-images');
            if (!refContainer) {
                setTimeout(start, 300);
                return;
            }

            const observer = new MutationObserver(syncUseAsReferenceButtons);
            observer.observe(refContainer, { attributes: true, attributeFilter: ['class', 'style'] });

            // Keep buttons in sync as new images appear.
            document.addEventListener('on_render_task_success', syncUseAsReferenceButtons);

            // Initial sync for already-rendered images.
            syncUseAsReferenceButtons();
        };

        start();
    }

    function onUseAsReferenceClick(origRequest, image) {
        if (!image || !image.src) {
            console.warn('Use as Reference: no image source found');
            return;
        }

        // addRefImage is a global defined in main.js
        if (typeof addRefImage !== 'function') {
            console.error('Use as Reference: addRefImage() not found. Is main.js loaded?');
            return;
        }

        addRefImage(image.src);

        // Safety fallback: remove displayNone in case another script hid the panel
        // between filter evaluation and click handling.
        const refContainer = document.getElementById('editor-inputs-ref-images');
        if (refContainer) {
            refContainer.classList.remove('displayNone');
        }

        // Scroll the panel into view so the user sees the change
        if (refContainer) {
            refContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

})();
