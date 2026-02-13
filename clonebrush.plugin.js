/* Clone Brush Plugin

 v. 1.2.2, last updated: 2/12/2026
 By Gary W.

 Inital version created with the help of Cursor/Claude AI.

 Free to use with the CMDR2 Stable Diffusion UI, Easy Diffusion.

 Description:

Adds a Clone brush tool to the image editor. Set the clone source with right-click,
then paint with left-click. The sampled pattern follows the brush using an offset
from the initial draw point. Brush size and opacity are respected, and edges are
feathered with a radial falloff.
*/

/*
How the Clone Tool Works

Right-click to set the source point (this clears any existing offset)
Left-click and drag to start cloning:
- The first click establishes the offset from source to cursor
- As you drag, the tool maintains this offset and samples from the relative position
- This allows for continuous drawing that follows the cursor movement
- The key insight is that the offset (dx, dy) represents the vector from the current cursor position
to the source point. This offset remains constant throughout the stroke, so as you move the cursor, 
the source sampling point moves in parallel.


Also supports a pen/stylus.

*/

/*
	Dev notes:
	
	Now, Easy Diffusion uses a scaling factor in the drawing editors (mainly for larger images).  At any time, pixels can either be in terms of the underlying canvas, or the (smaller) screen size.

	Canvas coordinates: Used for all calculations and stored in cloneSourcePoint and _cloneOffset
	Screen coordinates: Only used for CSS positioning of the visual cursor
*/


	// --- Tool implementation helpers ---
	function ensureOffscreen(editor, size) {
		if (!editor._cloneOffscreen) {
			editor._cloneOffscreen = document.createElement('canvas')
			editor._cloneOffscreenCtx = editor._cloneOffscreen.getContext('2d')
		}
		if (editor._cloneOffscreen.width !== size || editor._cloneOffscreen.height !== size) {
			editor._cloneOffscreen.width = size
			editor._cloneOffscreen.height = size
		}
	}

	// Clone source cursor management
	function createCloneSourceCursor(editor) {
		if (editor._cloneSourceCursor) return editor._cloneSourceCursor
		
		const cursor = document.createElement('div')
		cursor.id = 'clone-source-cursor'
		cursor.style.cssText = `
			position: absolute;
			pointer-events: none;
			z-index: 1000;
			border: 2px solid #00ff00;
			border-radius: 50%;
			background: rgba(0, 255, 0, 0.0);  /* change the alpha to tint the cursor */
			box-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
			transition: all 0.1s ease;
			opacity: 0;
		`
		
		editor.container.appendChild(cursor)
		editor._cloneSourceCursor = cursor
		return cursor
	}

	/*
	Accepts screen coordinates (from mouse events)
	Converts to canvas coordinates for calculations
	Converts back to screen coordinates for CSS positioning
	Ensures the cursor appears at the correct screen position
	*/
	function updateCloneSourceCursor(editor, currentX, currentY) {
		if (!editor.cloneSourcePoint || !editor._cloneOffset) return
		
		const cursor = createCloneSourceCursor(editor)
		const radius = Math.max(1, Math.round(editor.options.brush_size / 2))
		
		// currentX, currentY are in screen coordinates, convert to canvas coordinates for calculations
		const canvasX = currentX / editor.containerScale
		const canvasY = currentY / editor.containerScale
		
		// Calculate source position in canvas coordinates
		const sourceCanvasX = canvasX + editor._cloneOffset.dx
		const sourceCanvasY = canvasY + editor._cloneOffset.dy
		
		// Convert back to screen coordinates for cursor positioning
		const sourceScreenX = sourceCanvasX * editor.containerScale
		const sourceScreenY = sourceCanvasY * editor.containerScale
		
		// Position cursor at source location (in screen coordinates)
		cursor.style.left = (sourceScreenX - radius) + 'px'
		cursor.style.top = (sourceScreenY - radius) + 'px'
		cursor.style.width = (radius * 2) + 'px'
		cursor.style.height = (radius * 2) + 'px'
		cursor.style.opacity = '1'
	}

	function hideCloneSourceCursor(editor) {
		if (editor._cloneSourceCursor) {
			editor._cloneSourceCursor.style.opacity = '0'
		}
	}

	function showCloneSourceCursor(editor) {
		// Cursor will be shown when mouse moves - we don't have screen coordinates here
		// since _clonePrevPoint is in canvas coordinates and we need screen coordinates
		// The mousemove handler will call updateCloneSourceCursor with proper screen coordinates
	}

