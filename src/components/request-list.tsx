"use client";

import { useEffect, useState } from "react";
import { getRequests, isApiError, patchRequest } from "@/lib/api-client";
import { REQUEST_STATUS_LABELS, STUDY_STYLE_LABELS, formatPersonMeta } from "@/lib/labels";
import type { RequestDirection, StudyRequest } from "@/types/api";
import { useDemo } from "@/components/demo-provider";
import {
  Button,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  cardClass,
} from "@/components/ui";

const DIRECTIONS: { value: RequestDirection; label: string }[] = [
  { value: "all", label: "All" },
  { value: "incoming", label: "Incoming" },
  { value: "outgoing", label: "Outgoing" },
];

export function RequestList({ embedded = false }: { embedded?: boolean }) {
  const demo = useDemo();
  const [direction, setDirection] = useState<RequestDirection>("all");
  const [requests, setRequests] = useState<StudyRequest[] | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("Could not load requests.");
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!demo.ready || !demo.userId) return;
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const result = await getRequests(direction);
      if (cancelled) return;
      if (isApiError(result)) {
        setMessage(result.error.message);
        setRequests(null);
        setPhase("error");
        return;
      }
      setRequests(result.data);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [demo.ready, demo.userId, demo.revision, direction, reloadKey]);

  async function update(id: string, status: "accepted" | "declined" | "cancelled") {
    setPendingId(id);
    setActionError(null);
    const result = await patchRequest(id, { status });
    setPendingId(null);
    if (isApiError(result)) setActionError({ id, message: result.error.message });
  }

  return (
    <div id="study-requests" className="grid w-full gap-5">
      {embedded ? (
        <div>
          <h2 className="font-display text-xl font-bold">Requests</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Incoming and outgoing study requests. Accept, decline, or cancel from here.
          </p>
        </div>
      ) : (
      <PageHeader
        title="Requests"
        description="Accept, decline, or cancel from here. A missing course or building means that student is checked out."
      />
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Request direction">
        {DIRECTIONS.map((option) => (
          <Button
            key={option.value}
            variant={direction === option.value ? "primary" : "secondary"}
            onClick={() => setDirection(option.value)}
            aria-pressed={direction === option.value}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {phase === "loading" ? <LoadingBlock label="Loading requests" /> : null}
      {phase === "error" ? (
        <ErrorBlock
          title="Requests are unavailable"
          message={message}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}
      {phase === "ready" && requests && requests.length === 0 ? (
        <EmptyBlock
          title="No requests"
          body="Study requests you send or receive will show the other student's public summary."
        />
      ) : null}
      {phase === "ready" && requests && requests.length > 0 ? (
        <ul className={embedded ? "grid gap-4" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"}>
          {requests.map((request) => {
            const incoming = demo.userId === request.recipientId;
            const busy = pendingId === request.id;
            const checkedOut = request.course === null || request.location === null;
            return (
              <li key={request.id} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {incoming ? "Incoming" : "Outgoing"}
                    </p>
                    <h2 className="mt-1 font-display text-xl font-bold">{request.counterpart.displayName}</h2>
                  </div>
                  <p className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                    {REQUEST_STATUS_LABELS[request.status]}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {formatPersonMeta(request.counterpart.major, request.counterpart.academicYear)}
                </p>
                <p className="text-sm">
                  Profile study style: {STUDY_STYLE_LABELS[request.counterpart.studyStyle]}
                </p>
                {checkedOut ? (
                  <p className="mt-3 text-sm font-medium">Checked out</p>
                ) : (
                  <div className="mt-3 text-sm leading-6">
                    <p>
                      {request.course?.code} · {request.course?.title}
                    </p>
                    <p>{request.location?.name}</p>
                  </div>
                )}
                {request.status === "accepted" ? (
                  <p className="mt-3 text-sm font-semibold text-accent">You are connected.</p>
                ) : null}
                {request.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {incoming ? (
                      <>
                        <Button disabled={busy} onClick={() => void update(request.id, "accepted")}>
                          {busy ? "Saving…" : "Accept"}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void update(request.id, "declined")}
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() => void update(request.id, "cancelled")}
                      >
                        {busy ? "Saving…" : "Cancel"}
                      </Button>
                    )}
                  </div>
                ) : null}
                {actionError?.id === request.id ? (
                  <p role="alert" className="mt-3 text-sm text-danger">
                    {actionError.message}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
