/* Clone Brush Plugin

 v. 1.0.1, last updated: 8/23/2025
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

function stampClone(editor, ctx, x, y) {
	if (!editor.cloneSourcePoint || !editor._cloneOffset) {
		console.log('Missing clone source or offset:', { source: editor.cloneSourcePoint, offset: editor._cloneOffset })
		return
	}
	// Select source canvas:
	// - draw editor: snapshot of (background + drawing) captured at stroke begin
	// - inpainter: background image only (clone shape becomes white for mask)
	var sourceCanvas = editor.inpainter ? editor.layers.background.canvas : (editor._cloneSourceSnapshot || editor.layers.background.canvas)
	var width = editor.width
	var height = editor.height

	var radius = Math.max(1, Math.round(editor.options.brush_size / 2))
	var size = radius * 2
	ensureOffscreen(editor, size)
	var off = editor._cloneOffscreen
	var offCtx = editor._cloneOffscreenCtx
	offCtx.clearRect(0, 0, size, size)

	// Where to sample from
	var sx_center = Math.round(x + editor._cloneOffset.dx)
	var sy_center = Math.round(y + editor._cloneOffset.dy)
	var sx = sx_center - radius
	var sy = sy_center - radius
	var sw = size
	var sh = size
	var dx = Math.round(x - radius)
	var dy = Math.round(y - radius)

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

	// Feather edges using a radial alpha mask
	var g = offCtx.createRadialGradient(radius, radius, 0, radius, radius, radius)
	g.addColorStop(0, 'rgba(255,255,255,1)')
	g.addColorStop(0.7, 'rgba(255,255,255,1)')
	g.addColorStop(1, 'rgba(255,255,255,0)')
	offCtx.globalCompositeOperation = 'destination-in'
	offCtx.fillStyle = g
	offCtx.fillRect(0, 0, size, size)

	// If in inpainter, recolor to white using the offscreen alpha as mask
	if (editor.inpainter) {
		offCtx.globalCompositeOperation = 'source-in'
		offCtx.fillStyle = '#ffffff'
		offCtx.fillRect(0, 0, size, size)
	}

	// Draw the offscreen patch onto destination; respect existing ctx alpha/filter
	ctx.save()
	// ctx.globalAlpha already set by setBrush -> respect editor.options.opacity
	ctx.drawImage(off, dx, dy)
	ctx.restore()
}

function stampAlongLine(editor, ctx, from, to) {
	var radius = Math.max(1, Math.round(editor.options.brush_size / 2))
	var spacing = Math.max(1, Math.round(radius * 0.6))
	var dx = to.x - from.x
	var dy = to.y - from.y
	var dist = Math.sqrt(dx * dx + dy * dy)
	if (dist === 0) {
		stampClone(editor, ctx, to.x, to.y)
		return
	}
	var steps = Math.floor(dist / spacing)
	for (var i = 1; i <= steps; i++) {
		var t = i / steps
		var px = from.x + dx * t
		var py = from.y + dy * t
		stampClone(editor, ctx, px, py)
	}
	// Always stamp at the final point to ensure complete coverage
	stampClone(editor, ctx, to.x, to.y)
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
		stampClone(editor, ctx, x, y)
	},
	move: (editor, ctx, x, y, is_overlay = false) => {
		if (is_overlay) return
		if (!editor._clonePrevPoint || !editor._cloneOffset) return
		
		// Draw along the line from previous point to current point
		stampAlongLine(editor, ctx, editor._clonePrevPoint, { x: x, y: y })
		editor._clonePrevPoint = { x: x, y: y }
	},
	end: (editor, ctx, x, y, is_overlay = false) => {
		if (is_overlay) return
		editor._clonePrevPoint = null
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
	editor._cloneRightClickBound = true
	// Capture phase to prevent the default editor mouse handler from firing on right-click
	editor.container.addEventListener('mousedown', function(e) {
		if (e.button === 2 && editor.tool && editor.tool.id === 'clone') {
			var bbox = editor.layers.overlay.canvas.getBoundingClientRect()
			editor.cloneSourcePoint = { x: (e.clientX || 0) - bbox.left, y: (e.clientY || 0) - bbox.top }
			
			// Clear any existing offset to ensure fresh start
			editor._cloneOffset = null
			editor._clonePrevPoint = null
			
			// Visual feedback - you could add a temporary indicator here
			console.log('Clone source set at:', editor.cloneSourcePoint.x, editor.cloneSourcePoint.y)
			
			e.preventDefault()
			e.stopPropagation()
		}
	}, true)
	// Disable context menu while using clone tool
	editor.container.addEventListener('contextmenu', function(e) {
		if (editor.tool && editor.tool.id === 'clone') {
			e.preventDefault()
			e.stopPropagation()
		}
	}, true)
}

function waitForEditorsAndWire() {
	var tries = 0
	var interval = setInterval(function() {
		tries++
		if (IMAGE_EDITOR_TOOLS && !IMAGE_EDITOR_TOOLS.find(function(t){ return t.id === 'clone' })) {
			IMAGE_EDITOR_TOOLS.push(cloneTool)
		}
		if (imageEditor && imageInpainter && IMAGE_EDITOR_SECTIONS) {
			clearInterval(interval)
			// Add button and listeners to both editors
			addCloneButtonToEditor(imageEditor)
			//addCloneButtonToEditor(imageInpainter)
			attachRightClickSourceSetter(imageEditor)
			//attachRightClickSourceSetter(imageInpainter)
		}
		// Give up after some time
		if (tries > 200) {
			clearInterval(interval)
		}
	}, 100)
}

waitForEditorsAndWire()



