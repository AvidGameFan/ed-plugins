/* 
 * LLM Prompt Generator Plugin
 *
 * v.1.2.1, last updated: 10/16/2025
 * By Gary W.
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 * 
 * This plugin adds an LLM button next to the prompt history dropdown.
 * Clicking the button calls a localhost:5000 API to generate detailed prompts
 * and inserts the result into the prompt field.
 */

(function() { 
    "use strict";

    // Configuration
    const config = {
        // apiEndpoint is resolved dynamically based on current host, forcing port 5000
        timeout: 90000, // 90 seconds
        maxRetries: 2
    };

    function resolveApiEndpoint() {
        try {
            const protocol = window.location.protocol || 'http:';
            const hostname = window.location.hostname || '127.0.0.1';
            return protocol + '//' + hostname + ':5000' + '/v1/completions';
        } catch (e) {
            return 'http://127.0.0.1:5000/v1/completions';
        }
    }

    // Create the LLM button
    function createLLMButton() {
        const llmButton = document.createElement('button');
        llmButton.id = 'llm_prompt_generator';
        llmButton.className = 'btn btn-primary';
        llmButton.innerHTML = '<i class="fa-solid fa-robot"></i> LLM';
        llmButton.title = 'Generate detailed prompt using LLM';
        llmButton.style.cssText = `
            padding: 6px 12px;
            font-size: 12px;
            height: auto;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        `;
        
        llmButton.addEventListener('click', onLLMButtonClick);
        return llmButton;
    }

    // Create the prompt type dropdown
    function createPromptTypeDropdown() {
        const dropdown = document.createElement('select');
        dropdown.id = 'llm_prompt_type';
        dropdown.title = 'Select prompt generation type';
        // dropdown.style.cssText = `
        //     margin-left: 5px;
        //     padding: 4px 8px;
        //     font-size: 12px;
        //     height: auto;
        //     border: 1px solid #ccc;
        //     border-radius: 4px;
        //     background-color: white;
        //     min-width: 100px;
        // `;
        
        // Add options for each prompt type
        Object.keys(promptTypes).forEach(typeKey => {
            const option = document.createElement('option');
            option.value = typeKey;
            option.textContent = promptTypes[typeKey].name;
            option.title = promptTypes[typeKey].description;
            dropdown.appendChild(option);
        });
        
        return dropdown;
    }

    // Create a container to wrap the LLM button and dropdown
    function createLLMContainer() {
        const container = document.createElement('div');
        container.id = 'llm_prompt_container';
        container.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin-left: 10px;
            flex-wrap: nowrap;
            white-space: nowrap;
        `;
        
        const llmButton = createLLMButton();
        const promptTypeDropdown = createPromptTypeDropdown();
        
        container.appendChild(llmButton);
        container.appendChild(promptTypeDropdown);
        
        return container;
    }

    // Insert the LLM container next to the prompt history dropdown if present,
    // otherwise append it after the negative prompt section
    function insertLLMButton() {
        if (document.querySelector('#llm_prompt_generator')) return;
        const promptHistoryDropdown = document.querySelector('#prompt_history');
        const llmContainer = createLLMContainer();
        
        if (promptHistoryDropdown) {
            // Insert container after the prompt history dropdown
            promptHistoryDropdown.parentNode.insertBefore(llmContainer, promptHistoryDropdown.nextSibling);
            console.log('LLM Prompt Generator container added next to prompt history');
            return;
        }
        // Fallback: place after negative prompt section
        try {
            const negField = (typeof negativePromptField !== 'undefined' && negativePromptField)
                ? negativePromptField
                : document.querySelector('#negative_prompt');
            if (negField && negField.parentNode && negField.parentNode.parentNode) {
                negField.parentNode.parentNode.insertBefore(llmContainer, null);
                console.log('LLM Prompt Generator container added after negative prompt');
            }
        } catch (e) {
            // noop
        }
    }

    // Click handler for the LLM button
    async function onLLMButtonClick() {
        const promptField = document.querySelector('#prompt');
        if (!promptField) {
            showNotification('Prompt field not found', 'error');
            return;
        }

        // Get selected prompt type from dropdown
        const promptTypeDropdown = document.querySelector('#llm_prompt_type');
        const selectedPromptType = promptTypeDropdown ? promptTypeDropdown.value : 'enhance';
        const typeConfig = promptTypes[selectedPromptType];

        // Get current prompt as context
        const currentPrompt = promptField.value.trim();
        
        // Check if input is required for this prompt type
        if (typeConfig.requiresInput && !currentPrompt) {
            showNotification(`Please enter a prompt first to use ${typeConfig.name} mode`, 'warning');
            return;
        }

        // Show loading state
        const button = document.querySelector('#llm_prompt_generator');
        const originalText = button.innerHTML;
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${typeConfig.name}ing...`;
        button.disabled = true;

        // Get the appropriate line ending for the current platform
        const lineEnding = getLineEnding();
        
        // Parse existing prompts to get count
        const existingPrompts = currentPrompt ? currentPrompt.split(/\r?\n/).filter(p => p.trim()) : [];
        const numExistingPrompts = existingPrompts.length;
        
        // Generate multiple prompts (1 by default, or based on existing count)
        const numToGenerate = Math.max(1, numExistingPrompts);
        const generatedPrompts = [];
        let successCount = 0;

        for (let i = 0; i < numToGenerate; i++) {
            try {
                const generatedPrompt = await generatePromptWithLLM(existingPrompts[i], selectedPromptType);
                
                if (generatedPrompt) {
                    // Clean up the generated prompt
                    const cleanedPrompt = cleanPromptText(generatedPrompt, lineEnding);
                    generatedPrompts.push(cleanedPrompt);
                    successCount++;
                }
            } catch (error) {
                console.error(`Error generating prompt ${i + 1}:`, error);
                // Continue with other generations even if one fails
            }
        }

        if (generatedPrompts.length > 0) {
            // Combine existing and new prompts
            let finalPrompt = '';
            finalPrompt += generatedPrompts.join(lineEnding);
            
            // Insert the combined prompts into the field
            promptField.value = finalPrompt;
            
            // Trigger any change events that might be needed
            promptField.dispatchEvent(new Event('input', { bubbles: true }));
            promptField.dispatchEvent(new Event('change', { bubbles: true }));
            
            showNotification(`Generated ${successCount} ${typeConfig.name.toLowerCase()} prompt${successCount !== 1 ? 's' : ''} successfully!`, 'success');
        } else {
            showNotification('No prompts generated', 'warning');
        }
        
        // Restore button state
        button.innerHTML = originalText;
        button.disabled = false;
    }


    // Get the appropriate line ending for the current platform
    function getLineEnding() {
        // Detect platform line ending
        if (typeof navigator !== 'undefined' && navigator.platform) {
            if (navigator.platform.indexOf('Win') !== -1) {
                return '\r\n'; // Windows
            }
        }
        return '\n'; // Unix/Linux/Mac (default)
    }

    // Clean up prompt text by removing extra line endings and normalizing
    function cleanPromptText(text, lineEnding) {
        if (!text) return '';
        
        // Remove all line endings and replace with spaces
        let cleaned = text.replace(/\r?\n/g, ' ');
        
        // Remove extra whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        // Handle quoted text - if there's a leading quote, find the matching end quote
        if (cleaned.startsWith('"') || cleaned.startsWith("'")) {
            const startQuote = cleaned[0];
            const endQuoteIndex = cleaned.indexOf(startQuote, 1);
            
            if (endQuoteIndex !== -1) {
                // Extract content between quotes
                cleaned = cleaned.substring(1, endQuoteIndex);
            } else {
                // No matching end quote found, use the entire string after the opening quote
                cleaned = cleaned.substring(1);
            }
        }
        
        return cleaned;
    }

    //Model needs to have "xl" in the filename to be recognized as an xl model.
    //add any special cases as needed.
    function isModelXl(modelName) {
        let result = false;
        if (modelName.search(/xl/i)>=0 || modelName.search(/playground/i)>=0 || modelName.search(/disneyrealcartoonmix/i)>=0  || modelName.search(/mobius/i)>=0 
        || modelName.search(/zovya/i)>=0) {  //Zovya models appear to mostly be Pony XL -- need to update if there are SD 1.5 models instead
        result = true;
        }  
        return result;
    }

    function isModelFlux(modelName) {
        if (modelName == stableDiffusionModelField.value  // These model-check functions are only accurate if using the same model that's in the input field
          && ((typeof isFluxModel === 'function' && isFluxModel())
          || (typeof isChromaModel === 'function' && isChromaModel()))) {  // newer ED functions added around 10/2025
          return true;
        }
        //if we're unsure from the internal check, use the filename as a fall-back.
        
        // Combined regex for all Flux-related terms
        return /flux|lyhAnime_kor|chroma|sd3|qwen/i.test(modelName);
      }

    // Prompt type configurations
    const promptTypes = {
        enhance: {
            name: 'Enhance',
            description: 'Improve and expand existing prompt with more details',
            systemPrompt: `You are an expert at creating detailed, artistic prompts for AI image generation. 
Generate creative, descriptive prompts that include artistic terms, lighting, composition, style, and technical details.
Focus on visual elements and avoid extraneous information. Keep prompts concise but detailed.
Do not include any other text than the prompt.`,
            userPromptTemplate: (currentPrompt) => 
                currentPrompt 
                    ? `Improve and expand this image prompt with more artistic and technical details: "${currentPrompt}"`
                    : 'Create an image prompt using a subject and artistic and technical details',
            temperature: 0.7,
            requiresInput: false
        },
        variation: {
            name: 'Variation',
            description: 'Create creative variations with somewhat different artistic directions',
            systemPrompt: `You are an expert at creating creative variations of AI image generation prompts. 
Your goal is to take an existing prompt and create a slightly different prompt that explores alternative artistic directions, styles, compositions, or interpretations.
Or, change the subject and use the same artistic style. Do not change all elements of the prompt, just make it slightly different. Maintain most elements of the original prompt.
Focus on visual elements and avoid extraneous information. Keep prompts concise but detailed, adding elements as needed.
Do not include any other text than the prompt.`,
            userPromptTemplate: (currentPrompt) => 
                `Create a creative variation of this image prompt. Make it somewhat different while maintaining artistic quality: "${currentPrompt}"
Think about: different art styles, alternative lighting, new compositions, different moods, creative reinterpretations, or artistic techniques.`,
            temperature: 0.8,
            requiresInput: true
        },
        difference: {
            name: 'Difference',
            description: 'Create creative, large variations with different artistic directions',
            systemPrompt: `You are an expert at creating creative variations of AI image generation prompts. 
Your goal is to take an existing prompt and create a NEW, DIFFERENT prompt that explores alternative artistic directions, styles, compositions, or interpretations.
Consider, what is the character?  What is the character doing and interacting with? 
Be creative and divergent - change the mood, style, lighting, composition, artistic approach, or subject interpretation. Or, change the subject and use the same artistic style.
Not all elements need to be changed - sometimes it's better to change only one or two elements to create a new and interesting variation.
Focus on visual elements and avoid extraneous information. Keep prompts concise but detailed, adding elements as needed.
Do not include any other text than the prompt.`,
            userPromptTemplate: (currentPrompt) => 
                `Create a creative variation of this image prompt. Make it significantly different while maintaining artistic quality: "${currentPrompt}"
Think about: different art styles, alternative lighting, new compositions, different moods, creative reinterpretations, or artistic techniques.`,
            temperature: 0.8,
            requiresInput: true
        },
        booru: {
            name: 'Booru',
            description: 'Improve and expand existing prompt with more details and booru tags',
            systemPrompt: `You are an expert at creating creative variations of AI image generation prompts. 
Your goal is to take an existing prompt and embellish it using a few booru-style tags. This is more commonly used for anime prompts.
Focus on visual elements and avoid extraneous information. Keep prompts concise but detailed, adding elements as needed. 
Not all elements of the prompt need to be turned into booru tags.
Use tags appropriately, taking care not to mix styles and types haphazardly nor randomly. For example, don't mix anime-related tags with painterly or brush stroke.
Keep most of the prompt descriptive, only adding a few booru tags. Some booru tags can be varied by color or other minor changes.
Do not include any other text than the prompt. Here is an example (partial) list of possible tags (comma-separated): 1girl, 1boy, female, solo, from above, from side, holding sword,
battoujutsu stance, fighting stance, ready to draw, shirt, long sleeves, jacket, white shirt, necktie, collared shirt, pants, miniskirt, skirt, black jacket, floating hair,
unsheathing, katana, hair between eyes, looking at viewer, looking away, parted lips, absurdres, fingerless gloves, thighhighs, full body, cowboy shot, hand on own hip, contrapposto,
painterly, brush stroke, masterpiece, portrait, landscape, digitigrade, furry, feral, sidelocks, ahoge, bangs, ponytail, twintails, braids, blush, 1980s (style), 1990s (style), 2000s (style), retro artstyle,
mole, fang, closed mouth, scarf, jeans, grin, blonde hair, mug, alcohol, green eyes, white hair, brown hair, multicolored hair, long hair, dark skin, tan, earrings, hair ornament, sunglasses, holding food,
^ ^, > <, v, one eye closed, shoes, crop top, black gloves, blue eyes, clenched teeth, official art, anime coloring, cel rendering, outline, synthwave, vaporwave, cyberpunk, steampunk, happy, nervous`,
            userPromptTemplate: (currentPrompt) => 
                currentPrompt 
                ? `Improve and expand this image prompt with more artistic and technical details, adding booru tags as appropriate: "${currentPrompt}"`
                : 'Create an image prompt using a subject and artistic and technical details, including booru tags.',
            temperature: 0.8,
            requiresInput: false
        }
    };

    // Call the LLM API to generate a prompt based on type
    async function generatePromptWithLLM(currentPrompt = '', promptType = 'enhance') {
        const typeConfig = promptTypes[promptType];
        if (!typeConfig) {
            throw new Error(`Unknown prompt type: ${promptType}`);
        }

        // Check if input is required for this prompt type
        if (typeConfig.requiresInput && !currentPrompt.trim()) {
            throw new Error(`Prompt type '${promptType}' requires an existing prompt`);
        }

        // Create system prompt with model-specific token limit
        const systemPrompt = typeConfig.systemPrompt + 
            (!isModelFlux($("#editor-settings #stable_diffusion_model")[0].dataset.path) 
                ? " Please keep it brief. It's an SDXL model with a 75 token limit." 
                : "");

        // Generate user prompt
        const userPrompt = typeConfig.userPromptTemplate(currentPrompt);

        const requestPayload = {
            prompt: `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`,
            max_tokens: 235,
            temperature: typeConfig.temperature,
            top_p: 0.95,
            top_k: 20,
            stop: ["\nUser:", "\nHuman:", "\nAssistant:", "\nAI:"]
        };

        let lastError;
        
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), config.timeout);

                const response = await fetch(resolveApiEndpoint(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestPayload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.error(`HTTP error! status: ${response.status}`);
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                // Handle OpenAI-compatible completions response
                if (data.choices && data.choices.length > 0) {
                    const generatedText = data.choices[0].text.trim();
                    if (generatedText) {
                        return generatedText;
                    }
                    console.error(`No Choices found in data response`);
                }

                console.error(`No completion found in response`);
                throw new Error('No completion found in response');

            } catch (error) {
                lastError = error;
                console.warn(`LLM API attempt ${attempt} failed:`, error.message);
                
                if (attempt < config.maxRetries) {
                    // Wait before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }

        throw lastError || new Error('All retry attempts failed');
    }

    // Show notification to user
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 15px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;

        // Set background color based on type
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#4CAF50';
                break;
            case 'error':
                notification.style.backgroundColor = '#f44336';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ff9800';
                break;
            default:
                notification.style.backgroundColor = '#2196F3';
        }

        // Add CSS animation if not already present
        if (!document.querySelector('#llm-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'llm-notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        // Add to page
        document.body.appendChild(notification);

        // Remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    // Wait for the prompt history dropdown to be available and insert our button
    function waitForPromptHistoryAndInsert() {
        let tries = 0;
        const maxTries = 100;
        const interval = setInterval(() => {
            tries++;
            const hasHistory = !!document.querySelector('#prompt_history');
            const hasNegative = (typeof negativePromptField !== 'undefined' && negativePromptField) || document.querySelector('#negative_prompt');
            if (hasHistory || hasNegative) {
                clearInterval(interval);
                insertLLMButton();
            } else if (tries >= maxTries) {
                clearInterval(interval);
                console.warn('LLM Prompt Generator: UI anchors not found after maximum attempts');
            }
        }, 100);
    }

    // Initialize the plugin
    function init() {
        // Try to insert immediately if elements are already available
        if (document.querySelector('#prompt_history')) {
            insertLLMButton();
        } else {
            // Wait for elements to be available
            waitForPromptHistoryAndInsert();
        }
    }

    // Start the plugin when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('LLM Prompt Generator Plugin loaded successfully');

})(); 