function stampClone(editor, ctx, x, y, isDragging) {
	if (!editor.cloneSourcePoint || !editor._cloneOffset) {
		console.log('Missing clone source or offset:', { source: editor.cloneSourcePoint, offset: editor._cloneOffset })
		return
	}
	
	// Update source cursor position
	////??updateCloneSourceCursor(editor, x, y)
	// Select source canvas:
	// - draw editor: snapshot of (background + drawing) captured at stroke begin
	// - inpainter: background image only (clone shape becomes white for mask)
	var sourceCanvas = editor.inpainter ? editor.layers.background.canvas : (editor._cloneSourceSnapshot || editor.layers.background.canvas)
	var width = editor.width
	var height = editor.height

	var radius = Math.max(1, Math.round(editor.options.brush_size / 2)) / editor.containerScale
	var size = radius * 2
	ensureOffscreen(editor, size)
	var off = editor._cloneOffscreen
	var offCtx = editor._cloneOffscreenCtx
	offCtx.clearRect(0, 0, size, size)

	// Where to sample from
	var sx_center = x + editor._cloneOffset.dx //Math.round(x + editor._cloneOffset.dx) -- no need for rounding, we need the precision
	var sy_center = y + editor._cloneOffset.dy //Math.round(y + editor._cloneOffset.dy)
	var sx = sx_center - radius
	var sy = sy_center - radius
	var sw = size
	var sh = size
	var dx = x - radius //Math.round(x - radius)
	var dy = y - radius //Math.round(y - radius)

	// Clamp source rectangle within canvas bounds and map into offscreen position
	var px = 0
	var py = 0
	if (sx < 0) { px = -sx; sw += sx; sx = 0 }
	if (sy < 0) { py = -sy; sh += sy; sy = 0 }
	if (sx + sw > width) { sw = width - sx }
	if (sy + sh > height) { sh = height - sy }
	if (sw <= 0 || sh <= 0) return

	// Draw sampled patch into offscreen at proper offset
	offCtx.globalCompositeOperation = 'source-over'
	offCtx.drawImage(sourceCanvas, sx, sy, sw, sh, px, py, sw, sh)

	// Feather edges using a radial alpha mask with smooth gradient fade
	var g = offCtx.createRadialGradient(radius, radius, 0, radius, radius, radius)
	g.addColorStop(0, 'rgba(255,255,255,1)')     // fully opaque at center
	g.addColorStop(0.70, 'rgba(255,255,255,1)')  // stay opaque in inner region
	g.addColorStop(0.80, 'rgba(255,255,255,0.7)')  // start fading
	g.addColorStop(0.90, 'rgba(255,255,255,0.3)')  // continue fading
	g.addColorStop(1, 'rgba(255,255,255,0)')     // fully transparent at edge
	offCtx.globalCompositeOperation = 'destination-in'
	offCtx.fillStyle = g
	offCtx.fillRect(0, 0, size, size)

	// If in inpainter, recolor to white using the offscreen alpha as mask
	if (editor.inpainter) {
		offCtx.globalCompositeOperation = 'source-in'
		offCtx.fillStyle = '#ffffff'
		offCtx.fillRect(0, 0, size, size)
	}

	// Draw the offscreen patch onto destination; respect opacity and existing ctx state
	ctx.save()
	ctx.imageSmoothingQuality = "high"; //smoothing is enabled by default, but this ensures it maintains higher quality
	const rawOpacity = editor.options && typeof editor.options.opacity === 'number' ? editor.options.opacity : 1
	let alpha = rawOpacity
	if (alpha > 1) alpha = alpha / 100
	alpha = Math.max(0, Math.min(1, alpha))
	alpha = 1 - alpha  // Invert: opacity 0 = fully opaque, opacity 1 = fully transparent
	
	// When dragging, reduce opacity to compensate for overlapping stamps (spacing is 60% so ~40% overlap)
	if (isDragging) {
		alpha = alpha * 0.55  // Reduce opacity by ~45% to compensate for overlap buildup
	}
	
	ctx.globalAlpha = alpha
	ctx.drawImage(off, dx, dy)
	ctx.restore()
}

