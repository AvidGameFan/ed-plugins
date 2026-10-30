/* Lasso Copy/Paste Plugin

 v. 1.1.0, last updated: 10/30/2026
 By Gary W. using CoPilot/Claude Sonnet 5.5

 Free to use with the CMDR2 Stable Diffusion UI, Easy Diffusion.

 Description:

Adds a "Lasso" tool to the image editor.

1. Click and drag to draw a free-form outline around the area to copy. Release to close the outline.
2. The copied area now floats with the pointer (no button needed); move the pointer to position it.
   - Mouse wheel rotates (Shift = fine steps). Ctrl + mouse wheel scales.
   - No wheel? Use "[" and "]" to rotate, and "-" and "=" (or "+") to scale.
3. Left-click to place it. Right-click or Escape cancels.

The copy is taken from the image plus anything drawn on it. Opacity uses the editor's existing setting.
Sharpness is used as edge feathering rather than a blur of the whole selection: 0 gives hard edges,
higher values fade the edges inward (radius = Sharpness x Brush Size). The feathering updates live
while the selection is floating. Placing is undoable like any other stroke.
*/

(function() { "use strict"

	var ROTATE_STEP = 5 * Math.PI / 180
	var FINE_ROTATE_STEP = 1 * Math.PI / 180
	var SCALE_STEP = 1.05
	var MIN_SCALE = 0.1
	var MAX_SCALE = 10

	// --- Helpers ---
	function isLassoActive(editor) {
		return editor.getOptionValue('tool') === 'lasso'
	}

	function toCanvasCoords(editor, e) {
		var bbox = editor.layers.overlay.canvas.getBoundingClientRect()
		return {
			x: ((e.clientX || 0) - bbox.left) / editor.containerScale,
			y: ((e.clientY || 0) - bbox.top) / editor.containerScale,
		}
	}

	// Undo/redo replays strokes with the options saved at the time; the paste details travel in those options.
	function getPastePayload(editor) {
		var o = editor._lassoReplayOptions || editor.options || {}
		return o.lasso_payload || null
	}

	function pasteTo(ctx, p) {
		ctx.save()
		ctx.filter = 'none'
		ctx.translate(p.x, p.y)
		ctx.rotate(p.angle)
		ctx.scale(p.scale, p.scale)
		ctx.imageSmoothingQuality = 'high'
		ctx.drawImage(p.canvas, -p.canvas.width / 2, -p.canvas.height / 2)
		ctx.restore()
	}

	function drawDashedPath(editor, ctx, points, closed) {
		var cs = editor.containerScale
		ctx.save()
		ctx.filter = 'none'
		ctx.globalAlpha = 1
		ctx.globalCompositeOperation = 'source-over'
		ctx.lineWidth = 1 / cs
		ctx.beginPath()
		ctx.moveTo(points[0].x, points[0].y)
		for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
		if (closed) ctx.closePath()
		ctx.strokeStyle = '#ffffff'
		ctx.setLineDash([])
		ctx.stroke()
		ctx.strokeStyle = '#000000'
		ctx.setLineDash([4 / cs, 4 / cs])
		ctx.stroke()
		ctx.restore()
	}

	// Sharpness feathers the edges (same blur radius the brush would use) instead of blurring the whole selection.
	function getFeatherRadius(editor) {
		var o = editor.options || {}
		return parseInt((o.sharpness || 0) * (o.brush_size || 0))
	}

	function getFeathered(editor, f) {
		var r = getFeatherRadius(editor)
		if (r <= 0) return f.canvas
		if (f._feathered && f._feathered.radius === r) return f._feathered.canvas
		var pad = r * 2
		var w = f.canvas.width + pad * 2
		var h = f.canvas.height + pad * 2
		var out = document.createElement('canvas')
		out.width = w
		out.height = h
		var octx = out.getContext('2d')
		octx.drawImage(f.canvas, pad, pad)
		var mask = document.createElement('canvas')
		mask.width = w
		mask.height = h
		var mctx = mask.getContext('2d')
		mctx.filter = 'blur(' + r + 'px)'
		mctx.drawImage(f.canvas, pad, pad)
		octx.globalCompositeOperation = 'destination-in'
		octx.drawImage(mask, 0, 0)
		f._feathered = { radius: r, canvas: out }
		return out
	}

	function renderFloating(editor) {
		var ctx = editor.layers.overlay.ctx
		ctx.clearRect(0, 0, editor.width, editor.height)
		var f = editor._lassoFloat
		if (!f || !editor._lassoPos) return
		var p = { canvas: getFeathered(editor, f), x: editor._lassoPos.x, y: editor._lassoPos.y, angle: f.angle, scale: f.scale }

		ctx.save()
		ctx.filter = 'none'
		ctx.globalCompositeOperation = 'source-over'
		ctx.globalAlpha = 1 - ((editor.options && editor.options.opacity) || 0)
		pasteTo(ctx, p)
		ctx.restore()

		// Outline of the floating selection
		var w = f.canvas.width
		var h = f.canvas.height
		var cs = editor.containerScale
		ctx.save()
		ctx.filter = 'none'
		ctx.globalAlpha = 1
		ctx.translate(p.x, p.y)
		ctx.rotate(p.angle)
		ctx.scale(p.scale, p.scale)
		ctx.lineWidth = 1 / (cs * p.scale)
		ctx.strokeStyle = '#ffffff'
		ctx.setLineDash([])
		ctx.strokeRect(-w / 2, -h / 2, w, h)
		ctx.strokeStyle = '#000000'
		ctx.setLineDash([4 / (cs * p.scale), 4 / (cs * p.scale)])
		ctx.strokeRect(-w / 2, -h / 2, w, h)
		ctx.restore()
	}

	function cancelFloating(editor) {
		editor._lassoFloat = null
		editor.layers.overlay.ctx.clearRect(0, 0, editor.width, editor.height)
	}

	function captureSelection(editor, path) {
		var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
		path.forEach(function(p) {
			minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
			maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
		})
		minX = Math.max(0, Math.floor(minX)); minY = Math.max(0, Math.floor(minY))
		maxX = Math.min(editor.width, Math.ceil(maxX)); maxY = Math.min(editor.height, Math.ceil(maxY))
		var w = maxX - minX
		var h = maxY - minY
		if (w < 2 || h < 2 || path.length < 3) return null

		var canvas = document.createElement('canvas')
		canvas.width = w
		canvas.height = h
		var ctx = canvas.getContext('2d')
		ctx.translate(-minX, -minY)
		ctx.beginPath()
		ctx.moveTo(path[0].x, path[0].y)
		for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y)
		ctx.closePath()
		ctx.clip()
		ctx.drawImage(editor.layers.background.canvas, 0, 0)
		ctx.drawImage(editor.layers.drawing.canvas, 0, 0)
		return { canvas: canvas, angle: 0, scale: 1 }
	}

	// --- The tool ---
	var lassoTool = {
		id: 'lasso',
		name: 'Lasso',
		icon: 'fa-solid fa-object-group',
		cursor: 'crosshair',
		begin: function(editor, ctx, x, y, is_overlay) {
			if (is_overlay) return
			// editor.drawing is only true for a real mouse stroke, not for undo/redo replay
			editor._lassoLive = !!editor.drawing
			if (!editor._lassoLive) return
			if (editor._lassoFloat) {
				editor._lassoMode = 'place'
				var f = editor._lassoFloat
				// Copied by the history when the stroke starts, so undo/redo can redo the paste.
				editor.options.lasso_payload = { canvas: getFeathered(editor, f), x: x, y: y, angle: f.angle, scale: f.scale }
			} else {
				editor._lassoMode = 'select'
				editor._lassoPath = [{ x: x, y: y }]
			}
		},
		move: function(editor, ctx, x, y, is_overlay) {
			if (!editor._lassoLive || editor._lassoMode !== 'select' || !editor._lassoPath) return
			if (!is_overlay) {
				editor._lassoPath.push({ x: x, y: y })
			} else {
				ctx.clearRect(0, 0, editor.width, editor.height)
				drawDashedPath(editor, ctx, editor._lassoPath, false)
			}
		},
		end: function(editor, ctx, x, y, is_overlay) {
			if (is_overlay) {
				renderFloating(editor)
				return
			}
			var payload = getPastePayload(editor)
			if (payload && (!editor._lassoLive || editor._lassoMode === 'place')) {
				pasteTo(ctx, payload)
				if (editor._lassoLive) {
					delete editor.options.lasso_payload
					editor._lassoFloat = null
				}
			} else if (editor._lassoLive && editor._lassoMode === 'select' && editor._lassoPath) {
				editor._lassoFloat = captureSelection(editor, editor._lassoPath)
				if (editor._lassoFloat) editor._lassoPos = { x: x, y: y }
			}
			editor._lassoPath = null
			editor._lassoMode = null
		},
	}

	if (typeof IMAGE_EDITOR_TOOLS !== 'undefined') {
		if (!IMAGE_EDITOR_TOOLS.find(function(t) { return t.id === 'lasso' })) {
			IMAGE_EDITOR_TOOLS.push(lassoTool)
		}
	}

	// --- UI wiring ---
	function addToolButton(editor) {
		var section = IMAGE_EDITOR_SECTIONS.find(function(s) { return s.name === 'tool' })
		var optionsContainer = editor.popup.querySelector('.image_editor_tool .editor-options-container')
		if (!section || !optionsContainer) return
		if (!section.options.includes('lasso')) section.options.push('lasso')
		var optionHolder = document.createElement('div')
		var optionElement = document.createElement('div')
		optionHolder.appendChild(optionElement)
		section.initElement(optionElement, 'lasso')
		optionElement.addEventListener('click', function() {
			editor.selectOption('tool', section.options.indexOf('lasso'))
		})
		optionsContainer.appendChild(optionHolder)
		editor.optionElements['tool'].push(optionElement)
	}

	function patchEditor(editor) {
		var originalSetBrush = editor.setBrush
		editor.setBrush = function(layer, options) {
			// Only undo/redo replay passes explicit options.
			this._lassoReplayOptions = options || null
			return originalSetBrush.call(this, layer, options)
		}

		var originalSelectOption = editor.selectOption
		editor.selectOption = function(section_name, option_index) {
			originalSelectOption.call(this, section_name, option_index)
			if (section_name === 'tool' && !isLassoActive(this) && this._lassoFloat) cancelFloating(this)
		}

		var container = editor.container
		function floating() {
			return editor._lassoFloat && isLassoActive(editor) && !editor.drawing
		}

		// The editor ends a stroke on mouseout and starts a new one on re-entry; keep one lasso stroke going past the edge.
		function lassoStrokeActive() {
			return editor.drawing && isLassoActive(editor)
		}
		;['mouseout', 'mouseenter'].forEach(function(type) {
			container.addEventListener(type, function(e) {
				if (lassoStrokeActive()) e.stopImmediatePropagation()
			}, true)
		})
		;['mousemove', 'mouseup'].forEach(function(type) {
			document.addEventListener(type, function(e) {
				if (!lassoStrokeActive() || container.contains(e.target)) return
				var bbox = editor.layers.overlay.canvas.getBoundingClientRect()
				container.dispatchEvent(new MouseEvent(type, {
					bubbles: true,
					clientX: Math.min(Math.max(e.clientX, bbox.left + 1), bbox.right - 1),
					clientY: Math.min(Math.max(e.clientY, bbox.top + 1), bbox.bottom - 1),
				}))
			})
		})

		// Floating selection follows the pointer
		container.addEventListener('mousemove', function(e) {
			if (!floating()) return
			editor._lassoPos = toCanvasCoords(editor, e)
			renderFloating(editor)
		})

		// Wheel rotates; Ctrl + wheel scales
		container.addEventListener('wheel', function(e) {
			if (!floating()) return
			e.preventDefault()
			e.stopPropagation()
			var dir = (e.deltaY || e.deltaX) < 0 ? 1 : -1
			var f = editor._lassoFloat
			if (e.ctrlKey) {
				f.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, dir > 0 ? f.scale * SCALE_STEP : f.scale / SCALE_STEP))
			} else {
				f.angle += dir * (e.shiftKey ? FINE_ROTATE_STEP : ROTATE_STEP)
			}
			renderFloating(editor)
		}, { passive: false, capture: true })

		// Right-click cancels
		container.addEventListener('mousedown', function(e) {
			if (e.button === 2 && floating()) {
				cancelFloating(editor)
				e.preventDefault()
				e.stopImmediatePropagation()
			}
		}, true)
		container.addEventListener('contextmenu', function(e) {
			if (isLassoActive(editor)) e.preventDefault()
		}, true)

		// Keyboard alternatives. While floating, swallow editor key handling (Ctrl would otherwise switch to the color picker).
		function onKey(e) {
			if (!floating() || !editor.popup.classList.contains('active')) return
			e.stopImmediatePropagation()
			if (e.type !== 'keydown') return
			var f = editor._lassoFloat
			if (e.key === 'Escape') {
				cancelFloating(editor)
			} else if (e.key === '[' || e.key === ']') {
				f.angle += (e.key === ']' ? 1 : -1) * (e.shiftKey ? FINE_ROTATE_STEP : ROTATE_STEP)
				renderFloating(editor)
			} else if (e.key === '-' || e.key === '=' || e.key === '+') {
				f.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, e.key === '-' ? f.scale / SCALE_STEP : f.scale * SCALE_STEP))
				renderFloating(editor)
			} else {
				return
			}
			e.preventDefault()
		}
		document.addEventListener('keydown', onKey, true)
		document.addEventListener('keyup', onKey, true)
	}

	function waitForEditorsAndWire() {
		var tries = 0
		var interval = setInterval(function() {
			tries++
			if (typeof IMAGE_EDITOR_TOOLS !== 'undefined' && !IMAGE_EDITOR_TOOLS.find(function(t) { return t.id === 'lasso' })) {
				IMAGE_EDITOR_TOOLS.push(lassoTool)
			}
			if (typeof imageEditor !== 'undefined' && typeof IMAGE_EDITOR_SECTIONS !== 'undefined') {
				clearInterval(interval)
				try {
					if (imageEditor.containerScale === undefined) imageEditor.containerScale = 1.0
					addToolButton(imageEditor)
					patchEditor(imageEditor)
				} catch (e) {
					console.error('Error setting up lasso tool:', e)
				}
			}
			if (tries > 200) clearInterval(interval)
		}, 100)
	}

	waitForEditorsAndWire()

})();
