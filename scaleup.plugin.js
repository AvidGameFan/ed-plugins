/**
 * Scale Up
 * v.2.11.2, last updated: 7/14/2025
 * By Gary W.
 * 
 * Scaling up, maintaining close ratio, with img2img to increase resolution of output.
 * 
 * Updated to support newer "diffusors" version of Easy Diffusion and SDXL, which can make use
 * of much higher resolutions than before.  (Note that new Nvidia drivers [since version 532]
 * and installing xformers will allow even further higher resolution limits.)
 *  
 * The expected workflow is to use ScaleUp to gradually increase resolution, while allowing 
 * Stable Diffusion to add detail.  At some point, when you're satisfied with the results,
 * you may want to use the Scale Up MAX button to jump to the highest resolution supported 
 * by your video card. 
 * 
 * Additionally, there is a "split" icon at the end -- this will divide the image into quarters,
 * and upscale each one.  You'll need to use an external program to merge the pieces.
 *
 * Another big change is that ScaleUp will grab the prompt AND the model name from the input
 * area, not from the source image. This allows you to easily swap from "base" to "refiner".
 * 
 * Now uses the original sampler from the original image, not "ddim".  Uses the model specified
 * in the UI, not in the original image, so that you may change models as you scale-up.
 * Added support for controlnet, to allow more detail without as much severe modifications
 * to the original image.
 * 
 * 
 * Free to use with the CMDR2 Stable Diffusion UI.
 * 
 */

//needs to be outside of the wrapper, as the input items are in the main UI.
//These initial values can be overwritten upon startup -- do not rely on these as defaults.
var ScaleUpSettings = {
  use64PixelChunks: true,
  useChangedPrompt: false,
  useChangedModel: false,
  resizeImage: true,
  reuseControlnet: false,
  animeControlnet: false
  //useControlNet: false,
};

/**********************************************************************
EDIT THE BELOW to put in the maximum resolutions your video card can handle. 
These values work (usually) for the Nvidia 2060 Super with 8GB VRAM. 
If you go too large, you'll see "Error: CUDA out of memory". 

The ideal maximum amount may vary depending upon not just the amount of
installed VRAM, but if using Nvidia driver v532 or greater, half of your
system RAM is also available for use (if slower).  Edit these values
to find the right balance; you may want a higher size if your memory
allows, or you may want to keep values lower, for faster run-times.
Installing xformers will also greatly reduce the RAM impact, and allow
for much greater sizes.
***********************************************************************/

