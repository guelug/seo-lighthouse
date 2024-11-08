import { 
  Detail, 
  ActionPanel, 
  Form, 
  Action, 
  Icon, 
  Color, 
  showToast, 
  Toast, 
  getPreferenceValues,
  openCommandPreferences,
} from "@raycast/api";
import { useState, useEffect } from "react";
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
  outputPath: string;
}

interface Preferences {
  outputPath?: string; // Path where JSON reports will be saved
}

interface LighthouseReport {
  categories: {
    performance: { score: number },
    accessibility: { score: number },
    'best-practices': { score: number },
    seo: { score: number }
  };
  audits: {
    [key: string]: {
      title?: string;
      description?: string;
      displayValue?: string;
      score?: number;
    }
  };
}

// Lighthouse Path Finding Function
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

  try {
    const { stdout } = await execPromise('which lighthouse');
    return stdout.trim();
  } catch {}

  return null;
}

// Lighthouse Report View Component
function LighthouseReportView({ reportPath }: { reportPath: string }) {
  const [report, setReport] = useState<LighthouseReport | null>(null);

  useEffect(() => {
    async function loadReport() {
      try {
        const reportContent = await fs.readFile(reportPath, 'utf-8');
        const parsedReport = JSON.parse(reportContent);
        setReport(parsedReport);
      } catch (error) {
        console.error("Failed to load report", error);
      }
    }
    loadReport();
  }, [reportPath]);

  if (!report) {
    return <Detail markdown="Loading report..." />;
  }

  const renderScoreIcon = (score: number) => {
    if (score >= 0.9) return { source: Icon.CheckCircle, tintColor: Color.Green };
    if (score >= 0.5) return { source: Icon.Warning, tintColor: Color.Yellow };
    return { source: Icon.XMarkCircle, tintColor: Color.Red };
  };

  const formatScore = (score: number) => `${Math.round(score * 100)}%`;

  const markdownContent = `
# Lighthouse Analysis Report

## Overall Scores

| Category       | Score | Status                           |
| -------------- | ----- | -------------------------------- |
| Performance    | ${formatScore(report.categories.performance.score)} | ${formatScore(report.categories.performance.score)} |
| Accessibility  | ${formatScore(report.categories.accessibility.score)} | ${formatScore(report.categories.accessibility.score)} |
| Best Practices | ${formatScore(report.categories['best-practices'].score)} | ${formatScore(report.categories['best-practices'].score)} |
| SEO            | ${formatScore(report.categories.seo.score)} | ${formatScore(report.categories.seo.score)} |

## Key Performance Metrics

### Core Web Vitals

- **First Contentful Paint**: ${report.audits['first-contentful-paint']?.displayValue || 'N/A'}
- **Largest Contentful Paint**: ${report.audits['largest-contentful-paint']?.displayValue || 'N/A'}
- **Total Blocking Time**: ${report.audits['total-blocking-time']?.displayValue || 'N/A'}
- **Cumulative Layout Shift**: ${report.audits['cumulative-layout-shift']?.displayValue || 'N/A'}

### Additional Insights

- **Time to Interactive**: ${report.audits.interactive?.displayValue || 'N/A'}
- **Speed Index**: ${report.audits['speed-index']?.displayValue || 'N/A'}
`;

  return (
    <Detail
      markdown={markdownContent}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label 
            title="Performance Score" 
            text={formatScore(report.categories.performance.score)}
            icon={renderScoreIcon(report.categories.performance.score)}
          />
          <Detail.Metadata.Label 
            title="Accessibility Score" 
            text={formatScore(report.categories.accessibility.score)}
            icon={renderScoreIcon(report.categories.accessibility.score)}
          />
          <Detail.Metadata.Label 
            title="Best Practices Score" 
            text={formatScore(report.categories['best-practices'].score)}
            icon={renderScoreIcon(report.categories['best-practices'].score)}
          />
          <Detail.Metadata.Label 
            title="SEO Score" 
            text={formatScore(report.categories.seo.score)}
            icon={renderScoreIcon(report.categories.seo.score)}
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.Open
            title="Open JSON Report"
            target={reportPath}
            icon={Icon.Document}
          />
          <Action.ShowInFinder path={reportPath} />
          <Action.OpenWith path={reportPath} />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const preferences: Preferences = getPreferenceValues<Preferences>();
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string>(preferences.outputPath || os.tmpdir());

  // If a report path exists, show the report view
  if (reportPath) {
    return <LighthouseReportView reportPath={reportPath} />;
  }

  async function handleChooseDirectory() {
    try {
      const { stdout } = await execPromise(`
        osascript -e 'POSIX path of (choose folder with prompt "Select Output Directory")'
      `);
      const selectedPath = stdout.trim();
      if (selectedPath) {
        setOutputPath(selectedPath);
        await showToast({
          style: Toast.Style.Success,
          title: "Directory Selected",
          message: `Output path set to: ${selectedPath}`,
        });
      }
    } catch (error) {
      // User canceled the directory selection or an error occurred
      await showToast({
        style: Toast.Style.Failure,
        title: "Directory Selection Failed",
        message: "Could not set the output path.",
      });
    }
  }

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

      // Prepare output path from form or preferences or fallback to temp directory
      const finalOutputDirectory = values.outputPath || preferences.outputPath || os.tmpdir();

      // Create the output directory if it doesn't exist
      try {
        await fs.mkdir(finalOutputDirectory, { recursive: true });
        const stats = await fs.stat(finalOutputDirectory);
        if (!stats.isDirectory()) {
          throw new Error("Selected output path is not a directory.");
        }
      } catch {
        throw new Error("Invalid output path. Please provide a valid directory.");
      }

      const outputFilePath = path.join(
        finalOutputDirectory,
        `lighthouse-report-${Date.now()}.json`
      );

      // Construct Lighthouse CLI command
      const command = [
        lighthousePath,
        `"${formattedUrl}"`,
        `--output=json`,
        `--output-path="${outputFilePath}"`,
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
          PATH: `${process.env.PATH || ''}:/usr/bin:/usr/local/bin:/opt/homebrew/bin:/bin`
        }
      });

      console.log("Lighthouse stdout:", stdout);
      console.log("Lighthouse stderr:", stderr);

      // Handle specific non-critical warnings
      if (stderr && !stderr.includes("Invalid dependency graph created, cycle detected")) {
        // Even if there are warnings, proceed unless it's a critical error
        await showToast({
          style: Toast.Style.Failure,
          title: "Lighthouse Warnings",
          message: stderr,
        });
      }

      // Verify report was created
      await fs.access(outputFilePath);

      // Update success toast
      toast.style = Toast.Style.Success;
      toast.title = "Analysis Complete";
      toast.message = `JSON Report saved to: ${outputFilePath}`;

      // Set the report path to trigger report view
      setReportPath(outputFilePath);
    } catch (error) {
      console.error("Lighthouse Analysis Error:", error);

      // Detailed error handling
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = "Failed to run Lighthouse analysis";
      }

      // Update failure toast
      toast.style = Toast.Style.Failure;
      toast.title = "Lighthouse Analysis Failed";
      toast.message = errorMessage;

      // Show installation instructions if Lighthouse is not found
      if (errorMessage.includes("Lighthouse CLI not found")) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Lighthouse CLI Not Found",
          message: "Please install Lighthouse globally using:\n\nnpm install -g lighthouse",
        });
      }
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
          <Action 
            title="Choose Output Directory" 
            onAction={handleChooseDirectory}
            icon={Icon.Folder}
          />
          <Action 
            title="Open Output Path Preferences" 
            onAction={openCommandPreferences} 
            icon={Icon.Gear}
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
      <Form.TextField
        id="outputPath"
        title="Download Report Path"
        placeholder="Enter directory path or use the button above"
        value={outputPath}
        onChange={(newValue) => setOutputPath(newValue)}
      />
      <Form.Description
        title="Choose Output Directory"
        text="Click the 'Choose Output Directory' button in the actions panel above to select a folder where the JSON report will be saved."
      />
    </Form>
  );
}
