import { ActionPanel, Form, Action, showToast, Toast } from "@raycast/api";
import { exec } from "child_process";
import path from "path";
import os from "os";
import util from "util";
import fs from "fs/promises";

const execPromise = util.promisify(exec);

interface FormValues {
  url: string;
  device: "mobile" | "desktop";
  performance: boolean;
  accessibility: boolean;
  bestPractices: boolean;
  seo: boolean;
}

// Function to find Lighthouse executable path
async function findLighthousePath(): Promise<string | null> {
  const potentialPaths = [
    '/usr/local/bin/lighthouse',
    '/usr/bin/lighthouse',
    '/opt/homebrew/bin/lighthouse',
    `${os.homedir()}/.npm-global/bin/lighthouse`,
    path.join(os.homedir(), '.npm', 'bin', 'lighthouse'),
    path.join(os.homedir(), 'node_modules', '.bin', 'lighthouse')
  ];

  for (const potentialPath of potentialPaths) {
    try {
      await fs.access(potentialPath, fs.constants.X_OK);
      return potentialPath;
    } catch {}
  }

  // Fallback: try to get path from `which` command
  try {
    const { stdout } = await execPromise('which lighthouse');
    return stdout.trim();
  } catch {}

  return null;
}

export default function Command() {
  async function handleSubmit(values: FormValues): Promise<void> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Running Lighthouse Analysis...",
    });

    try {
      // Validate URL
      if (!values.url) {
        throw new Error("URL is required");
      }

      // Find Lighthouse path
      const lighthousePath = await findLighthousePath();
      if (!lighthousePath) {
        throw new Error("Lighthouse CLI not found. Please install it globally.");
      }

      // Ensure URL has a protocol
      const formattedUrl = values.url.startsWith('http') 
        ? values.url 
        : `https://${values.url}`;

      // Prepare categories
      const categories: string[] = [];
      if (values.performance) categories.push("performance");
      if (values.accessibility) categories.push("accessibility");
      if (values.bestPractices) categories.push("best-practices");
      if (values.seo) categories.push("seo");

      // Prepare output path
      const outputPath = path.join(
        os.tmpdir(),
        `lighthouse-report-${Date.now()}.json`
      );

      // Construct Lighthouse CLI command
      const command = [
        lighthousePath,
        `"${formattedUrl}"`,
        `--output=json`,
        `--output-path="${outputPath}"`,
        `--only-categories=${categories.join(",")}`,
        "--quiet",
        "--disable-full-page-screenshot",
        "--disable-storage-reset",
        '--chrome-flags="--headless --no-sandbox --disable-gpu"'
      ];

      // Add device-specific settings
      if (values.device === 'desktop') {
        command.push('--preset=desktop');
      } else {
        command.push('--form-factor=mobile');
      }

      const fullCommand = command.join(" ");
      console.log("Executing Lighthouse command:", fullCommand);

      // Execute Lighthouse
      const { stdout, stderr } = await execPromise(fullCommand, {
        env: {
          ...process.env,
          PATH: `${process.env.PATH || ''}:/usr/bin:/usr/local/bin:/opt/homebrew/bin`
        }
      });

      console.log("Lighthouse stdout:", stdout);
      console.log("Lighthouse stderr:", stderr);

      // Verify report was created
      await fs.access(outputPath);

      // Update success toast
      toast.style = Toast.Style.Success;
      toast.title = "Analysis Complete";
      toast.message = `JSON Report saved to: ${outputPath}`;

      // Open report
      await execPromise(`open "${outputPath}"`);
    } catch (error) {
      console.error("Lighthouse Analysis Error:", error);

      // Detailed error handling
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Failed to run Lighthouse analysis";

      toast.style = Toast.Style.Failure;
      toast.title = "Lighthouse Analysis Failed";
      toast.message = errorMessage;

      // Show installation instructions
      await showToast({
        style: Toast.Style.Failure,
        title: "Installation Required",
        message: "Install Lighthouse globally: npm install -g lighthouse"
      });

      throw error;
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Run Lighthouse Analysis"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="Website URL"
        placeholder="example.com"
        autoFocus
      />

      <Form.Dropdown id="device" title="Device" defaultValue="mobile">
        <Form.Dropdown.Item value="mobile" title="Mobile" />
        <Form.Dropdown.Item value="desktop" title="Desktop" />
      </Form.Dropdown>

      <Form.Checkbox 
        id="performance" 
        label="Performance" 
        defaultValue={true} 
      />
      <Form.Checkbox
        id="accessibility"
        label="Accessibility"
        defaultValue={true}
      />
      <Form.Checkbox
        id="bestPractices"
        label="Best Practices"
        defaultValue={true}
      />
      <Form.Checkbox 
        id="seo" 
        label="SEO" 
        defaultValue={true} 
      />
    </Form>
  );
}
