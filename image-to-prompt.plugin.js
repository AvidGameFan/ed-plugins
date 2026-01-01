/* 
 * Image to Prompt Plugin
 *
 * v.1.0.0, last updated: 12/30/2025
 * Initial version by GitHub Copilot, modified by Gary W.
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 * 
 * This plugin adds a button to existing images that sends the image to an LLM
 * with vision capabilities to analyze it and generate a suitable Stable Diffusion prompt.
 * 
 * Requires an OpenAI-compatible API that supports vision (chat/completions endpoint):
 * - OpenAI GPT-4 Vision API
 * - Azure OpenAI Service with GPT-4 Vision
 * - Local LLM with vision support (e.g., LLaVA via llama.cpp server)
 * 
 */

//needs to be outside of the wrapper, as the input items are in the main UI.
//These initial values can be overwritten upon startup -- do not rely on these as defaults.
var ImageToPromptSettings = {
    apiUrl: "",  // Base URL with port (e.g., "http://127.0.0.1:1234")
    apiKey: "",  // API key for authentication (leave empty for local LLMs)
    model: "llama-joycaption-beta-one-hf-llava-GGUF" //"gpt-4-vision-preview"  // Model name (e.g., "gpt-4-vision-preview", "gpt-4o", "llava")
};

(function() { 
    "use strict";
    
    PLUGINS['IMAGE_INFO_BUTTONS'].push([
        { html: '<span class="region-label" style="background-color:transparent;background: rgba(0,0,0,0.5)">'
        +'LLM Extract Prompt:</span>', type: 'label'},
        { html: '<i class="fa-solid fa-eye"></i>', on_click: onImageToPromptClick, filter: onImageToPromptFilter }
    ])

    // Configuration
    const config = {
        timeout: 120000, // 120 seconds for vision models
        maxRetries: 2,
        maxImageSize: 2048 // Resize images larger than this to avoid token limits
    };

    function resolveApiEndpoint() {
        // Check if custom URL is set in settings
        if (ImageToPromptSettings.apiUrl && ImageToPromptSettings.apiUrl.trim() !== "") {
            const baseUrl = ImageToPromptSettings.apiUrl.trim();
            // Remove trailing slash if present
            const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            // Ensure it ends with /chat/completions
            if (!cleanUrl.endsWith('/v1/chat/completions')) {
                return cleanUrl + '/v1/chat/completions';
            }
            return cleanUrl;
        }
        
        // Default to localhost Ollama-style endpoint
        try {
            const protocol = window.location.protocol || 'http:';
            const hostname = window.location.hostname || '127.0.0.1';
            return protocol + '//' + hostname + ':1234/v1/chat/completions';
        } catch (e) {
            return 'http://127.0.0.1:1234/v1/chat/completions';
        }
    }

    // Convert image to base64 data URL
    async function imageToBase64(imageElement) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate dimensions (resize if needed to stay under maxImageSize)
                let width = imageElement.naturalWidth || imageElement.width;
                let height = imageElement.naturalHeight || imageElement.height;
                
                const maxSize = config.maxImageSize;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    } else {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw image to canvas
                ctx.drawImage(imageElement, 0, 0, width, height);
                
                // Convert to base64 (JPEG for smaller size)
                const base64Data = canvas.toDataURL('image/jpeg', 0.85);
                resolve(base64Data);
            } catch (error) {
                reject(error);
            }
        });
    }

    // Determine if the current model is Flux-based (for different prompt styles)
    function isModelFlux(modelName) {
        if (!modelName) return false;
        return /flux|lyhAnime_kor|chroma|sd3|qwen/i.test(modelName);
    }

    // Get current Stable Diffusion model name
    function getCurrentModelName() {
        try {
            const modelField = document.querySelector('#editor-settings #stable_diffusion_model');
            if (modelField) {
                return modelField.dataset.path || modelField.value || '';
            }
        } catch (e) {
            console.warn('Could not determine current model:', e);
        }
        return '';
    }

    // Generate prompt from image using LLM vision API
    async function analyzeImageWithLLM(base64Image) {
        const currentModel = getCurrentModelName();
        const isFlux = isModelFlux(currentModel);
        
        // Construct system prompt based on model type
        const systemPrompt = isFlux
            ? `You are an expert at analyzing images and creating detailed prompts for Flux AI image generation models.
Your task is to analyze the provided image and generate a detailed, descriptive prompt that would recreate it.
Focus on: subject, composition, lighting, colors, mood, artistic style, technical details, and visual elements.
Flux models support longer, more natural language prompts. Be descriptive and specific.  Avoid mixing styles - choose one coherent style.
Do not include any preamble or explanation - only return the prompt itself.`
            : `You are an expert at analyzing images and creating detailed prompts for SDXL/Stable Diffusion image generation.
Your task is to analyze the provided image and generate a concise but detailed prompt that would recreate it.
Focus on: subject, composition, lighting, colors, mood, artistic style, and key visual elements.
Keep the prompt under 75 tokens due to SDXL limitations. Use comma-separated phrases. Avoid mixing styles - choose one coherent style.
Do not include any preamble or explanation - only return the prompt itself.`;

        const userPrompt = "Analyze this image and create a detailed Stable Diffusion prompt that would generate a similar image.";

        const messages = [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: userPrompt
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: base64Image
                        }
                    }
                ]
            }
        ];

        const requestPayload = {
            model: ImageToPromptSettings.model,
            messages: messages,
            max_tokens: isFlux ? 500 : 200,
            temperature: 0.7
        };

        const headers = {
            'Content-Type': 'application/json'
        };

        // Add API key if provided
        if (ImageToPromptSettings.apiKey && ImageToPromptSettings.apiKey.trim() !== "") {
            headers['Authorization'] = `Bearer ${ImageToPromptSettings.apiKey.trim()}`;
        }

        let lastError;
        
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), config.timeout);

                const response = await fetch(resolveApiEndpoint(), {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(requestPayload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API returned ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                
                // Handle OpenAI-compatible chat completions response
                if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                    const content = data.choices[0].message.content;
                    if (content && content.trim()) {
                        return cleanPromptText(content.trim());
                    }
                }

                console.error('No completion found in response:', data);
                throw new Error('No completion found in response');

            } catch (error) {
                lastError = error;
                console.warn(`Image analysis attempt ${attempt} failed:`, error.message);
                
                if (attempt < config.maxRetries) {
                    // Wait before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }

        throw lastError || new Error('All retry attempts failed');
    }

    // Clean up prompt text
    function cleanPromptText(text) {
        if (!text) return '';
        
        // Remove any markdown formatting
        text = text.replace(/```.*?```/gs, '');
        text = text.replace(/`/g, '');
        
        // Remove quotes if the entire text is wrapped in them
        text = text.trim();
        if ((text.startsWith('"') && text.endsWith('"')) || 
            (text.startsWith("'") && text.endsWith("'"))) {
            text = text.slice(1, -1);
        }
        
        // Remove any "Prompt:" or similar prefixes
        text = text.replace(/^(prompt|image prompt|stable diffusion prompt):\s*/i, '');
        
        // Normalize whitespace
        text = text.replace(/\s+/g, ' ').trim();
        
        return text;
    }

    // Button click handler
    async function onImageToPromptClick(origRequest, image) {
        const promptField = document.querySelector('#prompt');
        if (!promptField) {
            showNotification('Prompt field not found', 'error');
            return;
        }

        if (!image) {
            showNotification('Image not found', 'error');
            return;
        }

        // Check if settings are configured
        if (!ImageToPromptSettings.apiUrl || ImageToPromptSettings.apiUrl.trim() === "") {
            showNotification('Please configure Image to Prompt settings first', 'warning');
            return;
        }

        // Show loading notification
        const loadingNotification = showNotification('Analyzing image...', 'info', true);

        try {
            // Convert image to base64
            const base64Image = await imageToBase64(image);
            
            // Analyze image with LLM
            const generatedPrompt = await analyzeImageWithLLM(base64Image);
            
            if (generatedPrompt) {
                // Insert the generated prompt
                promptField.value = generatedPrompt;
                
                // Trigger change events
                promptField.dispatchEvent(new Event('input', { bubbles: true }));
                promptField.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Remove loading notification
                if (loadingNotification) {
                    loadingNotification.remove();
                }
                
                showNotification('Prompt generated successfully!', 'success');
            } else {
                throw new Error('No prompt generated');
            }
        } catch (error) {
            console.error('Error analyzing image:', error);
            
            // Remove loading notification
            if (loadingNotification) {
                loadingNotification.remove();
            }
            
            let errorMessage = 'Failed to analyze image';
            if (error.message.includes('401')) {
                errorMessage = 'Authentication failed - check your API key';
            } else if (error.message.includes('404')) {
                errorMessage = 'API endpoint not found - check your URL';
            } else if (error.message.includes('timeout') || error.message.includes('aborted')) {
                errorMessage = 'Request timed out - try again';
            }
            
            showNotification(errorMessage, 'error');
        }
    }

    // Button filter - always show
    function onImageToPromptFilter(origRequest, image) {
        return true; //{ text: 'Analyze Image', icon: 'fa-solid fa-eye' };
    }

    // Show notification to user
    function showNotification(message, type = 'info', persistent = false) {
        // Create notification element
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.className = 'image-to-prompt-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            max-width: 350px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;

        // Set background color based on type
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#28a745';
                break;
            case 'error':
                notification.style.backgroundColor = '#dc3545';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ffc107';
                notification.style.color = '#333';
                break;
            default:
                notification.style.backgroundColor = '#17a2b8';
        }

        // Add CSS animation if not already present
        if (!document.querySelector('#image-to-prompt-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'image-to-prompt-notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Add to page
        document.body.appendChild(notification);

        // Remove after delay unless persistent
        if (!persistent) {
            setTimeout(() => {
                notification.style.animation = 'slideIn 0.3s ease-out reverse';
                setTimeout(() => notification.remove(), 300);
            }, 5000);
        }

        return notification;
    }

    // Setup settings UI
    function setup() {
        // Add new UI panel to left sidebar
        const imageToPromptSettings = document.createElement('div');
        imageToPromptSettings.id = 'image-to-prompt-settings';
        imageToPromptSettings.classList.add('settings-box');
        imageToPromptSettings.classList.add('panel-box');
        
        imageToPromptSettings.innerHTML = `
            <h4 class="collapsible">
                <i class="fa-solid fa-eye"></i> Image to Prompt Settings
                <i id="reset-image-to-prompt-settings" class="fa-solid fa-arrow-rotate-left section-button">
                    <span class="simple-tooltip top-left">
                    Reset Image to Prompt Settings
                    </span>
                </i>
            </h4>
            <div id="image-to-prompt-settings-entries" class="collapsible-content" style="display: block;">
                <div>
                    <p>
                        Configure the LLM API endpoint for image analysis. Supports OpenAI, Azure OpenAI, 
                        or local LLMs with vision capabilities (e.g., LLaVA via llama.cpp).
                    </p>
                    <p>
                        <b>Examples:</b><br>
                        OpenAI: <code>https://api.openai.com</code><br>
                        Ollama: <code>http://localhost:11434</code><br>
                        LM Studio: <code>http://localhost:1234</code>
                    </p>
                </div>
                
                <div class="input-group">
                    <label for="image_to_prompt_api_url">API URL:</label>
                    <input id="image_to_prompt_api_url" 
                           name="image_to_prompt_api_url" 
                           size="50" 
                           placeholder="http://localhost:1234"
                           onchange="setImageToPromptSettings()"
                           autocomplete="off">
                    <small>Base URL ending (will append /v1/chat/completions)</small>
                </div>
                
                <div class="input-group">
                    <label for="image_to_prompt_api_key">API Key (optional):</label>
                    <input id="image_to_prompt_api_key" 
                           name="image_to_prompt_api_key" 
                           type="password"
                           size="50" 
                           placeholder="sk-..."
                           onchange="setImageToPromptSettings()"
                           autocomplete="off">
                    <small>Leave empty for local LLMs without authentication</small>
                </div>
                
                <div class="input-group">
                    <label for="image_to_prompt_model">Model Name:</label>
                    <input id="image_to_prompt_model" 
                           name="image_to_prompt_model" 
                           size="50" 
                           placeholder="gpt-4-vision-preview, llava, etc."
                           onchange="setImageToPromptSettings()"
                           autocomplete="off">
                    <small>Vision-capable model (e.g., gemma-3, gpt-4o, llava, bakllava)</small>
                </div>
                
                <div class="input-group">
                    <button id="image_to_prompt_reset" 
                            class="btn btn-secondary" 
                            onclick="imageToPromptResetSettings(event)">
                        Reset to Defaults
                    </button>
                </div>
                
                <div>
                    <small><i>Note: Requires a vision-capable LLM. For local use, try Ollama with LLaVA or bakLLaVA models.</i></small>
                </div>
            </div>
        `;
        
        // Insert after the LLM settings if it exists, otherwise at the end of settings
        const llmSettings = document.querySelector('#llm-settings');
        const settingsBox = document.querySelector('#settings');
        
        if (llmSettings && llmSettings.parentNode) {
            llmSettings.parentNode.insertBefore(imageToPromptSettings, llmSettings.nextSibling);
        } else if (settingsBox) {
            settingsBox.appendChild(imageToPromptSettings);
        }
        
        // Make collapsible using the built-in function
        createCollapsibles(imageToPromptSettings);
        
        // Add reset button event listener
        const resetIcon = document.getElementById('reset-image-to-prompt-settings');
        if (resetIcon) {
            resetIcon.addEventListener('click', imageToPromptResetSettings);
        }
        
        // Load saved settings
        imageToPromptResetSettings(null);
        
        // Create "Extract Prompt" button for init_image
        createExtractPromptButton();
    }

    // Create button to extract prompt from init_image
    function createExtractPromptButton() {
        // Wait for init_image_buttons to be available
        let tries = 0;
        const interval = setInterval(() => {
            tries++;
            const initImageButtons = document.querySelector('#init_image_buttons');
            
            if (initImageButtons) {
                clearInterval(interval);
                
                // Create the Extract Prompt button
                const extractBtn = document.createElement('button');
                extractBtn.id = 'extract_prompt_btn';
                extractBtn.className = 'btn btn-primary';
                extractBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Extract Prompt';
                extractBtn.title = 'Analyze the init image and generate a prompt';
                extractBtn.style.cssText = `
                    padding: 6px 12px;
                    font-size: 12px;
                    height: auto;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    margin-left: 10px;
                `;
                
                // Add click handler
                extractBtn.addEventListener('click', onExtractPromptClick);
                
                // Insert after init_image_buttons
                initImageButtons.parentNode.insertBefore(extractBtn, initImageButtons.nextSibling);
                console.log('Image to Prompt Plugin: Extract Prompt button added');
            }
            
            // Give up after some time
            if (tries > 100) {
                clearInterval(interval);
                console.warn('Image to Prompt Plugin: Timed out waiting for init_image_buttons');
            }
        }, 100);
    }

    // Handle Extract Prompt button click
    async function onExtractPromptClick() {
        const promptField = document.querySelector('#prompt');
        if (!promptField) {
            showNotification('Prompt field not found', 'error');
            return;
        }

        // Check if settings are configured
        if (!ImageToPromptSettings.apiUrl || ImageToPromptSettings.apiUrl.trim() === "") {
            showNotification('Please configure Image to Prompt settings first', 'warning');
            return;
        }

        // Get the init image preview
        const initImagePreview = document.querySelector('#init_image_preview');
        if (!initImagePreview) {
            showNotification('No init image found', 'warning');
            return;
        }

        // The init_image_preview is an img element
        const imageElement = initImagePreview;
        
        // Check if image has a source
        if (!imageElement.src || imageElement.src === '') {
            showNotification('No init image loaded', 'warning');
            return;
        }

        // Show loading notification
        const loadingNotification = showNotification('Analyzing init image...', 'info', true);

        try {
            // Convert image to base64
            const base64Image = await imageToBase64(imageElement);
            
            // Analyze image with LLM
            const generatedPrompt = await analyzeImageWithLLM(base64Image);
            
            if (generatedPrompt) {
                // Insert the generated prompt
                promptField.value = generatedPrompt;
                
                // Trigger change events
                promptField.dispatchEvent(new Event('input', { bubbles: true }));
                promptField.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Remove loading notification
                if (loadingNotification) {
                    loadingNotification.remove();
                }
                
                showNotification('Prompt extracted successfully!', 'success');
            } else {
                throw new Error('No prompt generated');
            }
        } catch (error) {
            console.error('Error analyzing init image:', error);
            
            // Remove loading notification
            if (loadingNotification) {
                loadingNotification.remove();
            }
            
            let errorMessage = 'Failed to analyze image';
            if (error.message.includes('401')) {
                errorMessage = 'Authentication failed - check your API key';
            } else if (error.message.includes('404')) {
                errorMessage = 'API endpoint not found - check your URL';
            } else if (error.message.includes('timeout') || error.message.includes('aborted')) {
                errorMessage = 'Request timed out - try again';
            }
            
            showNotification(errorMessage, 'error');
        }
    }

    // Initialize the plugin
    function init() {
        try {
            setup();
            console.log('Image to Prompt Plugin: Settings panel initialized');
        } catch (error) {
            console.error('Error setting up Image to Prompt settings:', error);
        }
    }

    // Start the plugin when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('Image to Prompt Plugin loaded successfully');

})();


// Save settings to localStorage
function setImageToPromptSettings() {
    const apiUrlField = document.getElementById('image_to_prompt_api_url');
    const apiKeyField = document.getElementById('image_to_prompt_api_key');
    const modelField = document.getElementById('image_to_prompt_model');
    
    if (apiUrlField) {
        ImageToPromptSettings.apiUrl = apiUrlField.value;
    }
    if (apiKeyField) {
        ImageToPromptSettings.apiKey = apiKeyField.value;
    }
    if (modelField) {
        ImageToPromptSettings.model = modelField.value;
    }
    
    localStorage.setItem('ImageToPrompt_Plugin_Settings', JSON.stringify(ImageToPromptSettings));
}

// Load settings from localStorage or set defaults
function imageToPromptResetSettings(reset) {
    let settings = JSON.parse(localStorage.getItem('ImageToPrompt_Plugin_Settings'));
    
    if (settings == null || reset != null) {
        // Set defaults
        ImageToPromptSettings.apiUrl = "http://localhost:1234";
        ImageToPromptSettings.apiKey = "";
        ImageToPromptSettings.model = "llava";
    } else {
        // Load from storage
        ImageToPromptSettings.apiUrl = settings.apiUrl || "";
        ImageToPromptSettings.apiKey = settings.apiKey || "";
        ImageToPromptSettings.model = settings.model || "llava";
    }

    // Update UI fields
    const apiUrlField = document.getElementById('image_to_prompt_api_url');
    if (apiUrlField) {
        apiUrlField.value = ImageToPromptSettings.apiUrl;
    }
    
    const apiKeyField = document.getElementById('image_to_prompt_api_key');
    if (apiKeyField) {
        apiKeyField.value = ImageToPromptSettings.apiKey;
    }
    
    const modelField = document.getElementById('image_to_prompt_model');
    if (modelField) {
        modelField.value = ImageToPromptSettings.model;
    }

    // Save settings
    localStorage.setItem('ImageToPrompt_Plugin_Settings', JSON.stringify(ImageToPromptSettings));
}
