import { useEffect, useMemo, useState } from "react";
import { listProfiles, type Profile } from "../lib/auth";
import {
  addAdminAccessMember,
  fetchAdminDashboardSnapshot,
  formatAdminTimestamp,
  persistPublicFeatureFlags,
  removeAdminAccessMember,
  type AdminDashboardSnapshot
} from "../lib/admin";
import type { ProductFeature } from "../lib/access";

type AdminControlPanelProps = {
  operatorName: string;
  operatorEmail?: string | null;
  enabledPublicFeatures: ProductFeature[];
  sessionUserId: string;
  hasDatabaseAdminAccess: boolean;
  onFeatureOverridesChange: () => void;
};

type AdminSectionId = "overview" | "activity" | "flags" | "admins" | "health" | "logs";

const FALLBACK_SNAPSHOT: AdminDashboardSnapshot = {
  metrics: [],
  modules: [],
  logs: [],
  toggles: [],
  activity: [],
  signupActivity: [],
  featureUsage: [],
  retention: [],
  funnel: [],
  alerts: [],
  adminMembers: [],
  flagAudit: [],
  lastUpdatedAt: new Date().toISOString(),
  mode: "preview"
};

const SECTIONS: Array<{
  id: AdminSectionId;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: "overview",
    label: "Resumen",
    eyebrow: "Overview",
    title: "Panorama general",
    description: "Lo mas importante de producto, operacion y crecimiento en una sola vista."
  },
  {
    id: "activity",
    label: "Actividad",
    eyebrow: "Usage",
    title: "Uso y negocio",
    description: "Actividad diaria, altas y adopcion por modulo."
  },
  {
    id: "flags",
    label: "Funciones",
    eyebrow: "Flags",
    title: "Control de features",
    description: "Cambios publicos de nombre, visibilidad y rollout."
  },
  {
    id: "admins",
    label: "Admins",
    eyebrow: "Access",
    title: "Accesos del panel",
    description: "Gestion de usuarios con permiso para entrar y operar `/panel`."
  },
  {
    id: "health",
    label: "Salud",
    eyebrow: "Health",
    title: "Servicios y modulos",
    description: "Estado operativo de las piezas clave del producto."
  },
  {
    id: "logs",
    label: "Logs",
    eyebrow: "Audit",
    title: "Auditoria y eventos",
    description: "Historial de cambios de flags y eventos tecnicos recientes."
  }
];

function AdminNavIcon({ id }: { id: AdminSectionId }) {
  if (id === "overview") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19V9" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M22 19v-4" />
      </svg>
    );
  }

  if (id === "activity") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 14h4l2-4 4 8 2-4h4" />
      </svg>
    );
  }

  if (id === "flags") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14" />
        <path d="M8 6h8l-2.5 4L16 14H8" />
      </svg>
    );
  }

  if (id === "admins") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19a6 6 0 0 1 12 0" />
        <path d="M17 11h4" />
        <path d="M19 9v4" />
      </svg>
    );
  }

  if (id === "health") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7z" />
        <path d="m9.5 12 1.8 1.8 3.6-3.6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  );
}

