// Ratio Buttons Plugin for Easy Diffusion
// Adds ratio buttons for common aspect ratios, sets width/height fields based on model type
// v1.1.1, last updated: 4/25/2026
// Initial code from Cursor/Claude, modified by Gary W.
//
// Free to use with the CMDR2 Stable Diffusion UI.


(function() { "use strict"
  // Currently, ExtraLarge resolutions are between 2 and 2.5 megapixels.
  // --- Ratio table: [label, {SD: [w,h], SDXL: [w,h], Flux: [w,h], ExtraLarge: [w,h]}] ---
  //Comment or uncomment lines to add/remove ratios.
  const ratioTable = [
//    ["16:9",   { SD: [704, 396], SDXL: [1216, 684], Flux: [1280, 720],  ExtraLarge: [2048, 1152] }], //less aggressive settings
//    ["16:9",   { SD: [768, 432], SDXL: [1280, 720], Flux: [1408, 792],  ExtraLarge: [2048, 1152] }], //larger resolutions
      ["16:9",   { SD: [768, 432], SDXL: [1280, 720], Flux: [1472, 832],  ExtraLarge: [2048, 1152] }], //larger resolutions, 64-pixel boundaries works with v4
//    ["4:3",    { SD: [512, 384], SDXL: [1024, 768], Flux: [1280, 960],  ExtraLarge: [2048, 1536] }], //less aggressive settings
    ["4:3",    { SD: [768, 576], SDXL: [1280, 960], Flux: [1280, 960],   ExtraLarge: [1792, 1344] }],
//    ["3:2",    { SD: [768, 512], SDXL: [1152, 768], Flux: [1152, 768],  ExtraLarge: [2048, 1344] }],
//    ["3:2",    { SD: [768, 512], SDXL: [1296, 864], Flux: [1296, 864],  ExtraLarge: [2048, 1344] }],
    ["3:2",    { SD: [768, 512], SDXL: [1248, 832], Flux: [1248, 832],   ExtraLarge: [1920, 1280] }], //v4 friendly
    ["1:1",    { SD: [512, 512], SDXL: [1024, 1024], Flux: [1280, 1280], ExtraLarge: [1536, 1536] }],
    ["21:9",   { SD: [704, 320], SDXL: [1344, 576], Flux: [1792, 768],   ExtraLarge: [2368, 1024] }],  //896x384 is closer to the actual 21:9 ratio, but 704x320 may fit better for SD 1.5.
//    ["32:9",   { SD: [1280, 360], SDXL: [1536, 432], Flux: [1820, 512], ExtraLarge: [2688, 768]  }], //2560, 720
    ["32:9",   { SD: [1344,384], SDXL: [1792, 512], Flux: [2048, 576],   ExtraLarge: [2944, 832]  }], //v4 friendly
//    ["2:3",    { SD: [384, 576], SDXL: [768, 1152], Flux: [512, 768],   ExtraLarge: [1024, 1536] }],
    ["3:4",    { SD: [576, 768], SDXL: [960, 1280], Flux: [960, 1280],   ExtraLarge: [1344, 1792] }],
//   ["3:4",    { SD: [384, 512], SDXL: [768, 1024], Flux: [960, 1280],  ExtraLarge: [1536, 2048] }],
];

  // --- Model type detection ---
  function getModelName() {
    const el = document.querySelector("#editor-settings #stable_diffusion_model");
    return el ? el.dataset.path || el.value || "" : "";
  }
  function isModelXl(modelName) {
    return /xl|playground|disneyrealcartoonmix|mobius|flux|zovya|anima(?=[^a-zA-Z]|$)/i.test(modelName);
  }
  function isModelFlux(modelName) {
    if (/flux|lyhAnime_kor|chroma|sd3|qwen|z-image|z_image/i.test(modelName)) return true;

    //No need to check for turbo model, as we're not modifying steps, but selecting initial sizes.
    return false;
  }
  function getModelType() {
    const name = getModelName();
    if (isModelFlux(name)) return "Flux";
    if (isModelXl(name)) return "SDXL";
    return "SD";
  }

  // Returns the dropdown value when present, otherwise auto-detects from the loaded model.
  function getEffectiveModelType() {
    const dropdown = document.getElementById("ratio-model-type");
    return dropdown ? dropdown.value : getModelType();
  }

  function addImageSizeOption(size) {
    let sizes = Object.values(widthField.options).map((o) => o.value)
    if (!sizes.includes(String(size))) {
        sizes.push(String(size))
        sizes.sort((a, b) => Number(a) - Number(b))

        let option = document.createElement("option")
        option.value = size
        option.text = `${size}`

        widthField.add(option, sizes.indexOf(String(size)))
        heightField.add(option.cloneNode(true), sizes.indexOf(String(size)))
    }
  }

  // --- Set width/height fields ---
  function setImageSize(w, h) {
    const widthField = document.querySelector("#width");
    const heightField = document.querySelector("#height");
    if (widthField && heightField) {
        
      addImageSizeOption(w)
      addImageSizeOption(h)
      widthField.value = w;
      heightField.value = h;
      widthField.dispatchEvent(new Event("change"));
      heightField.dispatchEvent(new Event("change"));
    }
  }

  // --- Round image sizes to pixel boundary ---
  function roundImageSizes(boundary) {
    const widthField = document.querySelector("#width");
    const heightField = document.querySelector("#height");
    if (widthField && heightField) {
      const currentW = parseInt(widthField.value) || 512;
      const currentH = parseInt(heightField.value) || 512;
      const roundedW = Math.round(currentW / boundary) * boundary;
      const roundedH = Math.round(currentH / boundary) * boundary;
      setImageSize(roundedW, roundedH);
    }
  }

  // --- Create and insert the button group ---
  function insertRatioButtons() {
    if (document.getElementById("ratio-buttons-group")) return; // Already inserted
    const container = document.createElement("td");
    container.id = "ratio-buttons-group";
    //container.style.display = "flex";
    //container.style.flexWrap = "wrap";
    container.style.gap = "0.5em";
    container.style.margin = "1em 0";

    // --- Model type / size-set selector ---
    const modelLabel = document.createElement("label");
    modelLabel.textContent = "Size set:";
    modelLabel.htmlFor = "ratio-model-type";
    modelLabel.style.marginRight = "0.4em";
    container.appendChild(modelLabel);

    const modelTypeSelect = document.createElement("select");
    modelTypeSelect.id = "ratio-model-type";
    modelTypeSelect.title = "Select resolution set (auto-updates when model changes)";
    modelTypeSelect.style.marginRight = "0.8em";
    [["SD", "SD"], ["SDXL", "SDXL"], ["Flux", "Flux"], ["ExtraLarge", "Extra Large"]].forEach(([value, text]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.text = text;
      modelTypeSelect.appendChild(opt);
    });
    modelTypeSelect.value = getModelType();
    container.appendChild(modelTypeSelect);

    ratioTable.forEach(([label, values]) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.className = "tertiaryButton";
      btn.style.padding = "0.3em 1em";
      btn.onclick = () => {
        const modelType = getEffectiveModelType();
        const [w, h] = values[modelType] || values["SD"];
        setImageSize(w, h);
      };
      container.appendChild(btn);
    });

    // Add rounding buttons
    const round64Btn = document.createElement("button");
    round64Btn.textContent = "⌊64⌉";
    round64Btn.className = "tertiaryButton";
    round64Btn.style.padding = "0.3em 1em";
    round64Btn.title = "Round to 64 pixel boundary";
    round64Btn.onclick = () => roundImageSizes(64);
    container.appendChild(round64Btn);

    const round16Btn = document.createElement("button");
    round16Btn.textContent = "⌊16⌉";
    round16Btn.className = "tertiaryButton";
    round16Btn.style.padding = "0.3em 1em";
    round16Btn.title = "Round to 16 pixel boundary";
    round16Btn.onclick = () => roundImageSizes(16);
    container.appendChild(round16Btn);

    const outercontainer = document.createElement("tr");
    outercontainer.class="pl-5";
    outercontainer.appendChild(document.createElement("td"));  //empty td node
    outercontainer.appendChild(container);

    // Insert after the parent of #image-size-options
    const ref = document.getElementById("image-size-options");
    if (ref && ref.parentNode && ref.parentNode.parentNode) {
      ref.parentNode.parentNode.insertBefore(outercontainer, ref.parentNode.nextSibling);
    }
  }

  // --- Wait for DOM and insert ---
  function waitForTarget() {
    if (document.getElementById("image-size-options")) {
      insertRatioButtons();
    } else {
      setTimeout(waitForTarget, 500);
    }
  }

  // --- Watch for model changes and keep the dropdown in sync ---
  function setupModelWatcher() {
    const modelEl = document.querySelector("#editor-settings #stable_diffusion_model");
    if (!modelEl) {
      setTimeout(setupModelWatcher, 500);
      return;
    }
    const syncDropdown = () => {
      const dropdown = document.getElementById("ratio-model-type");
      if (dropdown) dropdown.value = getModelType();
    };
    modelEl.addEventListener("change", syncDropdown);
    // Also catch programmatic model path changes (data-path attribute updates)
    const observer = new MutationObserver(syncDropdown);
    observer.observe(modelEl, { attributes: true });
  }

  waitForTarget();
  setupModelWatcher();
})();