function stampAlongLine(editor, ctx, from, to) {
	var radius = Math.max(1, Math.round(editor.options.brush_size / 2))
	var spacing = Math.max(1, Math.round(radius * 0.6 /* / editor.containerScale )*/ ))
	var dx = to.x - from.x
	var dy = to.y - from.y
	var dist = Math.sqrt(dx * dx + dy * dy)
	if (dist === 0) {
		stampClone(editor, ctx, to.x, to.y, false)
		return
	}
	var steps = Math.floor(dist / spacing)
	for (var i = 1; i <= steps; i++) {
		var t = i / steps
		var px =  from.x + dx * t
		var py =  from.y + dy * t
		stampClone(editor, ctx, px, py, true)  // Pass true to indicate dragging
	}
	// Always stamp at the final point to ensure complete coverage
	stampClone(editor, ctx, to.x, to.y, true)  // Pass true to indicate dragging
}

// --- Define the Clone tool ---
var cloneTool = {
	id: 'clone',
	name: 'Clone',
	icon: 'fa-solid fa-clone',
	cursor: 'crosshair',
	begin: (editor, ctx, x, y, is_overlay = false) => {
		if (is_overlay) return
		if (!editor.cloneSourcePoint) return // require right-click source first
		
		// Only set the offset if it hasn't been set yet (first click after setting source)
		if (!editor._cloneOffset) {  //remove this line to use the original source location repeatedly
			editor._cloneOffset = {
				dx: editor.cloneSourcePoint.x - x,
				dy: editor.cloneSourcePoint.y - y,
			}
			console.log('Clone offset set:', editor._cloneOffset, 'from source:', editor.cloneSourcePoint, 'to cursor:', { x, y })
		}
		
		// Snapshot source for draw editor so cloning includes current strokes up to begin
		if (!editor.inpainter) {
			if (!editor._cloneSourceSnapshot || editor._cloneSourceSnapshot.width !== editor.width || editor._cloneSourceSnapshot.height !== editor.height) {
				editor._cloneSourceSnapshot = document.createElement('canvas')
				editor._cloneSourceSnapshot.width = editor.width
				editor._cloneSourceSnapshot.height = editor.height
			}
			var sctx = editor._cloneSourceSnapshot.getContext('2d')
			sctx.clearRect(0, 0, editor.width, editor.height)
			sctx.drawImage(editor.layers.background.canvas, 0, 0)
			sctx.drawImage(editor.layers.drawing.canvas, 0, 0)
		}
		
		editor._clonePrevPoint = { x: x, y: y }
		stampClone(editor, ctx, x, y, false)  // First stamp is not dragging
	},
			move: (editor, ctx, x, y, is_overlay = false) => {
			if (is_overlay) return
			if (!editor._clonePrevPoint || !editor._cloneOffset) return
			
			// Update source cursor position during move
			// x, y are in canvas coordinates, convert to screen coordinates for cursor update
			const screenX = x * editor.containerScale
			const screenY = y * editor.containerScale
			updateCloneSourceCursor(editor, screenX, screenY)
			
			// Draw along the line from previous point to current point
			stampAlongLine(editor, ctx, editor._clonePrevPoint, { x: x, y: y })
			editor._clonePrevPoint = { x: x, y: y }
		},
			end: (editor, ctx, x, y, is_overlay = false) => {
			if (is_overlay) return
			editor._clonePrevPoint = null
			// Hide source cursor when stroke ends
			hideCloneSourceCursor(editor)
		},
	hotkey: 'c',
}



