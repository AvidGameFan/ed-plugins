/***
 * 
 * Glitchify Images Plugin for Easy Diffusion
 * v.1.0.0, last updated: 4/6/2025
 * By Gary W.
 * 
 * 
 * Free to use with the CMDR2 Stable Diffusion UI.
 * 
 */

//Settings need to be outside of the wrapper, as the input items are in the main UI.
//These initial values can be overwritten upon startup -- do not rely on these as defaults.
var GlitchifySettings = {
  highQuality: false,
  enhanceImage: false,
  addNoise: false,
  preserve: false,
  useChangedPrompt: false
};

(function() { "use strict"

var contrastAmount=0.8;  //0.8 appears to slightly increase contrast; 0.7 is more neutral

PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { text: "Glitchify!", on_click: onGlitchifyClick, filter: onGlitchifyFilter }
])

const percentToKeep = .70; //Amount of random pixels to retain, to bias effect
const noiseDepth = 128;
//modified from OutpaintIt's outpaintSetPixels.
function addNoiseToPixels(imageData) {
  function guassianRand() {  //approximation of Gaussian, from Stackoverflow
    var rand =0;
    for (var i=0; i<6; i+=1) {
      rand += Math.random();
    }
    return rand/6;
  }
  function randomPixel(range) {
        return Math.floor(guassianRand() * range); //suggested range of 256 results in 0 to 255
  }
  // get the pixel data array
  var pixels = imageData.data;
  var numPixels = pixels.length/4;
  // loop through each pixel
  for (var i = 0; i < pixels.length; i += 4) {
    if ( Math.random()<percentToKeep)
        continue; 

    //always give some color bias to noise
    // let newPixel=Math.floor(Math.random()*numPixels)*4;
    // if(Math.random()<.2 && i<pixels.length-200 && i>=200) {  //50*4
    //    newPixel=(Math.floor(Math.random()*100)-50)*4+i;
    //     //note that if filled with more noise, this is going to reach back and pick up earlier noise values - not ideal
    //    pixels[i] = pixels[newPixel];
    //    pixels[i + 1] = pixels[newPixel+1];
    //    pixels[i + 2] = pixels[newPixel+2];
    //    pixels[i + 3] = 255;

    // }
    // else 
    {
    
      // get the red, green, blue (but not alpha) values
      var r = pixels[i];
      var g = pixels[i + 1];
      var b = pixels[i + 2];
      //var a = pixels[i + 3];
      //console.log(`Initial values -> r: ${r}, g: ${g}, b: ${b}`);

      // randomize the pixel values
      r = r+randomPixel(noiseDepth)-noiseDepth/2;
      g = g+randomPixel(noiseDepth)-noiseDepth/2;
      b = b+randomPixel(noiseDepth)-noiseDepth/2;
      //a = 255;

      //don't wrap values, force to floor or ceiling
      r = Math.max(Math.min(r,255), 0);
      g = Math.max(Math.min(g,255), 0);
      b = Math.max(Math.min(b,255), 0);
      //console.log(`Updated values -> r: ${r}, g: ${g}, b: ${b}`);

      // set the new pixel values back to the array
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    
    }
  }
}

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

function isModelFlux(modelName) {
  let result = false;
  if (modelName.search(/flux/i)>=0) {
    result = true;
  }  
  //If turbo model but not actually turbo, go ahead and call it flux, to do fewer steps
 // if (isModelTurbo(modelName) && modelName.search(/turbo/i)<0) {
 //   result = true;
 // }
  return result;
}

