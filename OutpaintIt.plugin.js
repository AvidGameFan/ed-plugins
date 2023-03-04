/**
 * OutpaintIt
 * v.1.01, last updated: 3/03/2023
 * By Gary W.
 * 
 * A simple outpatining approach.  4 buttons are added with this one file.
 * 
 * Maximum output depends on the resolution set below. Resolution values may or may not not conform 
 * to those available in the UI dropdown.
 *
 * Free to use with the CMDR2 Stable Diffusion UI, Easy Diffusion.
 *  
 */

/* EDIT THIS to put in the maximum resolutions your video card can handle. 
   These values work (usually) for the Nvidia 2060 Super with 8GB VRAM. 
   If you go too large, you'll see "Error: CUDA out of memory". 
 */
var maxTotalResolution = 1280 * 1280; //put max 'low' mode resolution here, max possible size when low mode is on
var maxTurboResolution = 1536	* 896;   //put max resolution (other than 'low' mode) here

const outpaintSizeIncrease = 128;  //This can be modified by increments/decrements of 64, as desired
const outpaintMaskOverlap = 36; //Need some overlap on the mask (minimum of 8px)

function outpaintSetPixels(imageData) {
  function randomPixel() {
    return Math.floor(Math.random() * 256); //0 to 255
    //Math.random() doesn't seem too random.
    //return Math.floor(1-Math.pow(Math.random(),2) * 256);
  }
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
}

function outpaintGetTaskRequest(origRequest, image, widen) {
  let newTaskRequest = getCurrentUserRequest();
      
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: 0.95,
    width: origRequest.width + ((widen)?outpaintSizeIncrease:0),
    height: origRequest.height + ((!widen)?outpaintSizeIncrease:0),
    guidance_scale: Math.max(origRequest.guidance_scale,15), //Some suggest that higher guidance is desireable for img2img processing
    num_inference_steps: Math.max(parseInt(origRequest.num_inference_steps), 50),  //DDIM may require more steps for better results
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
  return newTaskRequest;
}

PLUGINS['IMAGE_INFO_BUTTONS'].push({
  text: 'OutpaintUp',
  on_click: function(origRequest, image) {

    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, false);
   
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    ctx = canvas.getContext("2d");

    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, 0, canvas.width, outpaintSizeIncrease);

    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0, 0); //put it at the top

    ctx.drawImage( image,
      0, 0, origRequest.width, origRequest.height, //source 
      0, outpaintSizeIncrease,origRequest.width, origRequest.height //destination
    );

    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    maskctx = maskcanvas.getContext("2d");
    //First, ensure the mask over the original image is black ("off")
    maskctx.fillStyle = 'black';
    maskctx.fillRect(0, outpaintSizeIncrease, origRequest.width, origRequest.height);
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, 0, origRequest.width, outpaintSizeIncrease+outpaintMaskOverlap);  //Need some overlap on the mask (minimum of 8px)
    //let's feather the mask on the transition. Still need 8 hard pixels, though.
    maskctx.fillStyle = 'grey'; 
    maskctx.fillRect(0, outpaintSizeIncrease+8, origRequest.width, outpaintMaskOverlap-8); 
    
    //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have

    newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
    newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

//    Now reassemble old and new

  },
  filter: function(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible
  result = false
  if ((origRequest.height+outpaintSizeIncrease)*origRequest.width<=maxTotalResolution)  {
    result=true;
  }
  return result;
  }
})

