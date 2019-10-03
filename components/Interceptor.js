const Events = require("events");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const https = require("https");
const detect = require("detect-port");
const Config = require("./Config.js");
const Steam = require("./Steam.js");

module.exports = class Interceptor extends Events {
	constructor() {
		super();

		this.server = null;
		this.wss = null;
		this.clientSocket = null;
		this.serverSocket = null;
		this.port = 21812;
		this.country = null;
		this.mainWindow = null;
		this.config = new Config();
		this.steam = new Steam();
	}

	start(country, mainWindow) {
		return new Promise((resolve, reject) => {
			// Setup the WebSocket server with a working port
			this.mainWindow = mainWindow;
			this.country = country;

			this.server = https.createServer({
				cert: fs.readFileSync(path.join(__dirname, "..", "certificate", "cert.pem")),
				key: fs.readFileSync(path.join(__dirname, "..", "certificate", "cert.key"))
			});
			this.wss = new WebSocket.Server({
				server: this.server
			});

			this._setup();

			detect(this.port, async (err, _port) => {
				if (err) {
					reject(err);
					return;
				}

				this.port = _port;
				this.server.listen(this.port);

				// Save the original config file
				let steamPath = await this.config.findSteamPath(this.mainWindow);
				this.config.saveConfigWebsockets();
				this.config.overrideConfigWebsockets(this.port);

				// Kill all steam processes and restart it
				await this.steam.KillSteam();
				await this.steam.StartSteam(steamPath.raw, true);

				// We are now done here and only have to wait for a connection
				resolve(true);
			});
		});
	}

	stop() {
		return new Promise(async (resolve, reject) => {
			let r = await this.steam.KillSteam(true).catch(reject);
			if (!r) {
				return;
			}

			if (this.wss) {
				this.wss.close();
			}

			if (this.server) {
				this.server.close();
			}

			if (this.clientSocket) {
				this.clientSocket.close();
			}

			if (this.serverSocket) {
				this.serverSocket.close();
			}

			this.wss = null;
			this.server = null;
			this.clientSocket = null;
			this.serverSocket = null;

			resolve(true);
		});
	}

	_setup() {
		this.wss.on("error", (err) => {
			this.emit("s_error", err);
		});

		this.wss.on("listening", () => {
			this.emit("s_listening");
		});

		this.wss.on("connection", async (ws, req) => {
			// Add backlog for when data is sent during cm pinging
			let clientSocketBacklog = [];
			let serverSocketBacklog = [];

			// Only allow up to one connection (There shouldn't be more anyways)
			if (this.clientSocket) {
				ws.close();
				return;
			}
			this.clientSocket = ws;

			this.clientSocket.on("error", (err) => {
				this.emit("error", err);
			});

			this.clientSocket.on("message", (data) => {
				console.log("<<< " + data.toString("hex").toUpperCase());

				if (!this.serverSocket || this.serverSocket.readyState !== this.serverSocket.OPEN) {
					serverSocketBacklog.push(data);
					return;
				}

				this.serverSocket.send(data);
			});

			this.clientSocket.on("open", () => {
				while (clientSocketBacklog.length > 0) {
					this.clientSocket.send(clientSocketBacklog.shift());
				}
			});

			this.clientSocket.on("close", () => {
				this.clientSocket = null;
				this.emit("close");
			});

			// Ping connection managers
			this.mainWindow.webContents.send("status", {
				message: "Ping checking...",
				button: false
			});
			let goodCM = await this.steam.SocketPing().catch((err) => {
				console.error(err);
			});
			if (!goodCM) {
				this.stop();
				this.mainWindow.webContents.send("status", {
					message: "Failed",
					button: true
				});
				this.mainWindow.webContents.send("vpn", {
					canceled: true
				});
				return;
			}

			this.mainWindow.webContents.send("status", {
				message: "Connecting...",
				button: false
			});

			// We got an incoming connection, connect to a Steam server
			this.serverSocket = new WebSocket(goodCM);

			this.serverSocket.on("message", (data) => {
				console.log(">>> " + data.toString("hex").toUpperCase());

				if (!this.clientSocket || this.clientSocket.readyState !== this.clientSocket.OPEN) {
					clientSocketBacklog.push(data);
					return;
				}

				this.clientSocket.send(data);
			});

			this.serverSocket.on("error", (err) => {
				this.emit("error", err);
			});

			this.serverSocket.on("open", () => {
				while (serverSocketBacklog.length > 0) {
					this.serverSocket.send(serverSocketBacklog.shift());
				}
			});

			this.serverSocket.on("close", () => {
				this.serverSocket = null;
				this.emit("close");
			});

			while (
				!this.serverSocket || this.serverSocket.readyState !== this.serverSocket.OPEN ||
				!this.clientSocket || this.clientSocket.readyState !== this.clientSocket.OPEN
			) {
				await new Promise(p => setTimeout(p, 500));
				continue;
			}

			this.mainWindow.webContents.send("status", {
				message: "Connected",
				button: true
			});
		});
	}
}