function onGlitchifyClick(origRequest, image) {
  var isTurbo=isModelTurbo(origRequest.use_stable_diffusion_model, origRequest.use_lora_model);
  var isLightning=isModelLightning(origRequest.use_stable_diffusion_model, origRequest.use_lora_model);
  var isFlux = isModelFlux(origRequest.use_stable_diffusion_model);

  const newTaskRequest = modifyCurrentRequest(origRequest, {
    num_outputs: 1,
    // For Turbo, in one test, 22 steps is OK, but noticeable improvement at 30.  In another test, 20 was too much, and 10 was better than 6.
    // For Lightning, 8 to 12 seemed to be peak quality, with 15 and 20 being OK, but progressively worse artifacting.
    // With SDXL (not Turbo/Lightning), 55 may be excessive and does not appear to be better.  45 is somewhat better than 35.
    // Actual improvements will vary by model and seed, so it's likely there's not one optimal fits-all choice, so chosen values are somewhat arbitrary.
    //
    // Larger resolutions show defects/duplication.  Try to run this plugin on reasonably smaller resolutions, not very upscaled ones.
    num_inference_steps: Math.floor((GlitchifySettings.highQuality ? 
      ((isTurbo)? Math.min((isLightning)? Math.max(7, parseInt(origRequest.num_inference_steps) + 3): Math.max(8, parseInt(origRequest.num_inference_steps) + 4), 12) : 
        Math.min(parseInt(origRequest.num_inference_steps) + 10, 40)):  //More steps for higher quality -- a few makes a difference
      ((isTurbo)? Math.min((isLightning)? Math.max(6, parseInt(origRequest.num_inference_steps) + 2): Math.max(7, parseInt(origRequest.num_inference_steps) + 3), 10) : 
        Math.min(parseInt(origRequest.num_inference_steps) + 5, 30))   //Minimal steps for speed -- much lower, and results may be poor
      )
      * (GlitchifySettings.preserve ? 2.5 : 1)  //multiply steps to compensate for Prompt Strength being .3 instead of .7
    )
    ,  
    //large resolutions combined with large steps can cause an error
    prompt_strength: GlitchifySettings.preserve ? 0.08 : 0.4,
    init_image: image.src,
    seed: Math.floor(Math.random() * 10000000),
})

//Grab the prompt from the user-input area instead of the original image.
//if (newTaskRequest.reqBody.prompt.substr(0,$("textarea#prompt").val().length)!=$("textarea#prompt").val()) { <-- fails if empty prompt.  Probably unneeded.
  if (GlitchifySettings.useChangedPrompt ) {
    newTaskRequest.reqBody.prompt=getPrompts()[0];
  };
//}

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
  if(GlitchifySettings.enhanceImage || GlitchifySettings.addNoise) {
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

    //Don't enhance if we previously just added noise, and we're doing "preserve".
    if(GlitchifySettings.enhanceImage &&
      (origRequest.NoisePreviouslyAdded == undefined
      || (origRequest.NoisePreviouslyAdded != undefined && !GlitchifySettings.preserve))) {
        sharpen(ctx, canvas.width, canvas.height, isFlux?.11:.33);
    }
    
    var img =  ctx.getImageData(0, 0, canvas.width, canvas.height);

    if(GlitchifySettings.enhanceImage) {
      img = contrastImage(img, contrastAmount);
    }

  //  if (animeify) {
      img=createGlitchEffect(img);
      //if it isn't already prompting for the style we want, go ahead and specify it, to ensure it adheres to the look
      if (newTaskRequest.reqBody.prompt.search(/glitch/i)<0 ) {
        newTaskRequest.reqBody.prompt+=', glitch art';
        //newTaskRequest.reqBody.prompt_strength = .5;
      }
//    }

    //Don't add noise if we previously just added noise, and we're doing "preserve".
    if(GlitchifySettings.addNoise && (origRequest.NoisePreviouslyAdded == undefined
      || (origRequest.NoisePreviouslyAdded != undefined && !GlitchifySettings.preserve))) {
      addNoiseToPixels(img);
    }

    ctx.putImageData(img, 0, 0);

    var newImage = new Image;
    newImage.src = canvas.toDataURL('image/png');
   
    newTaskRequest.reqBody.init_image = newImage.src;

    //If Preserve is used, the noise tends to linger, so mark that we've done this already.
    var setNoiseFlag=false;
    if(GlitchifySettings.addNoise && GlitchifySettings.preserve) {
      if (origRequest.NoisePreviouslyAdded == undefined) {
        newTaskRequest.reqBody.NoisePreviouslyAdded = true;
        setNoiseFlag=true;
      }
    }
    //if we didn't just set the noise flag, turn it back off
    if (!setNoiseFlag) {
      delete newTaskRequest.reqBody.NoisePreviouslyAdded;
    }
  }

createTask(newTaskRequest)
}

function onGlitchifyFilter(origRequest, image) {
    return true;
}


function createGlitchEffect(imageData) {
  // List of available effects with their probabilities
  const effects = [
      { fn: applyEdge, chance: 0.2 }, // Edge
      { fn: applyQuantization, chance: 0.2 }, // Quantization
      { fn: glitchify, chance: 0.8 },           // Block shifts with RGB splits
      { fn: addVerticalShifts, chance: 0.5 },   // Vertical displacements
      { fn: addScanlines, chance: 0.2 },        // CRT-like scanlines
      { fn: addNoise, chance: 0.3 },            // Random noise
      { fn: addColorChannelShifts, chance: 0.6 } // New vertical color shifts
  ];

  // Apply effects randomly
  effects.forEach(effect => {
      if (Math.random() < effect.chance) {
          imageData = effect.fn(imageData);
      }
  });

  return imageData;
}