(function() { "use strict"

//Original 1.5 limits: 1280 * 1536 ( 1536	* 896 balanced?)
//For 8GB VRAM and xformers, try 2592 * 2016 or more.
//Between more recent versions of ED and improved Nvidia drivers, you can now generate much larger (in late 2023) than before (early 2023).
var maxTotalResolution = 10000000; //6000000; //2048 * 1088; //put max 'low' mode resolution here, max possible size when low mode is on
var maxTurboResolution = 1088	* 1664; //put max 'balanced' resolution here - larger output will enter 'low' mode, automatically.
var MaxSquareResolution =  3072; //was 2048;

//SDXL limits:2048*2048 or better
var maxTotalResolutionXL = 4096*3072; //10000000; //3072	* 2304;  //maximum resolution to use in 'low' mode for SDXL.  Even for 8GB video cards, this number maybe able to be raised.
var maxLatentUpscaler = 1728*1152; //1600*1152; //Max resolution in which to do the 2x.  Much larger, and Latent Upscaler will run out of memory.
var maxNoVaeTiling = 2200000; //5500000;  //max resolution to allow no VAE tiling.  Turn on VAE tiling for larger images, otherwise it loads more slowly.
//Note that the table entries go in pairs, if not 1:1 square ratio.
//Ratios that don't match exactly may slightly stretch or squish the image, but should be slight enough to not be noticeable.
//First two entries are the x,y resolutions of the image, and last entry is the upscale resolution for x.
//Regarding the non-exact sizes in the table: the earlier versions of Easy Diffusion required that the pixel length and width fall on 64-pixel boundaries.  This
//limitation is reduced to 8-pixel boundaries, except for certain cases.  Latant Upscaler and other features may still require 64-pixel boundaries.
var resTable = [
    [512,512,768],
    [768,768,960], //limited to 960, just because 1024x1024 is not usable on some people's configurations
    [640,512,960],  //exactly 1.25
    [512,640,768],  //exactly 1.25
    [960,768,1280],  //exactly 1.25
    [768,960,1024],  //exactly 1.25
    [768,512,960],  //exactly 1.5
    [512,768,640],  //exactly 1.5
    [960,768,1280],  //exactly 1.25
    [768,960,1024],  //exactly 1.25
    [768,576,1024],  //exactly 1.333
    [576,768,768],  //exactly 1.333
    [1024,768,1280],  //exactly 1.333
    [768,1024,960],  //exactly 1.333
    [832,576,1024],  //1.4444 -> 1.4545
    [576,832,704],  //1.4444 -> 1.4545
    [704,512,960],  //1.375 ->1.36
    [512,704,704],  //1.375 ->1.36
    [704,576,1024],  //1.222 -> 1.230
    [576,704,832],  //1.222 -> 1.230
    [960,640,1280],  //1.5 -> 1.54 (this ratio is further off than the others)
    [640,960,832],  //1.5 -> 1.54
    [896,576,1280],  //1.56 -> 1.54
    [576,896,832],  //1.56 -> 1.54
    [640,448,1280],  //1.428 -> 1.428
    [448,640,896],  //1.428 -> 1.428
    [1024,640,1536],  //1.6
    [640,1024,960],  //1.6
    [960,576,1280],  //1.667
    [576,960,768],  //1.667
    [832,512,1024],  //1.625 -> 1.6
    [512,832,640],  //1.625 -> 1.6
    [896,512,1024],  //1.75 -> 1.78
    [512,896,576],  //1.75 -> 1.78
    [576,1024,768],  //1.78 -> 1.75 (non-ED-standard resolution choice)
    [1024,576,1344],  //1.78 -> 1.75 
    [768,1344,832],  //1.75 -> 1.77 (non-ED-standard resolution choice)
    [1344,768,1472],  //1.75 -> 1.77 
    [960,512,1536],  //1.875 -> 1.846
    [512,960,832],  //1.875 -> 1.846
    [576,512,1024],  //1.125 -> 1.143
    [512,576,896],  //1.125 -> 1.143
    [1024,832,1280],  //1.230 -> 1.25
    [832,1024,1024],  //1.230 -> 1.25
    [768,640,1024],  //1.20 -> 1.23
    [640,768,832],  //1.20 -> 1.23
    [832,704,1024],  //1.18 -> 1.14 (larger ratio change)
    [704,832,896],  //1.18 -> 1.14
    [896,768,1024], //1.17 -> 1.14
    [768,896,896],  //1.17 -> 1.14
    [960,832,1024], //1.15 -> 1.14
    [832,960,896],  //1.15 -> 1.14
    [960,704,1280],  //1.36 ->1.33
    [704,960,960],  //1.36 ->1.33
    [1024,704,1280],  //1.45 ->1.43
    [704,1024,896],  //1.45 ->1.43
    //Using these almost-square sizes pushes the ratio closer to 1:1 as you scale up
    [640,576,832],  //1.111 -> 1.083
    [576,640,768],  //1.111 -> 1.083
    [704,640,896],  //1.10 -> 1.077
    [640,704,832],  //1.10 -> 1.077
    [768,704,896],  //1.09 -> 1.077
    [704,768,832],  //1.09 -> 1.077
    [832,768,1024],  //1.083 -> 1.067
    [768,832,960],  //1.083 -> 1.067
    [896,832,1024],  //1.077 -> 1.067
    [832,896,960],  //1.077 -> 1.067
    [960,896,1024],  //1.071 -> 1.067
    [896,960,960],  //1.071 -> 1.067
]
//For precicely maintaining the aspect ratio, and allowing for 8-pixel boundaries, use this table.  Selected resolutions may not match the UI entries.
//At larger image resolutions, the rounding to 8-pixels will be less apparent, where the formula will take over.
var exactResTable = [
  [512,512,768],
  [768,768,960], 
  [640,512,960],  //exactly 1.25
  [512,640,768],  //exactly 1.25
  [960,768,1280],  //exactly 1.25
  [768,960,1024],  //exactly 1.25
  [768,512,960],  //exactly 1.5
  [512,768,640],  //exactly 1.5
  [960,768,1280],  //exactly 1.25
  [768,960,1024],  //exactly 1.25
  [768,576,1024],  //exactly 1.333
  [576,768,768],  //exactly 1.333
  [1024,768,1280],  //exactly 1.333
  [768,1024,960],  //exactly 1.333
  [1280,960,1536],  //exactly 1.333 (nonstandard, but hits 64-pixel boundary)
  [960,1280,1152],  //exactly 1.333

  [832,576,1120],  //1.4444 -> 1.443 (nonstandard, not 64)
  [576,832,776],  //1.4444 -> 1.443
  [704,512,1056],  //1.375 exact (nonstandard, not 64)
  [512,704,768],  //1.375
  [704,576,968],  //1.222 exact (nonstandard, not 64)
  [576,704,792],  //1.222 
  [968,792,1232],  //1.222 exact (nonstandard, not 64)
  [792,968,1008],  //1.222 
  [960,640,1296],  //1.5  exact (nonstandard, not 64)
  [640,960,864],  //1.5
  [1296,864,1632],  //1.5  exact (nonstandard, not 64)
  [864,1296,1088],  //1.5 
  [2248,1496,2736],  //1.5  exact (standard monitor)
  [1496,2248,1824],  //1.5 
  [896,576,1280],  //1.556 -> 1.553
  [576,896,824],  //1.556 -> 1.553
  [640,448,1280],  //1.428 -> 1.428
  [448,640,896],  //1.428 -> 1.428
  [1024,640,1536],  //1.6
  [640,1024,960],  //1.6
  [960,576,1280],  //1.667
  [576,960,768],  //1.667
  [832,512,1040],  //1.625   exact (nonstandard, not 64)
  [512,832,640],  //1.625 
  [896,512,1120],  //1.75   exact (nonstandard, not 64)
  [512,896,640],  //1.75 
  [1120,640,1344],  //1.75   exact (nonstandard, not 64)
  [640,1120,768],  //1.75  (could also do 1288x736, but this one matches a SDXL starting res)
  [768,432,1024],  // 1.77  Standard monitor resolution
  [432,768,576],  // 1.77  Standard monitor resolution
  [1920,1080,2560],  // 1.77  Standard monitor resolution
  [1080,1920,1440],  // 1.77 
  [1024,576,1280],  //1.78   exact (nonstandard, not 64)
  [576,1024,720],  //1.78 
  [1280,720,1536],  //1.78   exact (nonstandard, not 64)
  [720,1280,864],  //1.78 
  [1408,792,1920],  //1.78   exact (nonstandard, not 64)
  [792,1408,1080],  //1.78 
  [1344,768,1456],  //1.75    exact (nonstandard, not 64)
  [768,1344,832],  //1.75 (non-ED-standard resolution choice)
  [960,512,1320],  //1.875   exact (nonstandard, not 64)
  [512,960,704],  //1.875
  [576,512,792],  //1.125   exact (nonstandard, not 64)
  [512,576,704],  //1.125
  [792,704,1008],  //1.125   exact (nonstandard, not 64)
  [704,792,896],  //1.125

// Recommended starting resolutions for SDXL.  Note that they don't actually match the given ratios.
// Fullscreen: 4:3 - 1152x896
// Widescreen: 16:9 - 1344x768
//    Use 1280x720 or 1408x792 instead.
// Ultrawide: 21:9 - 1536x640
// Mobile landscape: 3:2 - 1216x832
// Square: 1:1 - 1024x1024
// Mobile Portrait: 2:3 - 832x1216
// Tall: 9:16 - 768x1344

  [1152,896,1224],  //1.285714286 -> 1.285714286  exact (nonstandard, not 64)
  [896,1152,952],  //
  [1344,768,1400],  //1.75 exact (nonstandard, not 64)
  [768,1344,800],  //
  [1216,832,1344],  //1.461538462 ->1.460869565 (nonstandard, not 64)
  [832,1216,920],  //

  //default resolutions in ED, as of Feb. 2024:   768,832,896,960,1024,1088,1280,1496,1536

  [1280,768,1360],  //1.666666667 exact  (nonstandard, not 64)
  [768,1280,816],  //
  [1120,960,1400],  //1.166666667  exact  (nonstandard, not 64)
  [960,1120,1200],  //
  [1088,960,1224],  //1.133333333  exact  (nonstandard, not 64)
  [960,1088,1080],  //
  
//These resolutions are exact from the formula, and don't need to be in the table. (And others, but these are likely to be common.)
//1280x1024 -> 1600x1280
//1088x896 -> 1360x1120
//1280x768 ->	1600 x 960
//1280x832 ->	1600x1040
//1280x896 ->	1600x1120
//1280x960 ->	1600x1200
//1088x832 ->	1360 x 1040
//1152x768 -> 1440 x 960  - 1.5
]


var scalingIncrease1=1.25; //arbitrary amount to increase scaling, when beyond lookup table
var scalingIncrease2=1.5; //arbitrary amount to increase scaling, when beyond lookup table
var contrastAmount=0.8;  //0.8 appears to slightly increase contrast; 0.7 is more neutral

function maxRatio(maxRes, height, width) {
  return Math.sqrt(maxRes/(height*width));
}


function scaleUp(height,width,scalingIncrease) {
  var result=height;
  let table = (ScaleUpSettings.use64PixelChunks)?resTable:exactResTable;
  table.forEach(function(item){
      if (item[0]==height && 
          item[1]==width)
          {
          result=item[2]
          return;
          }
  })
  if (result==height || scalingIncrease!=scalingIncrease1) { /*no match found in table OR if not the first button, ignore table */
      if (height==width) { /* and if square */
          if (height>=768 && height<MaxSquareResolution) {
              //result=MaxSquareResolution; //arbitrary
              result = ScaleUpMax(height,Math.min(maxRatio(maxTotalResolution, height, width),scalingIncrease));
          }
          else if (height<768) {
              result=896; //arbitrary
          }
      }
      else {  //we don't have any match, but let's just make up something, until we run out of resolution
          result = ScaleUpMax(height,Math.min(maxRatio(maxTotalResolution, height, width),scalingIncrease)); //arbitrarily go 1.25 times larger, until we hit max res
      }
  }
  return result;
}

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

//Model needs to have "xl" in the filename to be recognized as an xl model.
//add any special cases as needed.
function isModelXl(modelName) {
  let result = false;
  if (modelName.search(/xl/i)>=0 || modelName.search(/playground/i)>=0 || modelName.search(/disneyrealcartoonmix/i)>=0  || modelName.search(/mobius/i)>=0 
    || isModelFlux(modelName) || modelName.search(/zovya/i)>=0) {  //Zovya models appear to mostly be Pony XL -- need to update if there are SD 1.5 models instead
    result = true;
  }  
  return result;
}

//If flux, can use fewer steps
function isModelFlux(modelName) {
  let result = false;
  if (modelName.search(/flux/i)>=0 || modelName.search(/lyhAnime_kor/i)>=0 || modelName.search(/chroma/i)>=0) {
    result = true;
  }  
  //If turbo model but not actually turbo, go ahead and call it flux, to do fewer steps
  if (isModelTurbo(modelName) && modelName.search(/turbo/i)<0) {
    result = true;
  }
  return result;
}


function desiredModelName(origRequest, forceOrigModelName /*optional*/) {
  //Grab the model name from the user-input area instead of the original image.
  if (ScaleUpSettings.useChangedModel && !forceOrigModelName) {
    return $("#editor-settings #stable_diffusion_model")[0].dataset.path; 
  }
  else {
    return origRequest.use_stable_diffusion_model; //for the original model
  }
}
function desiredVaeName(origRequest) {
  //Grab the  name from the user-input area instead of the original image.
  if (ScaleUpSettings.useChangedModel) {
    return $("#editor-settings #vae_model")[0].dataset.path; 
  }
  else {
    return origRequest.use_vae_model; //for the original model
  }
}
function desiredTextEncoderName(origRequest) {
  if (ScaleUpSettings.useChangedModel) {
    // Get the JSON string from the UI
    let data = $("#editor-settings #text_encoder_model")[0].dataset.path;
    try {
      let parsed = JSON.parse(data);
      // Return the modelNames array, or an empty array if not found
      return parsed.modelNames || [];
    } catch (e) {
      // If parsing fails, return an empty array
      return [];
    }
  } else {
    // Use the original request's value
    return origRequest.use_text_encoder_model;
  }
}

//Use the new image, if available. If unavailable (in the filters), just use the origRequest.  Unfortunately, these do not match after using Upscaler.
//The filters don't have the image set.  Probably can revert them back to using origRequest directly.
//The main buttons have access to the image, which may vary from origRequest if an uscaler has been used.  The image values are more accurate,
//so using origRequest values will generate an incorrect label.  This seemingly can't be helped.
function getWidth(origRequest, image) {
  //since the true image size isn't available, guesstimate it, if upscaler was used.
  if (origRequest.use_upscale != undefined) {
    return origRequest.width*origRequest.upscale_amount;
  }
  //if(image!=undefined && image.naturalWidth>0) {
  //  return image.naturalWidth;
  //}
  return origRequest.width;
}
function getHeight(origRequest, image) {
  //since the true image size isn't available, guesstimate it, if upscaler was used.
  if (origRequest.use_upscale != undefined) {
    return origRequest.height*origRequest.upscale_amount;
  }
  //if(image!=undefined && image.naturalHeight>0) {
  //  return image.naturalHeight;
  //}
  return origRequest.height;
}

const suLabel = 'Scale Up';  //base label prefix
PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { html: '<span class="scaleup-label" style="background-color:transparent;background: rgba(0,0,0,0.5)">'+
    '<span class="scaleup-tooltiptext">Click to cycle through modes - "preserve", for fewer changes to the image, '+
    ' and "Controlnet", to allow more detail. ' +
    'Clicking on a resolution will generate a new image at that resolution. \n'+
    'Click on the 3-row icon to generate 3 images, each at an increasing resolution, for max detail enhancement. \n'+
    'Click on the grid icon to generate 4 tiled images, for more resolution once stitched.</span>'
    +suLabel+':</span>', type: 'label', 
    on_click: onScaleUpLabelClick, filter: onScaleUpLabelFilter},
  { text: 'Scale Up', on_click: onScaleUpClick, filter: onScaleUpFilter },
  { text: 'Scale Up2', on_click: onScaleUpClick2, filter: onScaleUpFilter2 },
  { text: 'Scale Up MAX', on_click: onScaleUpMAXClick, filter: onScaleUpMAXFilter },
  { text: '2X', on_click: onScaleUp2xClick, filter: onScaleUp2xFilter },
  { html: '<i class="fa fa-list-ol"></i>', on_click: onScaleUpMultiClick, filter: onScaleUpMultiFilter  },
  { html: '<i class="fa-solid fa-th-large"></i>', on_click: onScaleUpSplitClick, filter: onScaleUpSplitFilter  },
  { html: '<i class="fa-solid fa-object-group"></i>', on_click: onCombineSplitClick, filter: onCombineSplitFilter }
])
/* Note: Tooltip will be removed once the label is clicked. */

