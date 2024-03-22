/**
 * OutpaintIt
 * v.1.8.6, last updated: 3/22/2024
 * By Gary W.
 * 
 * A simple outpatining approach.  5 buttons are added with this one file.
 * One click to outpaint in one of the 4 directions, or OutpaintAll to outpaint all 4 directions at once.
 * 
 * Maximum output depends on the resolution set below. Resolution values in the output may or may not not conform 
 * to those available in the UI dropdown.
 *
 * Free to use with the CMDR2 Stable Diffusion UI, Easy Diffusion.
 *  
 */

//needs to be outside of the wrapper, as the input items are in the main UI.
var OutpaintItSettings = {
  useChangedPrompt: false,
  useChangedModel: false,
  useChangedSampler: false,
  useExtendImage: false
};

/* EDIT THIS to put in the maximum resolutions your video card can handle. 
   These values work (usually) for the Nvidia 2060 Super with 8GB VRAM. 
   If you go too large, you'll see "Error: CUDA out of memory". 
 */
(function () { "use strict"
var outpaintMaxTotalResolution = 10000000; //6000000; //was: 1280 * 1280; //put max 'low' mode resolution here, max possible size when low mode is on
var outpaintMaxTurboResolution = 1088	* 1664; //was: 1536	* 896;   //put max resolution (other than 'low' mode) here
var maxNoVaeTiling = 2200000; //5500000;  //max resolution to allow no VAE tiling.  Turn off VAE tiling for larger images.

const outpaintSizeIncrease = 128;  //This can be modified by increments/decrements of 64, as desired
//const outpaintMaskOverlap = 36; //Need some overlap on the mask (minimum of 8px)
const outpaintPercentToKeep = 1;//.5; //Amount of random pixels to retain, to bias effect
const maskFade = 0.07;
const maskExtraOverlap = 0;
const maskExtraOffset = -24;
const blackColor = 'rgba(255,255,255,0)'; //'rgba(0,0,0,0)';

function outpaintSetPixels(imageData) {
  function guassianRand() {  //approximation of Gaussian, from Stackoverflow
    var rand =0;
    for (var i=0; i<6; i+=1) {
      rand += Math.random();
    }
    return rand/6;
  }
  function randomPixel() {
    //return Math.floor(Math.random() * 256); //0 to 255
    return Math.floor(guassianRand() * 256); //0 to 255
    //Math.random() doesn't seem too random.
    //return Math.floor(1-Math.pow(Math.random(),2) * 256);
  }
  // get the pixel data array
  var pixels = imageData.data;
  var numPixels = pixels.length/4;
  // loop through each pixel
  for (var i = 0; i < pixels.length; i += 4) {
    //if not blank/black and keeping the original pixel, continue.  (If black, probably have not pre-filled the space.)
    if (!(pixels[i]==0 && pixels[i+1]==0 && pixels[i+2]==0) 
      && OutpaintItSettings.useExtendImage
      && Math.random()<outpaintPercentToKeep)
         continue; //-- if you pre-fill the space, you can vary how much is randomized, to encourage a bias

    //if pixels are pre-filled and using the extended image, randomize existing pixels, so as not to always bias towards neutral grey
    // if (OutpaintItSettings.useExtendImage && !(pixels[i]==0 && pixels[i+1]==0 && pixels[i+2]==0)) {
    //   let newPixel=Math.floor(Math.random()*numPixels)*4;
    //   //also, bias towards nearby pixels -- only works well for horizontal runs
    //   if(Math.random()<.2 && i<pixels.length-200 && i>=200) {  //50*4
    //     newPixel=(Math.floor(Math.random()*100)-50)*4+i;
    //   }

    //   pixels[i] = pixels[newPixel];
    //   pixels[i + 1] = pixels[newPixel+1];
    //   pixels[i + 2] = pixels[newPixel+2];
    //   pixels[i + 3] = 255;

    // }

    //always give some color bias to noise
    let newPixel=Math.floor(Math.random()*numPixels)*4;
    if(Math.random()<.2 && i<pixels.length-200 && i>=200) {  //50*4
       newPixel=(Math.floor(Math.random()*100)-50)*4+i;
        //note that if filled with more noise, this is going to reach back and pick up earlier noise values - not ideal
       pixels[i] = pixels[newPixel];
       pixels[i + 1] = pixels[newPixel+1];
       pixels[i + 2] = pixels[newPixel+2];
       pixels[i + 3] = 255;

    }
    else if (!OutpaintItSettings.useExtendImage)
    {
      // get the red, green, blue (but not alpha) values
      var r;// = pixels[i];
      var g;// = pixels[i + 1];
      var b;// = pixels[i + 2];
      //var a = pixels[i + 3];

      // randomize the pixel values
      r = randomPixel();
      g = randomPixel();
      b = randomPixel();
      //a = 255;

      // set the new pixel values back to the array
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
}

var contrastAmount=2;
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


//Model needs to have "turbo" in the filename to be recognized as a turbo model.
function isModelTurbo(modelName) {
  let result = false;
  if (modelName.search(/turbo/i)>=0) {
    result = true;
  }  
  return result;
}
function desiredModelName(origRequest) {
  //Grab the model name from the user-input area instead of the original image.
  if (OutpaintItSettings.useChangedModel) {
    return $("#editor-settings #stable_diffusion_model")[0].dataset.path; 
  }
  else {
    return origRequest.use_stable_diffusion_model; //for the original model
  }
}
function desiredVaeName(origRequest) {
  //Grab the  name from the user-input area instead of the original image.
  if (OutpaintItSettings.useChangedModel) {
    return $("#editor-settings #vae_model")[0].dataset.path; 
  }
  else {
    return origRequest.use_vae_model; //for the original model
  }
}
//allow changing the sampler, for those who swap to a different sampler for img2img on intermediate steps
function desiredSamplerName(origRequest) {
  //Grab the  name from the user-input area instead of the original image.
  if (OutpaintItSettings.useChangedSampler) {
    return $("#editor-settings #sampler_name")[0].value
  }
  else {
    return origRequest.sampler_name; //for the original model
  }
}


function calcOutpaintSizeIncrease(image) {
  //For each 2mp, add another block of 64 to the outpaint size.  For larger images, the default value is a bit thin.
  return outpaintSizeIncrease + 64 * Math.floor((image.naturalWidth*image.naturalHeight)/2000000)
//  //If the image is greater than 3.5mp, increase the size of the outpaint.  For larger images, the default value is a bit thin.
//  if(image.naturalWidth*image.naturalHeight > 3500000) {
//    return outpaintSizeIncrease * 2;
//  }
//  else {
//    return outpaintSizeIncrease;
//  }
}

function outpaintGetTaskRequest(origRequest, image, widen, all=false) {
  let newTaskRequest = getCurrentUserRequest();
  let initialPromptStrength = (OutpaintItSettings.useExtendImage ? 0.89 : 0.95);
  var desiredModel=desiredModelName(origRequest);  
  var isTurbo=isModelTurbo(desiredModel);
      
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: initialPromptStrength+Math.random()*(1-initialPromptStrength) - (OutpaintItSettings.useExtendImage ? 0.09 : 0.0), //be sure the values add up to 1 or less
    width: image.naturalWidth + ((widen || all)?calcOutpaintSizeIncrease(image):0),
    height: image.naturalHeight + ((!widen || all)?calcOutpaintSizeIncrease(image):0),
    //guidance_scale: Math.max(origRequest.guidance_scale,15), //Some suggest that higher guidance is desireable for img2img processing
    // With the high prompt strength, increasing the steps isn't necessary
    //num_inference_steps: Math.max(parseInt(origRequest.num_inference_steps), 50),  //DDIM may require more steps for better results
    //num_inference_steps: (isTurbo)? 10 : parseInt(origRequest.num_inference_steps) ),
    num_outputs: 1,
    use_vae_model: desiredVaeName(origRequest),
    sampler_name: desiredSamplerName(origRequest),
    seed: Math.floor(Math.random() * 10000000),
  })
  newTaskRequest.seed = newTaskRequest.reqBody.seed;
  //Now, we allow the use of the same sampler when outpainting
  //  newTaskRequest.reqBody.sampler_name = 'ddim';  //ensure img2img sampler change is properly reflected in log file
  newTaskRequest.batchCount = outpaintNumRuns;  // assume user only wants one at a time to evaluate, if selecting one out of a batch
  newTaskRequest.numOutputsTotal = outpaintNumRuns; // "
  //If you have a lower-end graphics card, the below will automatically disable turbo mode for larger images.
  //Each person needs to test with different resolutions to find the limit of their card when using Balanced or modes other than 'low'.
  if (newTaskRequest.reqBody.width * newTaskRequest.reqBody.height >outpaintMaxTurboResolution) {  //put max normal resolution here
    newTaskRequest.reqBody.vram_usage_level = 'low';
  }
  delete newTaskRequest.reqBody.use_controlnet_model; //We're adding to the picture, and controlnet will try to make us conform to the old image.
  delete newTaskRequest.reqBody.control_filter_to_apply;
  delete newTaskRequest.reqBody.control_image;
  //newTaskRequest.reqBody.preserve_init_image_color_profile=true; //shouldn't be necessary, working from txt2img, and distorts colors
  //The comparison needs trimming, because the request box includes modifiers.  If the first part of the prompts match, we assume nothing's changed, and move on.
  //If prompt has changed, ask if we should pick up the new value.  Note that the new prompt will now include modifiers- previously, only the text-box.
  if (newTaskRequest.reqBody.prompt.substr(0,$("textarea#prompt").val().length)!=$("textarea#prompt").val()) {
    if (OutpaintItSettings.useChangedPrompt ) {
      newTaskRequest.reqBody.prompt=getPrompts()[0]; //promptField.value; //  $("textarea#prompt").val();
    };
  }

  //we don't need to increase the steps so much, as with normal img2img in ScaleUp, as our prompt strength is high, using nearly all specified steps.
  if(isTurbo) {
    newTaskRequest.reqBody.num_inference_steps=Math.min(7,newTaskRequest.reqBody.num_inference_steps);
  }
  else {
    newTaskRequest.reqBody.num_inference_steps=Math.min(50,newTaskRequest.reqBody.num_inference_steps);
  }

  // //Use UI's prompt to allow changing to a different model, such as inpainting model, before outpainting.
  // if (OutpaintItSettings.useChangedModel) {
  //   newTaskRequest.reqBody.use_stable_diffusion_model = $("#editor-settings #stable_diffusion_model")[0].dataset.path; 
  //   //newTaskRequest.reqBody.use_stable_diffusion_model =$("#editor-settings #stable_diffusion_model")[0].dataset.path;
  //   newTaskRequest.use_vae_model = $("#editor-settings #vae_model")[0].dataset.path;
  // }
  newTaskRequest.reqBody.use_stable_diffusion_model=desiredModel;

  if (newTaskRequest.reqBody.width*newTaskRequest.reqBody.height>maxNoVaeTiling) {
    newTaskRequest.reqBody.enable_vae_tiling = true; //Force vae tiling on, if image is large
  }


  delete newTaskRequest.reqBody.use_upscale; //if previously used upscaler, we don't want to automatically do it again

  return newTaskRequest;
}

PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { html: '<span class="outpaint-label" style="background-color:transparent;background: rgba(0,0,0,0.5)">OutpaintIt:</span>', type: 'label', on_click: onOutpaintLabelClick, filter: onOutpaintLabelFilter},
  { html: '<i class="fa-solid fa-arrow-up"></i>', on_click: onOutpaintUpClick, filter: onOutpaintUpFilter },
  { html: '<i class="fa-solid fa-arrow-down"></i>', on_click: onOutpaintDownClick, filter: onOutpaintDownFilter  },
  { html: '<i class="fa-solid fa-arrow-left"></i>', on_click: onOutpaintLeftClick, filter: onOutpaintLeftFilter  },
  { html: '<i class="fa-solid fa-arrow-right"></i>', on_click: onOutpaintRightClick, filter: onOutpaintRightFilter  },
  { html: '<i class="fa-solid fa-arrows"></i>', on_click: onOutpaintAllClick, filter: onOutpaintAllFilter  }
])

