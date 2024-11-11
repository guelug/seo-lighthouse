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
import * as childProcess from "node:child_process";
import * as nodePath from "node:path";
import * as nodeOs from "node:os";
import * as nodeFs from "node:fs/promises";
import { promisify } from "node:util";

const execPromise = promisify(childProcess.exec);

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
  outputPath?: string;
}

interface LighthouseReport {
  categories?: {
    performance?: { score: number, title?: string },
    accessibility?: { score: number, title?: string },
    'best-practices'?: { score: number, title?: string },
    seo?: { score: number, title?: string }
  };
  audits?: {
    [key: string]: {
      title?: string;
      description?: string;
      displayValue?: string;
      score?: number | null;
    }
  };
}

// Lighthouse Path Finding Function
async function findLighthousePath(): Promise<string | null> {
  const potentialPaths = [
    '/usr/local/bin/lighthouse',
    '/usr/bin/lighthouse',
    '/opt/homebrew/bin/lighthouse',
    `${nodeOs.homedir()}/.npm-global/bin/lighthouse`,
    nodePath.join(nodeOs.homedir(), '.npm', 'bin', 'lighthouse'),
    nodePath.join(nodeOs.homedir(), 'node_modules', '.bin', 'lighthouse')
  ];

  for (const potentialPath of potentialPaths) {
    try {
      await nodeFs.access(potentialPath, nodeFs.constants.X_OK);
      return potentialPath;
    } catch {}
  }

  try {
    const { stdout } = await execPromise('which lighthouse');
    return stdout.trim();
  } catch {
    return null;
  }
}

// Lighthouse Report View Component
function LighthouseReportView({ reportPath }: { reportPath: string }) {
  const [report, setReport] = useState<LighthouseReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReport() {
      try {
        const reportContent = await nodeFs.readFile(reportPath, 'utf-8');
        const parsedReport = JSON.parse(reportContent);
        setReport(parsedReport);
      } catch (error) {
        console.error("Failed to load report", error);
        setError(error instanceof Error ? error.message : "Unknown error loading report");
      }
    }
    loadReport();
  }, [reportPath]);

  if (error) {
    return <Detail markdown={`Error loading report: ${error}`} />;
  }

  if (!report) {
    return <Detail markdown="Loading report..." />;
  }

  const renderScoreIcon = (score: number) => {
    if (score >= 0.9) return { source: Icon.CheckCircle, tintColor: Color.Green };
    if (score >= 0.5) return { source: Icon.Warning, tintColor: Color.Yellow };
    return { source: Icon.XMarkCircle, tintColor: Color.Red };
  };

  const formatScore = (score: number | undefined) => 
    score !== undefined ? `${Math.round(score * 100)}%` : 'N/A';

  // Dynamic markdown content generation
  const generateMarkdownContent = () => {
    let markdownContent = "# Lighthouse Analysis Report\n\n## Overall Scores\n\n";
    markdownContent += "| Category | Score | Status |\n";
    markdownContent += "| -------- | ----- | ------ |\n";

    const categories = [
      { key: 'performance', name: 'Performance' },
      { key: 'accessibility', name: 'Accessibility' },
      { key: 'best-practices', name: 'Best Practices' },
      { key: 'seo', name: 'SEO' }
    ];

    categories.forEach(({ key, name }) => {
      const category = report.categories?.[key as 'performance' | 'accessibility' | 'best-practices' | 'seo'];
      if (category) {
        markdownContent += `| ${name} | ${formatScore(category.score)} | ${formatScore(category.score)} |\n`;
      }
    });

    // Performance Metrics
    markdownContent += "\n## Key Performance Metrics\n\n### Core Web Vitals\n\n";
    
    const performanceMetrics = [
      'first-contentful-paint',
      'largest-contentful-paint',
      'total-blocking-time',
      'cumulative-layout-shift',
      'interactive',
      'speed-index'
    ];

    performanceMetrics.forEach(metric => {
      const audit = report.audits?.[metric];
      if (audit) {
        markdownContent += `- **${audit.title || metric}**: ${audit.displayValue || 'N/A'}\n`;
      }
    });

    return markdownContent;
  };

  // Dynamic metadata generation
  const generateMetadataLabels = () => {
    const categories = [
      { key: 'performance', name: 'Performance' },
      { key: 'accessibility', name: 'Accessibility' },
      { key: 'best-practices', name: 'Best Practices' },
      { key: 'seo', name: 'SEO' }
    ];

    return categories
      .filter(({ key }) => report.categories?.[key as 'performance' | 'accessibility' | 'best-practices' | 'seo'])
      .map(({ key, name }) => {
        const category = report.categories?.[key as 'performance' | 'accessibility' | 'best-practices' | 'seo'];
        return category ? (
          <Detail.Metadata.Label 
            key={key}
            title={`${name} Score`}
            text={formatScore(category.score)}
            icon={renderScoreIcon(category.score)}
          />
        ) : null;
      })
      .filter(Boolean);
  };

  return (
    <Detail
      markdown={generateMarkdownContent()}
      metadata={
        <Detail.Metadata>
          {generateMetadataLabels()}
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
  const [outputPath, setOutputPath] = useState<string>(preferences.outputPath || nodeOs.tmpdir());

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

      // Fallback to all categories if none selected
      const finalCategories = categories.length > 0 
        ? categories 
        : ["performance", "accessibility", "best-practices", "seo"];

      // Prepare output path from form or preferences or fallback to temp directory
      const finalOutputDirectory = values.outputPath || preferences.outputPath || nodeOs.tmpdir();

      // Create the output directory if it doesn't exist
      try {
        await nodeFs.mkdir(finalOutputDirectory, { recursive: true });
        const stats = await nodeFs.stat(finalOutputDirectory);
        if (!stats.isDirectory()) {
          throw new Error("Selected output path is not a directory.");
        }
      } catch {
        throw new Error("Invalid output path. Please provide a valid directory.");
      }

      const outputFilePath = nodePath.join(
        finalOutputDirectory,
        `lighthouse-report-${Date.now()}.json`
      );

      // Construct Lighthouse CLI command
      const command = [
        lighthousePath,
        `"${formattedUrl}"`,
        `--output=json`,
        `--output-path="${outputFilePath}"`,
        `--only-categories=${finalCategories.join(",")}`,
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
        },
        maxBuffer: 1024 * 1024 * 10 // Increase buffer size
      });

      console.log("Lighthouse stdout:", stdout);
      console.log("Lighthouse stderr:", stderr);

      // Verify report was created
      await nodeFs.access(outputFilePath);

      // Update success toast
      toast.style = Toast.Style.Success;
      toast.title = "Analysis Complete";
      toast.message = `JSON Report saved to: ${outputFilePath}`;

      // Set the report path to trigger report view
      setReportPath(outputFilePath);
    } catch (error) {
      console.error("Lighthouse Analysis Error:", error);

      // Detailed error handling
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Failed to run Lighthouse analysis";

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
