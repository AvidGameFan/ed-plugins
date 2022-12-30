    /**
     * Scale Up
     * v.1.08, last updated: 11/06/2022
     * By Gary W.
     * 
     * Modest scaling up, maintaining close ratio, with img2img to increase resolution of output.
     * Maximum output is 1280 (except for a couple of wide-ratio entries at 1536 that should still 
     * work on many video cards), but generally, things are kept at 1024x1024 and below. Values
     * are restricted to those available in the UI dropdown.
     *
     * Free to use with the CMDR2 Stable Diffusion UI.
     *  
     */

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
    var MaxSquareResolution=1024;
      PLUGINS['IMAGE_INFO_BUTTONS'].push({
        text: 'Scale Up',
        on_click: function(origRequest, image) {
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
        
            let newTaskRequest = getCurrentUserRequest()
          newTaskRequest.reqBody = Object.assign({}, origRequest, {
            init_image: image.src,
            prompt_strength: 0.35,  //Lower this number to make results closer to the original
            // - 0.35 makes minor variations that can include facial expressions and details on objects -- can make image better or worse
            // - 0.15 sticks pretty close to the original, adding detail
            width: scaleUp(origRequest.width, origRequest.height),
            height: scaleUp(origRequest.height, origRequest.width),
            num_inference_steps: Math.min(parseInt(origRequest.num_inference_steps) + 25, 100),  //large resolutions combined with large steps can cause an error
            num_outputs: 1,
            //Using a new seed will allow some variation as it up-sizes.
            seed: Math.floor(Math.random() * 10000000)  //Remove or comment-out this line to retain original seed when resizing
          })
          newTaskRequest.seed = newTaskRequest.reqBody.seed
          newTaskRequest.reqBody.sampler = 'ddim'  //ensure img2img sampler change is properly reflected in log file
          newTaskRequest.batchCount = 1  // assume user only wants one at a time to evaluate, if selecting one out of a batch
          newTaskRequest.numOutputsTotal = 1 // "
          //If you have a lower-end graphics card, the below will automatically disable turbo mode for larger images.
          //Each person needs to test with different resolutions to find the limit of their card when using turbo mode.
          if (newTaskRequest.reqBody.width * newTaskRequest.reqBody.height > 1280 * 1024) {  //put max turbo resolution here
            newTaskRequest.reqBody.turbo = false;
          }
          delete newTaskRequest.reqBody.mask
          createTask(newTaskRequest)
        },
        filter: function(origRequest, image) {
          // this is an optional function. return true/false to show/hide the button
          // if this function isn't set, the button will always be visible

        result = false
        if (origRequest.height==origRequest.width && origRequest.height<MaxSquareResolution) {
                result=true;
        }
        else {
            //check table for valid entries, otherwise disable button
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
      })
     