const countries = [];
const countryOverrides = [
	{
		code: "GB",
		name: "Great Britain"
	},
	{
		code: "IR",
		name: "Iran"
	},
	{
		code: "VE",
		name: "Venezuela"
	},
	{
		code: "TW",
		name: "Taiwan"
	},
	{
		code: "CC",
		name: "Cocos-Keeling Islands"
	},
	{
		code: "KR",
		name: "Korea"
	}
];
const buttonsPerRow = 4;

$(async () => {
	// Wait until we have access to a list of flags
	while (!window.flags) {
		await new Promise(p => setTimeout(p, 1));
	}

	// Add overrides
	window.countryList.overwrite(countryOverrides);

	// Format to a list of country names and codes
	countries.push(...window.flags.map((flag) => {
		return {
			name: window.countryList.getName(flag),
			code: flag
		}
	}).filter((flag) => {
		return flag.name;
	}).sort((a, b) => {
		return a.name.localeCompare(b.name);
	}));

	// Add buttons to page
	let btnSnippet = $("snippets > snippet[name=\"CountrySelection\"]").children();
	let colSnippet = $("snippets > snippet[name=\"CountryColumn\"]").children();
	for (let i = 0; i < countries.length; i++) {
		// Add a new column if needed
		if (i % buttonsPerRow === 0) {
			$("#country > #selection").append(colSnippet.clone());
		}

		// Add button to column
		let snip = btnSnippet.clone();
		snip.text(countries[i].name);
		snip.val(countries[i].code);
		/*
		The images exported from CSGO are too low resolution, do NOT use them
		They also cause the highlighting when selecting a button to not show up
		As well as making the text hard to read

		snip.css("background-size", "cover");
		snip.css("background-repeat", "no-repeat");
		snip.css("background-image", "url(\"../images/flags/" + countries[i].code + ".png\")");
		*/

		// Add button to last column
		$("#country > #selection").find("div:last-child").append(snip);
	}

	// Adjust width of buttons
	let longest = Math.max(...[...$("#country > #selection > div > button")].map(e => $(e).width()));
	$("#country > #selection > div > button").width(longest);

	// Add events to buttons
	$("#country > #selection > div").children("button").click((ev) => {
		// Downot allow changing countries if the VPN is active
		if ($("#vpnToggle > button[value=\"1\"]").hasClass("hidden")) {
			return;
		}

		$("#country > #selection > div").children("button").each((i, e) => {
			$(e).toggleClass("active", e.isEqualNode(ev.target));
		});
	});

	// Add events to search input
	$("#country > #header > input").on("input", (ev) => {
		let searchText = $(ev.target).val().trim().toLowerCase();
		console.log(searchText, searchText.length);

		if (searchText.length <= 0) {
			$("#country > #selection > div > button").css("display", "initial");
		} else {
			$("#country > #selection > div > button").each((i, e) => {
				if ($(e).text().toLowerCase().includes(searchText)) {
					$(e).css("display", "initial");
				} else {
					$(e).css("display", "none");
				}
			});
		}
	});

	// Add events to toggle buttons
	$("#vpnToggle").children("button").click((ev) => {
		// Nothing is selected, do not allow enabling
		if (!$("#country > #selection > div > button.active").get(0)) {
			return;
		}

		$("#vpnToggle").children("button").each((i, e) => {
			$(e).toggleClass("hidden", e.isEqualNode(ev.target));
		});

		// Ensure using only double equals here for type conversion
		window.ipcRenderer.send("vpn", {
			enabled: $(ev.target).val() == true,
			country: $("#country > #selection > div > button.active").val()
		});
	});
});
