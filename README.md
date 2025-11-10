# ed-plugins
## Plugins for use with Easy Diffusion, featuring Scale Up

These tools are intended for use with the Stable Diffusion UI, [Easy Diffusion](https://github.com/easydiffusion/easydiffusion).  See the [ED Wiki](https://github.com/easydiffusion/easydiffusion/wiki/UI-Plugins) for more information on how to install plugins, or use ED's Plugin Manager.

### ScaleUp

Adds options to easily scale-up to a slightly-higher resolution.  This will add detail, as well as increase resolution.

Various settings are tweaked automatically, to get the best out of each model.  Click on the ScaleUp label to cycle through various options.  Avoid using the ControlNet option with higher resolutions.  Eventually, you may hit a limit where the model is just too large for a given resolution on your video card; if you still want higher resolution, use the split/merge option that will generate 4 separate images and stitch them together.
[ScaleUp](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/master/scaleup.plugin.js)

If you want to use the ControlNet feature with SDXL or Flux, you need to download these models:
```Canny/SDXL: https://huggingface.co/lllyasviel/sd_control_collection/tree/main
Canny/Flux: https://huggingface.co/XLabs-AI/flux-controlnet-canny-v3
Tile for SDXL and Flux: https://huggingface.co/TTPlanet/TTPLanet_SDXL_Controlnet_Tile_Realistic/tree/main
```

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

### Clone Brush

Adds a clone brush/tool to the editor.  Right-click to set the source texture, and left-click to draw with the pattern.  Draw over odd objects, 3rd legs, etc., leaving a texture, rather than the Draw tool's solid colors.
[Clone Brush](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/clonebrush.plugin.js)

### Ratios

Adds buttons to allow easy selection of starting values at the selected ratio.  It uses smaller values for SD 1.x, larger for SDXL, and largest for Flux.
[Ratios](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/ratios.plugin.js)

### Magnifier

Adds a circular magnifier to the image window, to aid in examining details.
[Magnifier](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/magnifier.plugin.js)

### LLM Prompt Generation

This plugin adds a button that calls a local LLM using an OpenAI API endpoint, requesting a more detailed prompt.  Either make the prompt field blank, in which case the LLM will create its own, or use an existing prompt which the LLM will expand upon.  This may be useful for newer models that seem to work better with more detail in their prompting.

[LLM Prompt Generation](https://raw.githubusercontent.com/AvidGameFan/ed-plugins/refs/heads/master/llm-image-generator.plugin.js)

Tested using Oobabooga's text-generation UI, but other LLM UIs may work if they support the same OpenAI API call.  The default URL is the same URL that is hosting Easy Diffusion, but with :5000 as the port.  If your LLM service is at a different URL or port number, you need to edit the plugin and change the default URL near the top of the file.

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

# JSON Prompt Extractor

A utility to extract "prompt" elements from Easy Diffusion's sidecar JSON files from all subdirectories and save them to a text file.

The resulting list can be cut-and-pasted into the Prompter! plugin by Duckface.

## Features

- Recursively searches all subdirectories for `.json` files
- Extracts the "prompt" field from each JSON file
- Handles both single objects and arrays of objects
- Outputs prompts with quotes and comma separation
- Error handling for malformed JSON files
- Progress reporting

## Requirements

- Python 3.6 or higher
- No external dependencies required

## Usage

### Method 1: Direct Python Script

```bash
python extract_prompts.py <root_directory> <output_file>
```

**Examples:**
```bash
# Search current directory and output to prompts.txt
python extract_prompts.py . prompts.txt

# Search specific directory and output to custom file
python extract_prompts.py "C:\MyData" "C:\Output\my_prompts.txt"

# Search relative path
python extract_prompts.py ./data ./output/prompts.txt
```

### Method 2: Windows Batch File (Easier)

```cmd
# Use defaults (current directory, prompts.txt)
extract_prompts.bat

# Specify directory only
extract_prompts.bat "C:\MyData"

# Specify both directory and output file
extract_prompts.bat "C:\MyData" "C:\Output\prompts.txt"
```

## Output Format

The output file will contain all prompts in this format:
```
"prompt1", "prompt2", "prompt3", "prompt4"
```

## JSON File Formats Supported

The utility handles these JSON structures:

**Single object:**
```json
{
  "prompt": "A beautiful landscape",
  "other_field": "value"
}
```

**Array of objects:**
```json
[
  {
    "prompt": "First prompt",
    "other_field": "value"
  },
  {
    "prompt": "Second prompt",
    "other_field": "value"
  }
]
```

## Error Handling

- Skips files that aren't valid JSON
- Skips files without a "prompt" field
- Skips empty prompts
- Reports errors but continues processing other files
- Provides summary of processed files and extracted prompts

## Example Output

```
Searching for JSON files in: ./data
Output will be written to: prompts.txt
--------------------------------------------------
Successfully processed 15 JSON files
Extracted 12 prompts
Output written to: prompts.txt

✅ Extraction completed successfully!
```
