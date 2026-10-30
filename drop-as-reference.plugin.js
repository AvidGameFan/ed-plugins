/* Drop As Reference Image Plugin

 v. 1.0.0, last updated: 10/30/2026
 By Gary W. using CoPilot/Claude Sonnet 5.5

 Free to use with the CMDR2 Stable Diffusion UI, Easy Diffusion.

 Description:

Adds a fourth drag-and-drop destination, "Use as Reference Image", next to the existing
"Use as Image2Image source", "Extract embedded metadata" and "Use as Controlnet image" areas.
Dropped images (files, or images dragged from the page / another browser tab) are added to the
end of the reference image list; existing reference images are kept.

Reference images are only used by models that support them (such as Flux Klien).
*/

(function() { "use strict"

	var AREA_ID = 'drop-area-REF'

	function blobToDataUrl(blob) {
		return new Promise(function(resolve, reject) {
			var reader = new FileReader()
			reader.onload = function() { resolve(reader.result) }
			reader.onerror = reject
			reader.readAsDataURL(blob)
		})
	}

	// Dropped URLs must become data URLs, as the reference list is sent to the server as base64.
	function urlToDataUrl(url) {
		if (url.startsWith('data:')) return Promise.resolve(url)
		return fetch(url).then(function(r) { return r.blob() }).then(blobToDataUrl)
	}

	function firstUrl(text) {
		// text/uri-list allows "#" comment lines; text/x-moz-url is "url\ntitle"
		var line = text.split(/\r?\n/).map(function(l) { return l.trim() }).find(function(l) { return l && !l.startsWith('#') })
		return line || null
	}

	function getDroppedImages(event) {
		var dt = event.dataTransfer
		var files = Array.from(dt.files || []).filter(function(f) { return f.type.startsWith('image/') })
		if (files.length > 0) return files.map(blobToDataUrl)

		var types = ['text/uri-list', 'text/x-moz-url']
		for (var i = 0; i < types.length; i++) {
			var text = dt.getData(types[i])
			var url = text && firstUrl(text)
			if (url) return [urlToDataUrl(url)]
		}
		return []
	}

	function createArea(anchor) {
		var area = document.createElement('div')
		area.id = AREA_ID
		area.className = 'drop-area'
		area.textContent = 'Use as Reference Image'
		anchor.parentNode.insertBefore(area, anchor.nextSibling)

		area.addEventListener('dragenter', function(e) {
			e.preventDefault()
			area.style.backgroundColor = 'darkGreen'
		})
		area.addEventListener('dragover', function(e) { e.preventDefault() })
		area.addEventListener('dragleave', function(e) {
			e.preventDefault()
			area.style.backgroundColor = ''
		})
		area.addEventListener('drop', function(e) {
			e.stopPropagation()
			e.preventDefault()
			area.style.display = 'none'
			area.style.backgroundColor = ''
			// The other areas are hidden by the editor-wide drop handler, which we've stopped.
			document.querySelectorAll('.drop-area').forEach(function(a) {
				a.style.display = 'none'
				a.style.backgroundColor = ''
			})

			if (typeof addRefImage !== 'function') {
				console.error('Drop As Reference: addRefImage() not found. Is main.js loaded?')
				return
			}
			getDroppedImages(e).forEach(function(promise) {
				promise.then(addRefImage).catch(function(err) {
					console.error('Drop As Reference: could not load the dropped image', err)
					if (typeof showToast === 'function') showToast('Could not load the dropped image as a reference image.')
				})
			})
		})
	}

	// The built-in areas are created by another core plugin, so wait for them.
	var tries = 0
	var interval = setInterval(function() {
		tries++
		var anchor = document.getElementById('drop-area-CN')
		if (anchor) {
			clearInterval(interval)
			if (!document.getElementById(AREA_ID)) createArea(anchor)
		} else if (tries > 200) {
			clearInterval(interval)
		}
	}, 100)

})();
