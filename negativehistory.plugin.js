// Negative History
// v. 1.0
//
// Saves the negative prompt, and certain other settings, when generating.
// Restores the negative prompt when selecting a new model.
//
// Created on 5/9/2025
// Last Modified on 7/14/2025


(function() { "use strict"

    //const numberPrompts = 20;  // number of prompts to keep in history
    const modelNegativePromptHistory = {};  // Store negative prompts by model
    
    // Listen for model changes
    document.querySelector("#stable_diffusion_model").addEventListener('change', function(e) {
        const modelName = e.target.value;
        applyLastNegativePrompt(modelName);
    });
    
    function saveNegativePromptToHistory(modelName, negativePrompt) {
        if (!modelName) return;
        
        // Initialize history for this model if it doesn't exist
        //if (!modelNegativePromptHistory[modelName]) {
//            modelNegativePromptHistory[modelName] = [];
//        }
        
//        let history = modelNegativePromptHistory[modelName];
        
        // // Find and remove any existing entry with the same negative prompt
        // const existingIndex = history.findIndex(entry => entry.negativePrompt === negativePrompt);
        // if (existingIndex !== -1) {
        //     history.splice(existingIndex, 1);
        // }
        
        // Add new entry at the beginning
        // history.unshift({
        //     negativePrompt: negativePrompt,
        //     timestamp: Date.now()
        // });

        modelNegativePromptHistory[modelName] = {
            negativePrompt: negativePrompt,
            steps: numInferenceStepsField.value, //document.querySelector("#num_inference_steps").value,
            guidance: guidanceScaleField.value, //document.querySelector("#guidance_scale").value,
            use_vae_model: vaeModelField.value,
            use_text_encoder_model: {
                modelNames: textEncoderModelField.value.modelNames || [],
                modelWeights: textEncoderModelField.value.modelWeights || []
            },
            timestamp: Date.now()
        };

        // // Keep only last numberPrompts prompts
        // history = history.slice(0, numberPrompts);
        
        // Save to localStorage
        localStorage.setItem('modelNegativePromptHistory', JSON.stringify(modelNegativePromptHistory));
    }
    
    function applyLastNegativePrompt(modelName) {
        // Load history from localStorage if not already loaded
        if (Object.keys(modelNegativePromptHistory).length === 0) {
            const savedHistory = localStorage.getItem('modelNegativePromptHistory');
            if (savedHistory) {
                Object.assign(modelNegativePromptHistory, JSON.parse(savedHistory));
            }
        }
    
        // Get history for current model
        const history = modelNegativePromptHistory[modelName];
        if (history != undefined) {
            // Apply the associated negative prompt
            negativePromptField.value = history.negativePrompt;
            guidanceScaleField.value = history.guidance;
            numInferenceStepsField.value = history.steps;
            // Only assign if the field exists (for backward compatibility)
            if (history.use_vae_model !== undefined) {
                vaeModelField.value = history.use_vae_model;
            }
            if (history.use_text_encoder_model !== undefined) {
                textEncoderModelField.value = history.use_text_encoder_model;
            }
            if (history.use_text_encoder_model !== undefined) {
                let value = history.use_text_encoder_model;
                if (typeof value === "string") {
                    try { value = JSON.parse(value); } catch (e) { value = { modelNames: [], modelWeights: [] }; }
                }
                if (Array.isArray(value)) {
                    value = { modelNames: value, modelWeights: [] };
                }
                if (!value.modelNames) value.modelNames = [];
                if (!value.modelWeights) value.modelWeights = [];
                textEncoderModelField.value = value;
            }
        }

    }
    
    // Modify the existing saveImageStuff function to also save negative prompts
    function saveImageStuff() {
        const modelName = document.querySelector("#stable_diffusion_model").value;
        saveNegativePromptToHistory(modelName, negativePromptField.value);
    }
    
    makeImageBtn.addEventListener("click", saveImageStuff);
    // // Initialize by applying the last negative prompt for the current model
    // const currentModel = document.querySelector("#stable_diffusion_model").value;
    // applyLastNegativePrompt(currentModel);
    
    })();