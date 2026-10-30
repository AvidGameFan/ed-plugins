/* Shape Tools Plugin

 v. 1.0.1, last updated: 10/30/2026
 By Gary W. using CoPilot/Claude Sonnet

 Free to use with the CMDR2 Stable Diffusion UI, Easy Diffusion.

 Description:

Adds Line, Rectangle and Ellipse tools to the image editor. Click and drag to define the
shape; a live preview is shown while dragging. Hold Shift while dragging to constrain the
shape (line snaps to 45 degree angles, rectangle becomes a square, ellipse becomes a circle).

Color, opacity and sharpness use the editor's existing settings. Two extra sections appear
when a shape tool is selected: "Line Width" (used instead of Brush Size) and "Shape Fill".
*/

(function() { "use strict"

	var SHAPE_TOOL_IDS = ['line', 'rect', 'ellipse']

	// --- Extra editor sections (only shown while a shape tool is active) ---
	var lineWidthSection = {
		name: 'shape_line_width',
		title: 'Line Width',
		default: 4,
		options: [1, 2, 3, 4, 6, 8, 12, 16, 24],
		initElement: function(element, option) {
			element.style.width = '28px'
			element.style.height = Math.max(2, option) + 'px'
			element.style['margin-right'] = '2px'
			element.style['border-radius'] = '2px'
		},
	}

	var fillSection = {
		name: 'shape_fill',
		title: 'Shape Fill',
		default: 'outline',
		options: ['outline', 'filled'],
		initElement: function(element, option) {
			element.textContent = option === 'filled' ? 'Filled' : 'Outline'
			element.style.padding = '2px 8px'
			element.style.width = 'auto'
			element.style.height = 'auto'
		},
	}

	// --- Drawing helpers ---
	var shiftDown = false
	window.addEventListener('keydown', function(e) { if (e.key === 'Shift') shiftDown = true }, true)
	window.addEventListener('keyup', function(e) { if (e.key === 'Shift') shiftDown = false }, true)
	window.addEventListener('blur', function() { shiftDown = false })

	// Undo/redo replays strokes with the options saved at the time; read those instead of the current ones.
	function getShapeOptions(editor) {
		var o = editor._shapeReplayOptions || editor.options || {}
		return {
			width: o.shape_line_width || lineWidthSection.default,
			filled: o.shape_fill === 'filled',
		}
	}

	function constrainPoint(id, a, b) {
		var dx = b.x - a.x
		var dy = b.y - a.y
		if (id === 'line') {
			var len = Math.sqrt(dx * dx + dy * dy)
			var step = Math.PI / 4
			var ang = Math.round(Math.atan2(dy, dx) / step) * step
			return { x: a.x + len * Math.cos(ang), y: a.y + len * Math.sin(ang) }
		}
		var s = Math.max(Math.abs(dx), Math.abs(dy))
		return { x: a.x + (dx < 0 ? -s : s), y: a.y + (dy < 0 ? -s : s) }
	}

	function drawShape(editor, ctx, id, a, b) {
		var opts = getShapeOptions(editor)
		ctx.save()
		ctx.lineWidth = opts.width / editor.containerScale
		ctx.beginPath()
		if (id === 'line') {
			ctx.moveTo(a.x, a.y)
			ctx.lineTo(b.x, b.y)
		} else if (id === 'rect') {
			ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
		} else {
			ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2)
		}
		if (opts.filled && id !== 'line') {
			ctx.fill()
		} else {
			ctx.stroke()
		}
		ctx.restore()
	}

	function makeShapeTool(id, name, icon) {
		return {
			id: id,
			name: name,
			icon: icon,
			cursor: 'crosshair',
			begin: function(editor, ctx, x, y, is_overlay) {
				editor._shapeStart = { x: x, y: y }
				editor._shapeEnd = { x: x, y: y }
				// editor.drawing is only true for a real mouse stroke, not for undo/redo replay
				editor._shapeLive = !!editor.drawing
			},
			move: function(editor, ctx, x, y, is_overlay) {
				if (!editor._shapeStart) return
				var end = { x: x, y: y }
				if (editor._shapeLive && shiftDown) end = constrainPoint(id, editor._shapeStart, end)
				editor._shapeEnd = end
				if (is_overlay) {
					ctx.clearRect(0, 0, editor.width, editor.height)
					drawShape(editor, ctx, id, editor._shapeStart, end)
				}
			},
			end: function(editor, ctx, x, y, is_overlay) {
				var start = editor._shapeStart
				if (!start) return
				if (is_overlay) {
					ctx.clearRect(0, 0, editor.width, editor.height)
					editor._shapeStart = null
					return
				}
				var end = { x: x, y: y }
				if (editor._shapeLive && shiftDown) {
					end = constrainPoint(id, start, end)
					// Store the constrained point so undo/redo reproduces the same shape.
					var edit = editor.history && editor.history.current_edit
					if (edit) edit.points.push(end)
				}
				drawShape(editor, ctx, id, start, end)
			},
		}
	}

	var shapeTools = [
		makeShapeTool('line', 'Line', 'fa-solid fa-slash'),
		makeShapeTool('rect', 'Rectangle', 'fa-regular fa-square'),
		makeShapeTool('ellipse', 'Ellipse', 'fa-regular fa-circle'),
	]

	if (typeof IMAGE_EDITOR_TOOLS !== 'undefined') {
		shapeTools.forEach(function(tool) {
			if (!IMAGE_EDITOR_TOOLS.find(function(t) { return t.id === tool.id })) {
				IMAGE_EDITOR_TOOLS.push(tool)
			}
		})
	}

	// --- UI wiring ---
	function addToolButtons(editor) {
		var section = IMAGE_EDITOR_SECTIONS.find(function(s) { return s.name === 'tool' })
		var optionsContainer = editor.popup.querySelector('.image_editor_tool .editor-options-container')
		if (!section || !optionsContainer) return
		shapeTools.forEach(function(tool) {
			if (!section.options.includes(tool.id)) section.options.push(tool.id)
			var optionHolder = document.createElement('div')
			var optionElement = document.createElement('div')
			optionHolder.appendChild(optionElement)
			section.initElement(optionElement, tool.id)
			optionElement.addEventListener('click', function() {
				editor.selectOption('tool', section.options.indexOf(tool.id))
			})
			optionsContainer.appendChild(optionHolder)
			editor.optionElements['tool'].push(optionElement)
		})
	}

	function addSection(editor, section) {
		if (!IMAGE_EDITOR_SECTIONS.includes(section)) IMAGE_EDITOR_SECTIONS.push(section)
		section.id = 'image_editor_' + section.name

		var sectionElement = document.createElement('div')
		sectionElement.className = section.id
		var title = document.createElement('h4')
		title.innerText = section.title
		sectionElement.appendChild(title)

		var optionsContainer = document.createElement('div')
		optionsContainer.classList.add('editor-options-container')

		editor.optionElements[section.name] = []
		section.options.forEach(function(option, index) {
			var optionHolder = document.createElement('div')
			var optionElement = document.createElement('div')
			optionHolder.appendChild(optionElement)
			section.initElement(optionElement, option)
			optionElement.addEventListener('click', function() { editor.selectOption(section.name, index) })
			optionsContainer.appendChild(optionHolder)
			editor.optionElements[section.name].push(optionElement)
		})
		sectionElement.appendChild(optionsContainer)
		editor.popup.querySelector('.editor-controls-left').appendChild(sectionElement)
		editor.selectOption(section.name, section.options.indexOf(section.default))
	}

	function updateSectionVisibility(editor) {
		var show = SHAPE_TOOL_IDS.includes(editor.getOptionValue('tool'))
		;[lineWidthSection, fillSection].forEach(function(section) {
			var el = editor.popup.querySelector('.' + section.id)
			if (el) el.style.display = show ? '' : 'none'
		})
	}

	function patchEditor(editor) {
		var originalSetBrush = editor.setBrush
		editor.setBrush = function(layer, options) {
			// Only undo/redo replay passes explicit options.
			this._shapeReplayOptions = options || null
			return originalSetBrush.call(this, layer, options)
		}

		var originalSelectOption = editor.selectOption
		editor.selectOption = function(section_name, option_index) {
			originalSelectOption.call(this, section_name, option_index)
			if (section_name === 'tool') updateSectionVisibility(this)
		}

		// The editor ends a stroke on mouseout and starts a new one on re-entry; keep one shape stroke going past the edge.
		function shapeStrokeActive() {
			return editor.drawing && SHAPE_TOOL_IDS.includes(editor.getOptionValue('tool'))
		}
		;['mouseout', 'mouseenter'].forEach(function(type) {
			editor.container.addEventListener(type, function(e) {
				if (shapeStrokeActive()) e.stopImmediatePropagation()
			}, true)
		})
		;['mousemove', 'mouseup'].forEach(function(type) {
			document.addEventListener(type, function(e) {
				if (!shapeStrokeActive() || editor.container.contains(e.target)) return
				var bbox = editor.layers.overlay.canvas.getBoundingClientRect()
				editor.container.dispatchEvent(new MouseEvent(type, {
					bubbles: true,
					clientX: Math.min(Math.max(e.clientX, bbox.left + 1), bbox.right - 1),
					clientY: Math.min(Math.max(e.clientY, bbox.top + 1), bbox.bottom - 1),
				}))
			})
		})
	}

	function waitForEditorsAndWire() {
		var tries = 0
		var interval = setInterval(function() {
			tries++
			if (typeof IMAGE_EDITOR_TOOLS !== 'undefined') {
				shapeTools.forEach(function(tool) {
					if (!IMAGE_EDITOR_TOOLS.find(function(t) { return t.id === tool.id })) IMAGE_EDITOR_TOOLS.push(tool)
				})
			}
			if (typeof imageEditor !== 'undefined' && typeof IMAGE_EDITOR_SECTIONS !== 'undefined') {
				clearInterval(interval)
				try {
					if (imageEditor.containerScale === undefined) imageEditor.containerScale = 1.0
					addToolButtons(imageEditor)
					addSection(imageEditor, lineWidthSection)
					addSection(imageEditor, fillSection)
					patchEditor(imageEditor)
					updateSectionVisibility(imageEditor)
				} catch (e) {
					console.error('Error setting up shape tools:', e)
				}
			}
			if (tries > 200) clearInterval(interval)
		}, 100)
	}

	waitForEditorsAndWire()

})();