var outpaintNumRuns = 1;

function onOutpaintLabelClick(origRequest, image) {
  outpaintNumRuns++;
  if (outpaintNumRuns>5) {
    outpaintNumRuns=1;
  }
  //update current labels
  for (var index=0; index<document.getElementsByClassName("outpaint-label").length;index++) {
    document.getElementsByClassName("outpaint-label")[index].innerText=outpaintLabel();
  }
};

function  onOutpaintUpClick(origRequest, image) {
    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, false);
   
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    let ctx = canvas.getContext("2d");


//    if (OutpaintItSettings.useExtendImage) {
      //if (OutpaintItSettings.invertExtendImage) 

      //Fill in with duplicate/invert
      ctx.save();
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
      ctx.drawImage( image,
        0, 0,image.naturalWidth, calcOutpaintSizeIncrease(image), //source 
        0, image.naturalHeight, image.naturalWidth, calcOutpaintSizeIncrease(image) //destination -- inverted
      );
      ctx.restore();
      ////Fill in with a copy of the bottom
      //ctx.drawImage( image,
      //  0,image.naturalHeight-calcOutpaintSizeIncrease(image),image.naturalWidth, calcOutpaintSizeIncrease(image), //source 
      //  0,image.naturalHeight,image.naturalWidth, calcOutpaintSizeIncrease(image) //destination  -- normal
      //);
