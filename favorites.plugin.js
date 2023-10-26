/***
 * 
 * Favorites Plugin for Easy Diffusion
 * 
 * Experimental
 */

(function() { "use strict"

const suLabel = 'Favorites';  //base label prefix
PLUGINS['IMAGE_INFO_BUTTONS'].push([
  { html: '<span class="favorites-label" style="background-color:transparent;background: rgba(0,0,0,0.5)">'
    +suLabel+':</span>', type: 'label'},
  { html: '<i class="fa-regular fa-heart"></i>', on_click: onFavoritesClick, filter: onFavoritesClickFilter  },
  { html: '<i class="fa-regular fa-floppy-disk"></i>', on_click: onFavoritesSaveClick, filter: onFavoritesSaveClickFilter  }
])

var names;

function onFavoritesClick(origRequest, image) {
    const name = getDownloadFilename(image, origRequest["output_format"])
    names=name+'\n';
}


function onFavoritesSaveClick(origRequest, image) {
    // Create a blob from the text
var blob = new Blob([names], {type: "text/plain;charset=utf-8"});

// Create a temporary URL for the blob
var url = URL.createObjectURL(blob);

// Create an anchor element with the download attribute
var a = document.createElement("a");
a.href = url;
a.download = "favoriteslist.txt";

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