const style = document.createElement('style');
style.textContent = `

/* Show the tooltip text when you mouse over the tooltip container */
.scaleup-label:hover .scaleup-tooltiptext {
  visibility: visible;
}

/* See: https://stackoverflow.com/questions/13811538/how-to-delay-basic-html-tooltip */


.scaleup-label .scaleup-tooltiptext {
  visibility: hidden;
  width: 400px;
  background-color: #444;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 5px 0;
  /* Position the tooltip */
  position: absolute;
  z-index: 1;
  top: 100%;
  right: 50%;
  opacity: 1;
  transition: opacity 1s;
}

.scaleup-label .tooltiptext::after {
  content: " ";
  position: absolute;
  top: 50%;
  right: 100%;
  /* To the left of the tooltip */
  margin-top: -5px;
  border-width: 5px;
  border-style: solid;
  border-color: transparent #545 transparent transparent;
}


/*hover with animation*/

.scaleup-label:hover .scaleup-tooltiptext {
  visibility: visible;
  animation: tooltipkeys 1s 1; //delay time
  opacity: 1;
}

@-webkit-keyframes tooltipkeys {
  0% {
    opacity: 0;
  }
  75% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@-moz-keyframes tooltipkeys {
  0% {
    opacity: 0;
  }
  75% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@-o-keyframes tooltipkeys {
  0% {
    opacity: 0;
  }
  75% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes tooltipkeys {
  0% {
    opacity: 0;
  }
  75% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

`;
document.head.append(style);

//round to 2 decimal places
function scaleupRound(value) {
  return Math.round(value * 100) / 100;
}
const reduceFluxPromptStrength = 0.0; //was: 0.03;

//Javascript doesn't have enums
const SCALEUP_NORMAL = 0;
const SCALEUP_PRESERVE = 1;
const SCALEUP_CONTROLNET = 2;
const SCALEUP_PRESERVE_CONTROLNET = 3;

var scaleUpPreserve = false;
var scaleUpControlNet = false;
var scaleUpSelection = SCALEUP_NORMAL;

function onScaleUpLabelClick(origRequest, image) {
  scaleUpSelection = (scaleUpSelection+1) % 4;
  scaleUpPreserve = scaleUpSelection==SCALEUP_PRESERVE || scaleUpSelection==SCALEUP_PRESERVE_CONTROLNET;
  scaleUpControlNet = scaleUpSelection==SCALEUP_CONTROLNET || scaleUpSelection==SCALEUP_PRESERVE_CONTROLNET;

  //SDXL doesn't support controlnet for img2img, so reset the counter for SDXL if controlnet was selected.
  if(scaleUpControlNet){
    var desiredModel=desiredModelName(origRequest);
    // if (isModelXl(desiredModel)) {
      // scaleUpPreserve = false;
      // scaleUpControlNet = false;
      // scaleUpSelection = SCALEUP_NORMAL;
    // }
  }
  //update current labels
  for (var index=0; index<document.getElementsByClassName("scaleup-label").length;index++) {
    document.getElementsByClassName("scaleup-label")[index].innerText=scaleupLabel(!scaleUpMAXFilter(origRequest, image));
  }
};

//________________________________________________________________________________________________________________________________________

function onScaleUpClick(origRequest, image) {
   scaleUpOnce(origRequest, image, true, scalingIncrease1) ;
}

function onScaleUpClick2(origRequest, image) {
  scaleUpOnce(origRequest, image, true, scalingIncrease2) ;
}


function scaleUpFilter(origRequest, image, scalingIncrease) {
  let result = false
  if (getHeight(origRequest, image)==getWidth(origRequest, image) ) { //if square image
    return getHeight(origRequest, image)<MaxSquareResolution;
  }
  else {      //check table for valid entries, otherwise disable button
      resTable.forEach(function(item){
      if (item[0]==getHeight(origRequest, image) && 
          item[1]==getWidth(origRequest, image))
          {
          return true;
          }
      })
  }
  //Additionally, allow additional scaling -- if not already at max, and if requested resolution doesn't equal what we already have, we should be OK.
  if (scaleUpMAXFilter(origRequest, image) && getHeight(origRequest, image)!=ScaleUpMax(getHeight(origRequest, image),scalingIncrease)
     && scalingIncrease<scaleUpMaxScalingRatio(origRequest, image) ) {
      result=true;
  }
  return result;
}
function onScaleUpFilter(origRequest, image) {
  // this is an optional function. return true/false to show/hide the button
  // if this function isn't set, the button will always be visible
  let result = scaleUpFilter(origRequest, image, scalingIncrease1);

   //Optional display of resolution
  if (result==true) {
    this.text = scaleUp(getWidth(origRequest, image), getHeight(origRequest, image), scalingIncrease1) + ' x ' +
      scaleUp(getHeight(origRequest, image), getWidth(origRequest, image), scalingIncrease1);
  }
  return result;
}

function onScaleUpFilter2(origRequest, image) {
  // this is an optional function. return true/false to show/hide the button
  // if this function isn't set, the button will always be visible
  let result = scaleUpFilter(origRequest, image, scalingIncrease2);

  var nextHeight=scaleUp(getWidth(origRequest, image), getHeight(origRequest, image), scalingIncrease2);
  //If we happen to be the same size as the other button (such as when at max square size, or if there's an overlap between the 
  //table and the calculated result), remove this button to ease confusing.
  if (nextHeight==scaleUp(getWidth(origRequest, image), getHeight(origRequest, image), scalingIncrease1)) {
    result=false;
  }

   //Optional display of resolution
  if (result==true) {
    this.text = nextHeight + ' x ' +
      scaleUp(getHeight(origRequest, image), getWidth(origRequest, image), scalingIncrease2);
  }
  
  return result;
}

function onScaleUpLabelFilter(origRequest, image) {
  let result=scaleUpFilter(origRequest, image) || scaleUpMAXFilter(origRequest, image);

  var text = scaleupLabel(!result);
  this.html = this.html.replace(/Scale Up.*:/,text);

  return true;
}
function scaleupLabel(atMaxRes) 
{
  var text;
  if (!scaleUpPreserve) {
    text = suLabel;
  }
  else {
    text = suLabel+' (preserve)';
  }
  if (scaleUpControlNet) {
    text = text+' (Controlnet)';
  }
  //At max resolution, we can no longer do the normal scaleup, but we can still split -- offer a reminder
  if (atMaxRes) {
    text += ' - Split 4x'
  }
  text += ':'; //Always end with a colon, as we search on that
  return text;
}
//________________________________________________________________________________________________________________________________________

const pixelChunkSize=8; //With older ED, used to have to use chunks of 64 pixels.
//Need a settings option to choose between these 2 options.
//Latent Upscaler still needs chunks of 64
function ScaleUp64(dimension, ratio) {
  return Math.round(((dimension*ratio)+32)/64)*64-64;
}
function ScaleUpMax(dimension, ratio) {
  if (ScaleUpSettings.use64PixelChunks) {
    return ScaleUp64(dimension, ratio);
  }
  return Math.round(((dimension*ratio)+pixelChunkSize/2)/pixelChunkSize)*pixelChunkSize-pixelChunkSize;
}