//    }

    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, 0, canvas.width, calcOutpaintSizeIncrease(image));

//    if (OutpaintItSettings.useExtendImage) {
      imageData = contrastImage(imageData, contrastAmount);
//    }
    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0, 0); //put it at the top

    ctx.drawImage( image,
      0, 0,image.naturalWidth,image.naturalHeight, //source 
      0, calcOutpaintSizeIncrease(image),image.naturalWidth,image.naturalHeight //destination
    );

    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    let maskctx = maskcanvas.getContext("2d");
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, 0,image.naturalWidth, calcOutpaintSizeIncrease(image)+maskExtraOverlap /*outpaintMaskOverlap*/);  //Need some overlap on the mask (minimum of 8px)
    
    const gradient = ctx.createLinearGradient(0, calcOutpaintSizeIncrease(image)+maskExtraOverlap+maskExtraOffset, 0, maskcanvas.height); //vertical line

    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(0, calcOutpaintSizeIncrease(image)+maskExtraOverlap+maskExtraOffset,image.naturalWidth, image.naturalHeight); 

    //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have

    newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
    newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

//    Now reassemble old and new

  }
function onOutpaintUpFilter(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible
    //The filters do not have a valid image.
  let result = false
  if ((origRequest.height+calcOutpaintSizeIncrease({naturalWidth:origRequest.width,naturalHeight:origRequest.height}))*origRequest.width<=outpaintMaxTotalResolution)  {
    result=true;
  }
  return result;
  }

