/***
 * 
 * Make Very Similar Images Plugin for Easy Diffusion
 * v.1.1.0, last updated: 1/1/2025
 * By Gary W.
 * 
 * Similar to the original "Make Similar Images" plugin to make images somewhat similar to the original,
 * but with a few changes to make it closer to the original and to support Turbo models better.
 * (Further optimizations may be added.)
 * 
 * Free to use with the CMDR2 Stable Diffusion UI.
 * 
 */

//Settings need to be outside of the wrapper, as the input items are in the main UI.
//These initial values can be overwritten upon startup -- do not rely on these as defaults.
var MakeVerySimilarSettings = {
  highQuality: false,
  enhanceImage: false,
};

(function() { "use strict"

var contrastAmount=0.8;  //0.8 appears to slightly increase contrast; 0.7 is more neutral

PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { text: "Make Very Similar Images", on_click: onMakeVerySimilarClick, filter: onMakeVerySimilarFilter }
])

//Determine if model is Turbo or other fast model
//Model needs to have "turbo" in the filename to be recognized as a turbo model.
function isModelTurbo(modelName, loraList) {
  if (modelName.search(/turbo/i)>=0 || modelName.search(/lightning/i)>=0 || modelName.search(/hyper/i)>=0 || modelName.search(/schnell/i)>=0) {
    return true;
  }
  //if any of the Loras contains "lcm", assume turbo lora -- fewer steps needed
  if (loraList != undefined) {
    if (loraList[0].length>1) { //it's an array of strings >1
      if (loraList.some(element => element.search(/lcm/i)>=0) ||
          loraList.some(element => element.search(/hyper/i)>=0) )
          return true;
    }
    else {  //it's a string
      if (loraList.search(/lcm/i)>=0 || loraList.search(/hyper/i)>=0)
      return true;
    }
  }
  return false;
}

//Determine if model is faster than Turbo
//Fast models other than Turbo can make use of fewer steps (usually as few as 4).  Increase this amount to work with img2img.
function isModelLightning(modelName, loraList) {
  if (modelName.search(/lightning/i)>=0 || modelName.search(/hyper/i)>=0 || modelName.search(/schnell/i)>=0) {
    return true;
  }
  //if any of the Loras contains "lcm", assume turbo lora -- fewer steps needed
  if (loraList != undefined) {
    if (loraList[0].length>1) { //it's an array of strings >1
      if (loraList.some(element => element.search(/hyper/i)>=0) )
          return true;
    }
    else {  //it's a string
      if (loraList.search(/hyper/i)>=0)
      return true;
    }
  }
  return false;
}

function onMakeVerySimilarClick(origRequest, image) {
  var isTurbo=isModelTurbo(origRequest.use_stable_diffusion_model, origRequest.use_lora_model);
  var isLightning=isModelLightning(origRequest.use_stable_diffusion_model, origRequest.use_lora_model);

  const newTaskRequest = modifyCurrentRequest(origRequest, {
    num_outputs: 1,
    // For Turbo, in one test, 22 steps is OK, but noticeable improvement at 30.  In another test, 20 was too much, and 10 was better than 6.
    // For Lightning, 8 to 12 seemed to be peak quality, with 15 and 20 being OK, but progressively worse artifacting.
    // With SDXL (not Turbo/Lightning), 55 may be excessive and does not appear to be better.  45 is somewhat better than 35.
    // Actual improvements will vary by model and seed, so it's likely there's not one optimal fits-all choice, so chosen values are somewhat arbitrary.
    //
    // Larger resolutions show defects/duplication.  Try to run this plugin on reasonably smaller resolutions, not very upscaled ones.
    num_inference_steps: (MakeVerySimilarSettings.highQuality ? 
      ((isTurbo)? Math.min((isLightning)? Math.max(7, parseInt(origRequest.num_inference_steps) + 3): Math.max(8, parseInt(origRequest.num_inference_steps) + 4), 12) : 
        Math.min(parseInt(origRequest.num_inference_steps) + 15, 45)):  //More steps for higher quality -- a few makes a difference
      ((isTurbo)? Math.min((isLightning)? Math.max(6, parseInt(origRequest.num_inference_steps) + 2): Math.max(7, parseInt(origRequest.num_inference_steps) + 3), 10) : 
        Math.min(parseInt(origRequest.num_inference_steps) + 15, 35))   //Minimal steps for speed -- much lower, and results may be poor
    ),  
    //large resolutions combined with large steps can cause an error
    prompt_strength: 0.7,
    init_image: image.src,
    seed: Math.floor(Math.random() * 10000000),
})

//newTaskRequest.numOutputsTotal = 5
//newTaskRequest.batchCount = 5

//May want to retain the original controlnet, but for maximum variation, probably best to leave it out. 
//A future enhancement could make this user-selectable.
delete newTaskRequest.reqBody.use_controlnet_model;
delete newTaskRequest.reqBody.control_filter_to_apply;
delete newTaskRequest.reqBody.control_image;

delete newTaskRequest.reqBody.use_upscale; //if previously used upscaler, we don't want to automatically do it again

delete newTaskRequest.reqBody.mask

  //sharpen the image before generating, to maximize detail
  if(MakeVerySimilarSettings.enhanceImage) {
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth);
    canvas.height = Math.round(image.naturalHeight);

    let ctx = canvas.getContext("2d", {willReadFrequently: true});

    // get the image data of the canvas
    //x,y -- upper-left, width & height
    ctx.drawImage( image,
      0, 0, image.naturalWidth, image.naturalHeight, //source 
      0, 0, canvas.width, canvas.height //destination
    );

    sharpen(ctx, canvas.width, canvas.height, .33);
    
    var img =  ctx.getImageData(0, 0, canvas.width, canvas.height);
    img = contrastImage(img, contrastAmount);
    ctx.putImageData(img, 0, 0);

    var newImage = new Image;
    newImage.src = canvas.toDataURL('image/png');
   
    newTaskRequest.reqBody.init_image = newImage.src;
  }

