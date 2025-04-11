
/* 
 * Prompt History
 *
 * v.1.9.1, last updated: 3/23/2025
 * By Gary W.
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 */



(function() { "use strict"


const numberPrompts = 20;  //number of prompts to keep in history

//setup field one time

// Insert prompt history dropdown after negative prompt
//const negativePromptField = document.querySelector("#negative_prompt");
const promptHistoryDropdown = document.createElement('select');
promptHistoryDropdown.id = 'prompt_history';
promptHistoryDropdown.className = 'form-select row';
promptHistoryDropdown.name = 'prompt_history';
promptHistoryDropdown.innerHTML = '<option value="">Select prompt from history...</option>';

// Insert the dropdown after the negative prompt element
//negativePromptField.parentNode.insertBefore(promptHistoryDropdown, negativePromptField.nextSibling);
//put it at the bottom of the prompt block
negativePromptField.parentNode.parentNode.insertBefore(promptHistoryDropdown, null);

//  These are pre-defined in main
// let promptField = document.querySelector("#prompt")
///let promptHistoryDropdown = document.querySelector("#prompt_history") // Add this line

updatePromptHistoryDropdown();

// Modify the storage structure to include negative prompts
//If prompt and negative prompt have already been saved, replace earlier entry (remove), then add this one.
function savePromptToHistory(prompt, negativePrompt) {
    let history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
    
    // Find and remove any existing entry with the same prompt and negative prompt
    const existingIndex = history.findIndex(entry => 
        entry.prompt === prompt && 
        entry.negativePrompt === negativePrompt
    );
    
    if (existingIndex !== -1) {
        history.splice(existingIndex, 1);
    }
    
    // Add new entry at the beginning
    history.unshift({
        prompt: prompt,
        negativePrompt: negativePrompt,
        timestamp: Date.now()
    });

    // Keep only last numberPrompts prompts
    history = history.slice(0, numberPrompts);

    localStorage.setItem('promptHistory', JSON.stringify(history));
    updatePromptHistoryDropdown();
}

function updatePromptHistoryDropdown() {
    // Clear existing options except the first one
    while (promptHistoryDropdown.options.length > 1) {
        promptHistoryDropdown.remove(1);
    }

    const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
    
    // Only proceed if we have history entries
    if (history && history.length > 0) {
        history.forEach((entry, index) => {
            if (entry && entry.prompt) {  // Check if entry and prompt exist
                const option = document.createElement('option');
                option.value = entry.prompt;
                option.dataset.index = index;
                option.textContent = entry.prompt.substring(0, 60) + (entry.prompt.length > 60 ? '...' : '');
                promptHistoryDropdown.appendChild(option);
            }
        });
    }
}
promptHistoryDropdown.addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    if (selectedOption && selectedOption.value) {
        const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
        const selectedIndex = selectedOption.dataset.index;
        const entry = history[selectedIndex];
        
        // Update both prompt and negative prompt fields
        promptField.value = entry.prompt;
        if (entry.negativePrompt !== undefined) {
            negativePromptField.value = entry.negativePrompt;
        } else {
            negativePromptField.value = ''; // Default to empty if undefined
        }
        
        // Reset dropdown to default option
        e.target.selectedIndex = 0;
    }
});

//let makeImageBtn = document.querySelector("#makeImage")
makeImageBtn.addEventListener("click", saveImageStuff);

// Modify the makeImage function to save prompts
function saveImageStuff() {
    savePromptToHistory(promptField.value, negativePromptField.value);
}


})();

