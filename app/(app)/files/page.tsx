import { getFilesAndStatus } from "@/lib/data"
import { fileLabel, formatDateTime } from "@/lib/format"

export default async function FilesPage() {
  const data = await getFilesAndStatus()

  return (
    <div className="space-y-6 p-2 md:p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slateWarm">Files and status</p>
        <h2 className="mt-2 text-3xl font-semibold text-ink">Worker outputs and recent events</h2>
      </div>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="panel p-5">
          <p className="section-label">Recent output files</p>
          <div className="mt-4 space-y-3">
            {data.files.map((file) => (
              <article key={file.path} className="panel-muted flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-ink">{fileLabel(file)}</p>
                  <p className="mt-1 text-xs text-slateWarm">{file.path}</p>
                </div>
                <a
                  href={`/api/files/signed?path=${encodeURIComponent(file.path)}`}
                  className="ghost-button px-3 py-2 text-sm"
                >
                  Download
                </a>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <p className="section-label">Cloud jobs</p>
            <div className="mt-4 space-y-3">
              {data.workerJobs.map((job) => (
                <article key={job.id} className="panel-muted p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{job.name}</p>
                      <p className="mt-1 text-sm text-slateWarm">{job.schedule}</p>
                    </div>
                    <p className="text-sm text-slateWarm">{job.last_status || "—"}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="panel p-5">
            <p className="section-label">Recent worker events</p>
            <div className="mt-4 space-y-3">
              {data.workerEvents.map((event) => (
                <article key={event.id} className="panel-muted p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-ink">{event.event}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-slateWarm">{event.status}</p>
                  </div>
                  <p className="mt-2 text-sm text-slateWarm">{formatDateTime(event.created_at)}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
