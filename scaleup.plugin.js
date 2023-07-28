/**
 * Scale Up
 * v.1.3.0, last updated: 7/25/2023
 * By Gary W.
 * 
 * Modest scaling up, maintaining close ratio, with img2img to increase resolution of output.
 * Maximum output is 1280 (except for a couple of wide-ratio entries at 1536 that should still 
 * work on many video cards), but most entries are kept at 1024x1024 and below. Values
 * are generally restricted to those available in the UI dropdown, with a couple of exceptions.
 * I later added a few additional entries at higher resolutions, although at some point,
 * it just makes sense to use the Scale Up MAX button to jump to the highest 
 * resolution supported by your video card.
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 *  
 */

/* EDIT THIS to put in the maximum resolutions your video card can handle. 
These values work (usually) for the Nvidia 2060 Super with 8GB VRAM. 
If you go too large, you'll see "Error: CUDA out of memory". 
*/
(function() { "use strict"
var maxTotalResolution = 1280 * 1280; //put max 'low' mode resolution here, max possible size when low mode is on
var maxTurboResolution = 1536	* 896;   //put max 'balanced' resolution here - larger output will enter 'low' mode, automatically.
var MaxSquareResolution = 1280;

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
  if (result==height /*no match found in table*/
      && height==width) /* and if square */
      {
          if (height>=768 && height<MaxSquareResolution) {
              result=MaxSquareResolution; //arbitrary
          }
          else if (height<768) {
              result=896; //arbitrary
          }
      }
  return result;
}

PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { html: '<span class="scaleup-label" style="background-color:transparent;background: rgba(0,0,0,0.5)">Scale Up:</span>', type: 'label', on_click: onScaleUpLabelClick, filter: onScaleUpLabelFilter},
  { text: 'Scale Up', on_click: onScaleUpClick, filter: onScaleUpFilter },
  { text: 'Scale Up MAX', on_click: onScaleUpMAXClick, filter: onScaleUpMAXFilter },
  { html: '<i class="fa-solid fa-th-large"></i>', on_click: onScaleUpSplitClick, filter: onScaleUpSplitFilter  }
])
//font-size:20px 
var scaleUpPreserve = false;
function onScaleUpLabelClick(origRequest, image) {
  scaleUpPreserve = !scaleUpPreserve;
  //update current labels
  for (var index=0; index<document.getElementsByClassName("scaleup-label").length;index++) {
    document.getElementsByClassName("scaleup-label")[index].innerText=scaleupLabel(!scaleUpMAXFilter(origRequest));
  }
};

//________________________________________________________________________________________________________________________________________

function onScaleUpClick(origRequest, image) {
  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: scaleUpPreserve ? 0.15 : 0.35,  //Lower this number to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail
    width: scaleUp(origRequest.width, origRequest.height),
    height: scaleUp(origRequest.height, origRequest.width),
    guidance_scale: Math.max(origRequest.guidance_scale,15), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: Math.min(parseInt(origRequest.num_inference_steps) + 25, 100),  //large resolutions combined with large steps can cause an error
    num_outputs: 1,
    //Using a new seed will allow some variation as it up-sizes.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })
  newTaskRequest.seed = newTaskRequest.reqBody.seed
  newTaskRequest.reqBody.sampler_name = 'ddim'  //ensure img2img sampler change is properly reflected in log file
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
          result=true
          return;
          }
      })
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
    text = 'Scale Up';
  }
  else {
    text = 'Scale Up (preserve)';
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
  var ratio=Math.sqrt(maxTotalResolution/(origRequest.height*origRequest.width));
  let newTaskRequest = getCurrentUserRequest();
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: origRequest.scaleUpSplit? (scaleUpPreserve ? 0.10 : 0.2):(scaleUpPreserve ? 0.15 : 0.3),  //Lower this number to make results closer to the original
    // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
    // - 0.15 sticks pretty close to the original, adding detail

    //The rounding takes it to the nearest 64, which defines the resolutions available.  This will choose values that are not in the UI.
    width: ScaleUpMax(origRequest.width,ratio),
    height: ScaleUpMax(origRequest.height,ratio),
    //guidance_scale: Math.max(origRequest.guidance_scale,10), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: Math.min(parseInt(origRequest.num_inference_steps) + 50, 100),  //large resolutions combined with large steps can cause an error
    num_outputs: 1,
    //Using a new seed will allow some variation as it up-sizes; if results are not ideal, rerunning will give different results.
    seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
  })
  newTaskRequest.seed = newTaskRequest.reqBody.seed
  newTaskRequest.reqBody.sampler_name = 'ddim'  //ensure img2img sampler change is properly reflected in log file
  newTaskRequest.batchCount = 1  // assume user only wants one at a time to evaluate, if selecting one out of a batch
  newTaskRequest.numOutputsTotal = 1 // "
  //If you have a lower-end graphics card, the below will automatically disable turbo mode for larger images.
  //Each person needs to test with different resolutions to find the limit of their card when using Balanced or modes other than 'low'.
  if (newTaskRequest.reqBody.width * newTaskRequest.reqBody.height > maxTurboResolution) {  //put max normal resolution here
    //newTaskRequest.reqBody.turbo = false;
    newTaskRequest.reqBody.vram_usage_level = 'low';
  }
  delete newTaskRequest.reqBody.mask
  createTask(newTaskRequest)
}

var scaleUpMaxRatio;
function scaleUpMAXFilter(origRequest) {
  let result = false;
  scaleUpMaxRatio=Math.sqrt(maxTotalResolution/(origRequest.height*origRequest.width));
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

  if (Math.min(origRequest.width,origRequest.height)>=448)
  {
    return true;
  }
  else
    return false;
}

})();