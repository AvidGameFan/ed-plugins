/* Smear Brush Plugin

 v. 1.1.0, last updated: 2/14/2026
 By Gary W.

 Created with the help of CoPilot/Claude AI.

 Free to use with the CMDR2 Stable Diffusion UI, Easy Diffusion.

 Description:

Adds a Smear brush tool to the image editor. Pushes pixels in the direction of
brush movement, like pushing wet paint on a canvas. The effect blends edges but
focuses more on rearranging pixels than pure blending.
*/

(function() { "use strict"

	// --- Tool implementation helpers ---
	function ensureOffscreen(editor, size) {
		if (!editor._smearOffscreen) {
			editor._smearOffscreen = document.createElement('canvas')
			editor._smearOffscreenCtx = editor._smearOffscreen.getContext('2d')
		}
		if (editor._smearOffscreen.width !== size || editor._smearOffscreen.height !== size) {
			editor._smearOffscreen.width = size
			editor._smearOffscreen.height = size
		}
	}

	function smearStamp(editor, ctx, x, y, prevX, prevY, isFirstStamp) {
		var radius = Math.max(1, Math.round(editor.options.brush_size / 2)) / editor.containerScale
		var size = radius * 2
		ensureOffscreen(editor, size)
		var off = editor._smearOffscreen
		var offCtx = editor._smearOffscreenCtx
		
		// For the first stamp, just initialize the buffer
		if (isFirstStamp) {
			offCtx.clearRect(0, 0, size, size)
			return
		}
		
		// Calculate movement vector
		var dx = x - prevX
		var dy = y - prevY
		var dist = Math.sqrt(dx * dx + dy * dy)
		
		if (dist === 0) return // No movement, no smear
		
		// Normalize direction vector
		var dirX = dx / dist
		var dirY = dy / dist
		
		// Get the source canvas to sample from - use snapshot for draw editor
		var sourceCanvas = editor.inpainter ? editor.layers.background.canvas : (editor._smearSourceSnapshot || editor.layers.background.canvas)
		var width = editor.width
		var height = editor.height
		
		// Sample area further behind for more lag and smoother smear
		// This creates the "pulling" effect
		var sampleOffset = radius * 0.6 // Increased lag for smoother trailing
		var sx_center = x - dirX * sampleOffset
		var sy_center = y - dirY * sampleOffset
		// Use smaller stamp size for finer control
		var stampSize = size * 0.7 // Reduce to 70% for smaller, more refined effect
		var halfStamp = stampSize / 2
		var sx = sx_center - halfStamp
		var sy = sy_center - halfStamp
		var sw = stampSize
		var sh = stampSize
		
		// Clear the offscreen buffer
		offCtx.clearRect(0, 0, size, size)
		
		// Clamp source rectangle within canvas bounds
		var px = 0
		var py = 0
		if (sx < 0) { px = -sx; sw += sx; sx = 0 }
		if (sy < 0) { py = -sy; sh += sy; sy = 0 }
		if (sx + sw > width) { sw = width - sx }
		if (sy + sh > height) { sh = height - sy }
		if (sw <= 0 || sh <= 0) return
		
		// Calculate offset to center the smaller stamp in the offscreen buffer
		var offsetX = (size - stampSize) / 2
		var offsetY = (size - stampSize) / 2
		
		// Draw sampled patch into offscreen, centered
		offCtx.globalCompositeOperation = 'source-over'
		offCtx.drawImage(sourceCanvas, sx, sy, sw, sh, px + offsetX, py + offsetY, sw, sh)
		
		// Create radial gradient for edge feathering with softer, more gradual fade
		var g = offCtx.createRadialGradient(radius, radius, 0, radius, radius, radius)
		g.addColorStop(0, 'rgba(255,255,255,0.8)')   // Slightly reduced opacity at center
		g.addColorStop(0.3, 'rgba(255,255,255,0.7)')  // Earlier fade start
		g.addColorStop(0.6, 'rgba(255,255,255,0.4)') // Progressive fade
		g.addColorStop(0.8, 'rgba(255,255,255,0.15)') // Softer edge
		g.addColorStop(1, 'rgba(255,255,255,0)')     // fully transparent at edge
		offCtx.globalCompositeOperation = 'destination-in'
		offCtx.fillStyle = g
		offCtx.fillRect(0, 0, size, size)
		
		// If in inpainter, recolor to white for mask
		if (editor.inpainter) {
			offCtx.globalCompositeOperation = 'source-in'
			offCtx.fillStyle = '#ffffff'
			offCtx.fillRect(0, 0, size, size)
		}
		
		// Draw the smeared pixels at the current position
		ctx.save()
		ctx.imageSmoothingQuality = "high"
		
		// Apply opacity setting
		const rawOpacity = editor.options && typeof editor.options.opacity === 'number' ? editor.options.opacity : 1
		let alpha = rawOpacity
		if (alpha > 1) alpha = alpha / 100
		alpha = Math.max(0, Math.min(1, alpha))
		alpha = 1 - alpha  // Invert: opacity 0 = fully opaque, opacity 1 = fully transparent
		
		// Reduce opacity for lighter, more refined smear effect
		alpha = alpha * 0.5 // Reduced from 0.7 for subtler effect
		
		ctx.globalAlpha = alpha
		
		var targetX = x - radius
		var targetY = y - radius
		ctx.drawImage(off, targetX, targetY)
		
		// Additional step: blend colors on the leading edge
		// Sample a small area ahead of the brush for color blending
		var blendOffset = radius * 0.5 // Sample ahead
		var bx_center = x + dirX * blendOffset
		var by_center = y + dirY * blendOffset
		
		// Only blend if we're within canvas bounds
		if (bx_center >= 0 && bx_center < width && by_center >= 0 && by_center < height) {
			var blendRadius = radius * 0.4 // Smaller blend area on leading edge
			ctx.globalCompositeOperation = 'source-atop' // Only blend where we just drew
			ctx.filter = 'blur(' + Math.max(1, blendRadius * 0.15) + 'px)'
			ctx.globalAlpha = alpha * 0.3 // Subtle blending
			
			// Sample and blend the leading edge area
			var bx = bx_center - blendRadius
			var by = by_center - blendRadius
			var bsize = blendRadius * 2
			
			if (bx >= 0 && by >= 0 && bx + bsize <= width && by + bsize <= height) {
				ctx.drawImage(sourceCanvas, bx, by, bsize, bsize, 
					x - blendRadius, y - blendRadius, bsize, bsize)
			}
			ctx.filter = 'none'
		}
		
		ctx.restore()
	}

	function smearAlongLine(editor, ctx, from, to, isFirstStamp) {
		var radius = Math.max(1, Math.round(editor.options.brush_size / 2))
		var spacing = Math.max(1, Math.round(radius * 0.08)) // Much tighter spacing for ultra-smooth smear
		var dx = to.x - from.x
		var dy = to.y - from.y
		var dist = Math.sqrt(dx * dx + dy * dy)
		
		if (dist === 0) {
			smearStamp(editor, ctx, to.x, to.y, from.x, from.y, isFirstStamp)
			return
		}
		
		var steps = Math.max(1, Math.floor(dist / spacing))
		for (var i = 1; i <= steps; i++) {
			var t = i / steps
			var px = from.x + dx * t
			var py = from.y + dy * t
			var prevPx = i === 1 ? from.x : from.x + dx * ((i-1) / steps)
			var prevPy = i === 1 ? from.y : from.y + dy * ((i-1) / steps)
			smearStamp(editor, ctx, px, py, prevPx, prevPy, false)
		}
	}

	// --- Define the Smear tool ---
	var smearTool = {
		id: 'smear',
		name: 'Smear',
		icon: 'fa-solid fa-hand-sparkles',
		cursor: 'crosshair',
		begin: (editor, ctx, x, y, is_overlay = false) => {
			if (is_overlay) return
			
			// Create snapshot of current state (background + drawing) for consistent sampling
			if (!editor.inpainter) {
				if (!editor._smearSourceSnapshot || editor._smearSourceSnapshot.width !== editor.width || editor._smearSourceSnapshot.height !== editor.height) {
					editor._smearSourceSnapshot = document.createElement('canvas')
					editor._smearSourceSnapshot.width = editor.width
					editor._smearSourceSnapshot.height = editor.height
				}
				var sctx = editor._smearSourceSnapshot.getContext('2d')
				sctx.clearRect(0, 0, editor.width, editor.height)
				sctx.drawImage(editor.layers.background.canvas, 0, 0)
				sctx.drawImage(editor.layers.drawing.canvas, 0, 0)
			}
			
			editor._smearPrevPoint = { x: x, y: y }
			smearStamp(editor, ctx, x, y, x, y, true) // Initialize
		},
		move: (editor, ctx, x, y, is_overlay = false) => {
			if (is_overlay) return
			if (!editor._smearPrevPoint) return
			
			// Smear along the line from previous point to current point
			smearAlongLine(editor, ctx, editor._smearPrevPoint, { x: x, y: y }, false)
			editor._smearPrevPoint = { x: x, y: y }
		},
		end: (editor, ctx, x, y, is_overlay = false) => {
			if (is_overlay) return
			editor._smearPrevPoint = null
		},
		hotkey: 's',
	}

	// Insert tool into the registry immediately if available
	if (typeof IMAGE_EDITOR_TOOLS !== 'undefined') {
		if (!IMAGE_EDITOR_TOOLS.find(function(t){ return t.id === 'smear' })) {
			IMAGE_EDITOR_TOOLS.push(smearTool)
			console.log('Smear tool registered')
		}
	}

	// --- UI wiring ---
	function addSmearButtonToEditor(editor) {
		try {
			if (editor.inpainter) return // Only work in draw editor
			var section = IMAGE_EDITOR_SECTIONS && IMAGE_EDITOR_SECTIONS.find((s) => s.name === 'tool')
			if (!section) return
			if (!section.options.includes('smear')) {
				section.options.push('smear')
			}
			// Append a new tool option button
			var optionsContainer = editor.popup.querySelector('.image_editor_tool .editor-options-container')
			if (!optionsContainer) return
			var optionHolder = document.createElement('div')
			var optionElement = document.createElement('div')
			optionHolder.appendChild(optionElement)
			section.initElement(optionElement, 'smear')
			optionElement.addEventListener('click', function() {
				var index = IMAGE_EDITOR_TOOLS.findIndex((t) => t.id === 'smear')
				if (index !== -1) {
					editor.selectOption('tool', index)
				}
			})
			optionsContainer.appendChild(optionHolder)
			if (!editor.optionElements['tool']) editor.optionElements['tool'] = []
			editor.optionElements['tool'].push(optionElement)
		} catch (e) {
			console.error('Error adding smear button:', e)
		}
	}

	function waitForEditorsAndWire() {
		var tries = 0
		var interval = setInterval(function() {
			tries++
			if (IMAGE_EDITOR_TOOLS && !IMAGE_EDITOR_TOOLS.find(function(t){ return t.id === 'smear' })) {
				IMAGE_EDITOR_TOOLS.push(smearTool)
			}
			if (imageEditor && IMAGE_EDITOR_SECTIONS) {
				// For backwards compatibility, ensure editor.containerScale is set
				if (imageEditor.containerScale === undefined) {
					imageEditor.containerScale = 1.0
				}

				clearInterval(interval)
				addSmearButtonToEditor(imageEditor)
			}
			// Give up after some time
			if (tries > 200) {
				clearInterval(interval)
			}
		}, 100)
	}

	waitForEditorsAndWire()

})();
