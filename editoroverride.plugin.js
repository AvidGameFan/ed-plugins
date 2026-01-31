/* Editor Override

This allows the image editor to load with the full resolution, allowing you to use the "draw" editor without it down-sizing upon save.

If your image exceeds your resolution, parts of the editor will scroll off the screen, which is not ideal, but better than the image
not generating correctly.  This can be mitigated to some extent by changing the zoom level on the browser.

*/

(function() {
    console.log('[Editor Override] Plugin loading...');
    
    // Inject CSS for landscape mode improvements
    var style = document.createElement('style');
    style.textContent = `
        /* Landscape mode: restructure layout to top/center/bottom */
        .editor-controls-center.landscape-layout {
            display: flex !important;
            flex-direction: column !important;
            height: 100% !important;
            position: relative !important;
        }
        
        .landscape-controls-top {
            flex: 0 0 auto;
            padding: 8px 12px;
            background: transparent !important;  /* Override black background */
            border-bottom: 1px solid var(--background-color3, #333);
        }
        
        .landscape-controls-top h4 {
            margin: 0 0 8px 0;
            font-size: 14px;
        }
        
        .landscape-controls-top > div {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
        }
        
        .landscape-controls-top .image-editor-button {
            margin: 0;
            flex: 0 0 auto;
        }
        
        .landscape-canvas-wrapper {
            flex: 1 1 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: auto;
            min-height: 0;
            background: transparent !important;  /* Override black background */
        }
        
        .landscape-controls-bottom {
            flex: 0 0 auto;
            padding: 8px 12px;
            background: transparent !important;  /* Override black background */
            border-top: 1px solid var(--background-color3, #333);
        }
        
        .landscape-controls-bottom > div {
            display: flex;
            flex-direction: row;
            gap: 8px;
            justify-content: center;
            align-items: center;
        }
        
        .landscape-controls-bottom .image-editor-button {
            flex: 0 0 auto;
            margin: 0;
        }
        
        /* Hide the original right controls in landscape */
        .editor-controls-right.landscape-hidden {
            display: none !important;
        }
    `;
    document.head.appendChild(style);
    console.log('[Editor Override] Landscape mode CSS injected');
    
    // Store the original setSize function before any overrides
    var originalSetSize = null;
    
    // Expected hash of the original setSize function (set to null for initial hash generation)
    // TODO: After first run, copy the hash from console and paste it here for validation
    var expectedHash = 1525660043;
    
    // Simple hash function for function source code
    function simpleHash(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString();
    }
    
    // Function to apply the override
    function applyOverride() {
        var ImageEditorClass = (typeof ImageEditor !== 'undefined') ? ImageEditor : window.ImageEditor;
        
        if (ImageEditorClass && ImageEditorClass.prototype) {
            console.log('[Editor Override] Applying override to ImageEditor class');
            
            // Store the original method
            originalSetSize = ImageEditorClass.prototype.setSize;
            console.log('[Editor Override] Original setSize found:', typeof originalSetSize);
            
            // Verify the original function hasn't changed
            var originalSource = originalSetSize.toString();
            var computedHash = simpleHash(originalSource);
            console.log('[Editor Override] Original function hash:', computedHash);
            
            if (expectedHash === null) {
                console.warn('[Editor Override] ⚠️  FIRST RUN: Copy this hash and set expectedHash to:', computedHash);
                //console.log('[Editor Override] Original function source:\n', originalSource);
            } else if (computedHash != expectedHash) {
                console.error('[Editor Override] ❌ WARNING: Original setSize function has changed!');
                console.error('[Editor Override] Expected hash:', expectedHash);
                console.error('[Editor Override] Computed hash:', computedHash);
                console.error('[Editor Override] The override may not work correctly. Please review the changes.');
                //console.log('[Editor Override] New function source:\n', originalSource);
                // Still apply override but warn the user
            } else {
                console.log('[Editor Override] ✓ Original function verified (hash matches)');
            }
            
            // Override the setSize method on the prototype (affects all instances)
            ImageEditorClass.prototype.setSize = function(width, height) {
                console.log('[Editor Override] setSize called with:', width, 'x', height);
                
                width = parseInt(width)
                height = parseInt(height)

                if (width == this.width && height == this.height) {
                    return
                }

                // Detect landscape orientation
                const isLandscape = width > height;
                const aspectRatio = width / height;
                
                // Reserve space for UI elements and controls
                const uiPadding = 120; // Browser chrome and top UI
                const controlsPadding = isLandscape ? 80 : 40; // Extra padding for landscape controls
                
                // Calculate available space
                let windowHeight = window.innerHeight - uiPadding - controlsPadding;
                let windowWidth = window.innerWidth - (isLandscape ? 400 : 100); // More space for controls in landscape
                
                // Determine max size based on orientation
                let max_size;
                if (isLandscape) {
                    // For landscape, limit by width to prevent controls being pushed off
                    max_size = Math.min(width, windowWidth, 2048);
                    this.containerScale = max_size / width;
                    console.log('[Editor Override] LANDSCAPE mode detected (ratio:', aspectRatio.toFixed(2), ')');
                } else {
                    // For portrait, limit by height as before
                    max_size = Math.min(height, windowHeight, 2048);
                    this.containerScale = max_size / height;
                    console.log('[Editor Override] PORTRAIT mode detected (ratio:', aspectRatio.toFixed(2), ')');
                }
                
                console.log('[Editor Override] Using max_size:', max_size, '(image:', width, 'x', height, ', window space:', windowWidth, 'x', windowHeight, ', scale:', this.containerScale.toFixed(3), ')');
                
                let containerWidth = (this.containerScale * width).toFixed()
                let containerHeight = (this.containerScale * height).toFixed()
                this.width = parseInt(width)
                this.height = parseInt(height)

                this.container.style.width = containerWidth + "px"
                this.container.style.height = containerHeight + "px"
                
                // Apply layout restructuring for landscape mode
                const editorControlsRight = document.querySelector('.editor-controls-right');
                const editorControlsCenter = document.querySelector('.editor-controls-center');
                
                if (editorControlsRight && editorControlsCenter) {
                    if (isLandscape && aspectRatio > 1.5) {
                        // Wide landscape - restructure to top/center/bottom layout
                        console.log('[Editor Override] Restructuring DOM for landscape layout');
                        
                        // Get the action buttons (2nd div) and save buttons (3rd div)
                        const actionDiv = editorControlsRight.children[1]; // Has h4 "Actions"
                        const saveDiv = editorControlsRight.children[2]; // Has Cancel/Save
                        
                        if (actionDiv && saveDiv) {
                            // Hide the original right controls
                            editorControlsRight.classList.add('landscape-hidden');
                            
                            // Check if we already restructured (to avoid duplicating)
                            if (!editorControlsCenter.classList.contains('landscape-layout')) {
                                editorControlsCenter.classList.add('landscape-layout');
                                
                                // Store original parent for restoration
                                if (!editorControlsCenter._originalCanvas) {
                                    editorControlsCenter._originalCanvas = editorControlsCenter.children[0];
                                }
                                
                                // Create top controls wrapper
                                const topWrapper = document.createElement('div');
                                topWrapper.className = 'landscape-controls-top';
                                topWrapper.appendChild(actionDiv); // MOVE not clone - preserves event listeners
                                
                                // Create canvas wrapper
                                const canvasWrapper = document.createElement('div');
                                canvasWrapper.className = 'landscape-canvas-wrapper';
                                canvasWrapper.appendChild(editorControlsCenter._originalCanvas);
                                
                                // Create bottom controls wrapper
                                const bottomWrapper = document.createElement('div');
                                bottomWrapper.className = 'landscape-controls-bottom';
                                bottomWrapper.appendChild(saveDiv); // MOVE not clone - preserves event listeners
                                
                                // Rebuild the center controls with new structure
                                editorControlsCenter.appendChild(topWrapper);
                                editorControlsCenter.appendChild(canvasWrapper);
                                editorControlsCenter.appendChild(bottomWrapper);
                                
                                console.log('[Editor Override] DOM restructured for landscape');
                            }
                        }
                    } else {
                        // Portrait/normal mode - restore original structure if needed
                        if (editorControlsCenter.classList.contains('landscape-layout')) {
                            console.log('[Editor Override] Restoring original DOM structure');
                            
                            // Get the moved elements
                            const actionDiv = editorControlsCenter.querySelector('.landscape-controls-top > div');
                            const saveDiv = editorControlsCenter.querySelector('.landscape-controls-bottom > div');
                            const canvasWrapper = editorControlsCenter.querySelector('.landscape-canvas-wrapper');
                            
                            if (canvasWrapper && editorControlsCenter._originalCanvas) {
                                // Move canvas back to center controls
                                editorControlsCenter.appendChild(editorControlsCenter._originalCanvas);
                                
                                // Move buttons back to right controls
                                if (actionDiv) editorControlsRight.appendChild(actionDiv);
                                if (saveDiv) editorControlsRight.appendChild(saveDiv);
                                
                                // Remove the landscape wrappers
                                editorControlsCenter.querySelector('.landscape-controls-top')?.remove();
                                editorControlsCenter.querySelector('.landscape-controls-bottom')?.remove();
                                canvasWrapper.remove();
                            }
                            
                            editorControlsCenter.classList.remove('landscape-layout');
                            editorControlsRight.classList.remove('landscape-hidden');
                            
                            console.log('[Editor Override] Original structure restored');
                        }
                    }
                }

                Object.values(this.layers).forEach((layer) => {
                    layer.canvas.width = width
                    layer.canvas.height = height
                })

                if (this.inpainter) {
                    this.saveImage() // We've reset the size of the image so inpainting is different
                }
                this.setBrush()
                this.history.clear()
            };
            
            console.log('[Editor Override] Successfully overridden ImageEditor.prototype.setSize');
            return true;
        }
        return false;
    }
    
    // Try to apply immediately (synchronously) first
    if (applyOverride()) {
        console.log('[Editor Override] Override applied immediately');
    } else {
        // If not available yet, wait for the ImageEditor class to be defined
        console.log('[Editor Override] ImageEditor not ready, starting polling...');
        
        var tries = 0;
        var interval = setInterval(function() {
            tries++;
            
            if (applyOverride()) {
                clearInterval(interval);
                console.log('[Editor Override] Override applied after ' + tries + ' attempts');
            }
            
            // Give up after some time
            if (tries > 100) {
                clearInterval(interval);
                console.warn('[Editor Override] Timed out waiting for ImageEditor class to be defined');
                console.log('[Editor Override] typeof ImageEditor:', typeof ImageEditor);
                console.log('[Editor Override] window.ImageEditor:', typeof window.ImageEditor);
            }
        }, 10);  // Reduced from 50ms to 10ms for faster response
    }
})();