function onScaleUpMAXClick(origRequest, image) {
  var desiredModel=desiredModelName(origRequest);

  var isXl=false;
  var isTurbo=isModelTurbo(desiredModel, origRequest.use_lora_model);
  var isFlux = isModelFlux(desiredModel) || origRequest.guidance_scale==1;  //Flux can handle fewer steps

  var maxRes=maxTotalResolution;
  if (isModelXl(desiredModel)) {
    maxRes=maxTotalResolutionXL;
    isXl=true;
  }
  //image.naturalWidth & Height don't exist when called from "split click".  The *2 only makes sense when doing the split.
  const imageWidth = image.naturalWidth==0?origRequest.width:image.naturalWidth;
  const imageHeight = image.naturalHeight==0?origRequest.height:image.naturalHeight;
  //Only if using "split" and not using max split size, use a ratio of 1 to use current image size.
  var ratio=origRequest.scaleUpSplit ? ((ScaleUpSettings.useMaxSplitSize)? Math.min(2.5, maxRatio(maxRes,imageHeight,imageWidth)):2):   //for the tile split
    maxRatio(imageHeight,imageWidth);                                                                                       //for max size click
  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: scaleupRound(((origRequest.scaleUpSplit || isXl || isFlux)? (scaleUpPreserve ? 0.13 : 0.25):(scaleUpPreserve ? 0.15 : 0.3)) - (isFlux? reduceFluxPromptStrength:0)),  //Lower this number to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail

    //The rounding takes it to the nearest 64, which defines the resolutions available.  This will choose values that are not in the UI.
    width: ScaleUpMax(imageWidth,ratio),
    height: ScaleUpMax(imageHeight,ratio),
    //guidance_scale: Math.max(origRequest.guidance_scale,10), //Some suggest that higher guidance is desireable for img2img processing
    //num_inference_steps: (isTurbo)? 25 : Math.min(parseInt(origRequest.num_inference_steps) + 50, 80),  //large resolutions combined with large steps can cause an error
//    num_inference_steps: (isTurbo)?  (isFlux)? 15:22  :  (isFlux)? 33:75,  //large resolutions combined with large steps can cause an error
    num_inference_steps: stepsToUse(origRequest.num_inference_steps, isFlux, isTurbo, isXl),
    num_outputs: 1,
    use_vae_model: desiredVaeName(origRequest),
    use_text_encoder_model : desiredTextEncoderName(origRequest),

    //?use_upscale: 'None',
    //tiling: "none", //if doing scaleUpSplit, don't want to double-tile.
    //Using a new seed will allow some variation as it up-sizes; if results are not ideal, rerunning will give different results.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })

  //For the split, we need to know the ratio for stitching.
  newTaskRequest.reqBody.ScaleUpSplitRatio = ratio;

  //May want to delete the original controlnet, as it's normally not neccessary once scaling-up,
  //but it can be useful to carry-forward while scaling-up (such as to preserve fingers), so it's left as a user option.
  if (!ScaleUpSettings.reuseControlnet)
  {
    delete newTaskRequest.reqBody.use_controlnet_model;
    delete newTaskRequest.reqBody.control_filter_to_apply;
    delete newTaskRequest.reqBody.control_image;
  }
  //If using controlnet --SDXL now supported
  if (scaleUpControlNet /* && !isXl*/)
    {
    delete newTaskRequest.reqBody.control_filter_to_apply;
    //to avoid "halo" artifacts, need to soften the image before passing to control image.
  
    //create working canvas
    let canvasSoft = document.createElement("canvas");
    canvasSoft.width = image.naturalWidth; //*1.75;
    canvasSoft.height = image.naturalHeight; //*1.75;
    let ctx2 = canvasSoft.getContext("2d", {willReadFrequently: true});
    ctx2.filter = "blur(1.5px)"; // Adjust the blur radius 
    // get the image data of the canvasSoft  -- we only need the part we're going to resize
    //x,y -- upper-left, width & height
    ctx2.drawImage( image,
      0, 0, image.naturalWidth, image.naturalHeight, //source 
      0, 0, canvasSoft.width, canvasSoft.height //destination
    );
  //      sharpen(ctx2, canvasSoft.width, canvasSoft.height, .8, true);
  //  document.querySelector('body').appendChild(canvasSoft);   //Testing -- let's see what we have
      var img2 =  ctx2.getImageData(0, 0, canvasSoft.width, canvasSoft.height);
      ctx2.putImageData(img2, 0, 0);
      var newImage2 = new Image;
      newImage2.src = canvasSoft.toDataURL('image/png');
      newTaskRequest.reqBody.control_image = newImage2.src;
    //TODO: Only for SDXL, search for an appropriate model
    //let xlCnModel = "diffusers_xl_canny_full"; //default -- canny doesn't work that well
    // if (isXl)  {
        // if (inCnList("TTPLANET_Controlnet_Tile_realistic_v2_fp16")); 
        //document.getElementById('controlnet_model-model-list').getElementsByTagName("li"); -- can cycle through to find available models
    // }
    if(ScaleUpSettings.animeControlnet) {
      newTaskRequest.reqBody.control_filter_to_apply= 'lineart_anime'; //works better than the canny filter
      newTaskRequest.reqBody.use_controlnet_model = isFlux?"flux-canny-controlnet-v3.safetensors":(isXl? "diffusers_xl_canny_full":"control_v11p_sd15_canny");
    }
    else {
      //if (isFlux) {
      //  newTaskRequest.reqBody.control_filter_to_apply= 'canny'; //canny works better than lineart_anime for realistic.  Tile controlnet not yet available.
      //  newTaskRequest.reqBody.use_controlnet_model = "flux-canny-controlnet-v3.safetensors";
      //}
      //else {
      //Flux works fine with SDXL controlnet tile method (but not with XL canny)
        newTaskRequest.reqBody.use_controlnet_model = (isXl || isFlux)? "TTPLANET_Controlnet_Tile_realistic_v2_fp16":"control_v11f1e_sd15_tile";
      //}
      }
      newTaskRequest.reqBody.control_alpha = 0.3;
      newTaskRequest.reqBody.prompt_strength = scaleupRound((scaleUpPreserve ? 0.3 : (isXl? 0.45:0.5)) - (isFlux? reduceFluxPromptStrength:0));
    }







  newTaskRequest.seed = newTaskRequest.reqBody.seed
//  newTaskRequest.reqBody.sampler_name = 'ddim'  //ensure img2img sampler change is properly reflected in log file
  newTaskRequest.batchCount = 1  // assume user only wants one at a time to evaluate, if selecting one out of a batch
  newTaskRequest.numOutputsTotal = 1 // "
  //If you have a lower-end graphics card, the below will automatically disable turbo mode for larger images.
  //Each person needs to test with different resolutions to find the limit of their card when using Balanced or modes other than 'low'.
  if (newTaskRequest.reqBody.width * newTaskRequest.reqBody.height > maxTurboResolution) {  //put max normal resolution here
    //newTaskRequest.reqBody.turbo = false;
    newTaskRequest.reqBody.vram_usage_level = 'low';
  }

  //Grab the prompt from the user-input area instead of the original image.
  if (newTaskRequest.reqBody.prompt.substr(0,$("textarea#prompt").val().length)!=$("textarea#prompt").val()) {
    if (ScaleUpSettings.useChangedPrompt ) {
      newTaskRequest.reqBody.prompt=getPrompts()[0]; //promptField.value; //  $("textarea#prompt").val();
    };
  }

  if (newTaskRequest.reqBody.width*newTaskRequest.reqBody.height>maxNoVaeTiling) {
    newTaskRequest.reqBody.enable_vae_tiling = true; //Force vae tiling on, if image is large
  }

  delete newTaskRequest.reqBody.use_upscale; //if previously used upscaler, we don't want to automatically do it again, particularly combined with the larger resolution

  newTaskRequest.reqBody.use_stable_diffusion_model=desiredModel;

  //special case where you use Flux to do an initial generate, but want to use a smaller model for later generates
  if (ScaleUpSettings.useChangedModel ) {

    //Use the user's new guidance first, but if it doesn't match Flux/SDXL's requirements, then change as needed, below.
    newTaskRequest.reqBody.guidance_scale=parseFloat(guidanceScaleField.value); 


    // //This could use some tweaking.
    // //If old model (from image) is flux and new desired model is not
    // if (isModelFlux(desiredModelName(origRequest, true /* force using image prompt */)) && !isFlux /*calculated with UI prompt*/) {
    //   let guidance = parseFloat(guidanceScaleField.value); //$("#guidance_scale").val();
    //   //Change Guidance Scale of new image -- it's assumed that the flux run used <= 1.1
    //   //  If GuidanceScale in UI is still 1, change it to 6
    //   if (guidance <= 1.1) {
    //     newTaskRequest.reqBody.guidance_scale=6;
    //   }
    //   else {  //  If GuidanceScale in UI is >1.1, change it to the UI value
    //     newTaskRequest.reqBody.guidance_scale=guidance;
    //   }
    // }
    // // if switching to flux, force GS to 1
    // else if (!isModelFlux(desiredModelName(origRequest, true /* force using image prompt */)) && isFlux /*calculated with UI prompt*/) {
    //     newTaskRequest.reqBody.guidance_scale=1;
        
    // }
    //Because flux and SDXL have very different requirements for guidance, set it to the input in case it has changed.
    newTaskRequest.reqBody.guidance_scale=parseFloat(guidanceScaleField.value); 

    //Switch the sampler (and scheduler) at the same time, if switching to a new model.  Some Sampler/scheduler combinations don't work with Flux and vice-versa.
     newTaskRequest.reqBody.sampler_name = $("#sampler_name")[0].value;
     newTaskRequest.reqBody.scheduler_name = $("#scheduler_name")[0].value;

    const loras = JSON.parse($('#lora_model')[0].dataset.path);
    const selectedLoras = loras.modelNames;
    const selectedLoraWeights = loras.modelWeights;

    // Update the lora setting in the request
    if (selectedLoras.length === 1 && selectedLoras[0] != '') {
      newTaskRequest.reqBody.use_lora_model = selectedLoras[0];
    } else if (selectedLoras.length > 1) {
      newTaskRequest.reqBody.use_lora_model = selectedLoras;
    } else {
      delete newTaskRequest.reqBody.use_lora_model;
    }
    // Update the lora weight setting in the request
    if (selectedLoraWeights.length === 1 && selectedLoraWeights[0] != '') {
      newTaskRequest.reqBody.lora_alpha = selectedLoraWeights[0];
    } else if (selectedLoraWeights.length > 1) {
      newTaskRequest.reqBody.lora_alpha = selectedLoraWeights;
    } else {
      delete newTaskRequest.reqBody.lora_alpha;
    }
  }

  //Beta makes stronger changes, so reduce the prompt_strength to compensate
  if ( newTaskRequest.reqBody.scheduler_name == 'beta') {
    newTaskRequest.reqBody.prompt_strength = scaleupRound(newTaskRequest.reqBody.prompt_strength - .04);
  }

  delete newTaskRequest.reqBody.mask

  //resize the image before scaling back up, to maximize detail
  if(ScaleUpSettings.resizeImage) {
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = Math.round(imageWidth*1.25);
    canvas.height = Math.round(imageHeight*1.25);

    let ctx = canvas.getContext("2d");

    // get the image data of the canvas  -- we only need the part we're going to resize
    //x,y -- upper-left, width & height
    ctx.drawImage( image,
      0, 0, imageWidth, imageHeight, //source 
      0, 0, canvas.width, canvas.height //destination
    );

    //extra sharpening doesn't work well for Flux
    if (isFlux) {
      sharpen(ctx, canvas.width, canvas.height, .1);
    }
    else {
      sharpen(ctx, canvas.width, canvas.height, .33);
    }
    
    var img =  ctx.getImageData(0, 0, canvas.width, canvas.height);
    img = contrastImage(img, contrastAmount);
    ctx.putImageData(img, 0, 0);
    var newImage = new Image;
    newImage.src = canvas.toDataURL('image/png');
    newTaskRequest.reqBody.init_image = newImage.src;
  }
  

  createTask(newTaskRequest)
}