export function AdminControlPanel({
  operatorName,
  operatorEmail,
  enabledPublicFeatures,
  sessionUserId,
  hasDatabaseAdminAccess,
  onFeatureOverridesChange
}: AdminControlPanelProps) {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot>(FALLBACK_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSavingFlags, setIsSavingFlags] = useState(false);
  const [isSavingAdmins, setIsSavingAdmins] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSectionId>("overview");
  const [draftToggleLabels, setDraftToggleLabels] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState("");
  const [selectedAdminRole, setSelectedAdminRole] = useState<"operator" | "admin">("operator");
  const [adminQuery, setAdminQuery] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [logKindFilter, setLogKindFilter] = useState<"all" | "audit" | "system">("all");
  const [logLevelFilter, setLogLevelFilter] = useState<"all" | "info" | "warning" | "error">("all");
  const [logSourceFilter, setLogSourceFilter] = useState<string>("all");
  const [selectedLogKey, setSelectedLogKey] = useState<string | null>(null);

  async function loadSnapshot() {
    setIsLoading(true);
    setError(null);

    try {
      const [nextSnapshot, nextProfiles] = await Promise.all([
        fetchAdminDashboardSnapshot(),
        listProfiles().catch(() => [])
      ]);

      setSnapshot(nextSnapshot);
      setProfiles(nextProfiles);
      setDraftToggleLabels(Object.fromEntries(nextSnapshot.toggles.map((toggle) => [toggle.id, toggle.label])));
      setSelectedLogKey((current) => {
        if (current) {
          return current;
        }

        const firstAudit = nextSnapshot.flagAudit[0];
        const firstSystemLog = nextSnapshot.logs[0];
        return firstAudit ? `audit-${firstAudit.id}` : firstSystemLog ? `log-${firstSystemLog.id}` : null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pude cargar el panel de control.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const activeSectionMeta = useMemo(
    () => SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0],
    [activeSection]
  );

  const availableProfiles = useMemo(() => {
    const currentAdmins = new Set(snapshot.adminMembers.map((member) => member.userId));
    const query = adminQuery.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (currentAdmins.has(profile.id)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [profile.display_name, profile.username]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [adminQuery, profiles, snapshot.adminMembers]);

  const flattenedLogs = useMemo(() => {
    const auditRows = snapshot.flagAudit.map((entry) => ({
      key: `audit-${entry.id}`,
      kind: "audit" as const,
      level: "info" as const,
      source: "feature-flags",
      title: entry.title,
      detail: entry.detail,
      actorName: entry.actorName ?? null,
      timestamp: entry.timestamp
    }));

    const systemRows = snapshot.logs.map((entry) => ({
      key: `log-${entry.id}`,
      kind: "system" as const,
      level: entry.level,
      source: entry.source,
      title: entry.title,
      detail: entry.detail,
      actorName: entry.actorName ?? null,
      timestamp: entry.timestamp
    }));

    return [...auditRows, ...systemRows]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [snapshot.flagAudit, snapshot.logs]);

  const filteredLogs = useMemo(() => {
    const query = logQuery.trim().toLowerCase();
    return flattenedLogs.filter((entry) =>
      (logKindFilter === "all" || entry.kind === logKindFilter) &&
      (logLevelFilter === "all" || entry.level === logLevelFilter) &&
      (logSourceFilter === "all" || entry.source === logSourceFilter) &&
      (!query ||
        [entry.kind, entry.level, entry.source, entry.title, entry.detail, entry.actorName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query))
    );
  }, [flattenedLogs, logKindFilter, logLevelFilter, logQuery, logSourceFilter]);

  const usageRanking = useMemo(
    () =>
      [...snapshot.featureUsage].sort((a, b) => {
        if (b.totalTimeSeconds !== a.totalTimeSeconds) {
          return b.totalTimeSeconds - a.totalTimeSeconds;
        }

        if (b.averageTimeSeconds !== a.averageTimeSeconds) {
          return b.averageTimeSeconds - a.averageTimeSeconds;
        }

        return b.events - a.events;
      }),
    [snapshot.featureUsage]
  );

  const selectedLog = useMemo(() => {
    if (!filteredLogs.length) {
      return null;
    }

    return filteredLogs.find((entry) => entry.key === selectedLogKey) ?? filteredLogs[0];
  }, [filteredLogs, selectedLogKey]);

  const logSources = useMemo(
    () => Array.from(new Set(flattenedLogs.map((entry) => entry.source))).sort(),
    [flattenedLogs]
  );

  const logTimeline = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const bucketStart = new Date();
      bucketStart.setMinutes(0, 0, 0);
      bucketStart.setHours(bucketStart.getHours() - (11 - index));
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(bucketEnd.getHours() + 1);
      const items = filteredLogs.filter((entry) => {
        const time = new Date(entry.timestamp).getTime();
        return time >= bucketStart.getTime() && time < bucketEnd.getTime();
      });
      return {
        label: bucketStart.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
        total: items.length,
        errorCount: items.filter((entry) => entry.level === "error").length,
        warningCount: items.filter((entry) => entry.level === "warning").length
      };
    });

    const maxTotal = Math.max(...buckets.map((bucket) => bucket.total), 1);
    return { buckets, maxTotal };
  }, [filteredLogs]);

  async function handleSaveFlags(nextToggles: AdminDashboardSnapshot["toggles"]) {
    setIsSavingFlags(true);

    try {
      await persistPublicFeatureFlags({
        toggles: nextToggles.map((toggle) => ({
          id: toggle.id,
          enabled: toggle.enabled,
          label: (draftToggleLabels[toggle.id] ?? toggle.label).trim() || toggle.defaultLabel
        })),
        updatedBy: sessionUserId
      });
      await onFeatureOverridesChange();
      await loadSnapshot();
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No pude guardar los feature flags.");
    } finally {
      setIsSavingFlags(false);
    }
  }

  async function handleToggleFeature(featureId: ProductFeature, enabled: boolean) {
    const nextToggles = snapshot.toggles.map((toggle) =>
      toggle.id === featureId ? { ...toggle, enabled } : toggle
    );

    setSnapshot((current) => ({
      ...current,
      toggles: nextToggles,
      lastUpdatedAt: new Date().toISOString()
    }));

    await handleSaveFlags(nextToggles);
  }

  function handleRenameDraft(featureId: ProductFeature, value: string) {
    setDraftToggleLabels((current) => ({
      ...current,
      [featureId]: value
    }));
  }

  async function handleRenameSubmit(featureId: ProductFeature) {
    const normalizedLabel = (draftToggleLabels[featureId] ?? "").trim();
    const nextToggles = snapshot.toggles.map((toggle) =>
      toggle.id === featureId
        ? { ...toggle, label: normalizedLabel || toggle.defaultLabel }
        : toggle
    );

    setSnapshot((current) => ({
      ...current,
      toggles: nextToggles,
      lastUpdatedAt: new Date().toISOString()
    }));

    await handleSaveFlags(nextToggles);
  }

  async function handleAddAdmin() {
    if (!selectedAdminUserId) {
      return;
    }

    setIsSavingAdmins(true);
    try {
      await addAdminAccessMember({
        userId: selectedAdminUserId,
        role: selectedAdminRole,
        addedBy: sessionUserId
      });
      setSelectedAdminUserId("");
      setSelectedAdminRole("operator");
      await loadSnapshot();
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No pude guardar el acceso admin.");
    } finally {
      setIsSavingAdmins(false);
    }
  }

  async function handleRemoveAdmin(userId: string) {
    setIsSavingAdmins(true);
    try {
      await removeAdminAccessMember({
        userId,
        removedBy: sessionUserId
      });
      await loadSnapshot();
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No pude quitar el acceso admin.");
    } finally {
      setIsSavingAdmins(false);
    }
  }

  function renderOverview() {
    return (
      <div className="admin-section-stack">
        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Alertas</p>
            <h3>Prioridades del panel</h3>
          </div>

          <div className="admin-stack">
            {snapshot.alerts.length ? (
              snapshot.alerts.map((alert) => (
                <article key={alert.id} className={`admin-alert-card is-${alert.level}`}>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </article>
              ))
            ) : (
              <div className="info-box admin-note">
                <strong>Todo en orden</strong>
                <p>No encontre alertas activas con la informacion actual.</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Metricas</p>
            <h3>Resumen rapido</h3>
          </div>

          <div className="admin-metrics-grid">
            {snapshot.metrics.map((metric) => (
              <article key={metric.label} className="admin-metric-card">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <p className={`admin-metric-card__delta is-${metric.tone}`}>{metric.delta}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Uso por feature</p>
            <h3>Adopcion de modulos</h3>
          </div>

          <div className="admin-usage-grid">
            {snapshot.featureUsage.map((item) => (
              <article key={item.id} className="admin-usage-card">
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
                <div className="admin-usage-card__stats">
                  <span>
                    <strong>{item.averageTimeLabel}</strong>
                    <small>promedio por sesion</small>
                  </span>
                  <span>
                    <strong>{item.totalTimeLabel}</strong>
                    <small>tiempo acumulado</small>
                  </span>
                </div>
                <div className="token-row">
                  <span>{item.events} eventos</span>
                  <span>{item.users} usuarios</span>
                  <span className={`admin-trend-badge is-${item.trendDirection}`}>{item.trendLabel}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="admin-ranking-card">
            <div className="section-header">
              <p className="section-eyebrow">Ranking</p>
              <h3>De mayor a menor uso por tiempo</h3>
            </div>

            <div className="admin-ranking-list">
              {usageRanking.map((item, index) => (
                <article key={`${item.id}-ranking`} className="admin-ranking-item">
                  <div className="admin-ranking-item__position">{index + 1}</div>
                  <div className="admin-ranking-item__copy">
                    <strong>{item.label}</strong>
                    <p>
                      {item.totalTimeSeconds > 0
                        ? `${item.totalTimeLabel} acumulado · ${item.averageTimeLabel} promedio`
                        : "Todavia sin tiempo suficiente medido"}
                    </p>
                  </div>
                  <div className="admin-ranking-item__meta">
                    <span>{item.users} usuarios</span>
                    <span>{item.events} eventos</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderActivity() {
    return (
      <div className="admin-section-stack">
        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Actividad</p>
            <h3>Uso por dia</h3>
          </div>

          <div className="admin-activity-chart" aria-label="Actividad diaria">
            {snapshot.activity.map((point) => (
              <article key={point.date} className="admin-activity-bar">
                <div
                  className="admin-activity-bar__fill"
                  style={{ height: `${Math.max(14, point.events === 0 ? 14 : point.events * 9)}px` }}
                />
                <strong>{point.events}</strong>
                <span>{point.label}</span>
                <p>{point.users} usuarios</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Altas</p>
            <h3>Nuevos registros</h3>
          </div>

          <div className="admin-activity-chart" aria-label="Altas por dia">
            {snapshot.signupActivity.map((point) => (
              <article key={point.date} className="admin-activity-bar admin-activity-bar--signups">
                <div
                  className="admin-activity-bar__fill"
                  style={{ height: `${Math.max(14, point.events === 0 ? 14 : point.events * 12)}px` }}
                />
                <strong>{point.events}</strong>
                <span>{point.label}</span>
                <p>{point.events === 1 ? "1 alta" : `${point.events} altas`}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Retencion</p>
            <h3>Vuelven o no vuelven</h3>
          </div>

          <div className="admin-usage-grid">
            {snapshot.retention.map((item) => (
              <article key={item.id} className="admin-usage-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Embudo</p>
            <h3>Conversion del producto</h3>
          </div>

          <div className="admin-funnel">
            {snapshot.funnel.map((step) => (
              <article key={step.id} className="admin-funnel-step">
                <span>{step.label}</span>
                <strong>{step.users}</strong>
                <p>{step.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderFlags() {
    return (
      <div className="admin-section-stack">
        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Feature flags</p>
            <h3>Encendido rapido</h3>
          </div>

          <div className="admin-stack">
            {snapshot.toggles.map((toggle) => (
              <article key={toggle.id} className="admin-toggle-card">
                <div className="admin-toggle-card__content">
                  <div className="admin-toggle-card__topline">
                    <strong>{draftToggleLabels[toggle.id] ?? toggle.label}</strong>
                    <span>{toggle.audience}</span>
                  </div>
                  <div className="admin-toggle-card__editor">
                    <label className="admin-input-stack">
                      <span>Nombre visible</span>
                      <input
                        type="text"
                        value={draftToggleLabels[toggle.id] ?? toggle.label}
                        onChange={(event) => handleRenameDraft(toggle.id, event.target.value)}
                        onBlur={() => void handleRenameSubmit(toggle.id)}
                        placeholder={toggle.defaultLabel}
                      />
                    </label>
                  </div>
                  <p>{toggle.description}</p>
                </div>

                <div className="admin-toggle-card__actions">
                  <button
                    type="button"
                    className="ghost-button admin-inline-button"
                    onClick={() => void handleRenameSubmit(toggle.id)}
                    disabled={isSavingFlags || !hasDatabaseAdminAccess}
                  >
                    Guardar nombre
                  </button>

                  <label className={`admin-switch ${toggle.enabled ? "is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={toggle.enabled}
                      disabled={!hasDatabaseAdminAccess}
                      onChange={(event) => void handleToggleFeature(toggle.id, event.target.checked)}
                    />
                    <span className="admin-switch__track" aria-hidden="true">
                      <span className="admin-switch__thumb" />
                    </span>
                  </label>
                </div>
              </article>
            ))}
          </div>

          <div className="info-box admin-note">
            <strong>Alcance actual</strong>
            <p>Los switches y nombres visibles se guardan en `admin_feature_flags` y afectan la configuracion publica de la app.</p>
          </div>
          {!hasDatabaseAdminAccess ? (
            <div className="app-alert">
              Tu cuenta puede ver el panel, pero para editar flags tiene que estar dada de alta en `admin_access`.
            </div>
          ) : null}
          <div className="token-row">
            <span className={`admin-readonly-badge ${hasDatabaseAdminAccess ? "is-enabled" : "is-disabled"}`}>
              {hasDatabaseAdminAccess ? "Edicion habilitada" : "Solo lectura"}
            </span>
          </div>
          {isSavingFlags ? <div className="status-pill">Guardando flags...</div> : null}
        </section>
      </div>
    );
  }

  function renderAdmins() {
    return (
      <div className="admin-section-stack">
        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Acceso</p>
            <h3>Dar acceso al panel</h3>
          </div>

          <div className="admin-admins-form">
            <label className="admin-input-stack">
              <span>Buscar perfil</span>
              <input
                type="text"
                value={adminQuery}
                onChange={(event) => setAdminQuery(event.target.value)}
                placeholder="Nombre o username..."
              />
            </label>

            <label className="admin-input-stack">
              <span>Usuario</span>
              <select value={selectedAdminUserId} onChange={(event) => setSelectedAdminUserId(event.target.value)}>
                <option value="">Elegi un perfil</option>
                {availableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name} (@{profile.username})
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-input-stack">
              <span>Rol</span>
              <select value={selectedAdminRole} onChange={(event) => setSelectedAdminRole(event.target.value as "operator" | "admin")}>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <button
              type="button"
              className="primary-button"
              onClick={() => void handleAddAdmin()}
              disabled={!selectedAdminUserId || isSavingAdmins || !hasDatabaseAdminAccess}
            >
              Agregar acceso
            </button>
          </div>
          {!hasDatabaseAdminAccess ? (
            <div className="app-alert">
              Para administrar accesos desde la UI, primero tu usuario tiene que existir en `admin_access`.
            </div>
          ) : null}
          <div className="token-row">
            <span className={`admin-readonly-badge ${hasDatabaseAdminAccess ? "is-enabled" : "is-disabled"}`}>
              {hasDatabaseAdminAccess ? "Gestion habilitada" : "Solo lectura"}
            </span>
          </div>
        </section>

        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Equipo</p>
            <h3>Usuarios con acceso</h3>
          </div>

          <div className="admin-stack">
            {snapshot.adminMembers.map((member) => (
              <article key={member.userId} className="admin-member-card">
                <div>
                  <strong>{member.displayName}</strong>
                  <p>@{member.username}</p>
                  <p>Rol: {member.role}</p>
                  <p>Alta: {formatAdminTimestamp(member.createdAt)}</p>
                </div>
                <button
                  type="button"
                  className="ghost-button admin-inline-button"
                  onClick={() => void handleRemoveAdmin(member.userId)}
                  disabled={isSavingAdmins || member.userId === sessionUserId || !hasDatabaseAdminAccess}
                >
                  Quitar acceso
                </button>
              </article>
            ))}
          </div>
          {isSavingAdmins ? <div className="status-pill">Actualizando accesos...</div> : null}
        </section>
      </div>
    );
  }

  function renderHealth() {
    return (
      <div className="admin-section-stack">
        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Estado operativo</p>
            <h3>Servicios y modulos</h3>
          </div>

          <div className="admin-stack">
            {snapshot.modules.map((module) => (
              <article key={module.label} className="admin-status-card">
                <div>
                  <strong>{module.label}</strong>
                  <p>{module.detail}</p>
                </div>
                <span className={`status-pill admin-status-pill is-${module.status}`}>
                  {module.status === "online" ? "Online" : module.status === "degraded" ? "Parcial" : "Offline"}
                </span>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderLogs() {
    return (
      <div className="admin-section-stack">
        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Stream</p>
            <h3>Logs recientes</h3>
          </div>

          <div className="admin-log-console">
            <div className="admin-log-timeline" aria-label="Actividad de logs por hora">
              {logTimeline.buckets.map((bucket) => (
                <article key={bucket.label} className="admin-log-timeline__bucket">
                  <div className="admin-log-timeline__bar-stack">
                    <span
                      className="admin-log-timeline__bar"
                      style={{ height: `${Math.max(4, (bucket.total / logTimeline.maxTotal) * 44)}px` }}
                    />
                    {bucket.warningCount > 0 ? (
                      <span className="admin-log-timeline__marker is-warning" />
                    ) : null}
                    {bucket.errorCount > 0 ? (
                      <span className="admin-log-timeline__marker is-error" />
                    ) : null}
                  </div>
                  <span>{bucket.label}</span>
                </article>
              ))}
            </div>

            <div className="admin-log-toolbar">
              <label className="admin-log-search">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
                <input
                  type="text"
                  value={logQuery}
                  onChange={(event) => setLogQuery(event.target.value)}
                  placeholder="Filtrar por tipo, nivel, fuente o mensaje..."
                />
              </label>

              <div className="admin-log-filters">
                <select value={logKindFilter} onChange={(event) => setLogKindFilter(event.target.value as "all" | "audit" | "system")}>
                  <option value="all">Todo tipo</option>
                  <option value="audit">Audit</option>
                  <option value="system">System</option>
                </select>
                <select value={logLevelFilter} onChange={(event) => setLogLevelFilter(event.target.value as "all" | "info" | "warning" | "error")}>
                  <option value="all">Todo nivel</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
                <select value={logSourceFilter} onChange={(event) => setLogSourceFilter(event.target.value)}>
                  <option value="all">Toda fuente</option>
                  {logSources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </div>

              <div className="token-row">
                <span>{filteredLogs.length} eventos</span>
                <span>{snapshot.flagAudit.length} de auditoria</span>
              </div>
            </div>

            <div className="admin-log-table">
              <div className="admin-log-table__head">
                <span>Fecha</span>
                <span>Nivel</span>
                <span>Fuente</span>
                <span>Evento</span>
              </div>

              <div className="admin-log-table__body">
                {filteredLogs.length ? (
                  filteredLogs.map((entry) => (
                    <button
                      key={entry.key}
                      type="button"
                      className={`admin-log-row ${selectedLog?.key === entry.key ? "is-active" : ""} is-${entry.level}`}
                      onClick={() => setSelectedLogKey(entry.key)}
                    >
                      <span>{formatAdminTimestamp(entry.timestamp)}</span>
                      <span className={`admin-log-badge is-${entry.level}`}>{entry.level}</span>
                      <span className="admin-log-row__source">{entry.source}</span>
                      <span className="admin-log-row__event">
                        <strong>{entry.title}</strong>
                        <small>{entry.detail}</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="info-box admin-note">
                    <strong>Sin coincidencias</strong>
                    <p>No encontre logs para ese filtro.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="panel admin-section">
          <div className="section-header">
            <p className="section-eyebrow">Detalle</p>
            <h3>Evento seleccionado</h3>
          </div>

          {selectedLog ? (
            <article className={`admin-log-detail is-${selectedLog.level}`}>
              <div className="admin-log-detail__header">
                <div>
                  <strong>{selectedLog.title}</strong>
                  <p>{selectedLog.detail}</p>
                </div>
                <span>{formatAdminTimestamp(selectedLog.timestamp)}</span>
              </div>

              <div className="token-row">
                <span>{selectedLog.kind === "audit" ? "AUDIT" : "SYSTEM"}</span>
                <span>{selectedLog.level.toUpperCase()}</span>
                <span>{selectedLog.source}</span>
                {selectedLog.actorName ? <span>{selectedLog.actorName}</span> : null}
              </div>
            </article>
          ) : (
            <div className="info-box admin-note">
              <strong>Sin evento seleccionado</strong>
              <p>Elegí una fila del stream para ver el detalle completo.</p>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderActiveSection() {
    switch (activeSection) {
      case "activity":
        return renderActivity();
      case "flags":
        return renderFlags();
      case "admins":
        return renderAdmins();
      case "health":
        return renderHealth();
      case "logs":
        return renderLogs();
      case "overview":
      default:
        return renderOverview();
    }
  }

  return (
    <section className="admin-shell">
      {error ? <div className="app-alert">{error}</div> : null}
      {isLoading ? <div className="app-alert">Cargando metricas y estado operativo...</div> : null}

      <div className="admin-layout">
        <aside className="panel admin-sidebar">
          <div className="admin-sidebar__header">
            <p className="section-eyebrow">Navegacion</p>
            <h3>Secciones</h3>
          </div>

          <nav className="admin-nav">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`admin-nav__button ${activeSection === section.id ? "is-active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="admin-nav__icon">
                  <AdminNavIcon id={section.id} />
                </span>
                <span className="admin-nav__copy">
                  <strong>{section.label}</strong>
                </span>
              </button>
            ))}
          </nav>

          <div className="info-box admin-sidebar__note">
            <strong>Features activas</strong>
            <p>{enabledPublicFeatures.length} modulos publicos habilitados en este momento.</p>
          </div>

          <div className="info-box admin-sidebar__note">
            <strong>{operatorName}</strong>
            <p>{operatorEmail ?? "Acceso interno activo"}</p>
            <p>{snapshot.mode === "live" ? "Modo live" : "Modo preview"}</p>
            <p>Actualizado: {formatAdminTimestamp(snapshot.lastUpdatedAt)}</p>
          </div>
        </aside>

        <main className="admin-main">
          <section className="panel admin-section admin-section--header">
            <p className="section-eyebrow">{activeSectionMeta.eyebrow}</p>
            <h3>{activeSectionMeta.title}</h3>
            <p className="section-description">{activeSectionMeta.description}</p>
          </section>

          {renderActiveSection()}
        </main>
      </div>
    </section>
  );
}
