// Ratio Buttons Plugin for Easy Diffusion
// Adds ratio buttons for common aspect ratios, sets width/height fields based on model type
// v1.0.1, last updated: 1/30/2026
// Initial code from Cursor/Claude, modified by Gary W.
//
// Free to use with the CMDR2 Stable Diffusion UI.


(function() { "use strict"
  // --- Ratio table: [label, {SD: [w,h], SDXL: [w,h], Flux: [w,h]}] ---
  //Comment or uncomment lines to add/remove ratios.
  const ratioTable = [
//    ["16:9",   { SD: [704, 396], SDXL: [1216, 684], Flux: [1280, 720] }], //less aggressive settings
//    ["16:9",   { SD: [768, 432], SDXL: [1280, 720], Flux: [1408, 792] }], //larger resolutions
      ["16:9",   { SD: [768, 432], SDXL: [1280, 720], Flux: [1472, 832] }], //larger resolutions, 64-pixel boundaries works with v4
//    ["4:3",    { SD: [512, 384], SDXL: [1024, 768], Flux: [1280, 960] }], //less aggressive settings
    ["4:3",    { SD: [768, 576], SDXL: [1280, 960], Flux: [1280, 960] }],
//    ["3:2",    { SD: [768, 512], SDXL: [1152, 768], Flux: [1152, 768] }],
//    ["3:2",    { SD: [768, 512], SDXL: [1296, 864], Flux: [1296, 864] }],
    ["3:2",    { SD: [768, 512], SDXL: [1248, 832], Flux: [1248, 832] }], //v4 friendly
    ["1:1",    { SD: [512, 512], SDXL: [1024, 1024], Flux: [1280, 1280] }],
    ["21:9",   { SD: [704, 320], SDXL: [1344, 576], Flux: [1792, 768] }],  //896x384 is closer to the actual 21:9 ratio, but 704x320 may fit better for SD 1.5.
//    ["32:9",   { SD: [1280, 360], SDXL: [1536, 432], Flux: [1820, 512] }], //2560, 720
    ["32:9",   { SD: [1344,384], SDXL: [1792, 512], Flux: [2048, 576] }], //v4 friendly 
//    ["2:3",    { SD: [384, 576], SDXL: [768, 1152], Flux: [512, 768] }],
    ["3:4",    { SD: [576, 768], SDXL: [960, 1280], Flux: [960, 1280]}],
//   ["3:4",    { SD: [384, 512], SDXL: [768, 1024], Flux: [960, 1280] }],
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
    if (/flux|lyhAnime_kor|chroma|sd3|qwen|z_image/i.test(modelName)) return true;

    //No need to check for turbo model, as we're not modifying steps, but selecting initial sizes.
    return false;
  }
  function getModelType() {
    const name = getModelName();
    if (isModelFlux(name)) return "Flux";
    if (isModelXl(name)) return "SDXL";
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
  waitForTarget();
})();