function  onOutpaintDownClick(origRequest, image) {
    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, false);

    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    let ctx = canvas.getContext("2d");

    ctx.drawImage( image,
      0, 0,image.naturalWidth,image.naturalHeight, //source 
      0, 0,image.naturalWidth,image.naturalHeight //destination
    );

//    if (OutpaintItSettings.useExtendImage) {
      //if (OutpaintItSettings.invertExtendImage) 

      //Fill in with duplicate/invert
      ctx.save();
      ctx.translate(0, canvas.height);
      ctx.scale(1, -1);
      ctx.drawImage( image,
        0,image.naturalHeight-calcOutpaintSizeIncrease(image),image.naturalWidth, calcOutpaintSizeIncrease(image), //source 
        0, 0,image.naturalWidth, calcOutpaintSizeIncrease(image) //destination -- inverted
      );
      ctx.restore();

      ////Fill in with a copy of the bottom
      //ctx.drawImage( image,
      //  0,image.naturalHeight-calcOutpaintSizeIncrease(image),image.naturalWidth, calcOutpaintSizeIncrease(image), //source 
      //  0,image.naturalHeight,image.naturalWidth, calcOutpaintSizeIncrease(image) //destination  -- normal
      //);
//    }


    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, canvas.height-calcOutpaintSizeIncrease(image), canvas.width, calcOutpaintSizeIncrease(image));