function glitchify(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const tempData = new Uint8ClampedArray(data);
  
  // Parameters for block glitching
  const minBlockSize = 20;
  const maxBlockSize = 50;
  const maxShift = 25;
  const initialGlitchChance = 0.05;
  const neighborGlitchChance = 0.6;
  
  // Keep track of glitched regions
  const glitchedBlocks = new Set();
  
  // Calculate number of blocks in each dimension
  const blocksWide = Math.ceil(width / minBlockSize);
  const blocksHigh = Math.ceil(height / minBlockSize);
  
  // First pass: Initialize seed points
  const seedPoints = [];
  const numSeedPoints = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < numSeedPoints; i++) {
      const seedX = Math.floor(Math.random() * blocksWide);
      const seedY = Math.floor(Math.random() * blocksHigh);
      seedPoints.push({x: seedX, y: seedY});
      glitchedBlocks.add(`${seedX},${seedY}`);
  }
  
  // Function to get neighboring block coordinates
  function getNeighbors(blockX, blockY) {
      return [
          {x: blockX-1, y: blockY},
          {x: blockX+1, y: blockY},
          {x: blockX, y: blockY-1},
          {x: blockX, y: blockY+1},
          {x: blockX-1, y: blockY-1},
          {x: blockX+1, y: blockY+1},
          {x: blockX-1, y: blockY+1},
          {x: blockX+1, y: blockY-1}
      ].filter(pos => 
          pos.x >= 0 && pos.x < blocksWide && 
          pos.y >= 0 && pos.y < blocksHigh
      );
  }
  
  // Second pass: Grow regions from seed points
  let blocksToProcess = [...seedPoints];
  
  while (blocksToProcess.length > 0) {
      const currentBlock = blocksToProcess.shift();
      const neighbors = getNeighbors(currentBlock.x, currentBlock.y);
      
      for (const neighbor of neighbors) {
          const blockKey = `${neighbor.x},${neighbor.y}`;
          
          if (!glitchedBlocks.has(blockKey) && Math.random() < neighborGlitchChance) {
              glitchedBlocks.add(blockKey);
              blocksToProcess.push(neighbor);
              
              const blockX = neighbor.x * minBlockSize;
              const blockY = neighbor.y * minBlockSize;
              
              const blockWidth = Math.floor(Math.random() * 
                  (maxBlockSize - minBlockSize + 1)) + minBlockSize;
              const blockHeight = Math.floor(Math.random() * 
                  (maxBlockSize - minBlockSize + 1)) + minBlockSize;
              
              // Calculate distance factor
              const distanceFactors = seedPoints.map(seed => {
                  const dx = seed.x - neighbor.x;
                  const dy = seed.y - neighbor.y;
                  return 1 / (Math.sqrt(dx*dx + dy*dy) + 1);
              });
              const maxDistanceFactor = Math.max(...distanceFactors);
              
              // Calculate shifts
              const shiftX = Math.floor((Math.random() * maxShift * 2 - maxShift) * maxDistanceFactor);
              const shiftY = Math.floor((Math.random() * (maxShift/2) * 2 - maxShift/2) * maxDistanceFactor);
              
              // Apply the block shift
              for (let y = blockY; y < Math.min(blockY + blockHeight, height); y++) {
                  for (let x = blockX; x < Math.min(blockX + blockWidth, width); x++) {
                      const sourceX = (x + shiftX + width) % width;
                      const sourceY = (y + shiftY + height) % height;
                      
                      const sourceIndex = (sourceY * width + sourceX) * 4;
                      const destIndex = (y * width + x) * 4;
                      
                      // Copy all channels including alpha
                      data[destIndex] = tempData[sourceIndex];
                      data[destIndex + 1] = tempData[sourceIndex + 1];
                      data[destIndex + 2] = tempData[sourceIndex + 2];
                      data[destIndex + 3] = tempData[sourceIndex + 3];
                  }
              }
              
              // RGB split effect
              if (Math.random() < maxDistanceFactor * 0.4) {  // Reduced probability
                  const rgbShift = Math.floor(Math.random() * 8 * maxDistanceFactor) + 2;
                  
                  // Create a temporary buffer for this effect
                  const blockBuffer = new Uint8ClampedArray(blockWidth * blockHeight * 4);
                  
                  for (let y = blockY; y < Math.min(blockY + blockHeight, height); y++) {
                      for (let x = blockX; x < Math.min(blockX + blockWidth, width); x++) {
                          const destIndex = (y * width + x) * 4;
                          const leftX = Math.max(0, x - rgbShift);
                          const rightX = Math.min(width - 1, x + rgbShift);
                          
                          // Get indices for shifted positions
                          const leftIndex = (y * width + leftX) * 4;
                          const rightIndex = (y * width + rightX) * 4;
                          
                          // Preserve green channel, shift red left and blue right
                          data[destIndex] = tempData[leftIndex];      // Red
                          // Green stays from the block shift
                          data[destIndex + 2] = tempData[rightIndex + 2];  // Blue
                          // Alpha stays unchanged
                      }
                  }
              }
          }
      }
  }
  
  return imageData;
}
// New function for vertical color channel shifts
function addColorChannelShifts(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const tempData = new Uint8ClampedArray(data);
  
  const maxShift = height / 3;  // Allow for large vertical shifts
  const numShifts = Math.floor(Math.random() * 3) + 1; // 1-3 shifts
  
  // Apply multiple color channel shifts
  for (let shift = 0; shift < numShifts; shift++) {
      // Randomly choose which color channels to affect
      const affectRed = Math.random() < 0.5;
      const affectGreen = Math.random() < 0.3;
      const affectBlue = Math.random() < 0.5;
      
      // Random vertical shift amount
      const shiftAmount = Math.floor(Math.random() * maxShift * 2) - maxShift;
      
      // Apply the shift to selected channels
      for (let y = 0; y < height; y++) {
          const sourceY = (y + shiftAmount + height) % height;
          
          for (let x = 0; x < width; x++) {
              const sourceIndex = (sourceY * width + x) * 4;
              const destIndex = (y * width + x) * 4;
              
              if (affectRed) data[destIndex] = tempData[sourceIndex];
              if (affectGreen) data[destIndex + 1] = tempData[sourceIndex + 1];
              if (affectBlue) data[destIndex + 2] = tempData[sourceIndex + 2];
          }
      }
  }
  
  return imageData;
}



