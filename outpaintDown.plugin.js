/**
 * OutpaintUp
 * v.1.01, last updated: 3/01/2023
 * By Gary W.
 * 
 * A simple outpatining approach.
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
var maxTotalResolution = 1280 * 1280; //put max 'low' mode resolution here, max possible size when low mode is on
var maxTurboResolution = 1536	* 896;   //put max resolution (other than 'low' mode) here

//NOTE: it is possible that it could choose resolution values that exceed maxTotalResolution.  Adjustment may be necessary, but this should be an unlikely occurrence.

//function ScaleUpMax(dimension, ratio) {
//  return Math.round(((dimension*ratio)+32)/64)*64-64;
//}

const outpaintDownSizeIncrease = 128;  //This can be modified by increments/decrements of 64, as desired


PLUGINS['IMAGE_INFO_BUTTONS'].push({
  text: 'OutpaintDown',
  on_click: function(origRequest, image) {

    function randomPixel() {
      return Math.floor(Math.random() * 256); //0 to 255
      //Math.random() doesn't seem too random.
      //return Math.floor(1-Math.pow(Math.random(),2) * 256);
    }
      var ratio=Math.sqrt(maxTotalResolution/(origRequest.height*origRequest.width));
      let newTaskRequest = getCurrentUserRequest();


      //assume for now, only sizing up
      //Get Source image
      //Create temp canvas
      //set top part of canvas to white (or all of canvas for ease)
      //copy top part of source into temp canvas bottom
      //Create inpainting mask the same size as top of canvas
      //Set Prompt Strength to .99 (full noise)
      //Run inpainting task as usual
      //Upon return, take result and overlay original source onto larger canvas
      //  -- create larger canvas
      //  -- copy new result into top
      // -- copy original source onto bottom
      
    newTaskRequest.reqBody = Object.assign({}, origRequest, {
      init_image: image.src,
      prompt_strength: 0.95,
      width: origRequest.width,
      height: origRequest.height + outpaintDownSizeIncrease,
      guidance_scale: Math.max(origRequest.guidance_scale,15), //Some suggest that higher guidance is desireable for img2img processing
      num_inference_steps: Math.min(parseInt(origRequest.num_inference_steps), 50),  //DDIM may require more steps for better results
      num_outputs: 1,
      seed: Math.floor(Math.random() * 10000000),
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

    
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    ctx = canvas.getContext("2d");
    //ctx.fillStyle = 'grey';
    ///ctx.fill();
    //ctx.fillRect(0, 0, canvas.width, canvas.height);

    //really need to fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, canvas.height-outpaintDownSizeIncrease, canvas.width, outpaintDownSizeIncrease);

    // get the pixel data array
    var pixels = imageData.data;

    // loop through each pixel
    for (var i = 0; i < pixels.length; i += 4) {
      // get the red, green, blue (but not alpha) values
      var r = pixels[i];
      var g = pixels[i + 1];
      var b = pixels[i + 2];
      //var a = pixels[i + 3];

      // randomize the pixel values
      r = randomPixel();
      g = randomPixel();
      b = randomPixel();
      //a = 255;

      // set the new pixel values back to the array
      pixels[i] = r;
      pixels[i +1] = g;
      pixels[i +2] = b;
      pixels[i +3] = 255;

    }

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0 , origRequest.height); //put it at the top
   // document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have

    ctx.drawImage( image,
// Only for cropped-source:      0, 0,origRequest.width, origRequest.height-origRequest.height/4, //source crop
      0, 0, origRequest.width, origRequest.height, //source 
      0, 0, origRequest.width, origRequest.height //destination
//only for cropped-destination      0, origRequest.height/4,origRequest.width, origRequest.height-origRequest.height/4, //destination crop
    );

   //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    const maskOverlap = 36; //Need some overlap on the mask (minimum of 8px)

    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    maskctx = maskcanvas.getContext("2d");
    //First, ensure the entire mask is black ("off")
    maskctx.fillStyle = 'black';
    maskctx.fillRect(0, 0, origRequest.width, origRequest.height-maskOverlap);
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, origRequest.height-maskOverlap, origRequest.width, outpaintDownSizeIncrease+maskOverlap);  //Need some overlap on the mask (minimum of 8px)
    //let's feather the mask on the transition. Still need 8 hard pixels, though.
    maskctx.fillStyle = 'grey'; 
    maskctx.fillRect(0, origRequest.height-maskOverlap, origRequest.width, maskOverlap-8); 
//   document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have
    
   newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
   newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    //delete newTaskRequest.reqBody.mask
    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

//    Now reassemble old and new


  },
  filter: function(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible

  result = false
//  var ratio=Math.sqrt(maxTotalResolution/(origRequest.height*origRequest.width));
  if ((origRequest.height+outpaintDownSizeIncrease)*origRequest.width<=maxTotalResolution)  {
//  if (ScaleUpMax(origRequest.height, ratio) > origRequest.height) {  //if we already matched the max resolution, we're done.
    result=true;
  }
//  //Optional display of resolution
//  if (result==true) {
//    this.text = 'Scale Up MAX to ' + ScaleUpMax(origRequest.width, ratio) + ' x ' +
//      ScaleUpMax(origRequest.height, ratio);
//  }
  return result;
  }
})