//    if (OutpaintItSettings.useExtendImage) {
      imageData = contrastImage(imageData, contrastAmount);
//    }
    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0 ,image.naturalHeight); //put it at the bottom

    //Create the mask for img2img
    
    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    let maskctx = maskcanvas.getContext("2d");
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0,image.naturalHeight-maskExtraOverlap,image.naturalWidth, calcOutpaintSizeIncrease(image)+maskExtraOverlap);  //Need some overlap on the mask (minimum of 8px)
    
    const gradient = ctx.createLinearGradient(0, maskcanvas.height-calcOutpaintSizeIncrease(image)-maskExtraOverlap-maskExtraOffset, 0, 0); //vertical line
    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
//    maskctx.fillRect(0,image.naturalHeight-calcOutpaintSizeIncrease(image)-8,image.naturalWidth, image.naturalHeight); 
    maskctx.fillRect(0, 0,image.naturalWidth, maskcanvas.height-calcOutpaintSizeIncrease(image)-maskExtraOverlap-maskExtraOffset); 

    //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have

    newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
    newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

    //  TODO: reassemble old and new, to create a larger final image
  }
function onOutpaintDownFilter(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible
  let result = false
  if ((origRequest.height+calcOutpaintSizeIncrease({naturalWidth:origRequest.width,naturalHeight:origRequest.height}))*origRequest.width<=outpaintMaxTotalResolution)  {
    result=true;
  }
  return result;
  }


  function  onOutpaintLeftClick(origRequest, image) {
    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, true);
    
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    let ctx = canvas.getContext("2d");

//    if (OutpaintItSettings.useExtendImage) {
      //if (OutpaintItSettings.invertExtendImage) 

      //Fill in with duplicate/invert
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage( image,
        0, 0, calcOutpaintSizeIncrease(image), image.naturalHeight, //source 
        image.naturalWidth, 0, calcOutpaintSizeIncrease(image), image.naturalHeight //destination -- inverted   
     );
      ctx.restore();

      ////Fill in with a copy of the bottom
      //ctx.drawImage( image,
      //  0,image.naturalHeight-calcOutpaintSizeIncrease(image),image.naturalWidth, calcOutpaintSizeIncrease(image), //source 
      //  0,image.naturalHeight,image.naturalWidth, calcOutpaintSizeIncrease(image) //destination  -- normal
      //);
//    }

    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, 0, calcOutpaintSizeIncrease(image), canvas.height);

//    if (OutpaintItSettings.useExtendImage) {
      imageData = contrastImage(imageData, contrastAmount);
//    }
    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0, 0); //put it at the top-left

    ctx.drawImage( image,
      0, 0,image.naturalWidth,image.naturalHeight, //source 
      calcOutpaintSizeIncrease(image), 0,image.naturalWidth,image.naturalHeight //destination
    );


    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    let maskctx = maskcanvas.getContext("2d");
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, 0, calcOutpaintSizeIncrease(image)+maskExtraOverlap,image.naturalHeight);  //Need some overlap on the mask (minimum of 8px)

    const gradient = ctx.createLinearGradient(calcOutpaintSizeIncrease(image)+maskExtraOverlap+maskExtraOffset, 0, maskcanvas.width-calcOutpaintSizeIncrease(image)-maskExtraOverlap-maskExtraOffset, 0); //horizontal line
    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(calcOutpaintSizeIncrease(image)+maskExtraOverlap+maskExtraOffset, 0,image.naturalWidth-maskExtraOverlap-maskExtraOffset, image.naturalHeight); 

  //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
  //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have    

   newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
   newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

//    Now reassemble old and new

  }
function onOutpaintLeftFilter(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible

  let result = false
  if ((origRequest.width+calcOutpaintSizeIncrease({naturalWidth:origRequest.width,naturalHeight:origRequest.height}))*origRequest.height<=outpaintMaxTotalResolution)  {
    result=true;
  }
  return result;
  }

  function  onOutpaintRightClick(origRequest, image) {
    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, true);
    
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    let ctx = canvas.getContext("2d");