createTask(newTaskRequest)
}

function onMakeVerySimilarFilter(origRequest, image) {
    return true;
}

//________________________________________________________________________________________________________________________________________
// sharpen image, from Bing CoPilot, after correcting for rounding and edge pixels
// USAGE:
//    sharpen(context, width, height, amount)
//  amount: [0.0, 1.0]
// This is similar to https://stackoverflow.com/questions/20316680/javascript-sharpen-image-and-edge-detection-not-working;
// but without the edge-pixel problem.

function sharpen(ctx, width, height, amount) {
  const weights = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
  ];

  const side = Math.round(Math.sqrt(weights.length));
  const halfSide = Math.floor(side / 2);
  const src = ctx.getImageData(0, 0, width, height);
  const sw = src.width;
  const sh = src.height;
  const srcPixels = src.data;
  const output = ctx.createImageData(sw, sh);
  const dstPixels = output.data;

  for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
          const dstOff = (y * sw + x) * 4;
          let r = 0, g = 0, b = 0;

          for (let cy = 0; cy < side; cy++) {
              for (let cx = 0; cx < side; cx++) {
                  const scy = Math.min(sh - 1, Math.max(0, y + cy - halfSide));
                  const scx = Math.min(sw - 1, Math.max(0, x + cx - halfSide));
                  const srcOff = (scy * sw + scx) * 4;
                  const wt = weights[cy * side + cx];

                  r += srcPixels[srcOff] * wt;
                  g += srcPixels[srcOff + 1] * wt;
                  b += srcPixels[srcOff + 2] * wt;
              }
          }

          dstPixels[dstOff] = Math.round(r * amount + srcPixels[dstOff] * (1 - amount));
          dstPixels[dstOff + 1] = Math.round(g * amount + srcPixels[dstOff + 1] * (1 - amount));
          dstPixels[dstOff + 2] = Math.round(b * amount + srcPixels[dstOff + 2] * (1 - amount));
          dstPixels[dstOff + 3] = srcPixels[dstOff + 3]; // alpha channel
      }
  }

  ctx.putImageData(output, 0, 0);
}


//Contrast from:
//https://stackoverflow.com/questions/10521978/html5-canvas-image-contrast
//https://jsfiddle.net/88k7zj3k/6/

