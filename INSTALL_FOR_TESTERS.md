# Install Deepread (alpha)

Thanks for testing. This takes about 90 seconds. You'll need Google Chrome (or any Chromium browser: Edge, Brave, Arc).

## Install

1. Download `deepread-v0.1.0.zip` (the file you were sent).
2. **Unzip it somewhere stable.** Don't put it in `~/Downloads` if you clean that folder regularly — Chrome reads from this directory every time it loads the extension. A folder like `~/Applications/deepread/` is fine.
3. Open Chrome and go to **`chrome://extensions`** (paste that into the address bar).
4. Toggle **Developer mode** on (top-right corner).
5. Click **Load unpacked** (top-left).
6. Select the **unzipped folder** (not the zip itself).
7. The Deepread extension should appear in your list. **Pin it** to the toolbar: click the puzzle-piece icon in Chrome's toolbar, then the pin icon next to Deepread.

## First run

1. Click the Deepread icon — a popup appears. Click **Open side panel**.
2. The side panel shows a 3-step onboarding screen. Read it. Click **Get started**.
3. Switch to the **Settings** tab. Pick a provider:
   - **Anthropic** (default): paste your `sk-ant-...` API key, click **Save & test**. Get a key at <https://console.anthropic.com>.
   - **Ollama** (free, local): install <https://ollama.com>, run `ollama pull llama3.1`, then in Settings: endpoint `http://localhost:11434`, model `llama3.1`, **Save & test**.
   - **DeepSeek**: paste your DeepSeek API key, **Save & test**.
4. Open a long-form article in your tab (a Substack post, NYT article, blog post — anything that's mostly text).
5. Switch back to the **Brief** tab in the side panel and click **Analyze this page**. You should see a verdict + brief within 5–10 seconds.
6. Click **Open reader** for the full reading experience. Inside the reader:
   - **Click any word** for a definition.
   - **Press Space** to start the pacer.
   - **↑ / ↓** to change pacer speed (±25 WPM).
   - **← / →** to step backwards/forwards a word.
   - **Esc** to close the reader.
7. After the analysis, you'll see a 1–10 rating slider in the side panel. **Rate every analysis** — these ratings are how we learn what's working.

## Privacy — what gets sent where

- The page text Deepread analyzes goes to the provider you picked (Anthropic / Ollama / DeepSeek). Nothing else.
- Your API key, your reading history, your ratings, and your stats are stored **only on your device**. No cloud, no telemetry to us during this alpha.
- The extension is **off by default on every page** — it does nothing until you click "Analyze this page". It's also blocked by default on banking, email, calendar, and workspace tools (Gmail, Slack, etc.).

## Updating

When a new version drops (you'll get a new zip):
1. Unzip into the same folder, replacing the old files. (Or unzip into a new folder and update the path in `chrome://extensions`.)
2. Go to `chrome://extensions` and click the **reload** icon on the Deepread card.

## Reporting bugs and feedback

- **Built-in rating**: every time you finish reading, drag the 1–10 slider in the side panel. That's the most important signal.
- **Anything else**: send a short message — what page you were on, what you expected, what happened. Screenshots are gold. Reach me at `<your email here>`.

Common things that help:

- The **service worker console** has logs that are useful for bug reports. To open it: `chrome://extensions` → find Deepread → click the **service worker** link under "Inspect views". Copy any red errors you see.
- The **side panel console**: right-click inside the side panel → **Inspect**. Same thing for errors.

## Known issues / quirks

- "Disable developer mode extensions" yellow banner appears in Chrome on every restart. That's a Chrome-wide warning for any unpacked extension; it doesn't mean Deepread is broken. Click "Cancel".
- Some sites (paywalls, single-page apps like Twitter / Reddit feeds) aren't readable as articles. Deepread will refuse to extract them — open a long-form article page instead.
- If the side panel gets into a weird state, close and reopen it via the toolbar icon.

Thanks for trying it. Your feedback is what shapes the next version.
