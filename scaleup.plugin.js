/**
 * Scale Up
 * v.1.4.0, last updated: 9/9/2023
 * By Gary W.
 * 
 * Modest scaling up, maintaining close ratio, with img2img to increase resolution of output.
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
var maxTotalResolution = 6000000; //2048 * 1088; //put max 'low' mode resolution here, max possible size when low mode is on
var maxTurboResolution = 1088	* 1664; //put max 'balanced' resolution here - larger output will enter 'low' mode, automatically.
var MaxSquareResolution = 1344;

//SDXL limits:2048*2048 or better
var maxTotalResolutionXL = 3072	* 2304;  //maximum resolution to use in 'low' mode for SDXL.  Even for 8GB video cards, this number maybe able to be raised.


//Note that the table entries go in pairs, if not 1:1 square ratio.
//Ratios that don't match exactly may slightly stretch or squish the image, but should be slight enough to not be noticeable.
//First two entries are the x,y resolutions of the image, and last entry is the upscale resolution for x.
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

var scalingIncrease=1.25; //arbitrary amount to increase scaling, when beyond lookup table

function scaleUp(height,width) {
  var result=height;

  resTable.forEach(function(item){
      if (item[0]==height && 
          item[1]==width)
          {
          result=item[2]
          return;
          }
  })
  if (result==height) { /*no match found in table*/
      if (height==width) { /* and if square */
          if (height>=768 && height<MaxSquareResolution) {
              result=MaxSquareResolution; //arbitrary
          }
          else if (height<768) {
              result=896; //arbitrary
          }
      }
      else {  //we don't have any match, but let's just make up something, until we run out of resolution
          result = ScaleUpMax(height,scalingIncrease); //arbitrarily go 1.25 times larger
      }
  }
  return result;
}

function isModelXl(modelName) {
  let result = false;
  if (modelName.search(/xl/i)>=0) {
    result = true;
  }  
  return result;
}


const suLabel = 'Scale Up';  //base label prefix
PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { html: '<span class="scaleup-label" style="background-color:transparent;background: rgba(0,0,0,0.5)">'+
    '<span class="scaleup-tooltiptext">Click to cycle through modes - "preserve", for fewer changes to the image, '+
    ' and "Controlnet", to allow more detail. ' +
    'Clicking on a resolution will generate a new image at that resolution. \n'+
    'Click on the grid icon to generate 4 tiled images, for more resolution once stitched.</span>'
    +suLabel+':</span>', type: 'label', 
    on_click: onScaleUpLabelClick, filter: onScaleUpLabelFilter},
  { text: 'Scale Up', on_click: onScaleUpClick, filter: onScaleUpFilter },
  { text: 'Scale Up MAX', on_click: onScaleUpMAXClick, filter: onScaleUpMAXFilter },
  { text: '2X', on_click: onScaleUp2xClick, filter: onScaleUp2xFilter },
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

  //update current labels
  for (var index=0; index<document.getElementsByClassName("scaleup-label").length;index++) {
    document.getElementsByClassName("scaleup-label")[index].innerText=scaleupLabel(!scaleUpMAXFilter(origRequest));
  }
};

//________________________________________________________________________________________________________________________________________

function onScaleUpClick(origRequest, image) {
  //Grab the model name from the user-input area instead of the original image.
  var desiredModel=$("#editor-settings #stable_diffusion_model")[0].dataset.path; //origRequest.use_stable_diffusion_model for the original model

  var isXl=false;
  if (isModelXl(desiredModel)) {
    isXl=true;
  }
  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: (isXl)? (scaleUpPreserve ? 0.10 : 0.25):(scaleUpPreserve ? 0.15 : 0.35),  //Lower this number to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail
    // Lower amounts used for SDXL, as it seems more sensitive to changes, especially the refiner model.
    width: scaleUp(origRequest.width, origRequest.height),
    height: scaleUp(origRequest.height, origRequest.width),
    guidance_scale: Math.max(origRequest.guidance_scale,15), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: Math.min(parseInt(origRequest.num_inference_steps) + 25, 100),  //large resolutions combined with large steps can cause an error
    num_outputs: 1,
    //??use_upscale: 'None',
    //Using a new seed will allow some variation as it up-sizes.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })

  //if using controlnet
  if (scaleUpControlNet && !isXl)
  {
    newTaskRequest.reqBody.control_image = image.src;
    newTaskRequest.reqBody.use_controlnet_model = isXl? "diffusers_xl_canny_full":"control_v11f1e_sd15_tile";
    newTaskRequest.reqBody.prompt_strength = scaleUpPreserve ? 0.3 : 0.5;
  }

  newTaskRequest.seed = newTaskRequest.reqBody.seed
  //newTaskRequest.reqBody.sampler_name = 'ddim'  //ensure img2img sampler change is properly reflected in log file
  newTaskRequest.batchCount = 1  // assume user only wants one at a time to evaluate, if selecting one out of a batch
  newTaskRequest.numOutputsTotal = 1 // "
  //If you have a lower-end graphics card, the below will automatically disable memory-intensive options for larger images.
  //Each person needs to test with different resolutions to find the limit of their card when using balanced (formerly, "turbo") mode.
  if (newTaskRequest.reqBody.width * newTaskRequest.reqBody.height > maxTurboResolution) {  //max normal resolution
    //Disable anything that takes up VRAM here
    newTaskRequest.reqBody.vram_usage_level = 'low';
    //delete newTaskRequest.reqBody.hypernetwork_strength;
    //delete newTaskRequest.reqBody.use_hypernetwork_model;
  }
  
  newTaskRequest.reqBody.use_stable_diffusion_model=desiredModel;
  
  //Grab the prompt from the user-input area instead of the original image.
  //newTaskRequest.reqBody.prompt=$("textarea#prompt").val();
  
  delete newTaskRequest.reqBody.mask
  createTask(newTaskRequest)
}

