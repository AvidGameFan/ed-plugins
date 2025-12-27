/* Editor Override

This allows the image editor to load with the full resolution, allowing you to use the "draw" editor without it down-sizing upon save.

If your image exceeds your resolution, parts of the editor will scroll off the screen, which is not ideal, but better than the image
not generating correctly.  This can be mitigated to some extent by changing the zoom level on the browser.

*/

(function() {
    console.log('[Editor Override] Plugin loading...');
    
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
            } else if (computedHash !== expectedHash) {
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

                // Use window height to determine max size, scaling based on image height
                // Subtract padding for browser UI elements
                let windowHeight = window.innerHeight - 120; // Reserve space for browser chrome and padding
                var max_size = Math.min(height, windowHeight, 2048);  // Limit to image height, window height, or 2048
                this.containerScale = max_size / height;  // Scale based on height instead of width
                console.log('[Editor Override] Using max_size:', max_size, '(image height:', height, ', window height:', windowHeight, ', limit: 2048, scale:', this.containerScale.toFixed(3), ')');
                let containerWidth = (this.containerScale * width).toFixed()
                let containerHeight = (this.containerScale * height).toFixed()
                this.width = parseInt(width)
                this.height = parseInt(height)

                this.container.style.width = containerWidth + "px"
                this.container.style.height = containerHeight + "px"

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
