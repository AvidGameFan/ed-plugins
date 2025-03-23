
/* 
Prompt History


*/

//setup field one time

// Insert prompt history dropdown after negative prompt
const negativePromptElement = document.querySelector("#negative_prompt");
const historyDropdown = document.createElement('select');
historyDropdown.id = 'prompt_history';
historyDropdown.className = 'form-select';
historyDropdown.innerHTML = '<option value="">Select from history...</option>';

// Insert the dropdown after the negative prompt element
negativePromptElement.parentNode.insertBefore(historyDropdown, negativePromptElement.nextSibling);


(function() { "use strict"
// 
// let promptField = document.querySelector("#prompt")
///let promptsFromFileSelector = document.querySelector("#prompt_from_file")
///let promptsFromFileBtn = document.querySelector("#promptsFromFileBtn")
let promptHistoryDropdown = document.querySelector("#prompt_history") // Add this line
// ... existing code ...
updatePromptHistoryDropdown();

// Add these functions to manage prompt history
function savePromptToHistory(prompt) {
    if (!prompt) return;
    
    // Get existing history from localStorage
    let history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
    
    // Add new prompt to beginning if it's not already there
    if (!history.includes(prompt)) {
        history.unshift(prompt);
        // Keep only last 20 prompts
        history = history.slice(0, 20);
        localStorage.setItem('promptHistory', JSON.stringify(history));
        updatePromptHistoryDropdown();
    }
}

function updatePromptHistoryDropdown() {
    const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
    promptHistoryDropdown.innerHTML = '<option value="">Select from history...</option>';
    
    history.forEach(prompt => {
        const option = document.createElement('option');
        option.value = prompt;
        option.textContent = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
        promptHistoryDropdown.appendChild(option);
    });
}

// Add event listeners
promptHistoryDropdown.addEventListener('change', (e) => {
    if (e.target.value) {
        promptField.value = e.target.value;
    }
});



//save after every change of prompt.  Might be better to save only for each generate.
//omptField.addEventListener('blur', function() {
//  savePromptToHistory(promptField.value);
//;

//let makeImageBtn = document.querySelector("#makeImage")
makeImageBtn.addEventListener("click", saveImageStuff);

// Modify the makeImage function to save prompts
function saveImageStuff() {
    savePromptToHistory(promptField.value);
}


})();