function scaleUpFilter(origRequest, image) {
  let result = false
  if (origRequest.height==origRequest.width && origRequest.height<MaxSquareResolution) {
      result=true;
  }
  else {      //check table for valid entries, otherwise disable button
      resTable.forEach(function(item){
      if (item[0]==origRequest.height && 
          item[1]==origRequest.width)
          {
          result=true;
          return;
          }
      })
  }
  //Additionally, allow additional scaling
  if (scaleUpMAXFilter(origRequest) && origRequest.height!=ScaleUpMax(width,scalingIncrease)) {
      result=true;
  }
  return result;
}
function onScaleUpFilter(origRequest) {
  // this is an optional function. return true/false to show/hide the button
  // if this function isn't set, the button will always be visible
  let result = scaleUpFilter(origRequest);

   //Optional display of resolution
  if (result==true) {
    this.text = scaleUp(origRequest.width, origRequest.height) + ' x ' +
      scaleUp(origRequest.height, origRequest.width);
  }
  return result;
}

function onScaleUpLabelFilter(origRequest, image) {
  let result=scaleUpFilter(origRequest) || scaleUpMAXFilter(origRequest);

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

function ScaleUpMax(dimension, ratio) {
  return Math.round(((dimension*ratio)+32)/64)*64-64;
}
  
function onScaleUpMAXClick(origRequest, image) {
  //Grab the model name from the user-input area instead of the original image.
  var desiredModel=$("#editor-settings #stable_diffusion_model")[0].dataset.path; //origRequest.use_stable_diffusion_model for the original model

  var isXl=false;
  var maxRes=maxTotalResolution;
  if (isModelXl(desiredModel)) {
    maxRes=maxTotalResolutionXL;
    isXl=true;
  }
  var ratio=Math.sqrt(maxRes/(origRequest.height*origRequest.width));
  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: (origRequest.scaleUpSplit || isXl)? (scaleUpPreserve ? 0.10 : 0.2):(scaleUpPreserve ? 0.15 : 0.3),  //Lower this number to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail

    //The rounding takes it to the nearest 64, which defines the resolutions available.  This will choose values that are not in the UI.
    width: ScaleUpMax(origRequest.width,ratio),
    height: ScaleUpMax(origRequest.height,ratio),
    //guidance_scale: Math.max(origRequest.guidance_scale,10), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: Math.min(parseInt(origRequest.num_inference_steps) + 50, 100),  //large resolutions combined with large steps can cause an error
    num_outputs: 1,
    //?use_upscale: 'None',
    //tiling: "none", //if doing scaleUpSplit, don't want to double-tile.
    //Using a new seed will allow some variation as it up-sizes; if results are not ideal, rerunning will give different results.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })

  //If using controlnet, and not SDXL,
  //    control_image: image.src
  //    use_controlnet_model: "control_v11f1e_sd15_tile"
  if (scaleUpControlNet && !isXl)
  {
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

  newTaskRequest.reqBody.use_stable_diffusion_model=desiredModel;

  delete newTaskRequest.reqBody.mask
  createTask(newTaskRequest)
}

var scaleUpMaxRatio;
function scaleUpMAXFilter(origRequest) {
  let result = false;
  var maxRes=maxTotalResolution;
  if (isModelXl($("#editor-settings #stable_diffusion_model").val())) {  //origRequest.use_stable_diffusion_model
    maxRes=maxTotalResolutionXL;
  }

  scaleUpMaxRatio=Math.sqrt(maxRes/(origRequest.height*origRequest.width));
  if (ScaleUpMax(origRequest.height, scaleUpMaxRatio) > origRequest.height) {  //if we already matched the max resolution, we're done.
    result=true;
  }
  return result;
}
function onScaleUpMAXFilter(origRequest, image) {
  // this is an optional function. return true/false to show/hide the button
  // if this function isn't set, the button will always be visible
  let result = scaleUpMAXFilter(origRequest);
  
  //Optional display of resolution
  if (result==true) {
      this.text = ScaleUpMax(origRequest.width, scaleUpMaxRatio) + ' x ' +
      ScaleUpMax(origRequest.height, scaleUpMaxRatio);
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
  scaleUpOnce(origRequest, image) ;
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

function scaleUpOnce(origRequest, image) {
  //Grab the model name from the user-input area instead of the original image.
  var desiredModel=$("#editor-settings #stable_diffusion_model")[0].dataset.path; //origRequest.use_stable_diffusion_model for the original model
  // grab the VAE too?

  var isXl=false;
  var maxRes=maxTotalResolution;
  if (isModelXl(desiredModel)) {
    maxRes=maxTotalResolutionXL;
    isXl=true;
  }
  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: (origRequest.scaleUpSplit || isXl)? (scaleUpPreserve ? 0.10 : 0.2):(scaleUpPreserve ? 0.15 : 0.3),  //Lower this number to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail

    //This will choose values that are not in the UI.
    width: image.naturalWidth,
    height: image.naturalHeight,
    //guidance_scale: Math.max(origRequest.guidance_scale,10), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: Math.min(parseInt(origRequest.num_inference_steps) + 50, 100),  //large resolutions combined with large steps can cause an error
    num_outputs: 1,
    //??use_upscale: 'None',
    //tiling: "none", //if doing scaleUpSplit, don't want to double-tile.
    //Using a new seed will allow some variation as it up-sizes; if results are not ideal, rerunning will give different results.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })

  //If using controlnet, and not SDXL,
  //    control_image: image.src
  //    use_controlnet_model: "control_v11f1e_sd15_tile"
  if (scaleUpControlNet && !isXl)
  {
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

  newTaskRequest.reqBody.use_stable_diffusion_model=desiredModel;

  delete newTaskRequest.reqBody.mask
  createTask(newTaskRequest)
}

function onScaleUp2xFilter(origRequest, image) {
  // this is an optional function. return true/false to show/hide the button
  // if this function isn't set, the button will always be visible

  //If already at max res, do not display.
  let result = scaleUpMAXFilter(origRequest);
  
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
canvas.width = origRequest.width/2+splitOverlap;
canvas.height = origRequest.height/2+splitOverlap;

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
newImage.src = canvas.toDataURL('image/png');
onScaleUpMAXClick(newTaskRequest.reqBody, newImage);

//lower left
ctx.drawImage( image,
  0, canvas.height-splitOverlap*2, canvas.width, canvas.height, //source 
  0, 0, canvas.width, canvas.height //destination
);
//imageData = ctx.getImageData(0,canvas.width-splitOverlap*2, canvas.width, canvas.height); //upper-right
newImage = new Image;
newImage.src = canvas.toDataURL('image/png');
onScaleUpMAXClick(newTaskRequest.reqBody, newImage);

//upper-right
ctx.drawImage( image,
  canvas.width-splitOverlap*2, 0, canvas.width, canvas.height, //source 
  0, 0, canvas.width, canvas.height //destination
);
//imageData = ctx.getImageData(canvas.height-splitOverlap*2, 0, canvas.width, canvas.height);  //x,y -- lower-r, width & height
newImage = new Image;
newImage.src = canvas.toDataURL('image/png');
onScaleUpMAXClick(newTaskRequest.reqBody, newImage);

//lower right
ctx.drawImage( image,
  canvas.width-splitOverlap*2,  canvas.height-splitOverlap*2, canvas.width, canvas.height, //source 
  0, 0, canvas.width, canvas.height //destination
);
//imageData = ctx.getImageData(canvas.height-splitOverlap*2, 0, canvas.width, canvas.height);  //x,y -- lower-r, width & height
newImage = new Image;
newImage.src = canvas.toDataURL('image/png');
onScaleUpMAXClick(newTaskRequest.reqBody, newImage);

}

function  onScaleUpSplitFilter(origRequest, image) {

  if (Math.min(origRequest.width,origRequest.height)>=768)
  {
    return true;
  }
  else
    return false;
}

})();