// Insert tool into the registry immediately if available
if (typeof IMAGE_EDITOR_TOOLS !== 'undefined') {
	if (!IMAGE_EDITOR_TOOLS.find(function(t){ return t.id === 'clone' })) {
		IMAGE_EDITOR_TOOLS.push(cloneTool)
		console.log('Clone tool registered')
	}
}

// --- UI wiring and right-click source selection ---
function addCloneButtonToEditor(editor) {
	try {
		if (editor.inpainter) return // Only work in draw editor
		var section = IMAGE_EDITOR_SECTIONS && IMAGE_EDITOR_SECTIONS.find((s) => s.name === 'tool')
		if (!section) return
		if (!section.options.includes('clone')) {
			section.options.push('clone')
		}
		// Append a new tool option button
		var optionsContainer = editor.popup.querySelector('.image_editor_tool .editor-options-container')
		if (!optionsContainer) return
		var optionHolder = document.createElement('div')
		var optionElement = document.createElement('div')
		optionHolder.appendChild(optionElement)
		section.initElement(optionElement, 'clone')
		optionElement.addEventListener('click', function() {
			var index = IMAGE_EDITOR_TOOLS.findIndex((t) => t.id === 'clone')
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

function attachRightClickSourceSetter(editor) {
	if (!editor || !editor.container) return
	if (editor.inpainter) return // Only work in draw editor
	// Avoid duplicate listeners
	if (editor._cloneRightClickBound) return
	editor._cloneRightClickBound = true;

	/*
	Converts screen coordinates to canvas coordinates by dividing by editor.containerScale
	Stores cloneSourcePoint in canvas coordinates (matching what tool.begin receives)
	Uses screen coordinates for initial cursor positioning
	*/
	// Helper function to set clone source point
	function setCloneSourcePoint(e) {
		if (editor.tool && editor.tool.id === 'clone') {
			var bbox = editor.layers.overlay.canvas.getBoundingClientRect()
			// Convert screen coordinates to canvas coordinates (matching image-editor.js mouseHandler)
			var screenX = (e.clientX || 0) - bbox.left
			var screenY = (e.clientY || 0) - bbox.top
			editor.cloneSourcePoint = { 
				x: screenX / editor.containerScale, 
				y: screenY / editor.containerScale 
			}
			
			// Clear any existing offset to ensure fresh start
			editor._cloneOffset = null
			editor._clonePrevPoint = null
			
			// Show source cursor at the selected point (use screen coordinates for positioning)
			const radius = Math.max(1, Math.round(editor.options.brush_size / 2))
			const cursor = createCloneSourceCursor(editor)
			cursor.style.left = (screenX - radius) + 'px'
			cursor.style.top = (screenY - radius) + 'px'
			cursor.style.width = (radius * 2) + 'px'
			cursor.style.height = (radius * 2) + 'px'
			cursor.style.opacity = '1'
			
			// Hide cursor after a short delay to show the selection
			// setTimeout(() => {
			// 	if (editor.tool && editor.tool.id === 'clone') {
			// 		hideCloneSourceCursor(editor)
			// 	}
			// }, 1000)
			
			console.log('Clone source set at:', editor.cloneSourcePoint.x, editor.cloneSourcePoint.y)
			
			e.preventDefault()
			e.stopPropagation()
		}
	}
	
	// Capture phase to prevent the default editor mouse handler from firing on right-click
	editor.container.addEventListener('mousedown', function(e) {
		if (e.button === 2) {
			setCloneSourcePoint(e)
		}
	}, true)
	
	// Handle Microsoft Surface Pen button via pointer events
	// Button 1 = right-click equivalent, Button 5 = barrel/side button
	editor.container.addEventListener('pointerdown', function(e) {
		if (e.pointerType === 'pen') {
			console.log('Pen button pressed:', e.button, 'buttons:', e.buttons, 'tool:', editor.tool?.id)
			// Check for pen barrel button (5) or right-click equivalent (1)
			if (e.button === 5 || e.button === 1) {
				setCloneSourcePoint(e)
			}
		}
	}, true)
	
	// Disable context menu while using clone tool
	editor.container.addEventListener('contextmenu', function(e) {
		if (editor.tool && editor.tool.id === 'clone') {
			e.preventDefault()
			e.stopPropagation()
		}
	}, true)
	
	// Track mouse movement to show source cursor when hovering
	editor.container.addEventListener('mousemove', function(e) {
		if (editor.tool && editor.tool.id === 'clone' && editor.cloneSourcePoint && editor._cloneOffset) {
			var bbox = editor.layers.overlay.canvas.getBoundingClientRect()
			var x = (e.clientX || 0) - bbox.left
			var y = (e.clientY || 0) - bbox.top
			updateCloneSourceCursor(editor, x, y)
		}
	})
	
	// Track pointer movement (for pen/touch) to show source cursor and ensure cursor updates
	// Use non-capturing listener to not interfere with editor's own event handling
	editor.container.addEventListener('pointermove', function(e) {
		// Only handle pen input here (mouse is handled by mousemove above)
		if (e.pointerType === 'pen' && editor.tool && editor.tool.id === 'clone' && editor.cloneSourcePoint && editor._cloneOffset) {
			var bbox = editor.layers.overlay.canvas.getBoundingClientRect()
			var x = (e.clientX || 0) - bbox.left
			var y = (e.clientY || 0) - bbox.top
			updateCloneSourceCursor(editor, x, y)
		}
		// Don't call preventDefault or stopPropagation - let the editor handle cursor updates
	}, false) // Explicitly use bubble phase, not capture
	
	// Hide source cursor when mouse leaves canvas
	editor.container.addEventListener('mouseleave', function(e) {
		if (editor.tool && editor.tool.id === 'clone') {
			hideCloneSourceCursor(editor)
		}
	})
	
	// Hide source cursor when pointer leaves (for pen/touch)
	editor.container.addEventListener('pointerleave', function(e) {
		if (e.pointerType === 'pen' && editor.tool && editor.tool.id === 'clone') {
			hideCloneSourceCursor(editor)
		}
	})
}

function waitForEditorsAndWire() {
	var tries = 0
	var interval = setInterval(function() {
		tries++
		if (IMAGE_EDITOR_TOOLS && !IMAGE_EDITOR_TOOLS.find(function(t){ return t.id === 'clone' })) {
			IMAGE_EDITOR_TOOLS.push(cloneTool)
		}
		if (imageEditor && imageInpainter && IMAGE_EDITOR_SECTIONS) {
			// For backwards compatibility (with old ED), ensure editor.containerScale is set.
			if (imageEditor.containerScale === undefined) {
				imageEditor.containerScale = 1.0
			}

			clearInterval(interval)
			// Add button and listeners to both editors
			addCloneButtonToEditor(imageEditor)
			//addCloneButtonToEditor(imageInpainter)
			attachRightClickSourceSetter(imageEditor)
			//attachRightClickSourceSetter(imageInpainter)
			
			// Patch the selectOption method to handle clone tool cursor
			patchSelectOptionForCloneCursor(imageEditor)
			//patchSelectOptionForCloneCursor(imageInpainter)
		}
		// Give up after some time
		if (tries > 200) {
			clearInterval(interval)
		}
	}, 100)
}

function patchSelectOptionForCloneCursor(editor) {
	const originalSelectOption = editor.selectOption
	editor.selectOption = function(section_name, option_index) {
		originalSelectOption.call(this, section_name, option_index)
		
		// Handle clone tool cursor visibility
		if (section_name === 'tool') {
			const tool_id = this.getOptionValue('tool')
			if (tool_id === 'clone') {
				// Show source cursor if source is set
				if (this.cloneSourcePoint && this._cloneOffset) {
					showCloneSourceCursor(this)
				}
			} else {
				// Hide source cursor when switching away from clone tool
				hideCloneSourceCursor(this)
			}
		}
	}
}

waitForEditorsAndWire()



