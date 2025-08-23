
/* 
 * Magic Wand Plugin
 *
 * v.1.0.2, last updated: 8/22/2025
 * By Gary W.
 *
 * Free to use with the CMDR2 Stable Diffusion UI.
 * 
 * This plugin adds a Magic Wand tool to the image editor for selecting similar colored areas.
 * 
 */

(function() { 
    "use strict";

    // Magic Wand tool implementation with feathering and tinting
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

        // Get sharpness and opacity settings for feathering and tinting
        const sharpness = editor.options.sharpness || 0;
        const opacity = editor.options.opacity || 0;
        
        // Calculate feathering radius based on sharpness
        const featherRadius = Math.max(1, Math.round(sharpness * 10)); // Convert sharpness to pixel radius
        
        // Calculate tinting strength based on opacity
        const tintStrength = 1 - opacity; // 0 = no tinting, 1 = full tinting

        // First pass: collect all selected pixels
        const selectedPixels = [];
        
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

            selectedPixels.push({x, y, color});
            
            // Add neighbors
            stack.push({x: x+1, y});
            stack.push({x: x-1, y});
            stack.push({x, y: y+1});
            stack.push({x, y: y-1});
        }

        // Second pass: apply feathering and tinting
        selectedPixels.forEach(pixel => {
            const {x, y, color} = pixel;
            
            // Calculate distance from edge for feathering
            let minDistanceToEdge = Infinity;
            for (let dx = -featherRadius; dx <= featherRadius; dx++) {
                for (let dy = -featherRadius; dy <= featherRadius; dy++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        minDistanceToEdge = Math.min(minDistanceToEdge, dist);
                    } else {
                        const neighborColor = {
                            r: srcData[idx(nx, ny)],
                            g: srcData[idx(nx, ny) + 1],
                            b: srcData[idx(nx, ny) + 2]
                        };
                        if (colorDistance(baseColor, neighborColor) > threshold) {
                            const dist = Math.sqrt(dx*dx + dy*dy);
                            minDistanceToEdge = Math.min(minDistanceToEdge, dist);
                        }
                    }
                }
            }
            
            // Calculate feathering factor (0 = edge, 1 = center)
            const featherFactor = Math.min(1, minDistanceToEdge / featherRadius);
            
            // Apply tinting: blend between original color and fill color
            const tintedColor = {
                r: Math.round(color.r * (1 - tintStrength) + fillColor.r * tintStrength),
                g: Math.round(color.g * (1 - tintStrength) + fillColor.g * tintStrength),
                b: Math.round(color.b * (1 - tintStrength) + fillColor.b * tintStrength)
            };
            
            // Apply feathering: blend between original and tinted based on feather factor
            const finalColor = {
                r: Math.round(color.r * (1 - featherFactor) + tintedColor.r * featherFactor),
                g: Math.round(color.g * (1 - featherFactor) + tintedColor.g * featherFactor),
                b: Math.round(color.b * (1 - featherFactor) + tintedColor.b * featherFactor)
            };
            
            // Set the pixel
            maskData[idx(x, y) + 0] = finalColor.r;
            maskData[idx(x, y) + 1] = finalColor.g;
            maskData[idx(x, y) + 2] = finalColor.b;
            maskData[idx(x, y) + 3] = 255;
        });

        tgtCtx.putImageData(maskImageData, 0, 0);
    }

    function colorDistance(c1, c2) {
        return Math.sqrt(
            Math.pow(c1.r - c2.r, 2) +
            Math.pow(c1.g - c2.g, 2) +
            Math.pow(c1.b - c2.b, 2)
        );
    }

    // Define the Magic Wand tool
    var magicWandTool = {
        id: 'magicwand',
        name: 'Magic Wand',
        icon: 'fa-solid fa-magic-wand-sparkles',
        cursor: 'crosshair',
        begin: (editor, ctx, x, y, is_overlay = false) => {
            if (is_overlay) return
            //if (editor.inpainter) return // Only work in draw editor
            
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
                ctx, // target: drawing layer
                x, y,
                editor.getMagicWandThreshold(),
                fillColor
            );
        },
        move: (editor, ctx, x, y, is_overlay = false) => {
            // Magic wand is a single-click tool
        },
        end: (editor, ctx, x, y, is_overlay = false) => {
            // Magic wand is a single-click tool
        },
        hotkey: 'm',
    }

    // Insert tool into the registry immediately if available
    if (typeof IMAGE_EDITOR_TOOLS !== 'undefined') {
        if (!IMAGE_EDITOR_TOOLS.find(function(t){ return t.id === 'magicwand' })) {
            IMAGE_EDITOR_TOOLS.push(magicWandTool)
            console.log('Magic Wand tool registered')
        }
    }


    function addMagicWandButtonToEditor(editor) {
        try {
            // //Only add to draw editor, not inpainter
            //if (editor.inpainter) return
            
            var section = IMAGE_EDITOR_SECTIONS && IMAGE_EDITOR_SECTIONS.find((s) => s.name === 'tool')
            if (!section) return
            if (!section.options.includes('magicwand')) {
                section.options.push('magicwand')
            }
            
            // Append a new tool option button
            var optionsContainer = editor.popup.querySelector('.image_editor_tool .editor-options-container')
            if (!optionsContainer) return
            var optionHolder = document.createElement('div')
            var optionElement = document.createElement('div')
            optionHolder.appendChild(optionElement)
            section.initElement(optionElement, 'magicwand')
            optionElement.addEventListener('click', function() {
                var index = IMAGE_EDITOR_TOOLS.findIndex((t) => t.id === 'magicwand')
                if (index !== -1) {
                    editor.selectOption('tool', index)
                }
            })
            optionsContainer.appendChild(optionHolder)
            if (!editor.optionElements['tool']) editor.optionElements['tool'] = []
            editor.optionElements['tool'].push(optionElement)
        } catch (e) {
            // noop
        }
    }

    // Add threshold control to Draw editor only
    function addMagicWandThresholdControl(editor) {
        try {
            // // Only add to draw editor, not inpainter
            //if (editor.inpainter) return
            
            // Check if threshold control already exists
            if (editor.popup.querySelector('.image_editor_magicwand_threshold')) return
            
            // Create a new section for the threshold slider
            const section = document.createElement('div');
            section.className = 'image_editor_magicwand_threshold';

            const title = document.createElement('h4');
            title.innerText = 'Magic Wand Threshold';
            section.appendChild(title);

            // Create the slider
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '5';
            slider.max = '100';
            slider.value = '30';
            slider.step = '1';
            slider.style.width = '100%';

            // Label for value
            const valueLabel = document.createElement('span');
            valueLabel.textContent = slider.value;

            slider.addEventListener('input', function() {
                valueLabel.textContent = slider.value;
                editor.magicWandThreshold = parseInt(slider.value, 10);
            });

            section.appendChild(slider);
            section.appendChild(valueLabel);

            // Insert the section at the end of the controls
            const controlsLeft = editor.popup.querySelector('.editor-controls-left');
            if (controlsLeft) {
                controlsLeft.appendChild(section);
            }

            // Set default threshold property
            editor.magicWandThreshold = parseInt(slider.value, 10);
            
            // Add getMagicWandThreshold method if it doesn't exist
            if (!editor.getMagicWandThreshold) {
                editor.getMagicWandThreshold = function() {
                    return this.magicWandThreshold || 30;
                };
            }
        } catch (e) {
            console.warn('Failed to add Magic Wand threshold control:', e);
        }
    }

    function waitForEditorsAndWire() {
        var tries = 0
        var interval = setInterval(function() {
            tries++
            if (IMAGE_EDITOR_TOOLS && !IMAGE_EDITOR_TOOLS.find(function(t){ return t.id === 'magicwand' })) {
                IMAGE_EDITOR_TOOLS.push(magicWandTool)
            }
            if (imageEditor && imageInpainter && IMAGE_EDITOR_SECTIONS) {
                clearInterval(interval)

                addMagicWandButtonToEditor(imageEditor)
                addMagicWandThresholdControl(imageEditor)

                addMagicWandButtonToEditor(imageInpainter)
                addMagicWandThresholdControl(imageInpainter)

            }
            // Give up after some time
            if (tries > 200) {
                clearInterval(interval)
            }
        }, 100)
    }

    waitForEditorsAndWire()

    console.log('Magic Wand Plugin loaded successfully');

})();