function scaleUpMaxScalingRatio(origRequest, image) {
  var scaleUpMaxRatio;
  var maxRes=maxTotalResolution;
  if (isModelXl(desiredModelName(origRequest))) { //$("#editor-settings #stable_diffusion_model").val())) {  //origRequest.use_stable_diffusion_model
    maxRes=maxTotalResolutionXL;
  }

  scaleUpMaxRatio=Math.sqrt(maxRes/(getHeight(origRequest, image)*getWidth(origRequest, image)));
  return scaleUpMaxRatio;
}

function scaleUpMAXFilter(origRequest, image) {
  let result = false;
  // var scaleUpMaxRatio;
  // var maxRes=maxTotalResolution;
  // if (isModelXl(desiredModelName(origRequest))) { //$("#editor-settings #stable_diffusion_model").val())) {  //origRequest.use_stable_diffusion_model
  //   maxRes=maxTotalResolutionXL;
  // }

  // scaleUpMaxRatio=Math.sqrt(maxRes/(getHeight(origRequest, image)*getWidth(origRequest, image)));
  if (ScaleUpMax(getHeight(origRequest, image), scaleUpMaxScalingRatio(origRequest, image)) > getHeight(origRequest, image)) {  //if we already matched the max resolution, we're done.
    result=true;
  }
  return result;
}
function onScaleUpMAXFilter(origRequest, image) {
  // this is an optional function. return true/false to show/hide the button
  // if this function isn't set, the button will always be visible
  let result = scaleUpMAXFilter(origRequest, image);
  
  //Optional display of resolution
  if (result==true) {
      this.text = ScaleUpMax(getWidth(origRequest, image), scaleUpMaxScalingRatio(origRequest, image)) + ' x ' +
      ScaleUpMax(getHeight(origRequest, image), scaleUpMaxScalingRatio(origRequest, image));
  }
  return result;
}
//________________________________________________________________________________________________________________________________________
//ESRGAN or Latent upscaler, preferably 2x
const delay = ms => new Promise(res => setTimeout(res, ms));

const asyncFunctionCall = async (origRequest, image, tools) => {
  //while the spinner tool is still visible, wait.
  while (!tools.spinner.classList.contains("displayNone"))
  {
    await delay(3000);
  }
  scaleUpOnce(origRequest, image, false) ;
};

function onScaleUp2xClick(origRequest, image, e, tools) {
  //first, run the latent 2x upscale.
  let path = upscaleModelField.value;
  let scale = 2;
  let filterName = path.toLowerCase().includes("realesrgan") ? "realesrgan" : "latent_upscaler";
  let statusText = "Upscaling by " + scale + "x using " + filterName;
  applyInlineFilter(filterName, path, { scale: scale }, image, statusText, tools)
 
  // poll until latent upscaler finishes

  asyncFunctionCall(origRequest, image, tools);
};

//Back in the days of SD 1.x, there was a benefit for increasing steps for larege img2img runs.
//SDXL and Flux don't seem to require as much of a boost. 
//Note that the "real" steps are reduced  by the prompt-strength, so  the actual steps run are fewer than it seems.
function stepsToUse(defaultSteps, isFlux, isTurbo, isXl) {
  let steps=parseInt(defaultSteps);
  if (isFlux) {  //need to test isFlux first
    if (isTurbo) {
      steps = Math.min(steps+10, 15);
    }
    else {
      steps = Math.min(steps+10, 33);
    }
  }
  else if (isXl) {
    if (isTurbo) {
      steps = Math.min(steps+10, 22);
    }
    else {
      steps = Math.min(steps+15, 50);
    }
  }
  else /* SD 1.x */ {
    //SD 1.x needs more steps to keep the quality up
    if (isTurbo) {
      steps = Math.min(steps+10, 25);
    }
    else {
      steps = Math.min(steps+20, 75);
    }
  }
  return steps;
}


