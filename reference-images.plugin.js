// Reference Images Toggle Plugin for Easy Diffusion
// Adds a toggle button to enable the reference images panel for non-Flux models
// (e.g., Qwen image editing). Flux models already show reference images automatically.
// v1.0.0, last updated: 4/25/2026
// Initial code by GitHub Copilot, modified by Gary W.
//
// Free to use with the CMDR2 Stable Diffusion UI.

(function() { "use strict"

  let refImagesManuallyEnabled = false;

  // --- Helpers ---
  function isFlux() {
    return typeof window.isFluxModel === "function" && window.isFluxModel();
  }

  function getRefContainer() {
    return document.getElementById("editor-inputs-ref-images");
  }

  function getToggleRow() {
    return document.getElementById("ref-images-plugin-toggle-row");
  }

  function getToggleBtn() {
    return document.getElementById("ref-images-plugin-btn");
  }

  // --- Apply / remove the manual-show override on the ref images container ---
  function applyManualState() {
    const container = getRefContainer();
    if (!container) return;
    if (refImagesManuallyEnabled) {
      container.classList.remove("displayNone");
    } else {
      container.classList.add("displayNone");
    }
  }

  // --- Show/hide the toggle button row ---
  // The button row is visible when:
  //   - The ref images container is allowed by the backend gated-feature (style.display !== 'none')
  //   - AND the current model is NOT a Flux model (Flux shows ref images automatically)
  function updateToggleRowVisibility() {
    const toggleRow = getToggleRow();
    const container = getRefContainer();
    if (!toggleRow || !container) return;

    const gatedVisible = container.style.display !== "none";
    const isFluxModel = isFlux();

    if (gatedVisible && !isFluxModel) {
      toggleRow.style.display = "";
    } else {
      toggleRow.style.display = "none";
      // When switching to a Flux model, reset the manual toggle
      if (isFluxModel && refImagesManuallyEnabled) {
        refImagesManuallyEnabled = false;
        const btn = getToggleBtn();
        if (btn) btn.classList.remove("active");
      }
    }
  }

  // --- Patch window.checkReferenceImageField to respect the manual override ---
  // main.js hides the container for non-Flux models; we re-show it when manually enabled.
  function patchCheckReferenceImageField() {
    if (typeof window.checkReferenceImageField !== "function") {
      setTimeout(patchCheckReferenceImageField, 200);
      return;
    }
    const original = window.checkReferenceImageField;
    window.checkReferenceImageField = function() {
      original.apply(this, arguments);
      if (refImagesManuallyEnabled) applyManualState();
      updateToggleRowVisibility();
    };
  }

  // --- Insert the toggle button row just before the ref images container ---
  function insertToggleButton() {
    if (getToggleRow()) return; // Already inserted

    const container = getRefContainer();
    if (!container) {
      setTimeout(insertToggleButton, 500);
      return;
    }

    const toggleRow = document.createElement("div");
    toggleRow.id = "ref-images-plugin-toggle-row";
    toggleRow.className = "row";
    toggleRow.style.display = "none"; // Hidden until updateToggleRowVisibility() decides

    const btn = document.createElement("button");
    btn.id = "ref-images-plugin-btn";
    btn.className = "tertiaryButton smallButton";
    btn.innerHTML = '<i class="fa-solid fa-images"></i> Reference Images';
    btn.title = "Toggle reference images panel for vision-based models (e.g. Qwen image editing)";

    btn.addEventListener("click", () => {
      refImagesManuallyEnabled = !refImagesManuallyEnabled;
      btn.classList.toggle("active", refImagesManuallyEnabled);
      applyManualState();
    });

    toggleRow.appendChild(btn);
    container.parentNode.insertBefore(toggleRow, container);

    // Watch for gated-feature backend switches (style.display changes on the container)
    const gatedObserver = new MutationObserver(updateToggleRowVisibility);
    gatedObserver.observe(container, { attributes: true, attributeFilter: ["style"] });

    patchCheckReferenceImageField();
    setupModelWatcher();
    updateToggleRowVisibility();
  }

  // --- Watch for model changes to update toggle button visibility ---
  function setupModelWatcher() {
    const modelEl = document.querySelector("#editor-settings #stable_diffusion_model");
    if (!modelEl) {
      setTimeout(setupModelWatcher, 500);
      return;
    }
    modelEl.addEventListener("change", updateToggleRowVisibility);
    const observer = new MutationObserver(updateToggleRowVisibility);
    observer.observe(modelEl, { attributes: true });
  }

  // --- Entry point ---
  insertToggleButton();

})();
