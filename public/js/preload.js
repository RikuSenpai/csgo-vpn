const { ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const countryList = require("country-list");

// Pass modules down to the page
window.ipcRenderer = ipcRenderer;
window.countryList = countryList;

// Get all the available flags and pass them down to the page
let flagsPath = path.join(__dirname, "..", "images", "flags");
fs.readdir(flagsPath, (err, files) => {
	if (err) {
		throw err;
	}

	// Currently the images are not used anyways
	// but maybe in the future I will add high resolution images

	window.flags = files.filter(f => f.endsWith(".png")).map((file) => {
		let parts = file.split(".");
		parts.pop();
		return parts.join(".");
	});
});
