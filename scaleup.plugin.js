/**
 * Scale Up
 * v.2.8.2, last updated: 3/19/2024
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
  resizeImage: true
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
//At larger image resolutions, the rounding to 8-pixels will be less apparent, an the formula will take over.
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
  [1024,576,1280],  //1.78   exact (nonstandard, not 64)
  [576,1024,720],  //1.78 
  [1280,720,1408],  //1.78   exact (nonstandard, not 64)
  [720,1280,792],  //1.78 
  [1408,792,1536],  //1.78   exact (nonstandard, not 64)
  [792,1408,864],  //1.78 
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
  if (modelName.search(/turbo/i)>=0 || modelName.search(/lightning/i)>=0) {
    return true;
  }
  //if any of the Loras contains "lcm", assume turbo lora -- fewer steps needed
  if (loraList != undefined) {
    if (loraList[0].length>1) { //it's an array of strings >1
      if (loraList.some(element => element.search(/lcm/i)>=0) )
          return true;
    }
    else {  //it's a string
      if (loraList.search(/lcm/i)>=0)
      return true;
    }
  }
  return false;
}

//Model needs to have "xl" in the filename to be recognized as an xl model.
function isModelXl(modelName) {
  let result = false;
  if (modelName.search(/xl/i)>=0) {
    result = true;
  }  
  return result;
}

function desiredModelName(origRequest) {
  //Grab the model name from the user-input area instead of the original image.
  if (ScaleUpSettings.useChangedModel) {
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
  { html: '<i class="fa-solid fa-th-large"></i>', on_click: onScaleUpSplitClick, filter: onScaleUpSplitFilter  }
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
    if (isModelXl(desiredModel)) {
      scaleUpPreserve = false;
      scaleUpControlNet = false;
      scaleUpSelection = SCALEUP_NORMAL;
    }
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

// function onScaleUpClick(origRequest, image) {
//   var desiredModel=desiredModelName(origRequest);

// //  //Grab the model name from the user-input area instead of the original image.
// //  if (ScaleUpSettings.useChangedModel) {
// //    desiredModel=$("#editor-settings #stable_diffusion_model")[0].dataset.path; 
// //    // grab the VAE too?
// //  }
// //  else {
// //    desiredModel=origRequest.use_stable_diffusion_model; //for the original model
// //  }

//   var isXl=isModelXl(desiredModel);
//   var isTurbo=isModelTurbo(desiredModel);
//   let newTaskRequest = getCurrentUserRequest();
//   newTaskRequest.reqBody = Object.assign({}, origRequest, {
//     init_image: image.src,
//     prompt_strength: (isXl)? (scaleUpPreserve ? 0.10 : 0.25):(scaleUpPreserve ? 0.15 : 0.35),  //Lower this number to make results closer to the original
//     // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
//     // - 0.15 sticks pretty close to the original, adding detail
//     // Lower amounts used for SDXL, as it seems more sensitive to changes, especially the refiner model.
//     width: scaleUp(image.naturalWidth, image.naturalHeight),
//     height: scaleUp(image.naturalHeight, image.naturalWidth),
//     //guidance_scale: Math.max(origRequest.guidance_scale,15), //Some suggest that higher guidance is desireable for img2img processing
//     num_inference_steps: (isTurbo)? 30 : Math.min(parseInt(origRequest.num_inference_steps) + 25, 80),  //large resolutions combined with large steps can cause an error
//     num_outputs: 1,
//     use_vae_model: desiredVaeName(origRequest),
//     //??use_upscale: 'None',
//     //Using a new seed will allow some variation as it up-sizes.
//     seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
//   })

//   //if using controlnet
//   if (scaleUpControlNet && !isXl)
//   {
//     newTaskRequest.reqBody.control_image = image.src;
//     newTaskRequest.reqBody.use_controlnet_model = isXl? "diffusers_xl_canny_full":"control_v11f1e_sd15_tile";
//     newTaskRequest.reqBody.prompt_strength = scaleUpPreserve ? 0.3 : 0.5;
//   }

//   newTaskRequest.seed = newTaskRequest.reqBody.seed
//   //newTaskRequest.reqBody.sampler_name = 'ddim'  //ensure img2img sampler change is properly reflected in log file
//   newTaskRequest.batchCount = 1  // assume user only wants one at a time to evaluate, if selecting one out of a batch
//   newTaskRequest.numOutputsTotal = 1 // "
//   //If you have a lower-end graphics card, the below will automatically disable memory-intensive options for larger images.
//   //Each person needs to test with different resolutions to find the limit of their card when using balanced (formerly, "turbo") mode.
//   if (newTaskRequest.reqBody.width * newTaskRequest.reqBody.height > maxTurboResolution) {  //max normal resolution
//     //Disable anything that takes up VRAM here
//     newTaskRequest.reqBody.vram_usage_level = 'low';
//     //delete newTaskRequest.reqBody.hypernetwork_strength;
//     //delete newTaskRequest.reqBody.use_hypernetwork_model;
//   }
//   if (newTaskRequest.reqBody.width*newTaskRequest.reqBody.height>maxNoVaeTiling) {
//     newTaskRequest.reqBody.enable_vae_tiling = true; //Force vae tiling on, if image is large
//   }
//   delete newTaskRequest.reqBody.use_upscale; //if previously used upscaler, we don't want to automatically do it again, particularly combined with the larger resolution

//   newTaskRequest.reqBody.use_stable_diffusion_model=desiredModel;
  
//   //Grab the prompt from the user-input area instead of the original image.
//   if (newTaskRequest.reqBody.prompt.substr(0,$("textarea#prompt").val().length)!=$("textarea#prompt").val()) {
//     if (ScaleUpSettings.useChangedPrompt ) {
//       newTaskRequest.reqBody.prompt=getPrompts()[0]; //promptField.value; //  $("textarea#prompt").val();
//     };
//   }


//   delete newTaskRequest.reqBody.mask
//   createTask(newTaskRequest)
// }

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
  var maxRes=maxTotalResolution;
  if (isModelXl(desiredModel)) {
    maxRes=maxTotalResolutionXL;
    isXl=true;
  }
  //image.naturalWidth & Height don't exist when called from "split click".  The *2 only makes sense when doing the split.
  const imageWidth = image.naturalWidth==0?origRequest.width:image.naturalWidth;
  const imageHeight = image.naturalHeight==0?origRequest.height:image.naturalHeight;
  //Only if using "split" and not using max split size, use a ratio of 1 to use current image size.
  var ratio=(origRequest.scaleUpSplit && !ScaleUpSettings.useMaxSplitSize)? 2: Math.sqrt(maxRes/(imageHeight*imageWidth));
  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: (origRequest.scaleUpSplit || isXl)? (scaleUpPreserve ? 0.11 : 0.22):(scaleUpPreserve ? 0.15 : 0.3),  //Lower this number to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail

    //The rounding takes it to the nearest 64, which defines the resolutions available.  This will choose values that are not in the UI.
    width: ScaleUpMax(imageWidth,ratio),
    height: ScaleUpMax(imageHeight,ratio),
    //guidance_scale: Math.max(origRequest.guidance_scale,10), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: (isTurbo)? 40 : Math.min(parseInt(origRequest.num_inference_steps) + 50, 80),  //large resolutions combined with large steps can cause an error
    num_outputs: 1,
    use_vae_model: desiredVaeName(origRequest),
    //?use_upscale: 'None',
    //tiling: "none", //if doing scaleUpSplit, don't want to double-tile.
    //Using a new seed will allow some variation as it up-sizes; if results are not ideal, rerunning will give different results.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })

  //May want to delete the original controlnet, but it can be useful to carry-forward while scaling-up (such as to preserve fingers)
  //delete newTaskRequest.reqBody.use_controlnet_model;
  //delete newTaskRequest.reqBody.control_filter_to_apply;
  //delete newTaskRequest.reqBody.control_image;
  
  //If using controlnet, and not SDXL
  if (scaleUpControlNet && !isXl)
  {
    delete newTaskRequest.reqBody.control_filter_to_apply; //we don't want to retain a previously-used filter, if existing
    newTaskRequest.reqBody.control_image = image.src;
    newTaskRequest.reqBody.use_controlnet_model = isXl? "diffusers_xl_canny_full":"control_v11f1e_sd15_tile";
    newTaskRequest.reqBody.prompt_strength = scaleUpPreserve ? 0.3 : 0.5;
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

  delete newTaskRequest.reqBody.mask

  //resize the image before scaling back up, to maximize detail
  if(ScaleUpSettings.resizeImage) {
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = imageWidth*1.25;
    canvas.height = imageHeight*1.25;

    let ctx = canvas.getContext("2d");

    // get the image data of the canvas  -- we only need the part we're going to resize
    //x,y -- upper-left, width & height
    ctx.drawImage( image,
      0, 0, imageWidth, imageHeight, //source 
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

function scaleUpOnce(origRequest, image, doScaleUp, scalingIncrease) {
  var desiredModel=desiredModelName(origRequest);

  var isXl=false;
  var isTurbo=isModelTurbo(desiredModel, origRequest.use_lora_model);
  //var maxRes=maxTotalResolution;
  if (isModelXl(desiredModel)) {
    //maxRes=maxTotalResolutionXL;
    isXl=true;
  }

  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: ((origRequest.scaleUpSplit || isXl)? (scaleUpPreserve ? 0.11 : 0.25):(scaleUpPreserve ? 0.15 : 0.33))
      + (doScaleUp?.05:0), // + (ScaleUpSettings.resizeImage?.03:0), 
    //Lower prompt_strength to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail

    //This will choose values that are not in the UI.
    width: doScaleUp? scaleUp(image.naturalWidth, image.naturalHeight, scalingIncrease):image.naturalWidth,
    height: doScaleUp? scaleUp(image.naturalHeight, image.naturalWidth, scalingIncrease):image.naturalHeight,
    //guidance_scale: Math.max(origRequest.guidance_scale,10), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: (isTurbo)?  Math.min(parseInt(origRequest.num_inference_steps) + 18, 25): Math.min(parseInt(origRequest.num_inference_steps) + 25, 80),  //large resolutions combined with large steps can cause an error
    num_outputs: 1,
    use_vae_model: desiredVaeName(origRequest),
    //??use_upscale: 'None',
    //tiling: "none", //if doing scaleUpSplit, don't want to double-tile.
    //Using a new seed will allow some variation as it up-sizes; if results are not ideal, rerunning will give different results.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })

  //May want to delete the original controlnet, but it can be useful to carry-forward while scaling-up (such as to preserve fingers)
  //delete newTaskRequest.reqBody.use_controlnet_model;
  //delete newTaskRequest.reqBody.control_filter_to_apply;
  //delete newTaskRequest.reqBody.control_image;
  
  //If using controlnet, and not SDXL
  if (scaleUpControlNet && !isXl)
  {
    delete newTaskRequest.reqBody.control_filter_to_apply;
    newTaskRequest.reqBody.control_image = image.src;
    newTaskRequest.reqBody.use_controlnet_model = isXl? "diffusers_xl_canny_full":"control_v11f1e_sd15_tile";
    newTaskRequest.reqBody.prompt_strength = scaleUpPreserve ? 0.3 : 0.5;
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

  delete newTaskRequest.reqBody.mask

  //resize the image before scaling back up, to maximize detail
  if(ScaleUpSettings.resizeImage) {
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth*1.25;
    canvas.height = image.naturalHeight*1.25;

    let ctx = canvas.getContext("2d", {willReadFrequently: true});

    // get the image data of the canvas  -- we only need the part we're going to resize
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

/// sharpen image, from https://stackoverflow.com/questions/20316680/javascript-sharpen-image-and-edge-detection-not-working
/// USAGE:
///    sharpen(context, width, height, mixFactor)
///  mixFactor: [0.0, 1.0]
function sharpen(ctx, w, h, mix) {

  var weights = [0, -1, 0, -1, 5, -1, 0, -1, 0],
      katet = Math.round(Math.sqrt(weights.length)),
      half = (katet * 0.5) | 0,
      dstData = ctx.createImageData(w, h),
      dstBuff = dstData.data,
      srcBuff = ctx.getImageData(0, 0, w, h).data,
      y = h;

  while (y--) {

      var x = w;

      while (x--) {

          var sy = y,
              sx = x,
              dstOff = (y * w + x) * 4,
              r = 0,
              g = 0,
              b = 0,
              a = 0;

          for (var cy = 0; cy < katet; cy++) {
              for (var cx = 0; cx < katet; cx++) {

                  var scy = sy + cy - half;
                  var scx = sx + cx - half;

                  if (scy >= 0 && scy < h && scx >= 0 && scx < w) {

                      var srcOff = (scy * w + scx) * 4;
                      var wt = weights[cy * katet + cx];

                      r += srcBuff[srcOff] * wt;
                      g += srcBuff[srcOff + 1] * wt;
                      b += srcBuff[srcOff + 2] * wt;
                      a += srcBuff[srcOff + 3] * wt;
                  }
              }
          }

          dstBuff[dstOff] = r * mix + srcBuff[dstOff] * (1 - mix);
          dstBuff[dstOff + 1] = g * mix + srcBuff[dstOff + 1] * (1 - mix);
          dstBuff[dstOff + 2] = b * mix + srcBuff[dstOff + 2] * (1 - mix)
          dstBuff[dstOff + 3] = srcBuff[dstOff + 3];
      }
  }

  ctx.putImageData(dstData, 0, 0);
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
canvas.width = image.naturalWidth/2+splitOverlap;
canvas.height = image.naturalHeight/2+splitOverlap;

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
    image.onload = function(){scaleUpOnce(origRequest, image, true, scale);}
  }

  return true;
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
          <label for="scaleup_change_model">Use model selected above <small>(not the original model)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_change_prompt" name="scaleup_change_prompt" type="checkbox" value="`+ScaleUpSettings.useChangedPrompt+`"  onchange="setScaleUpSettings()"> <label for="scaleup_change_prompt"></label>
          </div>
          <label for="scaleup_change_prompt">Use new prompt, above <small>(not the original prompt)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_split_size" name="scaleup_split_size" type="checkbox" value="`+ScaleUpSettings.useMaxSplitSize+`"  onchange="setScaleUpSettings()"> <label for="scaleup_split_size"></label>
          </div>
          <label for="scaleup_split_size">Use maximum image size for all 4 split (tiled) images <small>(else, use current size x4)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="scaleup_resize_sharpen" name="scaleup_resize_sharpen" type="checkbox" value="`+ScaleUpSettings.resizeImage+`"  onchange="setScaleUpSettings()"> <label for="scaleup_resize_sharpen"></label>
          </div>
          <label for="scaleup_resize_sharpen">Enhance Details <small>(Resize & sharpen image before ScaleUp)</small></label>
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
    //useControlNet = false;
  }
  else {  //if settings found, but we've added a new setting, use a default value instead.  (Not strictly necessary for this first group.)
    ScaleUpSettings.use64PixelChunks =settings.use64PixelChunks ?? false;
    ScaleUpSettings.useChangedPrompt =settings.useChangedPrompt ?? false;
    ScaleUpSettings.useChangedModel =settings.useChangedModel ?? false;
    ScaleUpSettings.useMaxSplitSize =settings.useMaxSplitSize ?? true;
    ScaleUpSettings.resizeImage =settings.resizeImage ?? true;
    }
  localStorage.setItem('ScaleUp_Plugin_Settings', JSON.stringify(ScaleUpSettings));  //Store settings

  //set the input fields
  scaleup_64pixel_chunks.checked = ScaleUpSettings.use64PixelChunks;
  scaleup_change_prompt.checked = ScaleUpSettings.useChangedPrompt;
  scaleup_change_model.checked = ScaleUpSettings.useChangedModel;
  scaleup_split_size.checked = ScaleUpSettings.useMaxSplitSize;
  scaleup_resize_sharpen.checked = ScaleUpSettings.resizeImage;
}

