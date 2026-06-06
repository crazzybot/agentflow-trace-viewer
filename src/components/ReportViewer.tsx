import React from "react";
import { marked } from "marked";
import { Loader2, AlertCircle } from "lucide-react";

marked.use({ gfm: true, breaks: false });

export interface ReportViewerProps {
  markdown: string | null;
  isLoading?: boolean;
  error?: string | null;
}

export function ReportViewer({ markdown, isLoading = false, error = null }: ReportViewerProps) {
  const html = React.useMemo(() => {
    if (!markdown) return "";
    return marked.parse(markdown) as string;
  }, [markdown]);

  if (isLoading) {
    return (
      <div className="report-loading">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" aria-hidden="true" />
        <span>Loading report…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-error">
        <AlertCircle className="w-5 h-5 shrink-0 text-red-400" aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  if (!html) return null;

  return (
    <div className="report-scroll">
      <article
        className="report-prose"
        // The report comes from the trusted local agentflow service.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
