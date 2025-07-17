
/* Editor Magic Wand

Adds a Magic Wand selection feature to the inpaint and drawing editors.   Replaces the Fill tool.

Version: 1.0

*/

IMAGE_EDITOR_TOOLS.push(
{
    id: "magicwand",
    name: "Magic Wand",
    icon: "fa-solid fa-magic-wand-sparkles",
    cursor: "crosshair",
    begin: (editor, ctx, x, y, is_overlay = false) => {
        if (!is_overlay /*&& editor.inpainter*/) {
            let fillColor;
            if (editor.inpainter) {
                fillColor = { r: 255, g: 255, b: 255 }; // white for mask
            } else {
                fillColor = hexToRgb(editor.options.color || "#ffffff"); // selected color for draw editor
            }
            // Read from background, write to drawing
            magicWandSelect(
                editor,
                editor.layers.background.ctx, // source: image
                ctx, //editor.layers.drawing.ctx,    // target: mask
                x, y,
                editor.getMagicWandThreshold(),
                fillColor
            );
        }
    },
    move: toolDoNothing,
    end: toolDoNothing,
    hotkey: "w",
});

function waitForInpainterControls(callback) {
    const interval = setInterval(() => {
        const inpainterControls = document.querySelector('#image-inpainter .editor-controls-left');
        if (inpainterControls) {
            clearInterval(interval);
            callback(inpainterControls);
        }
        const painterControls = document.querySelector('#image-editor .editor-controls-left');
        if (painterControls) {
            clearInterval(interval);
            callback(painterControls);
        }
    }, 100);
}

// Usage:
waitForInpainterControls(function(inpainterControls) {
    // Create a new section for the threshold slider
    const section = document.createElement('div');
    section.className = 'image_editor_magicwand_threshold';

    const title = document.createElement('h4');
    title.innerText = 'Magic Wand Threshold';
    section.appendChild(title);

    // Create the slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 5;
    slider.max = 100;
    slider.value = 30;
    slider.step = 1;
    slider.style.width = '100%';

    // Label for value
    const valueLabel = document.createElement('span');
    valueLabel.textContent = slider.value;

    slider.addEventListener('input', function() {
        valueLabel.textContent = slider.value;
        imageInpainter.magicWandThreshold = parseInt(slider.value, 10);
        imageEditor.magicWandThreshold = parseInt(slider.value, 10);
    });

    section.appendChild(slider);
    section.appendChild(valueLabel);

    // Insert the section at the end of the controls
    inpainterControls.appendChild(section);

    // Set default threshold property
    imageInpainter.magicWandThreshold = parseInt(slider.value, 10);
    imageEditor.magicWandThreshold = parseInt(slider.value, 10);

    // Patch getMagicWandThreshold if needed
    imageInpainter.getMagicWandThreshold = function() {
        return this.magicWandThreshold || 30;
    };
    imageEditor.getMagicWandThreshold = function() {
        return this.magicWandThreshold || 30;
    };

});

//  Add magicWandSelect and colorDistance functions (encapsulated for easy moving)
function colorDistance(c1, c2) {
    return Math.sqrt(
        Math.pow(c1.r - c2.r, 2) +
        Math.pow(c1.g - c2.g, 2) +
        Math.pow(c1.b - c2.b, 2)
    );
}

function magicWandSelect(editor, srcCtx, tgtCtx, x, y, threshold, fillColor) {
    // Read from srcCtx, write mask to tgtCtx
    const width = editor.width;
    const height = editor.height;
    const srcImageData = srcCtx.getImageData(0, 0, width, height);
    const srcData = srcImageData.data;
    const maskImageData = tgtCtx.getImageData(0, 0, width, height);
    const maskData = maskImageData.data;
    const visited = new Uint8Array(width * height);
    const stack = [{x: Math.floor(x), y: Math.floor(y)}];

    function idx(x, y) { return (y * width + x) * 4; }
    const baseIdx = idx(Math.floor(x), Math.floor(y));
    const baseColor = {
        r: srcData[baseIdx],
        g: srcData[baseIdx + 1],
        b: srcData[baseIdx + 2]
    };

    while (stack.length) {
        const {x, y} = stack.pop();
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = y * width + x;
        if (visited[i]) continue;
        visited[i] = 1;

        const color = {
            r: srcData[idx(x, y)],
            g: srcData[idx(x, y) + 1],
            b: srcData[idx(x, y) + 2]
        };
        if (colorDistance(baseColor, color) > threshold) continue;

        // Mark as selected in the mask or fill with color
        maskData[idx(x, y) + 0] = fillColor.r;
        maskData[idx(x, y) + 1] = fillColor.g;
        maskData[idx(x, y) + 2] = fillColor.b;
        maskData[idx(x, y) + 3] = 255;

        // Add neighbors
        stack.push({x: x+1, y});
        stack.push({x: x-1, y});
        stack.push({x, y: y+1});
        stack.push({x, y: y-1});
    }

    tgtCtx.putImageData(maskImageData, 0, 0);
}


// helper to get threshold value in ImageEditor
imageEditor.getMagicWandThreshold = function() {
    return this.options && this.options.magicwand_threshold ? this.options.magicwand_threshold : 30;
};

function patchFillToolForInpainter() {
    // Find the Fill tool in IMAGE_EDITOR_TOOLS
    const fillTool = IMAGE_EDITOR_TOOLS.find(t => t.id === 'fill');
    if (!fillTool) return;

    // Patch only for inpainter
    const originalBegin = fillTool.begin;
    fillTool.name = "Magic Wand";
    fillTool.icon = "fa-solid fa-magic-wand-sparkles";
    fillTool.begin = function(editor, ctx, x, y, is_overlay = false) {
        if (!is_overlay) {
            let fillColor;
            if (editor.inpainter) {
                fillColor = { r: 255, g: 255, b: 255 }; // white for mask
            } else {
                fillColor = hexToRgb(editor.options.color || "#ffffff"); // selected color for draw editor
            }

            magicWandSelect(
                editor,
                editor.layers.background.ctx, // source: image
                editor.layers.drawing.ctx,    // target: mask
                x, y,
                editor.getMagicWandThreshold(),
                fillColor
            );
        } else {
            // fallback to original fill in draw mode
            originalBegin(editor, ctx, x, y, is_overlay);
        }
    };
    fillTool.hotkey = "w"; // optional: change hotkey
}

// Call this after IMAGE_EDITOR_TOOLS is defined
patchFillToolForInpainter();

function updateFillToolButtonUI() {
    // Find all tool label elements
    const labels = document.querySelectorAll('.image-editor-button-label');
    labels.forEach(label => {
        if (label.textContent.trim() === "Fill") {
            // Update the label text
            label.textContent = "Magic Wand";
            // Update the icon
            const icon = label.previousElementSibling;
            if (icon && icon.classList.contains('fa-fill')) {
                icon.classList.remove('fa-fill');
                icon.classList.add('fa-magic-wand-sparkles');
            }
        }
    });
}
setTimeout(updateFillToolButtonUI, 100); // or after a suitable event

