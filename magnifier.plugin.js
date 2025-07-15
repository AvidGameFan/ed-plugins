// Magnifier Plugin for Easy Diffusion
// Adds a circular magnifier that appears on hover over images
// v1.2.0, last updated: 6/28/2025
// Initial code and some modifications from Cursor/Claude, modified by Gary W.
//
// Free to use with the CMDR2 Stable Diffusion UI.

(function() { 
    "use strict";
    
    PLUGINS['IMAGE_INFO_BUTTONS'].push([
      { text: 'Magnifier', on_click: onMagClick, filter: initMagnifier }
    ])

    // Magnifier configuration
    const config = {
        magnification: 2.5,        // Zoom level
        size: 150,                 // Diameter of magnifier in pixels
        borderWidth: 2,            // Border width in pixels
        borderColor: '#333',       // Border color
        shadowColor: 'rgba(0,0,0,0.3)', // Shadow color
        shadowBlur: 10,            // Shadow blur radius
        fadeInDuration: 200,       // Fade in animation duration (ms)
        fadeOutDuration: 150       // Fade out animation duration (ms)
    };
    
    // Create magnifier element
    function createMagnifier() {
        const magnifier = document.createElement('div');
        magnifier.id = 'image-magnifier';
        magnifier.style.cssText = `
            position: fixed;
            width: ${config.size}px;
            height: ${config.size}px;
            border: ${config.borderWidth}px solid ${config.borderColor};
            border-radius: 50%;
            background: white;
            pointer-events: none;
            z-index: 10000;
            display: none;
            box-shadow: 0 4px ${config.shadowBlur}px ${config.shadowColor};
            overflow: hidden;
            transition: opacity ${config.fadeInDuration}ms ease-in-out;
            left: 0;
            top: 0;
        `;
        
        // Create inner container for the magnified image
        const innerContainer = document.createElement('div');
        innerContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            overflow: hidden;
        `;
        
        magnifier.appendChild(innerContainer);
        document.body.appendChild(magnifier);
        
        // Optional: Show zoom level as a tooltip
        //magnifier.title = `Zoom: ${config.magnification.toFixed(2)}x`;

         
       
        return magnifier;
    }

    // Click handler for the magnifier button
    function onMagClick(origRequest, image) {
        // Toggle magnifier functionality for this specific image
        if (image.magnifierActive) {
            // Disable magnifier
            image.magnifierActive = false;
            image.style.cursor = 'default';
            // Remove event listeners if they exist
            if (image.magnifierListeners) {
                image.removeEventListener('mouseenter', image.magnifierListeners.enter);
                image.removeEventListener('mousemove', image.magnifierListeners.move);
                image.removeEventListener('mouseleave', image.magnifierListeners.leave);
                image.removeEventListener('wheel', image.magnifierListeners.wheel1);
                image.removeEventListener('mousewheel', image.magnifierListeners.wheel2);
                

                // Remove task buttons listener
                const taskButtonsArea = image.parentElement.querySelector('.tasksBtns');
                if (taskButtonsArea && image.magnifierListeners.taskButtons) {
                    taskButtonsArea.removeEventListener('mouseenter', image.magnifierListeners.taskButtons);
                    
                    // Remove listeners from individual buttons
                    const buttons = taskButtonsArea.querySelectorAll('button, .btn, [role="button"]');
                    buttons.forEach(button => {
                        button.removeEventListener('mouseenter', image.magnifierListeners.taskButtons);
                    });
                }
                
                // Remove imgItemInfo listeners
                const imgItemInfo = image.parentElement.querySelector('div.imgItemInfo');
                if (imgItemInfo && image.magnifierListeners) {
                    imgItemInfo.removeEventListener('mouseenter', image.magnifierListeners.enter);
                    imgItemInfo.removeEventListener('mousemove', image.magnifierListeners.move);
                    imgItemInfo.removeEventListener('mouseleave', image.magnifierListeners.leave);
                }
                
                image.magnifierListeners = null;
            }
            // Hide magnifier if it's currently visible
            const magnifier = document.getElementById('image-magnifier');
            if (magnifier) {
                magnifier.style.display = 'none';
            }
        } else {
            // Enable magnifier
            image.magnifierActive = true;
            image.style.cursor = 'crosshair';
            initMagnifier(origRequest, image);
        }
    }
    
    // Initialize magnifier functionality for a specific image
    function initMagnifier(origRequest, image) {
        // Set the active flag
        image.magnifierActive = true;
        
        const magnifier = createMagnifier();
        const innerContainer = magnifier.querySelector('div');
        let isVisible = false;
        let animationFrameId = null;
        let lastMouseX = 0, lastMouseY = 0;
        let imageRect = null;
        
        // Cache image rect and update on window resize
        function updateImageRect() {
            imageRect = image.getBoundingClientRect();
        }
        updateImageRect();
        
        // Create event listener functions
        const mouseEnterHandler = function(e) {
            magnifier.style.display = 'block';
            magnifier.style.opacity = '0';
            
            // Force reflow to ensure display: block is applied
            magnifier.offsetHeight;
            
            magnifier.style.opacity = '1';
            isVisible = true;
            updateImageRect();
        };
        
        const mouseMoveHandler = function(e) {
            if (!isVisible) return;
            
            // Throttle updates using requestAnimationFrame
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            
            animationFrameId = requestAnimationFrame(() => {
                if (!isVisible) return;
                
                // Calculate mouse position relative to the image
                const mouseX = lastMouseX - imageRect.left;
                const mouseY = lastMouseY - imageRect.top;
                
                // Calculate magnifier position (center it on mouse)
                const magnifierX = lastMouseX - config.size / 2;
                const magnifierY = lastMouseY - config.size / 2;
                
                // Position the magnifier using left/top
                magnifier.style.left = magnifierX + 'px';
                magnifier.style.top = magnifierY + 'px';
                
                // Calculate the source rectangle for magnification
                const sourceSize = config.size / config.magnification;
                const sourceX = mouseX - sourceSize / 2;
                const sourceY = mouseY - sourceSize / 2;
                
                // Apply the magnified image
                innerContainer.style.backgroundImage = `url(${image.src})`;
                innerContainer.style.backgroundSize = `${imageRect.width * config.magnification}px ${imageRect.height * config.magnification}px`;
                innerContainer.style.backgroundPosition = `-${sourceX * config.magnification}px -${sourceY * config.magnification}px`;
            });
        };
        
        const mouseLeaveHandler = function(e) {
            if (!isVisible) return;

            //allow entry into the div containing buttons, but disable over buttons
            const entered = e.relatedTarget;

            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            
            magnifier.style.opacity = '0';
            isVisible = false;
            
            setTimeout(() => {
                if (!isVisible) {
                    magnifier.style.display = 'none';
                }
            }, config.fadeOutDuration);
        };
        
        // Add handler to hide magnifier when hovering over task buttons
        const taskButtonsHandler = function(e) {
            //console.log('taskButtonsHandler triggered!', e.target);
            if (isVisible) {
                //console.log('Hiding magnifier due to task button hover');
                magnifier.style.opacity = '0';
                isVisible = false;
                
                setTimeout(() => {
                    if (!isVisible) {
                        magnifier.style.display = 'none';
                    }
                }, config.fadeOutDuration);
            }
        };

        const handleWheel = function(e) {
            if(e.ctrlKey == true) //Only do this if the control key is pressed
            {
            e.preventDefault();
            // Adjust magnification
            const step = 0.2;
            if (e.deltaY < 0) {
                config.magnification = Math.min(8, config.magnification + step);
            } else {
                config.magnification = Math.max(2.5, config.magnification - step);
            }

            // Update tooltip
            //magnifier.title = `Zoom: ${config.magnification.toFixed(2)}x`;
            mouseMoveHandler(e); //update the view with changes
            }
        } //, { passive: false }        
        // Store listeners for potential removal
        image.magnifierListeners = {
            enter: mouseEnterHandler,
            move: mouseMoveHandler,
            leave: mouseLeaveHandler,
            wheel1: handleWheel,
            wheel2: handleWheel,
            taskButtons: taskButtonsHandler
        };

        


        
        // Add event listeners to the specific image
        image.addEventListener('mouseenter', mouseEnterHandler);
        image.addEventListener('mousemove', mouseMoveHandler);
        image.addEventListener('mouseleave', mouseLeaveHandler);

        // Add wheel event for zooming
        image.addEventListener('wheel', handleWheel);
        image.addEventListener('mousewheel', handleWheel); //some browsers may need this different event
        
        // Add event listener to task buttons area to hide magnifier
        setTimeout(() => {
            const imgItemInfo = image.parentElement.querySelector('div.imgItemInfo');
            //console.log('Looking for .tasksBtns in:', image.parentElement);
            //console.log('Found imgItemInfo:', imgItemInfo);
            
            // Add listeners to the imgItemInfo container
            if (imgItemInfo) {
                imgItemInfo.addEventListener('mouseenter', mouseEnterHandler);
                imgItemInfo.addEventListener('mousemove', mouseMoveHandler);
                imgItemInfo.addEventListener('mouseleave', mouseLeaveHandler);
                //console.log('Added listeners to imgItemInfo');
            }
            
            // Also loop through all buttons within taskButtonsArea
            const buttons = imgItemInfo.querySelectorAll('button, .btn, [role="button"]');
            //console.log('Found buttons:', buttons.length);
            buttons.forEach(button => {
                button.addEventListener('mouseenter', taskButtonsHandler);
                //console.log('Added mouseenter listener to button:', button);
            });
        }, 200);
        
        // Handle window resize
        const resizeHandler = function() {
            if (isVisible) {
                magnifier.style.display = 'none';
                isVisible = false;
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
            }
            updateImageRect();
        };
        
        window.addEventListener('resize', resizeHandler);
        
        // Store resize handler for cleanup if needed
        image.magnifierResizeHandler = resizeHandler;
        return true;
    }
    
    // Export for potential external use
    window.ImageMagnifier = {
        init: initMagnifier,
        config: config
    };
    
})();
