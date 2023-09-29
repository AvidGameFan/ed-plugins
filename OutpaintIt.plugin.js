/**
 * OutpaintIt
 * v.1.4.1, last updated: 9/28/2023
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
  useChangedPrompt: false
};

/* EDIT THIS to put in the maximum resolutions your video card can handle. 
   These values work (usually) for the Nvidia 2060 Super with 8GB VRAM. 
   If you go too large, you'll see "Error: CUDA out of memory". 
 */
(function () { "use strict"
var outpaintMaxTotalResolution = 6000000; //was: 1280 * 1280; //put max 'low' mode resolution here, max possible size when low mode is on
var outpaintMaxTurboResolution = 1088	* 1664; //was: 1536	* 896;   //put max resolution (other than 'low' mode) here

const outpaintSizeIncrease = 128;  //This can be modified by increments/decrements of 64, as desired
//const outpaintMaskOverlap = 36; //Need some overlap on the mask (minimum of 8px)
//const outpaintPercentToKeep = .2; //Amount of random pixels to retain, to bias effect
const maskFade = 0.07;
const maskExtraOverlap = 0;
const maskExtraOffset = -24;
const blackColor = 'rgba(255,255,255,0)'; //'rgba(0,0,0,0)';

function outpaintSetPixels(imageData) {
  //function guassianRand() {  //approximation of Gaussian, from Stackoverflow
  //  var rand =0;
  //  for (var i=0; i<6; i+=1) {
  //    rand += Math.random();
  //  }
  //  return rand/6;
  //}
  function randomPixel() {
    return Math.floor(Math.random() * 256); //0 to 255
    //return Math.floor(guassianRand() * 256); //0 to 255
    //Math.random() doesn't seem too random.
    //return Math.floor(1-Math.pow(Math.random(),2) * 256);
  }
  // get the pixel data array
  var pixels = imageData.data;

  // loop through each pixel
  for (var i = 0; i < pixels.length; i += 4) {
    //if (Math.random()<outpaintPercentToKeep) continue; -- if you pre-fill the space, you can vary how much is randomized, to encourage a bias
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
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255;
  }
}

function outpaintGetTaskRequest(origRequest, image, widen, all=false) {
  let newTaskRequest = getCurrentUserRequest();
      
  newTaskRequest.reqBody = Object.assign({}, origRequest, {
    init_image: image.src,
    prompt_strength: 0.95+Math.random()*.05, //be sure the values add up to 1 or less
    width: origRequest.width + ((widen || all)?outpaintSizeIncrease:0),
    height: origRequest.height + ((!widen || all)?outpaintSizeIncrease:0),
    //guidance_scale: Math.max(origRequest.guidance_scale,15), //Some suggest that higher guidance is desireable for img2img processing
    // With the high prompt strength, increasing the steps isn't necessary
    //num_inference_steps: Math.max(parseInt(origRequest.num_inference_steps), 50),  //DDIM may require more steps for better results
    num_outputs: 1,
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
  //newTaskRequest.reqBody.preserve_init_image_color_profile=true; //shouldn't be necessary, working from txt2img, and distorts colors
  //The comparison needs trimming, because the request box includes modifiers.  If the first part of the prompts match, we assume nothing's changed, and move on.
  //If prompt has changed, ask if we should pick up the new value.  Note that the new prompt will now include modifiers- previously, only the text-box.
  if (newTaskRequest.reqBody.prompt.substr(0,$("textarea#prompt").val().length)!=$("textarea#prompt").val()) {
    if (OutpaintItSettings.useChangedPrompt ) {
      newTaskRequest.reqBody.prompt=getPrompts()[0]; //promptField.value; //  $("textarea#prompt").val();
    };
  }

  //Use UI's prompt to allow changing to a different model, such as inpainting model, before outpainting.
  newTaskRequest.reqBody.use_stable_diffusion_model=$("#editor-settings #stable_diffusion_model")[0].dataset.path;

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
    let maskctx = maskcanvas.getContext("2d");
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, 0, origRequest.width, outpaintSizeIncrease+maskExtraOverlap /*outpaintMaskOverlap*/);  //Need some overlap on the mask (minimum of 8px)
    
    const gradient = ctx.createLinearGradient(0, outpaintSizeIncrease+maskExtraOverlap+maskExtraOffset, 0, maskcanvas.height); //vertical line

    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(0, outpaintSizeIncrease+maskExtraOverlap+maskExtraOffset, origRequest.width,  origRequest.height); 

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
  let result = false
  if ((origRequest.height+outpaintSizeIncrease)*origRequest.width<=outpaintMaxTotalResolution)  {
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
      0, 0, origRequest.width, origRequest.height, //source 
      0, 0, origRequest.width, origRequest.height //destination
    );

    ////Fill in with duplicate/invert
    //ctx.save();
    //ctx.translate(0, canvas.height);
    //ctx.scale(1, -1);
    //ctx.drawImage( image,
    //  0, origRequest.height-outpaintSizeIncrease, origRequest.width, outpaintSizeIncrease, //source 
    //  0, 0, origRequest.width, outpaintSizeIncrease //destination -- inverted
    //);
    //ctx.restore();

    ////Fill in with a copy of the bottom
    //ctx.drawImage( image,
    //  0, origRequest.height-outpaintSizeIncrease, origRequest.width, outpaintSizeIncrease, //source 
    //  0, origRequest.height, origRequest.width, outpaintSizeIncrease //destination  -- normal
    //);


    //fill with noise here
    // get the image data of the canvas  -- we only need the part we're going to outpaint
    var imageData = ctx.getImageData(0, canvas.height-outpaintSizeIncrease, canvas.width, outpaintSizeIncrease);

    outpaintSetPixels(imageData);

    // put the modified image data back to the context
    ctx.putImageData(imageData, 0 , origRequest.height); //put it at the bottom

    //Create the mask for img2img
    
    let maskcanvas = document.createElement("canvas");
    maskcanvas.width = newTaskRequest.reqBody.width;
    maskcanvas.height = newTaskRequest.reqBody.height;
    let maskctx = maskcanvas.getContext("2d");
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, origRequest.height-maskExtraOverlap, origRequest.width, outpaintSizeIncrease+maskExtraOverlap);  //Need some overlap on the mask (minimum of 8px)
    
    const gradient = ctx.createLinearGradient(0, maskcanvas.height-outpaintSizeIncrease-maskExtraOverlap-maskExtraOffset, 0, 0); //vertical line
    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
//    maskctx.fillRect(0, origRequest.height-outpaintSizeIncrease-8, origRequest.width,  origRequest.height); 
    maskctx.fillRect(0, 0, origRequest.width, maskcanvas.height-outpaintSizeIncrease-maskExtraOverlap-maskExtraOffset); 

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
  if ((origRequest.height+outpaintSizeIncrease)*origRequest.width<=outpaintMaxTotalResolution)  {
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
    let maskctx = maskcanvas.getContext("2d");
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, 0, outpaintSizeIncrease+maskExtraOverlap, origRequest.height);  //Need some overlap on the mask (minimum of 8px)

    const gradient = ctx.createLinearGradient(outpaintSizeIncrease+maskExtraOverlap+maskExtraOffset, 0, maskcanvas.width-outpaintSizeIncrease-maskExtraOverlap-maskExtraOffset, 0); //horizontal line
    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(outpaintSizeIncrease+maskExtraOverlap+maskExtraOffset, 0, origRequest.width-maskExtraOverlap-maskExtraOffset,  origRequest.height); 

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
  if ((origRequest.width+outpaintSizeIncrease)*origRequest.height<=outpaintMaxTotalResolution)  {
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
    let maskctx = maskcanvas.getContext("2d");
    maskctx.fillStyle = 'white';
    maskctx.fillRect(origRequest.width-maskExtraOverlap, 0, outpaintSizeIncrease+maskExtraOverlap, origRequest.height);  //Need some overlap on the mask (minimum of 8px)

    const gradient = ctx.createLinearGradient(origRequest.width-maskExtraOverlap-maskExtraOffset /*maskcanvas.width-outpaintSizeIncrease-8*/, 0, 0, 0); //horizontal line
    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(0,0,origRequest.width-maskExtraOverlap-maskExtraOffset, origRequest.height); 

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
    if ((origRequest.width+outpaintSizeIncrease)*origRequest.height<=outpaintMaxTotalResolution)  {
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
      0, 0, origRequest.width, origRequest.height, //source 
      outpaintSizeIncrease/2, outpaintSizeIncrease/2, origRequest.width, origRequest.height //destination
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
    maskctx.rect(maskcanvas.width-(outpaintSizeIncrease/2+maskExtraOverlap/2), outpaintSizeIncrease/2+maskExtraOverlap/2, -(origRequest.width-maskExtraOverlap), origRequest.height-maskExtraOverlap, true);
    // Create a clipping region from the current path
    maskctx.clip();
    maskctx.fillStyle = 'white';
    maskctx.fillRect(0, 0, maskcanvas.width, maskcanvas.height);
    // Restore the previous state of the context
    maskctx.restore();

    //let's feather the mask on the transition. Still need 8 hard pixels, though.

    //Draw 4 thin, grey rectangles, with gradient
    //Top box
    var gradient = ctx.createLinearGradient(0, outpaintSizeIncrease/2+maskExtraOverlap/2+maskExtraOffset, 0, origRequest.height-maskExtraOverlap);
    // Add three color stops
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    //maskctx.fillStyle = 'rgba(255,255,255,0.5)'; //'lightgrey'; 
    maskctx.fillRect(outpaintSizeIncrease/2+maskExtraOverlap/2, outpaintSizeIncrease/2+maskExtraOverlap/2, origRequest.width-maskExtraOverlap, origRequest.height-maskExtraOverlap-maskExtraOffset); 
    //bottom
    gradient = ctx.createLinearGradient(0, maskcanvas.height-(outpaintSizeIncrease/2+maskExtraOverlap/2)-maskExtraOffset, 0, outpaintSizeIncrease/2+maskExtraOverlap/2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(outpaintSizeIncrease/2+maskExtraOverlap/2, outpaintSizeIncrease/2+maskExtraOverlap/2-maskExtraOffset, origRequest.width-maskExtraOverlap, origRequest.height-maskExtraOverlap+maskExtraOffset);
    //left box
    gradient = ctx.createLinearGradient((outpaintSizeIncrease/2)+(maskExtraOverlap/2)+maskExtraOffset, 0, origRequest.width-maskExtraOverlap, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(outpaintSizeIncrease/2+maskExtraOverlap/2, outpaintSizeIncrease/2+maskExtraOverlap/2, origRequest.width-maskExtraOverlap+maskExtraOffset, origRequest.height-maskExtraOverlap);
    //right box
    gradient = ctx.createLinearGradient(maskcanvas.width-(outpaintSizeIncrease/2+maskExtraOverlap/2)-maskExtraOffset, 0, outpaintSizeIncrease/2+maskExtraOverlap/2, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); //"white");
    gradient.addColorStop(maskFade, blackColor); //"black");
    gradient.addColorStop(1, blackColor); //"black");
    maskctx.fillStyle = gradient; 
    maskctx.fillRect(outpaintSizeIncrease/2+maskExtraOverlap/2-maskExtraOffset, outpaintSizeIncrease/2+maskExtraOverlap/2, origRequest.width-maskExtraOverlap+maskExtraOffset, origRequest.height-maskExtraOverlap);

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
  if ((origRequest.width+outpaintSizeIncrease)*(origRequest.height+outpaintSizeIncrease)<=outpaintMaxTotalResolution)  {
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
          <input id="outpaintit_change_prompt" name="outpaintit_change_prompt" type="checkbox" value="`+OutpaintItSettings.useChangedPrompt+`"  onchange="setOutpaintItSettings()"> <label for="outpaintit_change_prompt"></label>
          </div>
          <label for="outpaintit_change_prompt">Use new prompt, above <small>(not the original prompt)</small></label>
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
    outpaintItResetSettings();
  }
  setup();
})();

function setOutpaintItSettings() {
  OutpaintItSettings.useChangedPrompt = outpaintit_change_prompt.checked; // document.getElementById('outpaintit_change_prompt').checked;
}

//Sets the default values for the settings.
function outpaintItResetSettings() {
  OutpaintItSettings.useChangedPrompt = false;

  //set the input fields
  outpaintit_change_prompt.checked = OutpaintItSettings.useChangedPrompt;
}
