/* 
 * LLM Prompt Generator Plugin
 *
 * v.1.1.0, last updated: 8/24/2025
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
            margin-left: 10px;
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

    // Insert the LLM button next to the prompt history dropdown if present,
    // otherwise append it after the negative prompt section
    function insertLLMButton() {
        if (document.querySelector('#llm_prompt_generator')) return;
        const promptHistoryDropdown = document.querySelector('#prompt_history');
        const llmButton = createLLMButton();
        if (promptHistoryDropdown) {
            promptHistoryDropdown.parentNode.insertBefore(llmButton, promptHistoryDropdown.nextSibling);
            console.log('LLM Prompt Generator button added next to prompt history');
            return;
        }
        // Fallback: place after negative prompt section
        try {
            const negField = (typeof negativePromptField !== 'undefined' && negativePromptField)
                ? negativePromptField
                : document.querySelector('#negative_prompt');
            if (negField && negField.parentNode && negField.parentNode.parentNode) {
                negField.parentNode.parentNode.insertBefore(llmButton, null);
                console.log('LLM Prompt Generator button added after negative prompt');
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

        // Get current prompt as context (optional)
        const currentPrompt = promptField.value.trim();
        
        // Show loading state
        const button = document.querySelector('#llm_prompt_generator');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
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
                const generatedPrompt = await generatePromptWithLLM(existingPrompts[i]);
                
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
            let finalPrompt = ''; //currentPrompt;
            
            // if (finalPrompt && !finalPrompt.endsWith(lineEnding)) {
            //     finalPrompt += lineEnding;
            // }
            
            finalPrompt += generatedPrompts.join(lineEnding);
            
            // Insert the combined prompts into the field
            promptField.value = finalPrompt;
            
            // Trigger any change events that might be needed
            promptField.dispatchEvent(new Event('input', { bubbles: true }));
            promptField.dispatchEvent(new Event('change', { bubbles: true }));
            
            showNotification(`Generated ${successCount} prompt${successCount !== 1 ? 's' : ''} successfully!`, 'success');
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

    // Call the LLM API to generate a prompt
    async function generatePromptWithLLM(currentPrompt = '') {
        // Create a system prompt that instructs the LLM to generate detailed image prompts
        const systemPrompt = `You are an expert at creating detailed, artistic prompts for AI image generation. 
Generate creative, descriptive prompts that include artistic terms, lighting, composition, style, and technical details.
Focus on visual elements and avoid extraneous information. Keep prompts concise but detailed.
Do not include any other text than the prompt.`;

        // Use the current prompt as context if provided, otherwise start fresh
        const userPrompt = currentPrompt 
            ? `Improve and expand this image prompt with more artistic and technical details: "${currentPrompt}"`
            : 'Generate a detailed, creative prompt for AI image generation';

        const requestPayload = {
            prompt: `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`,
            max_tokens: 235,
            temperature: 0.7,
            top_p: 0.95,
            top_k: 20,
            stop: ["\n\nUser:", "\n\nHuman:", "\n\nAssistant:", "\n\nAI:"]
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