function addVerticalShifts(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const tempData = new Uint8ClampedArray(data);
  
  const maxShift = 10;
  const blockWidth = 30;
  const glitchChance = 0.1;
  
  for (let x = 0; x < width; x += blockWidth) {
      if (Math.random() < glitchChance) {
          const shift = Math.floor(Math.random() * maxShift * 2) - maxShift;
          
          for (let col = x; col < Math.min(x + blockWidth, width); col++) {
              for (let y = 0; y < height; y++) {
                  const sourceY = (y + shift + height) % height;
                  const sourceIndex = (sourceY * width + col) * 4;
                  const destIndex = (y * width + col) * 4;
                  
                  for (let i = 0; i < 4; i++) {
                      data[destIndex + i] = tempData[sourceIndex + i];
                  }
              }
          }
      }
  }
  
  return imageData;
}

function addScanlines(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  const scanlineOpacity = 0.2;
  const scanlineSpacing = 4;
  
  for (let y = 0; y < height; y++) {
      if (y % scanlineSpacing === 0) {
          for (let x = 0; x < width; x++) {
              const index = (y * width + x) * 4;
              // Darken the scanline
              data[index] *= (1 - scanlineOpacity);
              data[index + 1] *= (1 - scanlineOpacity);
              data[index + 2] *= (1 - scanlineOpacity);
          }
      }
  }
  
  return imageData;
}

// Enhanced noise function with more variety
function addNoise(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  const noiseTypes = ['static', 'lines', 'blocks'];
  const noiseType = noiseTypes[Math.floor(Math.random() * noiseTypes.length)];
  
  switch(noiseType) {
      case 'static':
          // Random pixel noise
          const noiseIntensity = Math.random() * 50 + 20;
          const noiseChance = Math.random() * 0.2 + 0.1;
          
          for (let i = 0; i < data.length; i += 4) {
              if (Math.random() < noiseChance) {
                  const noise = Math.floor(Math.random() * noiseIntensity);
                  for (let c = 0; c < 3; c++) {
                      data[i + c] = Math.min(255, data[i + c] + noise);
                  }
              }
          }
          break;
          
      case 'lines':
          // Horizontal noise lines
          const lineSpacing = Math.floor(Math.random() * 20) + 5;
          const lineIntensity = Math.random() * 100 + 50;
          
          for (let y = 0; y < height; y++) {
              if (y % lineSpacing === 0 && Math.random() < 0.7) {
                  for (let x = 0; x < width; x++) {
                      const index = (y * width + x) * 4;
                      const noise = Math.floor(Math.random() * lineIntensity);
                      for (let c = 0; c < 3; c++) {
                          data[index + c] = Math.min(255, data[index + c] + noise);
                      }
                  }
              }
          }
          break;
          
      case 'blocks':
          // Noisy blocks
          const blockSize = Math.floor(Math.random() * 20) + 10;
          const blockChance = 0.1;
          
          for (let y = 0; y < height; y += blockSize) {
              for (let x = 0; x < width; x += blockSize) {
                  if (Math.random() < blockChance) {
                      const noise = Math.floor(Math.random() * 100);
                      for (let by = y; by < Math.min(y + blockSize, height); by++) {
                          for (let bx = x; bx < Math.min(x + blockSize, width); bx++) {
                              const index = (by * width + bx) * 4;
                              for (let c = 0; c < 3; c++) {
                                  data[index + c] = Math.min(255, data[index + c] + noise);
                              }
                          }
                      }
                  }
              }
          }
          break;
  }
  
  return imageData;
}

const outlineColor = [0, 0, 0, 255]; // Black outline

function applyEdge(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // Create a copy of the image data for edge detection
  const tempData = new Uint8ClampedArray(data);

  // Step 1: Edge Detection on original image
  const threshold = 17; // Lower threshold for more edges

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      
      // Check each color channel for edges
      let maxGradient = 0;
      
      // For each color channel (R,G,B)
      for (let c = 0; c < 3; c++) {
        const centerVal = tempData[index + c];
        const leftVal = tempData[index - 4 + c];
        const rightVal = tempData[index + 4 + c];
        const topVal = tempData[index - (width * 4) + c];
        const bottomVal = tempData[index + (width * 4) + c];

        // Simple gradient calculation
        const horizontalDiff = Math.abs(leftVal - rightVal);
        const verticalDiff = Math.abs(topVal - bottomVal);
        
        maxGradient = Math.max(maxGradient, horizontalDiff, verticalDiff);
      }

      if (maxGradient > threshold) {
        data[index] = outlineColor[0];
        data[index + 1] = outlineColor[1];
        data[index + 2] = outlineColor[2];
        data[index + 3] = outlineColor[3];
      }
    }
  }
  return imageData;
}