//    if (OutpaintItSettings.useExtendImage) {
      //if (OutpaintItSettings.invertExtendImage) 

      //Fill in with duplicate/invert
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage( image,
        image.naturalWidth-calcOutpaintSizeIncrease(image), 0, calcOutpaintSizeIncrease(image), image.naturalHeight, //source 
        0, 0, calcOutpaintSizeIncrease(image), image.naturalHeight //destination -- inverted
      );
      ctx.restore();

      ////Fill in with a copy of the right
      //ctx.drawImage( image,
      //  image.naturalWidth-calcOutpaintSizeIncrease(image), 0, calcOutpaintSizeIncrease(image), image.naturalHeight, //source 
      //  image.naturalWidth, 0, calcOutpaintSizeIncrease(image), image.naturalHeight //destination  -- normal
      //);
//    }

    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(canvas.width-calcOutpaintSizeIncrease(image), 0, calcOutpaintSizeIncrease(image), canvas.height);

//    if (OutpaintItSettings.useExtendImage) {
      imageData = contrastImage(imageData, contrastAmount);
//    }
    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData,image.naturalWidth, 0); //put it at the top-left of our context, which will be the right-side

    ctx.drawImage( image,
      0, 0,image.naturalWidth,image.naturalHeight, //source 
      0, 0,image.naturalWidth,image.naturalHeight //destination
    );

    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    let maskctx = maskcanvas.getContext("2d");
    maskctx.fillStyle = 'white';
    maskctx.fillRect(image.naturalWidth-maskExtraOverlap, 0, calcOutpaintSizeIncrease(image)+maskExtraOverlap,image.naturalHeight);  //Need some overlap on the mask (minimum of 8px)

    const gradient = ctx.createLinearGradient(image.naturalWidth-maskExtraOverlap-maskExtraOffset /*maskcanvas.width-calcOutpaintSizeIncrease(image)-8*/, 0, 0, 0); //horizontal line
    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(0,0,image.naturalWidth-maskExtraOverlap-maskExtraOffset,image.naturalHeight); 

    //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have   

    newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
    newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

//    Now reassemble old and new


  }
function onOutpaintRightFilter(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible

    let result = false
    if ((origRequest.width+calcOutpaintSizeIncrease({naturalWidth:origRequest.width,naturalHeight:origRequest.height}))*origRequest.height<=outpaintMaxTotalResolution)  {
      result=true;
    }
    return result;
  }

