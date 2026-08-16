const { test, expect } = require("@playwright/test");
const {
	launchApp,
	getExecutedCommands,
	clearExecutedCommands,
} = require("./helpers/electronApp");

async function waitForInfoPanel(page) {
	await page.waitForFunction(() => {
		const el = document.getElementById("hidden");
		return el && el.style.display === "inline-block";
	});
}

async function pasteAndFetchInfo(page) {
	const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
	await page.evaluate((url) => {
		window.electronAPI.clipboard.writeText(url);
	}, testUrl);
	await page.click("#pasteUrl");
	await waitForInfoPanel(page);
}

test.describe("Format Selector Tests", () => {
	let electronApp;
	let page;

	test.beforeEach(async () => {
		const res = await launchApp();
		electronApp = res.app;
		page = res.page;
	});

	test.afterEach(async () => {
		if (electronApp) {
			await electronApp.close();
		}
	});

	test("default video format selection is the smallest 1080p option", async () => {
		await page.evaluate(() => {
			localStorage.setItem("showMoreFormats", "true");
		});
		await pasteAndFetchInfo(page);

		const selected = await page.evaluate(() => {
			const select = document.getElementById("videoFormatSelect");
			return select.slim ? select.slim.getSelected() : select.value;
		});
		expect(selected).toEqual(["248|webm|1080|vp9"]);
	});

	test("video download uses selector-based -f instead of exact format ids", async () => {
		await pasteAndFetchInfo(page);
		await clearExecutedCommands(page);

		await page.evaluate(() => {
			document.getElementById("videoDownload").click();
		});

		await page.waitForFunction(() => {
			const cmds = window.__executedCommands || [];
			return cmds.some((cmd) => cmd.includes("-f"));
		});

		const commands = await getExecutedCommands(page);
		const downloadCmd = commands.find((cmd) => cmd.includes("-f"));
		expect(downloadCmd).toBeDefined();

		const fIndex = downloadCmd.indexOf("-f");
		const formatSelector = downloadCmd[fIndex + 1];
		expect(formatSelector).toContain("bvs[height=1080][ext=mp4]");
		expect(formatSelector).toContain("[vcodec^=avc1]");
		expect(formatSelector).toContain("+bestaudio[ext=m4a]");
		expect(formatSelector).toContain("best[height<=1080][ext=mp4]");
	});

	test("default audio track for video is the best available", async () => {
		await pasteAndFetchInfo(page);

		const selected = await page.evaluate(() => {
			const select = document.getElementById(
				"audioForVideoFormatSelect",
			);
			return select.slim ? select.slim.getSelected() : null;
		});

		expect(selected).toEqual(["140|m4a"]);
	});

	test("audio download uses bestaudio selector", async () => {
		await pasteAndFetchInfo(page);

		await page.evaluate(() => {
			document.getElementById("audioToggle").click();
		});

		await clearExecutedCommands(page);

		await page.evaluate(() => {
			document.getElementById("audioDownload").click();
		});

		await page.waitForFunction(() => {
			const cmds = window.__executedCommands || [];
			return cmds.some((cmd) => cmd.includes("-f"));
		});

		const commands = await getExecutedCommands(page);
		const downloadCmd = commands.find((cmd) => cmd.includes("-f"));
		expect(downloadCmd).toBeDefined();

		const fIndex = downloadCmd.indexOf("-f");
		const formatSelector = downloadCmd[fIndex + 1];
		expect(formatSelector).toBe("bestaudio[ext=m4a]/best");
	});
});
