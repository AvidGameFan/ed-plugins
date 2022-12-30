/**
 * Scale Up MAX
 * v.1.01, last updated: 11/26/2022
 * By Gary W.
 * 
 * Scaling up in size, to the maximum resolution of your video card, while maintaining 
 * close ratio, using img2img to increase resolution of output.
 * 
 * Maximum output depends on the resolution set below. Values will not conform to those available in the UI dropdown.
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 *  
 */

/* EDIT THIS to put in the maximum resolutions your video card can handle. 
   These values work (usually) for the Nvidia 2060 Super with 8GB VRAM. 
   If you go too large, you'll see "Error: CUDA out of memory". 
 */
var maxTotalResolution = 1024 * 1024;  //put max resolution (without turbo mode) here
//var maxTotalResolution = 1536 * 1024;  //put max resolution (without turbo mode) here
var maxTurboResolution = 1024 * 1024;  //put max turbo resolution here, max possible size when turbo is on
//var maxTurboResolution = 1280 * 1024;  //put max turbo resolution here, max possible size when turbo is on
var MaxSquareResolution = 1024;

//NOTE: it is possible that it could choose resolution values that exceed maxTotalResolution.  Adjust may be necessary, but this should be an unlikely occurrence.

function ScaleUpMax(dimension, ratio) {
  return Math.round(((dimension*ratio)+32)/64)*64-64;
}

PLUGINS['IMAGE_INFO_BUTTONS'].push({
  text: 'Scale Up MAX',
  on_click: function(origRequest, image) {

      var ratio=Math.sqrt(maxTotalResolution/(origRequest.height*origRequest.width));
      let newTaskRequest = getCurrentUserRequest();
    newTaskRequest.reqBody = Object.assign({}, origRequest, {
      init_image: image.src,
      prompt_strength: 0.3,  //Lower this number to make results closer to the original
      // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
      // - 0.15 sticks pretty close to the original, adding detail

      //The rounding takes it to the nearest 64, which defines the resolutions available.  This will choose values that are not in the UI.
      width: ScaleUpMax(origRequest.width,ratio),
      height: ScaleUpMax(origRequest.height,ratio),
      num_inference_steps: Math.min(parseInt(origRequest.num_inference_steps) + 50, 100),  //large resolutions combined with large steps can cause an error
      num_outputs: 1,
      //Using a new seed will allow some variation as it up-sizes; if results are not ideal, rerunning will give different results.
      seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
    })
    newTaskRequest.seed = newTaskRequest.reqBody.seed
    newTaskRequest.reqBody.sampler = 'ddim'  //ensure img2img sampler change is properly reflected in log file
    newTaskRequest.batchCount = 1  // assume user only wants one at a time to evaluate, if selecting one out of a batch
    newTaskRequest.numOutputsTotal = 1 // "
    //If you have a lower-end graphics card, the below will automatically disable turbo mode for larger images.
    //Each person needs to test with different resolutions to find the limit of their card when using turbo mode.
    if (newTaskRequest.reqBody.width * newTaskRequest.reqBody.height > maxTurboResolution) {  //put max turbo resolution here
      newTaskRequest.reqBody.turbo = false;
    }
    delete newTaskRequest.reqBody.mask
    createTask(newTaskRequest)
  },
  filter: function(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible

  result = false
  var ratio=Math.sqrt(maxTotalResolution/(origRequest.height*origRequest.width));
  if (ScaleUpMax(origRequest.height, ratio) > origRequest.height) {  //if we already matched the max resolution, we're done.
    result=true;
  }
  return result;
  }
})