function  onOutpaintAllClick(origRequest, image) {
    let newTaskRequest = outpaintGetTaskRequest(origRequest, image, true, true);
    
    //create working canvas
    let canvas = document.createElement("canvas");
    canvas.width = newTaskRequest.reqBody.width;
    canvas.height = newTaskRequest.reqBody.height;
    let ctx = canvas.getContext("2d");

    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0, 0); //put it at the top-left of our context, which will be the right-side

    ctx.drawImage( image,
      0, 0,image.naturalWidth,image.naturalHeight, //source 
      calcOutpaintSizeIncrease(image)/2, calcOutpaintSizeIncrease(image)/2,image.naturalWidth,image.naturalHeight //destination
    );

    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    let maskctx = maskcanvas.getContext("2d");

    // Save the current state of the context
    maskctx.save();
    // Start a new path
    maskctx.beginPath();
    // Define an outer rectangle that covers the whole canvas
    maskctx.rect(0, 0,  maskcanvas.width, maskcanvas.height);
    // Define an inner rectangle that you want to mask out
    // Use a negative value for anticlockwise parameter
    maskctx.rect(maskcanvas.width-(calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2), calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2, -(image.naturalWidth-maskExtraOverlap),image.naturalHeight-maskExtraOverlap, true);
    // Create a clipping region from the current path
    maskctx.clip();
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, 0, maskcanvas.width, maskcanvas.height);
    // Restore the previous state of the context
    maskctx.restore();

    //let's feather the mask on the transition. Still need 8 hard pixels, though.

    //Draw 4 thin, grey rectangles, with gradient
    //Top box
    var gradient = ctx.createLinearGradient(0, calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2+maskExtraOffset, 0,image.naturalHeight-maskExtraOverlap);
    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    //maskctx.fillStyle = 'rgba(255,255,255,0.5)'; //'lightgrey'; 
    maskctx.fillRect(calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2, calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2,image.naturalWidth-maskExtraOverlap,image.naturalHeight-maskExtraOverlap-maskExtraOffset); 
    //bottom
    gradient = ctx.createLinearGradient(0, maskcanvas.height-(calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2)-maskExtraOffset, 0, calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2, calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2-maskExtraOffset,image.naturalWidth-maskExtraOverlap,image.naturalHeight-maskExtraOverlap+maskExtraOffset);
    //left box
    gradient = ctx.createLinearGradient((calcOutpaintSizeIncrease(image)/2)+(maskExtraOverlap/2)+maskExtraOffset, 0,image.naturalWidth-maskExtraOverlap, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2, calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2,image.naturalWidth-maskExtraOverlap+maskExtraOffset,image.naturalHeight-maskExtraOverlap);
    //right box
    gradient = ctx.createLinearGradient(maskcanvas.width-(calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2)-maskExtraOffset, 0, calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2-maskExtraOffset, calcOutpaintSizeIncrease(image)/2+maskExtraOverlap/2,image.naturalWidth-maskExtraOverlap+maskExtraOffset,image.naturalHeight-maskExtraOverlap);

    //document.querySelector('body').appendChild(canvas);   //TEsting -- let's see what we have
    //document.querySelector('body').appendChild(maskcanvas);   //TEsting -- let's see what we have   

    newTaskRequest.reqBody.mask = maskcanvas.toDataURL('image/png');
    newTaskRequest.reqBody.init_image = canvas.toDataURL('image/png');

    var id=createTask(newTaskRequest)  //task ID - can be used to find location in document

  }
  function onOutpaintAllFilter(origRequest, image) {
    // this is an optional function. return true/false to show/hide the button
    // if this function isn't set, the button will always be visible

  let result = false
  if ((origRequest.width+calcOutpaintSizeIncrease({naturalWidth:origRequest.width,naturalHeight:origRequest.height}))
      *(origRequest.height+calcOutpaintSizeIncrease({naturalWidth:origRequest.width,naturalHeight:origRequest.height}))<=outpaintMaxTotalResolution)  {
    result=true;
  }
  return result;
  }

  //It is possible for some of the directions (skinny edges) to still appear, while the other options disappear.
  function onOutpaintLabelFilter(origRequest, image) {
    let result=onOutpaintRightFilter(origRequest, image) || onOutpaintUpFilter(origRequest, image);

    if (result==true) {
      var text = outpaintLabel();
      this.html = this.html.replace(/OutpaintIt.*:/,text);
    }
    return result;
  }
  function outpaintLabel() 
  {
    var text;
    if (outpaintNumRuns==1) {
      text = 'OutpaintIt:';
    }
    else {
      text = 'OutpaintIt (batch of ' + outpaintNumRuns + '):';
    }
    return text;
  }

  //UI insertion adapted from Rabbit Hole plugin
  function setup() {
    var outpaintSettings = document.createElement('div');
    outpaintSettings.id = 'outpaintit-settings';
    outpaintSettings.classList.add('settings-box');
    outpaintSettings.classList.add('panel-box');
    let tempHTML =  
        `<h4 class="collapsible">Outpaint It Settings
          <i id="reset-op-settings" class="fa-solid fa-arrow-rotate-left section-button">
          <span class="simple-tooltip top-left">
          Reset Outpaint It Settings
          </span>
          </i>
        </h4>
        <div id="outpaintit-settings-entries" class="collapsible-content" style="display: block;margin-top:15px;">
        <div><ul style="padding-left:0px">
          <li><b class="settings-subheader">OutpaintIt Settings</b></li>
          <li class="pl-5"><div class="input-toggle">
          <input id="outpaintit_change_model" name="outpaintit_change_model" type="checkbox" value="`+OutpaintItSettings.useChangedModel+`"  onchange="setOutpaintItSettings()"> <label for="outpaintit_change_model"></label>
          </div>
          <label for="outpaintit_change_model">Use model selected above <small>(not the original model)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="outpaintit_change_prompt" name="outpaintit_change_prompt" type="checkbox" value="`+OutpaintItSettings.useChangedPrompt+`"  onchange="setOutpaintItSettings()"> <label for="outpaintit_change_prompt"></label>
          </div>
          <label for="outpaintit_change_prompt">Use new prompt, above <small>(not the original prompt)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="outpaintit_change_sampler" name="outpaintit_change_sampler" type="checkbox" value="`+OutpaintItSettings.useChangedSampler+`"  onchange="setOutpaintItSettings()"> <label for="outpaintit_change_sampler"></label>
          </div>
          <label for="outpaintit_change_sampler">Use new sampler, above <small>(not the original sampler)</small></label>
          </li>
          <li class="pl-5"><div class="input-toggle">
          <input id="outpaintit_extend_image" name="outpaintit_extend_image" type="checkbox" value="`+OutpaintItSettings.useExtendImage+`"  onchange="setOutpaintItSettings()"> <label for="outpaintit_extend_image"></label>
          </div>
          <label for="outpaintit_extend_image">Extend image into new area <small>(with noise)</small></label>
          </li>
        </ul></div>
        </div>`;
    outpaintSettings.innerHTML = tempHTML;
    var editorSettings = document.getElementById('editor-settings');
    editorSettings.parentNode.insertBefore(outpaintSettings, editorSettings.nextSibling);
    createCollapsibles(outpaintSettings);

    const icon = document.getElementById('reset-op-settings');
    icon.addEventListener('click', outpaintItResetSettings);

    //Ensure switches match the settings (for the initial values), since "value=" in above HTML doesn't appear to work.
    outpaintItResetSettings(null);
  }
  setup();
})();