function applyQuantization(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

// Step 2: Color Flattening
const levels = 4; // Number of levels for each channel
const step = 255 / (levels - 1);

for (let i = 0; i < data.length; i += 4) {
  // Skip pixels that were marked as outline
  if (data[i] !== outlineColor[0] || data[i + 1] !== outlineColor[1] || data[i + 2] !== outlineColor[2]) {
    // Process each channel separately to maintain color ratios
    for (let c = 0; c < 3; c++) {
      const value = data[i + c];
      // Quantize to nearest level while preserving some original detail
      const quantized = Math.round(value / step) * step;
      // Mix between quantized and original value to preserve some detail
      data[i + c] = Math.round(quantized * 0.4 + value * 0.6);
    }
  }
}

return imageData;
} 


function applyCelShading(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // Create a copy of the image data for edge detection
  const tempData = new Uint8ClampedArray(data);

  // Step 1: Collect color frequencies with similarity grouping
  const colorGroups = new Map();

  const similarityThreshold = 60; // Threshold for considering colors similar

  for (let i = 0; i < data.length; i += 4) {
    const currentColor = [data[i], data[i + 1], data[i + 2]];
    
    // Try to find an existing similar color group
    let foundGroup = false;
    for (const [groupKey, group] of colorGroups.entries()) {
      const groupColor = groupKey.split(',').map(Number);
      if (weightedColorDistance(currentColor, groupColor) < similarityThreshold) {
        group.count++;
        // Update the average color of the group
        group.sumR += currentColor[0];
        group.sumG += currentColor[1];
        group.sumB += currentColor[2];
        foundGroup = true;
        break;
      }
    }

    // If no similar group found, create a new one
    if (!foundGroup) {
      const colorKey = `${currentColor[0]},${currentColor[1]},${currentColor[2]}`;
      colorGroups.set(colorKey, {
        count: 1,
        sumR: currentColor[0],
        sumG: currentColor[1],
        sumB: currentColor[2]
      });
    }
  }

  // Convert groups to average colors and sort by frequency
  const dominantColors = Array.from(colorGroups.entries())
    .map(([key, group]) => ({
      color: [
        Math.round(group.sumR / group.count),
        Math.round(group.sumG / group.count),
        Math.round(group.sumB / group.count)
      ],
      count: group.count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(entry => entry.color);

  // Debug: Log the dominant colors
  console.log("Dominant Colors:", dominantColors.map(color => 
    `RGB(${color[0]}, ${color[1]}, ${color[2]})`
  ));

  // Step 2: Edge Detection
  const outlineColor = [0, 0, 0, 255];
  const threshold = 17;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      
      let maxGradient = 0;
      
      for (let c = 0; c < 3; c++) {
        const centerVal = tempData[index + c];
        const leftVal = tempData[index - 4 + c];
        const rightVal = tempData[index + 4 + c];
        const topVal = tempData[index - (width * 4) + c];
        const bottomVal = tempData[index + (width * 4) + c];

        const horizontalDiff = Math.abs(leftVal - rightVal);
        const verticalDiff = Math.abs(topVal - bottomVal);
        
        maxGradient = Math.max(maxGradient, horizontalDiff, verticalDiff);
      }

      if (maxGradient > threshold) {
        data[index] = outlineColor[0];
        data[index + 1] = outlineColor[1];
        data[index + 2] = outlineColor[2];
        data[index + 3] = outlineColor[3];
      }
    }
  }

  // Step 3: Map each non-outline pixel to nearest dominant color
  for (let i = 0; i < data.length; i += 4) {
    // Skip outline pixels
    if (data[i] === outlineColor[0] && 
        data[i + 1] === outlineColor[1] && 
        data[i + 2] === outlineColor[2]) {
      continue;
    }

    const pixelColor = [data[i], data[i + 1], data[i + 2]];
    
    // Find closest dominant color
    let minDistance = Infinity;
    let closestColor = dominantColors[0];
    
    for (const color of dominantColors) {
      const distance = weightedColorDistance(pixelColor, color);
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = color;
      }
    }

    // Apply the closest color
    data[i] = closestColor[0];
    data[i + 1] = closestColor[1];
    data[i + 2] = closestColor[2];
  }

  return imageData;
}

function weightedColorDistance(color1, color2) {
  // Weights for RGB (emphasizing green channel as humans are more sensitive to it)
  const rWeight = 0.3;
  const gWeight = 0.59;
  const bWeight = 0.11;

  const rDiff = (color1[0] - color2[0]) * rWeight;
  const gDiff = (color1[1] - color2[1]) * gWeight;
  const bDiff = (color1[2] - color2[2]) * bWeight;

  // Add luminance difference to the calculation
  const lum1 = (color1[0] * rWeight + color1[1] * gWeight + color1[2] * bWeight);
  const lum2 = (color2[0] * rWeight + color2[1] * gWeight + color2[2] * bWeight);
  const lumDiff = Math.abs(lum1 - lum2) * 2;

  return rDiff * rDiff + gDiff * gDiff + bDiff * bDiff + lumDiff * lumDiff;
}

