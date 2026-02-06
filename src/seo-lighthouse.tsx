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
  useNavigation,
  AI,
  openCommandPreferences,
} from '@raycast/api';
import { useForm, FormValidation, usePromise } from '@raycast/utils';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as nodeOs from 'node:os';
import * as childProcess from 'node:child_process';
import {
  runLighthouseAudit,
  LighthouseReport,
  LighthouseOptions,
  processUrl,
} from './utils/lighthouse';

const CATEGORY_LABELS: Record<string, string> = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best Practices',
  seo: 'SEO',
  pwa: 'PWA',
};

const getCategoryLabel = (key: string) => CATEGORY_LABELS[key] || key;

function DetailedAuditsView({ report }: { report: LighthouseReport }) {
  const generateMarkdown = () => {
    const descMap: Record<string, string> = {
      interactive:
        'Time to Interactive is the time it takes for the page to become fully interactive.',
      'first-contentful-paint': 'First Contentful Paint marks when the first text or image is painted.',
      'largest-contentful-paint': 'Largest Contentful Paint marks when the largest text or image is painted.',
      'speed-index': 'Speed Index shows how quickly the contents of a page are visibly populated.',
      'total-blocking-time': 'Total Blocking Time measures how long the main thread was blocked by long tasks.',
      'cumulative-layout-shift': 'Cumulative Layout Shift measures unexpected layout shift that affects visual stability.',
      'main-thread-tasks': 'Main Thread Work measures time spent in JavaScript and style/layout tasks.',
      'total-byte-weight': 'Total Byte Weight is the combined download size of all page resources.',
    };

    let markdown = `# Detailed Field Guide\n\n`;

    const categories = [
      { id: 'performance', title: 'Performance' },
      { id: 'accessibility', title: 'Accessibility' },
      { id: 'best-practices', title: 'Best Practices' },
      { id: 'seo', title: 'SEO' },
    ];

    categories.forEach(cat => {
      markdown += `## ${cat.title}\n\n`;
      const categoryAudits =
        report.categories?.[cat.id as keyof typeof report.categories]
          ?.auditRefs || [];
      const audits = categoryAudits
        .map(ref => report.audits?.[ref.id])
        .filter((a): a is NonNullable<typeof a> => !!a && (a.score || 1) < 0.9)
        .sort((a, b) => (a.score || 0) - (b.score || 0));

      if (audits.length === 0) {
        markdown += `_No issues found in this category._\n\n`;
      } else {
        markdown += `| Status | Field | Description |\n|:---:|:---|:---|\n`;
        audits.forEach(audit => {
          const score = audit.score ?? 0;
          const statusIcon = score >= 0.9 ? '🟢' : score >= 0.5 ? '🟡' : '🔴';
          const descKey = (audit.id || '').replace(/_/g, '-');
          const cleanDesc =
            descMap[descKey] ||
            audit.description
              ?.replace(/\[Learn more\].*/, '')
              .replace(/<br\s*\/?>/gi, ' ') ||
            '';
          markdown += `| ${statusIcon} | **${audit.title || '-'}** | ${cleanDesc || '-'} |\n`;
        });
        markdown += '\n';
      }
    });

    return markdown;
  };

  return <Detail markdown={generateMarkdown()} />;
}

interface FormValues {
  url: string;
  device: 'mobile' | 'desktop';
  performance: boolean;
  accessibility: boolean;
  bestPractices: boolean;
  seo: boolean;
  outputPath: string;
}