PLUGINS['IMAGE_INFO_BUTTONS'].push({
  text: 'OutpaintDown',
  on_click: function(origRequest, image) {

    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, false);

    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    ctx = canvas.getContext("2d");

    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, canvas.height-outpaintSizeIncrease, canvas.width, outpaintSizeIncrease);

    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0 , origRequest.height); //put it at the top

    ctx.drawImage( image,
      0, 0, origRequest.width, origRequest.height, //source 
      0, 0, origRequest.width, origRequest.height //destination
    );

    //Create the mask for img2img
    
    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    maskctx = maskcanvas.getContext("2d");
    //First, ensure the mask over the original image is black ("off")
    maskctx.fillStyle = 'black';
    maskctx.fillRect(0, 0, origRequest.width, origRequest.height-outpaintMaskOverlap);
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, origRequest.height-outpaintMaskOverlap, origRequest.width, outpaintSizeIncrease+outpaintMaskOverlap);  //Need some overlap on the mask (minimum of 8px)
    //let's feather the mask on the transition. Still need 8 hard pixels, though.
    maskctx.fillStyle = 'grey'; 
    maskctx.fillRect(0, origRequest.height-outpaintMaskOverlap, origRequest.width, outpaintMaskOverlap-8); 
    
    //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have

    newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
    newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

    //  TODO: reassemble old and new, to create a larger final image
  },
  filter: function(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible
  result = false
  if ((origRequest.height+outpaintSizeIncrease)*origRequest.width<=maxTotalResolution)  {
    result=true;
  }
  return result;
  }
})


PLUGINS['IMAGE_INFO_BUTTONS'].push({
  text: 'OutpaintLeft',
  on_click: function(origRequest, image) {

    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, true);
    
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    ctx = canvas.getContext("2d");

    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, 0, outpaintSizeIncrease, canvas.height);

    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0, 0); //put it at the top-left

    ctx.drawImage( image,
      0, 0, origRequest.width, origRequest.height, //source 
      outpaintSizeIncrease, 0, origRequest.width, origRequest.height //destination
    );


    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    maskctx = maskcanvas.getContext("2d");
    //First, ensure the mask over the original image is black ("off")
    maskctx.fillStyle = 'black';
    maskctx.fillRect(outpaintSizeIncrease, 0, origRequest.width, origRequest.height);
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, 0, outpaintSizeIncrease+outpaintMaskOverlap, origRequest.height);  //Need some overlap on the mask (minimum of 8px)
    //let's feather the mask on the transition. Still need 8 hard pixels, though.
    maskctx.fillStyle = 'grey'; 
    maskctx.fillRect(outpaintSizeIncrease+8, 0, outpaintMaskOverlap-8, origRequest.height); 

    //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have    

   newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
   newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

//    Now reassemble old and new

  },
  filter: function(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible

  result = false
  if ((origRequest.width+outpaintSizeIncrease)*origRequest.height<=maxTotalResolution)  {
    result=true;
  }
  return result;
  }
})

PLUGINS['IMAGE_INFO_BUTTONS'].push({
  text: 'OutpaintRight',
  on_click: function(origRequest, image) {

    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, true);
    
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    ctx = canvas.getContext("2d");

    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(canvas.width-outpaintSizeIncrease, 0, outpaintSizeIncrease, canvas.height);

    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, origRequest.width, 0); //put it at the top-left of our context, which will be the right-side

    ctx.drawImage( image,
      0, 0, origRequest.width, origRequest.height, //source 
      0, 0, origRequest.width, origRequest.height //destination
    );

    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    maskctx = maskcanvas.getContext("2d");
    //First, ensure the mask over the original image is black ("off")
    maskctx.fillStyle = 'black';
    maskctx.fillRect(0, 0, origRequest.width-outpaintMaskOverlap, origRequest.height);
    maskctx.fillStyle = 'white';
    maskctx.fillRect(origRequest.width-outpaintMaskOverlap, 0, outpaintSizeIncrease+outpaintMaskOverlap, origRequest.height);  //Need some overlap on the mask (minimum of 8px)
    //let's feather the mask on the transition. Still need 8 hard pixels, though.
    maskctx.fillStyle = 'grey'; 
    maskctx.fillRect(origRequest.width-outpaintMaskOverlap, 0, outpaintMaskOverlap-8, origRequest.height); 

    //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have   

    newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
    newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

//    Now reassemble old and new


  },
  filter: function(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible

  result = false
  if ((origRequest.width+outpaintSizeIncrease)*origRequest.height<=maxTotalResolution)  {
    result=true;
  }
  return result;
  }
})