/* function applyCelShading(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // Create a copy of the image data for edge detection
  const tempData = new Uint8ClampedArray(data);

  // Step 1: Edge Detection on original image
  const outlineColor = [0, 0, 0, 255]; // Black outline
  const threshold = 17; // Lower threshold for more edges

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      
      // Check each color channel for edges
      let maxGradient = 0;
      
      // For each color channel (R,G,B)
      for (let c = 0; c < 3; c++) {
        const centerVal = tempData[index + c];
        const leftVal = tempData[index - 4 + c];
        const rightVal = tempData[index + 4 + c];
        const topVal = tempData[index - (width * 4) + c];
        const bottomVal = tempData[index + (width * 4) + c];

        // Simple gradient calculation
        const horizontalDiff = Math.abs(leftVal - rightVal);
        const verticalDiff = Math.abs(topVal - bottomVal);
        
        maxGradient = Math.max(maxGradient, horizontalDiff, verticalDiff);
      }

      if (maxGradient > threshold) {
        data[index] = outlineColor[0];
        data[index + 1] = outlineColor[1];
        data[index + 2] = outlineColor[2];
        data[index + 3] = outlineColor[3];
      }
    }
  }

  // Step 2: Color Flattening
  const levels = 4; // Number of levels for each channel
  const step = 255 / (levels - 1);
  
  for (let i = 0; i < data.length; i += 4) {
    // Skip pixels that were marked as outline
    if (data[i] !== outlineColor[0] || data[i + 1] !== outlineColor[1] || data[i + 2] !== outlineColor[2]) {
      // Process each channel separately to maintain color ratios
      for (let c = 0; c < 3; c++) {
        const value = data[i + c];
        // Quantize to nearest level while preserving some original detail
        const quantized = Math.round(value / step) * step;
        // Mix between quantized and original value to preserve some detail
        data[i + c] = Math.round(quantized * 0.4 + value * 0.6);
      }
    }
  }

  return imageData;
} */
 

/* function applyCelShading(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // Create a copy of the image data for edge detection
  const tempData = new Uint8ClampedArray(data);

  // Step 1: Collect color frequencies
  const colorMap = new Map();
  for (let i = 0; i < data.length; i += 4) {
    // Create a color key that combines R,G,B
    const colorKey = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
  }

  // Sort colors by frequency and take top 20
  const dominantColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(entry => entry[0].split(',').map(Number));

  // Debug: Log the dominant colors
  console.log("Dominant Colors:", dominantColors.map(color => 
    `RGB(${color[0]}, ${color[1]}, ${color[2]})`
  ));

  // Step 2: Edge Detection
  const outlineColor = [0, 0, 0, 255];
  const threshold = 17;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      
      let maxGradient = 0;
      
      for (let c = 0; c < 3; c++) {
        const centerVal = tempData[index + c];
        const leftVal = tempData[index - 4 + c];
        const rightVal = tempData[index + 4 + c];
        const topVal = tempData[index - (width * 4) + c];
        const bottomVal = tempData[index + (width * 4) + c];

        const horizontalDiff = Math.abs(leftVal - rightVal);
        const verticalDiff = Math.abs(topVal - bottomVal);
        
        maxGradient = Math.max(maxGradient, horizontalDiff, verticalDiff);
      }

      if (maxGradient > threshold) {
        data[index] = outlineColor[0];
        data[index + 1] = outlineColor[1];
        data[index + 2] = outlineColor[2];
        data[index + 3] = outlineColor[3];
      }
    }
  }

  // Debug: Sample a few pixels before and after conversion
  const samplePoints = [
    [width/2, height/2],  // Center
    [width/4, height/4],  // Top left quarter
    [3*width/4, 3*height/4]  // Bottom right quarter
  ];

  // Step 3: Map each non-outline pixel to nearest dominant color
  for (let i = 0; i < data.length; i += 4) {
    // Skip outline pixels
    if (data[i] === outlineColor[0] && 
        data[i + 1] === outlineColor[1] && 
        data[i + 2] === outlineColor[2]) {
      continue;
    }

    const pixelColor = [data[i], data[i + 1], data[i + 2]];
    
    // Debug: Log sample points before conversion
    const currentY = Math.floor(i / (width * 4));
    const currentX = Math.floor((i % (width * 4)) / 4);
    if (samplePoints.some(point => point[0] === currentX && point[1] === currentY)) {
      console.log(`Before conversion at (${currentX},${currentY}):`, 
        `RGB(${pixelColor[0]}, ${pixelColor[1]}, ${pixelColor[2]})`);
    }

    // Find closest dominant color using weighted color distance
    let minDistance = Infinity;
    let closestColor = dominantColors[0];
    let debugDistances = [];  // Debug: track distances to each dominant color
    
    for (const color of dominantColors) {
      const distance = weightedColorDistance(pixelColor, color);
      debugDistances.push({color, distance});
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = color;
      }
    }

    // Debug: Log sample points after finding closest color
    if (samplePoints.some(point => point[0] === currentX && point[1] === currentY)) {
      console.log(`After finding closest color at (${currentX},${currentY}):`, 
        `RGB(${closestColor[0]}, ${closestColor[1]}, ${closestColor[2]})`);
      console.log('Distance calculations:', debugDistances.map(d => 
        `RGB(${d.color[0]}, ${d.color[1]}, ${d.color[2]}) = ${d.distance}`
      ));
    }

    // Apply the closest color
    data[i] = closestColor[0];
    data[i + 1] = closestColor[1];
    data[i + 2] = closestColor[2];
  }

  return imageData;
}

function weightedColorDistance(color1, color2) {
  // Weights for RGB (emphasizing green channel as humans are more sensitive to it)
  const rWeight = 0.3;
  const gWeight = 0.59;
  const bWeight = 0.11;

  const rDiff = (color1[0] - color2[0]) * rWeight;
  const gDiff = (color1[1] - color2[1]) * gWeight;
  const bDiff = (color1[2] - color2[2]) * bWeight;

  // Add luminance difference to the calculation
  const lum1 = (color1[0] * rWeight + color1[1] * gWeight + color1[2] * bWeight);
  const lum2 = (color2[0] * rWeight + color2[1] * gWeight + color2[2] * bWeight);
  const lumDiff = Math.abs(lum1 - lum2) * 2;

  return rDiff * rDiff + gDiff * gDiff + bDiff * bDiff + lumDiff * lumDiff;
}
 */
