// Ratio Buttons Plugin for Easy Diffusion
// Adds ratio buttons for common aspect ratios, sets width/height fields based on model type
// v1.0.0, last updated: 6/3/2025
// Initial code from Cursor/Claude, modified by Gary W.

(function() { "use strict"
  // --- Ratio table: [label, {SD: [w,h], SDXL: [w,h], Flux: [w,h]}] ---
  //Comment or uncomment lines to add/remove ratios.
  const ratioTable = [
    ["16:9",   { SD: [704, 396], SDXL: [1216, 684], Flux: [832, 468] }],
    ["4:3",    { SD: [512, 384], SDXL: [1024, 768], Flux: [704, 528] }],
    ["3:2",    { SD: [576, 384], SDXL: [1152, 768], Flux: [768, 512] }],
    ["1:1",    { SD: [512, 512], SDXL: [1024, 1024], Flux: [704, 704] }],
    ["21:9",   { SD: [672, 288], SDXL: [1344, 576], Flux: [784, 336] }],
//    ["9:16",   { SD: [396, 704], SDXL: [684, 1216], Flux: [468, 832] }],
//    ["2:3",    { SD: [384, 576], SDXL: [768, 1152], Flux: [512, 768] }],
   ["3:4",    { SD: [384, 512], SDXL: [768, 1024], Flux: [528, 704] }],
  //  ["9:21",   { SD: [288, 672], SDXL: [576, 1344], Flux: [336, 784] }],
  ];

  // --- Model type detection ---
  function getModelName() {
    const el = document.querySelector("#editor-settings #stable_diffusion_model");
    return el ? el.dataset.path || el.value || "" : "";
  }
  function isModelXl(modelName) {
    return /xl|playground|disneyrealcartoonmix|mobius|flux|zovya/i.test(modelName);
  }
  function isModelFlux(modelName) {
    if (/flux/i.test(modelName)) return true;
    // If turbo model but not actually turbo, call it flux
    if (/turbo/i.test(modelName) && !/turbo/i.test(modelName)) return true;
    return false;
  }
  function getModelType() {
    const name = getModelName();
    if (isModelXl(name)) return "SDXL";
    if (isModelFlux(name)) return "Flux";
    return "SD";
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

  // --- Create and insert the button group ---
  function insertRatioButtons() {
    if (document.getElementById("ratio-buttons-group")) return; // Already inserted
    const container = document.createElement("td");
    container.id = "ratio-buttons-group";
    //container.style.display = "flex";
    //container.style.flexWrap = "wrap";
    container.style.gap = "0.5em";
    container.style.margin = "1em 0";
    ratioTable.forEach(([label, values]) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.className = "tertiaryButton";
      btn.style.padding = "0.3em 1em";
      btn.onclick = () => {
        const modelType = getModelType();
        const [w, h] = values[modelType] || values["SD"];
        setImageSize(w, h);
      };
      container.appendChild(btn);
    });
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
  waitForTarget();
})();