function scaleUpOnce(origRequest, image, doScaleUp, scalingIncrease) {
  var desiredModel=desiredModelName(origRequest);

  var isXl=false;
  var isTurbo=isModelTurbo(desiredModel, origRequest.use_lora_model);
  var isFlux = isModelFlux(desiredModel) || origRequest.guidance_scale==1;  //Flux can handle fewer steps
  //var maxRes=maxTotalResolution;
  if (isModelXl(desiredModel)) {
    //maxRes=maxTotalResolutionXL;
    isXl=true;
  }

  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: scaleupRound(((origRequest.scaleUpSplit || isXl || isFlux)? (scaleUpPreserve ? 0.11 : 0.25):(scaleUpPreserve ? 0.15 : 0.33))
      + (doScaleUp?.05:0) - (isFlux? reduceFluxPromptStrength:0)), // + (ScaleUpSettings.resizeImage?.03:0), 
    //Lower prompt_strength to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail

    //This will choose values that are not in the UI.
    width: doScaleUp? scaleUp(image.naturalWidth, image.naturalHeight, scalingIncrease):image.naturalWidth,
    height: doScaleUp? scaleUp(image.naturalHeight, image.naturalWidth, scalingIncrease):image.naturalHeight,
    //guidance_scale: Math.max(origRequest.guidance_scale,10), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: stepsToUse(origRequest.num_inference_steps, isFlux, isTurbo, isXl),
//    num_inference_steps: (isTurbo)?  Math.min(parseInt(origRequest.num_inference_steps) + 15, (isFlux)? 15:22)
//      : Math.min(parseInt(origRequest.num_inference_steps) + ((isFlux)? 15:25), (isFlux)? 33:75),  //large resolutions combined with large steps can cause an error
    num_outputs: 1,
    use_vae_model: desiredVaeName(origRequest),
    use_text_encoder_model : desiredTextEncoderName(origRequest),
    //??use_upscale: 'None',
    //tiling: "none", //if doing scaleUpSplit, don't want to double-tile.
    //Using a new seed will allow some variation as it up-sizes; if results are not ideal, rerunning will give different results.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })

  //May want to delete the original controlnet, as it's normally not neccessary once scaling-up,
  //but it can be useful to carry-forward while scaling-up (such as to preserve fingers), so it's left as a user option.
  if (!ScaleUpSettings.reuseControlnet)
  {
    delete newTaskRequest.reqBody.use_controlnet_model;
    delete newTaskRequest.reqBody.control_filter_to_apply;
    delete newTaskRequest.reqBody.control_image;
  }
  //If using controlnet --SDXL now supported
  if (scaleUpControlNet /* && !isXl*/)
  {
    delete newTaskRequest.reqBody.control_filter_to_apply;

    //to avoid "halo" artifacts, need to soften the image before passing to control image.
  
    //create working canvas
    let canvasSoft = document.createElement("canvas");
    canvasSoft.width = image.naturalWidth; //*1.75;
    canvasSoft.height = image.naturalHeight; //*1.75;
    let ctx2 = canvasSoft.getContext("2d", {willReadFrequently: true});

    ctx2.filter = "blur(1.5px)"; // Adjust the blur radius 

    // get the image data of the canvasSoft  -- we only need the part we're going to resize
    //x,y -- upper-left, width & height
    ctx2.drawImage( image,
      0, 0, image.naturalWidth, image.naturalHeight, //source 
      0, 0, canvasSoft.width, canvasSoft.height //destination
    );
//      sharpen(ctx2, canvasSoft.width, canvasSoft.height, .8, true);
//  document.querySelector('body').appendChild(canvasSoft);   //Testing -- let's see what we have
    var img2 =  ctx2.getImageData(0, 0, canvasSoft.width, canvasSoft.height);
    ctx2.putImageData(img2, 0, 0);
    var newImage2 = new Image;
    newImage2.src = canvasSoft.toDataURL('image/png');
    newTaskRequest.reqBody.control_image = newImage2.src;

    //TODO: Only for SDXL, search for an appropriate model
    //let xlCnModel = "diffusers_xl_canny_full"; //default -- canny doesn't work that well
    // if (isXl)  {
        // if (inCnList("TTPLANET_Controlnet_Tile_realistic_v2_fp16")); 
        //document.getElementById('controlnet_model-model-list').getElementsByTagName("li"); -- can cycle through to find available models
    // }
    if(ScaleUpSettings.animeControlnet) {
      newTaskRequest.reqBody.control_filter_to_apply= 'lineart_anime'; //works better than the canny filter
      newTaskRequest.reqBody.use_controlnet_model = isFlux?"flux-canny-controlnet-v3.safetensors":(isXl? "diffusers_xl_canny_full":"control_v11p_sd15_canny");
    }
    else {
      //Flux can also use SDXL Tile.
      newTaskRequest.reqBody.use_controlnet_model = (isXl || isFlux)? "TTPLANET_Controlnet_Tile_realistic_v2_fp16":"control_v11f1e_sd15_tile";
    }
    newTaskRequest.reqBody.control_alpha = 0.3;
    newTaskRequest.reqBody.prompt_strength = scaleupRound((scaleUpPreserve ? 0.3 : ((isXl || isFlux)? 0.45:0.5)) - (isFlux?reduceFluxPromptStrength:0));
  }

  newTaskRequest.seed = newTaskRequest.reqBody.seed
//  newTaskRequest.reqBody.sampler_name = 'ddim'  //ensure img2img sampler change is properly reflected in log file
  newTaskRequest.batchCount = 1  // assume user only wants one at a time to evaluate, if selecting one out of a batch
  newTaskRequest.numOutputsTotal = 1 // "
  //If you have a lower-end graphics card, the below will automatically disable turbo mode for larger images.
  //Each person needs to test with different resolutions to find the limit of their card when using Balanced or modes other than 'low'.
  if (newTaskRequest.reqBody.width * newTaskRequest.reqBody.height > maxTurboResolution) {  //put max normal resolution here
    //Disable anything that takes up VRAM here
    //newTaskRequest.reqBody.turbo = false;
    newTaskRequest.reqBody.vram_usage_level = 'low';
  }

  if (newTaskRequest.reqBody.width*newTaskRequest.reqBody.height>maxNoVaeTiling) {
    newTaskRequest.reqBody.enable_vae_tiling = true; //Force vae tiling on, if image is large
  }

  delete newTaskRequest.reqBody.use_upscale; //if previously used upscaler, we don't want to automatically do it again, particularly combined with the larger resolution

  newTaskRequest.reqBody.use_stable_diffusion_model=desiredModel;

  //Grab the prompt from the user-input area instead of the original image.
  if (newTaskRequest.reqBody.prompt.substr(0,$("textarea#prompt").val().length)!=$("textarea#prompt").val()) {
    if (ScaleUpSettings.useChangedPrompt ) {
      newTaskRequest.reqBody.prompt=getPrompts()[0]; //promptField.value; //  $("textarea#prompt").val();
      

    };
  }

  //special case where you use Flux to do an initial generate, but want to use a smaller model for later generates
  if (ScaleUpSettings.useChangedModel ) {

    //Use the user's new guidance first, but if it doesn't match Flux/SDXL's requirements, then change as needed, below.
    newTaskRequest.reqBody.guidance_scale=parseFloat(guidanceScaleField.value); 


    //If old model (from image) is flux and new desired model is not
    if (isModelFlux(desiredModelName(origRequest, true /* force using image prompt */)) && !isFlux /*calculated with UI prompt*/) {
      let guidance = parseFloat(guidanceScaleField.value); //$("#guidance_scale").val();
      //Change Guidance Scale of new image -- it's assumed that the flux run used <= 1.1
      //  If GuidanceScale in UI is still 1, change it to 6
      if (guidance <= 1.1) {
        newTaskRequest.reqBody.guidance_scale=6;
      }
      else {  //  If GuidanceScale in UI is >1.1, change it to the UI value
        newTaskRequest.reqBody.guidance_scale=guidance;
      }
    }
    // if switching to flux, force GS to 1
    else if (!isModelFlux(desiredModelName(origRequest, true /* force using image prompt */)) && isFlux /*calculated with UI prompt*/) {
        newTaskRequest.reqBody.guidance_scale=1;
        
    }
    //Switch the sampler (and scheduler) at the same time, if switching to a new model.  Some Sampler/scheduler combinations don't work with Flux and vice-versa.

     newTaskRequest.reqBody.sampler_name = $("#sampler_name")[0].value;
     newTaskRequest.reqBody.scheduler_name = $("#scheduler_name")[0].value;

     /*
    // Update lora settings if any are selected
    const loraElements = document.querySelectorAll('#editor-settings [id^="lora_"] .model_name');
    const selectedLoras = [];
    
    loraElements.forEach(element => {
      if (element.dataset.path) {
        selectedLoras.push(element.dataset.path);
      }
    });
    
    // Update the lora setting in the request
    if (selectedLoras.length === 1 && selectedLoras[0] != '') {
      newTaskRequest.reqBody.use_lora_model = selectedLoras[0];
    } else if (selectedLoras.length > 1) {
      newTaskRequest.reqBody.use_lora_model = selectedLoras;
    } else {
      delete newTaskRequest.reqBody.use_lora_model;
    }
    
    //also need to update lora_alpha the same way
    const loraElementWeights = document.querySelectorAll('#editor-settings [id^="lora_"] .model_name');
    const selectedLoraWeights = [];
    
    loraElementWeights.forEach(element => {
      if (element.dataset.path) {
        selectedLoraWeights.push(element.dataset.path);
      }
    });
    
    // Update the lora setting in the request
    if (selectedLoraWeights.length === 1 && selectedLoraWeights[0] != '') {
      newTaskRequest.reqBody.lora_alpha = selectedLoraWeights[0];
    } else if (selectedLoraWeights.length > 1) {
      newTaskRequest.reqBody.lora_alpha = selectedLoraWeights;
    } else {
      delete newTaskRequest.reqBody.lora_alpha;
    }
      */
    const loras = JSON.parse($('#lora_model')[0].dataset.path);
    const selectedLoras = loras.modelNames;
    const selectedLoraWeights = loras.modelWeights;

    // Update the lora setting in the request
    if (selectedLoras.length === 1 && selectedLoras[0] != '') {
      newTaskRequest.reqBody.use_lora_model = selectedLoras[0];
    } else if (selectedLoras.length > 1) {
      newTaskRequest.reqBody.use_lora_model = selectedLoras;
    } else {
      delete newTaskRequest.reqBody.use_lora_model;
    }
    // Update the lora weight setting in the request
    if (selectedLoraWeights.length === 1 && selectedLoraWeights[0] != '') {
      newTaskRequest.reqBody.lora_alpha = selectedLoraWeights[0];
    } else if (selectedLoraWeights.length > 1) {
      newTaskRequest.reqBody.lora_alpha = selectedLoraWeights;
    } else {
      delete newTaskRequest.reqBody.lora_alpha;
    }

  }


  //Beta makes stronger changes, so reduce the prompt_strength to compensate
  if ( newTaskRequest.reqBody.scheduler_name == 'beta') {
    newTaskRequest.reqBody.prompt_strength = scaleupRound(newTaskRequest.reqBody.prompt_strength - .04);
  }

  delete newTaskRequest.reqBody.mask

  //resize the image before scaling back up, to maximize detail
  if(ScaleUpSettings.resizeImage) {
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth*1.25);
    canvas.height = Math.round(image.naturalHeight*1.25);

    let ctx = canvas.getContext("2d", {willReadFrequently: true});

    // get the image data of the canvas  -- we only need the part we're going to resize
    //x,y -- upper-left, width & height
    ctx.drawImage( image,
      0, 0, image.naturalWidth, image.naturalHeight, //source 
      0, 0, canvas.width, canvas.height //destination
    );

    //extra sharpening not necessarily needed with controlnet
    //if (!scaleUpControlNet) { }
    //extra sharpening doesn't work well for Flux
    if (isFlux) {
      sharpen(ctx, canvas.width, canvas.height, .1);
    }
    else {
      sharpen(ctx, canvas.width, canvas.height, .33);
    }
    
    var img =  ctx.getImageData(0, 0, canvas.width, canvas.height);
    img = contrastImage(img, contrastAmount);
    ctx.putImageData(img, 0, 0);

    var newImage = new Image;
    newImage.src = canvas.toDataURL('image/png');
   
    newTaskRequest.reqBody.init_image = newImage.src;
  }

  createTask(newTaskRequest)
}

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

function onScaleUp2xFilter(origRequest, image) {
  // this is an optional function. return true/false to show/hide the button
  // if this function isn't set, the button will always be visible

  //If resolution too large for latent upscaler, don't display
  if (getWidth(origRequest, image) * getHeight(origRequest, image) > maxLatentUpscaler)
    return false;

  //If already at max res, do not display.
  let result = scaleUpMAXFilter(origRequest, image);
  
  return result;
}

//________________________________________________________________________________________________________________________________________

const splitOverlap = 64;  //This can be modified by increments/decrements of 64, as desired