function contrastImage(imageData, contrast) {  // contrast as an integer percent  
  var data = imageData.data;  // original array modified, but canvas not updated
  contrast *= 2.55; // or *= 255 / 100; scale integer percent to full range
  var factor = (255 + contrast) / (255.01 - contrast);  //add .1 to avoid /0 error

  for(var i=0;i<data.length;i+=4)  //pixel values in 4-byte blocks (r,g,b,a)
  {
      data[i] = factor * (data[i] - 128) + 128;     //r value
      data[i+1] = factor * (data[i+1] - 128) + 128; //g value
      data[i+2] = factor * (data[i+2] - 128) + 128; //b value
  }
  return imageData;  //optional (e.g. for filter function chaining)
}

//________________________________________________________________________________________________________________________________________


  //UI insertion adapted from Rabbit Hole plugin
  function setup() {
    //add new UI panel to left sidebar
    var makeVerySettings = document.createElement('div');
    makeVerySettings.id = 'makeverysimilar-settings';
    makeVerySettings.classList.add('settings-box');
    makeVerySettings.classList.add('panel-box');
    let tempHTML =  
        `<h4 class="collapsible">Make Very Similar Images Settings
          <i id="reset-makeverysimilar-settings" class="fa-solid fa-arrow-rotate-left section-button">
          <span class="simple-tooltip top-left">
          Reset Make Very Similar Images Settings
          </span>
          </i>
        </h4>
        <div id="makeverysimilar-settings-entries" class="collapsible-content" style="display: block;margin-top:15px;">
        <div><ul style="padding-left:0px">
          <li><b class="settings-subheader">MakeVerySimilar Settings</b></li>
          <li class="pl-5"><div class="input-toggle">
          <input id="makeverysimilar_quality" name="makeverysimilar_quality" type="checkbox" value="`+MakeVerySimilarSettings.highQuality+`"  onchange="setMakeVerySimilarSettings()"> <label for="makeverysimilar_quality"></label>
          </div>
          <label for="makeverysimilar_quality">Use more steps for higher quality results<small> (longer run-time)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="makeverysimilar_sharpen" name="makeverysimilar_sharpen" type="checkbox" value="`+MakeVerySimilarSettings.enhanceImage+`"  onchange="setMakeVerySimilarSettings()"> <label for="makeverysimilar_sharpen"></label>
          </div>
          <label for="makeverysimilar_sharpen">Enhance Details</label>
          </li>
        </ul></div>
        </div>`;
    makeVerySettings.innerHTML = tempHTML;
    var editorSettings = document.getElementById('editor-settings');
    editorSettings.parentNode.insertBefore(makeVerySettings, editorSettings.nextSibling);
    createCollapsibles(makeVerySettings);

    const icon = document.getElementById('reset-makeverysimilar-settings');
    icon.addEventListener('click', makeVerySimilarResetSettings);

    //Ensure switches match the settings (for the initial values), since "value=" in above HTML may not work.  But more importantly, we now load settings from storage.
    makeVerySimilarResetSettings(null);
  }
  setup();

})();

function setMakeVerySimilarSettings() {
  MakeVerySimilarSettings.highQuality = makeverysimilar_quality.checked;
  MakeVerySimilarSettings.enhanceImage = makeverysimilar_sharpen.checked;


  localStorage.setItem('MakeVerySimilar_Plugin_Settings', JSON.stringify(MakeVerySimilarSettings));  //Store settings
}

//Sets the default values for the settings.
//If reset=pointerevent, then we came from the reset click -- reset to absolute defaults
//if reset=null, just reload from saved settings
//Could manually remove/reset settings using:  localStorage.removeItem('MakeVerySimilar_Plugin_Settings')
function makeVerySimilarResetSettings(reset) {

  let settings = JSON.parse(localStorage.getItem('MakeVerySimilar_Plugin_Settings'));
  if (settings == null || reset !=null) {  //if settings not found, just set everything
    MakeVerySimilarSettings.highQuality = false;
    MakeVerySimilarSettings.enhanceImage = false;
  }
  else {  //if settings found, but we've added a new setting, use a default value instead.  (Not strictly necessary for this first group.)
    MakeVerySimilarSettings.highQuality = settings.highQuality ?? false;
    MakeVerySimilarSettings.enhanceImage = settings.enhanceImage ?? false;
  }
  localStorage.setItem('MakeVerySimilar_Plugin_Settings', JSON.stringify(MakeVerySimilarSettings));  //Store settings

  //set the input fields
  makeverysimilar_quality.checked = MakeVerySimilarSettings.highQuality;
  makeverysimilar_sharpen.checked = MakeVerySimilarSettings.enhanceImage;
}
