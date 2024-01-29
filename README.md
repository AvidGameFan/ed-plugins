# ed-plugins
## Plugins for use with Easy Diffusion, featuring Scale Up

These tools are intended for use with the Stable Diffusion UI, [Easy Diffusion](https://github.com/easydiffusion/easydiffusion).  See the [ED Wiki](https://github.com/easydiffusion/easydiffusion/wiki/UI-Plugins) for more information on how to install plugins, or use ED's Plugin Manager.

### ScaleUp

Adds options to easily scale-up to a slightly-higher resolution.  This will add detail, as well as increase resolution.
[ScaleUp](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/master/scaleup.plugin.js)

### OutpaintIt

Allows painting outside of the original image.  Simple one-click interface.
[OutpaintIt](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/master/OutpaintIt.plugin.js)

### Favorites

 Tag images to more easily organize them by moving your favorites to another location.

 Click the heart icon to tag images in the browser, then, before you close the browser tab, click the disk icon to save the list of seeds corresponding to the images you tagged to a text file.  You can manually look for these seeds (for example, using the sidecar .txt or .json files), or use an external copy utility that nearly automates the process.

[Favorites](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/master/favorites.plugin.js)

[Copy utility MoveSelectedFavorites.exe](https://github.com/AvidGameFan/MoveSelectedFavorites/tree/main/bin/Release)

#### Notes on using MoveSelectedFavorites
Currently, files are copied, not moved, and not overwritten.  The Favorites txt file is usually placed in your downloads folder, while your images are typically saved in your home folder, under Stable Diffusion UI.  The utility attempts to match the number in the favorites txt file with the folder name.

### Custom Modifiers

[Custom Artists.zip](https://app.box.com/s/pv5t50jm3qebsiydsqnxd3pnqpj0roq7) - a collection of artists, with some separated by category  
[Fooocus Styles.zip](https://app.box.com/s/q8bf32cqinjc920wkd2tjqzk24e89b2k) - art styles originally created for the Fooocus UI, adapted for use in ED.

Unzip these folders into your "modifiers" folder inside easydiffusion. See the [ED Wiki](https://github.com/easydiffusion/easydiffusion/wiki/Custom-Modifiers) for more information.