function  onScaleUpSplitClick(origRequest, image) {

//split original image into 4 overlapping pieces
//For each split piece, run ScaleUp MAX
//In a perfect world, merge together and display locally -- for now, leave it as an external process

let newTaskRequest = getCurrentUserRequest();
newTaskRequest.reqBody = Object.assign({}, origRequest, {})

//create working canvas
let canvas = document.createElement("canvas");
canvas.width = Math.floor(image.naturalWidth/2)+splitOverlap;
canvas.height = Math.floor(image.naturalHeight/2)+splitOverlap;

newTaskRequest.reqBody.width=canvas.width;
newTaskRequest.reqBody.height = canvas.height;

newTaskRequest.reqBody.scaleUpSplit=true;

let ctx = canvas.getContext("2d");

// get the image data of the canvas  -- we only need the part we're going to resize
//x,y -- upper-left, width & height
ctx.drawImage( image,
  0, 0, canvas.width, canvas.height, //source 
  0, 0, canvas.width, canvas.height //destination
);
//var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);  
var newImage = new Image;
newImage.onload = function(){onScaleUpMAXClick(newTaskRequest.reqBody, newImage);}
newImage.src = canvas.toDataURL('image/png');

//lower left
ctx.drawImage( image,
  0, canvas.height-splitOverlap*2, canvas.width, canvas.height, //source 
  0, 0, canvas.width, canvas.height //destination
);
//imageData = ctx.getImageData(0,canvas.width-splitOverlap*2, canvas.width, canvas.height); //upper-right
var newImage2 = new Image;
newImage2.onload = function(){onScaleUpMAXClick(newTaskRequest.reqBody, newImage2);}
newImage2.src = canvas.toDataURL('image/png');

//upper-right
ctx.drawImage( image,
  canvas.width-splitOverlap*2, 0, canvas.width, canvas.height, //source 
  0, 0, canvas.width, canvas.height //destination
);
//imageData = ctx.getImageData(canvas.height-splitOverlap*2, 0, canvas.width, canvas.height);  //x,y -- lower-r, width & height
var newImage3 = new Image;
newImage3.onload = function(){onScaleUpMAXClick(newTaskRequest.reqBody, newImage3);}
newImage3.src = canvas.toDataURL('image/png');

//lower right
ctx.drawImage( image,
  canvas.width-splitOverlap*2,  canvas.height-splitOverlap*2, canvas.width, canvas.height, //source 
  0, 0, canvas.width, canvas.height //destination
);
//imageData = ctx.getImageData(canvas.height-splitOverlap*2, 0, canvas.width, canvas.height);  //x,y -- lower-r, width & height
var newImage4 = new Image;
newImage4.onload = function(){onScaleUpMAXClick(newTaskRequest.reqBody, newImage4);}
newImage4.src = canvas.toDataURL('image/png');

}

function  onScaleUpSplitFilter(origRequest, image) {
  if (Math.min(getWidth(origRequest, image),getHeight(origRequest, image))>=768)
  {
    return true;
  }
  else
    return false;
}
//________________________________________________________________________________________________________________________________________

const numScaleUps = 3;
function onScaleUpMultiClick(origRequest, image) {
  if (origRequest.MultiScaleUpCount == undefined) {
    origRequest.MultiScaleUpCount = numScaleUps-1;
    scaleUpOnce(origRequest, image, true, scalingIncrease1) ;
    delete origRequest.MultiScaleUpCount;  //remove embedded count so that we can have a fresh start with this image
  }
}

function  onScaleUpMultiFilter(origRequest, image) {
  let scale = (origRequest.MultiScaleUpCount==1)?scalingIncrease2:scalingIncrease1;  //Make the final size-up larger
  //If we've reached the max (with the scaling increase), stop processing
  if (!scaleUpFilter(origRequest, image, scale)) {
    delete origRequest.MultiScaleUpCount; //needed?
    return false;
  }

  //If we're here, we must have just finished a generation.  If doing multi-scaleup, trigger the next one.
  if (origRequest.MultiScaleUpCount != undefined && origRequest.MultiScaleUpCount>0) {
    origRequest.MultiScaleUpCount--;
    image.onload = function(){
      scaleUpOnce(origRequest, image, true, scale);
      delete origRequest.MultiScaleUpCount;  //remove embedded count so that we can have a fresh start with this image
    }
  }

  return true;
}

//________________________________________________________________________________________________________________________________________
function onCombineSplitClick(origRequest, image) {
  // Find all images from the same split operation
  const images = findSplitImages(image, false);
  if (images.length !== 4) {
    alert('Could not find all 4 split images. Make sure all images from the split operation are still visible.');
    return;
  }

  // Create canvas for combined image
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Calculate dimensions
  const pieceWidth = image.naturalWidth; //images[0].naturalWidth;
  const pieceHeight = image.naturalHeight; //images[0].naturalHeight;
  
  var ratio=2;
  if (origRequest.ScaleUpSplitRatio != undefined) {
    ratio = origRequest.ScaleUpSplitRatio;
  }
  
  const overlap = splitOverlap*2;

  // Set canvas size to accommodate all pieces
  canvas.width = pieceWidth * 2 - overlap * ratio;
  canvas.height = pieceHeight * 2 - overlap * ratio;

  // Draw each piece in its position
  // Upper left
  ctx.drawImage(images[0], 0, 0);
  
  // Lower left - blend with upper left
  ctx.globalCompositeOperation = 'source-over';
  // Draw only the non-overlapping part first
  ctx.globalAlpha = 1;
  ctx.drawImage(images[1], 0, overlap*ratio /*pieceHeight*/, pieceWidth, pieceHeight - overlap*ratio, 0, pieceHeight, pieceWidth, pieceHeight - overlap*ratio);
  // Then blend the overlap region
  for (let y = 0; y < overlap*ratio; y++) {
    const alpha = parseFloat(y) / parseFloat(overlap*ratio); // Ensure floating point division
    ctx.globalAlpha = alpha; //scaleupRound(alpha); // Use our rounding function
    ctx.drawImage(images[1], 0, y, pieceWidth, 1, 0, pieceHeight - overlap*ratio + y, pieceWidth, 1);
  }
  ctx.globalAlpha = 1;
  
  // Upper right - blend with upper left
  ctx.globalCompositeOperation = 'source-over';
  // Draw only the non-overlapping part first
  ctx.globalAlpha = 1;
  ctx.drawImage(images[2], overlap*ratio /*pieceWidth*/, 0, pieceWidth - overlap*ratio, pieceHeight, pieceWidth, 0, pieceWidth - overlap*ratio, pieceHeight);
  // Then blend the overlap region
  for (let x = 0; x < overlap*ratio; x++) {
    const alpha = parseFloat(x) / parseFloat(overlap*ratio); // Ensure floating point division
    ctx.globalAlpha = alpha; //scaleupRound(alpha); // Use our rounding function
    ctx.drawImage(images[2], x, 0, 1, pieceHeight, pieceWidth - overlap*ratio + x, 0, 1, pieceHeight);
  }
  ctx.globalAlpha = 1;
  
  // Lower right - blend with all three
  ctx.globalCompositeOperation = 'source-over';
  // Draw only the non-overlapping part first
  ctx.globalAlpha = 1;
  ctx.drawImage(images[3], overlap*ratio /*pieceWidth*/, overlap*ratio /*pieceHeight*/, pieceWidth - overlap*ratio, pieceHeight - overlap*ratio, 
               pieceWidth, pieceHeight, pieceWidth - overlap*ratio, pieceHeight - overlap*ratio);
  // This only does the center "corner"
  for (let y = 0; y < overlap*ratio; y++) {
    for (let x = 0; x < overlap*ratio; x++) {
      const alphaY = parseFloat(y) / parseFloat(overlap*ratio); // Ensure floating point division
      const alphaX = parseFloat(x) / parseFloat(overlap*ratio); // Ensure floating point division
      ctx.globalAlpha = Math.min(alphaX, alphaY); //scaleupRound(Math.min(alphaX, alphaY)); // Use our rounding function
      ctx.drawImage(images[3], x, y, 1, 1, pieceWidth - overlap*ratio + x, pieceHeight - overlap*ratio + y, 1, 1);
    }
  }
  // Blend the remaining overlap region from top to bottom
  for (let y = 0; y < overlap*ratio; y++) {
    const alpha = parseFloat(y) / parseFloat(overlap*ratio); // Ensure floating point division
    ctx.globalAlpha = alpha; // scaleupRound(alpha); // Use our rounding function
    ctx.drawImage(images[3], overlap*ratio, y, pieceWidth - (overlap*ratio), 1, pieceWidth, pieceHeight - overlap*ratio + y, pieceWidth - (overlap*ratio), 1);
  }
  // Blend the remaining overlap region from left to right
  for (let x = 0; x < overlap*ratio; x++) {
    const alpha = parseFloat(x) / parseFloat(overlap*ratio); // Ensure floating point division
    ctx.globalAlpha = alpha; //scaleupRound(alpha); // Use our rounding function
    ctx.drawImage(images[3], x, overlap*ratio, 1, pieceHeight - (overlap*ratio), pieceWidth - overlap*ratio + x, pieceHeight, 1, pieceHeight - (overlap*ratio));
  }
  ctx.globalAlpha = 1;

  // Reset composite operation
  ctx.globalCompositeOperation = 'source-over';

  // Create new image from canvas
  const combinedImage = new Image();
  combinedImage.src = canvas.toDataURL('image/png');

  // Create a temporary link element to trigger download
  const link = document.createElement('a');
  link.href = combinedImage.src;
  
  let underscoreName = origRequest.prompt.replace(/[^a-zA-Z0-9]/g, "_");
  underscoreName = underscoreName.substring(0, 50);

  // name and the top level metadata
  link.download = underscoreName + '-combined-split-'+ new Date().getTime() + '.png';
  //link.download = //'combined-split-' + new Date().getTime() + '.png';
  
  // Add link to DOM temporarily
  document.body.appendChild(link);
  
  // Trigger download
  link.click();
  
  // Clean up
  document.body.removeChild(link);
}

