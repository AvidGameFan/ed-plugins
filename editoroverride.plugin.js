
/* Editor Override

This allows the image editor to load with the full resolution, allowing you to use the "draw" editor without it down-sizing upon save.

If your image exceeds your resolution, parts of the editor will scroll off the screen, which is not ideal, but better than the image
not generating correctly.  This can be mitigated to some extent by changing the zoom level on the browser.

*/

imageEditor.setSize =
function(width, height) {
    if (width == this.width && height == this.height) {
        return
    }

    if (width > height) {
        var max_size = width; //Math.min(parseInt(window.innerWidth * 0.9), width, 768)
        var multiplier = max_size / width
        width = (multiplier * width).toFixed()
        height = (multiplier * height).toFixed()
    } else {
        var max_size = height; //Math.min(parseInt(window.innerHeight * 0.9), height, 768)
        var multiplier = max_size / height
        width = (multiplier * width).toFixed()
        height = (multiplier * height).toFixed()
    }
    this.width = parseInt(width)
    this.height = parseInt(height)

    this.container.style.width = width + "px"
    this.container.style.height = height + "px"

    Object.values(this.layers).forEach((layer) => {
        layer.canvas.width = width
        layer.canvas.height = height
    })

    if (this.inpainter) {
        this.saveImage() // We've reset the size of the image so inpainting is different
    }
    this.setBrush()
    this.history.clear()
}

