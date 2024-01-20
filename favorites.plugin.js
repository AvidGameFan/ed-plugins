/***
 * 
 * Favorites Plugin for Easy Diffusion
 * v.0.9.0, last updated: 1/19/2024
 * By Gary W.
 * 
 * This plugin allows you to tag your favorite images, by saving the seeds to a file.  
 * This file can then be used externally to assist with finding and copying just those
 * images out of what is often a working folder with many unnecessary intermediate files.
 * 
 * See separate utility to automatically move a batch of images.
 * 
 * 
 * Free to use with the CMDR2 Stable Diffusion UI.
 * 
 */

(function() { "use strict"

var loadDate = Date.now();  //load date as soon as possible, to closely match the folder date

const suLabel = 'Favorites';  //base label prefix
PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { html: '<span class="favorites-label" style="background-color:transparent;background: rgba(0,0,0,0.5)">'
    +suLabel+':</span>', type: 'label'},
  { html: '<i class="fa-regular fa-heart"></i>', on_click: onFavoritesClick, filter: onFavoritesClickFilter  },
  { html: '<i class="fa-regular fa-floppy-disk"></i>', on_click: onFavoritesSaveClick, filter: onFavoritesSaveClickFilter  }
])

var names ="List of selected Favorites (seeds)\n";

function onFavoritesClick(origRequest, image) {
    //const name = getDownloadFilename(image, origRequest["output_format"])
    //names=name+'\t'+convertDateToStr(1705429635772)+'\n';

    //toggle the icon
    let unselected= this.children[0].classList.replace('fa-regular','fa-solid')
    //if we already selected, don't save the seed again
    if (unselected) {
      names=names+image.dataset["seed"]+'\n';
    }
    //could remove from the list, with an untoggle -- future enhancement
}

//Save text file with list of seeds
function onFavoritesSaveClick(origRequest, image) {
    // Create a blob from the text
var blob = new Blob([names], {type: "text/plain;charset=utf-8"});

// Create a temporary URL for the blob
var url = URL.createObjectURL(blob);

// Create an anchor element with the download attribute
var a = document.createElement("a");
a.href = url;
a.download = "favoriteslist-"+loadDate+".txt";

// Append the anchor to the document body
document.body.appendChild(a);

// Trigger a click event on the anchor
a.click();

// Remove the anchor from the document body
document.body.removeChild(a);

// Revoke the temporary URL
URL.revokeObjectURL(url);
}

function onFavoritesClickFilter(origRequest, image) {
    return true;
}

function onFavoritesSaveClickFilter(origRequest, image) {
    return true;
}
})();