function setOutpaintItSettings() {
  OutpaintItSettings.useChangedPrompt = outpaintit_change_prompt.checked;
  OutpaintItSettings.useChangedModel = outpaintit_change_model.checked;
  OutpaintItSettings.useChangedSampler = outpaintit_change_sampler.checked;
  OutpaintItSettings.useExtendImage = outpaintit_extend_image.checked; //Extend image into noise area

  localStorage.setItem('OutpaintIt_Plugin_Settings', JSON.stringify(OutpaintItSettings));  //Store settings
}

//Sets the default values for the settings.
function outpaintItResetSettings(reset) {
  let settings = JSON.parse(localStorage.getItem('OutpaintIt_Plugin_Settings'));
  if (settings == null || reset !=null) {  //if settings not found, just set everything
    OutpaintItSettings.useChangedPrompt = false;
    OutpaintItSettings.useChangedModel = false;
    OutpaintItSettings.useChangedSampler = false;
    OutpaintItSettings.useExtendImage = false;
    //OutpaintItSettings.invertExtendImage = false; //TODO
  }
  else {  //if settings found, but we've added a new setting, use a default value instead.  (Not strictly necessary for this first group.)
    OutpaintItSettings.useChangedPrompt =settings.useChangedPrompt ?? false;
    OutpaintItSettings.useChangedModel =settings.useChangedModel ?? false;
    OutpaintItSettings.useChangedSampler =settings.useChangedSampler ?? false;
    OutpaintItSettings.useExtendImage =settings.useExtendImage ?? false;
  }
  localStorage.setItem('OutpaintIt_Plugin_Settings', JSON.stringify(OutpaintItSettings));  //Store settings

  //set the input fields
  outpaintit_change_prompt.checked = OutpaintItSettings.useChangedPrompt;
  outpaintit_change_model.checked = OutpaintItSettings.useChangedModel;
  outpaintit_change_sampler.checked = OutpaintItSettings.useChangedSampler;
  outpaintit_extend_image.checked = OutpaintItSettings.useExtendImage;
}