// Improved color distance calculation that better matches human perception
// Based on weighted Euclidean distance with emphasis on luminance





// function applyCelShading(imageData) {
//   const data = imageData.data;
//   const width = imageData.width;
//   const height = imageData.height;

//   // Create a copy of the image data for edge detection
//   const tempData = new Uint8ClampedArray(data);

//   // Step 1: Edge Detection on original image
//   const outlineColor = [0, 0, 0, 255]; // Black outline
//   const threshold = 75; // Higher threshold for more selective edge detection

//   for (let y = 1; y < height - 1; y++) {
//     for (let x = 1; x < width - 1; x++) {
//       const index = (y * width + x) * 4;
      
//       // Calculate intensity values for surrounding pixels
//       const getIntensity = (idx) => {
//         return (tempData[idx] + tempData[idx + 1] + tempData[idx + 2]) / 3;
//       };

//       // Sample intensities using Sobel kernel positions
//       const topLeft = getIntensity((y - 1) * width * 4 + (x - 1) * 4);
//       const top = getIntensity((y - 1) * width * 4 + x * 4);
//       const topRight = getIntensity((y - 1) * width * 4 + (x + 1) * 4);
//       const left = getIntensity(y * width * 4 + (x - 1) * 4);
//       const right = getIntensity(y * width * 4 + (x + 1) * 4);
//       const bottomLeft = getIntensity((y + 1) * width * 4 + (x - 1) * 4);
//       const bottom = getIntensity((y + 1) * width * 4 + x * 4);
//       const bottomRight = getIntensity((y + 1) * width * 4 + (x + 1) * 4);

//       // Sobel operators
//       const gx = topRight + 2 * right + bottomRight - (topLeft + 2 * left + bottomLeft);
//       const gy = bottomLeft + 2 * bottom + bottomRight - (topLeft + 2 * top + topRight);

//       const magnitude = Math.sqrt(gx * gx + gy * gy);

//       if (magnitude > threshold) {
//         data[index] = outlineColor[0];
//         data[index + 1] = outlineColor[1];
//         data[index + 2] = outlineColor[2];
//         data[index + 3] = outlineColor[3];
//       }
//     }
//   }


//   // Step 2: Color Flattening
//   const levels = 6; // Number of levels for each channel
//   const step = 255 / (levels - 1);
  
//   for (let i = 0; i < data.length; i += 4) {
//     // Skip pixels that were marked as outline
//     if (data[i] !== outlineColor[0] || data[i + 1] !== outlineColor[1] || data[i + 2] !== outlineColor[2]) {
//       // Process each channel separately to maintain color ratios
//       for (let c = 0; c < 3; c++) {
//         const value = data[i + c];
//         // Quantize to nearest level while preserving some original detail
//         const quantized = Math.round(value / step) * step;
//         // Mix between quantized and original value to preserve some detail
//         data[i + c] = Math.round(quantized * 0.4 + value * 0.6);
//       }
//     }
//   }


  //This method trends towartds grey scale
  // // Step 2: Improved Color Flattening
  // const levels = 4; // Number of levels for each channel
  // const step = 255 / (levels - 1);
  
  // for (let i = 0; i < data.length; i += 4) {
  //   // Skip pixels that were marked as outline
  //   if (data[i] !== outlineColor[0] || data[i + 1] !== outlineColor[1] || data[i + 2] !== outlineColor[2]) {
  //     // Calculate intensity of the pixel
  //     const intensity = (data[i] + data[i + 1] + data[i + 2]) / 3;
      
  //     // Determine which level this intensity belongs to
  //     const level = Math.round(intensity / step);
      
  //     // Apply some color preservation while still flattening
  //     for (let c = 0; c < 3; c++) {
  //       const color = data[i + c];
  //       //const normalizedColor = color / 255;
  //       // Mix between pure levels and original color to preserve some color variation
  //       data[i + c] = Math.round((level * step * 0.5 + color * 0.5));
  //     }
  //   }
  // }

