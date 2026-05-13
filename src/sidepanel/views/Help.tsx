export function Help() {
  return (
    <div className="space-y-6 p-4 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
      <Section title="Using Deepread">
        <ol className="ml-5 list-decimal space-y-1.5">
          <li>Open the page you want to read — an article, a public PDF, or a Google Doc.</li>
          <li>
            Click <Kbd>Analyze this page</Kbd> on the <strong>Brief</strong> tab.
          </li>
          <li>
            For PDFs and Google Docs, Chrome will ask you to grant access to that site. Approve it
            once per site.
          </li>
          <li>
            When the verdict, brief, and topics arrive, use <strong>Open reader</strong> (HTML pages
            only) for guided reading, or scroll down to <strong>Ask</strong> to chat with the
            article.
          </li>
          <li>
            History and rated analyses appear under the <strong>Stats</strong> tab.
          </li>
        </ol>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          Switching to another tab (Settings, Stats) preserves the current analysis. Click{" "}
          <strong>New</strong> in the Brief action bar to clear it.
        </p>
      </Section>

      <Section title="Setting up a model">
        <p className="text-neutral-600 dark:text-neutral-400">
          Pick one provider in <strong>Settings</strong>. You only need to configure the one you'll
          use.
        </p>

        <Subsection title="Anthropic (cloud)">
          <ol className="ml-5 list-decimal space-y-1">
            <li>
              Create a key at{" "}
              <ExtLink href="https://console.anthropic.com/settings/keys">
                console.anthropic.com
              </ExtLink>
              .
            </li>
            <li>
              Paste it into <strong>Settings → Anthropic API key</strong> and click{" "}
              <Kbd>Save &amp; test</Kbd>.
            </li>
          </ol>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Uses Claude Sonnet for analysis. Best quality, sends article text to Anthropic.
          </p>
        </Subsection>

        <Subsection title="Ollama (local, private)">
          <ol className="ml-5 list-decimal space-y-1">
            <li>
              Install Ollama from <ExtLink href="https://ollama.com">ollama.com</ExtLink>.
            </li>
            <li>
              Pull a tool-capable model: <Code>ollama pull llama3.1:8b</Code> (or{" "}
              <Code>qwen2.5:7b</Code>).
            </li>
            <li>
              Allow the extension's origin to call Ollama. Stop Ollama, then start it with the env
              var set:
              <pre className="mt-1.5 overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-900">
                <code>OLLAMA_ORIGINS="chrome-extension://*" ollama serve</code>
              </pre>
              On macOS with the menubar app, persist it then restart Ollama:
              <pre className="mt-1.5 overflow-x-auto rounded bg-neutral-100 p-2 text-xs dark:bg-neutral-900">
                <code>launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"</code>
              </pre>
            </li>
            <li>
              In <strong>Settings</strong>, set Endpoint to <Code>http://localhost:11434</Code>, set
              Model to the one you pulled, then <Kbd>Save &amp; test</Kbd>.
            </li>
          </ol>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Fully local — nothing leaves your machine. Tool/function calling support varies by
            model; if Test reports <em>"model returned text instead of a tool call"</em>, pick
            another model.
          </p>
        </Subsection>

        <Subsection title="DeepSeek (cloud)">
          <ol className="ml-5 list-decimal space-y-1">
            <li>
              Create a key at{" "}
              <ExtLink href="https://platform.deepseek.com">platform.deepseek.com</ExtLink>.
            </li>
            <li>
              Paste into <strong>Settings → DeepSeek API key</strong>, leave model as{" "}
              <Code>deepseek-chat</Code>, then <Kbd>Save &amp; test</Kbd>.
            </li>
          </ol>
        </Subsection>
      </Section>

      <Section title="What works, what doesn't">
        <p className="font-medium">Supported today</p>
        <ul className="ml-5 list-disc space-y-1 text-neutral-700 dark:text-neutral-300">
          <li>HTML articles (anything Readability can parse).</li>
          <li>Publicly fetchable PDFs and PDFs in Chrome's built-in viewer.</li>
          <li>Google Docs you can already open in your browser (uses your logged-in session).</li>
          <li>
            Multi-turn Q&amp;A about the analyzed document via <strong>Ask</strong>.
          </li>
          <li>Paywall detection (warning banner — analysis still runs).</li>
        </ul>

        <p className="mt-4 font-medium">Current limitations</p>
        <ul className="ml-5 list-disc space-y-1 text-neutral-700 dark:text-neutral-300">
          <li>
            Documents over ~50,000 characters are truncated. You'll see a banner — the rest of the
            document isn't analyzed.
          </li>
          <li>
            The guided reader works on HTML pages only. PDFs and Google Docs get the Brief and Ask,
            but no reader overlay.
          </li>
          <li>
            Private Google Docs you haven't opened in your browser won't be readable. Open the doc
            once (or ask the owner to share it), then retry.
          </li>
          <li>
            Google Slides and Sheets aren't supported. Only <Code>/document/d/…</Code> URLs.
          </li>
          <li>
            Conversations don't persist when you close the side panel — only within a session.
          </li>
          <li>
            Ollama models without function/tool-calling support won't work. llama3.1+ and qwen2.5+
            are known to work.
          </li>
          <li>
            Analyses are cached locally for 7 days. The "Recent analyses" list reflects whatever is
            still in cache.
          </li>
        </ul>
      </Section>

      <Section title="Troubleshooting">
        <ul className="ml-5 list-disc space-y-1 text-neutral-700 dark:text-neutral-300">
          <li>
            <strong>"Authentication failed" on Ollama:</strong> Ollama is rejecting the extension's
            origin. Set <Code>OLLAMA_ORIGINS</Code> as above and restart Ollama.
          </li>
          <li>
            <strong>"Cannot reach endpoint" on Ollama:</strong> Ollama isn't running, or the
            endpoint URL is wrong. Test with <Code>curl http://localhost:11434/api/tags</Code>.
          </li>
          <li>
            <strong>"Permission denied" on PDF/Doc:</strong> Chrome's host-permission prompt was
            denied. Open <Code>chrome://extensions</Code> → Deepread → "Site access" and grant the
            site.
          </li>
          <li>
            <strong>Analysis disappeared:</strong> use <strong>New</strong> only when you want to
            clear. Closing the side panel always clears state.
          </li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <h3 className="mb-1.5 text-sm font-medium">{title}</h3>
      {children}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-neutral-300 bg-neutral-50 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
      {children}
    </kbd>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[12px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
      {children}
    </code>
  )
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-700 underline hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {children}
    </a>
  )
}
