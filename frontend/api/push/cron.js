import {
  getPushConfig,
  isCronRequestAuthorized,
  jsonResponse,
  syncRankingNotifications,
  syncReengagementNotifications,
  syncSeriesNotifications
} from "../../server/pushNotifications.js";

export const config = { maxDuration: 60 };

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    jsonResponse(response, 405, { error: "Método no permitido." });
    return;
  }

  if (!isCronRequestAuthorized(request)) {
    jsonResponse(response, 401, { error: "No autorizado." });
    return;
  }

  try {
    const config = getPushConfig();
    const jobs = await Promise.allSettled([
      syncSeriesNotifications(config),
      syncRankingNotifications(config),
      syncReengagementNotifications(config)
    ]);
    const failures = jobs.filter((job) => job.status === "rejected");

    failures.forEach((failure) => {
      console.error("[push] Falló una tarea programada.", failure.reason);
    });

    jsonResponse(response, failures.length ? 500 : 200, {
      ok: failures.length === 0,
      series: jobs[0].status === "fulfilled" ? jobs[0].value : null,
      ranking: jobs[1].status === "fulfilled" ? jobs[1].value : null,
      reengagement: jobs[2].status === "fulfilled" ? jobs[2].value : null,
      failedJobs: failures.length
    });
  } catch (error) {
    console.error("[push] No se pudo iniciar el cron.", error);
    jsonResponse(response, 500, { error: "No se pudo ejecutar la sincronización." });
  }
}