//   return imageData;
// } 

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
    makeVerySettings.id = 'Glitchify-settings';
    makeVerySettings.classList.add('settings-box');
    makeVerySettings.classList.add('panel-box');
    let tempHTML =  
        `<h4 class="collapsible">Glitchify Images Settings
          <i id="reset-Glitchify-settings" class="fa-solid fa-arrow-rotate-left section-button">
          <span class="simple-tooltip top-left">
          Reset Glitchify Images Settings
          </span>
          </i>
        </h4>
        <div id="Glitchify-settings-entries" class="collapsible-content" style="display: block;margin-top:15px;">
        <div><ul style="padding-left:0px">
          <li><b class="settings-subheader">Glitchify Settings</b></li>
          <li class="pl-5"><div class="input-toggle">
          <input id="Glitchify_quality" name="Glitchify_quality" type="checkbox" value="`+GlitchifySettings.highQuality+`"  onchange="setGlitchifySettings()"> <label for="Glitchify_quality"></label>
          </div>
          <label for="Glitchify_quality">Use more steps for higher quality results<small> (longer run-time)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="Glitchify_sharpen" name="Glitchify_sharpen" type="checkbox" value="`+GlitchifySettings.enhanceImage+`"  onchange="setGlitchifySettings()"> <label for="Glitchify_sharpen"></label>
          </div>
          <label for="Glitchify_sharpen">Enhance Details</label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="Glitchify_noise" name="Glitchify_noise" type="checkbox" value="`+GlitchifySettings.addNoise+`"  onchange="setGlitchifySettings()"> <label for="Glitchify_noise"></label>
          </div>
          <label for="Glitchify_noise">Add Noise<small> (further enhances details and texture)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="Glitchify_preserve" name="Glitchify_preserve" type="checkbox" value="`+GlitchifySettings.preserve+`"  onchange="setGlitchifySettings()"> <label for="Glitchify_preserve"></label>
          </div>
          <label for="Glitchify_preserve">Preserve image<small> (stay close to original image while enhancing details)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="Glitchify_change_prompt" name="Glitchify_change_prompt" type="checkbox" value="`+GlitchifySettings.useChangedPrompt+`"  onchange="setGlitchifySettings()"> <label for="Glitchify_change_prompt"></label>
          </div>
          <label for="Glitchify_change_prompt">Use new prompt, above <small>(not the original prompt)</small></label>
          </li>
        </ul></div>
        </div>`;
    makeVerySettings.innerHTML = tempHTML;
    var editorSettings = document.getElementById('editor-settings');
    editorSettings.parentNode.insertBefore(makeVerySettings, editorSettings.nextSibling);
    createCollapsibles(makeVerySettings);

    const icon = document.getElementById('reset-Glitchify-settings');
    icon.addEventListener('click', GlitchifyResetSettings);

    //Ensure switches match the settings (for the initial values), since "value=" in above HTML may not work.  But more importantly, we now load settings from storage.
    GlitchifyResetSettings(null);
  }
  setup();

})();

function setGlitchifySettings() {
  GlitchifySettings.highQuality = Glitchify_quality.checked;
  GlitchifySettings.enhanceImage = Glitchify_sharpen.checked;
  GlitchifySettings.addNoise = Glitchify_noise.checked;
  GlitchifySettings.preserve = Glitchify_preserve.checked;
  GlitchifySettings.useChangedPrompt = Glitchify_change_prompt.checked;

  localStorage.setItem('Glitchify_Plugin_Settings', JSON.stringify(GlitchifySettings));  //Store settings
}

//Sets the default values for the settings.
//If reset=pointerevent, then we came from the reset click -- reset to absolute defaults
//if reset=null, just reload from saved settings
//Could manually remove/reset settings using:  localStorage.removeItem('Glitchify_Plugin_Settings')
function GlitchifyResetSettings(reset) {

  let settings = JSON.parse(localStorage.getItem('Glitchify_Plugin_Settings'));
  if (settings == null || reset !=null) {  //if settings not found, just set everything
    GlitchifySettings.highQuality = false;
    GlitchifySettings.enhanceImage = false;
    GlitchifySettings.addNoise = false;
    GlitchifySettings.preserve = false;
    GlitchifySettings.useChangedPrompt = false;
  }
  else {  //if settings found, but we've added a new setting, use a default value instead.  (Not strictly necessary for this first group.)
    GlitchifySettings.highQuality = settings.highQuality ?? false;
    GlitchifySettings.enhanceImage = settings.enhanceImage ?? false;
    GlitchifySettings.addNoise = settings.addNoise ?? false;
    GlitchifySettings.preserve = settings.preserve ?? false;
    GlitchifySettings.useChangedPrompt =settings.useChangedPrompt ?? false;
  }

  localStorage.setItem('Glitchify_Plugin_Settings', JSON.stringify(GlitchifySettings));  //Store settings

  //set the input fields
  Glitchify_quality.checked = GlitchifySettings.highQuality;
  Glitchify_sharpen.checked = GlitchifySettings.enhanceImage;
  Glitchify_noise.checked = GlitchifySettings.addNoise;
  Glitchify_preserve.checked = GlitchifySettings.preserve;
  Glitchify_change_prompt.checked = GlitchifySettings.useChangedPrompt;
}