function onCombineSplitFilter(origRequest, image) {
  // Only show button if we can find split images
  const images = findSplitImages(image, true);
  return images.length === 4;
}

function findSplitImages(image, filter) {
  // Get all image containers
  const containers = document.querySelectorAll('[id^="imageTaskContainer-"]');
  const images = [];

  // Get the seed and timestamp of the selected image
  const selectedContainer = image.closest('[id^="imageTaskContainer-"]');
  const selectedTimestamp = parseInt(selectedContainer.id.split('-')[1]);
  const selectedSeed = selectedContainer.querySelector('.seed-value')?.textContent;

  // Find images that were generated close together in time
  const timestamps = Array.from(containers).map(container => {
    const timestamp = parseInt(container.id.split('-')[1]);
    return { container, timestamp };
  }).sort((a, b) => a.timestamp - b.timestamp);

  // Look for groups of 4 images generated within 5 seconds of each other
  for (let i = 0; i < timestamps.length - 3; i++) {
    const group = timestamps.slice(i, i + 4);
    if (group[3].timestamp - group[0].timestamp < 5000) {
      // Found a potential group, check if they have similar dimensions
      const groupImages = group.map(g => {
        // Get all images in the container and select the last one (full-size image)
        const imgs = g.container.querySelectorAll('img');
        return (filter) ? imgs[1] : imgs[imgs.length - 1]; // Last image is the full-size one
      });
      
      // Check if the selected image is in this group
      const selectedImageInGroup = group.some(g => 
        g.timestamp === selectedTimestamp && 
        g.container.querySelector('.seed-value')?.textContent === selectedSeed
      );

      if (selectedImageInGroup && groupImages.every(img => img && 
          Math.abs(img.naturalWidth - groupImages[0].naturalWidth) < 10 &&
          Math.abs(img.naturalHeight - groupImages[0].naturalHeight) < 10)) {
        images.push(...groupImages);
        break;
      }
    }
  }

  return images;
}
//________________________________________________________________________________________________________________________________________

  //UI insertion adapted from Rabbit Hole plugin
  function setup() {
    //add new UI panel to left sidebar
    var outpaintSettings = document.createElement('div');
    outpaintSettings.id = 'scaleup-settings';
    outpaintSettings.classList.add('settings-box');
    outpaintSettings.classList.add('panel-box');
    let tempHTML =  
        `<h4 class="collapsible">Scale Up Settings
          <i id="reset-scaleup-settings" class="fa-solid fa-arrow-rotate-left section-button">
          <span class="simple-tooltip top-left">
          Reset Scale Up Settings
          </span>
          </i>
        </h4>
        <div id="scaleup-settings-entries" class="collapsible-content" style="display: block;margin-top:15px;">
        <div><ul style="padding-left:0px">
          <li><b class="settings-subheader">ScaleUp Settings</b></li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_64pixel_chunks" name="scaleup_64pixel_chunks" type="checkbox" value="`+ScaleUpSettings.use64PixelChunks+`"  onchange="setScaleUpSettings()"> <label for="scaleup_64pixel_chunks"></label>
          </div>
          <label for="scaleup_64pixel_chunks">Use 64 pixel chunks<small>(for compatibility with Latent Upscaler 2X, less accuracy)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_change_model" name="scaleup_change_model" type="checkbox" value="`+ScaleUpSettings.useChangedModel+`"  onchange="setScaleUpSettings()"> <label for="scaleup_change_model"></label>
          </div>
          <label for="scaleup_change_model">Use model selected above <small>(not the original model) Also changes guidance, sampler, and scheduler</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_change_prompt" name="scaleup_change_prompt" type="checkbox" value="`+ScaleUpSettings.useChangedPrompt+`"  onchange="setScaleUpSettings()"> <label for="scaleup_change_prompt"></label>
          </div>
          <label for="scaleup_change_prompt">Use new prompt, above <small>(not the original prompt)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_split_size" name="scaleup_split_size" type="checkbox" value="`+ScaleUpSettings.useMaxSplitSize+`"  onchange="setScaleUpSettings()"> <label for="scaleup_split_size"></label>
          </div>
          <label for="scaleup_split_size">Use larger image size for all 4 split (tiled) images <small>(else, use current size x4)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_resize_sharpen" name="scaleup_resize_sharpen" type="checkbox" value="`+ScaleUpSettings.resizeImage+`"  onchange="setScaleUpSettings()"> <label for="scaleup_resize_sharpen"></label>
          </div>
          <label for="scaleup_resize_sharpen">Enhance Details <small>(Resize & sharpen image before ScaleUp)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_reuse_controlnet" name="scaleup_reuse_controlnet" type="checkbox" value="`+ScaleUpSettings.reuseControlnet+`"  onchange="setScaleUpSettings()"> <label for="scaleup_reuse_controlnet"></label>
          </div>
          <label for="scaleup_reuse_controlnet">Reuse controlnet <small>(if existing and if not using ScaleUp's controlnet)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_animeControlnet" name="scaleup_animeControlnet" type="checkbox" value="`+ScaleUpSettings.animeControlnet+`"  onchange="setScaleUpSettings()"> <label for="scaleup_animeControlnet"></label>
          </div>
          <label for="scaleup_animeControlnet">Use Canny/lineart for controlnet, not Tile<small> (better for Anime)</small></label>
          </li>
        </ul></div>
        </div>`;
    outpaintSettings.innerHTML = tempHTML;
    var editorSettings = document.getElementById('editor-settings');
    editorSettings.parentNode.insertBefore(outpaintSettings, editorSettings.nextSibling);
    createCollapsibles(outpaintSettings);

    const icon = document.getElementById('reset-scaleup-settings');
    icon.addEventListener('click', scaleUpResetSettings);

    //Ensure switches match the settings (for the initial values), since "value=" in above HTML may not work.  But more importantly, we now load settings from storage.
    scaleUpResetSettings(null);
  }
  setup();

})();


function setScaleUpSettings() {
  ScaleUpSettings.use64PixelChunks = scaleup_64pixel_chunks.checked;
  ScaleUpSettings.useChangedPrompt = scaleup_change_prompt.checked;
  ScaleUpSettings.useChangedModel = scaleup_change_model.checked;
  ScaleUpSettings.useMaxSplitSize = scaleup_split_size.checked;
  ScaleUpSettings.resizeImage = scaleup_resize_sharpen.checked;
  ScaleUpSettings.reuseControlnet = scaleup_reuse_controlnet.checked;
  ScaleUpSettings.animeControlnet = scaleup_animeControlnet.checked;

  localStorage.setItem('ScaleUp_Plugin_Settings', JSON.stringify(ScaleUpSettings));  //Store settings
}

//Sets the default values for the settings.
//If reset=pointerevent, then we came from the reset click -- reset to absolute defaults
//if reset=null, just reload from saved settings
//Could manually remove/reset settings using:  localStorage.removeItem('ScaleUp_Plugin_Settings')
function scaleUpResetSettings(reset) {

  let settings = JSON.parse(localStorage.getItem('ScaleUp_Plugin_Settings'));
  if (settings == null || reset !=null) {  //if settings not found, just set everything
    ScaleUpSettings.use64PixelChunks = false;
    ScaleUpSettings.useChangedPrompt = false;
    ScaleUpSettings.useChangedModel = false;
    ScaleUpSettings.useMaxSplitSize = true;
    ScaleUpSettings.resizeImage = true;
    ScaleUpSettings.reuseControlnet = true;
    ScaleUpSettings.animeControlnet = false;

    //useControlNet = false;
  }
  else {  //if settings found, but we've added a new setting, use a default value instead.  (Not strictly necessary for this first group.)
    ScaleUpSettings.use64PixelChunks =settings.use64PixelChunks ?? false;
    ScaleUpSettings.useChangedPrompt =settings.useChangedPrompt ?? false;
    ScaleUpSettings.useChangedModel =settings.useChangedModel ?? false;
    ScaleUpSettings.useMaxSplitSize =settings.useMaxSplitSize ?? true;
    ScaleUpSettings.resizeImage =settings.resizeImage ?? true;
    ScaleUpSettings.reuseControlnet =settings.reuseControlnet ?? false;
    ScaleUpSettings.animeControlnet =settings.animeControlnet ?? false;
    }
  localStorage.setItem('ScaleUp_Plugin_Settings', JSON.stringify(ScaleUpSettings));  //Store settings

  //set the input fields
  scaleup_64pixel_chunks.checked = ScaleUpSettings.use64PixelChunks;
  scaleup_change_prompt.checked = ScaleUpSettings.useChangedPrompt;
  scaleup_change_model.checked = ScaleUpSettings.useChangedModel;
  scaleup_split_size.checked = ScaleUpSettings.useMaxSplitSize;
  scaleup_resize_sharpen.checked = ScaleUpSettings.resizeImage;
  scaleup_reuse_controlnet.checked = ScaleUpSettings.reuseControlnet;
  scaleup_animeControlnet.checked = ScaleUpSettings.animeControlnet;
}


