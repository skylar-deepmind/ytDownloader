const { test, expect } = require("@playwright/test");
const {
	launchApp,
	getExecutedCommands,
	clearExecutedCommands,
	DEFAULT_MOCK_METADATA,
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

test.describe("Subtitle Selector Tests", () => {
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

	test("subtitle selector lists Origin first with existing tracks", async () => {
		await pasteAndFetchInfo(page);

		const info = await page.evaluate(() => {
			const container = document.getElementById("subtitleSelectContainer");
			const select = document.getElementById("subtitleLangSelect");
			const data = select.slim ? select.slim.getData() : [];
			return {
				containerDisplay: container ? container.style.display : null,
				optionValues: data.map((o) => o.value),
				firstSelected: data.length > 0 ? data[0].selected : null,
			};
		});

		expect(info.containerDisplay).toBe("block");
		expect(info.optionValues[0]).toBe("origin");
		expect(info.optionValues).toContain("en");
		expect(info.optionValues).toContain("zh-Hans");
		expect(info.optionValues).toContain("fr");
		expect(info.firstSelected).toBe(true);
	});

	test("default Origin selection adds subtitle flags to download command", async () => {
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
		expect(downloadCmd).toContain("--write-subs");
		expect(downloadCmd).toContain("--sub-format");
		expect(downloadCmd).toContain("srt/best");
		expect(downloadCmd).toContain("--sub-langs");
		expect(downloadCmd).toContain("origin");
	});

	test("selected languages are passed to yt-dlp", async () => {
		await pasteAndFetchInfo(page);

		await page.evaluate(() => {
			const select = document.getElementById("subtitleLangSelect");
			select.slim.setSelected(["origin", "en"]);
		});

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
		expect(downloadCmd).toContain("--sub-langs");
		expect(downloadCmd).toContain("origin,en");
	});
});

test.describe("Subtitle Selector Without Subtitle Tracks", () => {
	let electronApp;
	let page;

	test.beforeEach(async () => {
		const res = await launchApp(
			{},
			{
				...DEFAULT_MOCK_METADATA,
				subtitles: {},
				automatic_captions: {},
			},
		);
		electronApp = res.app;
		page = res.page;
	});

	test.afterEach(async () => {
		if (electronApp) {
			await electronApp.close();
		}
	});

	test("selector hidden and no subtitle flags when video has no subtitles", async () => {
		await pasteAndFetchInfo(page);

		const containerDisplay = await page.evaluate(() => {
			const container = document.getElementById(
				"subtitleSelectContainer",
			);
			return container ? container.style.display : null;
		});
		expect(containerDisplay).toBe("none");

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
		expect(downloadCmd).not.toContain("--write-subs");
		expect(downloadCmd).not.toContain("--sub-langs");
	});
});
