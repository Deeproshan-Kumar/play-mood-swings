"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui";

export function InviteShare({ code, url }: { code: string; url: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function copy(value: string, which: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked (insecure origin or denied permission) — the code is
      // on screen to type manually, so there's nothing to recover from.
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 text-center">
        <p className="label">Invite code</p>
        <p className="display text-4xl tracking-[0.28em] text-primary select-all">
          {code}
        </p>
        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={() => copy(code, "code")}
        >
          {copied === "code" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied === "code" ? "Copied" : "Copy code"}
        </Button>
      </div>

      <div className="border-t border-line pt-5">
        <p className="label mb-2">Or send a link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-sunken px-3 py-2.5 text-xs text-ink-soft">
            {url}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copy(url, "link")}
          >
            {copied === "link" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied === "link" ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
