/***
 * 
 * Make Very Similar Images Plugin for Easy Diffusion
 * v.0.9.1, last updated: 2/13/2024
 * By Gary W.
 * 
 * Similar to the original "Make Similar Images" plugin to make images somewhat similar to the original,
 * but with a few changes to make it closer to the original and to support Turbo models better.
 * (Further optimizations may be added.)
 * 
 * Free to use with the CMDR2 Stable Diffusion UI.
 * 
 */



(function() { "use strict"
const favorites_loadDate = Date.now();  //load date as soon as possible, to closely match the folder date

const suLabel = 'Favorites';  //base label prefix
PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { text: "Make Very Similar Images", on_click: onMakeVerySimilarClick, filter: onMakeVerySimilarFilter }
])


//Model needs to have "turbo" in the filename to be recognized as a turbo model.
function isModelTurbo(modelName, loraList) {
  if (modelName.search(/turbo/i)>=0) {
    return true;
  }
  //if either of the first two Loras contains "lcm", assume turbo lora -- fewer steps needed
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

function onMakeVerySimilarClick(origRequest, image) {
  var isTurbo=isModelTurbo(origRequest.use_stable_diffusion_model, origRequest.use_lora_model);

  const newTaskRequest = modifyCurrentRequest(origRequest, {
    num_outputs: 1,
    num_inference_steps: (isTurbo)? 18 : Math.min(parseInt(origRequest.num_inference_steps) + 10, 50),  //large resolutions combined with large steps can cause an error
    prompt_strength: 0.7,
    init_image: image.src,
    seed: Math.floor(Math.random() * 10000000),
})

//newTaskRequest.numOutputsTotal = 5
//newTaskRequest.batchCount = 5

delete newTaskRequest.reqBody.mask

createTask(newTaskRequest)
}

function onMakeVerySimilarFilter(origRequest, image) {
    return true;
}

})();
