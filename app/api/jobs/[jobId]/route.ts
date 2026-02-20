import { getRequestId, jsonError, jsonOk } from "../../../../lib/api/http";
import { getStorageRepository } from "../../../../lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ jobId: string }>;
  }
) {
  const requestId = getRequestId(new Headers(request.headers));
  const { jobId } = await context.params;
  const storage = getStorageRepository();
  const job = await storage.getJob(jobId);
  if (!job) {
    return jsonError("Resource not found", 404, requestId);
  }

  const artifacts = await storage.listArtifactsBySession(job.session_id);
  const relatedArtifacts = artifacts.filter((artifact) => artifact.job_id === jobId);
  return jsonOk({
    job,
    artifacts: relatedArtifacts,
    logs: job.logs,
    error: job.error,
    request_id: requestId
  });
}
