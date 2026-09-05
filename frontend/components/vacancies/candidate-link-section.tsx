"use client";

import { Paperclip } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  listVacancyLinks,
  revokeVacancyLink,
  extendVacancyLink,
  type InterviewLinkItem,
  type VacancyDetail,
} from "@/lib/api";
import {
  formatMoscowDateTime,
  hasViewerPermission,
  interviewLinkStatusLabel,
  interviewLinkStatusTone,
} from "@/lib/vacancies";

import {
  CandidateLinkCreateDialog,
  type CandidateLinkCreateDialogHandle,
} from "./candidate-link-create-dialog";

type CandidateLinkSectionProps = {
  vacancy: VacancyDetail;
  token: string;
};

export function buildInvitationMessage(vacancy: VacancyDetail, link: InterviewLinkItem): string {
  const url = `${window.location.origin}/interview/${link.token}`;
  return [
    `${vacancy.title} — интервью для ${link.candidate_first_name} ${link.candidate_last_name}`,
    `Доступно до: ${formatMoscowDateTime(link.expires_at)}`,
    url,
  ].join("\n");
}

export function CandidateLinkSection({ vacancy, token }: CandidateLinkSectionProps) {
  const canView = hasViewerPermission(vacancy, "vacancy.links.view");
  const canManage = hasViewerPermission(vacancy, "vacancy.links.manage");

  const [links, setLinks] = useState<InterviewLinkItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [extendForId, setExtendForId] = useState<string | null>(null);
  const [extendValue, setExtendValue] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<CandidateLinkCreateDialogHandle>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listVacancyLinks(token, vacancy.id);
      setLinks(response.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load links.");
    } finally {
      setLoading(false);
    }
  }, [token, vacancy.id]);

  useEffect(() => {
    if (!canView) {
      return;
    }
    let cancelled = false;
    listVacancyLinks(token, vacancy.id)
      .then((response) => {
        if (!cancelled) {
          setLinks(response.items);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load links.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canView, token, vacancy.id]);

  if (!canView) {
    return null;
  }

  async function handleCopy(link: InterviewLinkItem) {
    setError(null);
    setNotice(null);
    try {
      await navigator.clipboard.writeText(buildInvitationMessage(vacancy, link));
      setNotice(`Invitation for ${link.candidate_first_name} ${link.candidate_last_name} copied.`);
    } catch {
      setError("Could not access the clipboard. Copy the link manually: " + link.token);
    }
  }

  async function handleRevoke(link: InterviewLinkItem) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await revokeVacancyLink(token, vacancy.id, link.id);
      setConfirmRevokeId(null);
      setNotice(`Link for ${link.candidate_first_name} ${link.candidate_last_name} revoked.`);
      await reload();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke link.");
    } finally {
      setBusy(false);
    }
  }

  function openExtend(link: InterviewLinkItem) {
    setExtendForId(link.id);
    setExtendValue("");
    setError(null);
    setNotice(null);
  }

  async function handleExtend(link: InterviewLinkItem) {
    if (!extendValue) {
      setError("Pick a new expiration date first.");
      return;
    }
    if (new Date(extendValue).getTime() <= Date.now()) {
      setError("Expiration must be in the future.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await extendVacancyLink(token, vacancy.id, link.id, {
        expires_at: new Date(extendValue).toISOString(),
      });
      setExtendForId(null);
      setNotice(`Link for ${link.candidate_first_name} ${link.candidate_last_name} extended.`);
      await reload();
    } catch (extendError) {
      setError(extendError instanceof Error ? extendError.message : "Failed to extend link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="recruiter-users-panel">
      <div className="section-heading">
        <div>
          <h2>Candidate links</h2>
          <p>Unique interview links issued for this vacancy.</p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => dialogRef.current?.open()}
          >
            <Paperclip size={14} aria-hidden />
            Create link
          </button>
        ) : null}
      </div>
      <div className="recruiter-side-panel__body">
        {error ? <p className="field-error">{error}</p> : null}
        {notice ? <p className="success-message">{notice}</p> : null}
        {loading && links === null ? (
          <p className="field-hint">Loading links…</p>
        ) : links === null || links.length === 0 ? (
          <p className="field-hint">
            No links yet. Create one to invite a candidate — they will open it without logging in.
          </p>
        ) : (
          <ul className="link-list">
            {links.map((link) => (
              <li key={link.id} className="link-list__row">
                <div className="link-list__info">
                  <strong>
                    {link.candidate_first_name} {link.candidate_last_name}
                  </strong>
                  <span className="link-list__meta">
                    {link.candidate_social}
                    {link.candidate_email ? ` · ${link.candidate_email}` : ""}
                  </span>
                  <span className="link-list__meta">
                    Created {formatMoscowDateTime(link.created_at)} · Available until{" "}
                    {formatMoscowDateTime(link.expires_at)}
                  </span>
                </div>
                <span className="status" data-tone={interviewLinkStatusTone(link.status)}>
                  {interviewLinkStatusLabel(link.status)}
                </span>
                {canManage ? (
                  <div className="link-list__actions">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => void handleCopy(link)}
                    >
                      Copy
                    </button>
                    {link.status === "active" ? (
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => openExtend(link)}
                      >
                        Extend
                      </button>
                    ) : null}
                    {link.status === "active" || link.status === "in_progress" ? (
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => {
                          setConfirmRevokeId(link.id);
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {confirmRevokeId === link.id ? (
                  <div className="link-list__confirm">
                    <span>
                      Revoke access for {link.candidate_first_name} {link.candidate_last_name}?
                    </span>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => void handleRevoke(link)}
                    >
                      Confirm revoke
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={busy}
                      onClick={() => setConfirmRevokeId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                {extendForId === link.id ? (
                  <div className="link-list__confirm">
                    <input
                      type="datetime-local"
                      value={extendValue}
                      onChange={(event) => setExtendValue(event.target.value)}
                      aria-label="New expiration"
                    />
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => void handleExtend(link)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={busy}
                      onClick={() => setExtendForId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {canManage ? (
        <CandidateLinkCreateDialog
          ref={dialogRef}
          token={token}
          vacancyId={vacancy.id}
          onCreated={() => {
            setNotice("Link created.");
            void reload();
          }}
          onError={setError}
        />
      ) : null}
    </section>
  );
}