function LighthouseReportView({
  reportPath,
  report,
  originalUrl,
  onReanalyze,
}: {
  reportPath: string;
  report: LighthouseReport;
  originalUrl: string;
  onReanalyze: () => void;
}) {
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const isMac = nodeOs.platform() === 'darwin';

  const formatScore = (score: number | undefined) =>
    score !== undefined ? `${Math.round(score * 100)}` : 'N/A';

  const getHostname = (url: string) => {
    try {
      return new URL(processUrl(url)).hostname;
    } catch {
      return url;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return Color.Green;
    if (score >= 0.5) return Color.Yellow;
    return Color.Red;
  };

  const getStatusIcon = (score: number | null | undefined) => {
    if (score === null || score === undefined) return '⚪️';
    if (score >= 0.9) return '🟢';
    if (score >= 0.5) return '🟡';
    return '🔴';
  };

  const formatRating = (score?: number | null) => {
    if (score === null || score === undefined) return 'unknown';
    if (score >= 0.9) return 'good';
    if (score >= 0.5) return 'medium';
    return 'poor';
  };

  const generateMarkdownContent = () => {
    let markdown = `# Lighthouse Analysis Report\n\n`;

    // AI Analysis Section
    if (aiAnalysis) {
      markdown += `> [!TIP]\n> **AI Insights**\n>\n${aiAnalysis
        .split('\n')
        .map(l => `> ${l}`)
        .join('\n')}\n\n---\n\n`;
    } else if (isAiLoading) {
      markdown += `> [!NOTE]\n> **AI is analyzing findings...**\n\n---\n\n`;
    }

    markdown += `## Performance & Core Metrics (Critical)\n\n`;
    markdown += `| Status | Metric | Value | Benchmark |\n| :---: | :--- | :--- | :--- |\n`;
    const perfMetrics = [
      {
        id: 'largest-contentful-paint',
        title: 'LCP (Largest Contentful Paint)',
        bench: '< 2.5s',
      },
      { id: 'speed-index', title: 'Speed Index', bench: '< 3.4s' },
      {
        id: 'first-contentful-paint',
        title: 'FCP (First Contentful Paint)',
        bench: '< 1.8s',
      },
      {
        id: 'server-response-time',
        title: 'TTFB (Time to First Byte)',
        bench: '< 0.8s',
      },
      {
        id: 'cumulative-layout-shift',
        title: 'CLS (Cumulative Layout Shift)',
        bench: '< 0.1',
      },
      { id: 'main-thread-tasks', title: 'Main Thread Work', bench: '< 2s' },
      { id: 'total-byte-weight', title: 'Total Byte Weight', bench: '< 1.6MB' },
    ];
    perfMetrics.forEach(m => {
      const audit = report.audits?.[m.id];
      if (audit) {
        markdown += `| ${getStatusIcon(audit.score)} | ${m.title} | **${audit.displayValue || '-'}** | \`${m.bench}\` |\n`;
      }
    });

    markdown += `\n## SEO & Accessibility (Marketing)\n\n`;
    markdown += `| Status | Field | Value |\n|:---:|:---|:---|\n`;
    const seoScore = report.categories?.seo?.score;
    const accScore = report.categories?.accessibility?.score;
    if (seoScore !== undefined || accScore !== undefined) {
      if (seoScore !== undefined)
        markdown += `| ${getStatusIcon(seoScore)} | SEO (score) | ${formatScore(seoScore)}% |\n`;
      if (accScore !== undefined)
        markdown += `| ${getStatusIcon(accScore)} | Accessibility (score) | ${formatScore(accScore)}% |\n`;
    }
    const seoFields = [
      { id: 'document-title', label: 'Title tag' },
      { id: 'meta-description', label: 'Meta description' },
      { id: 'canonical', label: 'Canonical URL' },
      { id: 'html-has-lang', label: 'HTML lang attribute' },
      { id: 'structured-data', label: 'Structured Data' },
    ];
    seoFields.forEach(f => {
      const audit = report.audits?.[f.id];
      if (audit) {
        const extra =
          f.id === 'structured-data' && audit.details?.items
            ? ` (${(audit.details.items as any[]).map((i: any) => i?.type || i?.name).filter(Boolean).join(', ') || 'no types'})`
            : '';
        markdown += `| ${getStatusIcon(audit.score)} | ${f.label} | ${audit.displayValue || audit.title || '-'}${extra} |\n`;
      }
    });

    const opportunities = Object.values(report.audits || {})
      .filter(a => a.details && (a.details as any).type === 'opportunity')
      .slice(0, 5);
    if (opportunities.length > 0) {
      markdown += `\n## Priority Opportunities (High ROI)\n`;
      markdown += `| Status | Audit | Estimated Savings | Items |\n|:---:|:---|:---|:---|\n`;
      opportunities.forEach(op => {
        const savingsMs = (op.details as any).overallSavingsMs;
        const savingsBytes = (op.details as any).overallSavingsBytes;
        const savings =
          savingsMs || savingsBytes
            ? `${savingsMs ? `${Math.round(savingsMs)} ms` : ''}${savingsMs && savingsBytes ? ' · ' : ''}${savingsBytes ? `${Math.round(savingsBytes / 1024)} KB` : ''}`
            : '-';
        const items = Array.isArray((op.details as any).items)
          ? (op.details as any).items
          : [];
        const firstUrl = items.find((i: any) => i?.url)?.url;
        const itemsInfo = `${items.length} ${firstUrl ? `(${firstUrl})` : ''}`;
        markdown += `| ${getStatusIcon(op.score)} | **${op.title}** | ${savings} | ${itemsInfo} |\n`;
      });
    }

    const diagnostics = [
      { id: 'dom-size', label: 'DOM Size (nodos)' },
      { id: 'unused-javascript', label: 'Unused JavaScript' },
      { id: 'unused-css-rules', label: 'Unused CSS' },
      { id: 'third-party-summary', label: 'Third-party blocking time' },
      { id: 'offscreen-images', label: 'Offscreen images' },
    ];
    const diagAudits = diagnostics
      .map(d => ({ ...d, audit: report.audits?.[d.id] }))
      .filter(d => d.audit);
    if (diagAudits.length) {
      markdown += `\n## Technical Diagnostics\n`;
      diagAudits.forEach(d => {
        const details = (d.audit as any)?.details;
        const blocking =
          d.id === 'third-party-summary' && details?.summary?.blockingTime
            ? ` (${Math.round(details.summary.blockingTime)} ms)`
            : '';
        markdown += `- ${d.label}: ${d.audit?.displayValue || '-'}${blocking}\n`;
      });
    }

    const warnings = (report as any).runWarnings as string[] | undefined;
    if (warnings && warnings.length) {
      markdown += `\n### Execution Warnings\n`;
      warnings.forEach(w => {
        markdown += `- ⚠️ ${w}\n`;
      });
    }

    markdown += `\n---\n\n`;
    markdown += `_Detailed Field Description in the actions menu (Cmd + D)._\n`;

    return markdown;
  };

  const generateMetadata = () => {
    const categoriesToShow = [
      { key: 'performance', name: 'Performance' },
      { id: 'accessibility', name: 'Accessibility' },
      { id: 'best-practices', name: 'Best Practices' },
      { id: 'seo', name: 'SEO' },
    ];

    const reportCreatedText = (() => {
      const ts = (report as any).fetchTime;
      const date = ts ? new Date(ts) : new Date();
      return date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    })();
    const lhVersion = (report as any).lighthouseVersion as string | undefined;
    const auditDuration = (() => {
      const total = (report as any).timing?.total as number | undefined;
      return total ? `${Math.round(total / 1000)}s` : undefined;
    })();

    return (
      <Detail.Metadata>
        <Detail.Metadata.TagList title="Overall Scores">
          {categoriesToShow.map(catInfo => {
            const key = (catInfo as any).key || (catInfo as any).id;
            const cat =
              report.categories?.[key as keyof typeof report.categories];
            if (!cat) return null;
            const score = cat.score || 0;
            return (
              <Detail.Metadata.TagList.Item
                key={key}
                text={`${catInfo.name}: ${formatScore(score)}%`}
                color={getScoreColor(score)}
              />
            );
          })}
        </Detail.Metadata.TagList>
        <Detail.Metadata.Separator />
        <Detail.Metadata.Label
          title="Analysis Domain"
          text={getHostname(originalUrl)}
          icon={Icon.Globe}
        />
        <Detail.Metadata.Label
          title="Device Mode"
          text={report.configSettings?.formFactor === 'mobile' ? 'Mobile' : 'Desktop'}
          icon={report.configSettings?.formFactor === 'mobile' ? Icon.Mobile : Icon.Monitor}
        />
        <Detail.Metadata.Separator />
        <Detail.Metadata.Label title="Report Created" text={reportCreatedText} />
        {lhVersion ? (
          <Detail.Metadata.Label title="Lighthouse" text={`v${lhVersion}`} />
        ) : null}
        {auditDuration ? (
          <Detail.Metadata.Label
            title="Audit Duration"
            text={auditDuration}
            icon={Icon.Clock}
          />
        ) : null}
      </Detail.Metadata>
    );
  };

  const handleAskAI = async () => {
    if (isAiLoading) return;
    setIsAiLoading(true);
    setAiAnalysis('');
    try {
      const scores = {
        performance: report.categories?.performance?.score
          ? Math.round((report.categories.performance.score || 0) * 100)
          : undefined,
        accessibility: report.categories?.accessibility?.score
          ? Math.round((report.categories.accessibility.score || 0) * 100)
          : undefined,
        seo: report.categories?.seo?.score
          ? Math.round((report.categories.seo.score || 0) * 100)
          : undefined,
        best_practices: report.categories?.['best-practices']?.score
          ? Math.round((report.categories['best-practices'].score || 0) * 100)
          : undefined,
        pwa: report.categories?.pwa?.score
          ? Math.round((report.categories.pwa.score || 0) * 100)
          : undefined,
      };

      const pickAudit = (id: string) => report.audits?.[id];
      const vitals = {
        lcp: {
          value: pickAudit('largest-contentful-paint')?.displayValue,
          rating: formatRating(pickAudit('largest-contentful-paint')?.score),
        },
        cls: {
          value: pickAudit('cumulative-layout-shift')?.displayValue,
          rating: formatRating(pickAudit('cumulative-layout-shift')?.score),
        },
        ttfb: {
          value: pickAudit('server-response-time')?.displayValue,
          rating: formatRating(pickAudit('server-response-time')?.score),
        },
        fcp: {
          value: pickAudit('first-contentful-paint')?.displayValue,
          rating: formatRating(pickAudit('first-contentful-paint')?.score),
        },
        speedIndex: {
          value: pickAudit('speed-index')?.displayValue,
          rating: formatRating(pickAudit('speed-index')?.score),
        },
      };

      const opportunities = Object.values(report.audits || {})
        .filter(a => a.details && (a.details as any).type === 'opportunity')
        .slice(0, 5)
        .map(op => {
          const items = Array.isArray((op.details as any).items)
            ? (op.details as any).items
            : [];
          const firstUrl = items.find((i: any) => i?.url)?.url;
          return {
            id: op.id,
            title: op.title,
            impactMs: (op.details as any).overallSavingsMs,
            impactBytes: (op.details as any).overallSavingsBytes,
            priority: formatRating(op.score),
            exampleUrl: firstUrl,
          };
        });

      const failingAudits = Object.values(report.audits || {})
        .filter(a => (a.score || 1) < 0.5 && a.title)
        .slice(0, 5)
        .map(a => ({
          id: a.id,
          title: a.title,
          score: a.score,
        }));

      const warnings = (report as any).runWarnings || [];

      const ctx = {
        url: originalUrl,
        timestamp: (report as any).fetchTime,
        version: (report as any).lighthouseVersion,
        scores,
        vitals,
        issues: failingAudits,
        opportunities,
        seo: {
          title: pickAudit('document-title')?.displayValue,
          description: pickAudit('meta-description')?.displayValue,
          canonical: pickAudit('canonical')?.displayValue,
          lang: pickAudit('html-has-lang')?.displayValue,
          structuredDataTypes: (
            pickAudit('structured-data')?.details?.items || []
          )
            .map((i: any) => i?.type || i?.name)
            .filter(Boolean),
          structuredDataErrors: (
            pickAudit('structured-data')?.details?.items || []
          )
            .map((i: any) => i?.errors)
            .flat()
            .filter(Boolean),
        },
        warnings,
      };

      const prompt = `Act as an expert SEO/Performance engineer. Here is the Lighthouse context (JSON):
${JSON.stringify(ctx, null, 2)}

Give a brief executive summary in English. Highlight the biggest bottleneck and 3 concrete fixes (short bullets). Focus on performance, accessibility, and SEO impact.`;

      const answer = await AI.ask(prompt);
      if (answer) {
        setAiAnalysis(answer);
      } else {
        throw new Error('AI returned an empty response');
      }
    } catch (error) {
      showToast({
        style: Toast.Style.Failure,
        title: 'AI Insights Unavailable',
        message: 'Could not reach AI services. Please try again.',
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const getEmailBody = () => {
    const scores = Object.entries(report.categories || {})
      .map(
        ([k, v]) => `${k.toUpperCase()}: ${Math.round((v.score || 0) * 100)}%`
      )
      .join('\n');

    const scoreLines = Object.entries(report.categories || {})
      .map(
        ([key, value]) =>
          `• ${getCategoryLabel(key)} — ${Math.round((value.score || 0) * 100)}%`
      )
      .join('\n');

    const aiBlock = aiAnalysis ? aiAnalysis : 'No AI insights yet.';

    const fullBody = `Hi team,

I just ran a Lighthouse audit and here are the highlights: ${originalUrl}

Scores:
${scoreLines || scores}

AI Findings:
${aiBlock}

Technical details:
Report path: ${reportPath}

Sent via SEO Lighthouse Raycast extension.
Thanks,`;

    if (fullBody.length > 1800) {
      return fullBody.substring(0, 1797) + '...';
    }
    return fullBody;
  };

  const openMailDraft = async (subject: string, body: string) => {
    const script = `
      tell application "Mail"
        set newMessage to make new outgoing message with properties {visible:true, subject:${JSON.stringify(
          subject
        )}, content:${JSON.stringify(body)} & "\\n\\n"}
        tell newMessage
          make new to recipient at end of to recipients with properties {address:""}
          activate
        end tell
      end tell`;

    return new Promise<void>((resolve, reject) => {
      childProcess.execFile('osascript', ['-e', script], error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  };

  const handleComposeMail = async () => {
    try {
      await openMailDraft(
        `Lighthouse Analysis Report: ${getHostname(originalUrl)}`,
        getEmailBody()
      );
      showToast({
        style: Toast.Style.Success,
        title: 'Send to Developer',
        message: 'Draft created in Mail',
      });
    } catch (error: any) {
      showToast({
        style: Toast.Style.Failure,
        title: 'Could not create draft',
        message: 'Check that Mail app is installed',
      });
    }
  };

  return (
    <Detail
      markdown={generateMarkdownContent()}
      metadata={generateMetadata()}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="AI & Feedback">
            <Action
              title="Ask AI for Insights"
              icon={Icon.Stars}
              onAction={handleAskAI}
              shortcut={{ modifiers: ['cmd'], key: 'i' }}
            />
            <Action.Push
              title="Detailed Field Description"
              icon={Icon.List}
              target={<DetailedAuditsView report={report} />}
              shortcut={{ modifiers: ['cmd'], key: 'd' }}
            />
            {isMac ? (
              <Action
                title="Send by Mail"
                icon={Icon.Envelope}
                onAction={handleComposeMail}
                shortcut={{ modifiers: ['cmd', 'shift'], key: 'e' }}
              />
            ) : (
              <Action
                title="Send Email (macOS)"
                icon={Icon.Envelope}
                onAction={() =>
                  showToast({
                    style: Toast.Style.Failure,
                    title: 'Not available on Windows',
                    message: 'Mail draft only works on macOS',
                  })
                }
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section title="Report Management">
            <Action
              title="Re-analyze"
              icon={Icon.ArrowClockwise}
              onAction={onReanalyze}
            />
            <Action.Open
              title="Open JSON Report"
              target={reportPath}
              icon={Icon.Code}
            />
            <Action.ShowInFinder
              path={reportPath}
              icon={Icon.Finder}
              title="Show in Finder"
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function ReportLoader({ options }: { options: LighthouseOptions }) {
  const [reanalyzeCount, setReanalyzeCount] = useState(0);
  const currentOptions = useMemo(
    () => ({ ...options, force: reanalyzeCount > 0 }),
    [options, reanalyzeCount]
  );
  const [progressPct, setProgressPct] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressTexts = [
    { upTo: 20, text: 'Preparing environment and resolving DNS...' },
    { upTo: 45, text: 'Measuring performance and critical times...' },
    { upTo: 70, text: 'Auditing accessibility and best practices...' },
    { upTo: 90, text: 'Evaluating SEO and metadata...' },
    { upTo: 99, text: 'Evaluating SEO and metadata...' },
    { upTo: 100, text: 'Ready: presenting results' },
  ];

  const { isLoading, data, error, revalidate } = usePromise(
    runLighthouseAudit,
    [currentOptions],
    {
      onError: () => {},
    }
  );

  useEffect(() => {
    if (!isLoading && data) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setProgressPct(100);
      return;
    }
    if (!isLoading && !data) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    setProgressPct(prev => (prev === 0 ? 0 : prev));
    intervalRef.current = setInterval(() => {
      setProgressPct(prev => {
        const next =
          prev < 20
            ? prev + 2
            : prev < 50
              ? prev + 3
              : prev < 70
                ? prev + 5
                : prev < 90
                  ? prev + 7
                  : prev + 5;
        return Math.min(next, 98);
      });
    }, 750);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isLoading, data]);

  const handleReanalyze = () => {
    setReanalyzeCount(c => c + 1);
    revalidate();
  };

  if (error) {
    const isInstallError = error.message.includes('npm install -g lighthouse');

    return (
      <Detail
        markdown={
          isInstallError
            ? `# Lighthouse Missing\n\nGoogle Lighthouse CLI is required.\n\n\`\`\`bash\nnpm install -g lighthouse\n\`\`\``
            : `# Audit Error\n\n${error.message}`
        }
        actions={
          <ActionPanel>
            {isInstallError ? (
              <Action.CopyToClipboard
                title="Copy Install Command"
                content="npm install -g lighthouse"
              />
            ) : null}
            <Action
              title="Try Again"
              icon={Icon.ArrowClockwise}
              onAction={revalidate}
            />
          </ActionPanel>
        }
      />
    );
  }

  if (isLoading || !data) {
    const hostname = (() => {
      try {
        return new URL(processUrl(options.url)).hostname;
      } catch {
        return options.url;
      }
    })();
    const phase =
      progressTexts.find(p => progressPct <= p.upTo) ||
      progressTexts[progressTexts.length - 1];
    const bar = (() => {
      const pct = data ? 100 : Math.min(progressPct, 98);
      const barLength = 50;
      const filled = Math.round((pct / 100) * barLength);
      return `[${'█'.repeat(filled).padEnd(barLength, '░')}] ${pct}%`;
    })();
    return (
      <Detail
        isLoading={true}
        markdown={`# Generating your professional SEO report... the party parrot is checking your tags!\n\nAnalyzing\n\n**Domain:** ${hostname}\n\n![Party Parrot](https://cultofthepartyparrot.com/parrots/hd/parrot.gif)\n\n${bar}\n\n_${phase.text}_`}
      />
    );
  }

  return (
    <LighthouseReportView
      reportPath={data.reportPath}
      report={data.report}
      originalUrl={options.url}
      onReanalyze={handleReanalyze}
    />
  );
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const { push } = useNavigation();

  const { handleSubmit, itemProps } = useForm<FormValues>({
    initialValues: {
      device: 'mobile',
      performance: true,
      accessibility: true,
      bestPractices: true,
      seo: true,
      outputPath: preferences.outputPath || nodeOs.tmpdir(),
    },
    validation: {
      url: FormValidation.Required,
      outputPath: value => {
        if (!value) return 'Output path is required';
        return undefined;
      },
    },
    onSubmit: values => {
      const categories: string[] = [];
      if (values.performance) categories.push('performance');
      if (values.accessibility) categories.push('accessibility');
      if (values.bestPractices) categories.push('best-practices');
      if (values.seo) categories.push('seo');

      push(
        <ReportLoader
          options={{
            url: values.url,
            device: values.device,
            categories,
            outputPath: values.outputPath,
            lighthousePath: preferences.lighthousePath,
          }}
        />
      );
    },
  });

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Run Lighthouse Audit"
            icon={Icon.Check}
            onSubmit={handleSubmit}
          />
          <Action
            title="Open Preferences"
            icon={Icon.Gear}
            onAction={openCommandPreferences}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Basic Configuration" />
      <Form.TextField
        title="Website URL"
        placeholder="https://example.com"
        {...itemProps.url}
      />
      <Form.Dropdown
        title="Device Mode"
        {...(itemProps.device as any)}
      >
        <Form.Dropdown.Item
          value="mobile"
          title="Mobile"
          icon={Icon.Mobile}
        />
        <Form.Dropdown.Item
          value="desktop"
          title="Desktop"
          icon={Icon.Monitor}
        />
      </Form.Dropdown>

      <Form.Separator />
      <Form.Description text="Analysis Categories" />
      <Form.Checkbox label="Performance Analysis" {...itemProps.performance} />
      <Form.Checkbox label="Accessibility Analysis" {...itemProps.accessibility} />
      <Form.Checkbox label="Best Practices Analysis" {...itemProps.bestPractices} />
      <Form.Checkbox label="SEO Analysis" {...itemProps.seo} />

      <Form.Separator />
      <Form.Description text="Advanced Settings" />
      <Form.TextField
        title="Output Folder"
        {...itemProps.outputPath}
      />
      <Form.Description text="Click the 'Choose Output Directory' button in the actions panel to select where the JSON report will be saved." />
    </Form>
  );
}
