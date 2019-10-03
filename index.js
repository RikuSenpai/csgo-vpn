// Modules
const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const url = require("url");
const Interceptor = require("./components/Interceptor.js");

// Global variables
let mainWindow = null;
let interceptor = new Interceptor();

async function createWindow() {
	// Setup menu
	let menu = Menu.buildFromTemplate([
		{
			label: "Reload",
			accelerator: "CmdOrCtrl+R",
			click(item, focusedWindow) {
				if (focusedWindow) {
					focusedWindow.reload();
				}
			}
		},
		{
			label: "Toggle Developer Tools",
			accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
			click(item, focusedWindow) {
				if (focusedWindow) {
					focusedWindow.webContents.toggleDevTools();
				}
			}
		}
	]);
	Menu.setApplicationMenu(menu);

	// Create the browser window
	mainWindow = new BrowserWindow({
		width: 770 + 16,
		height: 600 + 58,
		webPreferences: {
			preload: path.join(__dirname, "public", "js", "preload.js")
		},
		show: false,
		resizable: false
	});

	// Load main page
	mainWindow.loadURL(url.format({
		pathname: path.join(__dirname, "public", "html", "index.html"),
		protocol: "file:",
		slashes: true
	}));

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
	});
}

app.on("ready", createWindow);

app.on("window-all-closed", () => {
	if (process.platform === "darwin") {
		return;
	}

	app.quit();
});

app.on("activate", () => {
	if (mainWindow) {
		return;
	}

	createWindow();
});

ipcMain.on("vpn", async (ev, args) => {
	if (!mainWindow) {
		return;
	}

	if (args.enabled) {
		mainWindow.webContents.send("status", {
			message: "Starting...",
			button: false
		});

		await interceptor.start(args.country, mainWindow);
	} else {
		mainWindow.webContents.send("status", {
			message: "Stopping...",
			button: false
		});

		await interceptor.stop();

		mainWindow.webContents.send("status", {
			message: "Waiting",
			button: true
		});
	}
});

process.on("unhandledRejection", (reason, promise) => {
	console.error(reason, promise);
});
