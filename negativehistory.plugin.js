// Negative History
// v. 1.1
//
// Saves the negative prompt, and certain other settings, when generating.
// Restores the negative prompt when selecting a new model.
//
// Created on 5/9/2025
// Last Modified on 3/17/2026


(function() { "use strict"

    //const numberPrompts = 20;  // number of prompts to keep in history
    const modelNegativePromptHistory = {};  // Store negative prompts by model
    
    // Listen for model changes
    document.querySelector("#stable_diffusion_model").addEventListener('change', function(e) {
        const modelName = e.target.value;
        applyLastNegativePrompt(modelName);
    });
    
    // Merge localStorage into the in-memory object, keeping the newest entry per model.
    // Called before every save and before every apply, so multiple windows stay in sync.
    function mergeFromStorage() {
        const raw = localStorage.getItem('modelNegativePromptHistory');
        if (!raw) return;
        try {
            const stored = JSON.parse(raw);
            for (const [model, entry] of Object.entries(stored)) {
                const existing = modelNegativePromptHistory[model];
                if (!existing || (entry.timestamp || 0) > (existing.timestamp || 0)) {
                    modelNegativePromptHistory[model] = entry;
                }
            }
        } catch(e) { /* ignore corrupt data */ }
    }

    // When another window writes to localStorage, merge their changes into our cache.
    window.addEventListener('storage', function(e) {
        if (e.key === 'modelNegativePromptHistory') {
            mergeFromStorage();
        }
    });

    function saveNegativePromptToHistory(modelName, negativePrompt) {
        if (!modelName) return;

        // Always merge first so we never overwrite entries saved by another window.
        mergeFromStorage();

        modelNegativePromptHistory[modelName] = {
            negativePrompt: negativePrompt,
            steps: numInferenceStepsField.value,
            guidance: guidanceScaleField.value,
            use_vae_model: vaeModelField.value,
            use_text_encoder_model: {
                modelNames: textEncoderModelField.value.modelNames || [],
                modelWeights: textEncoderModelField.value.modelWeights || []
            },
            clip_skip: clipSkipField.value,
            timestamp: Date.now()
        };

        // Save to localStorage
        localStorage.setItem('modelNegativePromptHistory', JSON.stringify(modelNegativePromptHistory));
    }
    
    function applyLastNegativePrompt(modelName) {
        // Merge latest data from localStorage (including other windows' saves)
        mergeFromStorage();
    
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
            if (history.clip_skip !== undefined) {  //older history entries may not have this
                if (clipSkipField) clipSkipField.value = history.clip_skip;
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