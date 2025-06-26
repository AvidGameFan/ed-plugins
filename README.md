# ed-plugins
## Plugins for use with Easy Diffusion, featuring Scale Up

These tools are intended for use with the Stable Diffusion UI, [Easy Diffusion](https://github.com/easydiffusion/easydiffusion).  See the [ED Wiki](https://github.com/easydiffusion/easydiffusion/wiki/UI-Plugins) for more information on how to install plugins, or use ED's Plugin Manager.

### ScaleUp

Adds options to easily scale-up to a slightly-higher resolution.  This will add detail, as well as increase resolution.

Various settings are tweaked automatically, to get the best out of each model.  Click on the ScaleUp label to cycle through various options.  Avoid using the ControlNet option with higher resolutions.
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

### Prompt History

Simple list of past 20 prompts used.  Selecting an entry will update both the Positive and Negative prompts.  If you want to save more settings, see the History plugin by rbertus2000 or the Templates plugin by Patrice.
[Prompt History](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/prompthistory.plugin.js)

### Negative prompt - Model History

When the model is changed, restore the last-used negative prompt, steps, and guidance scale for that model.  If you want to save more settings, see the History plugin by rbertus2000 or the Templates plugin by Patrice.
[Negative History](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/negativehistory.plugin.js)

### Glitchify!

Just for fun -- screws up your image with random glitch effects, before sending it back through the AI, adding "glitch art" to the prompt.  Each use is unique.
[Glitchify](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/Glitchify.plugin.js)

### Editor Override

As of April 2025, the Easy Diffusion Draw editor does not handle large resolutions well.  This plugin will override the behavior and allow use of large resolutions, however, this only works well if your browser is running on a monitor with a large resolution.  Consider this as a somewhat temporary patch.  This plugin may need to be removed or replaced if ED is modified in this area.
[Editor Override](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/editoroverride.plugin.js)

### Ratios

Adds buttons to allow easy selection of starting values at the selected ratio.  It uses smaller values for SD 1.x, larger for SDXL, and largest for Flux.
[Ratios](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/ratios.plugin.js)

### Magnifier

Adds a circular magnifier to the image window, to aid in examining details.
[Magnifier](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/magnifier.plugin.js)

## Other

### Custom Modifiers

[Custom Artists.zip](https://app.box.com/s/pv5t50jm3qebsiydsqnxd3pnqpj0roq7) - a collection of artists, with some separated by category  
[Fooocus Styles.zip](https://app.box.com/s/q8bf32cqinjc920wkd2tjqzk24e89b2k) - art styles originally created for the Fooocus UI, adapted for use in ED.

Unzip these folders into your "modifiers" folder inside easydiffusion. See the [ED Wiki](https://github.com/easydiffusion/easydiffusion/wiki/Custom-Modifiers) for more information.

### Lora Keywords
Lists the keywords used within a Lora, sorting by frequency of occurance.  Usually the one with most hits is the "trigger" keyword to use for the Lora.

#### Usage
Open a Windows PowerShell command prompt and enter:
.\lora_keywords  -FileName "c:\my_lora.safetensors"

[lora_keywords.ps1](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/lora_keywords.ps1)