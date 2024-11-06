import { ActionPanel, Form, Action, showToast, Toast } from "@raycast/api";
import { exec } from "child_process";
import lighthouse from "lighthouse";
import path from "path";
import os from "os";
import util from "util";

const execPromise = util.promisify(exec);

interface FormValues {
  url: string;
  output: "json" | "html";
  device: "mobile" | "desktop";
  performance: boolean;
  accessibility: boolean;
  bestPractices: boolean;
  seo: boolean;
}

async function getLighthousePath() {
  try {
    const { stdout } = await execPromise("which lighthouse");
    return stdout.trim();
  } catch {
    return null;
  }
}

async function isLighthouseInstalled() {
  const path = await getLighthousePath();
  return path !== null;
}

export default function Command() {
  async function handleSubmit(values: FormValues) {
    const lighthousePath = await getLighthousePath();
    if (!lighthousePath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Lighthouse CLI not found",
        message: "Please install it globally using `npm install -g lighthouse`.",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Running Lighthouse...",
    });

    try {
      if (!values.url) {
        throw new Error("URL is required");
      }

      const categories = [];
      if (values.performance) categories.push("performance");
      if (values.accessibility) categories.push("accessibility");
      if (values.bestPractices) categories.push("best-practices");
      if (values.seo) categories.push("seo");

      const outputExtension = values.output || "html";
      const outputPath = path.join(
        os.tmpdir(),
        `lighthouse-report-${Date.now()}.${outputExtension}`
      );

      const command = `${lighthousePath} ${values.url} --output=${outputExtension} --output-path=${outputPath} --only-categories=${categories.join(
        ","
      )} --form-factor=${values.device} --quiet`;

      const { stdout, stderr } = await execPromise(command);

      console.log("Lighthouse stdout:", stdout);
      console.log("Lighthouse stderr:", stderr);

      toast.style = Toast.Style.Success;
      toast.title = "Analysis Complete!";
      toast.message = `Report saved to: ${outputPath}`;
    } catch (error) {
      console.error("Lighthouse error:", error);
      toast.style = Toast.Style.Failure;
      toast.title = "Error";
      toast.message =
        error instanceof Error ? error.message : "Unknown error occurred";
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
        placeholder="https://example.com"
        autoFocus
      />

      <Form.Dropdown id="output" title="Output Format" defaultValue="html">
        <Form.Dropdown.Item value="html" title="HTML Report" />
        <Form.Dropdown.Item value="json" title="JSON Report" />
      </Form.Dropdown>

      <Form.Dropdown id="device" title="Device" defaultValue="mobile">
        <Form.Dropdown.Item value="mobile" title="Mobile" />
        <Form.Dropdown.Item value="desktop" title="Desktop" />
      </Form.Dropdown>

      <Form.Checkbox id="performance" label="Performance" defaultValue={true} />
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
      <Form.Checkbox id="seo" label="SEO" defaultValue={true} />
    </Form>
  );
}
