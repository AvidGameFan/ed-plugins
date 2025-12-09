
/* 
 * Load Image Plugin
 *
 * v.1.1.0, last updated: 12/8/2025
 * By Gary W.
 *
 * This plugin allows users to load an image file and insert it into the UI
 * as an imageTaskContainer, matching the format of generated images.
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 */

(function() { 
    "use strict";

    // Load exifr library for metadata extraction
    const script = document.createElement('script');

    //to get rid of "Tracking Prevention blocked access to storage for https://cdn.jsdelivr.net/npm/exifr/dist/full.umd.js.",
    // Use local path:
    //script.src = '/media/js/exifr.umd.js';
    script.src = 'https://cdn.jsdelivr.net/npm/exifr/dist/full.umd.js';
    script.onload = function() {
        console.log('Load Image Plugin: exifr library loaded successfully');
    };
    script.onerror = function() {
        console.warn('Load Image Plugin: Failed to load exifr library - metadata extraction will be unavailable');
    };
    document.head.appendChild(script);

    // Wait for required elements to be available
    function waitForElementsAndInit() {
        var tries = 0;
        var interval = setInterval(function() {
            tries++;
            const supportBanner = document.querySelector("#supportBanner");
            const imagePreviewContent = document.querySelector("#preview-content");
            
            if (supportBanner && imagePreviewContent) {
                clearInterval(interval);
                init();
            }
            // Give up after some time
            if (tries > 200) {
                clearInterval(interval);
                console.warn('Load Image Plugin: Timed out waiting for required elements');
            }
        }, 100);
    }

    // Initialize the plugin
    function init() {
        // Create button to load image
        const loadImageBtn = document.createElement('button');
        loadImageBtn.id = 'load_image_btn';
        loadImageBtn.className = 'btn btn-primary';
        loadImageBtn.innerHTML = '<i class="fa-solid fa-folder-open"></i> Load Image';
        loadImageBtn.title = 'Load an image file into the UI';
        loadImageBtn.style.cssText = `
            padding: 6px 12px;
            font-size: 12px;
            height: auto;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin-left: 10px;
        `;
        
        // Create hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.id = 'load_image_input';
        
        // Add event listener to button
        loadImageBtn.addEventListener('click', function() {
            fileInput.click();
        });
        
        // Add event listener to file input
        fileInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                loadImageFile(e.target.files[0]);
                // Reset the input so the same file can be selected again
                e.target.value = '';
            }
        });
        
        // Insert button next to the download button
        const downloadBtn = document.querySelector("#show-download-popup");
        if (downloadBtn) {
            // Insert after the download button
            downloadBtn.parentNode.insertBefore(loadImageBtn, downloadBtn.nextSibling);
            downloadBtn.parentNode.insertBefore(fileInput, downloadBtn.nextSibling);
        } else {
            // Fallback: insert in preview tools if download button not found
            const previewTools = document.querySelector("#preview-tools");
            if (previewTools) {
                previewTools.appendChild(loadImageBtn);
                previewTools.appendChild(fileInput);
            } else {
                // Last resort: insert at beginning of body
                document.body.insertBefore(fileInput, document.body.firstChild);
                document.body.insertBefore(loadImageBtn, document.body.firstChild);
            }
        }
    }

    function desiredModelName() {
        //Grab the model name from the user-input area instead of the original image.
        return $("#editor-settings #stable_diffusion_model")[0].dataset.path; 
    }
    function desiredVaeName() {
        //Grab the  name from the user-input area instead of the original image.
        return $("#editor-settings #vae_model")[0].dataset.path; 
    }
    function desiredTextEncoderName() {
        // Get the JSON string from the UI
        let data = $("#editor-settings #text_encoder_model")[0].dataset.path;
        try {
            let parsed = JSON.parse(data);
            // Return the modelNames array, or an empty array if not found
            return parsed.modelNames || [];
        } catch (e) {
            // If parsing fails, return an empty array
            return [];
        }
    }

    // Extract prompt from image EXIF/metadata using exifr
    async function extractPromptFromImage(file) {
        try {
            if (typeof exifr === 'undefined') {
                console.warn('Load Image Plugin: exifr not available, skipping metadata extraction');
                return null;
            }

            const data = await exifr.parse(file);
            if (!data) {
                return null;
            }

            // Check various fields where Easy Diffusion stores prompt
            // PNG: parameters field often contains the prompt
            if (data.parameters) {
                const params = data.parameters;
                // Try to extract prompt from parameters string
                const promptMatch = params.match(/^([^,\n]*)/);
                if (promptMatch && promptMatch[1]) {
                    return promptMatch[1].trim();
                }
            }

            // PNG: ImageDescription field
            if (data.ImageDescription) {
                return data.ImageDescription;
            }

            // JPEG: UserComment field (common for EXIF)
            if (data.UserComment) {
                return data.UserComment;
            }

            // JPEG/PNG: Check metadata for any "prompt" or "text" fields
            if (data.text && typeof data.text === 'string') {
                return data.text;
            }

            // Generic check through all metadata fields
            for (const [key, value] of Object.entries(data)) {
                if (typeof value === 'string' && value.length > 10) {
                    if (key.toLowerCase().includes('prompt') || key.toLowerCase().includes('description')) {
                        // Check if this is JSON-formatted metadata (ComfyUI format)
                        if (value.trim().startsWith('{')) {
                            try {
                                const jsonData = JSON.parse(value);
                                const extractedPrompt = extractPromptFromComfyUIJSON(jsonData);
                                if (extractedPrompt) {
                                    return extractedPrompt;
                                }
                            } catch (e) {
                                // If JSON parsing fails, just use the string as-is
                                return value;
                            }
                        }
                        return value;
                    }
                }
            }

            return null;
        } catch (error) {
            console.log('Load Image Plugin: Could not extract prompt from metadata:', error);
            return null;
        }
    }

    // Helper function to extract prompt from ComfyUI JSON format
    function extractPromptFromComfyUIJSON(jsonData) {
        try {
            // Look for CLIP Text Encode nodes (which contain prompts)
            // They typically have class_type "CLIPTextEncode"
            for (const [key, node] of Object.entries(jsonData)) {
                if (node && node.class_type === 'CLIPTextEncode' && node.inputs && node.inputs.text) {
                    // Return the first text prompt found (positive prompt)
                    return node.inputs.text;
                }
            }
            
            // If no CLIPTextEncode found, look for any "text" field in inputs
            for (const [key, node] of Object.entries(jsonData)) {
                if (node && node.inputs && node.inputs.text) {
                    return node.inputs.text;
                }
            }
        } catch (e) {
            console.log('Load Image Plugin: Error parsing ComfyUI JSON:', e);
        }
        return null;
    }

    // Load and insert the image file
    async function loadImageFile(file) {
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            const imageDataUrl = e.target.result;
            
            // Extract prompt from image metadata
            let extractedPrompt = null;
            try {
                extractedPrompt = await extractPromptFromImage(file);
            } catch (error) {
                console.log('Load Image Plugin: Error during prompt extraction:', error);
            }
            
            // Create image to get dimensions
            const img = new Image();
            img.onload = function() {
                const timestamp = Date.now();
                const containerId = `imageTaskContainer-${timestamp}`;
                const promptText = extractedPrompt || 'Loaded Image';
                
                // Calculate thumbnail dimensions (80px height, maintain aspect ratio)
                let thumbHeight = 80;
                let thumbWidth = Math.round((img.width * thumbHeight) / img.height);
                
                // Create the imageTaskContainer HTML structure
                const taskEntry = document.createElement('div');
                taskEntry.id = containerId;
                taskEntry.className = 'imageTaskContainer';
                
                taskEntry.innerHTML = `
                    <div class="header-content panel collapsible active">
                        <span class="collapsible-handle">➖</span>
                        <i class="drag-handle fa-solid fa-grip"></i>
                        <div class="taskStatusLabel" style="display: none;">Loaded</div>
                        <button class="secondaryButton stopTask"><i class="fa-solid fa-trash-can"></i> Remove</button>
                        <button class="tertiaryButton useSettings"><i class="fa-solid fa-redo"></i> Use these settings</button>
                        <div class="preview-prompt">${promptText}</div>
                        <div class="taskConfig">
                          <!--  <div class="task-initimg init-img-preview" style="float:left;">
                                <img style="width:${thumbWidth}px;height:${thumbHeight}px;" src="${imageDataUrl}" width="${thumbWidth}" height="${thumbHeight}">
                                <div class="task-fs-initimage"></div>
                            </div> -->
                        </div>
                        <div class="outputMsg"></div>
                        <div class="progress-bar" style="display: none;"><div></div></div>
                    </div>
                    <div class="collapsible-content">
                        <div class="img-preview">
                            <div class="imgItem">
                                <div class="imgContainer">
                                    <img src="${imageDataUrl}" width="${img.width}" height="${img.height}" 
                                         data-prompt="${promptText}" data-steps="" data-guidance="">
                                    <div class="imgItemInfo" style="visibility: visible;">
                                        <div>
                                            <span class="imgInfoLabel imgExpandBtn"><i class="fa-solid fa-expand"></i></span>
                                            <span class="imgInfoLabel imgSeedLabel"></span>
                                        </div>
                                    </div>
                                    <button class="imgPreviewItemClearBtn image_clear_btn"><i class="fa-solid fa-xmark"></i></button>
                                    <span class="img_bottom_label">${img.width} x ${img.height}</span>
                                    <div class="spinner displayNone">
                                        <center><div class="loadingio-spinner-bean-eater-x0y3u8qky4n"><div class="ldio-8f673ktaleu"><div><div></div><div></div><div></div></div><div><div></div><div></div><div></div></div></div></div></center>
                                        <div class="spinnerStatus"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                // Helper function to normalize output format
                const normalizeOutputFormat = function(ext) {
                    ext = (ext || '').toLowerCase();
                    // Normalize jpg to jpeg since that's what the system expects
                    return ext === 'jpg' ? 'jpeg' : ext || 'png';
                };
                

                // Create a proper task object for the loaded image
                // This must match the structure expected by the system
                const task = {
                    batchesDone: 1,  // Already "done" since it's loaded - must equal batchCount
                    batchCount: 1,   // Single image
                    numOutputsTotal: 1,
                    seed: '',
                    isProcessing: false,  // CRITICAL: Must be false so it doesn't block generation!
                    reqBody: {
                        prompt: promptText,
                        seed: '',
                        width: img.width,
                        height: img.height,
                        output_format: normalizeOutputFormat(file.name.split('.').pop()),
                        // Pull settings from UI input fields
                        num_inference_steps: (typeof numInferenceStepsField !== 'undefined' && numInferenceStepsField?.value) ? numInferenceStepsField.value : '20',
                        //use_vae_model: (typeof vaeModelField !== 'undefined' && vaeModelField?.value) ? vaeModelField.value : '',
                        //use_text_encoder_model: (typeof textEncoderModelField !== 'undefined' && textEncoderModelField?.value) ? textEncoderModelField.value : '',
                        use_stable_diffusion_model: desiredModelName(),
                        use_vae_model: desiredVaeName(),
                        use_text_encoder_model: desiredTextEncoderName(),
                        guidance_scale: parseFloat(guidanceScaleField.value),
                        sampler_name: (typeof samplerField !== 'undefined' && samplerField?.value) ? samplerField.value : 'euler',
                        scheduler_name: (typeof schedulerField !== 'undefined' && schedulerField?.value) ? schedulerField.value : 'normal',
                        distilled_guidance_scale: 3.5
                    },
                    taskConfig: null,
                    taskStatusLabel: null,
                    outputContainer: null,
                    outputMsg: null,
                    previewPrompt: null,
                    progressBar: null,
                    stopTask: null,
                    useSettings: null
                };

                // //set model names - from main.js:
                // //*** probably need to add check for isFlux, etc. ***
                // // lora
                // let loraModelData = loraModelField.value
                // let modelNames = loraModelData["modelNames"]
                // let modelStrengths = loraModelData["modelWeights"]

                // if (modelNames.length > 0) {
                //     modelNames = modelNames.length == 1 ? modelNames[0] : modelNames
                //     modelStrengths = modelStrengths.length == 1 ? modelStrengths[0] : modelStrengths

                //     task.reqBody.use_lora_model = modelNames
                //     task.reqBody.lora_alpha = modelStrengths
                // }

                // // text encoder
                // let textEncoderModelNames = textEncoderModelField.modelNames

                // if (textEncoderModelNames.length > 0) {
                //     textEncoderModelNames = textEncoderModelNames.length == 1 ? textEncoderModelNames[0] : textEncoderModelNames

                //     task.reqBody.use_text_encoder_model = textEncoderModelNames
                // } else {
                //     task.reqBody.use_text_encoder_model = ""
                // }

                // Link task properties to DOM elements after they're created
                task.taskConfig = taskEntry.querySelector(".taskConfig");
                task.taskStatusLabel = taskEntry.querySelector(".taskStatusLabel");
                task.outputContainer = taskEntry.querySelector(".img-preview");
                task.outputMsg = taskEntry.querySelector(".outputMsg");
                task.previewPrompt = taskEntry.querySelector(".preview-prompt");
                task.progressBar = taskEntry.querySelector(".progress-bar");
                task.stopTask = taskEntry.querySelector(".stopTask");
                task.useSettings = taskEntry.querySelector(".useSettings");
                
                // Ensure status label doesn't show "Processing" state
                if (task.taskStatusLabel) {
                    task.taskStatusLabel.textContent = 'Loaded';
                    task.taskStatusLabel.style.display = 'none';  // Hide status for loaded images
                }
                
                // Set up event handlers
                setupImageContainer(taskEntry, imageDataUrl, img.width, img.height, file.name, task, promptText);
                
                // Insert before supportBanner
                const supportBanner = document.querySelector("#supportBanner");
                const imagePreviewContent = document.querySelector("#preview-content");
                if (supportBanner && imagePreviewContent) {
                    // DO NOT register loaded images in htmlTaskMap since they are not processing tasks
                    // They should be completely excluded from the task queue system
                    // Only regular generation tasks should be tracked by htmlTaskMap
                    // htmlTaskMap.set(taskEntry, task);
                    
                    imagePreviewContent.insertBefore(taskEntry, supportBanner.nextSibling);
                    
                    // Initialize collapsibles if available
                    if (typeof createCollapsibles === 'function') {
                        createCollapsibles(taskEntry);
                    }
                    
                    // Update UI state (hides/shows initial text, etc.)
                    if (typeof updateInitialText === 'function') {
                        updateInitialText();
                    }
                } else {
                    console.error('Load Image Plugin: Could not find supportBanner or imagePreviewContent');
                }
            };
            
            img.onerror = function() {
                alert('Failed to load image file. Please make sure it is a valid image.');
            };
            
            img.src = imageDataUrl;
        };
        
        reader.onerror = function() {
            alert('Error reading file. Please try again.');
        };
        
        reader.readAsDataURL(file);
    }

    function desiredPrompt(fileName) {
        //if the filename has a partial prompt, use that.  Else, use the UI prompt.
        let tokens = fileName.split('_');
        if (tokens.length > 1) {
            //assume prompt is everything before the last token (which is likely the datestamp and extension)
            tokens.pop(); //remove last token
            return tokens.join(' '); //re-join the rest as the prompt
        }
        else {
            return getPrompts()[0];
           //Grab the prompt from the user-input area instead of the original image.
        }
    }

    // Set up event handlers for the image container
    function setupImageContainer(container, imageDataUrl, width, height, fileName, task, promptText) {
        // Set up image info buttons
        const imgItem = container.querySelector('.imgItem');
        const img = container.querySelector('.imgItem img');
        const imgItemInfo = container.querySelector('.imgItemInfo');
        
        if (!imgItem || !img || !imgItemInfo) {
            console.warn('Load Image Plugin: Could not find required elements for button setup');
            return;
        }
        
        // Set imageCounter if available (increment it)
        let imageCounterValue = 0;
        if (typeof window.imageCounter !== 'undefined') {
            imageCounterValue = ++window.imageCounter;
        } else if (typeof imageCounter !== 'undefined') {
            imageCounterValue = ++imageCounter;
        }
        
        // Set data-imagecounter attribute
        img.setAttribute('data-imagecounter', imageCounterValue);
        
        // Helper function to normalize output format
        const normalizeOutputFormat = function(ext) {
            ext = (ext || '').toLowerCase();
            // Normalize jpg to jpeg since that's what the system expects
            return ext === 'jpg' ? 'jpeg' : ext || 'png';
        };
        
        // Create a minimal request object for button handlers
        const req = {
            prompt: promptText || desiredPrompt(fileName),
            seed: '',
            num_inference_steps: (typeof numInferenceStepsField !== 'undefined' && numInferenceStepsField?.value) ? numInferenceStepsField.value : '20',
            guidance_scale: parseFloat(guidanceScaleField.value),
            //guidance_scale: (typeof guidanceScaleField !== 'undefined' && guidanceScaleField?.value) ? guidanceScaleField.value : '7.5',
            width: width,
            height: height,
            output_format: normalizeOutputFormat(fileName.split('.').pop()),
            use_stable_diffusion_model: desiredModelName(),
            use_vae_model: desiredVaeName(),
            use_text_encoder_model: desiredTextEncoderName(),
            //use_vae_model: (typeof vaeModelField !== 'undefined' && vaeModelField?.value) ? vaeModelField.value : '',
            //use_text_encoder_model: (typeof textEncoderModelField !== 'undefined' && textEncoderModelField?.value) ? textEncoderModelField.value : '',
            sampler_name: (typeof samplerField !== 'undefined' && samplerField?.value) ? samplerField.value : 'euler',
            scheduler_name: (typeof schedulerField !== 'undefined' && schedulerField?.value) ? schedulerField.value : 'normal',
            distilled_guidance_scale: 3.5
        };
        
        // Store request in imageRequest array if available
        if (typeof window.imageRequest !== 'undefined') {
            window.imageRequest[imageCounterValue] = req;
        } else if (typeof imageRequest !== 'undefined') {
            imageRequest[imageCounterValue] = req;
        }
        
        const imageUndoBuffer = [];
        const imageRedoBuffer = [];
        const tools = {
            spinner: container.querySelector('.spinner'),
            spinnerStatus: container.querySelector('.spinnerStatus'),
            undoBuffer: imageUndoBuffer,
            redoBuffer: imageRedoBuffer,
        };
        
        // Add standard image buttons
        const buttons = [
            { text: "Use as Input", on_click: onUseAsInputClick },
            { text: "Use for Controlnet", on_click: onUseForControlnetClick },
            [
                {
                    html: '<i class="fa-solid fa-download"></i> Download Image',
                    on_click: onDownloadImageClick,
                    class: "download-img",
                },
                {
                    html: '<i class="fa-solid fa-download"></i> JSON',
                    on_click: onDownloadJSONClick,
                    class: "download-json",
                },
            ],
        ];
        
        // Include plugin buttons if available
        if (typeof PLUGINS !== 'undefined' && PLUGINS["IMAGE_INFO_BUTTONS"]) {
            buttons.push(...PLUGINS["IMAGE_INFO_BUTTONS"]);
        }
        
        // Create and add buttons
        const createButton = function(btnInfo) {
            if (Array.isArray(btnInfo)) {
                const wrapper = document.createElement("div");
                btnInfo.map(createButton).forEach((buttonElement) => wrapper.appendChild(buttonElement));
                return wrapper;
            }
            
            const newButton = document.createElement("button");
            newButton.classList.add("tasksBtns");
            
            if (btnInfo.html) {
                newButton.innerHTML = btnInfo.html;
            } else {
                newButton.innerText = btnInfo.text;
            }
            
            if (btnInfo.on_click) {
                newButton.addEventListener("click", function(event) {
                    btnInfo.on_click.bind(newButton)(req, img, event, tools);
                });
            }
            
            if (btnInfo.class) {
                if (Array.isArray(btnInfo.class)) {
                    newButton.classList.add(...btnInfo.class);
                } else {
                    newButton.classList.add(btnInfo.class);
                }
            }
            
            return newButton;
        };
        
        buttons.forEach((btn) => {
            if (Array.isArray(btn)) {
                btn = btn.filter((btnInfo) => !btnInfo.filter || btnInfo.filter(req, img) === true);
                if (btn.length === 0) {
                    return;
                }
            } else if (btn.filter && btn.filter(req, img) === false) {
                return;
            }
            
            try {
                imgItemInfo.appendChild(createButton(btn));
            } catch (err) {
                console.error("Error creating image info button:", btn, err);
            }
        });
        
        // Set up expand button
        const expandBtn = container.querySelector('.imgExpandBtn');
        if (expandBtn) {
            expandBtn.addEventListener('click', function() {
                if (typeof imageModal === 'function') {
                    const allImages = Array.from(container.parentNode.querySelectorAll(".imgItem img"));
                    const index = allImages.indexOf(img);
                    
                    function previousImage(img) {
                        return allImages.slice(0, index).reverse()[0];
                    }
                    
                    function nextImage(img) {
                        return allImages.slice(index + 1)[0];
                    }
                    
                    function imageModalParameter(img) {
                        const previousImg = previousImage(img);
                        const nextImg = nextImage(img);
                        
                        return {
                            src: img.src,
                            previous: previousImg ? () => imageModalParameter(previousImg) : undefined,
                            next: nextImg ? () => imageModalParameter(nextImg) : undefined,
                        };
                    }
                    
                    imageModal(imageModalParameter(img));
                }
            });
        }
        
        // Set up remove button
        const removeBtn = container.querySelector('.imgPreviewItemClearBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', function(e) {
                if (typeof undoableRemove === 'function') {
                    undoableRemove(imgItem);
                    
                    // Check if container should be removed
                    const allImgItems = container.querySelectorAll('.imgItem');
                    let allHidden = true;
                    for (let x = 0; x < allImgItems.length; x++) {
                        if (allImgItems[x].style.display !== 'none') {
                            allHidden = false;
                            break;
                        }
                    }
                    if (allHidden) {
                        if (typeof undoableRemove === 'function') {
                            undoableRemove(container, true);
                        } else {
                            container.remove();
                        }
                    }
                } else {
                    imgItem.remove();
                    // Check if container is empty and remove it
                    if (container.querySelectorAll('.imgItem').length === 0) {
                        container.remove();
                    }
                }
            });
        }
        
        // Set up drag handle
        const dragHandle = container.querySelector('.drag-handle');
        if (dragHandle && typeof onTaskEntryDragOver === 'function') {
            dragHandle.addEventListener('mousedown', function(e) {
                container.setAttribute('draggable', true);
            });
            
            dragHandle.addEventListener('mouseup', function(e) {
                setTimeout(function() {
                    container.setAttribute('draggable', false);
                }, 2000);
            });
            
            dragHandle.addEventListener('click', function(e) {
                e.preventDefault();
            });
            
            container.addEventListener('dragstart', function(e) {
                if (typeof imagePreview !== 'undefined') {
                    imagePreview.addEventListener('dragover', onTaskEntryDragOver);
                }
                e.dataTransfer.setData('text/plain', container.id);
            });
            
            container.addEventListener('dragend', function(e) {
                container.setAttribute('draggable', false);
                if (typeof imagePreview !== 'undefined') {
                    imagePreview.querySelectorAll('.imageTaskContainer').forEach(function(itc) {
                        itc.classList.remove('dropTargetBefore', 'dropTargetAfter');
                    });
                    imagePreview.removeEventListener('dragover', onTaskEntryDragOver);
                }
            });
        }
        
        // Set up stop/remove task button
        const stopTaskBtn = container.querySelector('.stopTask');
        if (stopTaskBtn && task) {
            stopTaskBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                // Since isProcessing is false, this will just remove the task
                if (typeof removeTask === 'function') {
                    removeTask(container);
                } else if (typeof undoableRemove === 'function') {
                    // Remove from htmlTaskMap first if it exists
                    if (typeof htmlTaskMap !== 'undefined' && htmlTaskMap.has(container)) {
                        htmlTaskMap.delete(container);
                    }
                    undoableRemove(container);
                } else {
                    container.remove();
                }
            });
        }
        
        // Set up use settings button (disabled for loaded images)
        const useSettingsBtn = container.querySelector('.useSettings');
        if (useSettingsBtn) {
            useSettingsBtn.style.display = 'none'; // Hide since there are no settings to restore
        }
    }

    // Start the plugin when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForElementsAndInit);
    } else {
        waitForElementsAndInit();
    }

    console.log('Load Image Plugin loaded successfully');

})();

