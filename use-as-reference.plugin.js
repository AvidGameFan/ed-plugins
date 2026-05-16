/**
 * Use as Reference Plugin for Easy Diffusion
 * v1.0.0, last updated: 05/15/2026
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

    PLUGINS['IMAGE_INFO_BUTTONS'].push([
        { text: 'Use as Reference', on_click: onUseAsReferenceClick }
    ]);

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

        // Make the reference images panel visible regardless of model type.
        // main.js hides it with displayNone for non-Flux models; remove that here
        // so the user can immediately see the image was added.
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
